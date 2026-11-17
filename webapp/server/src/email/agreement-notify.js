// Signed agreement copies (fire-and-forget).
import { db, row } from '../db.js';
import { notifyTeam, sendEmail } from './mailer.js';

export const agreementSigned = (orderId) => {
  try {
    const a = row(db.prepare('SELECT * FROM agreements WHERE order_id = ?').get(orderId));
    const o = row(db.prepare(`SELECT o.id, o.reference, o.user_id, s.name AS service_name, st.name AS tier_name FROM orders o
      JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id WHERE o.id = ?`).get(orderId));
    const u = row(db.prepare('SELECT name, email FROM users WHERE id = ?').get(o.user_id));
    sendEmail('agreement.signed', u.email, { user: u, order: o, agreement: a }, { name: u.name, ref: o.reference });
    notifyTeam('agreement.signed', { user: u, order: o, agreement: a, team: true }, { ref: o.reference });
  } catch (e) { console.error('agreement email failed', e); }
};
