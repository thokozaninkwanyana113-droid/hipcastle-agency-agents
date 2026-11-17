// PayFast integration: checkout form generation and ITN (Instant Transaction Notification) verification.
// Docs: https://developers.payfast.co.za/docs
import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { payfastConfig } from './config.js';

/** PHP urlencode(): spaces as '+', uppercase hex, and encodes !'()*~ too. */
export const phpUrlencode = (v) =>
  encodeURIComponent(String(v)).replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

const md5 = (s) => createHash('md5').update(s).digest('hex');

// Field order matters for the signature: it must follow PayFast's documented attribute order.
const FIELD_ORDER = [
  'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
  'name_first', 'name_last', 'email_address', 'cell_number',
  'm_payment_id', 'amount', 'item_name', 'item_description',
  'custom_int1', 'custom_int2', 'custom_int3', 'custom_int4', 'custom_int5',
  'custom_str1', 'custom_str2', 'custom_str3', 'custom_str4', 'custom_str5',
  'email_confirmation', 'confirmation_address', 'payment_method',
  // Recurring billing (subscriptions) — after the transaction options, per PayFast's attribute order.
  'subscription_type', 'billing_date', 'recurring_amount', 'frequency', 'cycles',
  'subscription_notify_email', 'subscription_notify_webhook', 'subscription_notify_buyer',
];

/** Signature for an outgoing checkout request (empty fields are excluded). */
export function checkoutSignature(fields, passphrase) {
  const parts = FIELD_ORDER
    .filter((k) => fields[k] !== undefined && fields[k] !== null && String(fields[k]).trim() !== '')
    .map((k) => `${k}=${phpUrlencode(String(fields[k]).trim())}`);
  if (passphrase) parts.push(`passphrase=${phpUrlencode(passphrase.trim())}`);
  return md5(parts.join('&'));
}

/**
 * @param recurringCents  when set, the payment also creates a monthly subscription (card tokenised);
 *                        PayFast charges this amount every month from today until cancelled.
 */
export function buildCheckout({ reference, amountCents, itemName, description, user, invoiceNumber, returnUrl, cancelUrl, notifyUrl, recurringCents = null }) {
  const cfg = payfastConfig();
  const [first, ...rest] = (user.name || '').trim().split(/\s+/);
  const fields = {
    merchant_id: cfg.merchant_id,
    merchant_key: cfg.merchant_key,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    name_first: first?.slice(0, 100),
    name_last: rest.join(' ').slice(0, 100) || undefined,
    email_address: user.email,
    m_payment_id: reference,
    amount: (amountCents / 100).toFixed(2),
    item_name: itemName.slice(0, 100),
    item_description: description?.slice(0, 255),
    custom_str1: invoiceNumber,
    ...(recurringCents && {
      subscription_type: 1,                                  // 1 = subscription
      billing_date: new Date().toISOString().slice(0, 10),   // first charge today, then monthly
      recurring_amount: (recurringCents / 100).toFixed(2),
      frequency: 3,                                          // 3 = monthly
      cycles: 0,                                             // 0 = until cancelled
    }),
  };
  for (const k of Object.keys(fields)) if (fields[k] === undefined || fields[k] === '') delete fields[k];
  const ordered = Object.fromEntries(FIELD_ORDER.filter((k) => k in fields).map((k) => [k, fields[k]]));
  // The shared sandbox account rejects signatures made without its (unknown) passphrase but accepts unsigned requests.
  if (!cfg.sandboxDefaults) ordered.signature = checkoutSignature(ordered, cfg.passphrase);
  return { action: `https://${cfg.host}/eng/process`, method: 'POST', fields: ordered };
}

/**
 * Parse an ITN body (raw application/x-www-form-urlencoded string) preserving field order,
 * and rebuild the parameter string PayFast signed (all fields except `signature`).
 */
export function parseItn(rawBody) {
  const pairs = [...new URLSearchParams(rawBody).entries()];
  const data = Object.fromEntries(pairs);
  const paramString = pairs.filter(([k]) => k !== 'signature').map(([k, v]) => `${k}=${phpUrlencode(v.trim())}`).join('&');
  return { data, paramString };
}

export function verifyItnSignature({ data, paramString }, passphrase = payfastConfig().passphrase) {
  const withPass = passphrase ? `${paramString}&passphrase=${phpUrlencode(passphrase.trim())}` : paramString;
  return typeof data.signature === 'string' && md5(withPass) === data.signature.toLowerCase();
}

/** Ask PayFast to confirm the ITN data is genuine. */
export async function validateWithPayfast(paramString) {
  const cfg = payfastConfig();
  const res = await fetch(`https://${cfg.host}/eng/query/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: paramString,
    signal: AbortSignal.timeout(10_000),
  });
  return (await res.text()).trim() === 'VALID';
}

/** Check the notification came from a PayFast server. */
export async function isPayfastIp(ip) {
  const hosts = ['www.payfast.co.za', 'sandbox.payfast.co.za', 'w1w.payfast.co.za', 'w2w.payfast.co.za'];
  const clean = String(ip || '').replace(/^::ffff:/, '');
  const lists = await Promise.all(hosts.map((h) => dns.resolve4(h).catch(() => [])));
  return lists.flat().includes(clean);
}

export const PAYFAST_STATUS = { COMPLETE: 'complete', FAILED: 'failed', CANCELLED: 'cancelled', PENDING: 'pending' };

// ---------------------------------------------------------------- Subscriptions API
// https://api.payfast.co.za — signed with header values + passphrase, keys sorted alphabetically.
const API = 'https://api.payfast.co.za';
export function apiSignature(fields, passphrase) {
  const data = { ...fields };
  if (passphrase) data.passphrase = passphrase.trim();
  return md5(Object.keys(data).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(data[k]).trim())}`).join('&'));
}
/** PayFast wants an ISO-8601 timestamp with the local offset, e.g. 2026-11-17T10:00:00+02:00. */
const isoTimestamp = (d = new Date()) => {
  const sast = new Date(d.getTime() + 2 * 3600e3);
  return `${sast.toISOString().slice(0, 19)}+02:00`;
};
export function apiHeaders(cfg = payfastConfig(), now = new Date()) {
  const h = { 'merchant-id': cfg.merchant_id, version: 'v1', timestamp: isoTimestamp(now) };
  return { ...h, signature: apiSignature(h, cfg.passphrase) };
}
async function subscriptionCall(method, token, action) {
  const cfg = payfastConfig();
  if (!/^[\w-]{8,64}$/.test(String(token))) throw new Error('Invalid subscription token');
  const url = `${API}/subscriptions/${encodeURIComponent(token)}/${action}${cfg.host.startsWith('sandbox') ? '?testing=true' : ''}`;
  const res = await fetch(url, { method, headers: apiHeaders(cfg), signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayFast ${action} failed (${res.status}): ${body?.data?.message || body?.message || 'unknown error'}`);
  return body;
}
export const cancelSubscription = (token) => subscriptionCall('PUT', token, 'cancel');
export const fetchSubscription = (token) => subscriptionCall('GET', token, 'fetch');
