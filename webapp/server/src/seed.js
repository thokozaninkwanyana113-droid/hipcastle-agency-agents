// Seeds the catalog, imports agents from the repository's markdown files,
// and creates an admin plus demo data. Idempotent: safe to run repeatedly.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { db, tx } from './db.js';
import { CARE, CARE_PRIORITY } from './care.js';
import { catalog, testimonials } from './catalog.js';
import { seedPosts } from './posts-seed.js';
import { instantiatePipeline } from './pipeline.js';

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

/**
 * @param {object} opts
 * @param {boolean} opts.demo         create the demo client + engagement
 * @param {boolean} opts.syncCatalog  overwrite service copy and tier prices from catalog.js
 *                                    (otherwise only missing services/tiers are inserted, so
 *                                    edits made in the Command Centre survive restarts)
 */
function migrateDomain(log) {
  const oldAdmin = db.prepare("SELECT id FROM users WHERE email = 'admin@hipcastle.co.za'").get();
  if (oldAdmin && !db.prepare("SELECT 1 FROM users WHERE email = 'admin@hipcastle.agency'").get()) {
    db.prepare("UPDATE users SET email = 'admin@hipcastle.agency' WHERE id = ?").run(oldAdmin.id);
    log('Migrated admin login to admin@hipcastle.agency');
  }
  const emailRow = db.prepare("SELECT value FROM settings WHERE key = 'email'").get();
  if (emailRow && /hipcastle\.co\.za/.test(emailRow.value)) db.prepare("DELETE FROM settings WHERE key = 'email'").run();
  const social = db.prepare("SELECT value FROM settings WHERE key = 'social'").get();
  if (social) {
    // Replace generic platform home pages saved by earlier versions with the Hipcastle Agency profiles.
    const v = JSON.parse(social.value);
    const generic = Object.values(v).filter((u) => u && !/^https?:\/\/[^/]+\/.+/.test(u)).length;
    if (generic) db.prepare("DELETE FROM settings WHERE key = 'social'").run();
  }
}

export function seed({ demo = true, syncCatalog = false, log = console.log } = {}) {
  tx(() => {
    const upsertService = db.prepare(`
      INSERT INTO services (slug, name, icon, tagline, description, outcomes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO ${syncCatalog ? `UPDATE SET name=excluded.name, icon=excluded.icon, tagline=excluded.tagline,
        description=excluded.description, outcomes=excluded.outcomes, sort_order=excluded.sort_order` : 'NOTHING'}`);
    const serviceId = db.prepare('SELECT id FROM services WHERE slug = ?');
    const upsertTier = db.prepare(`
      INSERT INTO service_tiers (service_id, tier, plan, name, price_cents, billing, delivery_days, summary, features, is_popular, care_minutes, support_priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(service_id, tier, plan) DO ${syncCatalog ? `UPDATE SET name=excluded.name, price_cents=excluded.price_cents,
        billing=excluded.billing, delivery_days=excluded.delivery_days, summary=excluded.summary,
        features=excluded.features, is_popular=excluded.is_popular, care_minutes=excluded.care_minutes,
        support_priority=excluded.support_priority` : 'NOTHING'}`);
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
      upsertService.run(s.slug, s.name, s.icon, s.tagline, s.description, JSON.stringify(s.outcomes), i);
      const { id } = serviceId.get(s.slug);
      s.tiers.forEach((t, j) =>
        upsertTier.run(id, tierKeys[j], 'core', t.name, t.price_cents, t.billing, t.delivery_days, t.summary, JSON.stringify(t.features), t.is_popular ? 1 : 0, null, null));
      // Monthly care plans (aftercare, maintenance & hosting) — see care.js
      (CARE[s.slug]?.tiers || []).forEach((t, j) =>
        upsertTier.run(id, tierKeys[j], 'care', `${tierKeys[j][0].toUpperCase()}${tierKeys[j].slice(1)} Care`, t.price_cents, 'monthly', 30, t.summary,
          JSON.stringify(t.features), t.is_popular ? 1 : 0, t.care_minutes, CARE_PRIORITY[tierKeys[j]]));
      for (const a of agents) if (s.divisions.includes(a.division)) link.run(id, agentIds.get(a.slug));
      for (const slug of s.agentSlugs || []) if (agentIds.has(slug)) link.run(id, agentIds.get(slug));
    });

    // Sample reviews are demo data only — never publish them on a live site.
    if (demo && db.prepare('SELECT COUNT(*) n FROM testimonials').get().n === 0) {
      const ins = db.prepare(`INSERT INTO testimonials (author, role, company, location, service_id, quote, rating, status, is_featured, created_at)
        VALUES (?, ?, ?, ?, (SELECT id FROM services WHERE slug = ?), ?, ?, 'approved', ?, datetime('now'))`);
      for (const t of testimonials) ins.run(t.author, t.role, t.company, t.location, t.service, t.quote, t.rating, t.featured);
    }

    // Blog: insert starter posts once (never overwrite edits made in the Command Centre).
    const insPost = db.prepare(`INSERT OR IGNORE INTO posts (slug, title, excerpt, body, category, tags, cover_emoji, meta_title, meta_description, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', datetime('now', ?))`);
    seedPosts.forEach((p, i) => insPost.run(p.slug, p.title, p.excerpt, p.body, p.category, JSON.stringify(p.tags), p.cover_emoji, p.meta_title || null, p.meta_description, `-${i * 4} days`));

    // One-off upgrade from the earlier hipcastle.co.za placeholders to the hipcastle.agency domain.
    migrateDomain(log);

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hipcastle.agency').toLowerCase();
    if (!db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail)) {
      if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
        throw new Error('ADMIN_PASSWORD must be set in production to create the first admin account (refusing to use a default password).');
      }
      if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 10) {
        throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
      }
      const pw = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
      db.prepare(`INSERT INTO users (name, email, password_hash, company, role) VALUES (?, ?, ?, 'Hipcastle Agency', 'admin')`)
        .run('Hipcastle Admin', adminEmail, bcrypt.hashSync(pw, 10));
      log(`Created admin ${adminEmail}${process.env.ADMIN_PASSWORD ? '' : ' (default password ChangeMe123! — change it)'}`);
    }

    if (demo && !db.prepare("SELECT id FROM users WHERE email = 'client@example.com'").get()) {
      const { id: uid } = db.prepare(`INSERT INTO users (name, email, password_hash, company, role)
        VALUES ('Demo Client', 'client@example.com', ?, 'Demo Trading (Pty) Ltd', 'client') RETURNING id`).get(bcrypt.hashSync('Client123!', 10));
      const tier = db.prepare(`SELECT st.* FROM service_tiers st JOIN services s ON s.id = st.service_id
        WHERE s.slug = 'engineering' AND st.tier = 'growth' AND st.plan = 'core'`).get();
      const { id: oid } = db.prepare(`INSERT INTO orders (reference, user_id, tier_id, status, brief, price_cents, progress, due_date)
        VALUES ('HC-DEMO01', ?, ?, 'active', 'Build a customer self-service portal MVP.', ?, 40, date('now', '+30 days')) RETURNING id`)
        .get(uid, tier.id, tier.price_cents);
      // Real delivery pipeline, with onboarding done and the first deliverable waiting for approval.
      instantiatePipeline(oid);
      db.prepare("UPDATE onboarding_items SET status = 'done', response = 'Provided during demo setup', completed_at = datetime('now') WHERE order_id = ?").run(oid);
      db.prepare("UPDATE orders SET onboarding_completed_at = datetime('now'), kickoff_at = datetime('now') WHERE id = ?").run(oid);
      db.prepare("UPDATE milestones SET status = 'done', is_done = 1, done_at = datetime('now') WHERE order_id = ? AND stage = 'onboarding'").run(oid);
      db.prepare(`UPDATE milestones SET status = 'awaiting_client', submitted_at = datetime('now'), deliverable_url = 'https://www.figma.com/',
        deliverable_note = 'Here are the prioritised user stories for the portal — please review.' WHERE order_id = ? AND key = 'requirements'`).run(oid);
      db.prepare("UPDATE orders SET status = 'in_review', progress = 15 WHERE id = ?").run(oid);
      const half = tier.price_cents / 2;
      db.prepare(`INSERT INTO invoices (number, order_id, subtotal_cents, vat_cents, amount_cents, description, status, due_at, paid_at)
        VALUES ('INV-DEMO01', ?, ?, 0, ?, 'Deposit (50%)', 'paid', date('now'), datetime('now'))`).run(oid, half, half);
      db.prepare(`INSERT INTO invoices (number, order_id, subtotal_cents, vat_cents, amount_cents, description, status, due_at)
        VALUES ('INV-DEMO02', ?, ?, 0, ?, 'Balance on delivery (50%)', 'unpaid', date('now', '+30 days'))`).run(oid, half, half);
      db.prepare('INSERT INTO messages (order_id, author_id, body) VALUES (?, ?, ?)')
        .run(oid, uid, 'Excited to get started — please share the discovery agenda.');
      log('Created demo client client@example.com / Client123!');
    }
    log(`Catalog: ${catalog.length} services (${catalog.length * 3} tiers)${syncCatalog ? ' synced from catalog.js' : ''}; ${agents.length} agents imported.`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed({ demo: !process.argv.includes('--no-demo'), syncCatalog: process.argv.includes('--sync-catalog') });
}
