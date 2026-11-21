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
  token_version INTEGER NOT NULL DEFAULT 0,             -- bump to sign out every session
  attribution   TEXT,                                   -- first-touch JSON when the account was created
  billing_address TEXT,                                 -- shown on tax invoices
  vat_number    TEXT,                                   -- client's VAT number (required on tax invoices over R5 000)
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
  plan           TEXT    NOT NULL DEFAULT 'core' CHECK (plan IN ('core','care')),  -- 'care' = monthly aftercare plan
  name           TEXT    NOT NULL,
  price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
  billing        TEXT    NOT NULL CHECK (billing IN ('once','monthly')),
  delivery_days  INTEGER NOT NULL,
  summary        TEXT    NOT NULL,
  features       TEXT    NOT NULL DEFAULT '[]',  -- JSON array of strings
  is_popular     INTEGER NOT NULL DEFAULT 0,
  care_minutes   INTEGER,                        -- care plans: hands-on time included per month
  support_priority TEXT,                         -- care plans: first-response target for tickets
  UNIQUE (service_id, tier, plan)
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
  attribution TEXT,                       -- first-touch JSON {source, landing, campaign, first_seen}
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
  pipeline_kind TEXT    NOT NULL DEFAULT 'project' CHECK (pipeline_kind IN ('project','retainer')),
  revisions_allowed INTEGER,                           -- client revision rounds per deliverable (NULL = unlimited)
  kickoff_at    TEXT,
  onboarding_completed_at TEXT,
  onboarding_reminded_at  TEXT,
  delivered_at  TEXT,
  current_cycle INTEGER NOT NULL DEFAULT 0,
  next_cycle_at TEXT,
  nps_score     INTEGER CHECK (nps_score BETWEEN 0 AND 10),
  nps_comment   TEXT,
  feedback_at   TEXT,
  covers_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  attribution   TEXT,                      -- first-touch JSON of the client when ordering
  payfast_token TEXT,                      -- PayFast subscription token (automatic monthly card payments)
  autopay_status TEXT CHECK (autopay_status IN ('active','cancelled')),
  autopay_amount_cents INTEGER,             -- amount PayFast charges each month (incl. VAT)
  autopay_since TEXT, -- care plans: the delivered project being looked after
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestones (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  position          INTEGER NOT NULL,
  is_done           INTEGER NOT NULL DEFAULT 0,
  done_at           TEXT,
  -- delivery pipeline (see playbooks.js)
  key               TEXT,
  stage             TEXT,
  cycle             INTEGER NOT NULL DEFAULT 0,             -- retainer month (0 = not part of a cycle)
  agent_slug        TEXT,                                   -- owner specialist
  days              INTEGER NOT NULL DEFAULT 1,
  due_date          TEXT,
  status            TEXT    NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo','in_progress','awaiting_client','changes_requested','blocked','done')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  client_task       INTEGER NOT NULL DEFAULT 0,
  deliverable       TEXT,                                   -- what the client receives
  deliverable_url   TEXT,
  deliverable_note  TEXT,
  client_feedback   TEXT,
  revisions_used    INTEGER NOT NULL DEFAULT 0,
  started_at        TEXT,
  submitted_at      TEXT,
  approved_at       TEXT,
  last_reminded_at  TEXT
);

-- Onboarding checklist & intake questionnaire per engagement
CREATE TABLE IF NOT EXISTS onboarding_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  key          TEXT    NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('question','access','asset','meeting','legal')),
  label        TEXT    NOT NULL,
  field_type   TEXT    NOT NULL DEFAULT 'text',
  options      TEXT,                                        -- JSON array for selects
  required     INTEGER NOT NULL DEFAULT 0,
  response     TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  completed_at TEXT,
  position     INTEGER NOT NULL,
  UNIQUE (order_id, key)
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
  needs_refund   INTEGER NOT NULL DEFAULT 0,        -- duplicate payment on an already-paid invoice
  refunded_at    TEXT,
  refund_note    TEXT,
  is_recurring   INTEGER NOT NULL DEFAULT 0,        -- charged automatically by a PayFast subscription
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
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),  -- double opt-in
  confirmed_at    TEXT,
  confirm_sent_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Website chatbot conversations (kept 180 days, then deleted by the retention job)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id              TEXT PRIMARY KEY,                    -- random UUID held by the browser
  mode            TEXT NOT NULL DEFAULT 'faq' CHECK (mode IN ('ai','faq')),
  page            TEXT,
  ip_hash         TEXT,
  message_count   INTEGER NOT NULL DEFAULT 0,
  handoff_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT NOT NULL,
  source        TEXT,                                  -- ai | faq | fallback (assistant only)
  kb_ids        TEXT,                                  -- JSON: knowledge entries used (faq mode)
  answered      INTEGER NOT NULL DEFAULT 1,            -- 0 = the bot could not answer
  helpful       INTEGER,                               -- visitor feedback: 1 / 0 / NULL
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Client support desk
CREATE TABLE IF NOT EXISTS tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT NOT NULL UNIQUE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  subject           TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('project','billing','technical','account','other')),
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_client','resolved','closed')),
  assigned_to       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sla_due_at        TEXT NOT NULL,                     -- first-response target
  first_response_at TEXT,
  resolved_at       TEXT,
  csat_score        INTEGER CHECK (csat_score BETWEEN 1 AND 5),
  csat_comment      TEXT,
  care_order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,  -- raised under a care plan (faster target)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  internal   INTEGER NOT NULL DEFAULT 0,               -- staff-only note
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created ON chat_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

-- First-party analytics (no cookies, no personal information): daily counts per page / source.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day      TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('page','source')),
  key      TEXT NOT NULL,
  views    INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, key)
);
-- Today's anonymous visitor hashes (salt rotates daily; pruned after 2 days) to count uniques.
CREATE TABLE IF NOT EXISTS analytics_visitors (
  day  TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (day, hash)
);

-- Service agreements (ECTA: electronic signatures are valid for these contracts). The document text is
-- frozen at creation and its SHA-256 recorded at signing, with who, when and from where.
CREATE TABLE IF NOT EXISTS agreements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  document      TEXT NOT NULL,
  doc_hash      TEXT NOT NULL,
  requires_signature INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','signed')),
  method        TEXT CHECK (method IN ('checkout','signature')),
  signer_name   TEXT,
  signer_title  TEXT,
  signer_email  TEXT,
  signer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  signed_at     TEXT,
  signer_ip     TEXT,
  signer_agent  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The Operator: the agency's internal business-management agent (see operator/).
CREATE TABLE IF NOT EXISTS operator_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger       TEXT NOT NULL CHECK (trigger IN ('schedule','manual')),
  instruction   TEXT,
  mode          TEXT NOT NULL CHECK (mode IN ('ai','rules')),
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  brief         TEXT,                                -- Markdown
  model         TEXT,
  input_tokens  INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
  actions_proposed INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  actor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT
);
CREATE TABLE IF NOT EXISTS operator_actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER REFERENCES operator_runs(id) ON DELETE SET NULL,
  area        TEXT NOT NULL CHECK (area IN ('sales','marketing','advertising','finance','delivery','support','retention','operations')),
  kind        TEXT NOT NULL CHECK (kind IN ('email','blog_post','social_posts','ad_campaign','task','call')),
  priority    INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),   -- 1 = do today
  title       TEXT NOT NULL,
  rationale   TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',          -- JSON, depends on kind
  dedupe_key  TEXT,                                 -- stops the same suggestion being made every day
  status      TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','done','dismissed','failed','expired')),
  result      TEXT,
  decided_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_operator_actions_status ON operator_actions(status, area);
CREATE INDEX IF NOT EXISTS idx_operator_actions_dedupe ON operator_actions(dedupe_key);

-- Design studio: creative brief, AI/Figma/uploaded concepts, client picks and the brand kit
CREATE TABLE IF NOT EXISTS design_projects (
  order_id     INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  brief        TEXT NOT NULL DEFAULT '{}',       -- JSON: business_name, scope, personality, audience, likes, industry, notes
  directions   TEXT NOT NULL DEFAULT '[]',       -- JSON: [{name, idea, palette[hex], fonts{heading,body}, prompt}]
  directions_by TEXT CHECK (directions_by IN ('ai','rules','staff')),
  figma_url    TEXT,
  figma_meta   TEXT,                             -- JSON: name, last_modified, thumbnail, frames[]
  checks       TEXT NOT NULL DEFAULT '{}',       -- JSON: designer_refined, trademark_checked, trademark_note
  kit_released_at TEXT,
  generations  INTEGER NOT NULL DEFAULT 0,       -- AI images generated (cost control)
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS design_assets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  direction    INTEGER,                          -- index into directions (concepts)
  kind         TEXT NOT NULL DEFAULT 'concept' CHECK (kind IN ('concept','final')),
  variant      TEXT CHECK (variant IN ('primary','mono_dark','mono_light','icon','other')),
  title        TEXT NOT NULL,
  mime         TEXT NOT NULL CHECK (mime IN ('image/svg+xml','image/png','image/jpeg','image/webp')),
  data         BLOB NOT NULL,
  bytes        INTEGER NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('recraft','figma','upload','derived')),
  prompt       TEXT,
  shared       INTEGER NOT NULL DEFAULT 0,       -- visible to the client
  client_pick  INTEGER NOT NULL DEFAULT 0,
  client_comment TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_design_assets_order ON design_assets(order_id, kind);

-- Connected third-party services (e.g. Xero). Tokens are encrypted (AES-256-GCM) with a key derived from JWT_SECRET.
CREATE TABLE IF NOT EXISTS integrations (
  provider   TEXT PRIMARY KEY,
  data       TEXT NOT NULL,                       -- encrypted JSON
  label      TEXT,                                -- e.g. the Xero organisation name
  connected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- What has been pushed to the accounting system (idempotent sync).
CREATE TABLE IF NOT EXISTS accounting_sync (
  provider    TEXT NOT NULL,
  entity      TEXT NOT NULL CHECK (entity IN ('contact','invoice','payment','void')),
  entity_id   INTEGER NOT NULL,
  external_id TEXT,
  status      TEXT NOT NULL DEFAULT 'synced' CHECK (status IN ('synced','failed')),
  error       TEXT,
  meta        TEXT,                               -- e.g. the accounting system's invoice total
  attempts    INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, entity, entity_id)
);

-- Care plans: hands-on time logged against the monthly allowance
CREATE TABLE IF NOT EXISTS care_time (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cycle      INTEGER NOT NULL,                         -- the order's month number when the work was done
  ticket_id  INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  staff_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  minutes    INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_care_time_order ON care_time(order_id, cycle);
CREATE INDEX IF NOT EXISTS idx_service_tiers_plan ON service_tiers(plan);

CREATE INDEX IF NOT EXISTS idx_orders_payfast_token ON orders(payfast_token);
CREATE INDEX IF NOT EXISTS idx_payments_txn ON payments(gateway_txn_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at);
CREATE INDEX IF NOT EXISTS idx_tiers_service   ON service_tiers(service_id);
CREATE INDEX IF NOT EXISTS idx_agents_division ON agents(division);
CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_milestones_order ON milestones(order_id, position);
CREATE INDEX IF NOT EXISTS idx_milestones_due ON milestones(status, due_date);
CREATE INDEX IF NOT EXISTS idx_onboarding_order ON onboarding_items(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_order  ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order  ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status);
CREATE INDEX IF NOT EXISTS idx_events_created   ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type      ON events(type);
CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts(status, published_at);
