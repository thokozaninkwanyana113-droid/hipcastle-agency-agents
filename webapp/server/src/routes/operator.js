// Command Centre → Operator: the internal business-management agent's brief and action queue.
import { Router } from 'express';
import { db, row, rows } from '../db.js';
import { body, id, z } from '../validate.js';
import { authenticate, requireRole } from '../auth.js';
import { getSettings } from '../settings.js';
import { OPERATOR_MODEL, operatorMode, runOperator } from '../operator/agent.js';
import { approve, dismiss, editAction, getAction, listActions, markDone } from '../operator/actions.js';
import { guardFields } from '../guard.js';

const r = Router();
r.use(authenticate, requireRole('admin', 'staff'));
const MANUAL_RUNS_PER_DAY = 10;
let running = false;

const wrap = (fn) => (req, res) => {
  try { res.json(fn(req)); } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
};
// Show who an email goes to, not just an id.
const withNames = (list) => list.map((a) => {
  if (a.kind !== 'email') return a;
  const t = a.payload.recipient_type === 'lead' ? 'leads' : 'users';
  const r = db.prepare(`SELECT name, email FROM ${t} WHERE id = ?`).get(a.payload.recipient_id);
  return { ...a, recipient: r ? `${r.name} <${r.email}>` : null };
});
const action = (req) => {
  const a = id(req.params.id) && getAction(id(req.params.id));
  if (!a) throw Object.assign(new Error('Action not found'), { status: 404 });
  return a;
};

r.get('/', (_req, res) => {
  const s = getSettings();
  res.json({
    mode: operatorMode(), model: operatorMode() === 'ai' ? OPERATOR_MODEL : null, running,
    settings: { operator_enabled: s.operator_enabled, operator_autonomy: s.operator_autonomy, operator_focus: s.operator_focus, operator_monthly_ad_budget: s.operator_monthly_ad_budget },
    latest: row(db.prepare("SELECT * FROM operator_runs WHERE status <> 'running' ORDER BY id DESC LIMIT 1").get()),
    actions: withNames(listActions('open')),
    history: rows(db.prepare('SELECT id, trigger, instruction, mode, status, actions_proposed, input_tokens, output_tokens, error, started_at, finished_at FROM operator_runs ORDER BY id DESC LIMIT 20').all()),
    recent: rows(db.prepare("SELECT * FROM operator_actions WHERE status IN ('done','dismissed','failed','expired') ORDER BY COALESCE(decided_at, created_at) DESC LIMIT 30").all(), ['payload']),
  });
});

r.get('/runs/:id', (req, res) => {
  const run = id(req.params.id) && row(db.prepare('SELECT * FROM operator_runs WHERE id = ?').get(id(req.params.id)));
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({ ...run, actions: rows(db.prepare('SELECT * FROM operator_actions WHERE run_id = ? ORDER BY priority, id').all(run.id), ['payload']) });
});

r.post('/run', requireRole('admin'), body(z.object({ instruction: z.string().trim().max(1000).optional().default('') })), guardFields('instruction'), async (req, res) => {
  if (running) return res.status(409).json({ error: 'The Operator is already working — give it a minute.' });
  const today = db.prepare("SELECT COUNT(*) n FROM operator_runs WHERE trigger = 'manual' AND started_at > datetime('now', '-1 day')").get().n;
  if (today >= MANUAL_RUNS_PER_DAY) return res.status(429).json({ error: `Limit of ${MANUAL_RUNS_PER_DAY} manual runs a day reached.` });
  running = true;
  try {
    const run = await runOperator({ trigger: 'manual', instruction: req.body.instruction, actorId: req.user.id });
    res.status(201).json(run);
  } catch (err) {
    res.status(500).json({ error: `The run failed: ${err.message}` });
  } finally { running = false; }
});

r.patch('/actions/:id', body(z.object({ payload: z.record(z.string(), z.any()) })), wrap((req) => editAction(action(req).id, req.body.payload)));
r.post('/actions/:id/approve', wrap((req) => {
  const a = action(req);
  // Spending money is the founder's call.
  if (a.kind === 'ad_campaign' && req.user.role !== 'admin') throw Object.assign(new Error('Only an admin can approve ad spend'), { status: 403 });
  return approve(a.id, { actorId: req.user.id });
}));
r.post('/actions/:id/dismiss', body(z.object({ reason: z.string().trim().max(300).optional().default('') })), wrap((req) => dismiss(action(req).id, req.user.id, req.body.reason)));
r.post('/actions/:id/done', body(z.object({ note: z.string().trim().max(300).optional().default('') })), wrap((req) => markDone(action(req).id, req.user.id, req.body.note)));

export default r;
