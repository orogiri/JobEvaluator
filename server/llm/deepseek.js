import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';

export async function evaluateWithDeepSeek(prompt, apiKey, model) {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  });

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 16384,
    // Disable thinking mode — reasoning tokens appear before the JSON and can cause parse failures
    extra_body: { thinking_mode: 'disabled' },
  });

  if (completion.choices[0].finish_reason === 'length') {
    throw new Error(
      'The model\'s response was cut off before completing (output token limit reached). ' +
      'Try a more capable model, or clear unused fields in Settings.'
    );
  }

  const text = completion.choices[0].message.content.trim();
  const json = text.startsWith('```') ? text.replace(/^```[^\n]*\n|```$/g, '') : text;
  try {
    return JSON.parse(json);
  } catch {
    return JSON.parse(jsonrepair(json));
  }
}
