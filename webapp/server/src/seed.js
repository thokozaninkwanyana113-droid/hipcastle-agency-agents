// Seeds the catalog, imports agents from the repository's markdown files,
// and creates an admin plus demo data. Idempotent: safe to run repeatedly.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { db, tx } from './db.js';
import { catalog, testimonials } from './catalog.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.AGENTS_ROOT || resolve(here, '../../..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return meta.name ? meta : null;
}

export function loadAgents() {
  const agents = [];
  const divisions = new Set(catalog.flatMap((s) => s.divisions));
  for (const division of divisions) {
    let files = [];
    try { files = walk(join(REPO_ROOT, division)); } catch { continue; }
    for (const file of files) {
      const meta = parseFrontmatter(readFileSync(file, 'utf8'));
      if (!meta) continue;
      agents.push({
        slug: basename(file, '.md'),
        name: meta.name,
        division,
        emoji: meta.emoji || '🤖',
        color: meta.color || null,
        description: meta.description || '',
        vibe: meta.vibe || '',
        source_path: relative(REPO_ROOT, file),
      });
    }
  }
  return agents;
}

export function seed({ demo = true, log = console.log } = {}) {
  tx(() => {
    const upsertService = db.prepare(`
      INSERT INTO services (slug, name, icon, tagline, description, outcomes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET name=excluded.name, icon=excluded.icon, tagline=excluded.tagline,
        description=excluded.description, outcomes=excluded.outcomes, sort_order=excluded.sort_order
      RETURNING id`);
    const upsertTier = db.prepare(`
      INSERT INTO service_tiers (service_id, tier, name, price_cents, billing, delivery_days, summary, features, is_popular)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(service_id, tier) DO UPDATE SET name=excluded.name, price_cents=excluded.price_cents,
        billing=excluded.billing, delivery_days=excluded.delivery_days, summary=excluded.summary,
        features=excluded.features, is_popular=excluded.is_popular`);
    const upsertAgent = db.prepare(`
      INSERT INTO agents (slug, name, division, emoji, color, description, vibe, source_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET name=excluded.name, division=excluded.division, emoji=excluded.emoji,
        color=excluded.color, description=excluded.description, vibe=excluded.vibe, source_path=excluded.source_path
      RETURNING id`);
    const link = db.prepare('INSERT OR IGNORE INTO service_agents (service_id, agent_id) VALUES (?, ?)');

    const agents = loadAgents();
    const agentIds = new Map();
    for (const a of agents) {
      agentIds.set(a.slug, upsertAgent.get(a.slug, a.name, a.division, a.emoji, a.color, a.description, a.vibe, a.source_path).id);
    }

    const tierKeys = ['essential', 'growth', 'enterprise'];
    catalog.forEach((s, i) => {
      const { id } = upsertService.get(s.slug, s.name, s.icon, s.tagline, s.description, JSON.stringify(s.outcomes), i);
      s.tiers.forEach((t, j) =>
        upsertTier.run(id, tierKeys[j], t.name, t.price_cents, t.billing, t.delivery_days, t.summary, JSON.stringify(t.features), t.is_popular ? 1 : 0));
      for (const a of agents) if (s.divisions.includes(a.division)) link.run(id, agentIds.get(a.slug));
      for (const slug of s.agentSlugs || []) if (agentIds.has(slug)) link.run(id, agentIds.get(slug));
    });

    if (db.prepare('SELECT COUNT(*) n FROM testimonials').get().n === 0) {
      const ins = db.prepare('INSERT INTO testimonials (author, role, quote, rating) VALUES (?, ?, ?, ?)');
      for (const t of testimonials) ins.run(t.author, t.role, t.quote, t.rating);
    }

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hipcastle.agency').toLowerCase();
    if (!db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail)) {
      const pw = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
      db.prepare(`INSERT INTO users (name, email, password_hash, company, role) VALUES (?, ?, ?, 'Hipcastle Agency', 'admin')`)
        .run('Hipcastle Admin', adminEmail, bcrypt.hashSync(pw, 10));
      log(`Created admin ${adminEmail}${process.env.ADMIN_PASSWORD ? '' : ' (default password ChangeMe123! — change it)'}`);
    }

    if (demo && !db.prepare("SELECT id FROM users WHERE email = 'client@example.com'").get()) {
      const { id: uid } = db.prepare(`INSERT INTO users (name, email, password_hash, company, role)
        VALUES ('Demo Client', 'client@example.com', ?, 'Acme Ltd', 'client') RETURNING id`).get(bcrypt.hashSync('Client123!', 10));
      const tier = db.prepare(`SELECT st.* FROM service_tiers st JOIN services s ON s.id = st.service_id
        WHERE s.slug = 'engineering' AND st.tier = 'growth'`).get();
      const { id: oid } = db.prepare(`INSERT INTO orders (reference, user_id, tier_id, status, brief, price_cents, progress, due_date)
        VALUES ('HC-DEMO01', ?, ?, 'active', 'Build a customer self-service portal MVP.', ?, 40, date('now', '+30 days')) RETURNING id`)
        .get(uid, tier.id, tier.price_cents);
      const ms = db.prepare('INSERT INTO milestones (order_id, title, position, is_done, done_at) VALUES (?, ?, ?, ?, ?)');
      ['Kick-off & discovery', 'Architecture & design', 'Build sprint 1', 'Build sprint 2', 'QA & launch']
        .forEach((title, i) => ms.run(oid, title, i, i < 2 ? 1 : 0, i < 2 ? new Date().toISOString() : null));
      db.prepare(`INSERT INTO invoices (number, order_id, amount_cents, status, due_at, paid_at)
        VALUES ('INV-DEMO01', ?, ?, 'paid', date('now'), datetime('now'))`).run(oid, tier.price_cents / 2);
      db.prepare(`INSERT INTO invoices (number, order_id, amount_cents, status, due_at)
        VALUES ('INV-DEMO02', ?, ?, 'unpaid', date('now', '+30 days'))`).run(oid, tier.price_cents / 2);
      db.prepare('INSERT INTO messages (order_id, author_id, body) VALUES (?, ?, ?)')
        .run(oid, uid, 'Excited to get started — please share the discovery agenda.');
      log('Created demo client client@example.com / Client123!');
    }
    log(`Seeded ${catalog.length} services (${catalog.length * 3} tiers) and ${agents.length} agents.`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed({ demo: !process.argv.includes('--no-demo') });
}
