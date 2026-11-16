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
import { metricsMiddleware, recordError } from './events.js';
import { canonicalHostRedirect, canonicalUrl } from './urls.js';
import { DIST, hasClientBuild, llmsTxt, renderPage, robotsTxt, rssXml, sitemapXml } from './seo.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", 'https://challenges.cloudflare.com'],
        'frame-src': ['https://challenges.cloudflare.com'],
        'connect-src': ["'self'", 'https://challenges.cloudflare.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'https:'],
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
  if (process.env.NODE_ENV !== 'test') {
    app.use('/api/auth/login', limiter(20));
    app.use('/api/auth/register', limiter(20));
    app.use('/api/auth/forgot', limiter(10));
    app.use('/api/auth/reset', limiter(20));
    app.use('/api/leads', limiter(10));
    app.use('/api/newsletter', limiter(10));
    app.use('/api/testimonials', (req, res, next) => (req.method === 'POST' ? limiter(10)(req, res, next) : next()));
    app.use('/api/payments/checkout', limiter(40));
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Crawler & AI files (SEO / GEO)
  const text = (type, fn) => (_req, res) => res.type(type).set('Cache-Control', 'public, max-age=3600').send(fn());
  app.get('/sitemap.xml', text('application/xml', sitemapXml));
  app.get('/robots.txt', text('text/plain', robotsTxt));
  app.get('/llms.txt', text('text/plain; charset=utf-8', () => llmsTxt()));
  app.get('/llms-full.txt', text('text/plain; charset=utf-8', () => llmsTxt({ full: true })));
  app.get(['/blog/rss.xml', '/rss.xml'], text('application/rss+xml', rssXml));

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
