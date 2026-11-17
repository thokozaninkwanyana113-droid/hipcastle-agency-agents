// Push invoices, payments and voids to Xero, once each (idempotent; failures retry up to 5 times).
import { db, row, rows } from '../db.js';
import { logEvent } from '../events.js';
import { getSettings } from '../settings.js';
import { connection, xero } from './xero.js';

const P = 'xero';
const done = (entity, id) => row(db.prepare("SELECT * FROM accounting_sync WHERE provider = ? AND entity = ? AND entity_id = ?").get(P, entity, id));
function mark(entity, id, { externalId = null, error = null, meta = null }) {
  db.prepare(`INSERT INTO accounting_sync (provider, entity, entity_id, external_id, status, error, meta) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, entity, entity_id) DO UPDATE SET external_id = COALESCE(excluded.external_id, external_id), status = excluded.status,
      error = excluded.error, meta = COALESCE(excluded.meta, meta), attempts = attempts + 1, updated_at = datetime('now')`)
    .run(P, entity, id, externalId, error ? 'failed' : 'synced', error, meta);
}
const retryable = (entity) => `NOT EXISTS (SELECT 1 FROM accounting_sync a WHERE a.provider = '${P}' AND a.entity = '${entity}' AND a.entity_id = i.id
  AND (a.status = 'synced' OR a.attempts >= 5))`;
const day = (s) => String(s || '').slice(0, 10);

async function ensureContact(u) {
  const have = done('contact', u.id);
  if (have?.status === 'synced') return have.external_id;
  const base = u.company ? `${u.company}` : u.name;
  const contact = (name) => ({ Contacts: [{ Name: name, EmailAddress: u.email, ContactNumber: `HC-${u.id}`, FirstName: u.name.split(' ')[0], LastName: u.name.split(' ').slice(1).join(' ') || undefined, ...(u.vat_number && { TaxNumber: u.vat_number }) }] });
  let res;
  try { res = await xero('POST', 'Contacts', contact(base)); }
  catch (err) {
    if (!/already|unique|exists/i.test(err.message)) throw err;
    res = await xero('POST', 'Contacts', contact(`${base} (${u.email})`)); // names must be unique in Xero
  }
  const id = res.Contacts[0].ContactID;
  mark('contact', u.id, { externalId: id });
  return id;
}

export async function syncAccounting({ limit = 25 } = {}) {
  if (!connection()) return 'Xero not connected — skipped';
  const s = getSettings();
  const taxType = s.vat_registered ? s.xero_tax_type || 'OUTPUT' : 'NONE';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(s.accounting_sync_from || '') ? s.accounting_sync_from : '0000-00-00';
  let invoices = 0, payments = 0, voids = 0, failed = 0;

  const toPush = rows(db.prepare(`SELECT i.*, o.reference AS order_ref, o.user_id, s.name AS service_name, st.name AS tier_name
    FROM invoices i JOIN orders o ON o.id = i.order_id JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
    WHERE i.status IN ('unpaid','paid') AND date(i.issued_at) >= ? AND ${retryable('invoice')} ORDER BY i.id LIMIT ?`).all(from, limit));
  for (const inv of toPush) {
    try {
      const u = row(db.prepare('SELECT id, name, email, company, vat_number FROM users WHERE id = ?').get(inv.user_id));
      const contactId = await ensureContact(u);
      const res = await xero('PUT', 'Invoices', { Invoices: [{
        Type: 'ACCREC', Contact: { ContactID: contactId }, InvoiceNumber: inv.number, Reference: inv.order_ref,
        Date: day(inv.issued_at), DueDate: day(inv.due_at), CurrencyCode: 'ZAR', Status: 'AUTHORISED', LineAmountTypes: 'Exclusive',
        LineItems: [{ Description: `${inv.service_name} — ${inv.tier_name}${inv.description ? ` · ${inv.description}` : ''}`, Quantity: 1,
          UnitAmount: (inv.subtotal_cents || inv.amount_cents) / 100, AccountCode: s.xero_sales_account || '200', TaxType: taxType }],
      }] });
      const x = res.Invoices[0];
      mark('invoice', inv.id, { externalId: x.InvoiceID, meta: JSON.stringify({ total: x.Total }) });
      if (Math.abs(Math.round(x.Total * 100) - inv.amount_cents) > 1) {
        logEvent('accounting.mismatch', `${inv.number}: Xero total R${x.Total} differs from ours (R${(inv.amount_cents / 100).toFixed(2)}) — check the Xero tax type`, { ref: inv.number, level: 'warn' });
      }
      invoices++;
    } catch (err) { failed++; failure('invoice', inv, err); }
  }

  const paid = rows(db.prepare(`SELECT i.*, a.external_id AS xero_id, a.meta FROM invoices i
    JOIN accounting_sync a ON a.provider = '${P}' AND a.entity = 'invoice' AND a.entity_id = i.id AND a.status = 'synced'
    WHERE i.status = 'paid' AND ${retryable('payment')} ORDER BY i.id LIMIT ?`).all(limit));
  for (const inv of paid) {
    try {
      const total = JSON.parse(inv.meta || '{}').total ?? inv.amount_cents / 100;
      const pay = rows(db.prepare("SELECT gateway, reference FROM payments WHERE invoice_id = ? AND status = 'complete' ORDER BY id").all(inv.id))[0];
      const res = await xero('PUT', 'Payments', { Payments: [{ Invoice: { InvoiceID: inv.xero_id }, Account: { Code: s.xero_bank_account || '090' },
        Date: day(inv.paid_at), Amount: total, Reference: pay ? `${pay.gateway} ${pay.reference}` : 'Manual / EFT' }] });
      mark('payment', inv.id, { externalId: res.Payments[0].PaymentID });
      payments++;
    } catch (err) { failed++; failure('payment', inv, err); }
  }

  const voided = rows(db.prepare(`SELECT i.*, a.external_id AS xero_id FROM invoices i
    JOIN accounting_sync a ON a.provider = '${P}' AND a.entity = 'invoice' AND a.entity_id = i.id AND a.status = 'synced'
    WHERE i.status = 'void' AND ${retryable('void')} LIMIT ?`).all(limit));
  for (const inv of voided) {
    try {
      await xero('POST', `Invoices/${inv.xero_id}`, { Invoices: [{ InvoiceID: inv.xero_id, Status: 'VOIDED' }] });
      mark('void', inv.id, {});
      voids++;
    } catch (err) { failed++; failure('void', inv, err); }
  }
  return `Xero: ${invoices} invoice(s), ${payments} payment(s), ${voids} void(s) synced${failed ? `, ${failed} failed` : ''}`;
}

function failure(entity, inv, err) {
  mark(entity, inv.id, { error: err.message.slice(0, 500) });
  const attempts = done(entity, inv.id)?.attempts || 1;
  logEvent('accounting.sync_failed', `${inv.number}: Xero ${entity} sync failed (attempt ${attempts}/5): ${err.message}`.slice(0, 300),
    { ref: inv.number, level: attempts >= 3 ? 'error' : 'warn' });
}

export function syncStatus() {
  const c = connection();
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  return {
    connected: Boolean(c), organisation: c?.label || null, since: c?.updated_at || null,
    synced: { invoices: n("SELECT COUNT(*) n FROM accounting_sync WHERE provider = 'xero' AND entity = 'invoice' AND status = 'synced'"),
      payments: n("SELECT COUNT(*) n FROM accounting_sync WHERE provider = 'xero' AND entity = 'payment' AND status = 'synced'") },
    failures: rows(db.prepare(`SELECT a.entity, a.error, a.attempts, a.updated_at, i.number FROM accounting_sync a JOIN invoices i ON i.id = a.entity_id
      WHERE a.provider = 'xero' AND a.status = 'failed' AND a.entity <> 'contact' ORDER BY a.updated_at DESC LIMIT 20`).all()),
  };
}

/** Allow failed items to be retried (after fixing account codes etc.). */
export const resetFailures = () => db.prepare("DELETE FROM accounting_sync WHERE provider = 'xero' AND status = 'failed'").run().changes;
