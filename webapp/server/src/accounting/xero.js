// Xero (accounting) integration: OAuth 2.0 connection and API calls.
//   XERO_CLIENT_ID / XERO_CLIENT_SECRET   from developer.xero.com → My Apps (Web app)
//   Redirect URI to register in Xero:      <SITE_URL>/api/integrations/xero/callback
//   XERO_SCOPES                           optional override. Default uses Xero's granular scopes
//                                         (all Web apps have them since March 2026).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, row } from '../db.js';
import { seal, open } from '../crypto-box.js';
import { canonicalUrl } from '../urls.js';

const AUTH = 'https://login.xero.com/identity/connect/authorize';
const TOKEN = 'https://identity.xero.com/connect/token';
const API = 'https://api.xero.com';
const SCOPES = () => process.env.XERO_SCOPES || 'offline_access accounting.contacts accounting.invoices accounting.payments';

export const xeroConfigured = () => Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
export const redirectUri = () => `${canonicalUrl()}/api/integrations/xero/callback`;

// OAuth state: signed, short-lived, ties the callback to the admin who started it.
const stateKey = () => process.env.JWT_SECRET || 'dev-insecure-secret';
export function makeState(userId) {
  const body = `${userId}.${Date.now()}.${randomBytes(8).toString('hex')}`;
  return `${body}.${createHmac('sha256', stateKey()).update(body).digest('hex').slice(0, 32)}`;
}
export function readState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 4) return null;
  const body = parts.slice(0, 3).join('.');
  const sig = Buffer.from(createHmac('sha256', stateKey()).update(body).digest('hex').slice(0, 32));
  if (sig.length !== parts[3].length || !timingSafeEqual(sig, Buffer.from(parts[3]))) return null;
  if (Date.now() - Number(parts[1]) > 15 * 60_000) return null;
  return { userId: Number(parts[0]) };
}

export const authorizeUrl = (userId) => `${AUTH}?${new URLSearchParams({
  response_type: 'code', client_id: process.env.XERO_CLIENT_ID, redirect_uri: redirectUri(), scope: SCOPES(), state: makeState(userId),
})}`;

async function tokenRequest(params) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}` },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Xero token request failed (${res.status}): ${j.error || 'unknown'}`);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in - 60) * 1000 };
}

/** Finish the OAuth flow: exchange the code, pick the organisation, store tokens encrypted. */
export async function connect(code, userId) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  const res = await fetch(`${API}/connections`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15_000) });
  const orgs = (await res.json().catch(() => [])).filter((c) => c.tenantType === 'ORGANISATION');
  if (!orgs.length) throw new Error('No Xero organisation was authorised');
  const org = orgs[0];
  db.prepare(`INSERT INTO integrations (provider, data, label, connected_by, updated_at) VALUES ('xero', ?, ?, ?, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET data = excluded.data, label = excluded.label, connected_by = excluded.connected_by, updated_at = excluded.updated_at`)
    .run(seal({ ...tokens, tenant_id: org.tenantId }), org.tenantName, userId);
  return org.tenantName;
}

export function connection() {
  const r = row(db.prepare("SELECT * FROM integrations WHERE provider = 'xero'").get());
  if (!r) return null;
  try { return { ...open(r.data), label: r.label, updated_at: r.updated_at }; } catch { return null; }
}
export const disconnect = () => db.prepare("DELETE FROM integrations WHERE provider = 'xero'").run();

async function accessToken() {
  const c = connection();
  if (!c) throw new Error('Xero is not connected');
  if (Date.now() < c.expires_at) return c;
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
  db.prepare("UPDATE integrations SET data = ?, updated_at = datetime('now') WHERE provider = 'xero'").run(seal({ ...fresh, tenant_id: c.tenant_id }));
  return { ...c, ...fresh };
}

/** Call the Xero Accounting API. Throws with Xero's validation message on errors. */
export async function xero(method, path, body) {
  const c = await accessToken();
  const res = await fetch(`${API}/api.xro/2.0/${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.access_token}`, 'xero-tenant-id': c.tenant_id, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j?.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).join('; ') || j?.Message || j?.Detail || `HTTP ${res.status}`;
    const err = new Error(`Xero ${method} ${path}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return j;
}
