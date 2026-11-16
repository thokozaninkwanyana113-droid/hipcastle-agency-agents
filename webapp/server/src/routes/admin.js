import { Router } from 'express';
import { statSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { db, DB_PATH, row, rows } from '../db.js';
import { body, id, webUrl, z } from '../validate.js';
import { authenticate, publicUser, requireRole } from '../auth.js';
import { logEvent, metricsSnapshot, startedAt } from '../events.js';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../settings.js';
import { listJobs, runJob, setJobEnabled } from '../jobs.js';
import { MODE, notifyBase, ozowConfig, payfastConfig, simulatedAllowed, siteUrl } from '../payments/config.js';
import { applyPaymentStatus, findPayment } from '../payments/service.js';
import { seoAudit } from '../seo.js';
import { canonicalUrl } from '../urls.js';
import { onTestimonialApproved } from '../email/notify.js';
import { emailConfig, processQueue, renderTemplate, retryEmail, sendEmail, verifyTransport } from '../email/mailer.js';
import { TEMPLATES } from '../email/templates.js';
import * as P from '../pipeline.js';
import { PLAYBOOKS, STAGES, buildPlan, REVISIONS } from '../playbooks.js';

const r = Router();
r.use(authenticate, requireRole('admin', 'staff'));

r.get('/overview', (_req, res) => {
  const n = (sql, ...p) => db.prepare(sql).get(...p).n ?? 0;
  res.json({
    revenue_paid_cents: n("SELECT COALESCE(SUM(amount_cents),0) n FROM invoices WHERE status = 'paid'"),
    outstanding_cents: n("SELECT COALESCE(SUM(amount_cents),0) n FROM invoices WHERE status = 'unpaid'"),
    overdue_invoices: n("SELECT COUNT(*) n FROM invoices WHERE status = 'unpaid' AND due_at < date('now')"),
    active_orders: n("SELECT COUNT(*) n FROM orders WHERE status IN ('active','in_review')"),
    pending_orders: n("SELECT COUNT(*) n FROM orders WHERE status = 'pending'"),
    completed_orders: n("SELECT COUNT(*) n FROM orders WHERE status = 'completed'"),
    new_leads: n("SELECT COUNT(*) n FROM leads WHERE status = 'new'"),
    clients: n("SELECT COUNT(*) n FROM users WHERE role = 'client'"),
    subscribers: n('SELECT COUNT(*) n FROM newsletter_subscribers'),
    revenue_30d_cents: n("SELECT COALESCE(SUM(amount_cents),0) n FROM invoices WHERE status = 'paid' AND paid_at >= datetime('now','-30 days')"),
    payments_today: n("SELECT COUNT(*) n FROM payments WHERE status = 'complete' AND updated_at >= date('now')"),
    payments_failed_7d: n("SELECT COUNT(*) n FROM payments WHERE status IN ('failed') AND updated_at >= datetime('now','-7 days')"),
    pending_testimonials: n("SELECT COUNT(*) n FROM testimonials WHERE status = 'pending'"),
    avg_rating: db.prepare("SELECT ROUND(AVG(rating),1) n FROM testimonials WHERE status = 'approved'").get().n,
    published_posts: n("SELECT COUNT(*) n FROM posts WHERE status = 'published'"),
    leads_won: n("SELECT COUNT(*) n FROM leads WHERE status = 'won'"),
    leads_total: n('SELECT COUNT(*) n FROM leads'),
    revenue_by_day: rows(db.prepare(`WITH RECURSIVE d(day) AS (SELECT date('now','-29 days') UNION ALL SELECT date(day,'+1 day') FROM d WHERE day < date('now'))
      SELECT d.day, COALESCE(SUM(i.amount_cents),0) AS cents FROM d
      LEFT JOIN invoices i ON i.status = 'paid' AND date(i.paid_at) = d.day GROUP BY d.day ORDER BY d.day`).all()),
    recent_events: rows(db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 8').all()),
    by_service: rows(db.prepare(`
      SELECT s.name, s.icon, COUNT(o.id) AS orders, COALESCE(SUM(o.price_cents),0) AS value_cents
      FROM services s
      LEFT JOIN service_tiers st ON st.service_id = s.id
      LEFT JOIN orders o ON o.tier_id = st.id AND o.status <> 'cancelled'
      GROUP BY s.id ORDER BY value_cents DESC, s.sort_order`).all()),
    by_tier: rows(db.prepare(`
      SELECT st.tier, COUNT(o.id) AS orders FROM service_tiers st
      LEFT JOIN orders o ON o.tier_id = st.id AND o.status <> 'cancelled'
      GROUP BY st.tier ORDER BY CASE st.tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all()),
  });
});

// Leads / CRM
r.get('/leads', (req, res) => {
  const status = req.query.status || '';
  res.json(rows(db.prepare(`SELECT l.*, s.name AS service_name FROM leads l
    LEFT JOIN services s ON s.id = l.service_id WHERE (? = '' OR l.status = ?)
    ORDER BY l.created_at DESC, l.id DESC`).all(status, status)));
});
r.patch('/leads/:id', body(z.object({ status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost']) })), (req, res) => {
  const l = row(db.prepare('UPDATE leads SET status = ? WHERE id = ? RETURNING *').get(req.body.status, id(req.params.id)));
  if (!l) return res.status(404).json({ error: 'Lead not found' });
  logEvent('lead.status', `Lead ${l.name} → ${l.status}`, { actor: req.user.id, ref: String(l.id) });
  res.json(l);
});

// Users
r.get('/users', (req, res) => {
  const role = req.query.role || '';
  res.json(rows(db.prepare(`SELECT u.*,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
      (SELECT COALESCE(SUM(i.amount_cents),0) FROM invoices i JOIN orders o ON o.id = i.order_id
        WHERE o.user_id = u.id AND i.status = 'paid') AS lifetime_cents
    FROM users u WHERE (? = '' OR u.role = ?) ORDER BY u.created_at DESC, u.id DESC`).all(role, role))
    .map((u) => ({ ...publicUser(u), order_count: u.order_count, lifetime_cents: u.lifetime_cents })));
});
r.patch('/users/:id', requireRole('admin'), body(z.object({ role: z.enum(['client', 'staff', 'admin']) })), (req, res) => {
  const uid = id(req.params.id);
  if (uid === req.user.id) return res.status(400).json({ error: 'You cannot change your own role' });
  const u = row(db.prepare('UPDATE users SET role = ? WHERE id = ? RETURNING *').get(req.body.role, uid));
  if (!u) return res.status(404).json({ error: 'User not found' });
  logEvent('user.role', `${u.name} is now ${u.role}`, { actor: req.user.id, level: 'warn' });
  res.json(publicUser(u));
});

// Invoices
r.get('/invoices', (req, res) => {
  const status = req.query.status || '';
  res.json(rows(db.prepare(`SELECT i.*, o.reference, o.id AS order_id, u.name AS client_name, s.name AS service_name
    FROM invoices i JOIN orders o ON o.id = i.order_id JOIN users u ON u.id = o.user_id
    JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
    WHERE (? = '' OR i.status = ?) ORDER BY i.issued_at DESC, i.id DESC`).all(status, status)));
});
// Manual invoice changes are admin-only and need a reason (e.g. 'EFT received 12 Nov, FNB ref 1234').
r.patch('/invoices/:id', requireRole('admin'), body(z.object({
  status: z.enum(['unpaid', 'paid', 'void']),
  reason: z.string().trim().min(5, 'Give a reason, e.g. the EFT reference').max(300),
})), (req, res) => {
  const s = req.body.status;
  const inv = row(db.prepare(`UPDATE invoices SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') END
    WHERE id = ? RETURNING *`).get(s, s, id(req.params.id)));
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  logEvent('invoice.status', `${inv.number} manually set to ${s} — ${req.body.reason}`, { actor: req.user.id, ref: inv.number, level: 'warn' });
  if (s === 'paid') {
    const o = db.prepare('SELECT status FROM orders WHERE id = ?').get(inv.order_id);
    if (o.status === 'pending') {
      db.prepare("UPDATE orders SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(inv.order_id);
      P.onActivated(inv.order_id);
    }
  }
  res.json(inv);
});

// Catalog management: edit a tier's commercial terms
r.patch('/tiers/:id', requireRole('admin'), body(z.object({
  name: z.string().trim().min(2).max(60).optional(),
  price_cents: z.number().int().min(0).optional(),
  delivery_days: z.number().int().min(1).max(365).optional(),
  summary: z.string().trim().min(5).max(300).optional(),
  features: z.array(z.string().trim().min(1).max(200)).min(1).max(15).optional(),
  is_popular: z.boolean().optional(),
})), (req, res) => {
  const t = row(db.prepare('SELECT * FROM service_tiers WHERE id = ?').get(id(req.params.id)), ['features']);
  if (!t) return res.status(404).json({ error: 'Tier not found' });
  const b = { ...t, ...req.body };
  const out = row(db.prepare(`UPDATE service_tiers SET name = ?, price_cents = ?, delivery_days = ?, summary = ?,
    features = ?, is_popular = ? WHERE id = ? RETURNING *`)
    .get(b.name, b.price_cents, b.delivery_days, b.summary, JSON.stringify(b.features), b.is_popular ? 1 : 0, t.id), ['features']);
  logEvent('catalog.tier', `Tier #${t.id} (${out.name}) updated`, { actor: req.user.id });
  res.json(out);
});

r.get('/staff', (_req, res) =>
  res.json(rows(db.prepare("SELECT id, name, email, role FROM users WHERE role IN ('admin','staff') ORDER BY name").all())));

// ======================= Command Centre =======================

const tableCounts = () => Object.fromEntries(
  ['users', 'services', 'service_tiers', 'agents', 'orders', 'invoices', 'payments', 'leads', 'messages', 'posts', 'testimonials', 'newsletter_subscribers', 'emails', 'events']
    .map((t) => [t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]));

function dbSize() {
  if (DB_PATH === ':memory:') return 0;
  return ['', '-wal'].reduce((a, ext) => { try { return a + statSync(DB_PATH + ext).size; } catch { return a; } }, 0);
}

function warnings() {
  const w = [];
  const s = getSettings();
  if (!process.env.JWT_SECRET) w.push({ level: 'error', message: 'JWT_SECRET is not set — sessions use an insecure development secret.' });
  if (process.env.NODE_ENV !== 'production' && !process.env.SITE_URL) w.push({ level: 'info', message: `Development mode: SEO tags point to ${canonicalUrl()}, payment returns use ${siteUrl()}.` });
  if (MODE !== 'live') w.push({ level: 'warn', message: 'Payments are in SANDBOX mode. Set PAYMENTS_MODE=live with real merchant credentials to accept money.' });
  if (payfastConfig().sandboxDefaults) w.push({ level: 'warn', message: 'PayFast is using the shared public sandbox account: checkout works but its notifications cannot be verified, so payments will not auto-complete. Set PAYFAST_MERCHANT_ID / KEY / PASSPHRASE from your own sandbox account.' });
  if (!payfastConfig().sandboxDefaults && !payfastConfig().passphrase) w.push({ level: 'warn', message: 'PAYFAST_PASSPHRASE is empty — set a passphrase in your PayFast dashboard for signed requests.' });
  if (!ozowConfig().configured) w.push({ level: 'info', message: 'Ozow is not configured (set OZOW_SITE_CODE and OZOW_PRIVATE_KEY).' });
  if (simulatedAllowed()) w.push({ level: 'info', message: 'Simulated test payments are enabled (development only).' });
  if (emailConfig().mode !== 'smtp') w.push({ level: 'warn', message: 'Email is in LOG mode — emails are stored in the Command Centre but not delivered. Set SMTP_HOST, SMTP_USER and SMTP_PASS for your @hipcastle.agency mailbox.' });
  const failedEmails = db.prepare("SELECT COUNT(*) n FROM emails WHERE status = 'failed' AND created_at > datetime('now','-7 days')").get().n;
  if (failedEmails) w.push({ level: 'error', message: `${failedEmails} email(s) failed to send in the last 7 days — see Emails.` });
  if (!s.orders_enabled) w.push({ level: 'warn', message: 'New online orders are paused.' });
  if (/^\+27 10 000 0000$/.test(s.phone) || s.whatsapp === '27100000000') w.push({ level: 'warn', message: 'Business phone/WhatsApp are still placeholders — update them in Settings.' });
  const admins = db.prepare("SELECT password_hash FROM users WHERE role = 'admin'").all();
  if (admins.some((a) => bcrypt.compareSync('ChangeMe123!', a.password_hash))) w.push({ level: 'error', message: 'The admin account still uses the default password.' });
  return w;
}

r.get('/system', (_req, res) => {
  const mem = process.memoryUsage();
  const pf = payfastConfig();
  const oz = ozowConfig();
  res.json({
    status: 'operational',
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    node: process.version,
    env: process.env.NODE_ENV || 'development',
    memory_mb: { rss: +(mem.rss / 1e6).toFixed(1), heap: +(mem.heapUsed / 1e6).toFixed(1) },
    db: { path: DB_PATH === ':memory:' ? 'in-memory' : DB_PATH.split(/[\\/]/).slice(-2).join('/'), size_kb: Math.round(dbSize() / 1024), tables: tableCounts() },
    site_url: canonicalUrl(),
    app_url: siteUrl(),
    gateways: {
      mode: MODE,
      notify_base: notifyBase(),
      payfast: { configured: pf.configured, sandbox_defaults: pf.sandboxDefaults, host: pf.host, enabled: getSettings().payfast_enabled,
        validate_remote: pf.validateRemote, check_ip: pf.checkIp, notify_url: `${notifyBase()}/api/payments/payfast/notify` },
      ozow: { configured: oz.configured, is_test: oz.isTest, api_check: Boolean(oz.api_key), enabled: getSettings().ozow_enabled,
        notify_url: `${notifyBase()}/api/payments/ozow/notify` },
      simulated: simulatedAllowed(),
    },
    metrics: metricsSnapshot(),
    jobs: listJobs(),
    warnings: warnings(),
  });
});

// Activity log
r.get('/events', (req, res) => {
  const { level = '', type = '', q = '' } = req.query;
  const before = id(req.query.before) || 2 ** 31;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(rows(db.prepare(`SELECT e.*, u.name AS actor_name FROM events e LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.id < ? AND (? = '' OR e.level = ?) AND (? = '' OR e.type LIKE ?) AND (? = '' OR e.message LIKE ?)
    ORDER BY e.id DESC LIMIT ?`).all(before, level, level, type, `${type}%`, q, `%${q}%`, limit), ['meta']));
});

// Payments
r.get('/payments', (req, res) => {
  const { status = '', gateway = '' } = req.query;
  res.json(rows(db.prepare(`SELECT p.id, p.reference, p.gateway, p.status, p.amount_cents, p.gateway_txn_id, p.status_message, p.is_test, p.needs_refund, p.refunded_at, p.refund_note,
      p.created_at, p.updated_at, i.number AS invoice_number, o.id AS order_id, o.reference AS order_ref, u.name AS client_name
    FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN orders o ON o.id = i.order_id LEFT JOIN users u ON u.id = p.user_id
    WHERE (? = '' OR p.status = ?) AND (? = '' OR p.gateway = ?) ORDER BY p.id DESC LIMIT 300`).all(status, status, gateway, gateway)));
});
r.get('/payments/:ref', (req, res) => {
  const p = findPayment(req.params.ref);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  res.json({ ...p, raw_notify: p.raw_notify ? JSON.parse(p.raw_notify) : null });
});
r.post('/payments/:ref/resolve', requireRole('admin'), body(z.object({
  status: z.enum(['complete', 'failed', 'cancelled']),
  note: z.string().trim().min(3, 'Add a reconciliation note').max(300),
})), (req, res) => {
  const p = findPayment(req.params.ref);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  const out = applyPaymentStatus(p, req.body.status, { message: `Manual: ${req.body.note}` });
  logEvent('payment.manual', `${req.user.name} manually set ${p.reference} to ${req.body.status}: ${req.body.note}`, { actor: req.user.id, ref: p.reference, level: 'warn' });
  res.json(out);
});

r.post('/payments/:ref/refunded', requireRole('admin'), body(z.object({ note: z.string().trim().min(3, 'Add the gateway refund reference').max(300) })), (req, res) => {
  const p = findPayment(req.params.ref);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  db.prepare("UPDATE payments SET refunded_at = datetime('now'), refund_note = ?, needs_refund = 0 WHERE id = ?").run(req.body.note, p.id);
  logEvent('payment.refunded', `${req.user.name} marked ${p.reference} refunded: ${req.body.note}`, { actor: req.user.id, ref: p.reference, level: 'warn' });
  res.json(findPayment(p.reference));
});

// Settings
r.get('/settings', (_req, res) => res.json(getSettings()));
const url = z.union([z.literal(''), webUrl()]);
r.put('/settings', requireRole('admin'), body(z.object({
  business_name: z.string().trim().min(2).max(80),
  legal_name: z.string().trim().max(120),
  tagline: z.string().trim().max(160),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30),
  whatsapp: z.string().trim().regex(/^\d{8,15}$/, 'Digits only, international format e.g. 27821234567'),
  address_locality: z.string().trim().max(80),
  address_region: z.string().trim().max(80),
  street_address: z.string().trim().max(160),
  postal_code: z.string().trim().max(10),
  company_reg_no: z.string().trim().max(40),
  vat_no: z.string().trim().max(20),
  vat_registered: z.boolean(),
  vat_rate: z.number().min(0).max(30),
  office_hours: z.string().trim().max(80),
  announcement: z.string().trim().max(160),
  orders_enabled: z.boolean(),
  payfast_enabled: z.boolean(),
  ozow_enabled: z.boolean(),
  social: z.object({ facebook: url, instagram: url, linkedin: url, x: url, tiktok: url, youtube: url }),
  website: webUrl(),
  notify_email: z.string().trim().email(),
  billing_email: z.string().trim().email(),
  emails_enabled: z.boolean(),
  seo_default_description: z.string().trim().min(50).max(300),
}).partial()), (req, res) => {
  const before = getSettings();
  const out = updateSettings(req.body);
  const changed = Object.keys(req.body).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(out[k]));
  if (changed.length) logEvent('settings.updated', `Settings changed: ${changed.join(', ')}`, { actor: req.user.id, level: 'warn' });
  res.json(out);
});
r.get('/settings/defaults', (_req, res) => res.json(DEFAULT_SETTINGS));

// Background jobs
r.get('/jobs', (_req, res) => res.json(listJobs()));
r.post('/jobs/:id/run', requireRole('admin'), async (req, res) => {
  try { await runJob(req.params.id, { manual: true, actor: req.user.id }); res.json(listJobs().find((j) => j.id === req.params.id)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});
r.patch('/jobs/:id', requireRole('admin'), body(z.object({ enabled: z.boolean() })), (req, res) => {
  try { setJobEnabled(req.params.id, req.body.enabled); } catch (e) { return res.status(404).json({ error: e.message }); }
  logEvent('job.toggled', `Job ${req.params.id} ${req.body.enabled ? 'enabled' : 'disabled'}`, { actor: req.user.id, level: 'warn' });
  res.json(listJobs().find((j) => j.id === req.params.id));
});

// Services on/off and copy
r.patch('/services/:id', requireRole('admin'), body(z.object({
  is_active: z.boolean().optional(),
  tagline: z.string().trim().min(10).max(160).optional(),
  description: z.string().trim().min(30).max(800).optional(),
})), (req, res) => {
  const s = row(db.prepare('SELECT * FROM services WHERE id = ?').get(id(req.params.id)));
  if (!s) return res.status(404).json({ error: 'Service not found' });
  const b = { ...s, ...req.body, is_active: req.body.is_active ?? !!s.is_active };
  const out = row(db.prepare('UPDATE services SET is_active = ?, tagline = ?, description = ? WHERE id = ? RETURNING *')
    .get(b.is_active ? 1 : 0, b.tagline, b.description, s.id));
  logEvent('catalog.service', `${s.name} ${req.body.is_active === undefined ? 'updated' : req.body.is_active ? 'activated' : 'deactivated'}`, { actor: req.user.id });
  res.json(out);
});
r.get('/services', (_req, res) => res.json(rows(db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM service_tiers st JOIN orders o ON o.tier_id = st.id
  WHERE st.service_id = s.id) AS order_count FROM services s ORDER BY sort_order`).all(), ['outcomes'])));

// Blog
const postSchema = z.object({
  title: z.string().trim().min(5).max(140),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only').max(100),
  excerpt: z.string().trim().min(20).max(300),
  body: z.string().trim().min(50),
  category: z.string().trim().min(2).max(40),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  cover_emoji: z.string().trim().min(1).max(8).default('📝'),
  author: z.string().trim().min(2).max(80).default('Hipcastle Team'),
  meta_title: z.string().trim().max(70).optional().default(''),
  meta_description: z.string().trim().max(170).optional().default(''),
  status: z.enum(['draft', 'published']),
  published_at: z.string().trim().optional().default(''),
});
r.get('/posts', (_req, res) => res.json(rows(db.prepare(`SELECT id, slug, title, category, status, published_at, updated_at, views, author
  FROM posts ORDER BY COALESCE(published_at, updated_at) DESC`).all())));
r.get('/posts/:id', (req, res) => {
  const p = row(db.prepare('SELECT * FROM posts WHERE id = ?').get(id(req.params.id)), ['tags']);
  return p ? res.json(p) : res.status(404).json({ error: 'Post not found' });
});
function savePost(req, res, existing) {
  const b = req.body;
  const clash = db.prepare('SELECT id FROM posts WHERE slug = ? AND id <> ?').get(b.slug, existing?.id ?? 0);
  if (clash) return res.status(409).json({ error: 'Another post already uses this slug', fields: { slug: 'Slug already in use' } });
  const publishedAt = b.status === 'published' ? (b.published_at || existing?.published_at || null) : (existing?.published_at || null);
  const args = [b.slug, b.title, b.excerpt, b.body, b.category, JSON.stringify(b.tags), b.cover_emoji, b.author, b.meta_title || null, b.meta_description || null, b.status];
  const p = existing
    ? row(db.prepare(`UPDATE posts SET slug=?, title=?, excerpt=?, body=?, category=?, tags=?, cover_emoji=?, author=?, meta_title=?, meta_description=?, status=?,
        published_at = COALESCE(?, CASE WHEN ? = 'published' THEN datetime('now') END), updated_at = datetime('now') WHERE id = ? RETURNING *`)
      .get(...args, publishedAt, b.status, existing.id), ['tags'])
    : row(db.prepare(`INSERT INTO posts (slug, title, excerpt, body, category, tags, cover_emoji, author, meta_title, meta_description, status, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CASE WHEN ? = 'published' THEN datetime('now') END)) RETURNING *`)
      .get(...args, publishedAt, b.status), ['tags']);
  logEvent(`post.${existing ? 'updated' : 'created'}`, `Article “${p.title}” ${existing ? 'updated' : 'created'} (${p.status})`, { actor: req.user.id, ref: p.slug });
  res.status(existing ? 200 : 201).json(p);
}
r.post('/posts', body(postSchema), (req, res) => savePost(req, res, null));
r.put('/posts/:id', body(postSchema), (req, res) => {
  const existing = row(db.prepare('SELECT * FROM posts WHERE id = ?').get(id(req.params.id)));
  if (!existing) return res.status(404).json({ error: 'Post not found' });
  savePost(req, res, existing);
});
r.delete('/posts/:id', requireRole('admin'), (req, res) => {
  const p = row(db.prepare('DELETE FROM posts WHERE id = ? RETURNING title').get(id(req.params.id)));
  if (!p) return res.status(404).json({ error: 'Post not found' });
  logEvent('post.deleted', `Article “${p.title}” deleted`, { actor: req.user.id, level: 'warn' });
  res.json({ ok: true });
});

// Testimonials moderation
r.get('/testimonials', (req, res) => {
  const status = req.query.status || '';
  res.json(rows(db.prepare(`SELECT t.*, s.name AS service_name FROM testimonials t LEFT JOIN services s ON s.id = t.service_id
    WHERE (? = '' OR t.status = ?) ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END, t.id DESC`).all(status, status)));
});
r.patch('/testimonials/:id', body(z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  is_featured: z.boolean().optional(),
})), (req, res) => {
  const t = row(db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id(req.params.id)));
  if (!t) return res.status(404).json({ error: 'Testimonial not found' });
  const out = row(db.prepare('UPDATE testimonials SET status = ?, is_featured = ? WHERE id = ? RETURNING *')
    .get(req.body.status ?? t.status, (req.body.is_featured ?? !!t.is_featured) ? 1 : 0, t.id));
  logEvent('testimonial.moderated', `Review by ${t.author}: ${out.status}${out.is_featured ? ' (featured)' : ''}`, { actor: req.user.id, ref: String(t.id) });
  if (t.status !== 'approved' && out.status === 'approved') onTestimonialApproved(out);
  res.json(out);
});
r.delete('/testimonials/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM testimonials WHERE id = ?').run(id(req.params.id));
  return info.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Testimonial not found' });
});

// Newsletter subscribers
r.get('/subscribers', (_req, res) => res.json(rows(db.prepare('SELECT * FROM newsletter_subscribers ORDER BY id DESC').all())));
r.delete('/subscribers/:id', (req, res) => {
  const info = db.prepare('DELETE FROM newsletter_subscribers WHERE id = ?').run(id(req.params.id));
  return info.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Subscriber not found' });
});

// CSV exports
const EXPORTS = {
  leads: `SELECT l.id, l.created_at, l.name, l.email, l.phone, l.company, l.province, s.name AS service, l.budget, l.preferred_contact, l.status, l.message
    FROM leads l LEFT JOIN services s ON s.id = l.service_id ORDER BY l.id DESC`,
  subscribers: "SELECT id, email, confirmed_at, created_at FROM newsletter_subscribers WHERE status = 'active' ORDER BY id DESC",
  invoices: `SELECT i.number, i.issued_at, i.due_at, i.paid_at, i.status, u.name AS client, u.company, o.reference AS engagement,
    ROUND(i.subtotal_cents / 100.0, 2) AS subtotal_zar, ROUND(i.vat_cents / 100.0, 2) AS vat_zar, ROUND(i.amount_cents / 100.0, 2) AS total_zar
    FROM invoices i JOIN orders o ON o.id = i.order_id JOIN users u ON u.id = o.user_id ORDER BY i.id DESC`,
  payments: `SELECT p.reference, p.created_at, p.updated_at, p.gateway, p.status, p.gateway_txn_id, i.number AS invoice, ROUND(p.amount_cents / 100.0, 2) AS amount_zar, p.is_test
    FROM payments p JOIN invoices i ON i.id = p.invoice_id ORDER BY p.id DESC`,
  clients: `SELECT id, name, email, company, phone, role, created_at FROM users ORDER BY id DESC`,
};
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
r.get('/export/:kind', requireRole('admin'), (req, res) => {
  const sql = EXPORTS[req.params.kind];
  if (!sql) return res.status(404).json({ error: 'Unknown export' });
  const data = rows(db.prepare(sql).all());
  const cols = data.length ? Object.keys(data[0]) : [];
  const csv = [cols.join(','), ...data.map((d) => cols.map((c) => csvCell(d[c])).join(','))].join('\n');
  logEvent('data.export', `${req.params.kind} exported (${data.length} rows)`, { actor: req.user.id });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="hipcastle-${req.params.kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
});

// Delivery pipelines
r.get('/pipeline', (_req, res) => res.json({ ...P.boardData(), stages: STAGES }));
r.get('/playbooks', (_req, res) => {
  const services = rows(db.prepare('SELECT id, slug, name, icon FROM services ORDER BY sort_order').all());
  res.json(services.map((s) => {
    const tiers = rows(db.prepare(`SELECT tier, name, billing, delivery_days FROM service_tiers WHERE service_id = ?
      ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(s.id));
    const agents = Object.fromEntries(rows(db.prepare('SELECT slug, name, emoji FROM agents').all()).map((a) => [a.slug, a]));
    return {
      ...s, summary: PLAYBOOKS[s.slug]?.summary,
      tiers: tiers.map((t) => {
        const plan = buildPlan(s.slug, t.tier, t.billing, t.delivery_days);
        return { ...t, kind: plan.kind, revisions: REVISIONS[t.tier] ?? null, intake: plan.intake, checklist: plan.checklist,
          milestones: plan.milestones.map((m) => ({ stage: m.stage, title: m.title, days: m.days, approval: !!m.approval, client: !!m.client,
            deliverable: m.deliverable || null, agent: m.agent ? agents[m.agent] || { slug: m.agent, name: m.agent } : null })) };
      }),
    };
  }));
});

// Emails
r.get('/emails', (req, res) => {
  const { status = '', q = '' } = req.query;
  res.json(rows(db.prepare(`SELECT id, template, to_email, to_name, subject, status, attempts, last_error, ref, created_at, sent_at, next_attempt_at
    FROM emails WHERE (? = '' OR status = ?) AND (? = '' OR to_email LIKE ? OR subject LIKE ?) ORDER BY id DESC LIMIT 300`)
    .all(status, status, q, `%${q}%`, `%${q}%`)));
});
r.get('/emails/status', (_req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    config: emailConfig(),
    settings: (({ email, notify_email, billing_email, emails_enabled }) => ({ email, notify_email, billing_email, emails_enabled }))(getSettings()),
    stats: {
      sent_24h: count("SELECT COUNT(*) n FROM emails WHERE status = 'sent' AND sent_at > datetime('now','-1 day')"),
      logged_24h: count("SELECT COUNT(*) n FROM emails WHERE status = 'logged' AND created_at > datetime('now','-1 day')"),
      queued: count("SELECT COUNT(*) n FROM emails WHERE status = 'queued'"),
      failed_7d: count("SELECT COUNT(*) n FROM emails WHERE status = 'failed' AND created_at > datetime('now','-7 days')"),
    },
    templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, audience: t.audience, description: t.description })),
  });
});
r.get('/emails/:id', (req, res) => {
  const e = row(db.prepare('SELECT * FROM emails WHERE id = ?').get(id(req.params.id)));
  return e ? res.json(e) : res.status(404).json({ error: 'Email not found' });
});
r.post('/emails/:id/retry', requireRole('admin'), async (req, res) => {
  const e = retryEmail(id(req.params.id));
  if (!e) return res.status(404).json({ error: 'Email not found' });
  await processQueue();
  logEvent('email.resent', `Email #${e.id} re-queued`, { actor: req.user.id });
  res.json(row(db.prepare('SELECT id, status, last_error FROM emails WHERE id = ?').get(e.id)));
});
r.post('/emails/verify', requireRole('admin'), async (_req, res) => res.json(await verifyTransport()));
r.post('/emails/test', requireRole('admin'), body(z.object({ to: z.string().trim().email() })), async (req, res) => {
  const eid = sendEmail('system.test', req.body.to, {}, { team: true });
  await processQueue();
  logEvent('email.test', `Test email sent to ${req.body.to}`, { actor: req.user.id });
  res.json(row(db.prepare('SELECT id, status, last_error FROM emails WHERE id = ?').get(eid)));
});
r.get('/email-templates/:tpl/preview', (req, res) => {
  const tpl = TEMPLATES[req.params.tpl];
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  const out = renderTemplate(req.params.tpl, { ...tpl.sample, to: 'preview@example.com' });
  res.json({ subject: out.subject, preheader: out.preheader, html: out.html, text: out.text });
});

// SEO health
r.get('/seo', (_req, res) => res.json(seoAudit()));

export default r;
