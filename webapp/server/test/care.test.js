// Care plans: catalog & pricing sanity, checkout, pipeline, support priority, hours, offers, SEO.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_URL = 'https://hipcastle.test';
delete process.env.ANTHROPIC_API_KEY;
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { runJob } = await import('../src/jobs.js');
const { buildChunks } = await import('../src/kb.js');
const { CARE } = await import('../src/care.js');
const { setChatClient } = await import('../src/chat.js');

let server, base, root, admin, staff, alice, bob;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.token;
const settle = () => new Promise((r) => setTimeout(r, 30));
const emails = (tpl, to) => db.prepare(`SELECT * FROM emails WHERE template = ?${to ? ' AND to_email = ?' : ''}`).all(...(to ? [tpl, to] : [tpl]));
/** Mark an order's invoices paid and activate it, as a gateway notification would. */
const activate = (orderId) => {
  db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE order_id = ?").run(orderId);
  db.prepare("UPDATE orders SET status = 'active' WHERE id = ?").run(orderId);
};

before(async () => {
  seed({ demo: false, log: () => {} });
  setChatClient(null);
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  root = `http://127.0.0.1:${server.address().port}`;
  base = `${root}/api`;
  admin = await login('admin@hipcastle.agency', 'ChangeMe123!');
  const reg = async (name, email) => (await call('POST', '/auth/register', { body: { name, email, password: 'password123' } })).data.token;
  alice = await reg('Alice Client', 'alice@example.com');
  bob = await reg('Bob Other', 'bob@example.com');
  staff = await reg('Sam Staff', 'staff@example.com');
  const sid = db.prepare("SELECT id FROM users WHERE email = 'staff@example.com'").get().id;
  await call('PATCH', `/admin/users/${sid}`, { token: admin, body: { role: 'staff' } });
});
after(() => server.close());

test('every service has three monthly care tiers, priced within SA market bands', async () => {
  const services = (await call('GET', '/services')).data;
  const care = (await call('GET', '/care')).data;
  assert.equal(care.services.length, services.length, 'all services have care plans');
  assert.equal(Object.keys(CARE).length, services.length);
  for (const s of care.services) {
    assert.equal(s.tiers.length, 3, s.slug);
    const [e, g, x] = s.tiers;
    for (const t of s.tiers) {
      assert.equal(t.plan, 'care');
      assert.equal(t.billing, 'monthly');
      assert.ok(t.care_minutes > 0);
      // R350–R9 000 a month: below big-agency retainers, in line with SA maintenance plans.
      assert.ok(t.price_cents >= 35000 && t.price_cents <= 900000, `${s.slug} ${t.name} R${t.price_cents / 100}`);
      // Price per included hour stays within SA agency rates (R500–R1 500/hour), even before
      // counting the hosting, monitoring and backups the plans also include.
      assert.ok(t.price_cents / (t.care_minutes / 60) <= 150000, `${s.slug} ${t.name} effective hourly`);
    }
    assert.ok(e.price_cents < g.price_cents && g.price_cents < x.price_cents, `${s.slug} prices rise by tier`);
    assert.ok(e.care_minutes < g.care_minutes && g.care_minutes < x.care_minutes, `${s.slug} hours rise by tier`);
    assert.deepEqual(s.tiers.map((t) => t.support_priority), ['normal', 'high', 'urgent']);
  }
  const web = care.services.find((s) => s.slug === 'engineering').tiers[0];
  assert.ok(web.price_cents <= 80000, 'entry website care sits in the R300–R800 market band');
  // Core packages are unchanged: still exactly three per service, and care tiers don't leak in.
  for (const s of services) assert.equal((await call('GET', `/services/${s.slug}`)).data.tiers.every((t) => t.plan === 'core'), true);
  assert.equal((await call('GET', '/stats')).data.tiers, services.length * 3);
});

test('service pages and the catalog expose care plans; admins can edit care hours', async () => {
  const svc = (await call('GET', '/services/design')).data;
  assert.equal(svc.tiers.length, 3);
  assert.equal(svc.care.title, 'Brand Care');
  assert.equal(svc.care.tiers.length, 3);
  const t = svc.care.tiers[0];
  const r = await call('PATCH', `/admin/tiers/${t.id}`, { token: admin, body: { price_cents: 49500, care_minutes: 90 } });
  assert.equal(r.status, 200);
  assert.equal(r.data.care_minutes, 90);
  assert.equal(r.data.price_cents, 49500);
  await call('PATCH', `/admin/tiers/${t.id}`, { token: admin, body: { price_cents: t.price_cents, care_minutes: t.care_minutes } });
});

let project, carePlan;
test('a delivered project offers care; the care order looks after it with its own pipeline', async () => {
  const core = (await call('GET', '/services/engineering')).data.tiers.find((t) => t.tier === 'essential');
  project = (await call('POST', '/orders', { token: alice, body: { tier_id: core.id, brief: 'A five page website for my bakery in Durban.' } })).data;
  activate(project.id);
  let d = (await call('GET', `/orders/${project.id}`, { token: alice })).data;
  assert.equal(d.care_offer.title, 'Website & App Care');
  assert.equal(d.support_ends_at, null, 'no end date before delivery');
  db.prepare("UPDATE orders SET delivered_at = datetime('now','-10 days') WHERE id = ?").run(project.id);
  d = (await call('GET', `/orders/${project.id}`, { token: alice })).data;
  assert.match(d.support_ends_at, /^\d{4}-\d{2}-\d{2}/, 'Essential: 14 days after delivery');

  const careTier = (await call('GET', '/services/engineering')).data.care.tiers.find((t) => t.tier === 'growth');
  // Can't attach a care plan to someone else's project, or a core package to a project.
  assert.equal((await call('POST', '/orders', { token: bob, body: { tier_id: careTier.id, brief: 'Please look after this website for me.', covers_order_id: project.id } })).status, 400);
  assert.equal((await call('POST', '/orders', { token: alice, body: { tier_id: core.id, brief: 'Another site please, a big one.', covers_order_id: project.id } })).status, 400);

  const r = await call('POST', '/orders', { token: alice, body: { tier_id: careTier.id, brief: `Please look after ${project.reference} going forward.`, covers_order_id: project.id } });
  assert.equal(r.status, 201);
  carePlan = (await call('GET', `/orders/${r.data.id}`, { token: alice })).data;
  assert.equal(carePlan.plan, 'care');
  assert.equal(carePlan.pipeline_kind, 'retainer');
  assert.equal(carePlan.covers_reference, project.reference);
  assert.equal(carePlan.invoices[0].description, 'Care plan — first month (in advance)');
  assert.equal(carePlan.invoices[0].subtotal_cents, careTier.price_cents, 'first month in advance, not a 50% deposit');
  assert.ok(carePlan.milestones.some((m) => m.key === 'care_handover'));
  assert.ok(carePlan.milestones.some((m) => /Monthly care report \(month 1\)/.test(m.title)));
  assert.ok(carePlan.onboarding.some((q) => q.key === 'care_scope'));
  assert.equal(carePlan.care_usage.included_minutes, 120);
  // The project now shows it is covered instead of offering again.
  d = (await call('GET', `/orders/${project.id}`, { token: alice })).data;
  assert.equal(d.care_offer.existing.id, carePlan.id);
});

test('care clients get their plan’s faster ticket response; staff log time against the allowance', async () => {
  // Pending (unpaid) plan: no boost yet.
  let t = (await call('POST', '/support', { token: alice, body: { subject: 'Change opening hours', category: 'project', priority: 'low', body: 'Please update our hours on the contact page.' } })).data;
  assert.equal(t.priority, 'low');
  assert.equal(t.care_order_id, null);
  activate(carePlan.id);
  t = (await call('POST', '/support', { token: alice, body: { subject: 'Change opening hours', category: 'project', priority: 'low', body: 'Please update our hours on the contact page.' } })).data;
  assert.equal(t.priority, 'high', 'Growth Care → high priority (1 business day)');
  assert.equal(t.care_order_id, carePlan.id);
  assert.ok(t.care_usage && !('entries' in t.care_usage), 'clients see usage but not the internal time log');
  const hours = Math.round((Date.parse(`${t.sla_due_at}Z`) - Date.parse(`${t.created_at}Z`)) / 3.6e6);
  assert.equal(hours, 24);
  // Urgent stays urgent.
  const u = (await call('POST', '/support', { token: alice, body: { subject: 'Site is down now', category: 'technical', priority: 'urgent', body: 'The website shows an error page.' } })).data;
  assert.equal(u.priority, 'urgent');

  assert.equal((await call('POST', `/support/${t.id}/time`, { token: alice, body: { minutes: 30, note: 'nope' } })).status, 403);
  let r = await call('POST', `/support/${t.id}/time`, { token: staff, body: { minutes: 90, note: 'Updated opening hours and footer' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.care_usage.used_minutes, 90);
  await settle();
  assert.equal(emails('care.hours', 'alice@example.com').length, 0, 'no warning while within the allowance');
  r = await call('POST', `/admin/care/${carePlan.id}/time`, { token: staff, body: { minutes: 45, note: 'Plugin updates and backup check' } });
  assert.equal(r.data.used_minutes, 135);
  assert.equal(r.data.over_minutes, 15);
  await call('POST', `/admin/care/${carePlan.id}/time`, { token: staff, body: { minutes: 15, note: 'Extra fix' } });
  await settle();
  assert.equal(emails('care.hours', 'alice@example.com').length, 1, 'client told once when the month’s hours run out');
  assert.equal(emails('care.hours.team').length, 1);
  // Client portal shows the usage; a ticket not covered by care can't take time.
  const d = (await call('GET', `/orders/${carePlan.id}`, { token: alice })).data;
  assert.equal(d.care_usage.used_minutes, 150);
  const bobT = (await call('POST', '/support', { token: bob, body: { subject: 'General question', category: 'other', body: 'Do you also do logo design?' } })).data;
  assert.equal((await call('POST', `/support/${bobT.id}/time`, { token: staff, body: { minutes: 30, note: 'Answered' } })).status, 409);
});

test('a new month resets the allowance and invoices the care plan', async () => {
  db.prepare("UPDATE orders SET next_cycle_at = date('now','-1 day') WHERE id = ?").run(carePlan.id);
  await runJob('retainer-cycles');
  const d = (await call('GET', `/orders/${carePlan.id}`, { token: alice })).data;
  assert.equal(d.current_cycle, 2);
  assert.equal(d.care_usage.used_minutes, 0);
  assert.ok(d.invoices.some((i) => i.description === 'Month 2 care plan'));
  assert.ok(d.milestones.some((m) => /\(month 2\)/.test(m.title)));
});

test('completing a project by hand starts its free-support window', async () => {
  const core = (await call('GET', '/services/testing')).data.tiers[0];
  const o = (await call('POST', '/orders', { token: bob, body: { tier_id: core.id, brief: 'Test my online shop checkout please.' } })).data;
  activate(o.id);
  await call('PATCH', `/orders/${o.id}`, { token: staff, body: { status: 'completed' } });
  const d = (await call('GET', `/orders/${o.id}`, { token: bob })).data;
  assert.ok(d.delivered_at);
  assert.match(d.support_ends_at, /^\d{4}-/);
  assert.equal(d.care_offer.title, 'Quality Care');
});

test('care offers go out 7 days before free support ends, once per project', async () => {
  const design = (await call('GET', '/services/design')).data.tiers.find((t) => t.tier === 'essential');
  const o = (await call('POST', '/orders', { token: bob, body: { tier_id: design.id, brief: 'A logo and brand kit for my salon.' } })).data;
  activate(o.id);
  db.prepare("UPDATE orders SET delivered_at = datetime('now','-1 days') WHERE id = ?").run(o.id); // ends in 13 days: too early
  await runJob('care-offers');
  assert.equal(emails('care.offer', 'bob@example.com').length, 0);
  db.prepare("UPDATE orders SET delivered_at = datetime('now','-9 days') WHERE id = ?").run(o.id); // ends in 5 days
  await runJob('care-offers');
  await runJob('care-offers');
  await settle();
  assert.equal(emails('care.offer', 'bob@example.com').length, 1);
  assert.equal(emails('care.offer', 'alice@example.com').length, 0, 'clients who already have care are not offered again');
  const board = (await call('GET', '/admin/care', { token: admin })).data;
  assert.equal(board.active, 1);
  assert.ok(board.mrr_cents > 0);
  assert.ok(board.ending.some((e) => e.reference === o.reference && e.offered));
  const ov = (await call('GET', '/admin/overview', { token: admin })).data;
  assert.equal(ov.care_active, 1);
  assert.equal((await call('GET', '/admin/care', { token: alice })).status, 403);
});

test('assistant, help centre and search engines know the care plans', async () => {
  const chunks = buildChunks();
  const text = chunks.map((c) => c.body).join('\n');
  for (const slug of Object.keys(CARE)) assert.ok(chunks.some((c) => c.id === `care-${slug}`), slug);
  assert.match(text, /R 595 per month/);
  assert.match(text, /R 650 per hour/);
  const res = await fetch(`${base}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Who maintains and hosts my website after launch?' }) });
  assert.match(await res.text(), /care plan/i);
  const sitemap = await fetch(`${root}/sitemap.xml`).then((r) => r.text());
  assert.match(sitemap, /\/care</);
  const llms = await fetch(`${root}/llms-full.txt`).then((r) => r.text());
  assert.match(llms, /Website & App Care/);
  const { resolvePage } = await import('../src/seo.js');
  const page = resolvePage('/care');
  assert.match(page.title, /Maintenance/);
  assert.ok(page.schema.some((s) => s['@type'] === 'Service' && s.offers?.length === 3));
  for (const tpl of ['care.offer', 'care.hours', 'care.hours.team']) {
    const r = await fetch(`${base}/admin/email-templates/${tpl}/preview`, { headers: { authorization: `Bearer ${admin}` } });
    assert.equal(r.status, 200, tpl);
  }
});
