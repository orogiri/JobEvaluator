import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name.trim());
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch {
    res.status(409).json({ error: 'Category already exists' });
  }
});

router.delete('/:id', (req, res) => {
  const used = db
    .prepare('SELECT 1 FROM resumes WHERE category_id = ? LIMIT 1')
    .get(req.params.id);
  if (used) return res.status(409).json({ error: 'Category is in use by one or more resumes' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
