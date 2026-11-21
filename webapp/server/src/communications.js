// The client communications plan, as data the system enforces.
//
// Every message the platform sends is a touchpoint with a stage, audience, trigger and timing.
// Principles (see COMMUNICATIONS.md):
//  • Transactional messages (receipts, security, replies the client is waiting for) go immediately.
//  • Nudges, follow-ups and digests are held for South African business hours (Mon–Fri 08:00–17:00
//    SAST, excluding public holidays) so nobody is pinged at night or on a public holiday.
//  • Optional touchpoints can be switched off in the Command Centre; essential ones cannot.
//  • One clear next step per message, plain South African English, a person's reply-to address.
import { db, rows } from './db.js';
import { getSettings } from './settings.js';

// stage, audience, trigger, timing, essential?, businessHours?
const T = (stage, audience, trigger, timing, { essential = false, businessHours = false } = {}) => ({ stage, audience, trigger, timing, essential, businessHours });
export const TOUCHPOINTS = {
  // 1. Enquiry
  'lead.autoreply': T('Enquiry', 'Prospect', 'Contact form or chat handoff', 'Immediately (max one per address per day)', { essential: true }),
  'lead.notify': T('Enquiry', 'Team', 'New enquiry', 'Immediately — respond within 1 business day', { essential: true }),
  'chat.handoff': T('Enquiry', 'Team', 'Chat visitor asks for a person', 'Immediately', { essential: true }),
  'lead.stale': T('Enquiry', 'Team', 'Enquiry still “new” after 1 business day', 'Daily digest, business hours', { businessHours: true }),
  'lead.followup': T('Enquiry', 'Prospect', 'No order 3 days after enquiring', 'Once, business hours', { businessHours: true }),
  // 2. Sign-up & order
  'user.welcome': T('Order', 'Client', 'Account created', 'Immediately'),
  'order.confirmation': T('Order', 'Client', 'Order placed', 'Immediately', { essential: true }),
  'order.notify': T('Order', 'Team', 'Order placed', 'Immediately', { essential: true }),
  'order.unpaid': T('Order', 'Client', 'First invoice (or agreement) still outstanding', '24 hours and 3 days after ordering, business hours', { businessHours: true }),
  'agreement.signed': T('Order', 'Client & Team', 'Service agreement signed', 'Immediately', { essential: true }),
  // 3. Onboarding & delivery
  'onboarding.start': T('Onboarding', 'Client', 'Deposit received', 'Immediately', { essential: true }),
  'onboarding.reminder': T('Onboarding', 'Client', 'Onboarding incomplete 2+ days after the deposit', 'Every 3 days, business hours', { businessHours: true }),
  'onboarding.complete': T('Onboarding', 'Team', 'Client finished onboarding', 'Immediately — book the kick-off'),
  'order.status': T('Delivery', 'Client', 'Engagement started, in review or completed', 'Immediately'),
  'project.weekly': T('Delivery', 'Client', 'Active project', 'Mondays, business hours — progress, next steps, anything waiting on the client', { businessHours: true }),
  'deliverable.ready': T('Delivery', 'Client', 'Deliverable submitted for approval', 'Immediately', { essential: true }),
  'approval.reminder': T('Delivery', 'Client', 'Approval waiting 3+ days', 'Every 3 days, business hours', { businessHours: true }),
  'deliverable.response': T('Delivery', 'Team', 'Client approved or asked for changes', 'Immediately', { essential: true }),
  'message.new': T('Delivery', 'Client / Team', 'New message on an engagement', 'Immediately', { essential: true }),
  'pipeline.digest': T('Delivery', 'Team', 'Overdue milestones', 'Daily digest'),
  // 4. Billing
  'invoice.issued': T('Billing', 'Client', 'Invoice issued', 'Immediately', { essential: true }),
  'retainer.cycle': T('Billing', 'Client', 'New retainer month (with invoice)', 'At the start of each month', { essential: true }),
  'invoice.reminder': T('Billing', 'Client', 'Invoice overdue', 'Once when overdue, business hours', { businessHours: true }),
  'payment.receipt': T('Billing', 'Client', 'Payment confirmed', 'Immediately', { essential: true }),
  'payment.failed': T('Billing', 'Client', 'Payment declined', 'Immediately', { essential: true }),
  'payment.notify': T('Billing', 'Team', 'Payment received', 'Immediately'),
  'payment.duplicate': T('Billing', 'Team', 'Duplicate payment — refund needed', 'Immediately', { essential: true }),
  // 5. Support
  'ticket.created': T('Support', 'Client', 'Ticket opened', 'Immediately, with the response target', { essential: true }),
  'ticket.notify': T('Support', 'Team', 'Ticket opened', 'Immediately', { essential: true }),
  'ticket.reply': T('Support', 'Client / Team', 'Reply on a ticket', 'Immediately', { essential: true }),
  'ticket.resolved': T('Support', 'Client', 'Ticket resolved', 'Immediately, with a 1–5 rating link', { essential: true }),
  'ticket.sla': T('Support', 'Team', 'Ticket past its response target', 'Once per ticket'),
  // 6. Aftercare & loyalty
  'feedback.request': T('Aftercare', 'Client', 'Project delivered', 'Immediately — rating and review'),
  'feedback.received': T('Aftercare', 'Team', 'Client rated a project', 'Immediately'),
  'care.offer': T('Aftercare', 'Client', 'Free support ends in 7 days', 'Once per project, business hours', { businessHours: true }),
  'care.hours': T('Aftercare', 'Client', 'Care hours used up', 'Once per month', { essential: true }),
  'care.hours.team': T('Aftercare', 'Team', 'Care hours used up', 'Once per month'),
  'testimonial.notify': T('Aftercare', 'Team', 'Review submitted', 'Immediately'),
  'testimonial.thanks': T('Aftercare', 'Reviewer', 'Review published', 'Immediately'),
  // 7. Newsletter, account & system
  'newsletter.confirm': T('Newsletter', 'Subscriber', 'Sign-up (double opt-in)', 'Immediately', { essential: true }),
  'newsletter.welcome': T('Newsletter', 'Subscriber', 'Subscription confirmed', 'Immediately'),
  'auth.reset': T('Account', 'Client', 'Password reset requested', 'Immediately', { essential: true }),
  'operator.email': T('Operator', 'Prospect / Client', 'An Operator draft approved by a person', 'When approved', { essential: true }),
  'operator.brief': T('Operator', 'Team', 'Daily Operator run', 'Weekdays from 07:30 SAST'),
  'system.alert': T('System', 'Team', 'Error, failed job or backup', 'Immediately (throttled)', { essential: true }),
  'system.test': T('System', 'Admin', 'Test from the Command Centre', 'Immediately', { essential: true }),
};
export const STAGES = ['Enquiry', 'Order', 'Onboarding', 'Delivery', 'Billing', 'Support', 'Aftercare', 'Newsletter', 'Account', 'Operator', 'System'];

/** Is this touchpoint switched on? Essential ones always are. */
export function touchpointEnabled(id, s = getSettings()) {
  const tp = TOUCHPOINTS[id];
  if (!tp || tp.essential) return true;
  return !(s.comms_disabled || []).includes(id);
}

// ---------------------------------------------------------------- South African business hours
/** Easter Sunday (Gregorian, anonymous algorithm) as a UTC date. */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
/** South African public holidays (Public Holidays Act: a Sunday holiday moves to Monday). */
export function saHolidays(y) {
  const fixed = ['01-01', '03-21', '04-27', '05-01', '06-16', '08-09', '09-24', '12-16', '12-25', '12-26'].map((md) => new Date(`${y}-${md}T00:00:00Z`));
  const out = new Set();
  for (const d of fixed) { out.add(iso(d)); if (d.getUTCDay() === 0) out.add(iso(addDays(d, 1))); }
  const e = easter(y);
  out.add(iso(addDays(e, -2))); // Good Friday
  out.add(iso(addDays(e, 1)));  // Family Day
  return out;
}
const SAST = 2 * 3600e3;
/** Is `when` inside Mon–Fri 08:00–17:00 SAST on a working day? */
export function isBusinessHours(when = new Date()) {
  const local = new Date(when.getTime() + SAST);
  const day = local.getUTCDay(), hour = local.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 17 && !saHolidays(local.getUTCFullYear()).has(iso(local));
}
/** The next business-hours moment (now if already inside), as an SQLite UTC datetime string. */
export function nextBusinessSlot(when = new Date()) {
  if (isBusinessHours(when)) return null;
  let local = new Date(when.getTime() + SAST);
  if (local.getUTCHours() >= 8) local = addDays(local, 1);
  local = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 8, 0, 0));
  while (!isBusinessHours(new Date(local.getTime() - SAST))) local = addDays(local, 1);
  return new Date(local.getTime() - SAST).toISOString().slice(0, 19).replace('T', ' ');
}

/** Command Centre view: every touchpoint with its 30-day volume and state. */
export function communicationsPlan() {
  const s = getSettings();
  const counts = Object.fromEntries(rows(db.prepare(`SELECT template, COUNT(*) n, SUM(status IN ('sent','logged')) delivered, SUM(status = 'failed') failed
    FROM emails WHERE created_at >= datetime('now','-30 days') GROUP BY template`).all()).map((r) => [r.template, r]));
  const held = db.prepare("SELECT COUNT(*) n FROM emails WHERE status = 'queued' AND next_attempt_at > datetime('now') AND attempts = 0").get().n;
  return {
    business_hours_now: isBusinessHours(), next_business_slot: nextBusinessSlot(), held_for_business_hours: held,
    stages: STAGES.map((stage) => ({
      stage,
      touchpoints: Object.entries(TOUCHPOINTS).filter(([, t]) => t.stage === stage).map(([id, t]) => ({
        id, ...t, enabled: touchpointEnabled(id, s), sent_30d: counts[id]?.n || 0, delivered_30d: counts[id]?.delivered || 0, failed_30d: counts[id]?.failed || 0,
      })),
    })),
  };
}
