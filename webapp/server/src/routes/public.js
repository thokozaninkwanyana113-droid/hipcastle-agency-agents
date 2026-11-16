import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, row, rows } from '../db.js';
import { body, z } from '../validate.js';
import { logEvent } from '../events.js';
import { publicSettings } from '../settings.js';
import { generalFaqs, serviceFaqs, PROVINCES } from '../content.js';
import { journey } from '../playbooks.js';
import { availableGateways } from '../payments/config.js';
import { onLead, onSubscribe, onTestimonialSubmitted } from '../email/notify.js';
import { verifyUnsubscribe } from '../email/mailer.js';
import express from 'express';
import { canonicalUrl } from '../urls.js';

const REPO_ROOT = process.env.AGENTS_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const r = Router();

const tiersFor = (serviceId) =>
  rows(db.prepare(`SELECT * FROM service_tiers WHERE service_id = ?
    ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(serviceId), ['features']);

r.get('/services', (req, res) => {
  const services = rows(db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM service_agents sa WHERE sa.service_id = s.id) AS agent_count,
           (SELECT MIN(price_cents) FROM service_tiers t WHERE t.service_id = s.id) AS from_price_cents
    FROM services s WHERE s.is_active = 1 ORDER BY s.sort_order`).all(), ['outcomes']);
  if (req.query.include === 'tiers') for (const s of services) s.tiers = tiersFor(s.id);
  res.json(services);
});

r.get('/services/:slug', (req, res) => {
  const s = row(db.prepare('SELECT * FROM services WHERE slug = ? AND is_active = 1').get(req.params.slug), ['outcomes']);
  if (!s) return res.status(404).json({ error: 'Service not found' });
  s.tiers = tiersFor(s.id);
  s.faqs = serviceFaqs(s);
  s.journey = journey(s.slug, s.tiers);
  s.testimonials = rows(db.prepare(`SELECT id, author, role, company, location, quote, rating FROM testimonials
    WHERE status = 'approved' AND service_id = ? ORDER BY is_featured DESC, id DESC LIMIT 3`).all(s.id));
  s.agents = rows(db.prepare(`SELECT a.slug, a.name, a.emoji, a.description, a.vibe, a.division
    FROM agents a JOIN service_agents sa ON sa.agent_id = a.id WHERE sa.service_id = ? ORDER BY a.name`).all(s.id));
  res.json(s);
});

r.get('/agents', (req, res) => {
  const { q = '', service = '' } = req.query;
  const list = rows(db.prepare(`
    SELECT a.slug, a.name, a.emoji, a.color, a.description, a.vibe, a.division,
           (SELECT s.slug FROM services s JOIN service_agents sa ON sa.service_id = s.id
             WHERE sa.agent_id = a.id ORDER BY s.slug = a.division DESC LIMIT 1) AS service_slug
    FROM agents a
    WHERE (? = '' OR a.name LIKE ? OR a.description LIKE ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM service_agents sa JOIN services s ON s.id = sa.service_id
                             WHERE sa.agent_id = a.id AND s.slug = ?))
    ORDER BY a.division, a.name`).all(q, `%${q}%`, `%${q}%`, service, service));
  res.json(list);
});

r.get('/agents/:slug', (req, res) => {
  const a = row(db.prepare('SELECT * FROM agents WHERE slug = ?').get(req.params.slug));
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  try {
    const md = readFileSync(resolve(REPO_ROOT, a.source_path), 'utf8');
    a.profile = md.replace(/^---[\s\S]*?---\s*/, '');
  } catch { a.profile = ''; }
  a.services = rows(db.prepare(`SELECT s.slug, s.name, s.icon FROM services s
    JOIN service_agents sa ON sa.service_id = s.id WHERE sa.agent_id = ?`).all(a.id));
  delete a.source_path;
  res.json(a);
});

r.get('/testimonials', (req, res) => {
  const featured = req.query.featured === '1';
  res.json(rows(db.prepare(`SELECT t.id, t.author, t.role, t.company, t.location, t.quote, t.rating, t.created_at,
      s.name AS service_name, s.slug AS service_slug
    FROM testimonials t LEFT JOIN services s ON s.id = t.service_id
    WHERE t.status = 'approved' AND (? = 0 OR t.is_featured = 1) ORDER BY t.is_featured DESC, t.id DESC`).all(featured ? 1 : 0)));
});

r.post('/testimonials', body(z.object({
  author: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  role: z.string().trim().min(2).max(80),
  company: z.string().trim().max(120).optional().default(''),
  location: z.string().trim().max(80).optional().default(''),
  service: z.string().trim().max(60).optional().default(''),
  rating: z.number().int().min(1).max(5),
  quote: z.string().trim().min(20, 'Please write at least 20 characters').max(1000),
  consent: z.literal(true, { message: 'Please allow us to publish your review' }),
})), (req, res) => {
  const b = req.body;
  const svc = b.service ? db.prepare('SELECT id FROM services WHERE slug = ?').get(b.service) : null;
  const t = row(db.prepare(`INSERT INTO testimonials (author, email, role, company, location, service_id, quote, rating, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now')) RETURNING id`)
    .get(b.author, b.email.toLowerCase(), b.role, b.company, b.location, svc?.id ?? null, b.quote, b.rating));
  logEvent('testimonial.submitted', `New ${b.rating}★ review from ${b.author} awaiting moderation`, { ref: String(t.id) });
  onTestimonialSubmitted({ ...b, id: t.id });
  res.status(201).json({ ok: true });
});

// ---- Site-wide public data -----------------------------------------------------------
r.get('/site', (_req, res) => res.json({ ...publicSettings(), site_url: canonicalUrl(), payment_methods: availableGateways(), provinces: PROVINCES }));
r.get('/faqs', (_req, res) => res.json(generalFaqs()));

// ---- Blog ----------------------------------------------------------------------------
const POST_LIST = `SELECT id, slug, title, excerpt, category, tags, cover_emoji, author, published_at, updated_at,
  CAST((LENGTH(body) - LENGTH(REPLACE(body, ' ', '')) + 1) / 200 + 1 AS INTEGER) AS reading_minutes FROM posts`;

r.get('/posts', (req, res) => {
  const { category = '', q = '' } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 50);
  res.json(rows(db.prepare(`${POST_LIST} WHERE status = 'published' AND published_at <= datetime('now')
    AND (? = '' OR category = ?) AND (? = '' OR title LIKE ? OR excerpt LIKE ?)
    ORDER BY published_at DESC LIMIT ?`).all(category, category, q, `%${q}%`, `%${q}%`, limit), ['tags']));
});

r.get('/posts/:slug', (req, res) => {
  const p = row(db.prepare(`SELECT *, CAST((LENGTH(body) - LENGTH(REPLACE(body, ' ', '')) + 1) / 200 + 1 AS INTEGER) AS reading_minutes
    FROM posts WHERE slug = ? AND status = 'published' AND published_at <= datetime('now')`).get(req.params.slug), ['tags']);
  if (!p) return res.status(404).json({ error: 'Article not found' });
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(p.id);
  p.related = rows(db.prepare(`${POST_LIST} WHERE status = 'published' AND published_at <= datetime('now') AND id <> ?
    ORDER BY (category = ?) DESC, published_at DESC LIMIT 3`).all(p.id, p.category), ['tags']);
  res.json(p);
});

r.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  res.json({
    services: one('SELECT COUNT(*) n FROM services WHERE is_active = 1'),
    tiers: one('SELECT COUNT(*) n FROM service_tiers'),
    agents: one('SELECT COUNT(*) n FROM agents'),
    projects: one("SELECT COUNT(*) n FROM orders WHERE status <> 'cancelled'"),
  });
});

r.post('/leads', body(z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(150).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  service: z.string().trim().max(60).optional().default(''),
  budget: z.string().trim().max(60).optional().default(''),
  province: z.string().trim().max(60).optional().default(''),
  preferred_contact: z.enum(['', 'email', 'phone', 'whatsapp']).optional().default(''),
  source: z.string().trim().max(60).optional().default(''),
  message: z.string().trim().min(10, 'Please tell us a little more (at least 10 characters)').max(5000),
  consent: z.literal(true, { message: 'Please agree to be contacted' }),
})), (req, res) => {
  const b = req.body;
  const svc = b.service ? db.prepare('SELECT id, name FROM services WHERE slug = ?').get(b.service) : null;
  const lead = row(db.prepare(`INSERT INTO leads (name, email, company, phone, service_id, budget, province, preferred_contact, source, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`)
    .get(b.name, b.email.toLowerCase(), b.company, b.phone, svc?.id ?? null, b.budget, b.province, b.preferred_contact, b.source, b.message));
  logEvent('lead.created', `New lead: ${b.name}${b.company ? ` (${b.company})` : ''}${svc ? ` — ${svc.name}` : ''}`, { ref: String(lead.id) });
  onLead({ ...b, email: b.email.toLowerCase(), id: lead.id }, svc?.name);
  res.status(201).json({ ok: true, id: lead.id });
});

r.post('/newsletter', body(z.object({ email: z.string().trim().email().max(200) })), (req, res) => {
  const info = db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').run(req.body.email.toLowerCase());
  if (info.changes) {
    logEvent('newsletter.subscribed', `New subscriber: ${req.body.email.toLowerCase()}`);
    onSubscribe(req.body.email.toLowerCase());
  }
  res.status(201).json({ ok: true });
});

// One-click unsubscribe (GET from the email link, POST from mail clients via List-Unsubscribe-Post)
r.all('/newsletter/unsubscribe', express.urlencoded({ extended: false }), (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email || !verifyUnsubscribe(email, req.query.token)) return res.status(400).type('html').send(unsubPage('This unsubscribe link is invalid or has expired.'));
  const info = db.prepare('DELETE FROM newsletter_subscribers WHERE email = ?').run(email);
  if (info.changes) logEvent('newsletter.unsubscribed', `${email} unsubscribed`);
  res.type('html').send(unsubPage(`${email} has been unsubscribed. You won’t receive our newsletter again.`));
});
const unsubPage = (msg) => `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Newsletter — Hipcastle Agency</title></head>
<body style="font-family:system-ui,sans-serif;background:#faf8f3;color:#141a2e;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:460px;padding:32px;background:#fff;border:1px solid #e4e2dc;border-radius:14px;text-align:center">
<h1 style="font-family:Georgia,serif;color:#0b1530">Hipcastle Agency</h1><p>${msg.replace(/[<>&]/g, '')}</p><p><a href="/" style="color:#22336a">Back to www.hipcastle.agency</a></p></main></body></html>`;

export default r;
