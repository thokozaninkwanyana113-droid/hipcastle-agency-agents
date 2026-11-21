// Microsoft 365: reads the shared inbox (e.g. hello@) through Microsoft Graph so replies from leads
// and clients are logged against them in the CRM — the "replies don't reach the system" gap.
// App registration with the Mail.Read application permission (admin consent), ideally limited to
// the one mailbox with an Exchange application access policy.
import { db } from '../db.js';
import { getJson } from './http.js';

export const m365Configured = () => Boolean(process.env.M365_TENANT_ID && process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET && process.env.M365_MAILBOX);
let cached = null;
async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const d = await getJson(`https://login.microsoftonline.com/${encodeURIComponent(process.env.M365_TENANT_ID)}/oauth2/v2.0/token`, {
    method: 'POST', label: 'Microsoft 365', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.M365_CLIENT_ID, client_secret: process.env.M365_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}
export const resetM365 = () => { cached = null; };

/** Pull recent inbox messages and link them to leads/clients by sender address. */
export async function syncMailbox({ hours = 48 } = {}) {
  if (!m365Configured()) throw Object.assign(new Error('Microsoft 365 is not configured'), { status: 400 });
  const since = new Date(Date.now() - hours * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
  const q = new URLSearchParams({ $filter: `receivedDateTime ge ${since}`, $select: 'id,from,subject,bodyPreview,receivedDateTime', $orderby: 'receivedDateTime desc', $top: '50' });
  const d = await getJson(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.M365_MAILBOX)}/mailFolders/inbox/messages?${q}`, { headers: { Authorization: `Bearer ${await token()}` }, label: 'Microsoft 365' });
  const ins = db.prepare(`INSERT OR IGNORE INTO inbound_emails (graph_id, from_email, from_name, subject, preview, received_at, lead_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  let linked = 0; let added = 0;
  for (const m of d.value || []) {
    const email = String(m.from?.emailAddress?.address || '').toLowerCase();
    if (!email || email === String(process.env.M365_MAILBOX).toLowerCase()) continue;
    const lead = db.prepare('SELECT id, status FROM leads WHERE lower(email) = ? ORDER BY id DESC LIMIT 1').get(email);
    const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (!lead && !user) continue; // only log mail from people we know (POPIA: no harvesting strangers)
    const r = ins.run(m.id, email, m.from?.emailAddress?.name || null, (m.subject || '').slice(0, 200), (m.bodyPreview || '').slice(0, 500), m.receivedDateTime, lead?.id ?? null, user?.id ?? null);
    if (r.changes) {
      added++;
      if (lead) { linked++; if (lead.status === 'contacted') db.prepare("UPDATE leads SET status = 'qualified' WHERE id = ? AND status = 'contacted'").run(lead.id); }
    }
  }
  return { added, linked_to_leads: linked };
}
