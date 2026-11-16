// Engagement delivery pipeline: onboarding → stages → client approvals → delivery → feedback,
// plus monthly cycles for retainers. Pure business logic; routes and jobs call into this.
import { randomBytes } from 'node:crypto';
import { db, row, rows, tx } from './db.js';
import { logEvent } from './events.js';
import { vatFor } from './settings.js';
import { STAGES, buildPlan, cyclePlan } from './playbooks.js';
import * as mail from './email/pipeline-notify.js';

const ref = (p) => `${p}-${randomBytes(3).toString('hex').toUpperCase()}`;
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
export const today = () => ymd(new Date());

const ORDER = `SELECT o.*, st.tier, st.name AS tier_name, st.billing, st.delivery_days, s.slug AS service_slug, s.name AS service_name
  FROM orders o JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id WHERE o.id = ?`;
export const loadOrder = (id) => row(db.prepare(ORDER).get(id));
export const milestonesOf = (orderId) => rows(db.prepare(`SELECT m.*, a.name AS agent_name, a.emoji AS agent_emoji
  FROM milestones m LEFT JOIN agents a ON a.slug = m.agent_slug WHERE m.order_id = ? ORDER BY m.position, m.id`).all(orderId));
export const onboardingOf = (orderId) => rows(db.prepare('SELECT * FROM onboarding_items WHERE order_id = ? ORDER BY position').all(orderId), ['options']);

// ---------------------------------------------------------------- scheduling
/** Due dates: sequential for project stages; fixed points inside the month for retainer cycles. */
function schedule(list, start) {
  let cursor = start;
  return list.map((ms) => {
    if (ms.stage === 'cycle') {
      const at = { plan: 3, report: 28, review: 30 }[ms.key.replace(/_c\d+$/, '')] ?? 25;
      return { ...ms, due_date: addDays(ms.cycleStart || start, at) };
    }
    cursor = addDays(cursor, ms.days);
    return { ...ms, due_date: cursor };
  });
}

const insertMilestone = db.prepare(`INSERT INTO milestones (order_id, title, position, key, stage, cycle, agent_slug, days, due_date,
  requires_approval, client_task, deliverable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

/** Create the onboarding checklist and milestone plan for a new order. */
export function instantiatePipeline(orderId) {
  const o = loadOrder(orderId);
  const plan = buildPlan(o.service_slug, o.tier, o.billing, o.delivery_days);
  const start = today();
  const setupEnd = addDays(start, plan.milestones.filter((m) => m.stage !== 'cycle').reduce((a, m) => a + m.days, 0));
  const scheduled = schedule(plan.milestones.map((m) => ({ ...m, cycleStart: m.stage === 'cycle' ? setupEnd : null })), start);
  tx(() => {
    scheduled.forEach((m, i) => insertMilestone.run(o.id, m.title, i, m.key, m.stage, m.cycle || 0, m.agent || null, m.days,
      m.due_date, m.approval ? 1 : 0, m.client ? 1 : 0, m.deliverable || null));
    const ins = db.prepare(`INSERT INTO onboarding_items (order_id, key, kind, label, field_type, options, required, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    [...plan.intake.map((q) => ({ ...q, kind: 'question' })), ...plan.checklist.map((c) => ({ ...c, type: c.kind === 'meeting' ? 'text' : 'textarea' }))]
      .forEach((q, i) => ins.run(o.id, q.key, q.kind, q.label, q.type || 'text', q.options ? JSON.stringify(q.options) : null, q.required ? 1 : 0, i));
    const last = scheduled.filter((m) => m.stage !== 'handover' || plan.kind === 'retainer').at(-1);
    db.prepare(`UPDATE orders SET pipeline_kind = ?, revisions_allowed = ?, due_date = ?, current_cycle = ?, next_cycle_at = ? WHERE id = ?`)
      .run(plan.kind, plan.revisions, last?.due_date || o.due_date, plan.kind === 'retainer' ? 1 : 0,
        plan.kind === 'retainer' ? addDays(setupEnd, 30) : null, o.id);
  });
}

/** Re-plan open milestones from a new start date (e.g. after the kick-off call). */
export function rebaseline(orderId, from = today()) {
  const o = loadOrder(orderId);
  const open = milestonesOf(orderId).filter((m) => m.status !== 'done' && m.stage !== 'cycle');
  let cursor = from;
  const up = db.prepare('UPDATE milestones SET due_date = ? WHERE id = ?');
  tx(() => {
    for (const m of open) { cursor = addDays(cursor, m.days); up.run(cursor, m.id); }
    if (o.pipeline_kind === 'project') {
      const launch = open.filter((m) => m.stage !== 'handover').at(-1);
      if (launch) db.prepare('UPDATE orders SET due_date = ? WHERE id = ?').run(addDays(from, open.filter((m) => m.stage !== 'handover').reduce((a, m) => a + m.days, 0)), o.id);
    }
  });
  return milestonesOf(orderId);
}

// ---------------------------------------------------------------- status
/** Progress (0–100) weighted by planned days. Retainers measure setup + the current month. */
export function computeProgress(orderId) {
  const o = loadOrder(orderId);
  let list = milestonesOf(orderId);
  if (o.pipeline_kind === 'retainer') list = list.filter((m) => m.stage !== 'cycle' ? m.cycle === 0 : m.cycle === o.current_cycle);
  const total = list.reduce((a, m) => a + (m.days || 1), 0);
  const done = list.filter((m) => m.status === 'done').reduce((a, m) => a + (m.days || 1), 0);
  return total ? Math.round((done / total) * 100) : 0;
}

/** Summary used by the portal, Command Centre and pipeline board. */
export function pipelineSummary(o, list = milestonesOf(o.id), items = null) {
  const t = today();
  const open = list.filter((m) => m.status !== 'done');
  const current = open[0] || null;
  const overdue = open.filter((m) => m.due_date && m.due_date < t && !['awaiting_client'].includes(m.status) && !m.client_task);
  const waiting = open.filter((m) => m.status === 'awaiting_client' || (m.client_task && m.status !== 'done'));
  const daysLate = overdue.length ? Math.max(...overdue.map((m) => Math.round((Date.parse(t) - Date.parse(m.due_date)) / 864e5))) : 0;
  let health = 'on_track';
  if (o.status === 'pending') health = 'awaiting_deposit';
  else if (['completed', 'cancelled'].includes(o.status)) health = o.status;
  else if (daysLate > 3) health = 'off_track';
  else if (daysLate > 0) health = 'at_risk';
  else if (waiting.length) health = 'waiting_on_client';
  const stage = o.status === 'pending' ? 'awaiting_deposit'
    : ['completed', 'cancelled'].includes(o.status) ? o.status
      : current?.stage || (o.pipeline_kind === 'retainer' ? 'cycle' : 'handover');
  const onboarding = items || onboardingOf(o.id);
  return {
    kind: o.pipeline_kind,
    stage, stage_label: STAGES[stage]?.label || stage.replace(/_/g, ' '),
    health, days_late: daysLate,
    next: current && { id: current.id, title: current.title, due_date: current.due_date, status: current.status, agent_name: current.agent_name, agent_slug: current.agent_slug },
    overdue: overdue.length,
    awaiting_client: waiting.length,
    onboarding: { total: onboarding.length, done: onboarding.filter((i) => i.status === 'done').length,
      required_open: onboarding.filter((i) => i.required && i.status !== 'done').length },
    revisions_allowed: o.revisions_allowed,
    current_cycle: o.current_cycle,
    next_cycle_at: o.next_cycle_at,
  };
}

/** Keep order status/progress in step with its milestones. */
export function syncOrder(orderId) {
  const o = loadOrder(orderId);
  if (['pending', 'cancelled', 'completed'].includes(o.status)) {
    db.prepare('UPDATE orders SET progress = ? WHERE id = ?').run(computeProgress(orderId), orderId);
    return loadOrder(orderId);
  }
  const list = milestonesOf(orderId);
  const awaiting = list.some((m) => m.status === 'awaiting_client');
  const allDone = list.length && list.every((m) => m.status === 'done');
  let status = awaiting ? 'in_review' : 'active';
  if (allDone && o.pipeline_kind === 'project') status = 'completed';
  db.prepare("UPDATE orders SET status = ?, progress = ?, updated_at = datetime('now') WHERE id = ?").run(status, computeProgress(orderId), orderId);
  if (status === 'completed' && o.status !== 'completed') onProjectCompleted(orderId);
  return loadOrder(orderId);
}

// ---------------------------------------------------------------- lifecycle hooks
/** Deposit paid: welcome the client into onboarding. */
export function onActivated(orderId) {
  const o = loadOrder(orderId);
  if (!o || o.kickoff_at || o.onboarding_completed_at) return;
  rebaseline(orderId, today());
  mail.onboardingStart(orderId);
  logEvent('pipeline.activated', `${o.reference}: deposit received — onboarding started`, { ref: o.reference });
}

/** Save onboarding answers. Completing all required items completes the intake milestone. */
export function saveOnboarding(orderId, responses, actor) {
  const items = onboardingOf(orderId);
  const up = db.prepare(`UPDATE onboarding_items SET response = ?, status = CASE WHEN ? <> '' THEN 'done' ELSE 'pending' END,
    completed_at = CASE WHEN ? <> '' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END WHERE id = ?`);
  tx(() => {
    for (const r of responses) {
      const item = items.find((i) => i.key === r.key);
      if (!item) continue;
      const v = String(r.response ?? '').trim().slice(0, 4000);
      up.run(v || null, v, v, item.id);
    }
  });
  const after = onboardingOf(orderId);
  const o = loadOrder(orderId);
  const complete = after.filter((i) => i.required).every((i) => i.status === 'done');
  if (complete && !o.onboarding_completed_at) {
    db.prepare("UPDATE orders SET onboarding_completed_at = datetime('now') WHERE id = ?").run(orderId);
    const intake = milestonesOf(orderId).find((m) => m.key === 'intake' && m.status !== 'done');
    if (intake) completeMilestone(intake.id, actor, { silent: true });
    logEvent('pipeline.onboarding_complete', `${o.reference}: client completed onboarding`, { actor: actor?.id, ref: o.reference });
    mail.onboardingComplete(orderId);
  }
  return { items: after, complete };
}

export function setOnboardingItem(orderId, itemId, { status, response }) {
  db.prepare(`UPDATE onboarding_items SET status = COALESCE(?, status), response = COALESCE(?, response),
    completed_at = CASE WHEN COALESCE(?, status) = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
    WHERE id = ? AND order_id = ?`).run(status ?? null, response ?? null, status ?? null, itemId, orderId);
}

// ---------------------------------------------------------------- milestone actions
export const getMilestone = (orderId, mid) => row(db.prepare('SELECT * FROM milestones WHERE id = ? AND order_id = ?').get(mid, orderId));

export function startMilestone(m) {
  db.prepare("UPDATE milestones SET status = 'in_progress', started_at = COALESCE(started_at, datetime('now')) WHERE id = ?").run(m.id);
  syncOrder(m.order_id);
}

/** Staff hand a deliverable to the client. Approval-gated milestones wait for the client. */
export function submitMilestone(m, { url, note }, actor) {
  if (!m.requires_approval) return completeMilestone(m.id, actor, { url, note });
  db.prepare(`UPDATE milestones SET status = 'awaiting_client', deliverable_url = ?, deliverable_note = ?, submitted_at = datetime('now'),
    started_at = COALESCE(started_at, datetime('now')), last_reminded_at = NULL WHERE id = ?`).run(url || null, note || null, m.id);
  const o = syncOrder(m.order_id);
  logEvent('pipeline.submitted', `${o.reference}: “${m.title}” sent to client for approval`, { actor: actor?.id, ref: o.reference });
  mail.deliverableReady(m.order_id, m.id);
  return getMilestone(m.order_id, m.id);
}

export function completeMilestone(mid, actor, { url, note, silent = false } = {}) {
  const m = row(db.prepare('SELECT * FROM milestones WHERE id = ?').get(mid));
  db.prepare(`UPDATE milestones SET status = 'done', is_done = 1, done_at = datetime('now'), started_at = COALESCE(started_at, datetime('now')),
    deliverable_url = COALESCE(?, deliverable_url), deliverable_note = COALESCE(?, deliverable_note) WHERE id = ?`).run(url || null, note || null, m.id);
  const o = loadOrder(m.order_id);
  if (m.key === 'kickoff' && !o.kickoff_at) {
    db.prepare("UPDATE orders SET kickoff_at = datetime('now') WHERE id = ?").run(o.id);
    rebaseline(o.id, today());
  }
  if (m.stage === 'launch') maybeIssueBalance(o.id);
  if (!silent) logEvent('pipeline.done', `${o.reference}: “${m.title}” completed`, { actor: actor?.id, ref: o.reference });
  syncOrder(o.id);
  return getMilestone(m.order_id, m.id);
}

export function approveMilestone(m, actor) {
  db.prepare("UPDATE milestones SET approved_at = datetime('now') WHERE id = ?").run(m.id);
  const out = completeMilestone(m.id, actor, { silent: true });
  const o = loadOrder(m.order_id);
  logEvent('pipeline.approved', `${o.reference}: client approved “${m.title}”`, { actor: actor?.id, ref: o.reference });
  mail.deliverableResponse(o.id, m.id, 'approved');
  return out;
}

export class RevisionLimitError extends Error {}

export function requestChanges(m, feedback, actor) {
  const o = loadOrder(m.order_id);
  if (o.revisions_allowed !== null && m.revisions_used >= o.revisions_allowed) {
    throw new RevisionLimitError(`All ${o.revisions_allowed} revision rounds included in your ${o.tier_name} package have been used for this deliverable. Message your team to arrange additional revisions.`);
  }
  db.prepare(`UPDATE milestones SET status = 'changes_requested', client_feedback = ?, revisions_used = revisions_used + 1 WHERE id = ?`).run(feedback, m.id);
  syncOrder(o.id);
  logEvent('pipeline.changes', `${o.reference}: client requested changes on “${m.title}” (round ${m.revisions_used + 1})`, { actor: actor?.id, ref: o.reference, level: 'warn' });
  mail.deliverableResponse(o.id, m.id, 'changes');
  return getMilestone(o.id, m.id);
}

export function updateMilestone(m, { due_date, status, agent_slug }) {
  db.prepare(`UPDATE milestones SET due_date = COALESCE(?, due_date), agent_slug = COALESCE(?, agent_slug),
    status = COALESCE(?, status) WHERE id = ?`).run(due_date ?? null, agent_slug ?? null, status ?? null, m.id);
  syncOrder(m.order_id);
  return getMilestone(m.order_id, m.id);
}

// ---------------------------------------------------------------- delivery & billing
/** Once-off projects: issue the 50% balance invoice when the work goes live. */
export function maybeIssueBalance(orderId) {
  const o = loadOrder(orderId);
  if (o.pipeline_kind !== 'project') return null;
  const billed = db.prepare("SELECT COALESCE(SUM(subtotal_cents),0) n FROM invoices WHERE order_id = ? AND status <> 'void'").get(orderId).n;
  const balance = o.price_cents - billed;
  if (balance <= 0) return null;
  const vat = vatFor(balance);
  const inv = row(db.prepare(`INSERT INTO invoices (number, order_id, subtotal_cents, vat_cents, amount_cents, description, due_at)
    VALUES (?, ?, ?, ?, ?, 'Balance on delivery (50%)', date('now','+7 days')) RETURNING *`).get(ref('INV'), orderId, balance, vat, balance + vat));
  db.prepare("UPDATE orders SET delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?").run(orderId);
  logEvent('invoice.issued', `${inv.number} (balance on delivery) issued on ${o.reference}`, { ref: inv.number });
  mail.invoiceIssued(inv.id);
  return inv;
}

function onProjectCompleted(orderId) {
  const o = loadOrder(orderId);
  db.prepare("UPDATE orders SET delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?").run(orderId);
  logEvent('pipeline.completed', `${o.reference}: project delivered and closed`, { ref: o.reference });
  mail.feedbackRequest(orderId);
}

export function saveFeedback(orderId, score, comment) {
  db.prepare("UPDATE orders SET nps_score = ?, nps_comment = ?, feedback_at = datetime('now') WHERE id = ?").run(score, comment || null, orderId);
  const o = loadOrder(orderId);
  logEvent('pipeline.feedback', `${o.reference}: client rated ${score}/10${comment ? ` — “${comment.slice(0, 80)}”` : ''}`, { ref: o.reference, level: score <= 6 ? 'warn' : 'info' });
  mail.feedbackReceived(orderId);
  return o;
}

// ---------------------------------------------------------------- retainers
/** Start the next monthly cycle: new milestones + the month's invoice. */
export function startNextCycle(orderId, actor = null) {
  const o = loadOrder(orderId);
  if (o.pipeline_kind !== 'retainer' || !['active', 'in_review'].includes(o.status)) return null;
  const n = o.current_cycle + 1;
  const start = today();
  const list = schedule(cyclePlan(o.service_slug, o.tier, n).map((m) => ({ ...m, cycleStart: start })), start);
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) n FROM milestones WHERE order_id = ?').get(orderId).n;
  const vat = vatFor(o.price_cents);
  const inv = tx(() => {
    list.forEach((m, i) => insertMilestone.run(o.id, m.title, pos + 1 + i, m.key, m.stage, n, m.agent || null, m.days, m.due_date,
      m.approval ? 1 : 0, 0, m.deliverable || null));
    db.prepare('UPDATE orders SET current_cycle = ?, next_cycle_at = ?, due_date = ? WHERE id = ?').run(n, addDays(start, 30), addDays(start, 30), o.id);
    return row(db.prepare(`INSERT INTO invoices (number, order_id, subtotal_cents, vat_cents, amount_cents, description, due_at)
      VALUES (?, ?, ?, ?, ?, ?, date('now','+7 days')) RETURNING *`).get(ref('INV'), o.id, o.price_cents, vat, o.price_cents + vat, `Month ${n} retainer`));
  });
  syncOrder(o.id);
  logEvent('pipeline.cycle', `${o.reference}: month ${n} started; ${inv.number} issued`, { actor: actor?.id, ref: o.reference });
  mail.cycleStarted(o.id, n, inv.id);
  return { cycle: n, invoice: inv };
}

// ---------------------------------------------------------------- board & watch
export function boardData() {
  const orders = rows(db.prepare(`SELECT o.*, st.tier, st.name AS tier_name, st.billing, s.slug AS service_slug, s.name AS service_name, s.icon AS service_icon,
      u.name AS client_name, u.company AS client_company
    FROM orders o JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id JOIN users u ON u.id = o.user_id
    WHERE o.status <> 'cancelled' AND (o.status <> 'completed' OR o.updated_at > datetime('now','-30 days'))
    ORDER BY o.created_at DESC`).all());
  const cards = orders.map((o) => ({
    id: o.id, reference: o.reference, client_name: o.client_name, client_company: o.client_company,
    service_slug: o.service_slug, service_name: o.service_name, service_icon: o.service_icon, tier_name: o.tier_name,
    status: o.status, progress: o.progress, due_date: o.due_date, price_cents: o.price_cents, nps_score: o.nps_score,
    ...pipelineSummary(o),
  }));
  const open = rows(db.prepare(`SELECT m.agent_slug, a.name AS agent_name, a.emoji, COUNT(*) AS open,
      SUM(CASE WHEN m.due_date < date('now') AND m.status NOT IN ('awaiting_client') THEN 1 ELSE 0 END) AS overdue
    FROM milestones m JOIN orders o ON o.id = m.order_id LEFT JOIN agents a ON a.slug = m.agent_slug
    WHERE m.status <> 'done' AND m.client_task = 0 AND o.status IN ('active','in_review') AND m.agent_slug IS NOT NULL
    GROUP BY m.agent_slug ORDER BY open DESC LIMIT 12`).all());
  const nps = db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN nps_score >= 9 THEN 1 ELSE 0 END) promoters,
    SUM(CASE WHEN nps_score <= 6 THEN 1 ELSE 0 END) detractors FROM orders WHERE nps_score IS NOT NULL`).get();
  return {
    cards,
    workload: open,
    nps: nps.n ? Math.round(((nps.promoters - nps.detractors) / nps.n) * 100) : null,
    feedback_count: nps.n,
  };
}

/** Hourly watch: overdue work, clients to nudge, team digest. Returns a short summary. */
export function watchPipelines() {
  const t = today();
  let flagged = 0, nudged = 0;
  const active = rows(db.prepare("SELECT id FROM orders WHERE status IN ('active','in_review')").all());
  for (const { id: oid } of active) {
    const o = loadOrder(oid);
    for (const m of milestonesOf(oid)) {
      if (m.status === 'done') continue;
      if (!m.client_task && m.status !== 'awaiting_client' && m.due_date && m.due_date < t) {
        const key = `ms-${m.id}-overdue`;
        if (!db.prepare("SELECT 1 FROM events WHERE type = 'pipeline.overdue' AND ref = ?").get(key)) {
          logEvent('pipeline.overdue', `${o.reference}: “${m.title}” is overdue (due ${m.due_date})${m.agent_name ? ` — ${m.agent_name}` : ''}`, { level: 'warn', ref: key });
          flagged++;
        }
      }
      // Client approvals waiting 3+ days: remind at most every 3 days.
      if (m.status === 'awaiting_client') {
        const last = m.last_reminded_at || m.submitted_at;
        if (last && Date.parse(`${last.replace(' ', 'T')}Z`) < Date.now() - 3 * 864e5) {
          mail.approvalReminder(oid, m.id);
          db.prepare("UPDATE milestones SET last_reminded_at = datetime('now') WHERE id = ?").run(m.id);
          nudged++;
        }
      }
    }
    // Onboarding not finished 2+ days after the deposit: one reminder every 3 days.
    if (!o.onboarding_completed_at) {
      const since = o.onboarding_reminded_at || o.updated_at;
      if (Date.parse(`${since.replace(' ', 'T')}Z`) < Date.now() - 2 * 864e5) {
        mail.onboardingReminder(oid);
        db.prepare("UPDATE orders SET onboarding_reminded_at = datetime('now') WHERE id = ?").run(oid);
        nudged++;
      }
    }
  }
  // One digest per day to the team inbox when work is overdue.
  const overdueNow = rows(db.prepare(`SELECT m.title, m.due_date, o.reference, o.id AS order_id, a.name AS agent_name
    FROM milestones m JOIN orders o ON o.id = m.order_id LEFT JOIN agents a ON a.slug = m.agent_slug
    WHERE m.status NOT IN ('done','awaiting_client') AND m.client_task = 0 AND m.due_date < date('now') AND o.status IN ('active','in_review')
    ORDER BY m.due_date`).all());
  if (overdueNow.length && !db.prepare("SELECT 1 FROM events WHERE type = 'pipeline.digest' AND ref = ?").get(t)) {
    mail.overdueDigest(overdueNow);
    logEvent('pipeline.digest', `Overdue digest sent (${overdueNow.length} milestones)`, { ref: t });
  }
  return `${active.length} active engagements · ${flagged} newly overdue · ${nudged} client reminders`;
}

/** Daily: start retainer months that are due. */
export function runRetainerCycles() {
  const due = rows(db.prepare(`SELECT id FROM orders WHERE pipeline_kind = 'retainer' AND status IN ('active','in_review')
    AND next_cycle_at IS NOT NULL AND next_cycle_at <= date('now')`).all());
  for (const { id } of due) startNextCycle(id);
  return `${due.length} retainer month(s) started`;
}
