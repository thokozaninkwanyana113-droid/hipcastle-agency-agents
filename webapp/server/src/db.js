import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DATABASE_PATH || resolve(here, '../data/hipcastle.db');

if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

/** Run fn inside a transaction; rolls back on throw. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
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
