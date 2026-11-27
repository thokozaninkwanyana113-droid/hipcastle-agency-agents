// National Treasury eTender Portal (public OCDS API, no key): new government tenders, matched to
// Sales & Tenders clients' keywords so the team never misses one worth bidding for.
import { db, rows } from '../db.js';
import { getJson } from './http.js';

const API = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';
const ymd = (d) => d.toISOString().slice(0, 10);

/**
 * Fetch tenders released in the last `days` days and store new ones.
 * The public API is fragile: some days and later pages return HTTP 500. So each day is fetched on
 * its own, a failed request is retried once and then skipped, and whatever was fetched is kept.
 * Returns { added, failed } — failed lists the day/page requests that the API could not serve.
 */
export async function syncTenders({ days = 2, pageSize = 100, maxPages = 10 } = {}) {
  const ins = db.prepare(`INSERT OR IGNORE INTO tenders (ocid, title, description, buyer, category, closing_at, url, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const get = async (url) => { try { return await getJson(url, { timeout: 60_000, label: 'eTenders' }); } catch { return getJson(url, { timeout: 60_000, label: 'eTenders' }); } };
  let added = 0; const failed = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = ymd(new Date(Date.now() - i * 864e5));
    for (let page = 1; page <= maxPages; page++) {
      let d;
      try { d = await get(`${API}?${new URLSearchParams({ PageNumber: String(page), PageSize: String(pageSize), dateFrom: day, dateTo: day })}`); }
      catch (err) { failed.push(`${day} p${page} (${err.upstream || err.message})`); break; }
      const list = d.releases || [];
      for (const r of list) {
        const t = r.tender || {};
        if (!r.ocid || !t.title) continue;
        added += ins.run(r.ocid, t.title.slice(0, 300), (t.description || '').slice(0, 2000), t.procuringEntity?.name || r.buyer?.name || null, t.mainProcurementCategory || null,
          t.tenderPeriod?.endDate || null, t.documents?.[0]?.url || 'https://www.etenders.gov.za/Home/opportunities', r.date || null).changes;
      }
      if (list.length < pageSize) break;
    }
  }
  db.prepare("DELETE FROM tenders WHERE closing_at < datetime('now', '-30 days')").run();
  return { added, failed };
}

/** Open tenders matching any keyword (title, description or buyer), closing soonest first. */
export function matchTenders(keywords, limit = 15) {
  const words = String(keywords || '').split(',').map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 3).slice(0, 15);
  if (!words.length) return [];
  const where = words.map(() => "(lower(title) LIKE ? OR lower(description) LIKE ? OR lower(buyer) LIKE ?)").join(' OR ');
  const args = words.flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]);
  return rows(db.prepare(`SELECT ocid, title, description, buyer, category, closing_at, url FROM tenders
    WHERE (closing_at IS NULL OR closing_at > datetime('now')) AND (${where}) ORDER BY closing_at LIMIT ?`).all(...args, limit))
    .map((t) => ({ ...t, description: t.description?.slice(0, 300) }));
}
