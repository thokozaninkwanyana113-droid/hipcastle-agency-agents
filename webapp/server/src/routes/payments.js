import express, { Router } from 'express';
import { db, row } from '../db.js';
import { body, z } from '../validate.js';
import { authenticate, isStaff } from '../auth.js';
import { logEvent } from '../events.js';
import { getSettings } from '../settings.js';
import { availableGateways, notifyBase, ozowConfig, payfastConfig, siteUrl } from '../payments/config.js';
import * as payfast from '../payments/payfast.js';
import * as ozow from '../payments/ozow.js';
import { applyPaymentStatus, findPayment, newReference } from '../payments/service.js';

const r = Router();
const formBody = express.text({ type: 'application/x-www-form-urlencoded', limit: '50kb' });
const TERMINAL = ['complete', 'failed', 'cancelled', 'abandoned'];

r.get('/methods', (_req, res) => res.json(availableGateways()));

// ---- Start a payment for an invoice -------------------------------------------------
r.post('/checkout', authenticate, body(z.object({
  invoice_id: z.number().int().positive(),
  gateway: z.enum(['payfast', 'ozow', 'simulated']),
  force: z.boolean().optional(),
})), (req, res) => {
  const inv = row(db.prepare(`SELECT i.*, o.user_id, o.reference AS order_ref, s.name AS service_name, st.name AS tier_name
    FROM invoices i JOIN orders o ON o.id = i.order_id JOIN service_tiers st ON st.id = o.tier_id
    JOIN services s ON s.id = st.service_id WHERE i.id = ?`).get(req.body.invoice_id));
  if (!inv || (inv.user_id !== req.user.id && !isStaff(req.user))) return res.status(404).json({ error: 'Invoice not found' });
  if (inv.status !== 'unpaid') return res.status(409).json({ error: `Invoice is already ${inv.status}` });
  // Prevent double payments: refuse a new checkout while another one for this invoice may still complete.
  const inFlight = db.prepare(`SELECT reference FROM payments WHERE invoice_id = ? AND status IN ('initiated','pending')
    AND created_at > datetime('now','-30 minutes')`).get(inv.id);
  if (inFlight && !req.body.force) {
    return res.status(409).json({ error: 'A payment for this invoice was started in the last 30 minutes and may still be confirming. Please wait a few minutes, or cancel that attempt first.', code: 'payment_in_progress', reference: inFlight.reference });
  }
  if (!availableGateways().some((g) => g.id === req.body.gateway)) {
    return res.status(400).json({ error: 'That payment method is not available right now' });
  }

  const reference = newReference();
  const gateway = req.body.gateway;
  db.prepare(`INSERT INTO payments (reference, invoice_id, user_id, gateway, amount_cents, is_test) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(reference, inv.id, req.user.id, gateway, inv.amount_cents, gateway === 'simulated' || process.env.PAYMENTS_MODE !== 'live' ? 1 : 0);
  logEvent('payment.initiated', `${gateway} checkout started for ${inv.number} (${reference})`, { actor: req.user.id, ref: reference });

  const back = (status) => `${siteUrl()}/api/payments/return?ref=${reference}${status ? `&status=${status}` : ''}`;
  const itemName = `${getSettings().business_name}: ${inv.service_name} ${inv.tier_name}`;

  if (gateway === 'simulated') return res.status(201).json({ reference, gateway, redirect: `/payment/simulate?ref=${reference}` });

  if (gateway === 'payfast') {
    const form = payfast.buildCheckout({
      reference, amountCents: inv.amount_cents, itemName, description: `${inv.number} — ${inv.description || inv.order_ref}`,
      user: req.user, invoiceNumber: inv.number,
      returnUrl: back(), cancelUrl: back('cancelled'), notifyUrl: `${notifyBase()}/api/payments/payfast/notify`,
    });
    return res.status(201).json({ reference, gateway, form });
  }

  const form = ozow.buildCheckout({
    reference, amountCents: inv.amount_cents, bankReference: inv.number, customer: req.user.email,
    successUrl: back(), cancelUrl: back('cancelled'), errorUrl: back('error'),
    notifyUrl: `${notifyBase()}/api/payments/ozow/notify`,
  });
  return res.status(201).json({ reference, gateway, form });
});

// ---- Customer comes back from the gateway (GET or POST) ------------------------------
// Never trust the redirect for payment status — only the server-to-server notification.
// Read-only: this URL is public, so it never changes a payment. Status changes come only from
// verified gateway notifications (or the signed-in customer cancelling their own attempt below).
r.all('/return', express.urlencoded({ extended: false }), (req, res) => {
  const ref = String(req.query.ref || req.body?.TransactionReference || '').slice(0, 64);
  const status = ['cancelled', 'error'].includes(String(req.query.status)) ? String(req.query.status) : '';
  res.redirect(303, `${siteUrl()}/payment/return?ref=${encodeURIComponent(ref)}${status ? `&gateway_status=${status}` : ''}`);
});

// The signed-in customer abandons their own unfinished checkout (e.g. after pressing Cancel at the gateway).
r.post('/:ref/cancel', authenticate, (req, res) => {
  const p = findPayment(req.params.ref);
  if (!p || p.user_id !== req.user.id) return res.status(404).json({ error: 'Payment not found' });
  if (p.status !== 'initiated') return res.status(409).json({ error: `This payment is ${p.status}` });
  res.json(applyPaymentStatus(p, 'cancelled', { message: 'Cancelled by customer' }));
});

// ---- Payment status for the return page ---------------------------------------------
r.get('/status/:ref', authenticate, (req, res) => {
  const p = findPayment(req.params.ref);
  if (!p || (p.user_id !== req.user.id && !isStaff(req.user))) return res.status(404).json({ error: 'Payment not found' });
  const inv = row(db.prepare('SELECT number, order_id, amount_cents, status FROM invoices WHERE id = ?').get(p.invoice_id));
  res.json({ reference: p.reference, gateway: p.gateway, status: p.status, amount_cents: p.amount_cents,
    status_message: p.status_message, terminal: TERMINAL.includes(p.status), invoice: inv });
});

// ---- Simulated gateway (development only) --------------------------------------------
r.post('/simulated/:ref', authenticate, body(z.object({ outcome: z.enum(['complete', 'cancelled', 'failed']) })), (req, res) => {
  if (!availableGateways().some((g) => g.id === 'simulated')) return res.status(404).json({ error: 'Not available' });
  const p = findPayment(req.params.ref);
  if (!p || p.gateway !== 'simulated' || (p.user_id !== req.user.id && !isStaff(req.user))) return res.status(404).json({ error: 'Payment not found' });
  res.json(applyPaymentStatus(p, req.body.outcome, { txnId: `SIM-${Date.now()}`, message: 'Simulated payment' }));
});

// ---- PayFast ITN ---------------------------------------------------------------------
r.post('/payfast/notify', formBody, async (req, res) => {
  res.sendStatus(200); // PayFast requires a fast 200; processing continues below.
  const raw = typeof req.body === 'string' ? req.body : '';
  const itn = payfast.parseItn(raw);
  const ref = itn.data.m_payment_id;
  const fail = (msg) => logEvent('payment.itn_rejected', `PayFast ITN for ${ref || 'unknown'} rejected: ${msg}`, { level: 'error', ref, meta: { ip: req.ip } });
  try {
    const cfg = payfastConfig();
    if (!payfast.verifyItnSignature(itn)) return fail('invalid signature');
    const p = ref && findPayment(ref);
    if (!p || p.gateway !== 'payfast') return fail('unknown payment reference');
    if (itn.data.merchant_id !== cfg.merchant_id) return fail('merchant mismatch');
    if (Math.abs(Number(itn.data.amount_gross) * 100 - p.amount_cents) > 1) return fail(`amount mismatch (${itn.data.amount_gross})`);
    if (cfg.checkIp && !(await payfast.isPayfastIp(req.ip))) return fail(`untrusted source IP ${req.ip}`);
    if (cfg.validateRemote && !(await payfast.validateWithPayfast(itn.paramString))) return fail('PayFast server validation failed');
    const status = payfast.PAYFAST_STATUS[itn.data.payment_status] || 'pending';
    applyPaymentStatus(p, status, { txnId: itn.data.pf_payment_id, message: itn.data.payment_status, raw: itn.data });
    logEvent('payment.itn', `PayFast ITN ${itn.data.payment_status} for ${ref}`, { ref });
  } catch (err) {
    fail(err.message);
  }
});

// ---- Ozow notification ---------------------------------------------------------------
r.post('/ozow/notify', express.urlencoded({ extended: false }), express.json(), async (req, res) => {
  const data = req.body || {};
  const ref = data.TransactionReference;
  const fail = (msg, code = 400) => {
    logEvent('payment.notify_rejected', `Ozow notification for ${ref || 'unknown'} rejected: ${msg}`, { level: 'error', ref, meta: { ip: req.ip } });
    res.status(code).send('Rejected');
  };
  try {
    const cfg = ozowConfig();
    if (!cfg.configured) return fail('Ozow not configured', 503);
    if (!ozow.verifyNotification(data)) return fail('invalid hash');
    if (data.SiteCode !== cfg.site_code) return fail('site code mismatch');
    const p = ref && findPayment(ref);
    if (!p || p.gateway !== 'ozow') return fail('unknown payment reference', 404);
    if (Math.abs(Number(data.Amount) * 100 - p.amount_cents) > 1) return fail(`amount mismatch (${data.Amount})`);
    if (String(data.IsTest).toLowerCase() === 'true' && process.env.PAYMENTS_MODE === 'live') return fail('test transaction in live mode');
    let status = ozow.OZOW_STATUS[data.Status] || 'pending';
    if (status === 'complete' && cfg.api_key) {
      const check = await ozow.fetchTransactionStatus(ref).catch(() => null);
      if (check && check.status && check.status !== 'Complete') status = 'pending';
    }
    applyPaymentStatus(p, status, { txnId: data.TransactionId, message: data.StatusMessage || data.Status, raw: data });
    logEvent('payment.notify', `Ozow ${data.Status} for ${ref}`, { ref });
    res.send('OK');
  } catch (err) {
    fail(err.message, 500);
  }
});

export default r;
