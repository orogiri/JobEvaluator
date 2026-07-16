import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
import db from '../db.js';
import { charsToTokens, estimateCost } from '../llm/pricing.js';

const router = Router();
const CHAT_OUTPUT_TOKENS = 900;

function getWeights() {
  const row = db.prepare("SELECT value FROM settings WHERE key='weights'").get();
  return row ? JSON.parse(row.value) : { duties: 20, requirements: 20, preferences: 10, years_experience: 15, skills: 15, industry: 20 };
}

function buildSystemPrompt() {
  const weights = getWeights();

  const rows = db.prepare(
    `SELECT e.*, jd.text AS jd_text, r.name AS resume_name, c.name AS category_name
     FROM evaluations e
     JOIN job_descriptions jd ON jd.id = e.job_id
     JOIN resumes r           ON r.id  = e.resume_id
     JOIN categories c        ON c.id  = e.category_id
     ORDER BY e.created_at DESC`
  ).all().map(r => ({
    ...r,
    score_details: JSON.parse(r.score_details || '{}'),
    field_values:  JSON.parse(r.field_values  || '{}'),
  }));

  if (rows.length === 0) {
    return 'You are an AI assistant helping a job seeker. They have no evaluated jobs yet — encourage them to use the Evaluate tab first.';
  }

  const weightsLine = `Score weights: Duties ${weights.duties}%, Requirements ${weights.requirements}%, Preferences ${weights.preferences}%, Years of Experience ${weights.years_experience}%, Skills ${weights.skills}%, Industry ${weights.industry}%`;

  const evalTexts = rows.map(e => {
    const s = e.score_details;
    const overall = (
      ((e.score_duties          ?? 0) * weights.duties +
       (e.score_requirements    ?? 0) * weights.requirements +
       (e.score_preferences     ?? 5) * (weights.preferences ?? 0) +
       (e.score_years_experience ?? 0) * weights.years_experience +
       (e.score_skills          ?? 0) * weights.skills +
       (e.score_industry        ?? 0) * weights.industry) / 100
    ).toFixed(1);

    const salary = e.salary_min != null
      ? `$${Math.round(e.salary_min / 1000)}k–$${Math.round((e.salary_max ?? e.salary_min) / 1000)}k`
      : 'not stated';

    const scoreLine = (label, score, detail) => {
      const gap = detail?.missing && detail.missing !== 'None identified'
        ? ` | Gap: ${detail.missing}` : '';
      return `  ${label}: ${score ?? '?'}/10 — ${detail?.rationale || '(no rationale)'}${gap}`;
    };

    const fieldLines = Object.entries(e.field_values)
      .filter(([, v]) => v.jd !== 'N/A')
      .map(([k, v]) => `  ${k}: "${v.jd}"${v.resume !== 'N/A' ? ` (resume: "${v.resume}")` : ''}`)
      .join('\n');

    return `### ${e.company || 'Unknown'} — ${e.title || 'Unknown Role'} (Overall: ${overall}/10)
Category: ${e.category_name} | Level: ${e.job_level || '—'} | Remote: ${e.remote || '—'} | Salary: ${salary} | Years req: ${e.years_experience ?? '—'}
Reports to: ${e.reports_to || '—'} | Industry: ${e.company_industry || '—'} | Evaluated with: ${e.llm_model || '—'}
Meets requirements: ${e.meets_requirements || '—'} (${e.meets_requirements_notes || ''})
Meets preferences: ${e.meets_preferences || '—'} (${e.meets_preferences_notes || ''})
Scores:
${scoreLine('Duties Match', e.score_duties, s.duties)}
${scoreLine('Requirements Match', e.score_requirements, s.requirements)}
${scoreLine('Preferences Match', e.score_preferences, s.preferences)}
${scoreLine('Years of Experience', e.score_years_experience, s.years_experience)}
${scoreLine('Skills/Keywords', e.score_skills, s.skills)}
${scoreLine('Industry/Business Model', e.score_industry, s.industry)}
${fieldLines ? `Job-required fields:\n${fieldLines}` : ''}`;
  });

  return `You are an AI assistant helping a job seeker analyze their job application pipeline. You have full access to their evaluation archive.

${weightsLine}

Each evaluation scored their resume against a job description on 6 dimensions (0–10). Higher = better fit.

## Archive (${rows.length} evaluation${rows.length !== 1 ? 's' : ''})

${evalTexts.join('\n\n---\n\n')}

## Instructions
Answer analytically. Identify patterns and specific gaps. Reference companies and roles by name. Be direct and actionable. Use bullet points or sections for clarity.`;
}

// ── Session CRUD ────────────────────────────────────────────────────────────

router.get('/sessions', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, title, provider, model, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC'
  ).all();
  res.json(rows);
});

router.post('/sessions', (req, res) => {
  const { title, messages, provider, model } = req.body;
  const result = db.prepare(
    'INSERT INTO chat_sessions (title, messages, provider, model) VALUES (?, ?, ?, ?)'
  ).run(title || 'New Chat', JSON.stringify(messages || []), provider || '', model || '');
  res.json({ id: result.lastInsertRowid });
});

router.get('/sessions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, messages: JSON.parse(row.messages) });
});

router.put('/sessions/:id', (req, res) => {
  const { title, messages, provider, model } = req.body;
  db.prepare(
    `UPDATE chat_sessions
     SET title = ?, messages = ?, provider = ?, model = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(title, JSON.stringify(messages), provider, model, req.params.id);
  res.json({ ok: true });
});

router.delete('/sessions/:id', (req, res) => {
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Cost estimate ────────────────────────────────────────────────────────────

// Estimate cost without calling the LLM
router.post('/estimate', (req, res) => {
  const { provider, model, historyLength = 0, messageLength = 0 } = req.body;
  if (!provider || !model) return res.status(400).json({ error: 'provider and model required' });

  const system = buildSystemPrompt();
  const inputTokens = charsToTokens(system.length + historyLength + messageLength);
  const cost = estimateCost(provider, model, inputTokens, CHAT_OUTPUT_TOKENS);
  res.json({ estimatedCost: cost });
});

router.post('/', async (req, res) => {
  const { messages, provider, model } = req.body;
  if (!messages?.length || !provider || !model) {
    return res.status(400).json({ error: 'messages, provider, and model required' });
  }

  const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${provider}_key`)?.value;
  if (!apiKey) return res.status(400).json({ error: `No ${provider} API key configured` });

  const systemContent = buildSystemPrompt();

  let responseText;
  try {
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model,
        max_tokens: 2048,
        system: systemContent,
        messages,
      });
      responseText = msg.content[0].text;
    } else if (provider === 'deepseek') {
      const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemContent }, ...messages],
        max_tokens: 2048,
        extra_body: { thinking_mode: 'disabled' },
      });
      responseText = completion.choices[0].message.content;
    } else if (provider === 'qwen') {
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      });
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemContent }, ...messages],
        max_tokens: 2048,
        extra_body: { enable_thinking: false },
      });
      responseText = completion.choices[0].message.content;
    } else {
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemContent }, ...messages],
        max_completion_tokens: 2048,
      });
      responseText = completion.choices[0].message.content;
    }
  } catch (err) {
    return res.status(500).json({ error: 'Chat failed', details: err.message });
  }

  const inputTokens = charsToTokens(systemContent.length + messages.map(m => m.content).join('').length);
  const outputTokens = charsToTokens(responseText.length);
  const actualCost = estimateCost(provider, model, inputTokens, outputTokens);

  res.json({ response: responseText, actualCost });
});

export default router;
