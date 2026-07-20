// Prices in USD per 1M tokens (input / output). Updated 2026-07-17.
const PRICING = {
  anthropic: {
    'claude-opus-4-8':           { input: 5.00, output: 25.00 },
    // List price. Sonnet 5 also carries an introductory rate of $2.00/$10.00
    // through 2026-08-31 — actual current billing may run below this figure.
    'claude-sonnet-5':           { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00  },
  },
  openai: {
    'gpt-5.6-sol':   { input: 5.00, output: 30.00 },
    'gpt-5.6-terra': { input: 2.50, output: 15.00 },
    'gpt-5.6-luna':  { input: 1.00, output: 6.00  },
    'gpt-5.4-mini':  { input: 0.75, output: 4.50  },
    'gpt-5.4-nano':  { input: 0.20, output: 1.25  },
    'gpt-5.1':       { input: 1.25, output: 10.00 },
  },
  // DeepSeek pricing (USD per 1M tokens; cache-miss input rate)
  deepseek: {
    'deepseek-v4-flash': { input: 0.14,  output: 0.28 },
    'deepseek-v4-pro':   { input: 0.435, output: 0.87 },
  },
  // DashScope rates are tiered by input length; figures below are the 0-256K
  // tier, which covers this app's prompt sizes (JD + resume text).
  qwen: {
    'qwen3.7-max':   { input: 2.50, output: 7.50 },
    'qwen3.7-plus':  { input: 0.40, output: 1.60 },
    'qwen3.6-flash': { input: 0.25, output: 1.50 },
  },
};

// `thinking: true` marks models with a genuine, API-exposed reasoning toggle —
// see generateText() in llm/text.js for how each provider's toggle is actually applied.
export const AVAILABLE_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-5',           label: 'Claude Sonnet 5', recommended: true, thinking: true },
    { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8', thinking: true },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', thinking: true },
  ],
  openai: [
    { id: 'gpt-5.6-sol',   label: 'GPT-5.6 Sol', thinking: true },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', thinking: true },
    { id: 'gpt-5.6-luna',  label: 'GPT-5.6 Luna', recommended: true, thinking: true },
    { id: 'gpt-5.4-mini',  label: 'GPT-5.4 Mini', thinking: true },
    { id: 'gpt-5.4-nano',  label: 'GPT-5.4 Nano', thinking: true },
    { id: 'gpt-5.1',       label: 'GPT-5.1', thinking: true },
  ],
  deepseek: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', thinking: true },
    { id: 'deepseek-v4-pro',   label: 'DeepSeek V4 Pro', recommended: true, thinking: true },
  ],
  qwen: [
    { id: 'qwen3.7-max',   label: 'Qwen3.7-Max', thinking: true },
    { id: 'qwen3.7-plus',  label: 'Qwen3.7-Plus', recommended: true, thinking: true },
    { id: 'qwen3.6-flash', label: 'Qwen3.6-Flash', thinking: true },
  ],
};

export function getPricing(provider, model) {
  return PRICING[provider]?.[model] ?? { input: 0, output: 0 };
}

export function estimateCost(provider, model, inputTokens, outputTokens) {
  const p = getPricing(provider, model);
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

export function charsToTokens(chars) {
  return Math.ceil(chars / 4);
}
