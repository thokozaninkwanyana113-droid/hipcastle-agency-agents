import jwt from 'jsonwebtoken';
import { db, row } from './db.js';
import { getSettings } from './settings.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

// `tv` (token version) lets us revoke every session for a user by incrementing users.token_version.
export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role, tv: user.token_version || 0 }, SECRET, { expiresIn: user.role === 'client' ? '7d' : '12h' });

// After a correct password, accounts with two-step sign-in get a 5-minute token that can only be
// exchanged for a session by entering a code.
export const signMfaToken = (user) => jwt.sign({ sub: user.id, purpose: 'mfa', tv: user.token_version || 0 }, SECRET, { expiresIn: '5m' });
export function verifyMfaToken(token) {
  try {
    const p = jwt.verify(String(token || ''), SECRET);
    if (p.purpose !== 'mfa') return null;
    const user = row(db.prepare('SELECT * FROM users WHERE id = ?').get(p.sub));
    return user && (p.tv || 0) === (user.token_version || 0) ? user : null;
  } catch { return null; }
}

/** Staff and admins must have two-step sign-in (unless switched off in Settings). */
export const mfaRequiredFor = (u) => (u.role === 'admin' || u.role === 'staff') && getSettings().staff_mfa_required !== false
  && (process.env.NODE_ENV !== 'test' || process.env.ENFORCE_MFA_IN_TESTS === '1');
const MFA_SETUP_PATHS = /^\/api\/auth\/(me|2fa(\/.*)?|logout-all)(\?.*)?$/;

/** Invalidate all existing sessions for a user; returns the updated user row. */
export const revokeSessions = (userId) => row(db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ? RETURNING *').get(userId));

export const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, company: u.company, phone: u.phone, role: u.role, created_at: u.created_at,
  billing_address: u.billing_address || '', vat_number: u.vat_number || '', whatsapp_opt_in: Boolean(u.whatsapp_opt_in),
  two_step: Boolean(u.totp_enabled_at), two_step_required: mfaRequiredFor(u) });

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = row(db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub));
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    if ((payload.tv || 0) !== (user.token_version || 0)) return res.status(401).json({ error: 'Your session has ended — please sign in again' });
    if (payload.purpose) return res.status(401).json({ error: 'Invalid or expired session' });
    if (!user.totp_enabled_at && mfaRequiredFor(user) && !MFA_SETUP_PATHS.test(req.originalUrl)) {
      return res.status(403).json({ error: 'Set up two-step sign-in to continue — it’s required for team accounts.', code: 'mfa_setup_required' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });

export const isStaff = (u) => u.role === 'admin' || u.role === 'staff';
