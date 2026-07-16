import { Router } from 'express';
import db from '../db.js';
import { buildMetadataPrompt, buildScoringPrompt } from '../llm/prompts.js';
import { evaluateWithAnthropic } from '../llm/anthropic.js';
import { evaluateWithOpenAI } from '../llm/openai.js';
import { evaluateWithQwen } from '../llm/qwen.js';
import { evaluateWithDeepSeek } from '../llm/deepseek.js';
import { charsToTokens, estimateCost } from '../llm/pricing.js';

const router = Router();

const METADATA_OUTPUT_TOKENS = 350;
const SCORING_OUTPUT_TOKENS  = 700;

function parseEval(r) {
  return {
    ...r,
    score_details: JSON.parse(r.score_details || '{}'),
    field_values: JSON.parse(r.field_values || '{}'),
    resume_suggestions: r.resume_suggestions ? JSON.parse(r.resume_suggestions) : null,
    salary_zones: r.salary_zones ? JSON.parse(r.salary_zones) : null,
  };
}

function fetchEval(id) {
  const row = db.prepare(
    `SELECT e.*,
            jd.text AS jd_text,
            jd.applied AS applied, jd.interview_1 AS interview_1,
            jd.interview_2 AS interview_2, jd.interview_3 AS interview_3,
            jd.offer_made AS offer_made, jd.cover_letter_sent AS cover_letter_sent,
            r.name AS resume_name, c.name AS category_name
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id
     JOIN categories c        ON c.id  = e.category_id
     WHERE e.id = ?`
  ).get(id);
  return row ? parseEval(row) : null;
}

router.get('/', (_req, res) => {
  const rows = db.prepare(
    `SELECT e.*,
            jd.text AS jd_text,
            jd.applied AS applied, jd.interview_1 AS interview_1,
            jd.interview_2 AS interview_2, jd.interview_3 AS interview_3,
            jd.offer_made AS offer_made, jd.cover_letter_sent AS cover_letter_sent,
            r.name AS resume_name, c.name AS category_name
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id
     JOIN categories c        ON c.id  = e.category_id
     ORDER BY e.created_at DESC`
  ).all();
  res.json(rows.map(parseEval));
});

// Must come before /:id routes to avoid being swallowed by the param matcher
router.post('/refresh-estimate', (req, res) => {
  const { provider, model } = req.body;
  if (!provider || !model) return res.status(400).json({ error: 'provider and model required' });

  const rows = db.prepare(
    `SELECT e.id, jd.text AS jd_text, r.text AS resume_text
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id`
  ).all();

  const jobs = rows.map((row) => {
    const prompt = buildMetadataPrompt(row.jd_text, row.resume_text);
    const inputTokens = charsToTokens(prompt.length);
    const cost = estimateCost(provider, model, inputTokens, METADATA_OUTPUT_TOKENS);
    return { id: row.id, estimatedCost: cost };
  });

  const totalCost = jobs.reduce((s, j) => s + j.estimatedCost, 0);
  res.json({ jobs, totalCost });
});

router.post('/score-estimate', (req, res) => {
  const { provider, model } = req.body;
  if (!provider || !model) return res.status(400).json({ error: 'provider and model required' });

  const rows = db.prepare(
    `SELECT e.id, jd.text AS jd_text, r.text AS resume_text
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id`
  ).all();

  const jobs = rows.map((row) => {
    const prompt = buildScoringPrompt(row.jd_text, row.resume_text);
    const inputTokens = charsToTokens(prompt.length);
    const cost = estimateCost(provider, model, inputTokens, SCORING_OUTPUT_TOKENS);
    return { id: row.id, estimatedCost: cost };
  });

  res.json({ jobs, totalCost: jobs.reduce((s, j) => s + j.estimatedCost, 0) });
});

router.get('/:id', (req, res) => {
  const row = fetchEval(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const eval_ = db.prepare('SELECT job_id FROM evaluations WHERE id = ?').get(req.params.id);
  if (!eval_) return res.status(404).json({ error: 'Not found' });

  // Delete all evaluations for this job, then the job itself
  db.prepare('DELETE FROM evaluations WHERE job_id = ?').run(eval_.job_id);
  db.prepare('DELETE FROM job_descriptions WHERE id = ?').run(eval_.job_id);

  res.json({ ok: true });
});

router.patch('/:id/tracking', (req, res) => {
  const { applied, interview_1, interview_2, interview_3, offer_made, cover_letter_sent } = req.body;
  const eval_ = db.prepare('SELECT job_id FROM evaluations WHERE id = ?').get(req.params.id);
  if (!eval_) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    `UPDATE job_descriptions
     SET applied = ?, interview_1 = ?, interview_2 = ?, interview_3 = ?, offer_made = ?, cover_letter_sent = ?
     WHERE id = ?`
  ).run(
    applied ? 1 : 0, interview_1 ? 1 : 0, interview_2 ? 1 : 0,
    interview_3 ? 1 : 0, offer_made ? 1 : 0, cover_letter_sent ? 1 : 0, eval_.job_id
  );
  res.json({ ok: true });
});

router.post('/:id/refresh-metadata', async (req, res) => {
  const { provider, model } = req.body;
  if (!provider || !model) return res.status(400).json({ error: 'provider and model required' });

  const row = db.prepare(
    `SELECT e.id, jd.text AS jd_text, r.text AS resume_text
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id
     WHERE e.id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${provider}_key`)?.value;
  if (!apiKey) return res.status(400).json({ error: `No ${provider} API key configured` });

  const prompt = buildMetadataPrompt(row.jd_text, row.resume_text);

  let result;
  try {
    result = provider === 'anthropic'
      ? await evaluateWithAnthropic(prompt, apiKey, model)
      : provider === 'qwen'
        ? await evaluateWithQwen(prompt, apiKey, model)
        : provider === 'deepseek'
          ? await evaluateWithDeepSeek(prompt, apiKey, model)
          : await evaluateWithOpenAI(prompt, apiKey, model);
  } catch (err) {
    return res.status(500).json({ error: 'LLM failed', details: err.message });
  }

  db.prepare(
    `UPDATE evaluations SET
       company_industry         = ?,
       reports_to               = ?,
       remote                   = ?,
       job_level                = ?,
       years_experience         = ?,
       salary_min               = ?,
       salary_max               = ?,
       salary_zones             = ?,
       posted_date              = ?,
       meets_requirements       = ?,
       meets_requirements_notes = ?,
       meets_preferences        = ?,
       meets_preferences_notes  = ?
     WHERE id = ?`
  ).run(
    result.company_industry ?? null,
    result.reports_to ?? null,
    result.remote ?? null,
    result.job_level ?? null,
    result.years_experience ?? null,
    result.salary_min ?? null,
    result.salary_max ?? null,
    Array.isArray(result.salary_zones) && result.salary_zones.length ? JSON.stringify(result.salary_zones) : null,
    result.posted_date ?? null,
    result.meets_requirements ?? null,
    result.meets_requirements_notes ?? null,
    result.meets_preferences ?? null,
    result.meets_preferences_notes ?? null,
    req.params.id
  );

  res.json(fetchEval(req.params.id));
});

router.post('/:id/recalculate-scores', async (req, res) => {
  const { provider, model } = req.body;
  if (!provider || !model) return res.status(400).json({ error: 'provider and model required' });

  const row = db.prepare(
    `SELECT e.id, jd.text AS jd_text, r.text AS resume_text
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id
     WHERE e.id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${provider}_key`)?.value;
  if (!apiKey) return res.status(400).json({ error: `No ${provider} API key configured` });

  const prompt = buildScoringPrompt(row.jd_text, row.resume_text);

  let scores;
  try {
    scores = provider === 'anthropic'
      ? await evaluateWithAnthropic(prompt, apiKey, model)
      : provider === 'qwen'
        ? await evaluateWithQwen(prompt, apiKey, model)
        : provider === 'deepseek'
          ? await evaluateWithDeepSeek(prompt, apiKey, model)
          : await evaluateWithOpenAI(prompt, apiKey, model);
  } catch (err) {
    return res.status(500).json({ error: 'LLM failed', details: err.message });
  }

  db.prepare(
    `UPDATE evaluations SET
       score_duties           = ?,
       score_requirements     = ?,
       score_years_experience = ?,
       score_skills           = ?,
       score_preferences      = ?,
       score_industry         = ?,
       score_details          = ?,
       llm_provider           = ?,
       llm_model              = ?
     WHERE id = ?`
  ).run(
    scores.duties?.score           ?? null,
    scores.requirements?.score     ?? null,
    scores.years_experience?.score ?? null,
    scores.skills?.score           ?? null,
    scores.preferences?.score      ?? null,
    scores.industry?.score         ?? null,
    JSON.stringify(scores),
    provider,
    model,
    req.params.id
  );

  res.json(fetchEval(req.params.id));
});

export default router;
