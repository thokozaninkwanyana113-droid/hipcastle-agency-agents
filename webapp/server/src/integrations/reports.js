// Engagement reports: pull each linked service's latest numbers into the portal, monthly and on demand.
import { db, row, rows } from '../db.js';
import { logEvent } from '../events.js';
import { pageSpeed, searchConsole, ga4, googleConfigured } from './google.js';
import { githubConfigured, repoActivity } from './github.js';
import { metaAdsConfigured, metaAdsInsights } from './meta.js';
import { matchTenders } from './etenders.js';
import { uptimeSummary } from './monitor.js';

export const PROVIDERS = {
  pagespeed: { label: 'Speed & quality (PageSpeed)', link: 'site_url', ready: () => Boolean(process.env.PAGESPEED_API_KEY), run: (l) => pageSpeed(l.site_url) },
  github: { label: 'Development activity (GitHub)', link: 'github_repo', ready: githubConfigured, run: (l) => repoActivity(l.github_repo) },
  search_console: { label: 'Google Search (Search Console)', link: 'gsc_property', ready: googleConfigured, run: (l) => searchConsole(l.gsc_property) },
  ga4: { label: 'Website visitors (Google Analytics)', link: 'ga4_property', ready: googleConfigured, run: (l) => ga4(l.ga4_property) },
  meta_ads: { label: 'Facebook & Instagram ads (Meta)', link: 'meta_ad_account', ready: metaAdsConfigured, run: (l) => metaAdsInsights(l.meta_ad_account) },
  tenders: { label: 'Matching government tenders (eTenders)', link: 'tender_keywords', ready: () => true, run: (l) => ({ keywords: l.tender_keywords, matches: matchTenders(l.tender_keywords) }) },
};

export const linksOf = (orderId) => row(db.prepare('SELECT * FROM engagement_links WHERE order_id = ?').get(orderId)) || { order_id: orderId };

/** Refresh one provider's report for an engagement (stores errors too, so the team can see them). */
export async function refreshReport(orderId, provider) {
  const p = PROVIDERS[provider];
  const l = linksOf(orderId);
  if (!p || !l[p.link]) throw Object.assign(new Error('Nothing linked for that report'), { status: 409 });
  if (!p.ready()) throw Object.assign(new Error(`${p.label} isn’t configured yet — see Command Centre → Integrations.`), { status: 400 });
  try {
    const data = await p.run(l);
    db.prepare('INSERT INTO engagement_reports (order_id, provider, data) VALUES (?, ?, ?)').run(orderId, provider, JSON.stringify(data));
  } catch (err) {
    db.prepare('INSERT INTO engagement_reports (order_id, provider, data, error) VALUES (?, ?, ?, ?)').run(orderId, provider, '{}', err.message.slice(0, 300));
    throw err;
  }
  db.prepare('DELETE FROM engagement_reports WHERE order_id = ? AND provider = ? AND id NOT IN (SELECT id FROM engagement_reports WHERE order_id = ? AND provider = ? ORDER BY id DESC LIMIT 12)').run(orderId, provider, orderId, provider);
}

/** Latest successful report per provider, plus live uptime. */
export function reportsFor(orderId, { staff = false } = {}) {
  const l = linksOf(orderId);
  const out = {};
  for (const [key, p] of Object.entries(PROVIDERS)) {
    if (!l[p.link]) continue;
    if (key === 'tenders' && !staff) continue; // tender leads are worked by the team, then shared
    const last = row(db.prepare('SELECT data, created_at FROM engagement_reports WHERE order_id = ? AND provider = ? AND error IS NULL ORDER BY id DESC LIMIT 1').get(orderId, key));
    const err = staff ? row(db.prepare('SELECT error, created_at FROM engagement_reports WHERE order_id = ? AND provider = ? ORDER BY id DESC LIMIT 1').get(orderId, key)) : null;
    out[key] = { label: p.label, data: last ? JSON.parse(last.data) : null, updated_at: last?.created_at || null, ...(staff && { configured: p.ready(), last_error: err?.error || null }) };
  }
  if (l.site_url) out.monitor = { label: 'Uptime monitoring', data: uptimeSummary(orderId) };
  return out;
}

/** Monthly refresh for every linked engagement (job). Reports older than `days` are refreshed. */
export async function refreshDueReports({ days = 30, limit = 40 } = {}) {
  const links = rows(db.prepare(`SELECT l.* FROM engagement_links l JOIN orders o ON o.id = l.order_id WHERE o.status IN ('active','in_review','completed')`).all());
  let done = 0; let failed = 0;
  for (const l of links) {
    for (const [key, p] of Object.entries(PROVIDERS)) {
      if (done + failed >= limit) break;
      if (!l[p.link] || !p.ready()) continue;
      const fresh = db.prepare(`SELECT 1 FROM engagement_reports WHERE order_id = ? AND provider = ? AND created_at > datetime('now', ?)`).get(l.order_id, key, `-${key === 'tenders' ? 1 : days} days`);
      if (fresh) continue;
      try { await refreshReport(l.order_id, key); done++; } catch (err) { failed++; logEvent('integration.report_failed', `Report ${key} for order #${l.order_id}: ${err.message}`.slice(0, 300), { level: 'warn' }); }
    }
  }
  return `${done} report(s) refreshed${failed ? `, ${failed} failed` : ''}`;
}
