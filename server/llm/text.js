import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const QWEN_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

const CUTOFF_MESSAGE =
  "The model's response was cut off before completing (output token limit reached). " +
  'This can happen with reasoning models that spend part of the budget "thinking" before writing ' +
  'the final text. Try a higher output limit or a different model.';

function assertNotEmpty(text) {
  if (!text || !text.trim()) {
    throw new Error(
      'The model returned an empty response. This can happen with reasoning models that used their ' +
      'entire output budget on internal reasoning and never wrote the final text — try again or use a different model.'
    );
  }
  return text.trim();
}

// OpenAI's reasoning-capable model families (o-series, gpt-5-series) accept a
// reasoning_effort param; older gpt-4.1-series models error if you pass one at all.
const OPENAI_REASONING_MODEL = /^o\d|^gpt-5/;

// Freeform (non-JSON) single-shot text generation, shared across features that
// need prose output (e.g. cover letters) rather than the structured JSON the
// evaluateWith* helpers parse. `thinking` toggles each provider's real reasoning
// control where one exists (see AVAILABLE_MODELS in llm/pricing.js for which
// models actually expose it) — it's a no-op for models that don't support it.
export async function generateText(prompt, apiKey, provider, model, maxTokens = 2048, thinking = false) {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const params = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };
    if (thinking) {
      // Adaptive thinking — current Claude models (Opus 4.7+/Sonnet 5) reject the older
      // fixed-budget_tokens form with a 400, so let the model decide how much to think.
      params.thinking = { type: 'adaptive' };
    }
    const message = await client.messages.create(params);
    if (message.stop_reason === 'max_tokens') throw new Error(CUTOFF_MESSAGE);
    const textBlock = message.content.find((b) => b.type === 'text');
    return assertNotEmpty(textBlock?.text);
  }

  if (provider === 'deepseek') {
    const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      extra_body: { thinking_mode: thinking ? 'enabled' : 'disabled' },
    });
    if (completion.choices[0].finish_reason === 'length') throw new Error(CUTOFF_MESSAGE);
    return assertNotEmpty(completion.choices[0].message.content);
  }

  if (provider === 'qwen') {
    const client = new OpenAI({ apiKey, baseURL: QWEN_BASE_URL });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      extra_body: { enable_thinking: thinking },
    });
    if (completion.choices[0].finish_reason === 'length') throw new Error(CUTOFF_MESSAGE);
    return assertNotEmpty(completion.choices[0].message.content);
  }

  const client = new OpenAI({ apiKey });
  const params = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: maxTokens,
  };
  if (OPENAI_REASONING_MODEL.test(model)) {
    params.reasoning_effort = thinking ? 'medium' : 'minimal';
  }
  let completion;
  try {
    completion = await client.chat.completions.create(params);
  } catch (err) {
    // Not every OpenAI reasoning model accepts the same reasoning_effort vocabulary —
    // confirmed empirically that gpt-5.1 rejects 'minimal' (accepts 'none'/'low'/'medium'/'high'
    // instead), while o-series models accept 'minimal'. Rather than hard-code a per-model
    // table that OpenAI can invalidate at any time, parse the model's own "supported values"
    // list from the error and retry once with the closest valid effort level.
    if (err?.param === 'reasoning_effort' && err?.code === 'unsupported_value') {
      const supported = err.error?.message?.match(/'(\w+)'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
      const preferenceOrder = thinking
        ? ['high', 'medium', 'low', 'minimal', 'none']
        : ['none', 'minimal', 'low', 'medium'];
      const fallback = preferenceOrder.find((v) => supported.includes(v));
      if (fallback) {
        completion = await client.chat.completions.create({ ...params, reasoning_effort: fallback });
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }
  if (completion.choices[0].finish_reason === 'length') throw new Error(CUTOFF_MESSAGE);
  return assertNotEmpty(completion.choices[0].message.content);
}
