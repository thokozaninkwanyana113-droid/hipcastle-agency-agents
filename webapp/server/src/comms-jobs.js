// Follow-ups from the communications plan (run hourly; each message is sent at most once per
// trigger, and the queue holds them for SA business hours).
import { db, row, rows } from './db.js';
import { notifyTeam, sendEmail } from './email/mailer.js';
import { isBusinessHours } from './communications.js';
import { agreementBlocksPayment } from './agreements.js';

const sentFor = (template, ref) => db.prepare('SELECT COUNT(*) n FROM emails WHERE template = ? AND ref = ?').get(template, ref).n;
const businessDaysAgo = "datetime('now', CASE strftime('%w','now') WHEN '1' THEN '-3 days' WHEN '0' THEN '-2 days' ELSE '-1 day' END)";

export function runFollowUps({ forceMonday = false } = {}) {
  let leadFollow = 0, unpaid = 0, weekly = 0, stale = 0;

  // Enquiries with no order after 3 days: one friendly follow-up.
  const leads = rows(db.prepare(`SELECT l.*, s.name AS service_name, s.id AS sid FROM leads l LEFT JOIN services s ON s.id = l.service_id
    WHERE l.created_at <= datetime('now','-3 days') AND l.created_at >= datetime('now','-14 days') AND l.status IN ('new','contacted')
    AND NOT EXISTS (SELECT 1 FROM orders o JOIN users u ON u.id = o.user_id WHERE u.email = l.email)`).all());
  for (const l of leads) {
    const ref = `lead-${l.id}`;
    if (sentFor('lead.followup', ref)) continue;
    const packages = l.sid ? rows(db.prepare("SELECT name, price_cents, billing, summary FROM service_tiers WHERE service_id = ? AND plan = 'core' ORDER BY price_cents").all(l.sid)) : [];
    if (sendEmail('lead.followup', l.email, { lead: l, service: l.service_name, packages }, { name: l.name, ref })) leadFollow++;
  }

  // Team: enquiries untouched for more than a business day (one digest per day).
  if (isBusinessHours() && !db.prepare("SELECT 1 FROM emails WHERE template = 'lead.stale' AND created_at >= date('now')").get()) {
    const waiting = rows(db.prepare(`SELECT l.name, l.preferred_contact, l.created_at, s.name AS service_name FROM leads l LEFT JOIN services s ON s.id = l.service_id
      WHERE l.status = 'new' AND l.created_at <= ${businessDaysAgo} ORDER BY l.created_at`).all());
    if (waiting.length && notifyTeam('lead.stale', { leads: waiting }, { ref: `stale-${new Date().toISOString().slice(0, 10)}` })) stale = waiting.length;
  }

  // Orders still pending payment: nudge at 24 hours and at 3 days.
  const pending = rows(db.prepare(`SELECT o.*, s.name AS service_name, st.name AS tier_name FROM orders o JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
    WHERE o.status = 'pending' AND o.created_at <= datetime('now','-1 day') AND o.created_at >= datetime('now','-14 days')`).all());
  for (const o of pending) {
    const already = sentFor('order.unpaid', o.reference);
    const ageDays = (Date.now() - Date.parse(`${o.created_at.replace(' ', 'T')}Z`)) / 864e5;
    if (already >= 2 || (already === 1 && ageDays < 3)) continue;
    const invoice = row(db.prepare("SELECT * FROM invoices WHERE order_id = ? AND status = 'unpaid' ORDER BY id LIMIT 1").get(o.id));
    if (!invoice) continue;
    const u = row(db.prepare('SELECT name, email FROM users WHERE id = ?').get(o.user_id));
    if (sendEmail('order.unpaid', u.email, { user: u, order: o, invoice, needsSignature: agreementBlocksPayment(o.id), attempt: already + 1 }, { name: u.name, ref: o.reference })) unpaid++;
  }

  // Monday progress update for active projects (once per week per project).
  const isMondaySast = forceMonday || new Date(Date.now() + 2 * 3600e3).getUTCDay() === 1;
  if (isMondaySast) {
    const week = new Date().toISOString().slice(0, 10);
    const active = rows(db.prepare(`SELECT o.*, s.name AS service_name FROM orders o JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
      WHERE o.status IN ('active','in_review') AND o.pipeline_kind = 'project'`).all());
    for (const o of active) {
      const ref = `${o.reference}-week-${week}`;
      if (sentFor('project.weekly', ref)) continue;
      const done = rows(db.prepare("SELECT title FROM milestones WHERE order_id = ? AND status = 'done' AND approved_at >= datetime('now','-7 days') ORDER BY position").all(o.id));
      const next = rows(db.prepare("SELECT title, due_date FROM milestones WHERE order_id = ? AND status NOT IN ('done') ORDER BY position LIMIT 2").all(o.id));
      const waiting = [
        ...(o.onboarding_completed_at ? [] : ['finish the onboarding form']),
        ...rows(db.prepare("SELECT title FROM milestones WHERE order_id = ? AND status = 'awaiting_client'").all(o.id)).map((m) => `approve “${m.title}”`),
      ];
      const u = row(db.prepare('SELECT name, email FROM users WHERE id = ?').get(o.user_id));
      if (sendEmail('project.weekly', u.email, { user: u, order: o, done, next, waiting }, { name: u.name, ref })) weekly++;
    }
  }
  return `${leadFollow} lead follow-up(s), ${unpaid} unpaid-order nudge(s), ${weekly} weekly update(s), ${stale} stale lead(s) flagged`;
}
