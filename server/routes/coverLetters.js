import { Router } from 'express';
import db from '../db.js';
import { buildCoverLetterPrompt, buildEvaluationSummary } from '../llm/prompts.js';
import { generateText } from '../llm/text.js';
import { charsToTokens, estimateCost } from '../llm/pricing.js';

const router = Router();

const COVER_LETTER_OUTPUT_TOKENS = 900;
// Thinking mode adds reasoning tokens on top of the final letter — bump the estimate accordingly.
const COVER_LETTER_OUTPUT_TOKENS_THINKING = 2500;
// Generous ceiling — not a cost driver (billed on actual usage), but reasoning
// models (e.g. DeepSeek Pro) can spend 1000+ tokens "thinking" before writing the
// letter, and a tight cap risks truncating or fully swallowing the final output.
const COVER_LETTER_MAX_TOKENS = 8192;

// Most recent evaluation for this exact job+resume pair, if one exists — used to give
// the cover letter prompt (and thus the user's template/instructions) access to the
// scores, rationale, and gaps already identified for this candidate against this JD.
function fetchLatestEvaluation(jobId, resumeId) {
  const row = db
    .prepare('SELECT * FROM evaluations WHERE job_id = ? AND resume_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(jobId, resumeId);
  if (!row) return null;
  return {
    ...row,
    score_details: JSON.parse(row.score_details || '{}'),
    field_values: JSON.parse(row.field_values || '{}'),
  };
}

// ── Templates ────────────────────────────────────────────────────────────────

router.get('/templates', (_req, res) => {
  res.json(db.prepare('SELECT * FROM cover_letter_templates ORDER BY name').all());
});

router.post('/templates', (req, res) => {
  const { name, body, instructions } = req.body;
  if (!name?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'name and body are required' });
  }
  const result = db
    .prepare('INSERT INTO cover_letter_templates (name, body, instructions) VALUES (?, ?, ?)')
    .run(name.trim(), body.trim(), (instructions || '').trim());
  res.json({ id: result.lastInsertRowid, name: name.trim(), body: body.trim(), instructions: (instructions || '').trim() });
});

router.put('/templates/:id', (req, res) => {
  const { name, body, instructions } = req.body;
  if (!name?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'name and body are required' });
  }
  db.prepare('UPDATE cover_letter_templates SET name = ?, body = ?, instructions = ? WHERE id = ?').run(
    name.trim(), body.trim(), (instructions || '').trim(), req.params.id
  );
  res.json({ ok: true });
});

router.delete('/templates/:id', (req, res) => {
  db.prepare('DELETE FROM cover_letter_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Generated cover letters ──────────────────────────────────────────────────

function fetchCoverLetter(id) {
  return db.prepare(
    `SELECT cl.*,
            jd.company AS job_company, jd.title AS job_title,
            r.name AS resume_name, t.name AS template_name
     FROM cover_letters cl
     JOIN (SELECT job_id, MAX(company) AS company, MAX(title) AS title FROM evaluations GROUP BY job_id) jd ON jd.job_id = cl.job_id
     JOIN resumes r ON r.id = cl.resume_id
     LEFT JOIN cover_letter_templates t ON t.id = cl.template_id
     WHERE cl.id = ?`
  ).get(id);
}

router.get('/', (_req, res) => {
  const rows = db.prepare(
    `SELECT cl.*,
            jd.company AS job_company, jd.title AS job_title,
            r.name AS resume_name, t.name AS template_name
     FROM cover_letters cl
     JOIN (SELECT job_id, MAX(company) AS company, MAX(title) AS title FROM evaluations GROUP BY job_id) jd ON jd.job_id = cl.job_id
     JOIN resumes r ON r.id = cl.resume_id
     LEFT JOIN cover_letter_templates t ON t.id = cl.template_id
     ORDER BY cl.created_at DESC`
  ).all();
  res.json(rows);
});

router.post('/estimate', (req, res) => {
  const { job_id, resume_id, template_id, provider, model, thinking } = req.body;
  if (!job_id || !resume_id || !template_id || !provider || !model) {
    return res.status(400).json({ error: 'job_id, resume_id, template_id, provider, and model are required' });
  }

  const job = db.prepare(
    `SELECT jdesc.text AS jd_text, e.company, e.title
     FROM job_descriptions jdesc
     JOIN evaluations e ON e.job_id = jdesc.id
     WHERE jdesc.id = ?
     LIMIT 1`
  ).get(job_id);
  const resume = db.prepare('SELECT text FROM resumes WHERE id = ?').get(resume_id);
  const template = db.prepare('SELECT body, instructions FROM cover_letter_templates WHERE id = ?').get(template_id);
  if (!job || !resume || !template) return res.status(404).json({ error: 'Job, resume, or template not found' });

  const evaluationSummary = buildEvaluationSummary(fetchLatestEvaluation(job_id, resume_id));
  const prompt = buildCoverLetterPrompt(job.jd_text, resume.text, template.body, job.company, job.title, template.instructions, evaluationSummary);
  const inputTokens = charsToTokens(prompt.length);
  const outputTokens = thinking ? COVER_LETTER_OUTPUT_TOKENS_THINKING : COVER_LETTER_OUTPUT_TOKENS;
  const cost = estimateCost(provider, model, inputTokens, outputTokens);
  res.json({ inputTokens, outputTokens, estimatedCost: cost });
});

router.post('/generate', async (req, res) => {
  const { job_id, resume_id, template_id, provider, model, thinking } = req.body;
  if (!job_id || !resume_id || !template_id || !provider || !model) {
    return res.status(400).json({ error: 'job_id, resume_id, template_id, provider, and model are required' });
  }

  const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${provider}_key`)?.value;
  if (!apiKey) return res.status(400).json({ error: `No ${provider} API key configured in Settings` });

  const job = db.prepare(
    `SELECT jdesc.text AS jd_text, e.company, e.title
     FROM job_descriptions jdesc
     JOIN evaluations e ON e.job_id = jdesc.id
     WHERE jdesc.id = ?
     LIMIT 1`
  ).get(job_id);
  const resume = db.prepare('SELECT text FROM resumes WHERE id = ?').get(resume_id);
  const template = db.prepare('SELECT body, instructions FROM cover_letter_templates WHERE id = ?').get(template_id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!resume) return res.status(404).json({ error: 'Resume not found' });
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const evaluationSummary = buildEvaluationSummary(fetchLatestEvaluation(job_id, resume_id));
  const prompt = buildCoverLetterPrompt(job.jd_text, resume.text, template.body, job.company, job.title, template.instructions, evaluationSummary);

  let content;
  try {
    content = await generateText(prompt, apiKey, provider, model, COVER_LETTER_MAX_TOKENS, !!thinking);
  } catch (err) {
    console.error('Cover letter generation error:', err);
    return res.status(500).json({ error: 'Cover letter generation failed', details: err.message });
  }

  const result = db
    .prepare(
      `INSERT INTO cover_letters (job_id, resume_id, template_id, provider, llm_model, content)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(job_id, resume_id, template_id, provider, model, content);

  res.json(fetchCoverLetter(result.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cover_letters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
