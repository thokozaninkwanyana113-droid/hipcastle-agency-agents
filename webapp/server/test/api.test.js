import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';

let server, base;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};

before(async () => {
  seed({ demo: true, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

test('every service has exactly three tiers', async () => {
  const { data } = await call('GET', '/services?include=tiers');
  assert.equal(data.length, 14);
  for (const s of data) {
    assert.deepEqual(s.tiers.map((t) => t.tier), ['essential', 'growth', 'enterprise']);
    assert.ok(s.tiers[0].price_cents < s.tiers[1].price_cents);
    assert.ok(Array.isArray(s.tiers[0].features));
  }
});

test('service detail includes agents imported from the repo', async () => {
  const { status, data } = await call('GET', '/services/engineering');
  assert.equal(status, 200);
  assert.ok(data.agents.length >= 20);
  const strategy = await call('GET', '/services/strategy');
  assert.ok(strategy.data.agents.some((a) => a.slug === 'agents-orchestrator'));
  assert.equal((await call('GET', '/services/nope')).status, 404);
});

test('agent profile returns markdown body', async () => {
  const { data } = await call('GET', '/agents/engineering-frontend-developer');
  assert.match(data.profile, /Frontend Developer/);
  assert.equal(data.source_path, undefined);
});

test('lead capture validates input', async () => {
  assert.equal((await call('POST', '/leads', { body: { name: 'x' } })).status, 400);
  const ok = await call('POST', '/leads', { body: { name: 'Jane Doe', email: 'jane@x.io', service: 'design', message: 'We need a brand refresh.' } });
  assert.equal(ok.status, 201);
});

test('client journey: register → order → pay → message; isolation; staff ops', async () => {
  const reg = await call('POST', '/auth/register', { body: { name: 'Sam Client', email: 'sam@x.io', password: 'password123' } });
  assert.equal(reg.status, 201);
  const token = reg.data.token;
  assert.equal((await call('POST', '/auth/register', { body: { name: 'Sam', email: 'SAM@x.io', password: 'password123' } })).status, 409);

  const svc = (await call('GET', '/services/design')).data;
  const growth = svc.tiers.find((t) => t.tier === 'growth');
  const order = await call('POST', '/orders', { token, body: { tier_id: growth.id, brief: 'Full rebrand for our logistics company.' } });
  assert.equal(order.status, 201);
  assert.equal(order.data.status, 'pending');

  const detail = (await call('GET', `/orders/${order.data.id}`, { token })).data;
  assert.equal(detail.milestones.length, 5);
  assert.equal(detail.invoices[0].amount_cents, growth.price_cents / 2);

  const pay = await call('POST', `/orders/${order.data.id}/invoices/${detail.invoices[0].id}/pay`, { token });
  assert.equal(pay.status, 200);
  assert.equal((await call('GET', `/orders/${order.data.id}`, { token })).data.status, 'active');

  assert.equal((await call('POST', `/orders/${order.data.id}/messages`, { token, body: { body: 'Hello team' } })).status, 201);

  // Another client cannot see it
  const demo = (await call('POST', '/auth/login', { body: { email: 'client@example.com', password: 'Client123!' } })).data.token;
  assert.equal((await call('GET', `/orders/${order.data.id}`, { token: demo })).status, 404);
  assert.equal((await call('GET', '/admin/overview', { token: demo })).status, 403);
  assert.equal((await call('PATCH', `/orders/${order.data.id}`, { token, body: { status: 'completed' } })).status, 403);

  // Admin manages it
  const admin = (await call('POST', '/auth/login', { body: { email: 'admin@hipcastle.agency', password: 'ChangeMe123!' } })).data.token;
  const ms = detail.milestones[0];
  const tick = await call('PATCH', `/orders/${order.data.id}/milestones/${ms.id}`, { token: admin, body: { is_done: true } });
  assert.equal(tick.data.progress, 20);
  const upd = await call('PATCH', `/orders/${order.data.id}`, { token: admin, body: { status: 'completed' } });
  assert.equal(upd.data.progress, 100);
  const ov = (await call('GET', '/admin/overview', { token: admin })).data;
  assert.ok(ov.revenue_paid_cents >= growth.price_cents / 2);
  assert.equal((await call('GET', '/admin/leads', { token: admin })).data.length, 1);
});

test('auth rejects bad credentials and missing tokens', async () => {
  assert.equal((await call('POST', '/auth/login', { body: { email: 'admin@hipcastle.agency', password: 'wrong' } })).status, 401);
  assert.equal((await call('GET', '/orders')).status, 401);
  assert.equal((await call('GET', '/orders', { token: 'garbage' })).status, 401);
});
