import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { generateText } from './text.js';

const SERPER_RESULTS_PER_QUERY = 6;

// One real Google search via Serper (https://serper.dev). Returns [] on any failure
// (missing key, rate limit, network error) rather than throwing — Google-backed search
// is a quality upgrade, not a hard requirement; the LLM still has its own web_search tool.
// `tbs` mirrors Google's time-filter param (e.g. 'qdr:y' = past year, 'qdr:m' = past month).
async function serperSearch(query, apiKey, { num = SERPER_RESULTS_PER_QUERY, tbs } = {}) {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num, ...(tbs ? { tbs } : {}) }),
    });
    if (!res.ok) {
      console.error('Serper search failed:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return (data.organic || []).map((r) => ({ title: r.title, link: r.link, snippet: r.snippet || '', date: r.date || '' }));
  } catch (err) {
    console.error('Serper search error:', err.message);
    return [];
  }
}

// Runs several queries in parallel and merges/dedupes results by URL, capped at maxTotal.
export async function mergedSerperSearch(queries, apiKey, { maxTotal = 10, tbs } = {}) {
  if (!apiKey) return [];
  const batches = await Promise.all(queries.map((q) => serperSearch(q, apiKey, { tbs })));
  const merged = [];
  const seenLinks = new Set();
  for (const batch of batches) {
    for (const r of batch) {
      if (seenLinks.has(r.link)) continue;
      seenLinks.add(r.link);
      merged.push(r);
      if (merged.length >= maxTotal) return merged;
    }
  }
  return merged;
}

const RESULTS_MARKER = 'RESULTS_JSON:';

// Shared parsing for the "prose summary, then RESULTS_JSON: {...}" convention used by
// both contact search and company research prompts.
export function extractMarkedJson(fullText) {
  const idx = fullText.indexOf(RESULTS_MARKER);
  if (idx === -1) return {};
  let jsonStr = fullText.slice(idx + RESULTS_MARKER.length).trim();
  jsonStr = jsonStr.startsWith('```') ? jsonStr.replace(/^```[^\n]*\n|```$/g, '') : jsonStr;
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr));
    } catch {
      return {};
    }
  }
}

export function extractSummaryBeforeMarker(fullText) {
  const idx = fullText.indexOf(RESULTS_MARKER);
  return (idx === -1 ? fullText : fullText.slice(0, idx)).trim();
}

// Single-shot Claude call with the server-side web_search tool enabled. Returns the
// concatenated text (all text blocks joined in order) — callers parse RESULTS_JSON from it.
export async function searchWithClaude(prompt, apiKey, model, { maxTokens = 4096, maxSearches = 5 } = {}) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }],
  });
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// Only Anthropic has a native, server-side web_search tool wired into this app.
// For other providers, this is a plain completion — the model can only reason over
// whatever Google results (via Serper) were already embedded in the prompt; it has
// no way to search further. Callers should tell the prompt builder as much via the
// `hasWebSearchTool` flag so the model doesn't fall back on its own memorized guess.
export async function searchWithProvider(prompt, apiKey, provider, model, opts = {}) {
  if (provider === 'anthropic') return searchWithClaude(prompt, apiKey, model, opts);
  return generateText(prompt, apiKey, provider, model, opts.maxTokens ?? 4096);
}
