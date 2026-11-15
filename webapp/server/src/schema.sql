-- Hipcastle Agency — relational schema (SQLite dialect, portable to PostgreSQL)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  company       TEXT,
  phone         TEXT,
  role          TEXT    NOT NULL DEFAULT 'client' CHECK (role IN ('client','staff','admin')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- A service line offered by the agency (one per agent division)
CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  icon         TEXT    NOT NULL,
  tagline      TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  outcomes     TEXT    NOT NULL DEFAULT '[]',   -- JSON array of strings
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1
);

-- Exactly three tiers per service: essential, growth, enterprise
CREATE TABLE IF NOT EXISTS service_tiers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id     INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  tier           TEXT    NOT NULL CHECK (tier IN ('essential','growth','enterprise')),
  name           TEXT    NOT NULL,
  price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
  billing        TEXT    NOT NULL CHECK (billing IN ('once','monthly')),
  delivery_days  INTEGER NOT NULL,
  summary        TEXT    NOT NULL,
  features       TEXT    NOT NULL DEFAULT '[]',  -- JSON array of strings
  is_popular     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (service_id, tier)
);

-- AI specialists, imported from the agent markdown files in this repository
CREATE TABLE IF NOT EXISTS agents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  division     TEXT    NOT NULL,
  emoji        TEXT,
  color        TEXT,
  description  TEXT,
  vibe         TEXT,
  source_path  TEXT    NOT NULL
);

-- Which specialists staff which service line (many-to-many)
CREATE TABLE IF NOT EXISTS service_agents (
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  agent_id   INTEGER NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  PRIMARY KEY (service_id, agent_id)
);

-- Inbound enquiries from the contact / consultation form
CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  company     TEXT,
  phone       TEXT,
  service_id  INTEGER REFERENCES services(id) ON DELETE SET NULL,
  budget      TEXT,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','won','lost')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A purchased tier becomes an engagement (order/project)
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reference     TEXT    NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id       INTEGER NOT NULL REFERENCES service_tiers(id),
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','active','in_review','completed','cancelled')),
  brief         TEXT    NOT NULL,
  price_cents   INTEGER NOT NULL,
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date      TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  position   INTEGER NOT NULL,
  is_done    INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT    NOT NULL UNIQUE,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','void')),
  issued_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  due_at       TEXT    NOT NULL,
  paid_at      TEXT
);

-- Client <-> agency conversation per engagement
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS testimonials (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  author   TEXT NOT NULL,
  role     TEXT NOT NULL,
  quote    TEXT NOT NULL,
  rating   INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tiers_service   ON service_tiers(service_id);
CREATE INDEX IF NOT EXISTS idx_agents_division ON agents(division);
CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_messages_order  ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order  ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
