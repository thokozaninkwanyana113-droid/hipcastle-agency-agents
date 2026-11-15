import jwt from 'jsonwebtoken';
import { db, row } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '7d' });

export const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, company: u.company, phone: u.phone, role: u.role, created_at: u.created_at });

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = row(db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub));
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });

export const isStaff = (u) => u.role === 'admin' || u.role === 'staff';
