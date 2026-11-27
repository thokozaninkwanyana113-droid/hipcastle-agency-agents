// Delivery integrations on an engagement: links (site, repo, Search Console, GA4, ad account,
// tender keywords), reports for the client portal, and emails from the client logged by M365.
import { Router } from 'express';
import { db, row, rows } from '../db.js';
import { body, id, webUrl, z } from '../validate.js';
import { authenticate, isStaff, requireRole } from '../auth.js';
import { logEvent } from '../events.js';
import { linksOf, PROVIDERS, refreshReport, reportsFor } from '../integrations/reports.js';
import { checkSite } from '../integrations/monitor.js';
import { repoOk } from '../integrations/github.js';
import { adAccountOk } from '../integrations/meta.js';

const r = Router();
r.use(authenticate);
const staffOnly = requireRole('admin', 'staff');

function loadOrder(req, res) {
  const oid = id(req.params.orderId);
  const o = oid && row(db.prepare('SELECT o.id, o.reference, o.user_id, o.status, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?').get(oid));
  if (!o || (!isStaff(req.user) && o.user_id !== req.user.id)) { res.status(404).json({ error: 'Engagement not found' }); return null; }
  return o;
}
const view = (o, staff) => ({
  links: staff ? linksOf(o.id) : (({ tender_keywords, ...l }) => l)(linksOf(o.id)),
  reports: reportsFor(o.id, { staff }),
  ...(staff && { inbox: rows(db.prepare(`SELECT from_email, from_name, subject, preview, received_at FROM inbound_emails WHERE user_id = ? OR lead_id IN (SELECT id FROM leads WHERE lower(email) = lower(?))
    ORDER BY received_at DESC LIMIT 10`).all(o.user_id, o.email)) }),
});

r.get('/:orderId', (req, res) => { const o = loadOrder(req, res); if (o) res.json(view(o, isStaff(req.user))); });

const opt = (schema) => z.union([z.literal(''), schema]).optional();
r.put('/:orderId/links', staffOnly, body(z.object({
  site_url: opt(webUrl()),
  github_repo: opt(z.string().trim().refine(repoOk, 'Use owner/name, e.g. hipcastle/khumalo-site')),
  gsc_property: opt(z.string().trim().regex(/^(https?:\/\/\S+\/|sc-domain:[a-z0-9.-]+)$/i, 'Use https://example.co.za/ or sc-domain:example.co.za')),
  ga4_property: opt(z.string().trim().regex(/^\d{6,12}$/, 'The numeric GA4 property ID (Admin → Property details)')),
  meta_ad_account: opt(z.string().trim().refine(adAccountOk, 'The numeric ad account ID')),
  tender_keywords: opt(z.string().trim().max(300)),
})), (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  const cur = linksOf(o.id);
  const v = (k) => (req.body[k] === undefined ? cur[k] ?? null : req.body[k] || null);
  db.prepare(`INSERT INTO engagement_links (order_id, site_url, github_repo, gsc_property, ga4_property, meta_ad_account, tender_keywords) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET site_url = excluded.site_url, github_repo = excluded.github_repo, gsc_property = excluded.gsc_property, ga4_property = excluded.ga4_property,
    meta_ad_account = excluded.meta_ad_account, tender_keywords = excluded.tender_keywords, updated_at = datetime('now')`)
    .run(o.id, v('site_url'), v('github_repo'), v('gsc_property'), v('ga4_property'), String(v('meta_ad_account') || '').replace(/^act_/, '') || null, v('tender_keywords'));
  logEvent('integration.links', `${o.reference}: integrations updated by ${req.user.name}`, { actor: req.user.id, ref: o.reference });
  res.json(view(o, true));
});

r.post('/:orderId/reports/:provider/refresh', staffOnly, async (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  if (!PROVIDERS[req.params.provider]) return res.status(404).json({ error: 'Unknown report' });
  try { await refreshReport(o.id, req.params.provider); res.json(view(o, true)); } catch (err) { res.status(err.status || 502).json({ error: err.message }); }
});

r.post('/:orderId/monitor/check', staffOnly, async (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  const l = linksOf(o.id);
  if (!l.site_url) return res.status(409).json({ error: 'Add the site URL first' });
  const c = await checkSite(l.site_url);
  db.prepare('INSERT INTO site_checks (order_id, ok, status_code, ms, error, ssl_days) VALUES (?, ?, ?, ?, ?, ?)').run(o.id, c.ok ? 1 : 0, c.status_code, c.ms, c.error, c.ssl_days);
  res.json(view(o, true));
});

export default r;
