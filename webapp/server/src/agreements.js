// Service agreements: generated per engagement from the package, brief and standard terms, and
// signed electronically before the first payment. Under South Africa's Electronic Communications
// and Transactions Act (ECTA, s13), an electronic signature is valid for service contracts like
// these; we record the signer's typed name, email, account, time, IP, browser and the SHA-256 of
// the exact text they signed. Have the template reviewed by your attorney before launch.
import { createHash } from 'node:crypto';
import { db, row } from './db.js';
import { getSettings } from './settings.js';
import { logEvent } from './events.js';
import { REVISIONS, SUPPORT_DAYS } from './playbooks.js';
import { rand } from './content.js';

export const AGREEMENT_VERSION = '2026-11';
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const loadOrder = (id) => row(db.prepare(`SELECT o.*, st.tier, st.plan, st.name AS tier_name, st.billing, st.delivery_days, st.summary, st.features, st.care_minutes,
    s.name AS service_name, u.name AS client_name, u.email AS client_email, u.company AS client_company, u.billing_address, u.vat_number AS client_vat
  FROM orders o JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id JOIN users u ON u.id = o.user_id WHERE o.id = ?`).get(id), ['features']);

export function requiresSignature(o, s = getSettings()) {
  if (o.plan === 'care') return false; // month-to-month aftercare: accepted at checkout
  if (o.billing === 'monthly') return Boolean(s.agreement_for_retainers);
  return o.price_cents >= Number(s.agreement_min_cents ?? 1500000);
}

export function agreementText(o, s = getSettings()) {
  const supplier = s.legal_name || s.business_name;
  const monthly = o.billing === 'monthly';
  const vat = s.vat_registered ? `excluding VAT at ${s.vat_rate}%` : 'no VAT is charged (the supplier is not VAT registered)';
  const revisions = REVISIONS[o.tier] === null ? 'unlimited' : `${REVISIONS[o.tier] ?? 3}`;
  return `SERVICE AGREEMENT — ${o.reference}

1. PARTIES
Supplier: ${supplier}${s.company_reg_no ? ` (registration no. ${s.company_reg_no})` : ''}, trading as ${s.business_name}, ${[s.street_address, s.address_locality, s.address_region].filter(Boolean).join(', ')}, South Africa. ${s.email}.
Client: ${o.client_company ? `${o.client_company}, represented by ${o.client_name}` : o.client_name} (${o.client_email})${o.billing_address ? `, ${o.billing_address}` : ''}${o.client_vat ? `, VAT no. ${o.client_vat}` : ''}.

2. SERVICES
${o.service_name} — ${o.tier_name}: ${o.summary}
Included: ${o.features.join('; ')}.
Client brief: "${String(o.brief).slice(0, 2000)}"
Scope is confirmed at the kick-off call. Work outside this scope is quoted in writing first and only starts once the Client approves it.

3. FEES AND PAYMENT
${monthly
    ? `${rand(o.price_cents)} per month, ${vat}, invoiced monthly in advance. The first month is payable before work starts. Monthly invoices are payable within 7 days, or charged automatically if the Client opts in to card payments through PayFast.`
    : `${rand(o.price_cents)}, ${vat}. 50% deposit is payable before work starts; the balance is invoiced on delivery and payable within 7 days.`}
Payments are made through PayFast, Ozow or EFT. The Supplier may pause work on invoices more than 14 days overdue, after written notice.

4. DELIVERY AND APPROVALS
${monthly
    ? 'Each month follows a plan agreed with the Client, delivered through the client portal, with a monthly report.'
    : `Typical delivery is ${o.delivery_days} days from kick-off, re-planned at kick-off and depending on the Client providing content, access and approvals on time.`}
Deliverables are submitted for approval in the client portal. Each deliverable includes ${revisions} revision round(s); further rounds are quoted. A deliverable not commented on within 10 business days of submission is treated as approved.
${monthly ? '' : `After launch the Supplier fixes defects in its work free of charge for ${SUPPORT_DAYS[o.tier] || 14} days.\n`}
5. CLIENT RESPONSIBILITIES
The Client provides accurate information, content and timely feedback, and grants access by inviting the Supplier to its systems. The Client must not send passwords, card numbers or ID numbers through messages; the Supplier will ask for secure invitations instead. The Client confirms it has the right to use any material it supplies.

6. INTELLECTUAL PROPERTY
On payment in full, ownership of the final deliverables created for the Client passes to the Client. The Supplier keeps its pre-existing tools, code libraries, templates and know-how, and grants the Client a perpetual licence to use them as part of the deliverables. Third-party items (fonts, stock images, plugins, platforms) remain subject to their own licences. The Supplier may show the work in its portfolio unless the Client asks it not to in writing.

7. CONFIDENTIALITY AND PERSONAL INFORMATION (POPIA)
Each party keeps the other's confidential information confidential. Where the Supplier processes personal information on the Client's behalf it acts as an operator under the Protection of Personal Information Act 4 of 2013: it processes it only on the Client's instructions and for this agreement, keeps it secure, does not sell it, and notifies the Client without undue delay of any security compromise.

8. TERM AND CANCELLATION
${monthly
    ? 'This agreement continues month to month. Either party may cancel with 30 days\' written notice (a message in the client portal is sufficient). Fees for work already done are payable.'
    : 'The Client may cancel before the deposit is paid at no cost. After work starts, the deposit covers work scheduled and done and is not refundable except where the Consumer Protection Act requires otherwise; work completed beyond the deposit value is payable.'}
Either party may terminate on written notice if the other materially breaches this agreement and does not fix the breach within 14 days.

9. LIABILITY
The Supplier performs the services with reasonable skill and care. To the extent the law allows, the Supplier's total liability under this agreement is limited to the fees paid by the Client in the ${monthly ? 'three months' : 'project'} before the claim, and neither party is liable for indirect or consequential loss, such as lost profits. Nothing limits liability that cannot be limited by law, including under the Consumer Protection Act where it applies.

10. GENERAL
This agreement, with the Supplier's terms of service at ${s.website || ''}/terms, is the whole agreement. Changes must be agreed in writing (the client portal counts). South African law applies. The parties agree that this agreement may be concluded and signed electronically, as permitted by the Electronic Communications and Transactions Act 25 of 2002.

Agreement version ${AGREEMENT_VERSION}.`;
}

export function createAgreement(orderId, { acceptedAtCheckout = false, user = null, ip = null, agent = null } = {}) {
  const o = loadOrder(orderId);
  const doc = agreementText(o);
  const needs = requiresSignature(o);
  const accepted = !needs && acceptedAtCheckout;
  db.prepare(`INSERT OR IGNORE INTO agreements (order_id, version, document, doc_hash, requires_signature, status, method, signer_name, signer_email, signer_user_id, signed_at, signer_ip, signer_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${accepted ? "datetime('now')" : 'NULL'}, ?, ?)`)
    .run(o.id, AGREEMENT_VERSION, doc, sha256(doc), needs ? 1 : 0, accepted ? 'accepted' : 'pending', accepted ? 'checkout' : null,
      accepted ? o.client_name : null, accepted ? o.client_email : null, accepted ? user?.id ?? null : null, accepted ? ip : null, accepted ? String(agent || '').slice(0, 300) : null);
  return getAgreement(o.id);
}

export const getAgreement = (orderId) => row(db.prepare('SELECT * FROM agreements WHERE order_id = ?').get(orderId));
export const agreementBlocksPayment = (orderId) => {
  const a = getAgreement(orderId);
  return Boolean(a && a.requires_signature && a.status !== 'signed');
};

export function signAgreement(orderId, { user, full_name, title = '', ip, agent }) {
  const a = getAgreement(orderId);
  if (!a) throw Object.assign(new Error('No agreement for this engagement'), { status: 404 });
  if (a.status === 'signed') return a;
  if (sha256(a.document) !== a.doc_hash) throw Object.assign(new Error('Agreement text changed — contact us'), { status: 409 });
  db.prepare(`UPDATE agreements SET status = 'signed', method = 'signature', signer_name = ?, signer_title = ?, signer_email = ?, signer_user_id = ?,
    signed_at = datetime('now'), signer_ip = ?, signer_agent = ? WHERE id = ?`)
    .run(full_name, title || null, user.email, user.id, ip, String(agent || '').slice(0, 300), a.id);
  const ref = db.prepare('SELECT reference FROM orders WHERE id = ?').get(orderId).reference;
  logEvent('agreement.signed', `${ref}: service agreement signed by ${full_name}${title ? ` (${title})` : ''}`, { actor: user.id, ref });
  return getAgreement(orderId);
}

/** Public summary (no IP/agent) for the client portal. */
export const agreementSummary = (a, staff = false) => a && ({
  status: a.status, requires_signature: Boolean(a.requires_signature), method: a.method, version: a.version, doc_hash: a.doc_hash,
  signer_name: a.signer_name, signer_title: a.signer_title, signed_at: a.signed_at,
  ...(staff && { signer_email: a.signer_email, signer_ip: a.signer_ip, signer_agent: a.signer_agent }),
});
