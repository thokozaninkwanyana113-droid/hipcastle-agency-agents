// Client support desk: tickets with first-response SLAs, threaded replies, internal notes and CSAT.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, row, rows, tx } from '../db.js';
import { body, id, z } from '../validate.js';
import { authenticate, isStaff, requireRole } from '../auth.js';
import { logEvent } from '../events.js';
import * as mail from '../email/support-notify.js';
import { carePriorityFor, careUsage, logCareTime } from '../careops.js';
import { guardFields } from '../guard.js';

const r = Router();
r.use(authenticate);

/** First-response targets (hours) by priority. */
export const SLA_HOURS = { urgent: 4, high: 24, normal: 48, low: 72 };

const SELECT = `SELECT t.*, u.name AS client_name, u.email AS client_email, u.company AS client_company,
    a.name AS assignee_name, o.reference AS order_ref, co.reference AS care_ref, cst.name AS care_tier_name,
    (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id AND m.internal = 0) AS message_count,
    (SELECT MAX(created_at) FROM ticket_messages m WHERE m.ticket_id = t.id AND m.internal = 0) AS last_message_at,
    CASE WHEN t.first_response_at IS NULL AND t.status IN ('open') AND t.sla_due_at < datetime('now') THEN 1 ELSE 0 END AS sla_breached
  FROM tickets t JOIN users u ON u.id = t.user_id LEFT JOIN users a ON a.id = t.assigned_to LEFT JOIN orders o ON o.id = t.order_id
  LEFT JOIN orders co ON co.id = t.care_order_id LEFT JOIN service_tiers cst ON cst.id = co.tier_id`;

function load(req, res) {
  const tid = id(req.params.id);
  const t = tid && row(db.prepare(`${SELECT} WHERE t.id = ?`).get(tid));
  if (!t || (!isStaff(req.user) && t.user_id !== req.user.id)) {
    res.status(404).json({ error: 'Ticket not found' });
    return null;
  }
  return t;
}
const detail = (t, staff) => ({
  ...row(db.prepare(`${SELECT} WHERE t.id = ?`).get(t.id)),
  ...(t.care_order_id && { care_usage: staff ? careUsage(t.care_order_id) : (({ entries, ...u }) => u)(careUsage(t.care_order_id) || {}) }),
  messages: rows(db.prepare(`SELECT m.*, u.name AS author_name, u.role AS author_role FROM ticket_messages m JOIN users u ON u.id = m.author_id
    WHERE m.ticket_id = ? AND (? = 1 OR m.internal = 0) ORDER BY m.id`).all(t.id, staff ? 1 : 0)),
});

r.get('/', (req, res) => {
  const staff = isStaff(req.user);
  const { status = '', mine = '' } = req.query;
  res.json(rows(db.prepare(`${SELECT} WHERE (? = 1 OR t.user_id = ?) AND (? = '' OR t.status = ?) AND (? = '' OR t.assigned_to = ?)
    ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'pending_client' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.sla_due_at`)
    .all(staff ? 1 : 0, req.user.id, status, status, mine ? '1' : '', mine ? req.user.id : 0)));
});

r.post('/', body(z.object({
  subject: z.string().trim().min(5, 'Add a short subject').max(140),
  category: z.enum(['project', 'billing', 'technical', 'account', 'other']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  order_id: z.number().int().positive().nullable().optional(),
  body: z.string().trim().min(10, 'Describe the issue (at least 10 characters)').max(5000),
})), guardFields('subject', 'body'), (req, res) => {
  const b = req.body;
  if (b.order_id && !db.prepare('SELECT 1 FROM orders WHERE id = ? AND (user_id = ? OR ? = 1)').get(b.order_id, req.user.id, isStaff(req.user) ? 1 : 0)) {
    return res.status(400).json({ error: 'That engagement is not on your account' });
  }
  // Care-plan clients get their plan's (faster) response target.
  const care = carePriorityFor(req.user.id, b.priority, b.order_id || null);
  const t = tx(() => {
    const created = row(db.prepare(`INSERT INTO tickets (reference, user_id, order_id, subject, category, priority, sla_due_at, care_order_id)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), ?) RETURNING *`)
      .get(`TCK-${randomBytes(3).toString('hex').toUpperCase()}`, req.user.id, b.order_id || null, b.subject, b.category, care.priority,
        `+${SLA_HOURS[care.priority]} hours`, care.care_order_id));
    db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES (?, ?, ?)').run(created.id, req.user.id, b.body);
    return created;
  });
  logEvent('support.created', `${t.reference} (${t.priority}) from ${req.user.name}: ${t.subject}`, { actor: req.user.id, ref: t.reference, level: t.priority === 'urgent' ? 'warn' : 'info' });
  mail.ticketCreated(t.id);
  res.status(201).json(detail(t, isStaff(req.user)));
});

r.get('/:id', (req, res) => {
  const t = load(req, res);
  if (t) res.json(detail(t, isStaff(req.user)));
});

r.post('/:id/messages', body(z.object({
  body: z.string().trim().min(1).max(5000),
  internal: z.boolean().optional().default(false),
})), guardFields('body'), (req, res) => {
  const t = load(req, res);
  if (!t) return;
  const staff = isStaff(req.user);
  const internal = staff && req.body.internal;
  if (t.status === 'closed') return res.status(409).json({ error: 'This ticket is closed — please open a new one.' });
  tx(() => {
    db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, body, internal) VALUES (?, ?, ?, ?)').run(t.id, req.user.id, req.body.body, internal ? 1 : 0);
    if (internal) return;
    if (staff) {
      db.prepare(`UPDATE tickets SET status = 'pending_client', first_response_at = COALESCE(first_response_at, datetime('now')),
        assigned_to = COALESCE(assigned_to, ?), updated_at = datetime('now') WHERE id = ?`).run(req.user.id, t.id);
    } else {
      db.prepare("UPDATE tickets SET status = 'open', resolved_at = NULL, updated_at = datetime('now') WHERE id = ?").run(t.id);
    }
  });
  if (!internal) mail.ticketReply(t.id, req.user, req.body.body);
  res.status(201).json(detail(t, staff));
});

// Client or staff marks the ticket resolved; the client is asked to rate the help.
r.post('/:id/resolve', (req, res) => {
  const t = load(req, res);
  if (!t) return;
  if (['resolved', 'closed'].includes(t.status)) return res.json(detail(t, isStaff(req.user)));
  db.prepare(`UPDATE tickets SET status = 'resolved', resolved_at = datetime('now'),
    first_response_at = COALESCE(first_response_at, CASE WHEN ? = 1 THEN datetime('now') END), updated_at = datetime('now') WHERE id = ?`)
    .run(isStaff(req.user) ? 1 : 0, t.id);
  logEvent('support.resolved', `${t.reference} resolved by ${req.user.name}`, { actor: req.user.id, ref: t.reference });
  mail.ticketResolved(t.id);
  res.json(detail(t, isStaff(req.user)));
});

r.post('/:id/reopen', (req, res) => {
  const t = load(req, res);
  if (!t) return;
  if (t.status !== 'resolved') return res.status(409).json({ error: 'Only resolved tickets can be reopened' });
  db.prepare("UPDATE tickets SET status = 'open', resolved_at = NULL, updated_at = datetime('now') WHERE id = ?").run(t.id);
  res.json(detail(t, isStaff(req.user)));
});

r.post('/:id/csat', body(z.object({ score: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional().default('') })), (req, res) => {
  const t = load(req, res);
  if (!t) return;
  if (t.user_id !== req.user.id) return res.status(403).json({ error: 'Only the client can rate this ticket' });
  if (!['resolved', 'closed'].includes(t.status)) return res.status(409).json({ error: 'You can rate the help once the ticket is resolved' });
  db.prepare('UPDATE tickets SET csat_score = ?, csat_comment = ? WHERE id = ?').run(req.body.score, req.body.comment || null, t.id);
  logEvent('support.csat', `${t.reference} rated ${req.body.score}/5${req.body.comment ? ` — “${req.body.comment.slice(0, 80)}”` : ''}`, { actor: req.user.id, ref: t.reference, level: req.body.score <= 2 ? 'warn' : 'info' });
  res.json(detail(t, false));
});

// ---- Staff
// Log hands-on time against the client's care plan allowance.
r.post('/:id/time', requireRole('admin', 'staff'), body(z.object({
  minutes: z.number().int().min(5, 'Log at least 5 minutes').max(1440),
  note: z.string().trim().min(3, 'Say what was done').max(300),
})), (req, res) => {
  const t = load(req, res);
  if (!t) return;
  if (!t.care_order_id) return res.status(409).json({ error: 'This ticket is not covered by a care plan' });
  logCareTime(t.care_order_id, { minutes: req.body.minutes, note: req.body.note, staffId: req.user.id, ticketId: t.id });
  res.status(201).json(detail(t, true));
});

r.patch('/:id', requireRole('admin', 'staff'), body(z.object({
  status: z.enum(['open', 'pending_client', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assigned_to: z.number().int().positive().nullable().optional(),
})), (req, res) => {
  const t = load(req, res);
  if (!t) return;
  const b = req.body;
  if (b.assigned_to && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role IN ('admin','staff')").get(b.assigned_to)) {
    return res.status(400).json({ error: 'Assignee must be a staff member' });
  }
  const sla = b.priority && b.priority !== t.priority && !t.first_response_at
    ? db.prepare('SELECT datetime(created_at, ?) d FROM tickets WHERE id = ?').get(`+${SLA_HOURS[b.priority]} hours`, t.id).d : t.sla_due_at;
  db.prepare(`UPDATE tickets SET status = ?, priority = ?, assigned_to = ?, sla_due_at = ?,
    resolved_at = CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at, datetime('now')) ELSE NULL END, updated_at = datetime('now') WHERE id = ?`)
    .run(b.status ?? t.status, b.priority ?? t.priority, b.assigned_to !== undefined ? b.assigned_to : t.assigned_to, sla, b.status ?? t.status, t.id);
  if (b.status === 'resolved' && t.status !== 'resolved') mail.ticketResolved(t.id);
  logEvent('support.updated', `${t.reference} updated by ${req.user.name}: ${Object.entries(b).map(([k, v]) => `${k}=${v}`).join(', ')}`, { actor: req.user.id, ref: t.reference });
  res.json(detail(t, true));
});

export default r;
