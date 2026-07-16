import { Router } from 'express';
import db from '../db.js';
import { buildContactSearchPrompt, levelOneUp } from '../llm/prompts.js';
import { mergedSerperSearch, extractMarkedJson, extractSummaryBeforeMarker, searchWithProvider } from '../llm/search.js';

const router = Router();

// Anthropic has a native web_search tool; every other provider can only reason over
// the Serper results (see searchWithProvider) — the no-Serper-results guard below
// applies uniformly to all of them.
const SUPPORTED_PROVIDERS = new Set(['anthropic', 'openai', 'deepseek', 'qwen']);

// A LinkedIn-specific query matters because that's exactly the source Claude's own
// web_search tool tends to miss (see buildContactSearchPrompt's comment on why).
async function googleSearchForContact({ mode, company, reportsTo, targetTitle, category }, serperKey) {
  const primaryTitle = mode === 'specific' ? reportsTo : targetTitle;
  // Company name is quoted to force exact-phrase matching — an unquoted short/common
  // name can pull in unrelated results (confirmed for the company-research queries
  // below; applied here too as cheap insurance against the same failure mode).
  const queries = primaryTitle
    ? [`"${primaryTitle}" "${company}"`, `"${primaryTitle}" "${company}" LinkedIn`]
    : [`"${company}" leadership team ${category || ''}`.trim()];
  return mergedSerperSearch(queries, serperKey);
}

function fetchContactSearch(id) {
  const row = db.prepare(
    `SELECT cs.*, e.job_id, e.resume_id, e.company, e.title,
            r.name AS resume_name
     FROM contact_searches cs
     JOIN evaluations e ON e.id = cs.evaluation_id
     JOIN resumes r     ON r.id = e.resume_id
     WHERE cs.id = ?`
  ).get(id);
  if (!row) return null;
  return { ...row, contacts: JSON.parse(row.contacts || '[]') };
}

router.get('/', (_req, res) => {
  const rows = db.prepare(
    `SELECT cs.*, e.job_id, e.resume_id, e.company, e.title,
            r.name AS resume_name
     FROM contact_searches cs
     JOIN evaluations e ON e.id = cs.evaluation_id
     JOIN resumes r     ON r.id = e.resume_id
     ORDER BY cs.created_at DESC`
  ).all();
  res.json(rows.map((r) => ({ ...r, contacts: JSON.parse(r.contacts || '[]') })));
});

router.post('/run', async (req, res) => {
  const { job_id, resume_id, model } = req.body;
  const provider = req.body.provider || 'anthropic';
  if (!job_id || !resume_id || !model) {
    return res.status(400).json({ error: 'job_id, resume_id, and model are required' });
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: `Unsupported provider for contact search: ${provider}` });
  }

  const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${provider}_key`)?.value;
  if (!apiKey) {
    return res.status(400).json({ error: `No ${provider} API key configured in Settings` });
  }

  const evalRow = db
    .prepare('SELECT * FROM evaluations WHERE job_id = ? AND resume_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(job_id, resume_id);
  if (!evalRow) return res.status(404).json({ error: 'No evaluation found for this job and resume' });

  const reportsTo = evalRow.reports_to?.trim();
  const mode = reportsTo ? 'specific' : 'peers';
  const targetTitle = mode === 'peers' ? levelOneUp(evalRow.job_level) : null;
  const category = db.prepare('SELECT name FROM categories WHERE id = ?').get(evalRow.category_id)?.name;

  const serperKey = db.prepare("SELECT value FROM settings WHERE key = 'serper_key'").get()?.value;
  const googleResults = await googleSearchForContact(
    { mode, company: evalRow.company, reportsTo, targetTitle, category },
    serperKey
  );

  // Without a search tool of its own AND no Google results to ground it, a non-Anthropic
  // provider has nothing current to work from — it can only guess from stale training
  // data. Refuse rather than risk a misleadingly "current" hallucination (see the
  // identical guard in companyResearch.js for the empirical case that motivated this).
  if (provider !== 'anthropic' && googleResults.length === 0) {
    return res.status(400).json({
      error: `${provider} has no search tool of its own, and no Google results were available (configure a Serper key in Settings, or switch to Anthropic). Skipping rather than risk stale or invented results from training data.`,
    });
  }

  const prompt = buildContactSearchPrompt({
    mode,
    company: evalRow.company,
    title: evalRow.title,
    reportsTo,
    targetTitle,
    category,
    googleResults,
    hasWebSearchTool: provider === 'anthropic',
  });

  let fullText;
  try {
    fullText = await searchWithProvider(prompt, apiKey, provider, model);
  } catch (err) {
    console.error('Contact search error:', err);
    return res.status(500).json({ error: 'Contact search failed', details: err.message });
  }

  const parsed = extractMarkedJson(fullText);
  const summary = extractSummaryBeforeMarker(fullText);
  const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];

  const result = db
    .prepare(
      `INSERT INTO contact_searches (evaluation_id, mode, query_title, summary, contacts, llm_model, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(evalRow.id, mode, mode === 'specific' ? reportsTo : (targetTitle || ''), summary, JSON.stringify(contacts), model, provider);

  res.json(fetchContactSearch(result.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contact_searches WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
