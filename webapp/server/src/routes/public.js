import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, row, rows } from '../db.js';
import { body, z } from '../validate.js';

const REPO_ROOT = process.env.AGENTS_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const r = Router();

const tiersFor = (serviceId) =>
  rows(db.prepare(`SELECT * FROM service_tiers WHERE service_id = ?
    ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(serviceId), ['features']);

r.get('/services', (req, res) => {
  const services = rows(db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM service_agents sa WHERE sa.service_id = s.id) AS agent_count,
           (SELECT MIN(price_cents) FROM service_tiers t WHERE t.service_id = s.id) AS from_price_cents
    FROM services s WHERE s.is_active = 1 ORDER BY s.sort_order`).all(), ['outcomes']);
  if (req.query.include === 'tiers') for (const s of services) s.tiers = tiersFor(s.id);
  res.json(services);
});

r.get('/services/:slug', (req, res) => {
  const s = row(db.prepare('SELECT * FROM services WHERE slug = ? AND is_active = 1').get(req.params.slug), ['outcomes']);
  if (!s) return res.status(404).json({ error: 'Service not found' });
  s.tiers = tiersFor(s.id);
  s.agents = rows(db.prepare(`SELECT a.slug, a.name, a.emoji, a.description, a.vibe, a.division
    FROM agents a JOIN service_agents sa ON sa.agent_id = a.id WHERE sa.service_id = ? ORDER BY a.name`).all(s.id));
  res.json(s);
});

r.get('/agents', (req, res) => {
  const { q = '', service = '' } = req.query;
  const list = rows(db.prepare(`
    SELECT a.slug, a.name, a.emoji, a.color, a.description, a.vibe, a.division,
           (SELECT s.slug FROM services s JOIN service_agents sa ON sa.service_id = s.id
             WHERE sa.agent_id = a.id ORDER BY s.slug = a.division DESC LIMIT 1) AS service_slug
    FROM agents a
    WHERE (? = '' OR a.name LIKE ? OR a.description LIKE ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM service_agents sa JOIN services s ON s.id = sa.service_id
                             WHERE sa.agent_id = a.id AND s.slug = ?))
    ORDER BY a.division, a.name`).all(q, `%${q}%`, `%${q}%`, service, service));
  res.json(list);
});

r.get('/agents/:slug', (req, res) => {
  const a = row(db.prepare('SELECT * FROM agents WHERE slug = ?').get(req.params.slug));
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  try {
    const md = readFileSync(resolve(REPO_ROOT, a.source_path), 'utf8');
    a.profile = md.replace(/^---[\s\S]*?---\s*/, '');
  } catch { a.profile = ''; }
  a.services = rows(db.prepare(`SELECT s.slug, s.name, s.icon FROM services s
    JOIN service_agents sa ON sa.service_id = s.id WHERE sa.agent_id = ?`).all(a.id));
  delete a.source_path;
  res.json(a);
});

r.get('/testimonials', (_req, res) => res.json(rows(db.prepare('SELECT * FROM testimonials ORDER BY id').all())));

r.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  res.json({
    services: one('SELECT COUNT(*) n FROM services WHERE is_active = 1'),
    tiers: one('SELECT COUNT(*) n FROM service_tiers'),
    agents: one('SELECT COUNT(*) n FROM agents'),
    projects: one("SELECT COUNT(*) n FROM orders WHERE status <> 'cancelled'"),
  });
});

r.post('/leads', body(z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(150).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  service: z.string().trim().max(60).optional().default(''),
  budget: z.string().trim().max(60).optional().default(''),
  message: z.string().trim().min(10).max(5000),
})), (req, res) => {
  const b = req.body;
  const svc = b.service ? db.prepare('SELECT id FROM services WHERE slug = ?').get(b.service) : null;
  const lead = row(db.prepare(`INSERT INTO leads (name, email, company, phone, service_id, budget, message)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at`)
    .get(b.name, b.email.toLowerCase(), b.company, b.phone, svc?.id ?? null, b.budget, b.message));
  res.status(201).json({ ok: true, id: lead.id });
});

r.post('/newsletter', body(z.object({ email: z.string().trim().email().max(200) })), (req, res) => {
  db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').run(req.body.email.toLowerCase());
  res.status(201).json({ ok: true });
});

export default r;
