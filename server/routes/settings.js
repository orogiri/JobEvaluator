import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  settings.weights = JSON.parse(settings.weights || '{}');
  res.json(settings);
});

router.put('/', (req, res) => {
  const { weights, openai_key, anthropic_key, qwen_key, deepseek_key, serper_key, company_research_instructions } = req.body;

  if (weights) {
    const total = Object.values(weights).reduce((s, v) => s + Number(v), 0);
    if (Math.round(total) !== 100) {
      return res.status(400).json({ error: 'Weights must sum to 100' });
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'weights',
      JSON.stringify(weights)
    );
  }

  if (openai_key !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('openai_key', openai_key);
  }

  if (qwen_key !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('qwen_key', qwen_key);
  }

  if (deepseek_key !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('deepseek_key', deepseek_key);
  }

  if (anthropic_key !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'anthropic_key',
      anthropic_key
    );
  }

  if (serper_key !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('serper_key', serper_key);
  }

  if (company_research_instructions !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'company_research_instructions',
      company_research_instructions
    );
  }

  res.json({ ok: true });
});

export default router;
