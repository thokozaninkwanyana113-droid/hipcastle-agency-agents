// Week-1 services: automatic monthly payments, accounting, booking, agreements, credential guard.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.SITE_URL = 'https://hipcastle.test';
process.env.PAYFAST_VALIDATE_REMOTE = 'false';
process.env.PAYFAST_CHECK_IP = 'false';
process.env.PAYFAST_MERCHANT_ID = '10000100';
process.env.PAYFAST_MERCHANT_KEY = '46f0cd694581a';
process.env.PAYFAST_PASSPHRASE = 'test passphrase';
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const payfast = await import('../src/payments/payfast.js');

let server, base, admin, alice, bob;
const call = async (method, path, { token, body, form, headers } = {}) => {
  const res = await fetch(base + path, {
    method, redirect: 'manual',
    headers: { ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }), ...headers },
    body: form ?? (body && JSON.stringify(body)),
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
};
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.token;
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
/** A correctly signed PayFast ITN body. */
function itnBody(fields) {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${payfast.phpUrlencode(String(v))}`).join('&');
  const sig = createHash('md5').update(`${pairs}&passphrase=${payfast.phpUrlencode('test passphrase')}`).digest('hex');
  return `${pairs}&signature=${sig}`;
}

before(async () => {
  seed({ demo: false, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = await login('admin@hipcastle.agency', 'ChangeMe123!');
  const reg = async (name, email) => (await call('POST', '/auth/register', { body: { name, email, password: 'password123' } })).data.token;
  alice = await reg('Alice Client', 'alice@example.com');
  bob = await reg('Bob Other', 'bob@example.com');
});
after(() => server.close());

const newOrder = async (token, slug, tier, plan = 'tiers') => {
  const svc = (await call('GET', `/services/${slug}`)).data;
  const t = (plan === 'care' ? svc.care.tiers : svc.tiers).find((x) => x.tier === tier);
  const o = (await call('POST', '/orders', { token, body: { tier_id: t.id, brief: 'Monthly work for my business in Durban.', accept_terms: true } })).data;
  await call('POST', `/orders/${o.id}/agreement/sign`, { token, body: { full_name: 'Test Client', accept: true } });
  return { order: o, detail: (await call('GET', `/orders/${o.id}`, { token })).data, tier: t };
};

// ---------------------------------------------------------------- 1. automatic monthly payments
test('PayFast subscription checkout: only for monthly engagements, signed with recurring fields', async () => {
  const once = await newOrder(alice, 'design', 'essential');
  assert.equal((await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: once.detail.invoices[0].id, gateway: 'payfast', autopay: true } })).status, 400);
  const monthly = await newOrder(alice, 'marketing', 'essential');
  const inv = monthly.detail.invoices[0];
  assert.equal((await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: inv.id, gateway: 'ozow', autopay: true } })).status, 400);
  const r = await call('POST', '/payments/checkout', { token: alice, body: { invoice_id: inv.id, gateway: 'payfast', autopay: true } });
  assert.equal(r.status, 201);
  const f = r.data.form.fields;
  assert.equal(f.subscription_type, 1);
  assert.equal(f.frequency, 3);
  assert.equal(f.cycles, 0);
  assert.equal(f.recurring_amount, (inv.amount_cents / 100).toFixed(2));
  assert.equal(f.billing_date, new Date().toISOString().slice(0, 10));
  const { signature, ...rest } = f;
  assert.equal(signature, payfast.checkoutSignature(rest, 'test passphrase'), 'subscription fields are part of the signature');
  // Subscription fields come after the transaction fields in the signed string.
  const order = Object.keys(f);
  assert.ok(order.indexOf('subscription_type') > order.indexOf('custom_str1'));
});

test('first payment switches autopay on; monthly charges settle invoices automatically', async () => {
  const { order, detail } = await newOrder(bob, 'marketing', 'growth');
  const inv = detail.invoices[0];
  const start = (await call('POST', '/payments/checkout', { token: bob, body: { invoice_id: inv.id, gateway: 'payfast', autopay: true } })).data;
  const amount = (inv.amount_cents / 100).toFixed(2);
  const token = 'dc0521d3-55fe-269b-fa00-b647310d760f';
  const first = { m_payment_id: start.reference, pf_payment_id: '1089250', payment_status: 'COMPLETE', item_name: 'x', amount_gross: amount, amount_fee: '-10.00', amount_net: amount, merchant_id: '10000100', token, billing_date: new Date().toISOString().slice(0, 10) };
  await call('POST', '/payments/payfast/notify', { form: itnBody(first) });
  await settle();
  let o = (await call('GET', `/orders/${order.id}`, { token: bob })).data;
  assert.equal(o.status, 'active');
  assert.equal(o.autopay_status, 'active');
  assert.equal(o.autopay_amount_cents, inv.amount_cents);
  assert.equal(o.payfast_token, undefined, 'token never sent to the browser');
  assert.equal(o.invoices[0].status, 'paid');

  // Month 2 arrives before our cycle job ran: the cycle starts and its invoice is settled.
  db.prepare("UPDATE orders SET next_cycle_at = date('now', '+2 days') WHERE id = ?").run(order.id);
  const month2 = { ...first, pf_payment_id: '1089999' };
  await call('POST', '/payments/payfast/notify', { form: itnBody(month2) });
  await settle();
  o = (await call('GET', `/orders/${order.id}`, { token: bob })).data;
  assert.equal(o.current_cycle, 2);
  assert.equal(o.invoices.length, 2);
  assert.ok(o.invoices.every((i) => i.status === 'paid'));
  const rec = db.prepare("SELECT * FROM payments WHERE gateway_txn_id = '1089999'").get();
  assert.equal(rec.is_recurring, 1);
  assert.equal(rec.status, 'complete');

  // The same notification again is ignored (no double payment).
  await call('POST', '/payments/payfast/notify', { form: itnBody(month2) });
  await settle();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM payments WHERE gateway_txn_id = '1089999'").get().n, 1);

  // A charge with nothing due is flagged for the team rather than silently kept.
  await call('POST', '/payments/payfast/notify', { form: itnBody({ ...first, pf_payment_id: '1090001' }) });
  await settle();
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'autopay.unallocated' AND ref = ?").get(order.reference));

  // A failed monthly charge is recorded against the open invoice and the client is told.
  db.prepare("UPDATE orders SET next_cycle_at = date('now', '-1 day') WHERE id = ?").run(order.id);
  const { runRetainerCycles } = await import('../src/pipeline.js');
  runRetainerCycles();
  await call('POST', '/payments/payfast/notify', { form: itnBody({ ...first, pf_payment_id: '1090002', payment_status: 'FAILED' }) });
  await settle();
  assert.equal(db.prepare("SELECT status FROM payments WHERE gateway_txn_id = '1090002'").get().status, 'failed');
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'autopay.failed'").get());

  // Forged notification for the token is rejected.
  await call('POST', '/payments/payfast/notify', { form: `${new URLSearchParams({ ...first, pf_payment_id: '666' })}&signature=bad` });
  await settle();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM payments WHERE gateway_txn_id = '666'").get().n, 0);
  globalThis.__autopayOrder = order;
});

test('cancelling autopay calls the PayFast API with a signed request; ending the engagement cancels it too', async () => {
  const order = globalThis.__autopayOrder;
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.payfast.co.za')) { seen.push({ url: String(url), opts }); return new Response(JSON.stringify({ code: 200, status: 'success', data: { response: true } }), { status: 200 }); }
    return realFetch(url, opts);
  };
  try {
    assert.equal((await call('POST', `/orders/${order.id}/autopay/cancel`, { token: alice })).status, 404, 'other clients cannot');
    const r = await call('POST', `/orders/${order.id}/autopay/cancel`, { token: bob });
    assert.equal(r.status, 200);
    assert.equal(r.data.autopay_status, 'cancelled');
    assert.equal(seen.length, 1);
    assert.match(seen[0].url, /\/subscriptions\/dc0521d3-55fe-269b-fa00-b647310d760f\/cancel\?testing=true$/);
    assert.equal(seen[0].opts.method, 'PUT');
    const h = seen[0].opts.headers;
    assert.equal(h['merchant-id'], '10000100');
    assert.equal(h.version, 'v1');
    assert.match(h.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+02:00$/);
    assert.equal(h.signature, payfast.apiSignature({ 'merchant-id': h['merchant-id'], version: h.version, timestamp: h.timestamp }, 'test passphrase'));
    // PayFast refusing leaves autopay active (nobody is told it's off when it isn't).
    db.prepare("UPDATE orders SET autopay_status = 'active' WHERE id = ?").run(order.id);
    globalThis.fetch = async (url, opts) => (String(url).startsWith('https://api.payfast.co.za') ? new Response('{"message":"nope"}', { status: 400 }) : realFetch(url, opts));
    assert.equal((await call('POST', `/orders/${order.id}/autopay/cancel`, { token: bob })).status, 502);
    assert.equal(db.prepare('SELECT autopay_status s FROM orders WHERE id = ?').get(order.id).s, 'active');
    globalThis.fetch = async (url, opts) => (String(url).startsWith('https://api.payfast.co.za') ? new Response('{}', { status: 200 }) : realFetch(url, opts));
    await call('PATCH', `/orders/${order.id}`, { token: admin, body: { status: 'cancelled' } });
    await settle(100);
    assert.equal(db.prepare('SELECT autopay_status s FROM orders WHERE id = ?').get(order.id).s, 'cancelled');
  } finally { globalThis.fetch = realFetch; }
});

// ---------------------------------------------------------------- 2. accounting
test('tax invoice document has the SARS-required details when VAT registered', async () => {
  await call('PUT', '/admin/settings', { token: admin, body: { vat_registered: true, vat_no: '4123456789', company_reg_no: '2026/123456/07', street_address: '1 Main Rd' } });
  await call('PATCH', '/auth/me', { token: alice, body: { company: 'Alice Bakes (Pty) Ltd', billing_address: '5 Long St, Durban, 4001', vat_number: '4987654321' } });
  assert.equal((await call('PATCH', '/auth/me', { token: alice, body: { vat_number: '12345' } })).status, 400, 'SA VAT numbers are validated');
  const { order, detail } = await newOrder(alice, 'design', 'essential');
  const inv = detail.invoices[0];
  const doc = (await call('GET', `/orders/${order.id}/invoices/${inv.id}`, { token: alice })).data;
  assert.equal(doc.title, 'Tax Invoice');
  assert.equal(doc.supplier.vat_no, '4123456789');
  assert.match(doc.supplier.address, /1 Main Rd/);
  assert.equal(doc.recipient.name, 'Alice Bakes (Pty) Ltd');
  assert.equal(doc.recipient.vat_no, '4987654321');
  assert.equal(doc.vat_rate, 15);
  assert.equal(inv.vat_cents, Math.round(inv.subtotal_cents * 0.15));
  assert.equal((await call('GET', `/orders/${order.id}/invoices/${inv.id}`, { token: bob })).status, 404);
  const sys = (await call('GET', '/admin/system', { token: admin })).data;
  assert.ok(!sys.warnings.some((w) => /no VAT number/.test(w.message)));
});

test('accountant exports: Xero import template and Sage/general CSV', async () => {
  const xero = await fetch(`${base}/admin/integrations/export/xero?from=2000-01-01&to=2999-12-31`, { headers: { authorization: `Bearer ${admin}` } });
  assert.equal(xero.status, 200);
  const x = await xero.text();
  assert.match(x.split('\r\n')[0], /\*ContactName,EmailAddress,\*InvoiceNumber/);
  assert.match(x, /Alice Bakes \(Pty\) Ltd,alice@example.com,INV-/);
  assert.match(x, /,200,OUTPUT,ZAR/);
  const sage = await (await fetch(`${base}/admin/integrations/export/sage`, { headers: { authorization: `Bearer ${admin}` } })).text();
  assert.match(sage.split('\r\n')[0], /Document Date,Document Number,Customer Name/);
  assert.match(sage, /4987654321/);
  assert.equal((await fetch(`${base}/admin/integrations/export/xero`, { headers: { authorization: `Bearer ${alice}` } })).status, 403);
});

test('Xero: OAuth connect stores tokens encrypted; sync pushes contacts, invoices, payments and voids once', async () => {
  process.env.XERO_CLIENT_ID = 'cid'; process.env.XERO_CLIENT_SECRET = 'secret';
  const realFetch = globalThis.fetch;
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!/xero\.com/.test(u)) return realFetch(url, opts);
    calls.push({ u, method: opts.method || 'GET', body: opts.body ? (typeof opts.body === 'string' ? opts.body : String(opts.body)) : '' });
    const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
    if (u.endsWith('/connect/token')) return ok({ access_token: `at-${++n}`, refresh_token: 'rt', expires_in: 1800 });
    if (u.endsWith('/connections')) return ok([{ tenantId: 'tenant-1', tenantName: 'Hipcastle Agency (Pty) Ltd', tenantType: 'ORGANISATION' }]);
    if (u.endsWith('/Contacts')) return ok({ Contacts: [{ ContactID: `c-${n++}` }] });
    if (u.endsWith('/Invoices') && opts.method === 'PUT') { const b = JSON.parse(opts.body).Invoices[0]; const sub = b.LineItems[0].UnitAmount; return ok({ Invoices: [{ InvoiceID: `x-${b.InvoiceNumber}`, Total: b.LineItems[0].TaxType === 'NONE' ? sub : Math.round(sub * 115) / 100 }] }); }
    if (u.endsWith('/Payments')) return ok({ Payments: [{ PaymentID: `p-${n++}` }] });
    if (/\/Invoices\/x-/.test(u)) return ok({ Invoices: [{}] });
    return new Response('{}', { status: 404 });
  };
  try {
    const st = (await call('GET', '/admin/integrations', { token: admin })).data;
    assert.equal(st.xero.configured, true);
    assert.equal(st.xero.redirect_uri, 'https://hipcastle.test/api/integrations/xero/callback');
    const { url } = (await call('POST', '/admin/integrations/xero/connect', { token: admin })).data;
    const auth = new URL(url);
    assert.equal(auth.host, 'login.xero.com');
    assert.match(auth.searchParams.get('scope'), /accounting\.invoices/);
    // Forged / missing state is refused.
    assert.match((await call('GET', '/integrations/xero/callback?code=abc&state=nope')).headers.get('location'), /xero=error/);
    const cb = await call('GET', `/integrations/xero/callback?code=abc&state=${auth.searchParams.get('state')}`);
    assert.match(cb.headers.get('location'), /xero=connected/);
    const stored = db.prepare("SELECT data, label FROM integrations WHERE provider = 'xero'").get();
    assert.equal(stored.label, 'Hipcastle Agency (Pty) Ltd');
    assert.match(stored.data, /^v1\./);
    assert.doesNotMatch(stored.data, /access_token|refresh_token|tenant/, 'tokens are encrypted at rest');

    // Pay one invoice (manually, as EFT) and void another, then sync.
    const { detail: d1 } = await newOrder(alice, 'academic', 'essential');
    await call('PATCH', `/admin/invoices/${d1.invoices[0].id}`, { token: admin, body: { status: 'paid', reason: 'EFT ref ALICE-1' } });
    const { detail: d2 } = await newOrder(bob, 'testing', 'essential');
    const r1 = (await call('POST', '/admin/integrations/xero/sync', { token: admin, body: {} })).data;
    assert.match(r1.result, /invoice\(s\)/);
    const invPuts = calls.filter((c) => c.u.endsWith('/Invoices') && c.method === 'PUT').map((c) => JSON.parse(c.body).Invoices[0]);
    const i1 = invPuts.find((i) => i.InvoiceNumber === d1.invoices[0].number);
    assert.equal(i1.Type, 'ACCREC');
    assert.equal(i1.Status, 'AUTHORISED');
    assert.equal(i1.LineAmountTypes, 'Exclusive');
    assert.equal(i1.LineItems[0].TaxType, 'OUTPUT');
    assert.equal(i1.CurrencyCode, 'ZAR');
    const pay = calls.find((c) => c.u.endsWith('/Payments'));
    assert.equal(JSON.parse(pay.body).Payments[0].Account.Code, '090');
    // Contacts created once per client, with the client's VAT number.
    const contacts = calls.filter((c) => c.u.endsWith('/Contacts')).map((c) => JSON.parse(c.body).Contacts[0]);
    assert.ok(contacts.some((c) => c.TaxNumber === '4987654321'));
    // Idempotent: a second sync pushes nothing new.
    const before = calls.length;
    await call('POST', '/admin/integrations/xero/sync', { token: admin, body: {} });
    assert.equal(calls.filter((c, i) => i >= before && c.method === 'PUT').length, 0);
    // Voiding a synced invoice voids it in Xero.
    await call('PATCH', `/admin/invoices/${d2.invoices[0].id}`, { token: admin, body: { status: 'void', reason: 'Client cancelled order' } });
    await call('POST', '/admin/integrations/xero/sync', { token: admin, body: {} });
    assert.ok(calls.some((c) => c.u.endsWith(`/Invoices/x-${d2.invoices[0].number}`)));
    // Failures are recorded and visible.
    globalThis.fetch = async (url, opts) => (/xero\.com\/api\.xro/.test(String(url)) ? new Response(JSON.stringify({ Elements: [{ ValidationErrors: [{ Message: 'Account code 200 is not a valid code' }] }] }), { status: 400 }) : (/connect\/token/.test(String(url)) ? new Response(JSON.stringify({ access_token: 'z', refresh_token: 'rt', expires_in: 1800 })) : realFetch(url, opts)));
    await newOrder(alice, 'strategy', 'essential');
    await call('POST', '/admin/integrations/xero/sync', { token: admin, body: {} });
    const st2 = (await call('GET', '/admin/integrations', { token: admin })).data;
    assert.ok(st2.xero.failures.some((f) => /not a valid code/.test(f.error)));
  } finally { globalThis.fetch = realFetch; }
});

// ---------------------------------------------------------------- 3. booking
test('booking link: only real booking providers, shown publicly and in the auto-reply', async () => {
  assert.equal((await call('PUT', '/admin/settings', { token: admin, body: { booking_url: 'https://evil.example.com/book' } })).status, 400);
  assert.equal((await call('PUT', '/admin/settings', { token: admin, body: { booking_url: 'https://cal.com/hipcastle/strategy' } })).status, 200);
  assert.equal((await call('GET', '/site')).data.booking_url, 'https://cal.com/hipcastle/strategy');
  await call('POST', '/leads', { body: { name: 'Nomsa D', email: 'nomsa@example.com', message: 'I need a new website for my clinic.', consent: true } });
  const e = db.prepare("SELECT html FROM emails WHERE template = 'lead.autoreply' AND to_email = 'nomsa@example.com'").get();
  assert.match(e.html, /cal\.com\/hipcastle\/strategy/);
  const csp = (await fetch(`${base}/health`)).headers.get('content-security-policy');
  assert.match(csp, /frame-src[^;]*cal\.com/);
});

// ---------------------------------------------------------------- 4. agreements
test('service agreement: required above the threshold, signed with an audit trail, then payment allowed', async () => {
  const small = await newOrder(bob, 'sales', 'essential'); // R7 500 once-off: checkout acceptance is enough
  assert.equal(small.detail.agreement.requires_signature, false);
  const svc = (await call('GET', '/services/engineering')).data;
  const t = svc.tiers.find((x) => x.tier === 'growth');
  const o = (await call('POST', '/orders', { token: bob, body: { tier_id: t.id, brief: 'An online store for my clothing brand.', accept_terms: true } })).data;
  let d = (await call('GET', `/orders/${o.id}`, { token: bob })).data;
  assert.equal(d.agreement.requires_signature, true);
  assert.equal(d.agreement.status, 'pending');
  const block = await call('POST', '/payments/checkout', { token: bob, body: { invoice_id: d.invoices[0].id, gateway: 'payfast' } });
  assert.equal(block.data.code, 'agreement_required');
  const doc = (await call('GET', `/orders/${o.id}/agreement`, { token: bob })).data;
  assert.match(doc.document, /SERVICE AGREEMENT/);
  assert.match(doc.document, /Protection of Personal Information Act/);
  assert.match(doc.document, /Electronic Communications and Transactions Act/);
  assert.match(doc.document, /R\s?35\s000/);
  assert.match(doc.document, /An online store for my clothing brand/);
  assert.equal((await call('POST', `/orders/${o.id}/agreement/sign`, { token: bob, body: { full_name: 'Bob Other', accept: false } })).status, 400);
  assert.equal((await call('POST', `/orders/${o.id}/agreement/sign`, { token: admin, body: { full_name: 'Admin', accept: true } })).status, 403, 'staff cannot sign for the client');
  const signed = await call('POST', `/orders/${o.id}/agreement/sign`, { token: bob, body: { full_name: 'Bob Other', title: 'Owner', accept: true } });
  assert.equal(signed.data.status, 'signed');
  const row = db.prepare('SELECT * FROM agreements WHERE order_id = ?').get(o.id);
  assert.equal(row.signer_email, 'bob@example.com');
  assert.ok(row.signer_ip && row.signed_at && /^[0-9a-f]{64}$/.test(row.doc_hash));
  assert.equal(createHash('sha256').update(row.document).digest('hex'), row.doc_hash);
  await settle();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'agreement.signed' AND ref = ?").get(o.reference).n, 2, 'client copy + team');
  d = (await call('GET', `/orders/${o.id}`, { token: bob })).data;
  assert.equal(d.agreement.signer_ip, undefined, 'clients don’t see audit metadata');
  assert.ok((await call('GET', `/orders/${o.id}`, { token: admin })).data.agreement.signer_ip, 'staff do');
  assert.equal((await call('POST', '/payments/checkout', { token: bob, body: { invoice_id: d.invoices[0].id, gateway: 'payfast' } })).status, 201);
});

// ---------------------------------------------------------------- 5. credential guard
test('credential guard removes passwords, card and ID numbers before anything is stored', async () => {
  const { order } = await newOrder(alice, 'academic', 'essential');
  const m = await call('POST', `/orders/${order.id}/messages`, { token: alice, body: { body: 'Our WordPress login is admin, password: Sunshine2026! and card 4111 1111 1111 1111' } });
  assert.equal(m.status, 201);
  assert.match(m.headers.get('x-content-redacted'), /password/);
  assert.doesNotMatch(m.data.body, /Sunshine2026|4111/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM messages WHERE body LIKE '%Sunshine2026%'").get().n, 0);
  const t = await call('POST', '/support', { token: alice, body: { subject: 'Login trouble', category: 'account', body: 'My ID is 8001015009087 and pwd = hunter2hunter' } });
  assert.doesNotMatch(JSON.stringify(t.data.messages), /8001015009087|hunter2hunter/);
  const ob = (await call('GET', `/orders/${order.id}`, { token: alice })).data.onboarding.find((i) => i.kind === 'question');
  await call('POST', `/orders/${order.id}/onboarding`, { token: alice, body: { responses: [{ key: ob.key, response: 'Hosting password: Xy7!secret' }] } });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM onboarding_items WHERE response LIKE ?').get('%Xy7!secret%').n, 0);
  const res = await fetch(`${base}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'my card is 4111111111111111, can I pay?' }) });
  assert.match(res.headers.get('x-content-redacted') || '', /card/);
  await res.text();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE content LIKE '%4111111111111111%'").get().n, 0);
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'security.redacted'").get());
  // Normal content is untouched.
  const ok = await call('POST', `/orders/${order.id}/messages`, { token: alice, body: { body: 'Call me on 082 123 4567 about invoice INV-1234 for R 9 500.' } });
  assert.equal(ok.headers.get('x-content-redacted'), null);
  assert.equal(ok.data.body, 'Call me on 082 123 4567 about invoice INV-1234 for R 9 500.');
});
