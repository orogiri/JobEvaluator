import { Router } from 'express';
import db from '../db.js';
import { buildEvaluationPrompt } from '../llm/prompts.js';
import { evaluateWithAnthropic } from '../llm/anthropic.js';
import { evaluateWithOpenAI } from '../llm/openai.js';
import { evaluateWithQwen } from '../llm/qwen.js';
import { evaluateWithDeepSeek } from '../llm/deepseek.js';
import { AVAILABLE_MODELS, getPricing, charsToTokens, estimateCost } from '../llm/pricing.js';

const router = Router();

router.get('/models', (_req, res) => {
  const result = {};
  for (const [provider, models] of Object.entries(AVAILABLE_MODELS)) {
    result[provider] = models.map((m) => ({
      ...m,
      pricing: getPricing(provider, m.id),
    }));
  }
  res.json(result);
});

router.post('/estimate', (req, res) => {
  const { jd_text, resume_id, provider, model, include_suggestions, include_field_db } = req.body;
  if (!jd_text || !resume_id || !provider || !model) {
    return res.status(400).json({ error: 'jd_text, resume_id, provider, and model are required' });
  }

  const resume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(resume_id);
  if (!resume) return res.status(404).json({ error: 'Resume not found' });

  const fields = db.prepare('SELECT * FROM fields WHERE category_id = ?').all(resume.category_id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(resume.category_id);
  const includeSuggestions = !!include_suggestions;
  const isFpA = /fp[&\s]?a\b/i.test(category.name);
  const useFieldDb = include_field_db !== undefined ? !!include_field_db : !isFpA;
  const prompt = buildEvaluationPrompt(jd_text, resume.text, fields, category.name, includeSuggestions, useFieldDb);

  const inputTokens = charsToTokens(prompt.length);
  const outputTokens = includeSuggestions ? 2300 : 1500;
  const cost = estimateCost(provider, model, inputTokens, outputTokens);

  res.json({ inputTokens, outputTokens, estimatedCost: cost });
});

router.post('/', async (req, res) => {
  const { jd_text, resume_id, provider, model, include_field_db } = req.body;
  if (!jd_text?.trim() || !resume_id || !provider || !model) {
    return res.status(400).json({ error: 'jd_text, resume_id, provider, and model are required' });
  }

  const apiKey = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(`${provider}_key`)?.value;
  if (!apiKey) {
    return res.status(400).json({ error: `No ${provider} API key configured in Settings` });
  }

  const resume = db
    .prepare(
      `SELECT r.*, c.name AS category_name
       FROM resumes r JOIN categories c ON r.category_id = c.id
       WHERE r.id = ?`
    )
    .get(resume_id);
  if (!resume) return res.status(404).json({ error: 'Resume not found' });

  const fields = db.prepare('SELECT * FROM fields WHERE category_id = ?').all(resume.category_id);
  const includeSuggestions = !!req.body.include_suggestions;
  const isFpA = /fp[&\s]?a\b/i.test(resume.category_name);
  const useFieldDb = include_field_db !== undefined ? !!include_field_db : !isFpA;
  const prompt = buildEvaluationPrompt(jd_text, resume.text, fields, resume.category_name, includeSuggestions, useFieldDb);

  let result;
  try {
    if (provider === 'anthropic') {
      result = await evaluateWithAnthropic(prompt, apiKey, model);
    } else if (provider === 'qwen') {
      result = await evaluateWithQwen(prompt, apiKey, model);
    } else if (provider === 'deepseek') {
      result = await evaluateWithDeepSeek(prompt, apiKey, model);
    } else {
      result = await evaluateWithOpenAI(prompt, apiKey, model);
    }
  } catch (err) {
    console.error('LLM error:', err);
    return res.status(500).json({ error: 'LLM evaluation failed', details: err.message });
  }

  // Validate that the model returned usable scores before saving anything
  const REQUIRED_SCORES = ['duties', 'requirements', 'years_experience', 'skills', 'industry'];
  const missingScores = REQUIRED_SCORES.filter(k => result?.scores?.[k]?.score == null);
  if (missingScores.length > 0) {
    console.error('LLM returned incomplete scores. Missing:', missingScores);
    console.error('Top-level keys returned:', Object.keys(result ?? {}));
    console.error('Raw scores object:', JSON.stringify(result?.scores ?? null));
    return res.status(422).json({
      error: 'The model returned an incomplete evaluation — scores are missing for: ' + missingScores.join(', ') + '. This can happen when the job description contains non-standard formatting (e.g. copied directly from LinkedIn). Try pasting only the actual job description text.',
    });
  }

  // Persist new fields (only when the field database was used for this evaluation)
  if (useFieldDb) {
    const insertField = db.prepare(
      'INSERT OR IGNORE INTO fields (category_id, name, description) VALUES (?, ?, ?)'
    );
    for (const f of result.new_fields || []) {
      insertField.run(resume.category_id, f.name, f.description || '');
    }
  }

  // Persist job description
  const jobResult = db
    .prepare('INSERT INTO job_descriptions (text) VALUES (?)')
    .run(jd_text.trim());
  const job_id = jobResult.lastInsertRowid;

  const m = result.metadata || {};
  const s = result.scores || {};

  const suggestions = result.resume_suggestions ?? null;

  const evalResult = db
    .prepare(
      `INSERT INTO evaluations (
        job_id, resume_id, category_id,
        company, title, salary_min, salary_max, salary_zones, years_experience,
        company_industry, reports_to, remote, job_level, posted_date, meets_requirements, meets_requirements_notes, meets_preferences, meets_preferences_notes,
        score_duties, score_requirements, score_years_experience, score_skills, score_preferences, score_industry,
        score_details, field_values, llm_provider, llm_model, resume_suggestions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      job_id,
      resume_id,
      resume.category_id,
      m.company || '',
      m.title || '',
      m.salary_min ?? null,
      m.salary_max ?? null,
      Array.isArray(m.salary_zones) && m.salary_zones.length ? JSON.stringify(m.salary_zones) : null,
      m.years_experience ?? null,
      m.company_industry ?? null,
      m.reports_to ?? null,
      m.remote ?? null,
      m.job_level ?? null,
      m.posted_date ?? null,
      m.meets_requirements ?? null,
      m.meets_requirements_notes ?? null,
      m.meets_preferences ?? null,
      m.meets_preferences_notes ?? null,
      s.duties?.score ?? null,
      s.requirements?.score ?? null,
      s.years_experience?.score ?? null,
      s.skills?.score ?? null,
      s.preferences?.score ?? null,
      s.industry?.score ?? null,
      JSON.stringify(s),
      JSON.stringify(result.field_values || {}),
      provider,
      model,
      suggestions ? JSON.stringify(suggestions) : null
    );

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_provider', ?)").run(provider);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_model', ?)").run(model);

  res.json({
    evaluation_id: evalResult.lastInsertRowid,
    job_id,
    metadata: m,
    scores: s,
    field_values: result.field_values || {},
    new_fields: result.new_fields || [],
  });
});

export default router;
