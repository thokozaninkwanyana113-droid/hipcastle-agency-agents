import jwt from 'jsonwebtoken';
import { db, row } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

// `tv` (token version) lets us revoke every session for a user by incrementing users.token_version.
export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role, tv: user.token_version || 0 }, SECRET, { expiresIn: '7d' });

/** Invalidate all existing sessions for a user; returns the updated user row. */
export const revokeSessions = (userId) => row(db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ? RETURNING *').get(userId));

export const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, company: u.company, phone: u.phone, role: u.role, created_at: u.created_at,
  billing_address: u.billing_address || '', vat_number: u.vat_number || '', whatsapp_opt_in: Boolean(u.whatsapp_opt_in) });

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = row(db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub));
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    if ((payload.tv || 0) !== (user.token_version || 0)) return res.status(401).json({ error: 'Your session has ended — please sign in again' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });

export const isStaff = (u) => u.role === 'admin' || u.role === 'staff';
