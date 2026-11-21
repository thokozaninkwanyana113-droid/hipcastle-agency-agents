// National Treasury eTender Portal (public OCDS API, no key): new government tenders, matched to
// Sales & Tenders clients' keywords so the team never misses one worth bidding for.
import { db, rows } from '../db.js';
import { getJson } from './http.js';

const API = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';
const ymd = (d) => d.toISOString().slice(0, 10);

/** Fetch tenders released in the last `days` days and store new ones. Returns the count added. */
export async function syncTenders({ days = 2, pageSize = 500, maxPages = 10 } = {}) {
  const q = new URLSearchParams({ PageNumber: '1', PageSize: String(pageSize), dateFrom: ymd(new Date(Date.now() - days * 864e5)), dateTo: ymd(new Date()) });
  let url = `${API}?${q}`; let added = 0; let pages = 0;
  const ins = db.prepare(`INSERT OR IGNORE INTO tenders (ocid, title, description, buyer, category, closing_at, url, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  while (url && pages < maxPages) {
    const d = await getJson(url, { timeout: 60_000, label: 'eTenders' });
    for (const r of d.releases || []) {
      const t = r.tender || {};
      if (!r.ocid || !t.title) continue;
      added += ins.run(r.ocid, t.title.slice(0, 300), (t.description || '').slice(0, 2000), t.procuringEntity?.name || r.buyer?.name || null, t.mainProcurementCategory || null,
        t.tenderPeriod?.endDate || null, t.documents?.[0]?.url || 'https://www.etenders.gov.za/Home/opportunities', r.date || null).changes;
    }
    url = d.links?.next && (d.releases || []).length === pageSize ? d.links.next : null;
    pages++;
  }
  db.prepare("DELETE FROM tenders WHERE closing_at < datetime('now', '-30 days')").run();
  return added;
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
