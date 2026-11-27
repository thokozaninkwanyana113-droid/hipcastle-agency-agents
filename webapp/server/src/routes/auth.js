import { attributionFrom } from '../analytics.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, row } from '../db.js';
import { body, z } from '../validate.js';
import { authenticate, mfaRequiredFor, publicUser, revokeSessions, signMfaToken, signToken, verifyMfaToken } from '../auth.js';
import * as T from '../totp.js';
import { waNumber } from '../integrations/meta.js';
import { botCheck } from '../botcheck.js';
import { createHash, randomBytes } from 'node:crypto';
import { logEvent } from '../events.js';
import { onRegister } from '../email/notify.js';
import { sendEmail } from '../email/mailer.js';
import { canonicalUrl } from '../urls.js';

const r = Router();
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);

r.post('/register', botCheck('register'), body(z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  password,
  company: z.string().trim().max(150).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
})), (req, res) => {
  const { name, email, company, phone } = req.body;
  const lower = email.toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(lower)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const attr = attributionFrom(req, new URL(canonicalUrl()).hostname);
  const user = row(db.prepare(`INSERT INTO users (name, email, password_hash, company, phone, attribution)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING *`).get(name, lower, bcrypt.hashSync(req.body.password, 10), company, phone, attr ? JSON.stringify(attr) : null));
  logEvent('user.registered', `New client account: ${user.name}${company ? ` (${company})` : ''}`, { actor: user.id });
  onRegister(user);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

r.post('/login', body(z.object({ email: z.string().trim().email(), password: z.string().min(1) })), (req, res) => {
  const user = row(db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email.toLowerCase()));
  if (!user || !bcrypt.compareSync(req.body.password, user.password_hash)) {
    logEvent('auth.failed', `Failed sign-in for ${req.body.email.toLowerCase()}`, { level: 'warn', meta: { ip: req.ip } });
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (user.totp_enabled_at) return res.json({ mfa_required: true, mfa_token: signMfaToken(user) });
  res.json({ token: signToken(user), user: publicUser(user) });
});

// ---- Two-step sign-in ---------------------------------------------------------------
const MAX_FAILURES = 5;
const securityNotice = (user, event, req) => sendEmail('auth.security', user.email, { user, event, ip: req.ip, at: new Date().toISOString() }, { name: user.name });

// Second step: a 6-digit code from the authenticator app, or a recovery code.
r.post('/login/verify', body(z.object({ mfa_token: z.string().min(20).max(1000), code: z.string().trim().min(6).max(20) })), (req, res) => {
  const user = verifyMfaToken(req.body.mfa_token);
  if (!user || !user.totp_enabled_at) return res.status(401).json({ error: 'Your sign-in expired — please enter your password again.', code: 'mfa_expired' });
  if (user.mfa_locked_until && user.mfa_locked_until > new Date().toISOString()) {
    return res.status(429).json({ error: 'Too many wrong codes. Try again in 15 minutes, or use a recovery code later.' });
  }
  const code = req.body.code.replace(/\s/g, '');
  const step = /^\d{6}$/.test(code) ? T.verifyCode(T.openSecret(user.totp_secret), code, user.totp_last_step) : null;
  let remaining = null;
  if (step === null && !/^\d{6}$/.test(code)) remaining = T.useRecoveryCode(JSON.parse(user.recovery_codes || '[]'), code);
  if (step === null && !remaining) {
    const fails = user.mfa_failures + 1;
    const lock = fails >= MAX_FAILURES ? new Date(Date.now() + 15 * 60e3).toISOString() : null;
    db.prepare('UPDATE users SET mfa_failures = ?, mfa_locked_until = ? WHERE id = ?').run(lock ? 0 : fails, lock, user.id);
    logEvent('auth.mfa_failed', `Wrong two-step code for ${user.email}${lock ? ' — locked for 15 minutes' : ''}`, { level: 'warn', actor: user.id, meta: { ip: req.ip } });
    if (lock) securityNotice(user, 'locked', req);
    return res.status(401).json({ error: 'That code isn’t right. Check the time on your phone and try the newest code.' });
  }
  if (step !== null) db.prepare('UPDATE users SET totp_last_step = ?, mfa_failures = 0, mfa_locked_until = NULL WHERE id = ?').run(step, user.id);
  else {
    db.prepare('UPDATE users SET recovery_codes = ?, mfa_failures = 0, mfa_locked_until = NULL WHERE id = ?').run(JSON.stringify(remaining), user.id);
    logEvent('auth.recovery_used', `${user.email} signed in with a recovery code (${remaining.length} left)`, { level: 'warn', actor: user.id });
    securityNotice({ ...user, recovery_left: remaining.length }, 'recovery_used', req);
  }
  const fresh = row(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
  res.json({ token: signToken(fresh), user: publicUser(fresh), ...(remaining && { recovery_codes_left: remaining.length }) });
});

const twoStepStatus = (u) => ({ enabled: Boolean(u.totp_enabled_at), enabled_at: u.totp_enabled_at, required: mfaRequiredFor(u), recovery_codes_left: JSON.parse(u.recovery_codes || '[]').length });
r.get('/2fa', authenticate, (req, res) => res.json(twoStepStatus(req.user)));

// Start setup: a new secret shown as a QR code (and as text for manual entry). Not active until confirmed.
r.post('/2fa/setup', authenticate, async (req, res) => {
  if (req.user.totp_enabled_at) return res.status(409).json({ error: 'Two-step sign-in is already on. Turn it off first to move to a new phone.' });
  const secret = T.newSecret();
  db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(T.sealSecret(secret), req.user.id);
  const url = T.otpauthUrl(secret, req.user.email);
  res.json({ secret: secret.match(/.{1,4}/g).join(' '), otpauth_url: url, qr_svg: await T.qrSvg(url) });
});

// Confirm with the first code: turns it on, issues recovery codes (shown once) and signs out other devices.
r.post('/2fa/enable', authenticate, body(z.object({ code: z.string().trim().min(6).max(10) })), (req, res) => {
  const u = req.user;
  if (u.totp_enabled_at) return res.status(409).json({ error: 'Two-step sign-in is already on' });
  if (!u.totp_pending) return res.status(409).json({ error: 'Start setup first' });
  const secret = T.openSecret(u.totp_pending);
  const step = T.verifyCode(secret, req.body.code);
  if (step === null) return res.status(400).json({ error: 'That code isn’t right. Make sure your phone’s time is set automatically, then try the newest code.' });
  const { codes, hashes } = T.newRecoveryCodes();
  db.prepare(`UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_enabled_at = datetime('now'), totp_last_step = ?, recovery_codes = ?,
    mfa_failures = 0, mfa_locked_until = NULL WHERE id = ?`).run(T.sealSecret(secret), step, JSON.stringify(hashes), u.id);
  const fresh = revokeSessions(u.id);
  logEvent('auth.mfa_enabled', `${u.email} turned on two-step sign-in`, { actor: u.id });
  securityNotice(fresh, 'enabled', req);
  res.json({ token: signToken(fresh), user: publicUser(fresh), recovery_codes: codes, status: twoStepStatus(fresh) });
});

r.post('/2fa/recovery-codes', authenticate, body(z.object({ code: z.string().trim().min(6).max(10) })), (req, res) => {
  const u = req.user;
  if (!u.totp_enabled_at) return res.status(409).json({ error: 'Two-step sign-in is off' });
  const step = T.verifyCode(T.openSecret(u.totp_secret), req.body.code, u.totp_last_step);
  if (step === null) return res.status(400).json({ error: 'That code isn’t right' });
  const { codes, hashes } = T.newRecoveryCodes();
  db.prepare('UPDATE users SET recovery_codes = ?, totp_last_step = ? WHERE id = ?').run(JSON.stringify(hashes), step, u.id);
  logEvent('auth.recovery_regenerated', `${u.email} created new recovery codes`, { actor: u.id });
  res.json({ recovery_codes: codes, status: twoStepStatus({ ...u, recovery_codes: JSON.stringify(hashes) }) });
});

r.post('/2fa/disable', authenticate, body(z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(20) })), (req, res) => {
  const u = req.user;
  if (!u.totp_enabled_at) return res.status(409).json({ error: 'Two-step sign-in is already off' });
  if (mfaRequiredFor(u)) return res.status(403).json({ error: 'Two-step sign-in is required for team accounts. To move to a new phone, ask an admin to reset it.' });
  if (!bcrypt.compareSync(req.body.password, u.password_hash)) return res.status(400).json({ error: 'Password is incorrect' });
  const ok = T.verifyCode(T.openSecret(u.totp_secret), req.body.code, u.totp_last_step) !== null || T.useRecoveryCode(JSON.parse(u.recovery_codes || '[]'), req.body.code);
  if (!ok) return res.status(400).json({ error: 'That code isn’t right' });
  db.prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, recovery_codes = NULL, totp_last_step = 0 WHERE id = ?').run(u.id);
  const fresh = revokeSessions(u.id);
  logEvent('auth.mfa_disabled', `${u.email} turned off two-step sign-in`, { actor: u.id, level: 'warn' });
  securityNotice(fresh, 'disabled', req);
  res.json({ token: signToken(fresh), user: publicUser(fresh), status: twoStepStatus(fresh) });
});

r.get('/me', authenticate, (req, res) => res.json(publicUser(req.user)));

// Sign out of every device (returns a fresh token for this one).
r.post('/logout-all', authenticate, (req, res) => {
  const user = revokeSessions(req.user.id);
  logEvent('auth.logout_all', `${user.email} signed out of all sessions`, { actor: user.id });
  res.json({ token: signToken(user), user: publicUser(user) });
});

r.patch('/me', authenticate, body(z.object({
  name: z.string().trim().min(2).max(100).optional(),
  company: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(40).optional(),
  whatsapp_opt_in: z.boolean().optional(),
  billing_address: z.string().trim().max(300).optional(),
  vat_number: z.string().trim().regex(/^(4\d{9})?$/, { message: 'SA VAT numbers are 10 digits starting with 4' }).optional(),
  currentPassword: z.string().optional(),
  newPassword: password.optional(),
})), (req, res) => {
  const u = req.user;
  const b = req.body;
  let hash = u.password_hash;
  if (b.newPassword) {
    if (!b.currentPassword || !bcrypt.compareSync(b.currentPassword, u.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    hash = bcrypt.hashSync(b.newPassword, 10);
  }
  if (b.whatsapp_opt_in && !waNumber(b.phone ?? u.phone)) return res.status(400).json({ error: 'Add a valid mobile number to get WhatsApp updates', fields: { phone: 'e.g. 082 123 4567' } });
  let updated = row(db.prepare('UPDATE users SET name = ?, company = ?, phone = ?, billing_address = ?, vat_number = ?, password_hash = ?, whatsapp_opt_in = ? WHERE id = ? RETURNING *')
    .get(b.name ?? u.name, b.company ?? u.company, b.phone ?? u.phone, b.billing_address ?? u.billing_address, b.vat_number ?? u.vat_number, hash, b.whatsapp_opt_in !== undefined ? (b.whatsapp_opt_in ? 1 : 0) : u.whatsapp_opt_in, u.id));
  if (b.newPassword) {
    // A new password signs out every other session; this one gets a fresh token.
    updated = revokeSessions(u.id);
    logEvent('auth.password_changed', `${u.email} changed their password (other sessions signed out)`, { actor: u.id, level: 'warn' });
    return res.json({ ...publicUser(updated), token: signToken(updated) });
  }
  res.json(publicUser(updated));
});

// ---- Password reset ----------------------------------------------------------------
const sha256 = (t) => createHash('sha256').update(t).digest('hex');

r.post('/forgot', body(z.object({ email: z.string().trim().email() })), (req, res) => {
  const user = row(db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(req.body.email.toLowerCase()));
  if (user) {
    const recent = db.prepare("SELECT COUNT(*) n FROM password_resets WHERE user_id = ? AND created_at > datetime('now','-15 minutes')").get(user.id).n;
    if (recent < 3) {
      const token = randomBytes(32).toString('base64url');
      db.prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now','+1 hour'))").run(user.id, sha256(token));
      sendEmail('auth.reset', user.email, { user, url: `${canonicalUrl()}/reset-password?token=${token}` }, { name: user.name });
      logEvent('auth.reset_requested', `Password reset requested for ${user.email}`, { actor: user.id });
    }
  }
  // Same response whether or not the account exists, so emails can't be enumerated.
  res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
});

r.post('/reset', body(z.object({ token: z.string().min(20).max(200), password })), (req, res) => {
  const rec = row(db.prepare(`SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`)
    .get(sha256(req.body.token)));
  if (!rec) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(req.body.password, 10), rec.user_id);
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(rec.user_id);
  const user = revokeSessions(rec.user_id); // sign out every existing session
  logEvent('auth.reset_completed', `Password reset for ${user.email}`, { actor: user.id, level: 'warn' });
  if (user.totp_enabled_at) return res.json({ mfa_required: true, mfa_token: signMfaToken(user) }); // a reset never skips the code step
  res.json({ token: signToken(user), user: publicUser(user) });
});

export default r;
