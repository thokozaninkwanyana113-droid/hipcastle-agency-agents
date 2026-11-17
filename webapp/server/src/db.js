import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DATABASE_PATH || resolve(here, '../data/hipcastle.db');

if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Upgrade databases created by earlier versions before applying the schema
// (indexes in schema.sql may reference the new columns).
// service_tiers gained a `plan` column that is part of its UNIQUE key (core packages vs care
// plans). SQLite can't change a constraint in place, so rebuild the table once, keeping ids
// (orders reference them).
const tierCols = db.prepare('PRAGMA table_info(service_tiers)').all().map((c) => c.name);
if (tierCols.length && !tierCols.includes('plan')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`BEGIN;
    CREATE TABLE service_tiers__new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      tier TEXT NOT NULL CHECK (tier IN ('essential','growth','enterprise')),
      plan TEXT NOT NULL DEFAULT 'core' CHECK (plan IN ('core','care')),
      name TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      billing TEXT NOT NULL CHECK (billing IN ('once','monthly')), delivery_days INTEGER NOT NULL,
      summary TEXT NOT NULL, features TEXT NOT NULL DEFAULT '[]', is_popular INTEGER NOT NULL DEFAULT 0,
      care_minutes INTEGER, support_priority TEXT,
      UNIQUE (service_id, tier, plan));
    INSERT INTO service_tiers__new (id, service_id, tier, plan, name, price_cents, billing, delivery_days, summary, features, is_popular)
      SELECT id, service_id, tier, 'core', name, price_cents, billing, delivery_days, summary, features, is_popular FROM service_tiers;
    DROP TABLE service_tiers;
    ALTER TABLE service_tiers__new RENAME TO service_tiers;
    COMMIT;`);
  db.exec('PRAGMA foreign_keys = ON');
}

const MIGRATIONS = {
  invoices: { subtotal_cents: 'INTEGER NOT NULL DEFAULT 0', vat_cents: 'INTEGER NOT NULL DEFAULT 0', description: 'TEXT' },
  users: { token_version: 'INTEGER NOT NULL DEFAULT 0', attribution: 'TEXT', billing_address: 'TEXT', vat_number: 'TEXT' },
  newsletter_subscribers: { status: "TEXT NOT NULL DEFAULT 'active'", confirmed_at: 'TEXT', confirm_sent_at: 'TEXT' },
  payments: { needs_refund: 'INTEGER NOT NULL DEFAULT 0', refunded_at: 'TEXT', refund_note: 'TEXT', is_recurring: 'INTEGER NOT NULL DEFAULT 0' },
  leads: { province: 'TEXT', preferred_contact: 'TEXT', source: 'TEXT', attribution: 'TEXT' },
  milestones: {
    key: 'TEXT', stage: 'TEXT', cycle: 'INTEGER NOT NULL DEFAULT 0', agent_slug: 'TEXT', days: 'INTEGER NOT NULL DEFAULT 1', due_date: 'TEXT',
    status: "TEXT NOT NULL DEFAULT 'todo'", requires_approval: 'INTEGER NOT NULL DEFAULT 0', client_task: 'INTEGER NOT NULL DEFAULT 0',
    deliverable: 'TEXT', deliverable_url: 'TEXT', deliverable_note: 'TEXT', client_feedback: 'TEXT', revisions_used: 'INTEGER NOT NULL DEFAULT 0',
    started_at: 'TEXT', submitted_at: 'TEXT', approved_at: 'TEXT', last_reminded_at: 'TEXT',
  },
  orders: {
    pipeline_kind: "TEXT NOT NULL DEFAULT 'project'", revisions_allowed: 'INTEGER', kickoff_at: 'TEXT', onboarding_completed_at: 'TEXT',
    onboarding_reminded_at: 'TEXT', delivered_at: 'TEXT', current_cycle: 'INTEGER NOT NULL DEFAULT 0', next_cycle_at: 'TEXT',
    nps_score: 'INTEGER', nps_comment: 'TEXT', feedback_at: 'TEXT', covers_order_id: 'INTEGER', attribution: 'TEXT',
    payfast_token: 'TEXT', autopay_status: 'TEXT', autopay_amount_cents: 'INTEGER', autopay_since: 'TEXT',
  },
  tickets: { care_order_id: 'INTEGER' },
  testimonials: {
    company: 'TEXT', location: 'TEXT', service_id: 'INTEGER', user_id: 'INTEGER', email: 'TEXT',
    status: "TEXT NOT NULL DEFAULT 'approved'", is_featured: 'INTEGER NOT NULL DEFAULT 0', created_at: 'TEXT',
  },
};
for (const [table, cols] of Object.entries(MIGRATIONS)) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existing.length) continue; // table will be created by schema.sql
  for (const [col, def] of Object.entries(cols)) {
    if (!existing.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
// Milestones created before pipelines existed: mirror is_done into the new status column.
db.exec("UPDATE milestones SET status = 'done' WHERE is_done = 1 AND status <> 'done'");

/** Run fn inside a transaction; rolls back on throw. Nested calls join the outer transaction. */
let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

/** Convert null-prototype rows into plain objects and parse JSON columns. */
export function row(r, jsonCols = []) {
  if (!r) return r;
  const o = { ...r };
  for (const c of jsonCols) if (typeof o[c] === 'string') o[c] = JSON.parse(o[c]);
  return o;
}
export const rows = (rs, jsonCols) => rs.map((r) => row(r, jsonCols));
