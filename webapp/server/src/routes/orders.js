import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, row, rows, tx } from '../db.js';
import { body, id, z } from '../validate.js';
import { authenticate, isStaff, requireRole } from '../auth.js';

const r = Router();
r.use(authenticate);

const MILESTONES = {
  essential: ['Kick-off & brief confirmation', 'Delivery', 'Review & handover'],
  growth: ['Kick-off & discovery', 'Strategy & design', 'Build / execution', 'Quality review', 'Launch & handover'],
  enterprise: ['Onboarding & access', 'Team assembly', 'Roadmap & KPIs', 'First delivery cycle', 'Monthly review'],
};

const ref = (prefix) => `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;

const ORDER_SELECT = `
  SELECT o.*, st.tier, st.name AS tier_name, st.billing, st.delivery_days,
         s.slug AS service_slug, s.name AS service_name, s.icon AS service_icon,
         u.name AS client_name, u.email AS client_email, u.company AS client_company,
         m.name AS manager_name
  FROM orders o
  JOIN service_tiers st ON st.id = o.tier_id
  JOIN services s ON s.id = st.service_id
  JOIN users u ON u.id = o.user_id
  LEFT JOIN users m ON m.id = o.assigned_to`;

/** Load an order the current user may see, or send 404. */
function loadOrder(req, res) {
  const oid = id(req.params.id);
  const o = oid && row(db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(oid));
  if (!o || (!isStaff(req.user) && o.user_id !== req.user.id)) {
    res.status(404).json({ error: 'Engagement not found' });
    return null;
  }
  return o;
}

r.post('/', body(z.object({
  tier_id: z.number().int().positive(),
  brief: z.string().trim().min(20, 'Please describe your project in at least 20 characters').max(5000),
})), (req, res) => {
  const tier = row(db.prepare('SELECT * FROM service_tiers WHERE id = ?').get(req.body.tier_id));
  if (!tier) return res.status(404).json({ error: 'Service tier not found' });

  const order = tx(() => {
    const o = row(db.prepare(`INSERT INTO orders (reference, user_id, tier_id, brief, price_cents, due_date)
      VALUES (?, ?, ?, ?, ?, date('now', ?)) RETURNING *`)
      .get(ref('HC'), req.user.id, tier.id, req.body.brief, tier.price_cents, `+${tier.delivery_days} days`));
    const ms = db.prepare('INSERT INTO milestones (order_id, title, position) VALUES (?, ?, ?)');
    MILESTONES[tier.tier].forEach((t, i) => ms.run(o.id, t, i));
    // Projects: 50% deposit up front. Retainers: first month up front.
    const amount = tier.billing === 'once' ? Math.round(tier.price_cents / 2) : tier.price_cents;
    db.prepare(`INSERT INTO invoices (number, order_id, amount_cents, due_at) VALUES (?, ?, ?, date('now', '+7 days'))`)
      .run(ref('INV'), o.id, amount);
    return o;
  });
  res.status(201).json(order);
});

r.get('/', (req, res) => {
  const staff = isStaff(req.user);
  const status = req.query.status || '';
  const list = rows(db.prepare(`${ORDER_SELECT}
    WHERE (? = 1 OR o.user_id = ?) AND (? = '' OR o.status = ?)
    ORDER BY o.created_at DESC, o.id DESC`).all(staff ? 1 : 0, req.user.id, status, status));
  res.json(list);
});

r.get('/:id', (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  o.milestones = rows(db.prepare('SELECT * FROM milestones WHERE order_id = ? ORDER BY position').all(o.id));
  o.invoices = rows(db.prepare('SELECT * FROM invoices WHERE order_id = ? ORDER BY issued_at, id').all(o.id));
  o.messages = rows(db.prepare(`SELECT m.*, u.name AS author_name, u.role AS author_role
    FROM messages m JOIN users u ON u.id = m.author_id WHERE m.order_id = ? ORDER BY m.created_at, m.id`).all(o.id));
  res.json(o);
});

r.post('/:id/messages', body(z.object({ body: z.string().trim().min(1).max(5000) })), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  const m = row(db.prepare(`INSERT INTO messages (order_id, author_id, body) VALUES (?, ?, ?) RETURNING *`)
    .get(o.id, req.user.id, req.body.body));
  res.status(201).json({ ...m, author_name: req.user.name, author_role: req.user.role });
});

r.post('/:id/cancel', (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  if (o.status !== 'pending') return res.status(409).json({ error: 'Only pending engagements can be cancelled' });
  tx(() => {
    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(o.id);
    db.prepare("UPDATE invoices SET status = 'void' WHERE order_id = ? AND status = 'unpaid'").run(o.id);
  });
  res.json({ ok: true });
});

// Simulated checkout. Swap for Stripe/PayFast/Paystack in production.
r.post('/:id/invoices/:invoiceId/pay', (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  const inv = row(db.prepare('SELECT * FROM invoices WHERE id = ? AND order_id = ?').get(id(req.params.invoiceId), o.id));
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (inv.status !== 'unpaid') return res.status(409).json({ error: `Invoice is already ${inv.status}` });
  tx(() => {
    db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(inv.id);
    if (o.status === 'pending') {
      db.prepare("UPDATE orders SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(o.id);
    }
  });
  res.json({ ok: true });
});

// ---- Staff operations ----
r.patch('/:id', requireRole('admin', 'staff'), body(z.object({
  status: z.enum(['pending', 'active', 'in_review', 'completed', 'cancelled']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  assigned_to: z.number().int().positive().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  const b = req.body;
  if (b.assigned_to && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role IN ('admin','staff')").get(b.assigned_to)) {
    return res.status(400).json({ error: 'Assignee must be a staff member' });
  }
  const progress = b.status === 'completed' ? 100 : (b.progress ?? o.progress);
  db.prepare(`UPDATE orders SET status = ?, progress = ?, assigned_to = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(b.status ?? o.status, progress, b.assigned_to !== undefined ? b.assigned_to : o.assigned_to,
      b.due_date !== undefined ? b.due_date : o.due_date, o.id);
  res.json(row(db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(o.id)));
});

r.patch('/:id/milestones/:mid', requireRole('admin', 'staff'), body(z.object({ is_done: z.boolean() })), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  const info = db.prepare(`UPDATE milestones SET is_done = ?, done_at = CASE WHEN ? THEN datetime('now') END
    WHERE id = ? AND order_id = ?`).run(req.body.is_done ? 1 : 0, req.body.is_done ? 1 : 0, id(req.params.mid), o.id);
  if (!info.changes) return res.status(404).json({ error: 'Milestone not found' });
  // Keep progress in sync with milestone completion.
  const { done, total } = db.prepare('SELECT SUM(is_done) done, COUNT(*) total FROM milestones WHERE order_id = ?').get(o.id);
  db.prepare("UPDATE orders SET progress = ?, updated_at = datetime('now') WHERE id = ?").run(Math.round((done / total) * 100), o.id);
  res.json({ ok: true, progress: Math.round((done / total) * 100) });
});

r.post('/:id/invoices', requireRole('admin', 'staff'), body(z.object({
  amount_cents: z.number().int().positive(),
  due_in_days: z.number().int().min(0).max(120).default(14),
})), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  const inv = row(db.prepare(`INSERT INTO invoices (number, order_id, amount_cents, due_at)
    VALUES (?, ?, ?, date('now', ?)) RETURNING *`).get(ref('INV'), o.id, req.body.amount_cents, `+${req.body.due_in_days} days`));
  res.status(201).json(inv);
});

export default r;
