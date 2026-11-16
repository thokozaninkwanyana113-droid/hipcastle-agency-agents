import { careOfferFor, careUsage, supportEndsAt } from '../careops.js';
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, row, rows, tx } from '../db.js';
import { body, id, webUrl, z } from '../validate.js';
import { authenticate, isStaff, requireRole } from '../auth.js';
import { logEvent } from '../events.js';
import { getSettings, vatFor } from '../settings.js';
import { onInvoiceIssued, onMessage, onOrderCreated, onOrderStatus } from '../email/notify.js';
import * as P from '../pipeline.js';

const r = Router();
r.use(authenticate);

const ref = (prefix) => `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;

const ORDER_SELECT = `
  SELECT o.*, st.tier, st.plan, st.name AS tier_name, st.billing, st.delivery_days, st.care_minutes, st.support_priority,
         c.reference AS covers_reference,
         s.slug AS service_slug, s.name AS service_name, s.icon AS service_icon,
         u.name AS client_name, u.email AS client_email, u.company AS client_company,
         m.name AS manager_name
  FROM orders o
  JOIN service_tiers st ON st.id = o.tier_id
  JOIN services s ON s.id = st.service_id
  JOIN users u ON u.id = o.user_id
  LEFT JOIN users m ON m.id = o.assigned_to
  LEFT JOIN orders c ON c.id = o.covers_order_id`;

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
  covers_order_id: z.number().int().positive().nullable().optional(),
})), (req, res) => {
  const settings = getSettings();
  if (!settings.orders_enabled) return res.status(503).json({ error: 'We are not taking new online orders right now — please contact us.' });
  const tier = row(db.prepare(`SELECT st.*, s.name AS service_name FROM service_tiers st JOIN services s ON s.id = st.service_id
    WHERE st.id = ? AND s.is_active = 1`).get(req.body.tier_id));
  if (!tier) return res.status(404).json({ error: 'Service tier not found' });
  // Care plans can be linked to the delivered project they look after (must be the client's, same service).
  let covers = null;
  if (req.body.covers_order_id) {
    if (tier.plan !== 'care') return res.status(400).json({ error: 'Only care plans can cover another engagement' });
    covers = db.prepare(`SELECT o.id FROM orders o JOIN service_tiers st ON st.id = o.tier_id
      WHERE o.id = ? AND o.user_id = ? AND st.service_id = ? AND st.plan = 'core'`).get(req.body.covers_order_id, req.user.id, tier.service_id)?.id;
    if (!covers) return res.status(400).json({ error: 'That engagement is not on your account' });
  }

  const order = tx(() => {
    const o = row(db.prepare(`INSERT INTO orders (reference, user_id, tier_id, brief, price_cents, due_date, covers_order_id)
      VALUES (?, ?, ?, ?, ?, date('now', ?), ?) RETURNING *`)
      .get(ref('HC'), req.user.id, tier.id, req.body.brief, tier.price_cents, `+${tier.delivery_days} days`, covers));
    P.instantiatePipeline(o.id);
    // Projects: 50% deposit up front. Retainers: first month up front.
    const subtotal = tier.billing === 'once' ? Math.round(tier.price_cents / 2) : tier.price_cents;
    const vat = vatFor(subtotal, settings);
    db.prepare(`INSERT INTO invoices (number, order_id, subtotal_cents, vat_cents, amount_cents, description, due_at)
      VALUES (?, ?, ?, ?, ?, ?, date('now', '+7 days'))`)
      .run(ref('INV'), o.id, subtotal, vat, subtotal + vat, tier.billing === 'once' ? 'Deposit (50%)' : tier.plan === 'care' ? 'Care plan — first month (in advance)' : 'First month (in advance)');
    return o;
  });
  logEvent('order.created', `${req.user.name} ordered ${tier.service_name} — ${tier.name} (${order.reference})`, { actor: req.user.id, ref: order.reference });
  onOrderCreated(order.id);
  res.status(201).json(order);
});

r.get('/', (req, res) => {
  const staff = isStaff(req.user);
  const status = req.query.status || '';
  const list = rows(db.prepare(`${ORDER_SELECT}
    WHERE (? = 1 OR o.user_id = ?) AND (? = '' OR o.status = ?)
    ORDER BY o.created_at DESC, o.id DESC`).all(staff ? 1 : 0, req.user.id, status, status));
  res.json(list.map((o) => ({ ...o, pipeline: P.pipelineSummary(o) })));
});

r.get('/:id', (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  o.milestones = P.milestonesOf(o.id);
  o.onboarding = P.onboardingOf(o.id);
  o.pipeline = P.pipelineSummary(o, o.milestones, o.onboarding);
  o.invoices = rows(db.prepare('SELECT * FROM invoices WHERE order_id = ? ORDER BY issued_at, id').all(o.id));
  o.payments = rows(db.prepare(`SELECT p.reference, p.gateway, p.status, p.amount_cents, p.status_message, p.created_at, i.number AS invoice_number
    FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.order_id = ? ORDER BY p.created_at DESC, p.id DESC`).all(o.id));
  o.messages = rows(db.prepare(`SELECT m.*, u.name AS author_name, u.role AS author_role
    FROM messages m JOIN users u ON u.id = m.author_id WHERE m.order_id = ? ORDER BY m.created_at, m.id`).all(o.id));
  if (o.plan === 'care') o.care_usage = careUsage(o.id);
  else { o.care_offer = careOfferFor(o); o.support_ends_at = supportEndsAt(o); }
  res.json(o);
});

r.post('/:id/messages', body(z.object({ body: z.string().trim().min(1).max(5000) })), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  const m = row(db.prepare(`INSERT INTO messages (order_id, author_id, body) VALUES (?, ?, ?) RETURNING *`)
    .get(o.id, req.user.id, req.body.body));
  onMessage(o.id, req.user, req.body.body);
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
  logEvent('order.cancelled', `${o.reference} cancelled by ${req.user.name}`, { actor: req.user.id, ref: o.reference });
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
  if (b.status && b.status !== o.status) logEvent('order.status', `${o.reference}: ${o.status} → ${b.status}`, { actor: req.user.id, ref: o.reference });
  db.prepare(`UPDATE orders SET status = ?, progress = ?, assigned_to = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(b.status ?? o.status, progress, b.assigned_to !== undefined ? b.assigned_to : o.assigned_to,
      b.due_date !== undefined ? b.due_date : o.due_date, o.id);
  // A project marked completed by hand counts as delivered: starts its free-support window (and care offer).
  if (b.status === 'completed') db.prepare("UPDATE orders SET delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?").run(o.id);
  if (b.status && b.status !== o.status) onOrderStatus(o.id, b.status);
  res.json(row(db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(o.id)));
});

// ---- Delivery pipeline ----------------------------------------------------------------
const loadMilestone = (req, res, o) => {
  const m = P.getMilestone(o.id, id(req.params.mid));
  if (!m) res.status(404).json({ error: 'Milestone not found' });
  return m;
};
const isOwner = (req, o) => o.user_id === req.user.id;
const detail = (o) => ({ milestones: P.milestonesOf(o.id), onboarding: P.onboardingOf(o.id), pipeline: P.pipelineSummary(P.loadOrder(o.id)), order: P.loadOrder(o.id) });

// Client (or staff on their behalf) answers onboarding questions / confirms checklist items.
r.post('/:id/onboarding', body(z.object({
  responses: z.array(z.object({ key: z.string().max(60), response: z.string().max(4000) })).min(1).max(40),
})), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  if (o.status === 'cancelled') return res.status(409).json({ error: 'This engagement is cancelled' });
  const out = P.saveOnboarding(o.id, req.body.responses, req.user);
  res.json({ ...detail(o), onboarding_complete: out.complete });
});

r.patch('/:id/onboarding/:itemId', requireRole('admin', 'staff'), body(z.object({
  status: z.enum(['pending', 'done']).optional(),
  response: z.string().max(4000).optional(),
})), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  P.setOnboardingItem(o.id, id(req.params.itemId), req.body);
  res.json(detail(o));
});

r.post('/:id/milestones/:mid/start', requireRole('admin', 'staff'), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  const m = loadMilestone(req, res, o); if (!m) return;
  if (m.status === 'done') return res.status(409).json({ error: 'Milestone is already done' });
  P.startMilestone(m);
  res.json(detail(o));
});

r.post('/:id/milestones/:mid/submit', requireRole('admin', 'staff'), body(z.object({
  url: z.union([z.literal(''), webUrl()]).optional().default(''),
  note: z.string().trim().max(3000).optional().default(''),
})), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  const m = loadMilestone(req, res, o); if (!m) return;
  if (m.status === 'done') return res.status(409).json({ error: 'Milestone is already done' });
  if (o.status === 'pending') return res.status(409).json({ error: 'Work starts once the deposit is paid' });
  P.submitMilestone(m, req.body, req.user);
  res.json(detail(o));
});

r.post('/:id/milestones/:mid/complete', requireRole('admin', 'staff'), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  const m = loadMilestone(req, res, o); if (!m) return;
  if (m.status !== 'done') P.completeMilestone(m.id, req.user);
  res.json(detail(o));
});

r.post('/:id/milestones/:mid/approve', (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  if (!isOwner(req, o)) return res.status(403).json({ error: 'Only the client can approve deliverables' });
  const m = loadMilestone(req, res, o); if (!m) return;
  if (m.status !== 'awaiting_client') return res.status(409).json({ error: 'This milestone is not waiting for your approval' });
  P.approveMilestone(m, req.user);
  res.json(detail(o));
});

r.post('/:id/milestones/:mid/changes', body(z.object({
  feedback: z.string().trim().min(10, 'Please describe the changes you need (at least 10 characters)').max(3000),
})), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  if (!isOwner(req, o)) return res.status(403).json({ error: 'Only the client can request changes' });
  const m = loadMilestone(req, res, o); if (!m) return;
  if (m.status !== 'awaiting_client') return res.status(409).json({ error: 'This milestone is not waiting for your approval' });
  try { P.requestChanges(m, req.body.feedback, req.user); }
  catch (e) { if (e instanceof P.RevisionLimitError) return res.status(409).json({ error: e.message, code: 'revision_limit' }); throw e; }
  res.json(detail(o));
});

r.patch('/:id/milestones/:mid', requireRole('admin', 'staff'), body(z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['todo', 'in_progress', 'blocked']).optional(),
  agent_slug: z.string().max(80).optional(),
  is_done: z.boolean().optional(),          // backwards compatible toggle
})), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  const m = loadMilestone(req, res, o); if (!m) return;
  const { is_done, ...rest } = req.body;
  if (is_done === true && m.status !== 'done') P.completeMilestone(m.id, req.user);
  else if (is_done === false && m.status === 'done') {
    db.prepare("UPDATE milestones SET status = 'todo', is_done = 0, done_at = NULL WHERE id = ?").run(m.id);
    P.syncOrder(o.id);
  }
  if (Object.keys(rest).length) P.updateMilestone(P.getMilestone(o.id, m.id), rest);
  const d = detail(o);
  res.json({ ok: true, progress: d.order.progress, ...d });
});

r.post('/:id/rebaseline', requireRole('admin', 'staff'), body(z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  P.rebaseline(o.id, req.body.from || P.today());
  logEvent('pipeline.rebaseline', `${o.reference}: timeline re-planned from ${req.body.from || P.today()}`, { actor: req.user.id, ref: o.reference });
  res.json(detail(o));
});

r.post('/:id/next-cycle', requireRole('admin', 'staff'), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  const out = P.startNextCycle(o.id, req.user);
  if (!out) return res.status(409).json({ error: 'Only active retainers can start a new month' });
  res.json({ ...detail(o), started: out });
});

r.post('/:id/feedback', body(z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().trim().max(2000).optional().default(''),
})), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  if (!isOwner(req, o)) return res.status(403).json({ error: 'Only the client can rate an engagement' });
  if (!['completed'].includes(o.status) && o.pipeline_kind === 'project') return res.status(409).json({ error: 'You can rate the project once it is delivered' });
  P.saveFeedback(o.id, req.body.score, req.body.comment);
  res.json(detail(o));
});

r.post('/:id/invoices', requireRole('admin', 'staff'), body(z.object({
  amount_cents: z.number().int().positive(),            // excl. VAT
  description: z.string().trim().max(200).optional().default(''),
  due_in_days: z.number().int().min(0).max(120).default(14),
})), (req, res) => {
  const o = loadOrder(req, res);
  if (!o) return;
  const vat = vatFor(req.body.amount_cents);
  const inv = row(db.prepare(`INSERT INTO invoices (number, order_id, subtotal_cents, vat_cents, amount_cents, description, due_at)
    VALUES (?, ?, ?, ?, ?, ?, date('now', ?)) RETURNING *`)
    .get(ref('INV'), o.id, req.body.amount_cents, vat, req.body.amount_cents + vat, req.body.description || null, `+${req.body.due_in_days} days`));
  logEvent('invoice.issued', `${inv.number} issued on ${o.reference}`, { actor: req.user.id, ref: inv.number });
  onInvoiceIssued(inv.id);
  res.status(201).json(inv);
});

export default r;
