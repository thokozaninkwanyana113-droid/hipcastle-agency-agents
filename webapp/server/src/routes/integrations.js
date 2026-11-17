// Third-party integrations: Xero (accounting). Admin-only, except the OAuth callback Xero redirects to.
import { Router } from 'express';
import { db, row } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { logEvent } from '../events.js';
import { canonicalUrl } from '../urls.js';
import { authorizeUrl, connect, disconnect, readState, redirectUri, xeroConfigured } from '../accounting/xero.js';
import { resetFailures, syncAccounting, syncStatus } from '../accounting/sync.js';
import { exportInvoices } from '../accounting/export.js';
import { getSettings } from '../settings.js';

const r = Router();

// Xero redirects the admin's browser here after they approve the connection.
r.get('/integrations/xero/callback', async (req, res) => {
  const back = (q) => res.redirect(303, `${canonicalUrl()}/admin/integrations?${q}`);
  const state = readState(req.query.state);
  const admin = state && row(db.prepare("SELECT id, name, role FROM users WHERE id = ? AND role = 'admin'").get(state.userId));
  if (!admin) return back('xero=error&reason=expired');
  if (req.query.error || !req.query.code) return back(`xero=error&reason=${encodeURIComponent(String(req.query.error || 'cancelled'))}`);
  try {
    const org = await connect(String(req.query.code), admin.id);
    logEvent('integration.xero', `Xero connected to "${org}" by ${admin.name}`, { actor: admin.id });
    back('xero=connected');
  } catch (err) {
    logEvent('integration.xero_failed', `Xero connection failed: ${err.message}`, { level: 'warn', actor: admin.id });
    back(`xero=error&reason=${encodeURIComponent(err.message.slice(0, 120))}`);
  }
});

const admin = Router();
admin.use(authenticate, requireRole('admin'));
admin.get('/', (_req, res) => {
  const s = getSettings();
  res.json({
    xero: { configured: xeroConfigured(), redirect_uri: redirectUri(), ...syncStatus(),
      settings: { xero_sales_account: s.xero_sales_account, xero_bank_account: s.xero_bank_account, xero_tax_type: s.xero_tax_type, accounting_sync_from: s.accounting_sync_from } },
    booking: { url: s.booking_url || null },
  });
});
admin.post('/xero/connect', (req, res) => {
  if (!xeroConfigured()) return res.status(400).json({ error: 'Add XERO_CLIENT_ID and XERO_CLIENT_SECRET first (see the setup steps on this page).' });
  res.json({ url: authorizeUrl(req.user.id) });
});
admin.delete('/xero', (req, res) => {
  disconnect();
  logEvent('integration.xero', `Xero disconnected by ${req.user.name}`, { actor: req.user.id, level: 'warn' });
  res.json({ ok: true });
});
admin.post('/xero/sync', async (req, res) => {
  if (req.body?.retry_failed) resetFailures();
  try { res.json({ result: await syncAccounting({ limit: 100 }), ...syncStatus() }); }
  catch (err) { res.status(502).json({ error: err.message }); }
});
admin.get('/export/:kind', (req, res) => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = iso.test(req.query.from) ? req.query.from : '2000-01-01';
  const to = iso.test(req.query.to) ? req.query.to : '2999-12-31';
  let body;
  try { body = exportInvoices(req.params.kind, from, to); } catch { return res.status(404).json({ error: 'Unknown export' }); }
  logEvent('data.export', `${req.params.kind} invoice export ${from}…${to}`, { actor: req.user.id });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="hipcastle-invoices-${req.params.kind}-${from}-to-${to}.csv"` }).send(body);
});

export { admin as integrationsAdmin };
export default r;
