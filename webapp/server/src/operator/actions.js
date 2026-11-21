// What the Operator may propose, and what approving each proposal does.
//
// Safety model: the Operator only *proposes*. Anything that reaches a client or prospect (emails)
// or spends money (ads) always waits for a person to approve it. In "assist" autonomy, internal-
// only work (blog drafts, tasks, call lists, social copy) is auto-approved.
import { z } from 'zod';
import { db, row, rows } from '../db.js';
import { getSettings } from '../settings.js';
import { logEvent } from '../events.js';
import { sendEmail } from '../email/mailer.js';
import { redactSecrets } from '../guard.js';
import { canonicalUrl } from '../urls.js';

export const AREAS = ['sales', 'marketing', 'advertising', 'finance', 'delivery', 'support', 'retention', 'operations'];
const base = { area: z.enum(AREAS), priority: z.number().int().min(1).max(3).default(2), title: z.string().trim().min(5).max(140), rationale: z.string().trim().min(10).max(800) };
const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 70);

export const PAYLOADS = {
  email: z.object({
    recipient_type: z.enum(['lead', 'client']),
    recipient_id: z.number().int().positive(),
    subject: z.string().trim().min(5).max(150),
    body: z.string().trim().min(40).max(4000),
  }),
  blog_post: z.object({
    title: z.string().trim().min(10).max(120),
    excerpt: z.string().trim().min(30).max(300),
    body: z.string().trim().min(200).max(20000),
    category: z.string().trim().max(40).default('Insights'),
    tags: z.array(z.string().trim().max(30)).max(8).default([]),
    meta_description: z.string().trim().max(160).optional(),
    answers_question: z.string().trim().max(300).optional(),
  }),
  social_posts: z.object({
    posts: z.array(z.object({ platform: z.enum(['linkedin', 'facebook', 'instagram', 'x', 'tiktok', 'whatsapp_status']), text: z.string().trim().min(20).max(2200), link_path: z.string().trim().max(200).optional() })).min(1).max(7),
  }),
  ad_campaign: z.object({
    platform: z.enum(['google_search', 'meta', 'linkedin', 'tiktok']),
    service_slug: z.string().trim().max(60),
    objective: z.string().trim().min(5).max(200),
    audience: z.string().trim().min(5).max(500),
    daily_budget_rand: z.number().min(20).max(5000),
    duration_days: z.number().int().min(3).max(60),
    headlines: z.array(z.string().trim().min(3).max(90)).min(2).max(10),
    descriptions: z.array(z.string().trim().min(10).max(250)).min(1).max(5),
    keywords: z.array(z.string().trim().max(80)).max(30).default([]),
    landing_path: z.string().trim().regex(/^\/[\w\-/#]*$/).default('/'),
    success_metric: z.string().trim().max(200),
  }),
  task: z.object({ details: z.string().trim().min(10).max(2000), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  call: z.object({ who: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional(), talking_points: z.array(z.string().trim().max(300)).min(1).max(8) }),
};
const INTERNAL = new Set(['blog_post', 'task', 'call', 'social_posts']); // auto-approvable in "assist" mode

/** Validate and store a proposal. Returns { ok, id } or { ok:false, error } (fed back to the model). */
export function propose(kind, input, { runId = null, dedupeKey = null } = {}) {
  const head = z.object(base).safeParse(input);
  const payload = PAYLOADS[kind]?.safeParse(input.payload ?? {});
  if (!head.success) return { ok: false, error: head.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  if (!payload?.success) return { ok: false, error: payload ? payload.error.issues.map((i) => `payload.${i.path.join('.')}: ${i.message}`).join('; ') : `unknown kind ${kind}` };
  const p = payload.data;
  // Never let secrets into proposals (e.g. echoed from a lead's message).
  for (const k of ['body', 'details']) if (typeof p[k] === 'string') p[k] = redactSecrets(p[k]).text;
  if (kind === 'email') {
    const exists = p.recipient_type === 'lead' ? db.prepare('SELECT 1 FROM leads WHERE id = ?').get(p.recipient_id) : db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'client'").get(p.recipient_id);
    if (!exists) return { ok: false, error: `${p.recipient_type} ${p.recipient_id} does not exist` };
  }
  if (kind === 'ad_campaign' && !db.prepare('SELECT 1 FROM services WHERE slug = ? AND is_active = 1').get(p.service_slug)) return { ok: false, error: `unknown service ${p.service_slug}` };
  const key = dedupeKey || `${kind}:${kind === 'email' ? `${p.recipient_type}-${p.recipient_id}` : slugify(head.data.title)}`;
  // Don't repeat a suggestion that is still open, or that was dismissed or done in the last 14 days.
  const dup = db.prepare(`SELECT id FROM operator_actions WHERE dedupe_key = ? AND (status IN ('proposed','approved')
    OR (status IN ('dismissed','done') AND COALESCE(decided_at, created_at) >= datetime('now','-14 days')))`).get(key);
  if (dup) return { ok: false, duplicate: true, error: `already suggested (action #${dup.id}); skip it` };
  const id = db.prepare(`INSERT INTO operator_actions (run_id, area, kind, priority, title, rationale, payload, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .get(runId, head.data.area, kind, head.data.priority, head.data.title, head.data.rationale, JSON.stringify(p), key).id;
  if (getSettings().operator_autonomy === 'assist' && INTERNAL.has(kind)) approve(id, { auto: true });
  return { ok: true, id };
}

export const getAction = (id) => row(db.prepare('SELECT * FROM operator_actions WHERE id = ?').get(id), ['payload']);
export const listActions = (status = 'open') => rows(db.prepare(`SELECT * FROM operator_actions WHERE ${status === 'open' ? "status IN ('proposed','approved')" : 'status = ?'}
  ORDER BY CASE status WHEN 'proposed' THEN 0 ELSE 1 END, priority, id DESC LIMIT 200`).all(...(status === 'open' ? [] : [status])), ['payload']);

/** A person edits a proposal before approving it (e.g. tweaks an email). */
export function editAction(id, payloadPatch) {
  const a = getAction(id);
  if (!a || a.status !== 'proposed') throw Object.assign(new Error('Only open proposals can be edited'), { status: 409 });
  const parsed = PAYLOADS[a.kind].safeParse({ ...a.payload, ...payloadPatch });
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')), { status: 400 });
  db.prepare('UPDATE operator_actions SET payload = ? WHERE id = ?').run(JSON.stringify(parsed.data), id);
  return getAction(id);
}

function finish(id, status, result, actorId) {
  db.prepare("UPDATE operator_actions SET status = ?, result = ?, decided_by = COALESCE(decided_by, ?), decided_at = COALESCE(decided_at, datetime('now')) WHERE id = ?")
    .run(status, result, actorId, id);
  return getAction(id);
}

/** Approve and carry out a proposal. Returns the updated action. */
export function approve(id, { actorId = null, auto = false } = {}) {
  const a = getAction(id);
  if (!a) throw Object.assign(new Error('Action not found'), { status: 404 });
  if (a.status !== 'proposed') throw Object.assign(new Error(`This action is already ${a.status}`), { status: 409 });
  const p = a.payload;
  const s = getSettings();
  try {
    let out;
    if (a.kind === 'email') {
      const r = p.recipient_type === 'lead'
        ? row(db.prepare('SELECT id, name, email FROM leads WHERE id = ?').get(p.recipient_id))
        : row(db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(p.recipient_id));
      sendEmail('operator.email', r.email, { name: r.name, subject: p.subject, body: p.body }, { name: r.name, ref: `${p.recipient_type}-${r.id}` });
      if (p.recipient_type === 'lead') db.prepare("UPDATE leads SET status = 'contacted' WHERE id = ? AND status = 'new'").run(r.id);
      out = finish(id, 'done', `Emailed ${r.name} <${r.email}>`, actorId);
    } else if (a.kind === 'blog_post') {
      let slug = slugify(p.title);
      if (db.prepare('SELECT 1 FROM posts WHERE slug = ?').get(slug)) slug = `${slug}-${Date.now().toString(36)}`;
      const post = db.prepare(`INSERT INTO posts (slug, title, excerpt, body, category, tags, meta_description, status, author) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?) RETURNING id`)
        .get(slug, p.title, p.excerpt, p.body, p.category, JSON.stringify(p.tags), p.meta_description || p.excerpt.slice(0, 155), `${s.business_name} Team`);
      out = finish(id, 'done', `Draft post #${post.id} created — review and publish in Command Centre → Blog`, actorId);
    } else if (a.kind === 'ad_campaign') {
      const utm = new URLSearchParams({ utm_source: { google_search: 'google', meta: 'meta', linkedin: 'linkedin', tiktok: 'tiktok' }[p.platform], utm_medium: 'paid', utm_campaign: slugify(a.title).slice(0, 50) });
      const url = `${canonicalUrl()}${p.landing_path}${p.landing_path.includes('?') ? '&' : '?'}${utm}`;
      out = finish(id, 'approved', `Approved budget R${p.daily_budget_rand}/day for ${p.duration_days} days. Create it in the ad platform with this tracking link: ${url} — results appear under Growth as “${utm.get('utm_source')} / paid”. Mark done once live.`, actorId);
    } else {
      // social_posts, task, call: accepted into the to-do list; a person marks them done.
      out = finish(id, 'approved', a.kind === 'social_posts' ? 'Copy approved — post it, then mark done.' : 'Added to your to-do list.', actorId);
    }
    logEvent('operator.action', `${auto ? 'Auto-approved' : 'Approved'} Operator ${a.kind}: ${a.title}`, { actor: actorId, ref: `op-${id}` });
    return out;
  } catch (err) {
    logEvent('operator.action_failed', `Operator action #${id} failed: ${err.message}`, { level: 'warn', ref: `op-${id}` });
    return finish(id, 'failed', err.message, actorId);
  }
}

export function dismiss(id, actorId, reason = '') {
  const a = getAction(id);
  if (!a || !['proposed', 'approved'].includes(a.status)) throw Object.assign(new Error('Only open actions can be dismissed'), { status: 409 });
  return finish(id, 'dismissed', reason || 'Dismissed', actorId);
}
export function markDone(id, actorId, note = '') {
  const a = getAction(id);
  if (!a || a.status !== 'approved') throw Object.assign(new Error('Only approved actions can be marked done'), { status: 409 });
  db.prepare("UPDATE operator_actions SET status = 'done', result = COALESCE(?, result), decided_by = ?, decided_at = datetime('now') WHERE id = ?").run(note || null, actorId, id);
  return getAction(id);
}
/** Proposals nobody acted on for 10 days expire, so the queue stays current. */
export const expireStale = () => db.prepare("UPDATE operator_actions SET status = 'expired' WHERE status = 'proposed' AND created_at < datetime('now','-10 days')").run().changes;

/** What the Operator learned from past decisions (fed back so it adapts). */
export const recentDecisions = (limit = 25) => rows(db.prepare(`SELECT kind, area, title, status, result FROM operator_actions
  WHERE status IN ('done','dismissed','approved','expired') ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ?`).all(limit));
