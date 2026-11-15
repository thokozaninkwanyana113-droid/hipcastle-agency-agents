// Outbound email: queue → SMTP with retries. Works with any SMTP provider that can send as
// @hipcastle.agency (Google Workspace, Microsoft 365, Zoho Mail, Brevo, Amazon SES, cPanel mail…).
// With no SMTP_HOST configured, emails are rendered and stored as "logged" so they can be previewed
// in the Command Centre without sending anything.
import nodemailer from 'nodemailer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, row, rows } from '../db.js';
import { logEvent } from '../events.js';
import { getSettings } from '../settings.js';
import { canonicalUrl } from '../urls.js';
import { renderLayout } from './layout.js';
import { TEMPLATES } from './templates.js';

const MAX_ATTEMPTS = 5;

export function emailConfig() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    mode: host ? 'smtp' : 'log',
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    user: process.env.SMTP_USER || '',
    hasPassword: Boolean(process.env.SMTP_PASS),
    from: fromAddress(),
  };
}

/** "Hipcastle Agency <hello@hipcastle.agency>" — overridable with EMAIL_FROM. */
export function fromAddress() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const s = getSettings();
  return `"${s.business_name.replace(/"/g, '')}" <${s.email}>`;
}

let transporter = null;
function transport() {
  const c = emailConfig();
  if (c.mode !== 'smtp') return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      auth: c.user ? { user: c.user, pass: process.env.SMTP_PASS } : undefined,
      pool: true, maxConnections: 3,
      connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    });
  }
  return transporter;
}

export async function verifyTransport() {
  const t = transport();
  if (!t) return { ok: false, message: 'SMTP is not configured — emails are being logged, not sent.' };
  try { await t.verify(); return { ok: true, message: `Connected to ${emailConfig().host}:${emailConfig().port}` }; }
  catch (err) { return { ok: false, message: err.message }; }
}

// ---------------------------------------------------------------- unsubscribe tokens
const secret = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';
export const unsubscribeToken = (email) => createHmac('sha256', secret()).update(`unsub:${email.toLowerCase()}`).digest('hex').slice(0, 32);
export function verifyUnsubscribe(email, token) {
  const a = Buffer.from(unsubscribeToken(email));
  const b = Buffer.from(String(token || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
export const unsubscribeUrl = (email) => `${canonicalUrl()}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken(email)}`;

// ---------------------------------------------------------------- rendering
export function renderTemplate(name, data) {
  const tpl = TEMPLATES[name];
  if (!tpl) throw new Error(`Unknown email template: ${name}`);
  const t = tpl.build(data);
  const unsub = t.newsletter && data.to ? unsubscribeUrl(data.to) : null;
  const { html, text } = renderLayout({ ...t, unsubscribeUrl: unsub });
  return { ...t, html, text, unsub };
}

/**
 * Queue an email. Never throws — a failed email must never break the request that triggered it.
 * @returns the queued email id, or null if skipped.
 */
export function sendEmail(template, to, data = {}, { name = null, ref = null, team = false } = {}) {
  try {
    const s = getSettings();
    if (!to) return null;
    if (!team && !s.emails_enabled && template !== 'auth.reset' && template !== 'system.test') return null;
    const r = renderTemplate(template, { ...data, to });
    const replyTo = r.replyTo || (r.billing ? s.billing_email : s.email);
    const headers = {};
    if (r.unsub) {
      headers['List-Unsubscribe'] = `<${r.unsub}>, <mailto:${s.email}?subject=unsubscribe>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    const { id } = db.prepare(`INSERT INTO emails (template, to_email, to_name, reply_to, subject, html, text, headers, ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .get(template, to.toLowerCase(), name, replyTo, r.subject, r.html, r.text, Object.keys(headers).length ? JSON.stringify(headers) : null, ref);
    setImmediate(() => processQueue().catch(() => {}));
    return id;
  } catch (err) {
    logEvent('email.error', `Could not queue ${template} to ${to}: ${err.message}`, { level: 'error' });
    return null;
  }
}

/** Send an email to the team inbox. */
export const notifyTeam = (template, data, opts = {}) => sendEmail(template, getSettings().notify_email, data, { ...opts, team: true });

let processing = false;
/** Deliver queued emails (called after each enqueue and every minute by the scheduler). */
export async function processQueue(limit = 20) {
  if (processing) return { sent: 0, failed: 0, logged: 0 };
  processing = true;
  const out = { sent: 0, failed: 0, logged: 0 };
  try {
    const due = rows(db.prepare(`SELECT * FROM emails WHERE status = 'queued'
      AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now')) ORDER BY id LIMIT ?`).all(limit));
    const t = transport();
    for (const e of due) {
      if (!t) {
        db.prepare("UPDATE emails SET status = 'logged', sent_at = datetime('now') WHERE id = ?").run(e.id);
        out.logged++;
        continue;
      }
      try {
        const info = await t.sendMail({
          from: fromAddress(),
          to: e.to_name ? { name: e.to_name, address: e.to_email } : e.to_email,
          replyTo: e.reply_to || undefined,
          subject: e.subject, html: e.html, text: e.text,
          headers: e.headers ? JSON.parse(e.headers) : undefined,
        });
        db.prepare("UPDATE emails SET status = 'sent', attempts = attempts + 1, sent_at = datetime('now'), provider_id = ?, last_error = NULL WHERE id = ?")
          .run(info.messageId || null, e.id);
        out.sent++;
      } catch (err) {
        const attempts = e.attempts + 1;
        const final = attempts >= MAX_ATTEMPTS;
        db.prepare(`UPDATE emails SET status = ?, attempts = ?, last_error = ?, next_attempt_at = datetime('now', ?) WHERE id = ?`)
          .run(final ? 'failed' : 'queued', attempts, err.message.slice(0, 500), `+${2 ** attempts} minutes`, e.id);
        if (final) logEvent('email.failed', `Email “${e.subject}” to ${e.to_email} failed after ${attempts} attempts: ${err.message}`, { level: 'error', ref: e.ref });
        out.failed++;
      }
    }
  } finally {
    processing = false;
  }
  return out;
}

export function retryEmail(id) {
  return row(db.prepare(`UPDATE emails SET status = 'queued', attempts = 0, next_attempt_at = NULL, last_error = NULL
    WHERE id = ? AND status IN ('failed','logged','cancelled','sent') RETURNING id`).get(id));
}
