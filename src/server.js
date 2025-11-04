import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import marketsRouter from './routes/markets.js';
import betsRouter from './routes/bets.js';
import { db, seedIfEmpty } from './db.js';

const app = express();

// Save DB handle for quick access in routes (used in /confirm)
app.locals.db = db;

/* ---- CORS ---- */
const origins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // allow same-origin / tools / local usage
    if (!origin || origins.length === 0 || origins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));

/* ---- Health ---- */
app.get('/health', (_req, res) => res.json({ ok: true, status: 'healthy' }));

/* ---- Admin seed (optional) ---- */
app.post('/admin/seed', (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  seedIfEmpty();
  res.json({ ok: true, seeded: true });
});

/* ---- Routes ---- */
app.use('/api/markets', marketsRouter);
app.use('/api/bets', betsRouter);

/* ---- Error handler ---- */
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.message || 'Internal error' });
});

/* ---- Boot ---- */
const PORT = Number(process.env.PORT || 8080);
seedIfEmpty();
app.listen(PORT, () => {
  console.log(`[odds-backend] listening on :${PORT}`);
});
