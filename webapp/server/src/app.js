import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { resolve } from 'node:path';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import paymentRoutes from './routes/payments.js';
import chatRoutes from './routes/chat.js';
import supportRoutes from './routes/support.js';
import integrationRoutes, { integrationsAdmin } from './routes/integrations.js';
import operatorAdmin from './routes/operator.js';
import designRoutes from './routes/design.js';
import engagementRoutes from './routes/engagements.js';
import { metricsMiddleware, recordError } from './events.js';
import { db } from './db.js';
import { canonicalHostRedirect, canonicalUrl } from './urls.js';
import { DIST, hasClientBuild, llmsTxt, renderPage, robotsTxt, rssXml, sitemapXml, serviceMarkdownBySlug } from './seo.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Never serialise secrets, whatever a query selects (o.*, u.*): subscription tokens, password hashes.
  const SECRET_KEYS = new Set(['payfast_token', 'password_hash']);
  app.set('json replacer', (k, v) => (SECRET_KEYS.has(k) ? undefined : v));
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", 'https://challenges.cloudflare.com'],
        'frame-src': ['https://challenges.cloudflare.com', 'https://cal.com', 'https://app.cal.com', 'https://calendly.com'],
        'connect-src': ["'self'", 'https://challenges.cloudflare.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        // Checkout forms post straight to the gateways
        'form-action': ["'self'", 'https://www.payfast.co.za', 'https://sandbox.payfast.co.za', 'https://pay.ozow.com'],
        'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(canonicalHostRedirect);
  app.use(compression());
  // Production: only the site itself (plus any CORS_ORIGIN extras) may call the API from a browser.
  const allowed = [canonicalUrl(), ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [])].map((o) => o.trim().replace(/\/$/, ''));
  app.use(cors({ origin: process.env.NODE_ENV === 'production' ? allowed : true }));
  app.use(metricsMiddleware);
  app.use(express.json({ limit: '200kb' }));

  const limiter = (max) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false });
  const chatLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'You’re sending messages quickly — please wait a minute and try again.' } });
  if (process.env.NODE_ENV !== 'test') {
    app.use('/api/auth/login', limiter(20));
    app.use('/api/auth/register', limiter(20));
    app.use('/api/auth/forgot', limiter(10));
    app.use('/api/auth/reset', limiter(20));
    app.use('/api/leads', limiter(10));
    app.use('/api/newsletter', limiter(10));
    app.use('/api/testimonials', (req, res, next) => (req.method === 'POST' ? limiter(10)(req, res, next) : next()));
    app.use('/api/payments/checkout', limiter(40));
    // Chatbot: each message can call the AI model, so keep a tight per-IP budget.
    app.use('/api/chat', (req, res, next) => (req.method === 'POST' ? chatLimiter(req, res, next) : next()));
    app.use('/api/chat/:sid/handoff', limiter(5));
    app.use('/api/t', limiter(600));
    app.use('/api/client-error', limiter(30));
    app.use('/api/support', (req, res, next) => (req.method === 'POST' ? limiter(60)(req, res, next) : next()));
  }

  // Health check for Fly and external uptime monitors: proves the database answers, not just the process.
  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.set('Cache-Control', 'no-store').json({ ok: true, db: 'ok', uptime_s: Math.round(process.uptime()) });
    } catch (err) {
      res.status(503).json({ ok: false, db: 'error' });
    }
  });
  app.use('/api', publicRoutes);
  app.use('/api', chatRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/support', supportRoutes);
  app.use('/api/design', designRoutes);
  app.use('/api/engagements', engagementRoutes);
  app.use('/api/admin/integrations', integrationsAdmin);
  app.use('/api/admin/operator', operatorAdmin);
  app.use('/api', integrationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Crawler & AI files (SEO / GEO)
  const text = (type, fn) => (_req, res) => res.type(type).set('Cache-Control', 'public, max-age=3600').send(fn());
  app.get('/sitemap.xml', text('application/xml', sitemapXml));
  app.get('/robots.txt', text('text/plain', robotsTxt));
  app.get('/llms.txt', text('text/plain; charset=utf-8', () => llmsTxt()));
  app.get('/llms-full.txt', text('text/plain; charset=utf-8', () => llmsTxt({ full: true })));
  app.get(['/blog/rss.xml', '/rss.xml'], text('application/rss+xml', rssXml));
  // Markdown versions of service pages for AI assistants and crawlers (GEO).
  app.get(/^\/services\/([a-z0-9-]+)\.md$/, (req, res) => {
    const md = serviceMarkdownBySlug(req.params[0]);
    if (!md) return res.status(404).type('text/plain').send('Not found');
    res.type('text/markdown; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(md);
  });

  // Built React client with server-rendered SEO head + content snapshot.
  if (hasClientBuild()) {
    app.use('/assets', express.static(resolve(DIST, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(DIST, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api).*/, (req, res) => {
      const { status, html } = renderPage(req.path);
      res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    recordError(err, req);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
