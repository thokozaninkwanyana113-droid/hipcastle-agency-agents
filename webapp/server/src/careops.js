// Care plan operations: monthly time allowance, ticket priority, and offering care when a
// project's free post-launch support window is about to end.
import { db, row, rows } from './db.js';
import { logEvent } from './events.js';
import { SUPPORT_DAYS } from './playbooks.js';
import { CARE, CARE_EXTRA_HOUR_CENTS, hoursLabel } from './care.js';
import * as mail from './email/care-notify.js';

const CARE_ORDER = `SELECT o.*, st.tier, st.plan, st.name AS tier_name, st.care_minutes, st.support_priority, s.slug AS service_slug, s.name AS service_name,
    c.reference AS covers_reference
  FROM orders o JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id LEFT JOIN orders c ON c.id = o.covers_order_id`;
export const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 };

export const loadCareOrder = (id) => row(db.prepare(`${CARE_ORDER} WHERE o.id = ? AND st.plan = 'care'`).get(id));

/** The client's live care plans (status active / in review). */
export const activeCarePlans = (userId) =>
  rows(db.prepare(`${CARE_ORDER} WHERE o.user_id = ? AND st.plan = 'care' AND o.status IN ('active','in_review') ORDER BY o.id`).all(userId));

/** Minutes included vs used in the care plan's current month. */
export function careUsage(orderId) {
  const o = loadCareOrder(orderId);
  if (!o) return null;
  const cycle = Math.max(1, o.current_cycle || 1);
  const entries = rows(db.prepare(`SELECT ct.*, u.name AS staff_name, t.reference AS ticket_reference FROM care_time ct
    LEFT JOIN users u ON u.id = ct.staff_id LEFT JOIN tickets t ON t.id = ct.ticket_id
    WHERE ct.order_id = ? AND ct.cycle = ? ORDER BY ct.id DESC`).all(o.id, cycle));
  const used = entries.reduce((a, e) => a + e.minutes, 0);
  const included = o.care_minutes || 0;
  return {
    order_id: o.id, reference: o.reference, title: CARE[o.service_slug]?.title || 'Care plan', tier_name: o.tier_name, service_name: o.service_name,
    cycle, included_minutes: included, used_minutes: used, remaining_minutes: Math.max(0, included - used),
    over_minutes: Math.max(0, used - included), extra_hour_cents: CARE_EXTRA_HOUR_CENTS,
    support_priority: o.support_priority, covers_reference: o.covers_reference, entries,
  };
}

/** Log hands-on time against a care plan. Emails the client once per month when the allowance is used up. */
export function logCareTime(orderId, { minutes, note, staffId = null, ticketId = null }) {
  const before = careUsage(orderId);
  if (!before) throw new Error('Not a care plan');
  db.prepare('INSERT INTO care_time (order_id, cycle, ticket_id, staff_id, minutes, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, before.cycle, ticketId, staffId, minutes, note);
  const after = careUsage(orderId);
  logEvent('care.time', `${after.reference}: ${hoursLabel(minutes)} logged — ${note.slice(0, 80)} (${hoursLabel(after.used_minutes)} of ${hoursLabel(after.included_minutes)} this month)`,
    { actor: staffId, ref: after.reference, level: after.over_minutes > 0 ? 'warn' : 'info' });
  if (before.used_minutes < before.included_minutes && after.used_minutes >= after.included_minutes) mail.hoursUsed(orderId, after);
  return after;
}

/**
 * Faster response for tickets from care clients: the ticket gets the better of the priority the
 * client chose and their care plan's priority. Returns { care_order_id, priority }.
 */
export function carePriorityFor(userId, chosen, orderId = null) {
  const plans = activeCarePlans(userId);
  if (!plans.length) return { care_order_id: null, priority: chosen };
  const plan = plans.find((p) => p.id === orderId || p.covers_order_id === orderId)
    || plans.sort((a, b) => PRIORITY_RANK[b.support_priority] - PRIORITY_RANK[a.support_priority])[0];
  const priority = PRIORITY_RANK[plan.support_priority] > PRIORITY_RANK[chosen] ? plan.support_priority : chosen;
  return { care_order_id: plan.id, priority };
}

/** When the free post-launch support of a delivered project ends (null if not delivered / not a project). */
export function supportEndsAt(o) {
  if (o.pipeline_kind !== 'project' || !o.delivered_at || o.plan === 'care') return null;
  return db.prepare('SELECT datetime(?, ?) d').get(o.delivered_at, `+${SUPPORT_DAYS[o.tier] || 14} days`).d;
}

/** Care plans to offer on a project (null when the client already has care for it). */
export function careOfferFor(o) {
  if (o.pipeline_kind !== 'project' || o.plan === 'care' || o.status === 'cancelled') return null;
  const existing = row(db.prepare(`SELECT o.id, o.reference, o.status FROM orders o JOIN service_tiers st ON st.id = o.tier_id
    WHERE st.plan = 'care' AND o.user_id = ? AND o.status <> 'cancelled' AND (o.covers_order_id = ? OR st.service_id = (SELECT service_id FROM service_tiers WHERE id = ?))
    ORDER BY o.id DESC LIMIT 1`).get(o.user_id, o.id, o.tier_id));
  const tiers = rows(db.prepare(`SELECT * FROM service_tiers WHERE plan = 'care' AND service_id = (SELECT service_id FROM service_tiers WHERE id = ?)
    ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(o.tier_id), ['features']);
  if (!tiers.length) return null;
  return { title: CARE[o.service_slug]?.title || 'Care plan', blurb: CARE[o.service_slug]?.blurb || '', support_ends_at: supportEndsAt(o), existing, tiers };
}

/** Job: offer a care plan 7 days before a project's free support ends (once per project). */
export function offerCarePlans() {
  const projects = rows(db.prepare(`SELECT o.*, st.tier, st.plan, s.slug AS service_slug, s.name AS service_name FROM orders o
    JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
    WHERE o.pipeline_kind = 'project' AND st.plan = 'core' AND o.delivered_at IS NOT NULL AND o.status <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.type = 'care.offered' AND e.ref = o.reference)`).all());
  let offered = 0;
  for (const o of projects) {
    const ends = supportEndsAt(o);
    if (!ends || db.prepare("SELECT datetime(?, '-7 days') > datetime('now') x").get(ends).x) continue;
    const offer = careOfferFor(o);
    if (!offer || offer.existing) continue;
    logEvent('care.offered', `${o.reference}: free support ends ${ends.slice(0, 10)} — ${offer.title} offered`, { ref: o.reference });
    mail.careOffer(o.id, offer);
    offered++;
  }
  return `${offered} care plan offer(s) sent`;
}

/** Command Centre: active plans with usage, recurring revenue and support windows ending soon. */
export function careBoard() {
  const plans = rows(db.prepare(`${CARE_ORDER.replace('SELECT o.*,', 'SELECT o.*, u.name AS client_name, u.company AS client_company,').replace('FROM orders o', 'FROM orders o JOIN users u ON u.id = o.user_id')}
    WHERE st.plan = 'care' AND o.status <> 'cancelled' ORDER BY o.status, o.id DESC`).all())
    .map((p) => ({ ...p, title: CARE[p.service_slug]?.title, usage: ['active', 'in_review'].includes(p.status) ? careUsage(p.id) : null }));
  const live = plans.filter((p) => ['active', 'in_review'].includes(p.status));
  const ending = rows(db.prepare(`SELECT o.*, st.tier, st.plan, s.slug AS service_slug, s.name AS service_name, u.name AS client_name FROM orders o
    JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id JOIN users u ON u.id = o.user_id
    WHERE o.pipeline_kind = 'project' AND st.plan = 'core' AND o.delivered_at IS NOT NULL AND o.status <> 'cancelled'`).all())
    .map((o) => ({ id: o.id, reference: o.reference, client_name: o.client_name, service_name: o.service_name, support_ends_at: supportEndsAt(o),
      offered: !!db.prepare("SELECT 1 FROM events WHERE type = 'care.offered' AND ref = ?").get(o.reference), has_care: !!careOfferFor(o)?.existing }))
    .filter((o) => !o.has_care && o.support_ends_at && o.support_ends_at > db.prepare("SELECT datetime('now','-30 days') d").get().d)
    .sort((a, b) => a.support_ends_at.localeCompare(b.support_ends_at));
  return {
    mrr_cents: live.reduce((a, p) => a + p.price_cents, 0),
    active: live.length,
    pending: plans.filter((p) => p.status === 'pending').length,
    over_allowance: live.filter((p) => p.usage?.over_minutes > 0).length,
    plans, ending,
  };
}
