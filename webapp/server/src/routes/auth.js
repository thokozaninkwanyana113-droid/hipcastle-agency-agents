import { attributionFrom } from '../analytics.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, row } from '../db.js';
import { body, z } from '../validate.js';
import { authenticate, publicUser, revokeSessions, signToken } from '../auth.js';
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
  res.json({ token: signToken(user), user: publicUser(user) });
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
  res.json({ token: signToken(user), user: publicUser(user) });
});

export default r;
