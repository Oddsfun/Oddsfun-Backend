import express from 'express';
import { listMarkets } from '../db.js';

const router = express.Router();

/** List live markets */
router.get('/', (_req, res) => {
  res.json({ ok: true, markets: listMarkets() });
});

export default router;
