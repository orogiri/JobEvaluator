import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';

export async function evaluateWithAnthropic(prompt, apiKey, model) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error(
      'The model\'s response was cut off before completing (output token limit reached). ' +
      'This usually means the accumulated field list or JD is too long for this model. ' +
      'Try a model with a higher output limit (e.g. claude-3-7-sonnet), or clear unused fields in Settings.'
    );
  }

  const text = message.content[0].text.trim();
  // Strip markdown fences if the model wrapped the JSON anyway
  const json = text.startsWith('```') ? text.replace(/^```[^\n]*\n|```$/g, '') : text;
  try {
    return JSON.parse(json);
  } catch {
    return JSON.parse(jsonrepair(json));
  }
}
