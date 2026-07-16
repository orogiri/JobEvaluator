import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM benchmark_imports ORDER BY rank ASC, salary_mid DESC')
    .all();
  res.json(rows);
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM benchmark_imports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM benchmark_imports WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
