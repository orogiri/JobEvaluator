import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';

export async function evaluateWithOpenAI(prompt, apiKey, model) {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 16384,
  });

  if (completion.choices[0].finish_reason === 'length') {
    throw new Error(
      'The model\'s response was cut off before completing (output token limit reached). ' +
      'This usually means the accumulated field list or JD is too long for this model. ' +
      'Try a more capable model, or clear unused fields in Settings.'
    );
  }

  const text = completion.choices[0].message.content.trim();
  // Strip markdown fences if the model wrapped the JSON anyway
  const json = text.startsWith('```') ? text.replace(/^```[^\n]*\n|```$/g, '') : text;
  try {
    return JSON.parse(json);
  } catch {
    return JSON.parse(jsonrepair(json));
  }
}
