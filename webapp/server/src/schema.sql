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
  province    TEXT,
  preferred_contact TEXT,
  source      TEXT,
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
  subtotal_cents INTEGER NOT NULL DEFAULT 0,      -- excl. VAT
  vat_cents      INTEGER NOT NULL DEFAULT 0,
  amount_cents   INTEGER NOT NULL,                -- total payable (incl. VAT)
  description    TEXT,
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
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author     TEXT NOT NULL,
  role       TEXT NOT NULL,
  quote      TEXT NOT NULL,
  rating     INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  company    TEXT,
  location   TEXT,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT,
  status     TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

-- Online payment attempts through PayFast / Ozow (one invoice can have many attempts)
CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  reference      TEXT    NOT NULL UNIQUE,         -- our m_payment_id / TransactionReference
  invoice_id     INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  gateway        TEXT    NOT NULL CHECK (gateway IN ('payfast','ozow','simulated','manual')),
  amount_cents   INTEGER NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'initiated'
                 CHECK (status IN ('initiated','pending','complete','failed','cancelled','abandoned')),
  gateway_txn_id TEXT,
  status_message TEXT,
  is_test        INTEGER NOT NULL DEFAULT 1,
  raw_notify     TEXT,                              -- last notification payload (JSON)
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Key/value business settings, managed from the Command Centre
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                         -- JSON encoded
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit / activity log for every important system event
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                         -- e.g. order.created, payment.complete
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message    TEXT NOT NULL,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ref        TEXT,
  meta       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Blog / insights
CREATE TABLE IF NOT EXISTS posts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  excerpt          TEXT NOT NULL,
  body             TEXT NOT NULL,                   -- Markdown
  category         TEXT NOT NULL DEFAULT 'Insights',
  tags             TEXT NOT NULL DEFAULT '[]',
  cover_emoji      TEXT NOT NULL DEFAULT '📝',
  author           TEXT NOT NULL DEFAULT 'Hipcastle Team',
  meta_title       TEXT,
  meta_description TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at     TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  views            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Outbound email queue (transactional + newsletter), processed with retries
CREATE TABLE IF NOT EXISTS emails (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  template        TEXT NOT NULL,
  to_email        TEXT NOT NULL,
  to_name         TEXT,
  reply_to        TEXT,
  subject         TEXT NOT NULL,
  html            TEXT NOT NULL,
  text            TEXT NOT NULL,
  headers         TEXT,                               -- JSON extra headers (e.g. List-Unsubscribe)
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','logged','cancelled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error      TEXT,
  provider_id     TEXT,
  ref             TEXT,                               -- related order/invoice/lead reference
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT
);

-- Single-use password reset tokens (only a SHA-256 hash is stored)
CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at);
CREATE INDEX IF NOT EXISTS idx_tiers_service   ON service_tiers(service_id);
CREATE INDEX IF NOT EXISTS idx_agents_division ON agents(division);
CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_messages_order  ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order  ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status);
CREATE INDEX IF NOT EXISTS idx_events_created   ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type      ON events(type);
CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts(status, published_at);
