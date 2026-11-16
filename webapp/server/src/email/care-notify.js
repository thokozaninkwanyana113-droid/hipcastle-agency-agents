// Care-plan emails (fire-and-forget; never throw into the request).
import { db, row } from '../db.js';
import { notifyTeam, sendEmail } from './mailer.js';

const order = (id) => row(db.prepare(`SELECT o.*, s.name AS service_name, st.name AS tier_name FROM orders o
  JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id WHERE o.id = ?`).get(id));
const user = (id) => row(db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id));
const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.error('care email failed', e); return null; } };

export const careOffer = safe((orderId, offer) => {
  const o = order(orderId); const u = user(o.user_id);
  sendEmail('care.offer', u.email, { user: u, order: o, offer }, { name: u.name, ref: o.reference });
});
export const hoursUsed = safe((orderId, usage) => {
  const o = order(orderId); const u = user(o.user_id);
  sendEmail('care.hours', u.email, { user: u, order: o, usage }, { name: u.name, ref: o.reference });
  notifyTeam('care.hours.team', { user: u, order: o, usage }, { ref: o.reference });
});
