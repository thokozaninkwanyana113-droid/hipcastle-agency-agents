import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, row } from '../db.js';
import { body, z } from '../validate.js';
import { authenticate, publicUser, signToken } from '../auth.js';

const r = Router();
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);

r.post('/register', body(z.object({
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
  const user = row(db.prepare(`INSERT INTO users (name, email, password_hash, company, phone)
    VALUES (?, ?, ?, ?, ?) RETURNING *`).get(name, lower, bcrypt.hashSync(req.body.password, 10), company, phone));
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

r.post('/login', body(z.object({ email: z.string().trim().email(), password: z.string().min(1) })), (req, res) => {
  const user = row(db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email.toLowerCase()));
  if (!user || !bcrypt.compareSync(req.body.password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

r.get('/me', authenticate, (req, res) => res.json(publicUser(req.user)));

r.patch('/me', authenticate, body(z.object({
  name: z.string().trim().min(2).max(100).optional(),
  company: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(40).optional(),
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
  const updated = row(db.prepare('UPDATE users SET name = ?, company = ?, phone = ?, password_hash = ? WHERE id = ? RETURNING *')
    .get(b.name ?? u.name, b.company ?? u.company, b.phone ?? u.phone, hash, u.id));
  res.json(publicUser(updated));
});

export default r;
