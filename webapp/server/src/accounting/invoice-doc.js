// Invoice documents. When the business is VAT registered the document is a full "Tax Invoice"
// with the details SARS requires (VAT Act s20): the words "Tax Invoice", supplier name, address and
// VAT number; recipient name, address and VAT number (needed above R5 000); an individual serial
// number; date of issue; description; value, VAT charged and total.
import { db, row, rows } from '../db.js';
import { getSettings } from '../settings.js';

export function invoiceDocument(invoiceId) {
  const inv = row(db.prepare(`SELECT i.*, o.reference AS order_ref, o.user_id, s.name AS service_name, st.name AS tier_name, st.plan,
      u.name AS client_name, u.email AS client_email, u.company AS client_company, u.billing_address, u.vat_number AS client_vat
    FROM invoices i JOIN orders o ON o.id = i.order_id JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
    JOIN users u ON u.id = o.user_id WHERE i.id = ?`).get(invoiceId));
  if (!inv) return null;
  const s = getSettings();
  const vatRegistered = Boolean(s.vat_registered && s.vat_no);
  return {
    ...inv,
    title: vatRegistered ? 'Tax Invoice' : 'Invoice',
    supplier: {
      name: s.legal_name || s.business_name, trading_as: s.business_name,
      address: [s.street_address, s.address_locality, s.address_region, s.postal_code, 'South Africa'].filter(Boolean).join(', '),
      vat_no: vatRegistered ? s.vat_no : null, company_reg_no: s.company_reg_no || null, email: s.billing_email || s.email, phone: s.phone, website: s.website,
    },
    recipient: { name: inv.client_company || inv.client_name, contact: inv.client_name, email: inv.client_email, address: inv.billing_address || null, vat_no: inv.client_vat || null },
    lines: [{ description: `${inv.service_name} — ${inv.tier_name}${inv.description ? ` · ${inv.description}` : ''} (${inv.order_ref})`, quantity: 1, unit_cents: inv.subtotal_cents || inv.amount_cents, total_cents: inv.subtotal_cents || inv.amount_cents }],
    vat_rate: vatRegistered ? Number(s.vat_rate) : 0,
    payments: rows(db.prepare("SELECT reference, gateway, amount_cents, updated_at FROM payments WHERE invoice_id = ? AND status = 'complete'").all(inv.id)),
    needs_recipient_details: vatRegistered && inv.amount_cents > 500000 && (!inv.billing_address),
  };
}
