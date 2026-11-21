// Website monitoring for care-plan and hosting clients: uptime every few minutes, response time and
// TLS certificate expiry. Built in, so there's no extra subscription to pay for.
import { connect } from 'node:tls';
import { db, rows } from '../db.js';
import { rawFetch } from './http.js';

let tlsDays = (host) => new Promise((resolve) => {
  const s = connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
    const cert = s.getPeerCertificate();
    s.end();
    resolve(cert?.valid_to ? Math.floor((Date.parse(cert.valid_to) - Date.now()) / 864e5) : null);
  });
  s.on('error', () => resolve(null)); s.on('timeout', () => { s.destroy(); resolve(null); });
});
export function setTlsCheck(fn) { tlsDays = fn; }

export async function checkSite(url) {
  const start = Date.now();
  try {
    const res = await rawFetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'HipcastleMonitor/1.0 (+uptime check)' } });
    const ms = Date.now() - start;
    const host = new URL(url).hostname;
    const ssl = url.startsWith('https:') ? await tlsDays(host) : null;
    return { ok: res.status < 400, status_code: res.status, ms, ssl_days: ssl, error: res.status >= 400 ? `HTTP ${res.status}` : null };
  } catch (err) {
    return { ok: false, status_code: null, ms: Date.now() - start, ssl_days: null, error: (err.name === 'TimeoutError' ? 'Timed out after 20 s' : err.cause?.code || err.message).slice(0, 200) };
  }
}

/** Check every monitored site. Opens/closes incidents after two consecutive results, to avoid blips. */
export async function runMonitor({ onDown, onUp, onSsl } = {}) {
  const sites = rows(db.prepare(`SELECT l.order_id, l.site_url, o.reference FROM engagement_links l JOIN orders o ON o.id = l.order_id
    WHERE l.site_url IS NOT NULL AND o.status IN ('active','in_review','completed')`).all());
  let down = 0;
  for (const s of sites) {
    const r = await checkSite(s.site_url);
    db.prepare('INSERT INTO site_checks (order_id, ok, status_code, ms, error, ssl_days) VALUES (?, ?, ?, ?, ?, ?)').run(s.order_id, r.ok ? 1 : 0, r.status_code, r.ms, r.error, r.ssl_days);
    const last2 = db.prepare('SELECT ok FROM site_checks WHERE order_id = ? ORDER BY id DESC LIMIT 2').all(s.order_id);
    const open = db.prepare('SELECT * FROM site_incidents WHERE order_id = ? AND resolved_at IS NULL').get(s.order_id);
    if (!r.ok) down++;
    if (!open && last2.length === 2 && last2.every((c) => !c.ok)) {
      db.prepare('INSERT INTO site_incidents (order_id, cause) VALUES (?, ?)').run(s.order_id, r.error);
      onDown?.(s, r);
    } else if (open && last2.length === 2 && last2.every((c) => c.ok)) {
      db.prepare("UPDATE site_incidents SET resolved_at = datetime('now') WHERE id = ?").run(open.id);
      onUp?.(s, open);
    }
    if (r.ssl_days != null && [14, 7, 2].includes(r.ssl_days)) onSsl?.(s, r.ssl_days);
  }
  db.prepare("DELETE FROM site_checks WHERE checked_at < datetime('now', '-90 days')").run();
  return { sites: sites.length, down };
}

/** Uptime % and averages for the portal. */
export function uptimeSummary(orderId, days = 30) {
  const s = db.prepare(`SELECT COUNT(*) n, SUM(ok) up, AVG(CASE WHEN ok THEN ms END) avg_ms FROM site_checks WHERE order_id = ? AND checked_at > datetime('now', ?)`).get(orderId, `-${days} days`);
  const last = db.prepare('SELECT ok, status_code, ms, error, ssl_days, checked_at FROM site_checks WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(orderId);
  return {
    days, checks: s.n, uptime_pct: s.n ? Math.round((s.up / s.n) * 10000) / 100 : null, avg_ms: s.avg_ms ? Math.round(s.avg_ms) : null, last: last || null,
    incidents: rows(db.prepare('SELECT started_at, resolved_at, cause FROM site_incidents WHERE order_id = ? ORDER BY id DESC LIMIT 5').all(orderId)),
  };
}
