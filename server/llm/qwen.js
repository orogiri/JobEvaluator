import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';

export async function evaluateWithQwen(prompt, apiKey, model) {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  });

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 16384,
    // Disable thinking mode — it silently consumes output tokens before writing
    // the response, cutting off the JSON we actually need.
    extra_body: { enable_thinking: false },
  });

  const text = completion.choices[0].message.content.trim();
  const json = text.startsWith('```') ? text.replace(/^```[^\n]*\n|```$/g, '') : text;
  try {
    return JSON.parse(json);
  } catch {
    return JSON.parse(jsonrepair(json));
  }
}
