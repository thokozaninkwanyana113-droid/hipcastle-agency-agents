// Launch hardening: health check, off-site backups, alerts, price revision.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

process.env.SITE_URL = 'https://hipcastle.test';
process.env.ALERTS_IN_TESTS = '1';
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { logEvent } = await import('../src/events.js');
const { alertsSent, resetAlerts } = await import('../src/alerts.js');
const { setOffsiteClient, uploadBackup, offsiteConfig } = await import('../src/offsite.js');
const { catalog, PRICE_REVISION } = await import('../src/catalog.js');

let server, base, hook, hits = [];
before(async () => {
  seed({ demo: false, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  hook = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { hits.push(JSON.parse(b)); res.end('ok'); }); }).listen(0);
  await new Promise((r) => hook.once('listening', r));
  process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/hook`;
});
after(() => { server.close(); hook.close(); });
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

test('health check proves the database answers', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.db, 'ok');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('errors alert the team by email and webhook, throttled per problem', async () => {
  resetAlerts(); hits = [];
  logEvent('job.failed', 'Database backup failed: Access Denied', { level: 'error' });
  logEvent('job.failed', 'Database backup failed again', { level: 'error' });
  logEvent('email.failed', 'SMTP down', { level: 'error' }); // never alerts (would loop)
  await wait(150);
  assert.equal(alertsSent(), 1);
  assert.equal(hits.length, 1);
  assert.match(hits[0].text, /Database backup failed: Access Denied/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'system.alert'").get().n, 1);
  // A different problem alerts separately.
  logEvent('system.crash', 'Uncaught exception: boom', { level: 'error' });
  await wait(150);
  assert.equal(hits.length, 2);
});

test('off-site backup uploads a gzipped snapshot and keeps only the newest copies', async () => {
  const sent = [];
  const store = new Map([...Array(32)].map((_, i) => [`hipcastle/hipcastle-2026-10-${String(i).padStart(2, '0')}.db.gz`, 1]));
  setOffsiteClient({ send: async (cmd) => {
    const name = cmd.constructor.name; sent.push(name);
    if (name === 'PutObjectCommand') { store.set(cmd.input.Key, cmd.input.Body); return {}; }
    if (name === 'ListObjectsV2Command') return { Contents: [...store.keys()].map((Key) => ({ Key })) };
    if (name === 'DeleteObjectsCommand') { cmd.input.Delete.Objects.forEach((o) => store.delete(o.Key)); return {}; }
    return {};
  } });
  assert.equal(await uploadBackup('/nope'), null, 'disabled without credentials');
  Object.assign(process.env, { BACKUP_S3_BUCKET: 'b', BACKUP_S3_ACCESS_KEY_ID: 'k', BACKUP_S3_SECRET_ACCESS_KEY: 's' });
  assert.equal(offsiteConfig().enabled, true);
  const dir = mkdtempSync(join(tmpdir(), 'hc-'));
  const file = join(dir, 'hipcastle-2026-11-17T02-00-00-000Z.db');
  writeFileSync(file, 'SQLite format 3\0 test');
  const r = await uploadBackup(file);
  assert.equal(r.key, 'hipcastle/hipcastle-2026-11-17T02-00-00-000Z.db.gz');
  assert.equal(gunzipSync(store.get(r.key)).toString(), 'SQLite format 3\0 test');
  assert.equal(r.pruned, 3, '33 copies → keep newest 30');
  assert.ok(store.has(r.key));
  assert.deepEqual(sent, ['PutObjectCommand', 'ListObjectsV2Command', 'DeleteObjectsCommand']);
  for (const k of ['BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY']) delete process.env[k];
});

test('system page warns when off-site backups are off', async () => {
  const admin = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@hipcastle.agency', password: 'ChangeMe123!' }) })).json()).token;
  const sys = await (await fetch(`${base}/api/admin/system`, { headers: { authorization: `Bearer ${admin}` } })).json();
  assert.ok(sys.warnings.some((w) => /Off-site backups are off/.test(w.message)));
});

test('price revision updates untouched tiers on existing databases and keeps admin edits', () => {
  const eng = () => db.prepare("SELECT st.price_cents p FROM service_tiers st JOIN services s ON s.id = st.service_id WHERE s.slug = ? AND st.tier = ? AND st.plan = 'core'");
  // Simulate a database from before the revision: old defaults, one admin edit.
  for (const s of catalog) for (const [tier, cents] of Object.entries(PRICE_REVISION.previous[s.slug])) {
    db.prepare("UPDATE service_tiers SET price_cents = ? WHERE plan = 'core' AND tier = ? AND service_id = (SELECT id FROM services WHERE slug = ?)").run(cents, tier, s.slug);
  }
  db.prepare("UPDATE service_tiers SET price_cents = 1111100 WHERE plan = 'core' AND tier = 'growth' AND service_id = (SELECT id FROM services WHERE slug = 'design')").run();
  db.prepare("UPDATE settings SET value = '1' WHERE key = 'catalog_prices_version'").run();
  seed({ demo: false, log: () => {} });
  assert.equal(eng().get('engineering', 'essential').p, 950000);
  assert.equal(eng().get('engineering', 'enterprise').p, 5500000);
  assert.equal(eng().get('design', 'growth').p, 1111100, 'admin-edited price kept');
  assert.equal(JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'catalog_prices_version'").get().value), PRICE_REVISION.version);
});

test('prices sit inside South African market bands', () => {
  const p = Object.fromEntries(catalog.map((s) => [s.slug, s.tiers.map((t) => t.price_cents / 100)]));
  assert.ok(p.engineering[0] >= 5000 && p.engineering[0] <= 16000, 'brochure website R5k–R16k');
  assert.ok(p.engineering[1] >= 13000 && p.engineering[1] <= 60000, 'online store / web app R13k–R60k');
  assert.ok(p.design[0] >= 4500 && p.design[0] <= 22500, 'logo & identity starter');
  assert.ok(p['paid-media'][0] >= 3000 && p['paid-media'][0] <= 7500, 'single-platform ads management R3k–R7.5k');
  assert.ok(p.marketing[0] >= 1000 && p.marketing[0] <= 6500, 'small-business social & local SEO');
  assert.ok(p.marketing[1] >= 5000 && p.marketing[1] <= 25000, 'SEO + content retainer');
  for (const s of catalog) for (const t of s.tiers) assert.ok(t.price_cents >= 300000, `${s.slug} ${t.name} not below R3 000`);
});

// ---------------------------------------------------------------- analytics & attribution
const UA = 'Mozilla/5.0 (Linux; Android 13) Chrome/131 Mobile';
const beacon = (body, headers = {}) => fetch(`${base}/api/t`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, ...headers }, body: JSON.stringify(body) });
const attrHeader = (a) => Buffer.from(JSON.stringify(a)).toString('base64');
const j = (method, path, { token, body, headers } = {}) => fetch(`${base}/api${path}`, {
  method, headers: { 'content-type': 'application/json', 'user-agent': UA, ...(token && { authorization: `Bearer ${token}` }), ...headers }, body: body && JSON.stringify(body),
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

test('classifies traffic sources', async () => {
  const { classify } = await import('../src/analytics.js');
  assert.equal(classify({ referrer: 'https://www.google.co.za/' }), 'google / organic');
  assert.equal(classify({ referrer: 'https://l.facebook.com/l.php?u=x' }), 'facebook / social');
  assert.equal(classify({ referrer: 'https://chatgpt.com/' }), 'chatgpt / ai assistant');
  assert.equal(classify({ utm_source: 'WhatsApp', utm_medium: 'status' }), 'whatsapp / status');
  assert.equal(classify({ referrer: 'https://hipcastle.test/pricing' }, 'hipcastle.test'), 'direct / none');
  assert.equal(classify({}), 'direct / none');
  assert.equal(classify({ referrer: 'https://news24.com/article' }), 'news24.com / referral');
});

test('page-view beacon counts views and daily-unique visitors, and skips bots, opt-outs and staff pages', async () => {
  await beacon({ path: '/', touch: { referrer: 'https://www.google.com/' } });
  await beacon({ path: '/pricing', touch: { referrer: 'https://www.google.com/' } }); // same visitor
  await beacon({ path: '/', touch: {} }, { 'user-agent': 'Googlebot/2.1' });
  await beacon({ path: '/', touch: {} }, { dnt: '1' });
  await beacon({ path: '/admin/growth', touch: {} });
  const row = (kind, key) => db.prepare("SELECT views, visitors FROM analytics_daily WHERE kind = ? AND key = ? AND day = date('now')").get(kind, key);
  assert.deepEqual({ ...row('source', 'google / organic') }, { views: 2, visitors: 1 });
  assert.deepEqual({ ...row('page', '/pricing') }, { views: 1, visitors: 0 });
  assert.equal(row('page', '/admin/growth'), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analytics_visitors').get().n, 1, 'only an anonymous hash is kept');
});

test('first-touch attribution follows a visitor from lead to sign-up to paid order', async () => {
  const touch = attrHeader({ utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'nov-websites', landing: '/services/engineering', first_seen: '2026-11-10' });
  await beacon({ path: '/services/engineering', touch: { utm_source: 'facebook', utm_medium: 'paid' } }, { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1' }); // a different person
  const lead = await j('POST', '/leads', { headers: { 'x-attribution': touch }, body: { name: 'Lerato M', email: 'lerato@example.com', message: 'I need a website for my salon in Soweto.', consent: true, service: 'engineering' } });
  assert.equal(lead.status, 201);
  const l = db.prepare('SELECT source, attribution FROM leads WHERE email = ?').get('lerato@example.com');
  assert.equal(l.source, 'facebook / paid');
  assert.deepEqual(JSON.parse(l.attribution), { source: 'facebook / paid', landing: '/services/engineering', campaign: 'nov-websites', first_seen: '2026-11-10' });
  const reg = await j('POST', '/auth/register', { headers: { 'x-attribution': touch }, body: { name: 'Lerato M', email: 'lerato@example.com', password: 'password123' } });
  const tier = (await j('GET', '/services/engineering')).data.tiers[0];
  const order = await j('POST', '/orders', { token: reg.data.token, body: { tier_id: tier.id, brief: 'A five page website for my salon in Soweto.' } });
  db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE order_id = ?").run(order.data.id);
  assert.equal(JSON.parse(db.prepare('SELECT attribution FROM orders WHERE id = ?').get(order.data.id).attribution).source, 'facebook / paid');
  // Garbage headers are ignored, never fatal.
  assert.equal((await j('POST', '/leads', { headers: { 'x-attribution': '%%%not-base64' }, body: { name: 'Sipho N', email: 'sipho@example.com', message: 'Please call me about SEO.', consent: true } })).status, 201);

  const admin = (await j('POST', '/auth/login', { body: { email: 'admin@hipcastle.agency', password: 'ChangeMe123!' } })).data.token;
  const g = (await j('GET', '/admin/growth?days=30', { token: admin })).data;
  const fb = g.funnel.find((r) => r.source === 'facebook / paid');
  assert.deepEqual({ v: fb.visitors, l: fb.leads, s: fb.signups, o: fb.orders, p: fb.paid }, { v: 1, l: 1, s: 1, o: 1, p: 1 });
  assert.equal(fb.revenue_cents, Math.round(tier.price_cents / 2), 'deposit collected');
  assert.ok(g.totals.visitors >= 2);
  assert.equal(g.by_day.length, 30);
  assert.equal((await j('GET', '/admin/growth', { token: reg.data.token })).status, 403);
});

test('browser crashes are reported and alerted', async () => {
  resetAlerts(); hits = [];
  const r = await j('POST', '/client-error', { body: { message: 'Cannot read properties of undefined', path: '/pricing', stack: 'at Pricing' } });
  assert.equal(r.status, 204);
  await wait(150);
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'client.error' AND message LIKE '%/pricing%'").get());
  assert.equal(hits.length, 1);
});
