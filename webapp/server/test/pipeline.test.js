import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_URL = 'https://hipcastle.test';
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { watchPipelines, runRetainerCycles } = await import('../src/pipeline.js');

let server, base;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data.token;
const emails = (template) => db.prepare('SELECT * FROM emails WHERE template = ? ORDER BY id').all(template);
const settle = () => new Promise((r) => setTimeout(r, 30));

let admin, client, other;
before(async () => {
  seed({ demo: true, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = await login('admin@hipcastle.agency', 'ChangeMe123!');
  client = (await call('POST', '/auth/register', { body: { name: 'Naledi Khumalo', email: 'naledi@example.com', password: 'password123', company: 'Khumalo Foods' } })).data.token;
  other = (await call('POST', '/auth/register', { body: { name: 'Other Person', email: 'other@example.com', password: 'password123' } })).data.token;
});
after(() => server.close());

const tierOf = async (slug, tier) => (await call('GET', `/services/${slug}`)).data.tiers.find((t) => t.tier === tier);
const payFirstInvoice = async (orderId, token) => {
  const o = (await call('GET', `/orders/${orderId}`, { token })).data;
  const inv = o.invoices.find((i) => i.status === 'unpaid');
  const co = (await call('POST', '/payments/checkout', { token, body: { invoice_id: inv.id, gateway: 'simulated' } })).data;
  return call('POST', `/payments/simulated/${co.reference}`, { token, body: { outcome: 'complete' } });
};

test('service pages publish the delivery journey for every tier', async () => {
  const s = (await call('GET', '/services/engineering')).data;
  assert.equal(s.journey.length, 3);
  const [e, g, x] = s.journey;
  assert.equal(e.kind, 'project');
  assert.equal(x.kind, 'retainer');
  assert.ok(e.launch_days >= 14 && e.launch_days <= 20, `essential launches near its 14 published days (${e.launch_days})`);
  assert.ok(g.stages.some((st) => st.stage === 'review'));
  assert.equal(e.revisions, 2);
  assert.equal(x.revisions, null);
  assert.ok(e.stages[0].steps.some((st) => st.client), 'onboarding includes a client task');
});

test('project pipeline: onboarding → approvals with revision limits → launch → balance invoice → feedback', async () => {
  const tier = await tierOf('design', 'essential');
  const order = (await call('POST', '/orders', { token: client, body: { tier_id: tier.id, brief: 'New brand identity for our catering business.' } })).data;
  let d = (await call('GET', `/orders/${order.id}`, { token: client })).data;

  // Pipeline created from the Design playbook, with real specialist owners
  assert.equal(d.pipeline_kind, 'project');
  assert.equal(d.pipeline.stage, 'awaiting_deposit');
  assert.equal(d.revisions_allowed, 2);
  assert.ok(d.milestones.some((m) => m.agent_slug === 'design-brand-guardian' && m.agent_name));
  assert.ok(d.milestones.every((m) => m.due_date));
  assert.ok(d.onboarding.some((i) => i.key === 'des_personality' && i.required));
  assert.ok(d.onboarding.some((i) => i.kind === 'meeting'));

  // Deposit → active + onboarding email
  await payFirstInvoice(order.id, client);
  await settle();
  d = (await call('GET', `/orders/${order.id}`, { token: client })).data;
  assert.equal(d.status, 'active');
  assert.equal(d.pipeline.stage, 'onboarding');
  assert.equal(emails('onboarding.start').at(-1).to_email, 'naledi@example.com');

  // Partial onboarding does not complete; required answers do
  let ob = await call('POST', `/orders/${order.id}/onboarding`, { token: client, body: { responses: [{ key: 'business', response: 'Catering for corporate events in Pretoria.' }] } });
  assert.equal(ob.data.onboarding_complete, false);
  const required = d.onboarding.filter((i) => i.required).map((i) => ({ key: i.key, response: i.field_type === 'select' ? i.options[0] : `Answer for ${i.key}` }));
  ob = await call('POST', `/orders/${order.id}/onboarding`, { token: client, body: { responses: required } });
  assert.equal(ob.data.onboarding_complete, true);
  assert.equal(ob.data.milestones.find((m) => m.key === 'intake').status, 'done');
  assert.ok(emails('onboarding.complete').length >= 1);

  // Clients cannot run staff actions
  const kickoff = ob.data.milestones.find((m) => m.key === 'kickoff');
  assert.equal((await call('POST', `/orders/${order.id}/milestones/${kickoff.id}/complete`, { token: client })).status, 403);
  d = (await call('POST', `/orders/${order.id}/milestones/${kickoff.id}/complete`, { token: admin })).data;
  assert.ok(d.order.kickoff_at, 'kick-off recorded and timeline re-baselined');

  // Approval-gated deliverable: submit → changes → resubmit → changes → limit reached
  const concepts = d.milestones.find((m) => m.key === 'concepts');
  assert.equal(concepts.requires_approval, 1);
  const submit = () => call('POST', `/orders/${order.id}/milestones/${concepts.id}/submit`, { token: admin, body: { url: 'https://example.com/concepts.pdf', note: 'Three directions.' } });
  d = (await submit()).data;
  assert.equal(d.milestones.find((m) => m.id === concepts.id).status, 'awaiting_client');
  assert.equal(d.order.status, 'in_review');
  await settle();
  assert.match(emails('deliverable.ready').at(-1).subject, /Design concepts/);
  assert.equal((await call('POST', `/orders/${order.id}/milestones/${concepts.id}/approve`, { token: other })).status, 404, 'other clients cannot see it');
  const changes = () => call('POST', `/orders/${order.id}/milestones/${concepts.id}/changes`, { token: client, body: { feedback: 'Please try warmer colours and a bolder font.' } });
  assert.equal((await changes()).status, 200);
  await submit();
  assert.equal((await changes()).status, 200);
  await submit();
  const limited = await changes();
  assert.equal(limited.status, 409);
  assert.equal(limited.data.code, 'revision_limit');
  d = (await call('POST', `/orders/${order.id}/milestones/${concepts.id}/approve`, { token: client })).data;
  const done = d.milestones.find((m) => m.id === concepts.id);
  assert.equal(done.status, 'done');
  assert.equal(done.revisions_used, 2);
  assert.ok(emails('deliverable.response').length >= 3);

  // Complete everything else; launch issues the 50% balance; completion asks for feedback
  for (const m of d.milestones.filter((x) => x.status !== 'done')) {
    if (m.requires_approval) {
      await call('POST', `/orders/${order.id}/milestones/${m.id}/submit`, { token: admin, body: {} });
      await call('POST', `/orders/${order.id}/milestones/${m.id}/approve`, { token: client });
    } else {
      await call('POST', `/orders/${order.id}/milestones/${m.id}/complete`, { token: admin });
    }
  }
  d = (await call('GET', `/orders/${order.id}`, { token: client })).data;
  assert.equal(d.status, 'completed');
  assert.equal(d.progress, 100);
  const balance = d.invoices.find((i) => i.description === 'Balance on delivery (50%)');
  assert.ok(balance, 'balance invoice issued at launch');
  assert.equal(balance.subtotal_cents, tier.price_cents / 2);
  assert.equal(d.invoices.filter((i) => i.description?.startsWith('Balance')).length, 1, 'balance issued once');
  await settle();
  assert.ok(emails('feedback.request').some((e) => e.to_email === 'naledi@example.com'));
  const fb = await call('POST', `/orders/${order.id}/feedback`, { token: client, body: { score: 10, comment: 'Fantastic!' } });
  assert.equal(fb.data.order.nps_score, 10);
  assert.ok(emails('feedback.received').length >= 1);
});

test('retainer pipeline: setup + monthly cycles with invoices', async () => {
  const tier = await tierOf('marketing', 'growth');
  const order = (await call('POST', '/orders', { token: client, body: { tier_id: tier.id, brief: 'Grow our Instagram and local SEO in Gauteng.' } })).data;
  await call('POST', `/orders/${order.id}/agreement/sign`, { token: client, body: { full_name: 'Demo Client', accept: true } });
  await payFirstInvoice(order.id, client);
  let d = (await call('GET', `/orders/${order.id}`, { token: client })).data;
  assert.equal(d.pipeline_kind, 'retainer');
  assert.equal(d.current_cycle, 1);
  assert.ok(d.milestones.some((m) => m.stage === 'cycle' && m.cycle === 1 && /month 1/.test(m.title)));
  assert.ok(d.milestones.some((m) => m.agent_slug === 'marketing-ai-citation-strategist'), 'growth tier includes AI-search work');

  const next = await call('POST', `/orders/${order.id}/next-cycle`, { token: admin });
  assert.equal(next.status, 200);
  assert.equal(next.data.order.current_cycle, 2);
  assert.ok(next.data.milestones.some((m) => m.cycle === 2));
  d = (await call('GET', `/orders/${order.id}`, { token: client })).data;
  assert.ok(d.invoices.some((i) => i.description === 'Month 2 retainer' && i.subtotal_cents === tier.price_cents));
  await settle();
  assert.ok(emails('retainer.cycle').length >= 1);

  // Scheduled job starts months that are due
  db.prepare("UPDATE orders SET next_cycle_at = date('now','-1 day') WHERE id = ?").run(order.id);
  assert.match(runRetainerCycles(), /1 retainer/);
  assert.equal(db.prepare('SELECT current_cycle FROM orders WHERE id = ?').get(order.id).current_cycle, 3);
});

test('pipeline watch flags overdue work, nudges clients and emails a digest', async () => {
  const demo = db.prepare("SELECT id FROM orders WHERE reference = 'HC-DEMO01'").get();
  db.prepare("UPDATE milestones SET due_date = date('now','-5 days') WHERE order_id = ? AND key = 'architecture'").run(demo.id);
  db.prepare("UPDATE milestones SET submitted_at = datetime('now','-4 days') WHERE order_id = ? AND status = 'awaiting_client'").run(demo.id);
  const summary = watchPipelines();
  assert.match(summary, /newly overdue/);
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'pipeline.overdue'").get());
  await settle();
  assert.ok(emails('pipeline.digest').length === 1);
  assert.ok(emails('approval.reminder').length >= 1);
  watchPipelines();
  assert.equal(emails('pipeline.digest').length, 1, 'digest at most once a day');

  const board = (await call('GET', '/admin/pipeline', { token: admin })).data;
  const card = board.cards.find((c) => c.reference === 'HC-DEMO01');
  assert.equal(card.health, 'off_track');
  assert.ok(card.next.title);
  assert.ok(board.workload.length > 0);
  assert.equal(board.nps, 100);
  assert.equal((await call('GET', '/admin/pipeline', { token: client })).status, 403);
});

test('playbooks reference view covers every service and tier', async () => {
  const pbs = (await call('GET', '/admin/playbooks', { token: admin })).data;
  assert.equal(pbs.length, 14);
  for (const s of pbs) {
    assert.equal(s.tiers.length, 3);
    for (const t of s.tiers) {
      assert.ok(t.milestones.length >= 6, `${s.slug}/${t.tier} has a full pipeline`);
      assert.ok(t.milestones.filter((m) => m.agent).every((m) => m.agent.name && m.agent.name !== m.agent.slug), `${s.slug}/${t.tier} owners resolve to agents`);
      assert.ok(t.intake.length >= 5);
    }
  }
});
