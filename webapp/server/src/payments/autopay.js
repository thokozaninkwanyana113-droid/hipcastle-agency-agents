// Automatic monthly payments (PayFast subscriptions) for retainers and care plans.
//
// The client opts in when paying a monthly invoice: PayFast charges that invoice now, tokenises the
// card and then charges the same amount every month. Each monthly charge arrives as an ITN carrying
// the subscription `token`; we match it to the order and settle its oldest unpaid invoice.
import { db, row, rows } from '../db.js';
import { logEvent } from '../events.js';
import { applyPaymentStatus, newReference } from './service.js';
import { cancelSubscription } from './payfast.js';

export const orderByToken = (token) => token && row(db.prepare('SELECT * FROM orders WHERE payfast_token = ?').get(token));

/** Called when the first (tokenising) payment completes. */
export function activateAutopay(orderId, token, amountCents) {
  db.prepare(`UPDATE orders SET payfast_token = ?, autopay_status = 'active', autopay_amount_cents = ?, autopay_since = datetime('now') WHERE id = ?`)
    .run(token, amountCents, orderId);
  const o = row(db.prepare('SELECT reference, user_id FROM orders WHERE id = ?').get(orderId));
  logEvent('autopay.started', `${o.reference}: automatic monthly card payments switched on (R${(amountCents / 100).toFixed(2)}/month)`, { actor: o.user_id, ref: o.reference });
}

/**
 * Apply a recurring charge notification. `itn` is the verified ITN data.
 * Returns a short description of what happened (for logs/tests).
 */
export async function applyRecurringCharge(order, itn, { startNextCycle } = {}) {
  const txn = itn.pf_payment_id;
  if (txn && db.prepare("SELECT 1 FROM payments WHERE gateway = 'payfast' AND gateway_txn_id = ?").get(txn)) return 'duplicate notification ignored';
  const status = itn.payment_status;
  if (status === 'CANCELLED') {
    db.prepare("UPDATE orders SET autopay_status = 'cancelled' WHERE id = ?").run(order.id);
    logEvent('autopay.cancelled', `${order.reference}: PayFast subscription cancelled`, { ref: order.reference, level: 'warn' });
    return 'subscription cancelled';
  }
  const cents = Math.round(Number(itn.amount_gross) * 100);
  // The month's invoice: the oldest unpaid one. If PayFast charged before our monthly cycle issued it, start the cycle now.
  let inv = row(db.prepare("SELECT * FROM invoices WHERE order_id = ? AND status = 'unpaid' ORDER BY id LIMIT 1").get(order.id));
  if (!inv && status === 'COMPLETE' && startNextCycle && order.next_cycle_at
    && db.prepare("SELECT date(?) <= date('now', '+5 days') ok").get(order.next_cycle_at).ok) {
    startNextCycle(order.id);
    inv = row(db.prepare("SELECT * FROM invoices WHERE order_id = ? AND status = 'unpaid' ORDER BY id LIMIT 1").get(order.id));
  }
  if (!inv) {
    logEvent('autopay.unallocated', `${order.reference}: PayFast charged R${(cents / 100).toFixed(2)} (${txn}) but no invoice is due — check and refund or credit`, { ref: order.reference, level: 'error' });
    return 'unallocated';
  }
  if (Math.abs(cents - inv.amount_cents) > 1) {
    logEvent('autopay.mismatch', `${order.reference}: PayFast charged R${(cents / 100).toFixed(2)} but ${inv.number} is R${(inv.amount_cents / 100).toFixed(2)} — reconcile manually`, { ref: order.reference, level: 'error' });
    return 'amount mismatch';
  }
  const reference = newReference();
  db.prepare(`INSERT INTO payments (reference, invoice_id, user_id, gateway, amount_cents, is_test, is_recurring) VALUES (?, ?, ?, 'payfast', ?, ?, 1)`)
    .run(reference, inv.id, order.user_id, inv.amount_cents, process.env.PAYMENTS_MODE === 'live' ? 0 : 1);
  const mapped = { COMPLETE: 'complete', FAILED: 'failed' }[status] || 'pending';
  applyPaymentStatus({ reference }, mapped, { txnId: txn, message: `Automatic monthly payment: ${status}`, raw: itn });
  if (mapped === 'failed') logEvent('autopay.failed', `${order.reference}: automatic payment for ${inv.number} failed — the client has been emailed`, { ref: order.reference, level: 'warn' });
  return `${mapped} → ${inv.number}`;
}

/** Stop automatic payments (client request, cancelled/completed engagement). */
export async function cancelAutopay(orderId, { actor = null, reason = '' } = {}) {
  const o = row(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
  if (!o?.payfast_token || o.autopay_status !== 'active') return { ok: true, already: true };
  await cancelSubscription(o.payfast_token); // throws if PayFast refuses — leave it active so nobody is misled
  db.prepare("UPDATE orders SET autopay_status = 'cancelled' WHERE id = ?").run(o.id);
  logEvent('autopay.cancelled', `${o.reference}: automatic monthly payments cancelled${reason ? ` (${reason})` : ''}`, { actor, ref: o.reference });
  return { ok: true };
}

export const activeAutopays = () => rows(db.prepare("SELECT id, reference, autopay_amount_cents FROM orders WHERE autopay_status = 'active'").all());
