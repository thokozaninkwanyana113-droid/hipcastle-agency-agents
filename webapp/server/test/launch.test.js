// Regression tests for the pre-launch audit fixes (see webapp/AUDIT.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

process.env.SITE_URL = 'https://hipcastle.test';
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { watchPipelines } = await import('../src/pipeline.js');

let server, base, root;
const call = async (method, path, { token, body, headers } = {}) => {
  const res = await fetch(base + path, {
    method, redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
};
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.token;
const settle = () => new Promise((r) => setTimeout(r, 40));
const count = (sql, ...p) => db.prepare(sql).get(...p).n;
let admin, staff, alice, bob;

before(async () => {
  seed({ demo: false, log: () => {} }); // production-like: no demo data
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  root = `http://127.0.0.1:${server.address().port}`;
  base = `${root}/api`;
  admin = await login('admin@hipcastle.agency', 'ChangeMe123!');
  const reg = async (name, email) => (await call('POST', '/auth/register', { body: { name, email, password: 'password123' } })).data.token;
  alice = await reg('Alice Client', 'alice@example.com');
  bob = await reg('Bob Other', 'bob@example.com');
  const s = await reg('Sam Staff', 'staff@example.com');
  const sid = db.prepare("SELECT id FROM users WHERE email = 'staff@example.com'").get().id;
  await call('PATCH', `/admin/users/${sid}`, { token: admin, body: { role: 'staff' } });
  staff = s;
});
after(() => server.close());

const newOrder = async (token, slug = 'design', tier = 'essential') => {
  const t = (await call('GET', `/services/${slug}`)).data.tiers.find((x) => x.tier === tier);
  const o = (await call('POST', '/orders', { token, body: { tier_id: t.id, brief: 'A brief long enough for validation purposes.' } })).data;
  const d = (await call('GET', `/orders/${o.id}`, { token })).data;
  return { order: d, invoice: d.invoices[0] };
};

test('F1: no sample testimonials without demo data', async () => {
  assert.equal((await call('GET', '/testimonials')).data.length, 0);
  assert.equal(count('SELECT COUNT(*) n FROM testimonials'), 0);
});

test('F2/F3: claims describe AI playbooks and a human-led team', async () => {
  const faqs = (await call('GET', '/faqs')).data;
  const who = faqs.find((f) => f.q === 'Who does the work?');
  assert.match(who.a, /human-led/);
  assert.doesNotMatch(JSON.stringify(faqs), /all nine provinces/);
  const llms = await fetch(`${root}/llms.txt`).then((r) => r.text());
  assert.match(llms, /AI playbooks/);
});

test('S1: payment return URL is read-only; only the owner can cancel', async () => {
  const { invoice } = await newOrder(alice);
  const co = (await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: invoice.id, gateway: 'payfast' } })).data;
  assert.match(co.reference, /^HCP-[A-Z0-9]+-[A-F0-9]{16}$/, '64-bit random reference');
  const ret = await call('GET', `/payments/return?ref=${co.reference}&status=cancelled`);
  assert.equal(ret.status, 303);
  assert.match(ret.headers.get('location'), /gateway_status=cancelled/);
  assert.equal((await call('GET', `/payments/status/${co.reference}`, { token: alice })).data.status, 'initiated', 'unauthenticated link changed nothing');
  assert.equal((await call('POST', `/payments/${co.reference}/cancel`)).status, 401);
  assert.equal((await call('POST', `/payments/${co.reference}/cancel`, { token: bob })).status, 404);
  assert.equal((await call('POST', `/payments/${co.reference}/cancel`, { token: alice })).data.status, 'cancelled');
});

test('S2: password change, reset and "sign out everywhere" revoke old sessions', async () => {
  const old = await login('bob@example.com', 'password123');
  const second = await login('bob@example.com', 'password123');
  const changed = await call('PATCH', '/auth/me', { token: old, body: { currentPassword: 'password123', newPassword: 'NewPassword1!' } });
  assert.ok(changed.data.token);
  assert.equal((await call('GET', '/orders', { token: second })).status, 401, 'other session signed out');
  assert.equal((await call('GET', '/orders', { token: old })).status, 401, 'old token of this session signed out');
  assert.equal((await call('GET', '/orders', { token: changed.data.token })).status, 200, 'fresh token works');
  const out = await call('POST', '/auth/logout-all', { token: changed.data.token });
  assert.equal((await call('GET', '/orders', { token: changed.data.token })).status, 401);
  assert.equal((await call('GET', '/orders', { token: out.data.token })).status, 200);
  bob = out.data.token;
});

test('S3: honeypot silently drops bots; newsletter is double opt-in and throttled; auto-replies throttled', async () => {
  const leads = count('SELECT COUNT(*) n FROM leads');
  const bot = await call('POST', '/leads', { body: { name: 'Bot', email: 'victim@example.com', message: 'buy cheap things now', consent: true, website: 'http://spam.example' } });
  assert.equal(bot.status, 201);
  assert.equal(count('SELECT COUNT(*) n FROM leads'), leads, 'bot submission not stored');
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'security.bot_blocked'").get());

  await call('POST', '/newsletter', { body: { email: 'target@example.com' } });
  await call('POST', '/newsletter', { body: { email: 'target@example.com' } });
  await settle();
  assert.equal(count("SELECT COUNT(*) n FROM emails WHERE to_email = 'target@example.com'"), 1, 'one confirmation email per 24h');
  assert.equal(count("SELECT COUNT(*) n FROM emails WHERE to_email = 'target@example.com' AND template = 'newsletter.welcome'"), 0, 'no welcome until confirmed');
  assert.equal(db.prepare("SELECT status FROM newsletter_subscribers WHERE email = 'target@example.com'").get().status, 'pending');

  for (let i = 0; i < 2; i++) await call('POST', '/leads', { body: { name: 'Real Person', email: 'person@example.com', message: 'We need a new website please.', consent: true } });
  await settle();
  assert.equal(count("SELECT COUNT(*) n FROM emails WHERE template = 'lead.autoreply' AND to_email = 'person@example.com'"), 1, 'one auto-reply per address per day');
});

test('S3: Turnstile is enforced when configured', async () => {
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  process.env.TURNSTILE_SITE_KEY = 'test-site-key';
  try {
    assert.equal((await call('GET', '/site')).data.turnstile_site_key, 'test-site-key');
    const r = await call('POST', '/leads', { body: { name: 'No Captcha', email: 'nc@example.com', message: 'Hello there, need help.', consent: true } });
    assert.equal(r.status, 400);
    assert.ok(r.data.fields.captcha);
    // Newsletter relies on double opt-in instead of a captcha.
    assert.equal((await call('POST', '/newsletter', { body: { email: 'nl@example.com' } })).status, 201);
  } finally {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SITE_KEY;
  }
});

test('S4: only admins can change invoice status, with a reason', async () => {
  const { invoice } = await newOrder(alice, 'academic');
  assert.equal((await call('PATCH', `/admin/invoices/${invoice.id}`, { token: staff, body: { status: 'paid', reason: 'EFT received' } })).status, 403);
  assert.equal((await call('PATCH', `/admin/invoices/${invoice.id}`, { token: admin, body: { status: 'paid' } })).status, 400);
  const ok = await call('PATCH', `/admin/invoices/${invoice.id}`, { token: admin, body: { status: 'paid', reason: 'EFT received, FNB ref 1234' } });
  assert.equal(ok.data.status, 'paid');
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'invoice.status' AND message LIKE '%FNB ref 1234%'").get());
});

test('S5: links must be http(s)', async () => {
  const bad = await call('PUT', '/admin/settings', { token: admin, body: { social: { facebook: 'javascript:alert(1)', instagram: '', linkedin: '', x: '', tiktok: '', youtube: '' } } });
  assert.equal(bad.status, 400);
  const { order } = await newOrder(alice, 'testing');
  const ms = order.milestones.find((m) => m.key === 'kickoff');
  db.prepare("UPDATE orders SET status = 'active' WHERE id = ?").run(order.id);
  const r = await call('POST', `/orders/${order.id}/milestones/${ms.id}/submit`, { token: admin, body: { url: 'javascript:alert(document.cookie)', note: 'x' } });
  assert.equal(r.status, 400);
});

test('S6: CORS is locked to the site in production', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const app = createApp().listen(0);
  process.env.NODE_ENV = prev;
  await new Promise((r) => app.once('listening', r));
  const url = `http://127.0.0.1:${app.address().port}/api/health`;
  const evil = await fetch(url, { headers: { Origin: 'https://evil.example' } });
  const good = await fetch(url, { headers: { Origin: 'https://hipcastle.test' } });
  app.close();
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://hipcastle.test');
});

test('S7: production refuses to create an admin with a default or short password', () => {
  const run = (env) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/seed.js', '--no-demo'],
    { env: { PATH: process.env.PATH, NODE_ENV: 'production', JWT_SECRET: 'x', DATABASE_PATH: ':memory:', ...env }, encoding: 'utf8' });
  const none = run({});
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /ADMIN_PASSWORD must be set in production/);
  assert.match(run({ ADMIN_PASSWORD: 'short' }).stderr, /at least 10 characters/);
  assert.equal(run({ ADMIN_PASSWORD: 'A-strong-launch-password' }).status, 0);
});

test('S10: public stats do not reveal the number of projects', async () => {
  assert.equal((await call('GET', '/stats')).data.projects, undefined);
});

test('B1: concurrent checkouts are blocked; duplicate payments are flagged for refund', async () => {
  const { invoice } = await newOrder(alice, 'product');
  const first = (await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: invoice.id, gateway: 'simulated' } })).data;
  const blocked = await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: invoice.id, gateway: 'simulated' } });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'payment_in_progress');
  // Simulate the race: a second attempt that started before the first one completed.
  db.prepare("UPDATE payments SET created_at = datetime('now','-40 minutes') WHERE reference = ?").run(first.reference);
  const second = (await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: invoice.id, gateway: 'simulated' } })).data;
  await call('POST', `/payments/simulated/${first.reference}`, { token: alice, body: { outcome: 'complete' } });
  const dup = (await call('POST', `/payments/simulated/${second.reference}`, { token: alice, body: { outcome: 'complete' } })).data;
  assert.equal(dup.needs_refund, 1);
  await settle();
  assert.ok(count("SELECT COUNT(*) n FROM emails WHERE template = 'payment.duplicate'") >= 1);
  const list = (await call('GET', '/admin/payments', { token: admin })).data;
  assert.ok(list.find((p) => p.reference === second.reference).needs_refund);
  assert.equal((await call('POST', `/admin/payments/${second.reference}/refunded`, { token: staff, body: { note: 'PF refund 99' } })).status, 403);
  const done = (await call('POST', `/admin/payments/${second.reference}/refunded`, { token: admin, body: { note: 'PayFast refund 99' } })).data;
  assert.equal(done.needs_refund, 0);
  assert.ok(done.refunded_at);
});

test('B2: onboarding reminders count from the deposit, not the last edit', async () => {
  const { order, invoice } = await newOrder(alice, 'sales');
  const co = (await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: invoice.id, gateway: 'simulated' } })).data;
  await call('POST', `/payments/simulated/${co.reference}`, { token: alice, body: { outcome: 'complete' } });
  const reminders = () => count("SELECT COUNT(*) n FROM emails WHERE template = 'onboarding.reminder' AND ref = ?", order.reference);
  watchPipelines();
  assert.equal(reminders(), 0, 'no reminder on the day of payment');
  db.prepare("UPDATE invoices SET paid_at = datetime('now','-3 days') WHERE id = ?").run(invoice.id);
  db.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(order.id); // a recent edit must not delay it
  watchPipelines();
  await settle();
  assert.equal(reminders(), 1);
});
