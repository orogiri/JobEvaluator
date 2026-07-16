import { Router } from 'express';
import db from '../db.js';
import { buildCompanyResearchPrompt } from '../llm/prompts.js';
import { mergedSerperSearch, extractMarkedJson, extractSummaryBeforeMarker, searchWithProvider } from '../llm/search.js';

const router = Router();

// Anthropic has a native web_search tool; every other provider can only reason over
// the Serper results (see searchWithProvider). See contactSearch.js for the same setup.
const SUPPORTED_PROVIDERS = new Set(['anthropic', 'openai', 'deepseek', 'qwen']);

// Biased toward the past year (tbs=qdr:y) since the entire point is recency — a
// funding round or launch from 3 years ago isn't a useful cover-letter hook.
// The company name is quoted to force exact-phrase matching — confirmed empirically
// that an unquoted short/common company name (e.g. "Blaize") returns unrelated noise
// (a fire investigation, a music festival, a TikTok clip) instead of the company itself.
async function googleSearchForCompany(company, serperKey) {
  const queries = [
    `"${company}" company news`,
    `"${company}" announcement OR funding OR launch OR partnership OR acquisition`,
  ];
  return mergedSerperSearch(queries, serperKey, { tbs: 'qdr:y' });
}

function fetchCompanyResearch(id) {
  const row = db.prepare(
    `SELECT cr.*, e.job_id, e.resume_id, e.company, e.title,
            r.name AS resume_name
     FROM company_research cr
     JOIN evaluations e ON e.id = cr.evaluation_id
     JOIN resumes r     ON r.id = e.resume_id
     WHERE cr.id = ?`
  ).get(id);
  if (!row) return null;
  return { ...row, findings: JSON.parse(row.findings || '[]') };
}

router.get('/', (_req, res) => {
  const rows = db.prepare(
    `SELECT cr.*, e.job_id, e.resume_id, e.company, e.title,
            r.name AS resume_name
     FROM company_research cr
     JOIN evaluations e ON e.id = cr.evaluation_id
     JOIN resumes r     ON r.id = e.resume_id
     ORDER BY cr.created_at DESC`
  ).all();
  res.json(rows.map((r) => ({ ...r, findings: JSON.parse(r.findings || '[]') })));
});

router.post('/run', async (req, res) => {
  const { job_id, resume_id, model } = req.body;
  const provider = req.body.provider || 'anthropic';
  if (!job_id || !resume_id || !model) {
    return res.status(400).json({ error: 'job_id, resume_id, and model are required' });
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: `Unsupported provider for company research: ${provider}` });
  }

  const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${provider}_key`)?.value;
  if (!apiKey) {
    return res.status(400).json({ error: `No ${provider} API key configured in Settings` });
  }

  const evalRow = db
    .prepare('SELECT * FROM evaluations WHERE job_id = ? AND resume_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(job_id, resume_id);
  if (!evalRow) return res.status(404).json({ error: 'No evaluation found for this job and resume' });

  const category = db.prepare('SELECT name FROM categories WHERE id = ?').get(evalRow.category_id)?.name;

  const serperKey = db.prepare("SELECT value FROM settings WHERE key = 'serper_key'").get()?.value;
  const googleResults = await googleSearchForCompany(evalRow.company, serperKey);

  // Without a search tool of its own AND no Google results to ground it, a non-Anthropic
  // provider has nothing current to work from — it can only guess from stale training
  // data (confirmed empirically: GPT-4.1 returned a ~3-year-old funding round dressed up
  // as a fresh finding). Refuse rather than risk a misleadingly "current" hallucination.
  if (provider !== 'anthropic' && googleResults.length === 0) {
    return res.status(400).json({
      error: `${provider} has no search tool of its own, and no Google results were available (configure a Serper key in Settings, or switch to Anthropic). Skipping rather than risk stale or invented results from training data.`,
    });
  }

  const instructions = db.prepare("SELECT value FROM settings WHERE key = 'company_research_instructions'").get()?.value;

  const prompt = buildCompanyResearchPrompt({
    company: evalRow.company,
    title: evalRow.title,
    category,
    googleResults,
    hasWebSearchTool: provider === 'anthropic',
    instructions,
  });

  let fullText;
  try {
    fullText = await searchWithProvider(prompt, apiKey, provider, model);
  } catch (err) {
    console.error('Company research error:', err);
    return res.status(500).json({ error: 'Company research failed', details: err.message });
  }

  const parsed = extractMarkedJson(fullText);
  const summary = extractSummaryBeforeMarker(fullText);
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

  const result = db
    .prepare(
      `INSERT INTO company_research (evaluation_id, summary, findings, llm_model, provider)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(evalRow.id, summary, JSON.stringify(findings), model, provider);

  res.json(fetchCompanyResearch(result.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM company_research WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
