import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, c.name AS category_name
       FROM resumes r
       JOIN categories c ON r.category_id = c.id
       ORDER BY c.name, r.name`
    )
    .all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, category_id, text } = req.body;
  if (!name?.trim() || !category_id || !text?.trim()) {
    return res.status(400).json({ error: 'name, category_id, and text are required' });
  }
  const result = db
    .prepare('INSERT INTO resumes (name, category_id, text) VALUES (?, ?, ?)')
    .run(name.trim(), category_id, text.trim());
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, category_id, text } = req.body;
  if (!name?.trim() || !category_id || !text?.trim()) {
    return res.status(400).json({ error: 'name, category_id, and text are required' });
  }
  db.prepare('UPDATE resumes SET name = ?, category_id = ?, text = ? WHERE id = ?').run(
    name.trim(),
    category_id,
    text.trim(),
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM resumes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
