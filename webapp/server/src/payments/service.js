// Gateway-independent payment bookkeeping.
import { randomBytes } from 'node:crypto';
import { db, row, tx } from '../db.js';
import { logEvent } from '../events.js';

export const newReference = () => `HCP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;

export const findPayment = (reference) => row(db.prepare('SELECT * FROM payments WHERE reference = ?').get(reference));

/**
 * Apply a verified status from a gateway. Idempotent: a completed payment is never downgraded,
 * and the invoice/order are only updated once.
 */
export function applyPaymentStatus(payment, status, { txnId = null, message = null, raw = null } = {}) {
  return tx(() => {
    const current = findPayment(payment.reference);
    if (current.status === 'complete') return current;
    db.prepare(`UPDATE payments SET status = ?, gateway_txn_id = COALESCE(?, gateway_txn_id), status_message = ?,
      raw_notify = COALESCE(?, raw_notify), updated_at = datetime('now') WHERE id = ?`)
      .run(status, txnId, message, raw ? JSON.stringify(raw) : null, current.id);

    if (status === 'complete') {
      const inv = row(db.prepare('SELECT * FROM invoices WHERE id = ?').get(current.invoice_id));
      if (inv.status !== 'paid') {
        db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(inv.id);
        db.prepare("UPDATE orders SET status = CASE WHEN status = 'pending' THEN 'active' ELSE status END, updated_at = datetime('now') WHERE id = ?")
          .run(inv.order_id);
      }
      logEvent('payment.complete', `${current.gateway} payment ${current.reference} for ${inv.number} completed (R${(current.amount_cents / 100).toFixed(2)})`,
        { actor: current.user_id, ref: current.reference });
    } else if (['failed', 'cancelled', 'abandoned'].includes(status)) {
      logEvent(`payment.${status}`, `${current.gateway} payment ${current.reference} ${status}${message ? `: ${message}` : ''}`,
        { level: status === 'failed' ? 'warn' : 'info', actor: current.user_id, ref: current.reference });
    }
    return findPayment(current.reference);
  });
}

/** Mark stale "initiated" attempts as abandoned. Used by the scheduled job. */
export function expireStalePayments(hours = 2) {
  const info = db.prepare(`UPDATE payments SET status = 'abandoned', updated_at = datetime('now')
    WHERE status = 'initiated' AND created_at < datetime('now', ?)`).run(`-${hours} hours`);
  return info.changes;
}
