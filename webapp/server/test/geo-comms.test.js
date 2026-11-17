// AEO/GEO for service pages, and the communications plan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_URL = 'https://hipcastle.test';
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { resolvePage, renderHead } = await import('../src/seo.js');
const comms = await import('../src/communications.js');
const { runFollowUps } = await import('../src/comms-jobs.js');

let server, base, root, admin, alice;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
before(async () => {
  seed({ demo: false, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  root = `http://127.0.0.1:${server.address().port}`;
  base = `${root}/api`;
  admin = (await call('POST', '/auth/login', { body: { email: 'admin@hipcastle.agency', password: 'ChangeMe123!' } })).data.token;
  alice = (await call('POST', '/auth/register', { body: { name: 'Alice Client', email: 'alice@example.com', password: 'password123' } })).data.token;
});
after(() => server.close());

// ---------------------------------------------------------------- AEO / GEO
test('every service page has an answer box, facts and 10 question-led FAQs', async () => {
  const services = (await call('GET', '/services')).data;
  for (const s of services) {
    const d = (await call('GET', `/services/${s.slug}`)).data;
    assert.match(d.answer, new RegExp(`^${d.name.replace(/[&]/g, '\\$&')} from Hipcastle Agency costs R`), s.slug);
    const words = d.answer.split(/\s+/).length;
    assert.ok(words >= 30 && words <= 90, `${s.slug} answer is snippet-sized (${words} words)`);
    assert.ok(d.facts.some((f) => f.label === 'Price range'));
    assert.equal(d.faqs.length, 10);
    assert.ok(d.faqs.every((f) => f.q.endsWith('?') && f.a.length > 40));
    assert.match(d.updated_at, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('service structured data: WebPage, Service (offers incl. care, provinces), HowTo and FAQPage', async () => {
  const d = (await call('GET', '/services/engineering')).data;
  const types = d.schema.map((x) => x['@type']);
  assert.deepEqual(types, ['WebPage', 'Service', 'HowTo', 'FAQPage']);
  const [page, svc, howto, faq] = d.schema;
  assert.equal(page.dateModified, d.updated_at);
  assert.deepEqual(page.speakable.cssSelector, ['.answer-box__text']);
  assert.equal(svc.areaServed.length, 10, 'South Africa + 9 provinces');
  assert.equal(svc.audience['@type'], 'BusinessAudience');
  assert.equal(svc.hasOfferCatalog.itemListElement.length, 6, '3 packages + 3 care plans');
  assert.equal(svc.offers['@type'], 'AggregateOffer');
  assert.equal(svc.offers.lowPrice, '9500.00');
  assert.ok(howto.step.length >= 4);
  assert.match(howto.totalTime, /^P\d+D$/);
  assert.equal(faq.mainEntity.length, 10);
});

test('crawler-rendered service page carries the answer, comparison table, process, care and markdown link', async () => {
  const p = resolvePage('/services/design');
  assert.match(p.body, /class="answer-box"/);
  assert.match(p.body, /class="answer-box__text"/);
  assert.match(p.body, /<table><caption>Design &amp; Brand packages compared/);
  assert.match(p.body, /How design &amp; brand works/);
  assert.match(p.body, /Aftercare: Brand Care/);
  assert.match(p.body, /<time datetime="\d{4}-\d{2}-\d{2}">/);
  const head = renderHead(p);
  assert.match(head, /<link rel="alternate" type="text\/markdown" href="https:\/\/hipcastle\.test\/services\/design\.md"/);
  assert.match(head, /article:modified_time/);
});

test('Markdown versions for AI assistants, listed in llms.txt', async () => {
  const r = await fetch(`${root}/services/engineering.md`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/markdown/);
  const md = await r.text();
  assert.match(md, /^# Software Engineering in South Africa — Hipcastle Agency/);
  assert.match(md, /^> Software Engineering from Hipcastle Agency costs R/m);
  assert.match(md, /## Packages/);
  assert.match(md, /### Essential — R\s?9\s500 once-off/);
  assert.match(md, /## How it works/);
  assert.match(md, /## Aftercare: Website & App Care/);
  assert.match(md, /## Frequently asked questions/);
  assert.equal((await fetch(`${root}/services/nope.md`)).status, 404);
  const llms = await fetch(`${root}/llms.txt`).then((x) => x.text());
  assert.match(llms, /\(https:\/\/hipcastle\.test\/services\/engineering\.md\)/);
});

// ---------------------------------------------------------------- communications plan
test('SA business hours: weekdays 08:00–17:00 SAST, skipping weekends and public holidays', () => {
  const h = comms.saHolidays(2027);
  assert.ok(h.has('2027-03-26') && h.has('2027-03-29'), 'Good Friday and Family Day 2027');
  assert.ok(h.has('2027-03-22'), 'Human Rights Day (Sunday 21 March) moves to Monday');
  assert.equal(comms.isBusinessHours(new Date('2026-11-17T07:00:00Z')), true);   // Tue 09:00 SAST
  assert.equal(comms.isBusinessHours(new Date('2026-11-17T15:30:00Z')), false);  // 17:30 SAST
  assert.equal(comms.nextBusinessSlot(new Date('2026-11-20T16:00:00Z')), '2026-11-23 06:00:00'); // Fri evening → Mon 08:00 SAST
  assert.equal(comms.nextBusinessSlot(new Date('2026-12-24T16:00:00Z')), '2026-12-28 06:00:00'); // over Christmas & Day of Goodwill
});

test('every email template is in the plan; essential ones cannot be switched off', async () => {
  const { TEMPLATES } = await import('../src/email/templates.js');
  for (const t of Object.keys(TEMPLATES)) assert.ok(comms.TOUCHPOINTS[t], `${t} is in the communications plan`);
  const plan = (await call('GET', '/admin/communications', { token: admin })).data;
  assert.equal(plan.stages[0].stage, 'Enquiry');
  assert.equal((await call('PATCH', '/admin/communications/payment.receipt', { token: admin, body: { enabled: false } })).status, 400);
  assert.equal((await call('PATCH', '/admin/communications/project.weekly', { token: alice, body: { enabled: false } })).status, 403);
  const off = await call('PATCH', '/admin/communications/lead.followup', { token: admin, body: { enabled: false } });
  assert.equal(off.status, 200);
  assert.equal(off.data.stages[0].touchpoints.find((t) => t.id === 'lead.followup').enabled, false);
  const { sendEmail } = await import('../src/email/mailer.js');
  assert.equal(sendEmail('lead.followup', 'x@example.com', { lead: { name: 'X' }, packages: [] }), null, 'switched-off messages are not queued');
  await call('PATCH', '/admin/communications/lead.followup', { token: admin, body: { enabled: true } });
});

test('nudges are held for business hours; transactional messages are not', async () => {
  const { sendEmail } = await import('../src/email/mailer.js');
  const nudge = sendEmail('lead.followup', 'held@example.com', { lead: { name: 'Held' }, packages: [] }, { ref: 'held-test' });
  const receipt = sendEmail('system.test', 'held@example.com', {});
  const n = db.prepare('SELECT next_attempt_at FROM emails WHERE id = ?').get(nudge).next_attempt_at;
  assert.equal(n, comms.nextBusinessSlot());
  assert.equal(db.prepare('SELECT next_attempt_at FROM emails WHERE id = ?').get(receipt).next_attempt_at, null);
});

test('follow-ups: one enquiry follow-up, at most two payment nudges, Monday project updates', async () => {
  await call('POST', '/leads', { body: { name: 'Zanele K', email: 'zanele@example.com', message: 'I need a website for my salon in Soweto.', consent: true, service: 'engineering' } });
  db.prepare("UPDATE leads SET created_at = datetime('now','-4 days') WHERE email = 'zanele@example.com'").run();
  runFollowUps(); runFollowUps();
  const fu = db.prepare("SELECT * FROM emails WHERE template = 'lead.followup' AND to_email = 'zanele@example.com'").all();
  assert.equal(fu.length, 1, 'only one follow-up per enquiry');
  assert.match(fu[0].html, /R\s?9\s500/, 'includes the packages for the service they asked about');

  const t = (await call('GET', '/services/design')).data.tiers[0];
  const o = (await call('POST', '/orders', { token: alice, body: { tier_id: t.id, brief: 'A logo for my new bakery in Durban.', accept_terms: true } })).data;
  db.prepare("UPDATE orders SET created_at = datetime('now','-2 days') WHERE id = ?").run(o.id);
  runFollowUps(); runFollowUps();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'order.unpaid' AND ref = ?").get(o.reference).n, 1, 'first nudge at 24h');
  db.prepare("UPDATE orders SET created_at = datetime('now','-4 days') WHERE id = ?").run(o.id);
  runFollowUps(); runFollowUps();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'order.unpaid' AND ref = ?").get(o.reference).n, 2, 'second at 3 days, then no more');
  // The client who ordered no longer gets enquiry follow-ups.
  db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE order_id = ?").run(o.id);
  db.prepare("UPDATE orders SET status = 'active' WHERE id = ?").run(o.id);
  runFollowUps({ forceMonday: true }); runFollowUps({ forceMonday: true });
  const weekly = db.prepare("SELECT * FROM emails WHERE template = 'project.weekly' AND to_email = 'alice@example.com'").all();
  assert.equal(weekly.length, 1, 'one update per project per week');
  assert.match(weekly[0].html, /finish the onboarding form/, 'tells the client what is waiting on them');
});
