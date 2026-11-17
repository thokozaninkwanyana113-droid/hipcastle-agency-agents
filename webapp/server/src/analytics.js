// First-party, cookie-free analytics and acquisition attribution (POPIA-friendly):
//  • Page views and daily unique visitors, counted per page and per traffic source. Visitors are
//    identified by a hash of IP + browser + a salt that changes daily and is never stored, so
//    nobody can be tracked across days and no personal information is kept.
//  • First-touch attribution (where a person first came from) is kept in the visitor's own
//    browser and sent with leads, sign-ups and orders, so the Command Centre can show which
//    sources produce paying clients.
import { createHash, createHmac } from 'node:crypto';
import { db, rows } from './db.js';

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|brave)\./;
const SOCIAL = { 'facebook.com': 'facebook', 'fb.com': 'facebook', 'l.facebook.com': 'facebook', 'm.facebook.com': 'facebook', 'instagram.com': 'instagram',
  'l.instagram.com': 'instagram', 't.co': 'x', 'x.com': 'x', 'twitter.com': 'x', 'linkedin.com': 'linkedin', 'lnkd.in': 'linkedin', 'tiktok.com': 'tiktok',
  'youtube.com': 'youtube', 'wa.me': 'whatsapp', 'web.whatsapp.com': 'whatsapp', 'pinterest.com': 'pinterest' };
const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|you\.com)$/;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|uptime|curl|wget|python|axios|node-fetch/i;

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const clean = (v, n = 80) => (typeof v === 'string' ? v.trim().slice(0, n).replace(/[^\w .\-/:@]/g, '') : '');

/** Normalise a visit's origin into "source / medium". */
export function classify({ utm_source, utm_medium, referrer } = {}, siteHost = '') {
  const us = clean(utm_source, 40).toLowerCase();
  if (us) return `${us} / ${clean(utm_medium, 40).toLowerCase() || 'campaign'}`;
  const h = host(referrer);
  if (!h || (siteHost && h === siteHost.replace(/^www\./, ''))) return 'direct / none';
  if (AI.test(h) || h === 'gemini.google.com') return `${h.split('.').slice(-2, -1)[0]} / ai assistant`;
  if (SEARCH.test(h)) return `${h.match(SEARCH)[2]} / organic`;
  const social = SOCIAL[h] || Object.entries(SOCIAL).find(([d]) => h.endsWith(`.${d}`))?.[1];
  if (social) return `${social} / social`;
  return `${h} / referral`;
}

export const isBot = (ua = '') => !ua || BOT.test(ua);
const day = () => new Date().toISOString().slice(0, 10);
const salt = (d) => createHmac('sha256', process.env.JWT_SECRET || 'dev-analytics-salt').update(`visitor:${d}`).digest('hex');
const visitorHash = (d, ip, ua) => createHash('sha256').update(`${salt(d)}|${ip}|${ua}`).digest('hex').slice(0, 24);

/** Record one page view. */
export function track({ path, source, ip, ua }) {
  const d = day();
  const p = String(path || '/').split('?')[0].slice(0, 200) || '/';
  const src = String(source || 'direct / none').slice(0, 100);
  const isNew = db.prepare('INSERT OR IGNORE INTO analytics_visitors (day, hash) VALUES (?, ?)').run(d, visitorHash(d, ip, ua)).changes > 0;
  db.prepare(`INSERT INTO analytics_daily (day, kind, key, views, visitors) VALUES (?, 'page', ?, 1, ?)
    ON CONFLICT(day, kind, key) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors`).run(d, p, isNew ? 1 : 0);
  db.prepare(`INSERT INTO analytics_daily (day, kind, key, views, visitors) VALUES (?, 'source', ?, 1, ?)
    ON CONFLICT(day, kind, key) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors`).run(d, src, isNew ? 1 : 0);
  return isNew;
}

/** Drop visitor hashes after 2 days (only today's are needed to count uniques). */
export const pruneVisitors = () => db.prepare("DELETE FROM analytics_visitors WHERE day < date('now', '-1 day')").run().changes;

/**
 * Parse the X-Attribution header (base64 JSON of the visitor's first touch) into a compact,
 * validated object: { source, landing, campaign, first_seen }.
 */
export function attributionFrom(req, siteHost = '') {
  const raw = req.get('x-attribution');
  if (!raw || raw.length > 2000) return null;
  try {
    const a = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return {
      source: classify(a, siteHost),
      landing: clean(a.landing, 200) || null,
      campaign: clean(a.utm_campaign, 80) || null,
      first_seen: /^\d{4}-\d{2}-\d{2}/.test(a.first_seen || '') ? a.first_seen.slice(0, 10) : null,
    };
  } catch { return null; }
}

const src = (col) => `COALESCE(json_extract(${col}, '$.source'), 'not recorded')`;

/** Growth dashboard: traffic, top pages & sources, and the funnel by first-touch source. */
export function growthReport(days = 30) {
  const since = `-${days} days`;
  const sum = (kind) => db.prepare(`SELECT COALESCE(SUM(views),0) views, COALESCE(SUM(visitors),0) visitors FROM analytics_daily WHERE kind = ? AND day >= date('now', ?)`).get(kind, since);
  const top = (kind, n) => rows(db.prepare(`SELECT key, SUM(views) views, SUM(visitors) visitors FROM analytics_daily
    WHERE kind = ? AND day >= date('now', ?) GROUP BY key ORDER BY visitors DESC, views DESC LIMIT ?`).all(kind, since, n));
  const by = (sql) => Object.fromEntries(rows(db.prepare(sql).all(since)).map((r) => [r.source, r.n]));
  const leads = by(`SELECT ${src('attribution')} source, COUNT(*) n FROM leads WHERE created_at >= datetime('now', ?) GROUP BY 1`);
  const signups = by(`SELECT ${src('attribution')} source, COUNT(*) n FROM users WHERE role = 'client' AND created_at >= datetime('now', ?) GROUP BY 1`);
  const orders = by(`SELECT ${src('attribution')} source, COUNT(*) n FROM orders WHERE created_at >= datetime('now', ?) GROUP BY 1`);
  const paid = by(`SELECT ${src('o.attribution')} source, COUNT(*) n FROM orders o WHERE o.created_at >= datetime('now', ?)
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = o.id AND i.status = 'paid') GROUP BY 1`);
  const revenue = by(`SELECT ${src('o.attribution')} source, COALESCE(SUM(i.subtotal_cents),0) n FROM invoices i JOIN orders o ON o.id = i.order_id
    WHERE i.status = 'paid' AND i.paid_at >= datetime('now', ?) GROUP BY 1`);
  const visitors = Object.fromEntries(top('source', 200).map((s) => [s.key, s.visitors]));
  const keys = [...new Set([...Object.keys(visitors), ...Object.keys(leads), ...Object.keys(signups), ...Object.keys(orders)])];
  const funnel = keys.map((k) => ({ source: k, visitors: visitors[k] || 0, leads: leads[k] || 0, signups: signups[k] || 0, orders: orders[k] || 0, paid: paid[k] || 0, revenue_cents: revenue[k] || 0 }))
    .sort((a, b) => b.paid - a.paid || b.leads - a.leads || b.visitors - a.visitors);
  const total = (f) => funnel.reduce((a, r) => a + r[f], 0);
  return {
    days,
    traffic: { ...sum('page'), unique_visitors: sum('source').visitors },
    totals: { visitors: sum('source').visitors, leads: total('leads'), signups: total('signups'), orders: total('orders'), paid: total('paid'), revenue_cents: total('revenue_cents') },
    by_day: rows(db.prepare(`WITH RECURSIVE d(day) AS (SELECT date('now', ?) UNION ALL SELECT date(day, '+1 day') FROM d WHERE day < date('now'))
      SELECT d.day, COALESCE(SUM(a.visitors), 0) AS visitors, COALESCE(SUM(a.views), 0) AS views FROM d
      LEFT JOIN analytics_daily a ON a.day = d.day AND a.kind = 'source' GROUP BY d.day ORDER BY d.day`).all(`-${days - 1} days`)),
    top_pages: top('page', 15),
    funnel,
  };
}
