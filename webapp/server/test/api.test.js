import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Gateway config for tests (set before modules load)
process.env.PAYFAST_VALIDATE_REMOTE = 'false';
process.env.PAYFAST_CHECK_IP = 'false';
process.env.OZOW_SITE_CODE = 'TST-TST-001';
process.env.OZOW_PRIVATE_KEY = 'test-private-key';
process.env.SITE_URL = 'https://hipcastle.test';
process.env.PAYFAST_MERCHANT_ID = '10000100';
process.env.PAYFAST_MERCHANT_KEY = '46f0cd694581a';
process.env.PAYFAST_PASSPHRASE = 'test passphrase';

const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const payfast = await import('../src/payments/payfast.js');
const ozow = await import('../src/payments/ozow.js');
const { updateSettings } = await import('../src/settings.js');

let server, base, root;
const call = async (method, path, { token, body, form } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: form ?? (body && JSON.stringify(body)),
    redirect: 'manual',
  });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: ct.includes('json') ? await res.json() : await res.text() };
};
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data.token;
const md5 = (s) => createHash('md5').update(s).digest('hex');

before(async () => {
  seed({ demo: true, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  root = `http://127.0.0.1:${server.address().port}`;
  base = `${root}/api`;
});
after(() => server.close());

test('every service has exactly three rand-priced tiers', async () => {
  const { data } = await call('GET', '/services?include=tiers');
  assert.equal(data.length, 14);
  for (const s of data) {
    assert.deepEqual(s.tiers.map((t) => t.tier), ['essential', 'growth', 'enterprise']);
    assert.ok(s.tiers[0].price_cents < s.tiers[1].price_cents);
    assert.ok(s.tiers[0].price_cents >= 350000, `${s.slug} essential should be priced in rand`);
  }
});

test('service detail includes agents, FAQs and reviews', async () => {
  const { status, data } = await call('GET', '/services/engineering');
  assert.equal(status, 200);
  assert.ok(data.agents.length >= 20);
  assert.match(data.faqs[0].q, /cost in South Africa/);
  assert.match(data.faqs[0].a, /R\s?12 500/);
  assert.ok(data.testimonials.length >= 1);
  assert.equal((await call('GET', '/services/nope')).status, 404);
});

test('site settings, FAQs and blog are public', async () => {
  const site = (await call('GET', '/site')).data;
  assert.ok(site.social.linkedin);
  assert.ok(site.payment_methods.some((m) => m.id === 'payfast'));
  assert.ok(site.payment_methods.some((m) => m.id === 'ozow'));
  assert.ok((await call('GET', '/faqs')).data.length >= 5);
  const posts = (await call('GET', '/posts')).data;
  assert.ok(posts.length >= 6);
  const post = (await call('GET', `/posts/${posts[0].slug}`)).data;
  assert.ok(post.body.length > 200 && post.related.length === 3);
});

test('lead capture validates input and requires consent', async () => {
  assert.equal((await call('POST', '/leads', { body: { name: 'x' } })).status, 400);
  const noConsent = await call('POST', '/leads', { body: { name: 'Jane Doe', email: 'jane@x.co.za', message: 'We need a brand refresh.' } });
  assert.equal(noConsent.status, 400);
  const ok = await call('POST', '/leads', { body: { name: 'Jane Doe', email: 'jane@x.co.za', service: 'design', province: 'Gauteng', preferred_contact: 'whatsapp', message: 'We need a brand refresh.', consent: true } });
  assert.equal(ok.status, 201);
});

test('testimonials are moderated before publishing', async () => {
  const before = (await call('GET', '/testimonials')).data.length;
  const sub = await call('POST', '/testimonials', { body: { author: 'Zanele D.', email: 'z@x.co.za', role: 'Owner', rating: 5, quote: 'Fantastic team, our new store converts brilliantly.', consent: true } });
  assert.equal(sub.status, 201);
  assert.equal((await call('GET', '/testimonials')).data.length, before);
  const admin = await login('admin@hipcastle.co.za', 'ChangeMe123!');
  const pending = (await call('GET', '/admin/testimonials?status=pending', { token: admin })).data;
  assert.equal(pending.length, 1);
  await call('PATCH', `/admin/testimonials/${pending[0].id}`, { token: admin, body: { status: 'approved' } });
  assert.equal((await call('GET', '/testimonials')).data.length, before + 1);
});

test('PayFast signature matches PHP urlencode rules', () => {
  assert.equal(payfast.phpUrlencode("a b!'()*~"), 'a+b%21%27%28%29%2A%7E');
  const fields = { merchant_id: '10000100', merchant_key: '46f0cd694581a', amount: '100.00', item_name: 'Test Item' };
  const expected = md5('merchant_id=10000100&merchant_key=46f0cd694581a&amount=100.00&item_name=Test+Item&passphrase=secret+pass');
  assert.equal(payfast.checkoutSignature(fields, 'secret pass'), expected);
});

test('client journey with VAT, PayFast ITN and Ozow notification', async () => {
  updateSettings({ vat_registered: true, vat_rate: 15 });
  const reg = await call('POST', '/auth/register', { body: { name: 'Sam Client', email: 'sam@x.co.za', password: 'password123' } });
  assert.equal(reg.status, 201);
  const token = reg.data.token;

  const design = (await call('GET', '/services/design')).data;
  const growth = design.tiers.find((t) => t.tier === 'growth');
  const order = (await call('POST', '/orders', { token, body: { tier_id: growth.id, brief: 'Full rebrand for our logistics company.' } })).data;
  const detail = (await call('GET', `/orders/${order.id}`, { token })).data;
  const inv = detail.invoices[0];
  assert.equal(inv.subtotal_cents, growth.price_cents / 2);
  assert.equal(inv.vat_cents, Math.round(growth.price_cents / 2 * 0.15));
  assert.equal(inv.amount_cents, inv.subtotal_cents + inv.vat_cents);

  // --- PayFast checkout + ITN
  const co = await call('POST', '/payments/checkout', { token, body: { invoice_id: inv.id, gateway: 'payfast' } });
  assert.equal(co.status, 201);
  const f = co.data.form.fields;
  assert.equal(co.data.form.action, 'https://sandbox.payfast.co.za/eng/process');
  assert.equal(f.amount, (inv.amount_cents / 100).toFixed(2));
  assert.match(f.notify_url, /^https:\/\/hipcastle\.test\/api\/payments\/payfast\/notify$/);
  const { signature, ...unsigned } = f;
  assert.equal(payfast.checkoutSignature(unsigned, 'test passphrase'), signature);

  const itnFields = [['m_payment_id', f.m_payment_id], ['pf_payment_id', '1089250'], ['payment_status', 'COMPLETE'], ['item_name', f.item_name],
    ['item_description', ''], ['amount_gross', f.amount], ['amount_fee', '-2.30'], ['amount_net', '97.70'], ['custom_str1', f.custom_str1],
    ['name_first', 'Sam'], ['email_address', 'sam@x.co.za'], ['merchant_id', '10000100']];
  const paramString = itnFields.map(([k, v]) => `${k}=${payfast.phpUrlencode(v)}`).join('&');

  // Tampered signature is rejected and leaves the invoice unpaid
  await call('POST', '/payments/payfast/notify', { form: `${paramString}&signature=deadbeef` });
  assert.equal((await call('GET', `/payments/status/${f.m_payment_id}`, { token })).data.status, 'initiated');

  const sig = md5(`${paramString}&passphrase=test+passphrase`);
  const itn = await call('POST', '/payments/payfast/notify', { form: `${paramString}&signature=${sig}` });
  assert.equal(itn.status, 200);
  await new Promise((r) => setTimeout(r, 50));
  const st = (await call('GET', `/payments/status/${f.m_payment_id}`, { token })).data;
  assert.equal(st.status, 'complete');
  assert.equal(st.invoice.status, 'paid');
  assert.equal((await call('GET', `/orders/${order.id}`, { token })).data.status, 'active');
  // Paying a paid invoice again is refused
  assert.equal((await call('POST', '/payments/checkout', { token, body: { invoice_id: inv.id, gateway: 'payfast' } })).status, 409);

  // --- Ozow on a second invoice issued by staff
  const admin = await login('admin@hipcastle.co.za', 'ChangeMe123!');
  const inv2 = (await call('POST', `/orders/${order.id}/invoices`, { token: admin, body: { amount_cents: 100000, description: 'Extra screens' } })).data;
  assert.equal(inv2.amount_cents, 115000);
  const oz = (await call('POST', '/payments/checkout', { token, body: { invoice_id: inv2.id, gateway: 'ozow' } })).data;
  assert.equal(oz.form.fields.Amount, '1150.00');
  assert.equal(oz.form.fields.HashCheck, ozow.requestHash(oz.form.fields, 'test-private-key'));
  const note = { SiteCode: 'TST-TST-001', TransactionId: 'abc-123', TransactionReference: oz.reference, Amount: '1150.00', Status: 'Complete',
    CurrencyCode: 'ZAR', IsTest: 'true', StatusMessage: 'Test transaction completed' };
  const bad = await call('POST', '/payments/ozow/notify', { form: new URLSearchParams({ ...note, Hash: 'nope' }).toString() });
  assert.equal(bad.status, 400);
  const good = await call('POST', '/payments/ozow/notify', { form: new URLSearchParams({ ...note, Hash: ozow.responseHash(note, 'test-private-key') }).toString() });
  assert.equal(good.status, 200);
  assert.equal((await call('GET', `/payments/status/${oz.reference}`, { token })).data.status, 'complete');

  // Return URL redirects to the SPA without changing a completed payment
  const ret = await call('GET', `/payments/return?ref=${oz.reference}`);
  assert.equal(ret.status, 303);
  assert.match(ret.headers.get('location'), /\/payment\/return\?ref=/);

  // Isolation: another client cannot see or pay it
  const demo = await login('client@example.com', 'Client123!');
  assert.equal((await call('GET', `/orders/${order.id}`, { token: demo })).status, 404);
  assert.equal((await call('GET', `/payments/status/${oz.reference}`, { token: demo })).status, 404);
  assert.equal((await call('GET', '/admin/overview', { token: demo })).status, 403);
  updateSettings({ vat_registered: false });
});

test('simulated gateway works for development', async () => {
  const token = await login('client@example.com', 'Client123!');
  const orders = (await call('GET', '/orders', { token })).data;
  const detail = (await call('GET', `/orders/${orders[0].id}`, { token })).data;
  const unpaid = detail.invoices.find((i) => i.status === 'unpaid');
  const co = (await call('POST', '/payments/checkout', { token, body: { invoice_id: unpaid.id, gateway: 'simulated' } })).data;
  assert.match(co.redirect, /\/payment\/simulate\?ref=/);
  assert.equal((await call('POST', `/payments/simulated/${co.reference}`, { token, body: { outcome: 'complete' } })).data.status, 'complete');
});

test('command centre: system, events, payments, settings, jobs, exports, SEO', async () => {
  const admin = await login('admin@hipcastle.co.za', 'ChangeMe123!');
  const sys = (await call('GET', '/admin/system', { token: admin })).data;
  assert.equal(sys.status, 'operational');
  assert.ok(sys.db.tables.agents >= 160);
  assert.ok(sys.jobs.length >= 4);
  assert.ok(sys.warnings.some((w) => /default password/.test(w.message)));
  const events = (await call('GET', '/admin/events?limit=100', { token: admin })).data;
  assert.ok(events.some((e) => e.type === 'payment.complete'));
  assert.ok(events.some((e) => e.type === 'payment.itn_rejected'));
  assert.ok((await call('GET', '/admin/payments', { token: admin })).data.length >= 3);
  const saved = await call('PUT', '/admin/settings', { token: admin, body: { whatsapp: '27821234567', orders_enabled: false } });
  assert.equal(saved.data.whatsapp, '27821234567');
  const blocked = await call('POST', '/orders', { token: admin, body: { tier_id: 1, brief: 'This should be blocked while paused.' } });
  assert.equal(blocked.status, 503);
  await call('PUT', '/admin/settings', { token: admin, body: { orders_enabled: true } });
  const job = await call('POST', '/admin/jobs/overdue-invoices/run', { token: admin });
  assert.match(job.data.last_result, /overdue/);
  const csv = await call('GET', '/admin/export/leads', { token: admin });
  assert.match(csv.data, /Jane Doe/);
  const post = await call('POST', '/admin/posts', { token: admin, body: { title: 'Load-shedding proof your website', slug: 'load-shedding-website',
    excerpt: 'Keep selling online when the lights go out in South Africa.', body: '## Quick answer\n\nUse cloud hosting with redundancy. '.repeat(3),
    category: 'Web Development', status: 'published' } });
  assert.equal(post.status, 201);
  const seoReport = (await call('GET', '/admin/seo', { token: admin })).data;
  assert.ok(seoReport.pages.length > 20);
});

test('SEO, AEO & GEO files are served', async () => {
  const sm = await fetch(`${root}/sitemap.xml`).then((r) => r.text());
  assert.match(sm, /https:\/\/hipcastle\.test\/services\/engineering/);
  assert.match(sm, /\/blog\/load-shedding-website/);
  const robots = await fetch(`${root}/robots.txt`).then((r) => r.text());
  assert.match(robots, /User-agent: GPTBot/);
  assert.match(robots, /Disallow: \/admin/);
  const llms = await fetch(`${root}/llms.txt`).then((r) => r.text());
  assert.match(llms, /^# Hipcastle Agency/);
  assert.match(llms, /R\s?12 500/);
  const rss = await fetch(`${root}/blog/rss.xml`).then((r) => r.text());
  assert.match(rss, /<rss version="2.0"/);
  const { resolvePage } = await import('../src/seo.js');
  const pg = resolvePage('/services/marketing');
  assert.ok(pg.schema.some((s) => s['@type'] === 'Service'));
  assert.ok(pg.schema.some((s) => s['@type'] === 'FAQPage'));
  assert.equal(resolvePage('/services/does-not-exist').status, 404);
  assert.match(resolvePage('/admin').robots, /noindex/);
});

test('auth rejects bad credentials and missing tokens', async () => {
  assert.equal((await call('POST', '/auth/login', { body: { email: 'admin@hipcastle.co.za', password: 'wrong' } })).status, 401);
  assert.equal((await call('GET', '/orders')).status, 401);
  assert.equal((await call('GET', '/orders', { token: 'garbage' })).status, 401);
});
