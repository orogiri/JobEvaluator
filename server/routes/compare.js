import { Router } from 'express';
import db from '../db.js';
import { buildScoringPrompt } from '../llm/prompts.js';
import { evaluateWithAnthropic } from '../llm/anthropic.js';
import { evaluateWithOpenAI } from '../llm/openai.js';
import { evaluateWithQwen } from '../llm/qwen.js';
import { evaluateWithDeepSeek } from '../llm/deepseek.js';

const router = Router();

function parseEval(r) {
  return {
    ...r,
    score_details: JSON.parse(r.score_details || '{}'),
    field_values:  JSON.parse(r.field_values  || '{}'),
  };
}

function fetchEval(id) {
  const row = db.prepare(
    `SELECT e.*, jd.text AS jd_text, r.name AS resume_name, c.name AS category_name
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id
     JOIN categories c        ON c.id  = e.category_id
     WHERE e.id = ?`
  ).get(id);
  return row ? parseEval(row) : null;
}

// POST /api/compare/score
// Returns an existing evaluation if one matches (job_id, resume_id, provider, model),
// otherwise runs the scoring-only prompt and saves a new evaluation row.
router.post('/score', async (req, res) => {
  const { job_id, resume_id, provider, model } = req.body;
  if (!job_id || !resume_id || !provider || !model) {
    return res.status(400).json({ error: 'job_id, resume_id, provider, and model are required' });
  }

  // Pull from archive if available
  const existing = db.prepare(
    `SELECT id FROM evaluations
     WHERE job_id = ? AND resume_id = ? AND llm_provider = ? AND llm_model = ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(job_id, resume_id, provider, model);

  if (existing) {
    return res.json(fetchEval(existing.id));
  }

  // Fetch JD and resume texts
  const jdRow = db.prepare('SELECT text FROM job_descriptions WHERE id = ?').get(job_id);
  if (!jdRow) return res.status(404).json({ error: 'Job not found' });

  const resume = db.prepare(
    `SELECT r.*, c.name AS category_name
     FROM resumes r JOIN categories c ON r.category_id = c.id
     WHERE r.id = ?`
  ).get(resume_id);
  if (!resume) return res.status(404).json({ error: 'Resume not found' });

  // Reuse metadata from any existing evaluation for this job (avoids re-extracting objective fields)
  const refMeta = db.prepare(
    `SELECT company, title, salary_min, salary_max, years_experience,
            company_industry, reports_to, remote, job_level,
            meets_requirements, meets_requirements_notes, meets_preferences, meets_preferences_notes
     FROM evaluations WHERE job_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(job_id);

  const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${provider}_key`)?.value;
  if (!apiKey) return res.status(400).json({ error: `No ${provider} API key configured in Settings` });

  const prompt = buildScoringPrompt(jdRow.text, resume.text);

  let scores;
  try {
    if (provider === 'anthropic')      scores = await evaluateWithAnthropic(prompt, apiKey, model);
    else if (provider === 'qwen')      scores = await evaluateWithQwen(prompt, apiKey, model);
    else if (provider === 'deepseek')  scores = await evaluateWithDeepSeek(prompt, apiKey, model);
    else                               scores = await evaluateWithOpenAI(prompt, apiKey, model);
  } catch (err) {
    console.error('Compare LLM error:', err);
    return res.status(500).json({ error: 'LLM evaluation failed', details: err.message });
  }

  const m = refMeta || {};
  const evalResult = db.prepare(
    `INSERT INTO evaluations (
       job_id, resume_id, category_id,
       company, title, salary_min, salary_max, years_experience,
       company_industry, reports_to, remote, job_level,
       meets_requirements, meets_requirements_notes, meets_preferences, meets_preferences_notes,
       score_duties, score_requirements, score_years_experience, score_skills, score_preferences, score_industry,
       score_details, field_values, llm_provider, llm_model
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    job_id,
    resume_id,
    resume.category_id,
    m.company || '',
    m.title   || '',
    m.salary_min               ?? null,
    m.salary_max               ?? null,
    m.years_experience         ?? null,
    m.company_industry         ?? null,
    m.reports_to               ?? null,
    m.remote                   ?? null,
    m.job_level                ?? null,
    m.meets_requirements       ?? null,
    m.meets_requirements_notes ?? null,
    m.meets_preferences        ?? null,
    m.meets_preferences_notes  ?? null,
    scores.duties?.score           ?? null,
    scores.requirements?.score     ?? null,
    scores.years_experience?.score ?? null,
    scores.skills?.score           ?? null,
    scores.preferences?.score      ?? null,
    scores.industry?.score         ?? null,
    JSON.stringify(scores),
    '{}',
    provider,
    model
  );

  res.json(fetchEval(evalResult.lastInsertRowid));
});

export default router;
