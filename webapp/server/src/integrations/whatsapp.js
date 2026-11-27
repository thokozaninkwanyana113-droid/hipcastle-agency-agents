// WhatsApp as a second channel for the messages clients act on most: approvals, invoices and support
// replies. Only for clients who opted in (POPIA) with a valid mobile number. Each message uses a
// pre-approved WhatsApp template (create them in WhatsApp Manager with the bodies in the README).
import { db } from '../db.js';
import { logEvent } from '../events.js';
import { canonicalUrl } from '../urls.js';
import { sendWhatsappTemplate, waNumber, whatsappConfigured } from './meta.js';

const first = (n = '') => n.trim().split(/\s+/)[0] || 'there';
const zar = (c) => `R${((c || 0) / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 }).replace(/\s/g, ' ')}`;
const T = (key, fallback) => process.env[`WHATSAPP_TEMPLATE_${key}`] || fallback;

/** Touchpoint → template and its {{1}}, {{2}}… parameters (in order). */
export const WHATSAPP_TOUCHPOINTS = {
  'deliverable.ready': (d) => d.user && d.milestone && d.order && [T('APPROVAL', 'hc_approval_needed'), [first(d.user.name), d.milestone.title, d.order.reference, `${canonicalUrl()}/portal/orders/${d.order.id}`]],
  'invoice.issued': (d) => d.user && d.invoice && d.order && [T('INVOICE', 'hc_invoice_issued'), [first(d.user.name), d.invoice.number, zar(d.invoice.amount_cents), `${canonicalUrl()}/portal/orders/${d.order.id}`]],
  'ticket.reply': (d) => !d.staffView && d.to && d.ticket && [T('SUPPORT', 'hc_support_reply'), [first(d.to.name), d.ticket.reference, `${canonicalUrl()}/portal/support/${d.ticket.id}`]],
};

/** Called after an email is queued: mirror it on WhatsApp when the client opted in. Never throws. */
export async function mirrorToWhatsapp(touchpoint, toEmail, data, ref) {
  try {
    const build = WHATSAPP_TOUCHPOINTS[touchpoint];
    if (!build || !whatsappConfigured()) return null;
    const u = db.prepare('SELECT id, phone, whatsapp_opt_in FROM users WHERE lower(email) = ?').get(String(toEmail).toLowerCase());
    const to = u?.whatsapp_opt_in ? waNumber(u.phone) : null;
    const spec = to && build(data);
    if (!spec) return null;
    const [template, params] = spec;
    try {
      const waId = await sendWhatsappTemplate(to, template, params);
      db.prepare("INSERT INTO whatsapp_messages (user_id, to_phone, template, touchpoint, status, wa_id, ref) VALUES (?, ?, ?, ?, 'sent', ?, ?)").run(u.id, to, template, touchpoint, waId, ref);
      return waId;
    } catch (err) {
      db.prepare("INSERT INTO whatsapp_messages (user_id, to_phone, template, touchpoint, status, error, ref) VALUES (?, ?, ?, ?, 'failed', ?, ?)").run(u.id, to, template, touchpoint, err.message.slice(0, 300), ref);
      logEvent('whatsapp.failed', `WhatsApp ${touchpoint} to user #${u.id} failed: ${err.message}`.slice(0, 300), { level: 'warn', ref });
      return null;
    }
  } catch { return null; }
}
