import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/:categoryId', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM fields WHERE category_id = ? ORDER BY name')
    .all(req.params.categoryId);
  res.json(rows);
});

export default router;
