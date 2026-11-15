import { Router } from 'express';
import { db, row, rows } from '../db.js';
import { body, id, z } from '../validate.js';
import { authenticate, publicUser, requireRole } from '../auth.js';

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
r.patch('/invoices/:id', body(z.object({ status: z.enum(['unpaid', 'paid', 'void']) })), (req, res) => {
  const s = req.body.status;
  const inv = row(db.prepare(`UPDATE invoices SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') END
    WHERE id = ? RETURNING *`).get(s, s, id(req.params.id)));
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
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
  res.json(out);
});

r.get('/staff', (_req, res) =>
  res.json(rows(db.prepare("SELECT id, name, email, role FROM users WHERE role IN ('admin','staff') ORDER BY name").all())));

export default r;
