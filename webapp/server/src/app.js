import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
  app.use(express.json({ limit: '100kb' }));

  const limiter = (max) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false });
  if (process.env.NODE_ENV !== 'test') {
    app.use('/api/auth/login', limiter(20));
    app.use('/api/auth/register', limiter(20));
    app.use('/api/leads', limiter(30));
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React client in production.
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
