// Scheduled work for the delivery integrations.
import { db, rows } from '../db.js';
import { notifyTeam } from '../email/mailer.js';
import { logEvent } from '../events.js';
import { runMonitor } from './monitor.js';
import { refreshDueReports } from './reports.js';
import { matchTenders, syncTenders } from './etenders.js';
import { m365Configured, syncMailbox } from './m365.js';

export async function runIntegrationMonitor() {
  const r = await runMonitor({
    onDown: (site, check) => { logEvent('site.down', `${site.reference}: ${site.site_url} is down (${check.error})`, { level: 'error', ref: site.reference }); notifyTeam('site.down', { site, check }, { ref: site.reference }); },
    onUp: (site, incident) => { logEvent('site.recovered', `${site.reference}: ${site.site_url} is back up`, { ref: site.reference }); notifyTeam('site.recovered', { site, incident }, { ref: site.reference }); },
    onSsl: (site, days) => notifyTeam('site.ssl', { site, days }, { ref: `${site.reference}-ssl-${days}` }),
  });
  return r.sites ? `${r.sites} site(s) checked, ${r.down} down` : 'No sites linked yet';
}

export const runReports = () => refreshDueReports();

export async function runTenders() {
  const added = await syncTenders();
  const clients = rows(db.prepare(`SELECT l.order_id, l.tender_keywords, o.reference, COALESCE(u.company, u.name) AS client FROM engagement_links l
    JOIN orders o ON o.id = l.order_id JOIN users u ON u.id = o.user_id WHERE l.tender_keywords IS NOT NULL AND o.status IN ('active','in_review','completed')`).all());
  const groups = [];
  for (const c of clients) {
    const fresh = matchTenders(c.tender_keywords, 30).filter((t) => db.prepare("SELECT 1 FROM tenders WHERE ocid = ? AND seen_at > datetime('now', '-1 day')").get(t.ocid)).slice(0, 10);
    if (fresh.length) groups.push({ client: c.client, reference: c.reference, keywords: c.tender_keywords, tenders: fresh });
  }
  if (groups.length) notifyTeam('tenders.digest', { groups });
  return `${added} new tender(s); ${groups.reduce((n, g) => n + g.tenders.length, 0)} match(es) for ${groups.length} client(s)`;
}

export async function runMailboxSync() {
  if (!m365Configured()) return 'Microsoft 365 not configured';
  const r = await syncMailbox();
  return `${r.added} new email(s) logged (${r.linked_to_leads} from leads)`;
}
