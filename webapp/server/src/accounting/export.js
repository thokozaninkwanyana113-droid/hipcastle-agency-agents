// Invoice exports for accountants: Xero's sales-invoice import template, and a general CSV that
// Sage Business Cloud's import tool (or any accounting package) can map.
import { db, rows } from '../db.js';
import { getSettings } from '../settings.js';

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (header, data) => '﻿' + [header, ...data].map((r) => r.map(cell).join(',')).join('\r\n');
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const rand = (c) => ((c || 0) / 100).toFixed(2);

function invoicesBetween(from, to) {
  return rows(db.prepare(`SELECT i.*, o.reference AS order_ref, u.name, u.email, u.company, u.vat_number, s.name AS service_name, st.name AS tier_name
    FROM invoices i JOIN orders o ON o.id = i.order_id JOIN users u ON u.id = o.user_id JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
    WHERE date(i.issued_at) BETWEEN ? AND ? ORDER BY i.issued_at, i.id`).all(from, to));
}

export function exportInvoices(kind, from = '2000-01-01', to = '2999-12-31') {
  const s = getSettings();
  const list = invoicesBetween(from, to);
  const desc = (i) => `${i.service_name} — ${i.tier_name}${i.description ? ` · ${i.description}` : ''}`;
  if (kind === 'xero') {
    const tax = s.vat_registered ? (s.xero_tax_type || 'OUTPUT') : 'NONE';
    return csv(['*ContactName', 'EmailAddress', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'Currency'],
      list.filter((i) => i.status !== 'void').map((i) => [i.company || i.name, i.email, i.number, i.order_ref, dmy(i.issued_at), dmy(i.due_at), desc(i), 1,
        rand(i.subtotal_cents || i.amount_cents), s.xero_sales_account || '200', tax, 'ZAR']));
  }
  if (kind === 'sage') {
    return csv(['Document Date', 'Document Number', 'Customer Name', 'Customer Email', 'Customer VAT Number', 'Reference', 'Description',
      'Exclusive Amount', 'VAT Amount', 'Inclusive Amount', 'Status', 'Date Paid'],
      list.map((i) => [dmy(i.issued_at), i.number, i.company || i.name, i.email, i.vat_number || '', i.order_ref, desc(i),
        rand(i.subtotal_cents || i.amount_cents), rand(i.vat_cents), rand(i.amount_cents), i.status, dmy(i.paid_at)]));
  }
  throw new Error('Unknown export');
}
