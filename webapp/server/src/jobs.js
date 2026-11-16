// Background processes, monitored and controlled from the Command Centre.
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db, DB_PATH } from './db.js';
import { logEvent } from './events.js';
import { getSettings, updateSettings } from './settings.js';
import { expireStalePayments } from './payments/service.js';
import { processQueue } from './email/mailer.js';
import { onInvoiceOverdue } from './email/notify.js';
import { runRetainerCycles, watchPipelines } from './pipeline.js';
import { slaDigest } from './email/support-notify.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

const definitions = [
  {
    id: 'email-queue', name: 'Email delivery', every: MIN,
    description: 'Sends queued emails and retries failed deliveries with back-off (2, 4, 8, 16 min; up to 5 attempts).',
    run: async () => {
      const r = await processQueue(50);
      return `${r.sent} sent, ${r.logged} logged, ${r.failed} failed`;
    },
  },
  {
    id: 'pipeline-watch', name: 'Delivery pipeline watch', every: HOUR,
    description: 'Flags overdue milestones, reminds clients about pending approvals (every 3 days) and unfinished onboarding, and emails the team a daily overdue digest.',
    run: () => watchPipelines(),
  },
  {
    id: 'retainer-cycles', name: 'Retainer monthly cycles', every: 6 * HOUR,
    description: 'Starts the next month for retainers that are due: creates the month’s milestones and issues the monthly invoice.',
    run: () => runRetainerCycles(),
  },
  {
    id: 'expire-payments', name: 'Expire abandoned payments', every: 15 * MIN,
    description: 'Marks checkout attempts that never received a gateway notification within 2 hours as abandoned.',
    run: () => `${expireStalePayments(2)} payment(s) marked abandoned`,
  },
  {
    id: 'overdue-invoices', name: 'Overdue invoice watch', every: HOUR,
    description: 'Finds unpaid invoices past their due date and raises a warning in the activity log (once per invoice).',
    run: () => {
      const overdue = db.prepare(`SELECT i.number, i.amount_cents, u.name FROM invoices i JOIN orders o ON o.id = i.order_id
        JOIN users u ON u.id = o.user_id WHERE i.status = 'unpaid' AND i.due_at < date('now')
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.type = 'invoice.overdue' AND e.ref = i.number)`).all();
      for (const i of overdue) {
        logEvent('invoice.overdue', `${i.number} for ${i.name} is overdue (R${(i.amount_cents / 100).toFixed(2)})`, { level: 'warn', ref: i.number });
        onInvoiceOverdue(i.number);
      }
      const total = db.prepare("SELECT COUNT(*) n FROM invoices WHERE status = 'unpaid' AND due_at < date('now')").get().n;
      return `${total} overdue invoice(s), ${overdue.length} newly flagged`;
    },
  },
  {
    id: 'db-backup', name: 'Database backup', every: 24 * HOUR,
    description: 'Writes a consistent snapshot of the database to data/backups and keeps the latest 7.',
    run: () => {
      if (DB_PATH === ':memory:') return 'Skipped (in-memory database)';
      const dir = join(dirname(DB_PATH), 'backups');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `hipcastle-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      const old = readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse().slice(7);
      for (const f of old) unlinkSync(join(dir, f));
      return `Backup written: ${file.split(/[\\/]/).pop()}`;
    },
  },
  {
    id: 'support-sla', name: 'Support desk SLA watch', every: 15 * MIN,
    description: 'Warns the team about tickets past their first-response target (once per ticket) and closes resolved tickets after 7 days without a reply.',
    run: () => {
      const late = db.prepare(`SELECT t.id, t.reference, t.priority, t.subject, t.sla_due_at, u.name AS client_name FROM tickets t JOIN users u ON u.id = t.user_id
        WHERE t.status = 'open' AND t.first_response_at IS NULL AND t.sla_due_at < datetime('now')
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.type = 'support.sla_breach' AND e.ref = t.reference)`).all();
      for (const t of late) logEvent('support.sla_breach', `${t.reference} (${t.priority}) missed its first-response target`, { level: 'warn', ref: t.reference });
      if (late.length) slaDigest(late);
      const closed = db.prepare(`UPDATE tickets SET status = 'closed', updated_at = datetime('now')
        WHERE status = 'resolved' AND resolved_at < datetime('now', '-7 days')`).run().changes;
      return `${late.length} newly late, ${closed} auto-closed`;
    },
  },
  {
    id: 'chat-retention', name: 'Chat transcript retention', every: 24 * HOUR,
    description: 'Deletes website-chat conversations older than 180 days (POPIA: keep personal information no longer than needed).',
    run: () => `${db.prepare("DELETE FROM chat_sessions WHERE updated_at < datetime('now', '-180 days')").run().changes} old conversation(s) removed`,
  },
  {
    id: 'prune-events', name: 'Activity log retention', every: 24 * HOUR,
    description: 'Deletes info-level activity older than 180 days to keep the database lean.',
    run: () => `${db.prepare("DELETE FROM events WHERE level = 'info' AND created_at < datetime('now', '-180 days')").run().changes} old event(s) removed`,
  },
];

const state = new Map(definitions.map((d) => [d.id, { last_run_at: null, last_duration_ms: null, last_result: null, last_error: null, running: false, runs: 0 }]));
let timer = null;

export async function runJob(id, { manual = false, actor = null } = {}) {
  const def = definitions.find((d) => d.id === id);
  if (!def) throw new Error('Unknown job');
  const st = state.get(id);
  if (st.running) return st;
  st.running = true;
  const start = Date.now();
  try {
    st.last_result = await def.run();
    st.last_error = null;
    if (manual) logEvent('job.run', `${def.name} run manually: ${st.last_result}`, { actor });
  } catch (err) {
    st.last_error = err.message;
    logEvent('job.failed', `${def.name} failed: ${err.message}`, { level: 'error' });
  } finally {
    st.running = false;
    st.runs++;
    st.last_run_at = new Date().toISOString();
    st.last_duration_ms = Date.now() - start;
  }
  return st;
}

export function listJobs() {
  const disabled = getSettings().jobs_disabled || [];
  return definitions.map((d) => {
    const st = state.get(d.id);
    const enabled = !disabled.includes(d.id);
    const next = enabled ? new Date((st.last_run_at ? Date.parse(st.last_run_at) : bootedAt) + d.every).toISOString() : null;
    return { id: d.id, name: d.name, description: d.description, every_minutes: d.every / MIN, enabled, next_run_at: next, ...st };
  });
}

export function setJobEnabled(id, enabled) {
  if (!definitions.some((d) => d.id === id)) throw new Error('Unknown job');
  const disabled = new Set(getSettings().jobs_disabled || []);
  if (enabled) disabled.delete(id); else disabled.add(id);
  updateSettings({ jobs_disabled: [...disabled] });
}

let bootedAt = Date.now();
export function startScheduler() {
  bootedAt = Date.now();
  if (timer) return;
  timer = setInterval(() => {
    const disabled = getSettings().jobs_disabled || [];
    for (const d of definitions) {
      const st = state.get(d.id);
      const due = (st.last_run_at ? Date.parse(st.last_run_at) : bootedAt) + d.every <= Date.now();
      if (due && !disabled.includes(d.id) && !st.running) runJob(d.id);
    }
  }, MIN);
  timer.unref();
  // Run the quick housekeeping jobs shortly after boot so the Command Centre has fresh results.
  setTimeout(() => { for (const id of ['email-queue', 'expire-payments', 'overdue-invoices']) if (!(getSettings().jobs_disabled || []).includes(id)) runJob(id); }, 5000).unref();
}

export const backupDirExists = () => DB_PATH !== ':memory:' && existsSync(join(dirname(DB_PATH), 'backups'));
