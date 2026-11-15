// Ozow (instant EFT) integration: payment request + notification hash verification.
// Docs: https://hub.ozow.com/docs
import { createHash } from 'node:crypto';
import { ozowConfig } from './config.js';

const sha512 = (s) => createHash('sha512').update(s).digest('hex');

// Order of the request variables used for HashCheck.
const REQUEST_ORDER = [
  'SiteCode', 'CountryCode', 'CurrencyCode', 'Amount', 'TransactionReference', 'BankReference',
  'Optional1', 'Optional2', 'Optional3', 'Optional4', 'Optional5', 'Customer',
  'CancelUrl', 'ErrorUrl', 'SuccessUrl', 'NotifyUrl', 'IsTest',
];
// Order of the response/notification variables used for Hash.
const RESPONSE_ORDER = [
  'SiteCode', 'TransactionId', 'TransactionReference', 'Amount', 'Status',
  'Optional1', 'Optional2', 'Optional3', 'Optional4', 'Optional5', 'CurrencyCode', 'IsTest', 'StatusMessage',
];

export const requestHash = (fields, privateKey) =>
  sha512((REQUEST_ORDER.map((k) => fields[k] ?? '').join('') + privateKey).toLowerCase());

export const responseHash = (data, privateKey) =>
  sha512((RESPONSE_ORDER.map((k) => data[k] ?? '').join('') + privateKey).toLowerCase());

export function buildCheckout({ reference, amountCents, bankReference, customer, successUrl, cancelUrl, errorUrl, notifyUrl }) {
  const cfg = ozowConfig();
  const fields = {
    SiteCode: cfg.site_code,
    CountryCode: 'ZA',
    CurrencyCode: 'ZAR',
    Amount: (amountCents / 100).toFixed(2),
    TransactionReference: reference,
    BankReference: bankReference.replace(/[^A-Za-z0-9 -]/g, '').slice(0, 20),
    Customer: customer?.slice(0, 100) || '',
    CancelUrl: cancelUrl,
    ErrorUrl: errorUrl,
    SuccessUrl: successUrl,
    NotifyUrl: notifyUrl,
    IsTest: cfg.isTest ? 'true' : 'false',
  };
  fields.HashCheck = requestHash(fields, cfg.private_key);
  return { action: 'https://pay.ozow.com', method: 'POST', fields };
}

export function verifyNotification(data, privateKey = ozowConfig().private_key) {
  return typeof data.Hash === 'string' && responseHash(data, privateKey) === data.Hash.toLowerCase();
}

/** Optional server-to-server double check using the Ozow API (requires OZOW_API_KEY). */
export async function fetchTransactionStatus(reference) {
  const cfg = ozowConfig();
  if (!cfg.api_key) return null;
  const url = `https://api.ozow.com/GetTransactionByReference?siteCode=${encodeURIComponent(cfg.site_code)}&transactionReference=${encodeURIComponent(reference)}${cfg.isTest ? '&isTest=true' : ''}`;
  const res = await fetch(url, { headers: { ApiKey: cfg.api_key, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const list = await res.json();
  return Array.isArray(list) ? list[0] : list;
}

export const OZOW_STATUS = {
  Complete: 'complete', Cancelled: 'cancelled', Error: 'failed', Abandoned: 'abandoned',
  PendingInvestigation: 'pending', Pending: 'pending',
};
