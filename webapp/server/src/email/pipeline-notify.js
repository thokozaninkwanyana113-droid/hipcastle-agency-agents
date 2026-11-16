// Delivery-pipeline emails (fire-and-forget; never throw into the request).
import { db, row, rows } from '../db.js';
import { notifyTeam, sendEmail } from './mailer.js';
import { onInvoiceIssued } from './notify.js';

const ORDER = `SELECT o.*, st.name AS tier_name, s.name AS service_name FROM orders o
  JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id WHERE o.id = ?`;
const order = (id) => row(db.prepare(ORDER).get(id));
const user = (id) => row(db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id));
const ms = (id) => row(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id));
const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.error('pipeline email failed', e); return null; } };

export const onboardingStart = safe((oid) => {
  const o = order(oid); const u = user(o.user_id);
  const items = rows(db.prepare("SELECT label FROM onboarding_items WHERE order_id = ? AND status <> 'done' ORDER BY required DESC, position").all(oid));
  sendEmail('onboarding.start', u.email, { user: u, order: o, items }, { name: u.name, ref: o.reference });
});
export const onboardingReminder = safe((oid) => {
  const o = order(oid); const u = user(o.user_id);
  const open = db.prepare("SELECT COUNT(*) n FROM onboarding_items WHERE order_id = ? AND required = 1 AND status <> 'done'").get(oid).n;
  if (open) sendEmail('onboarding.reminder', u.email, { user: u, order: o, open }, { name: u.name, ref: o.reference });
});
export const onboardingComplete = safe((oid) => {
  const o = order(oid); const u = user(o.user_id);
  const answers = rows(db.prepare('SELECT label, response FROM onboarding_items WHERE order_id = ? AND response IS NOT NULL ORDER BY position').all(oid));
  notifyTeam('onboarding.complete', { user: u, order: o, answers }, { ref: o.reference });
});
export const deliverableReady = safe((oid, mid) => {
  const o = order(oid); const u = user(o.user_id); const m = ms(mid);
  const revisionsLeft = o.revisions_allowed === null ? null : Math.max(0, o.revisions_allowed - m.revisions_used);
  sendEmail('deliverable.ready', u.email, { user: u, order: o, milestone: m, revisionsLeft }, { name: u.name, ref: o.reference });
});
export const approvalReminder = safe((oid, mid) => {
  const o = order(oid); const u = user(o.user_id);
  sendEmail('approval.reminder', u.email, { user: u, order: o, milestone: ms(mid) }, { name: u.name, ref: o.reference });
});
export const deliverableResponse = safe((oid, mid, outcome) => {
  const o = order(oid);
  notifyTeam('deliverable.response', { user: user(o.user_id), order: o, milestone: ms(mid), outcome }, { ref: o.reference });
});
export const overdueDigest = safe((items) => notifyTeam('pipeline.digest', { items }, { ref: 'digest' }));
export const invoiceIssued = (invoiceId) => onInvoiceIssued(invoiceId);
export const cycleStarted = safe((oid, cycle, invoiceId) => {
  const o = order(oid); const u = user(o.user_id);
  const invoice = row(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId));
  const milestones = rows(db.prepare('SELECT title FROM milestones WHERE order_id = ? AND cycle = ? ORDER BY position').all(oid, cycle));
  sendEmail('retainer.cycle', u.email, { user: u, order: o, cycle, invoice, milestones }, { name: u.name, ref: invoice.number });
});
export const feedbackRequest = safe((oid) => {
  const o = order(oid); const u = user(o.user_id);
  sendEmail('feedback.request', u.email, { user: u, order: o }, { name: u.name, ref: o.reference });
});
export const feedbackReceived = safe((oid) => {
  const o = order(oid);
  notifyTeam('feedback.received', { user: user(o.user_id), order: o }, { ref: o.reference });
});
