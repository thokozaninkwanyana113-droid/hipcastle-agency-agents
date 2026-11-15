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
const MIGRATIONS = {
  invoices: { subtotal_cents: 'INTEGER NOT NULL DEFAULT 0', vat_cents: 'INTEGER NOT NULL DEFAULT 0', description: 'TEXT' },
  leads: { province: 'TEXT', preferred_contact: 'TEXT', source: 'TEXT' },
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
