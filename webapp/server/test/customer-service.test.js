// Customer service: knowledge base, website assistant (FAQ + mocked Claude), handoff, support desk.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_URL = 'https://hipcastle.test';
delete process.env.ANTHROPIC_API_KEY;
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { buildChunks, knowledgeText, knowledgeVersion, search } = await import('../src/kb.js');
const { setChatClient, MODEL } = await import('../src/chat.js');
const { runJob } = await import('../src/jobs.js');

let server, base, root, admin, staff, alice, bob, staffId;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
/** POST /chat and parse the SSE stream into [{event, data}]. */
const chat = async (message, session_id = '') => {
  const res = await fetch(`${base}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, session_id }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const text = await res.text();
  const events = text.split('\n\n').filter(Boolean).map((f) => ({ event: f.match(/^event: (.+)$/m)[1], data: JSON.parse(f.match(/^data: (.+)$/m)[1]) }));
  const meta = events.find((e) => e.event === 'meta').data;
  const done = events.find((e) => e.event === 'done')?.data;
  return { events, session_id: meta.session_id, mode: meta.mode, text: events.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''), done };
};
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data?.token;

before(async () => {
  seed({ demo: false, log: () => {} });
  setChatClient(null); // FAQ mode unless a test injects a fake model
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  root = `http://127.0.0.1:${server.address().port}`;
  base = `${root}/api`;
  admin = await login('admin@hipcastle.agency', 'ChangeMe123!');
  const reg = async (name, email) => (await call('POST', '/auth/register', { body: { name, email, password: 'password123' } })).data.token;
  alice = await reg('Alice Client', 'alice@example.com');
  bob = await reg('Bob Other', 'bob@example.com');
  staff = await reg('Sam Staff', 'staff@example.com');
  staffId = db.prepare("SELECT id FROM users WHERE email = 'staff@example.com'").get().id;
  await call('PATCH', `/admin/users/${staffId}`, { token: admin, body: { role: 'staff' } });
});
after(() => server.close());

// ------------------------------------------------------------ knowledge base
test('knowledge base covers every service and every tier price, deterministically', async () => {
  const text = knowledgeText();
  const services = (await call('GET', '/services')).data;
  assert.ok(services.length >= 14);
  for (const s of services) {
    const detail = (await call('GET', `/services/${s.slug}`)).data;
    assert.ok(text.includes(detail.name), `missing ${detail.name}`);
    for (const t of detail.tiers) {
      const rands = `R ${(t.price_cents / 100).toLocaleString('en-ZA').replace(/\s/g, ' ')}`;
      const digits = String(t.price_cents / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '');
      assert.ok(text.includes(rands) || text.replace(/[\s ]/g, '').includes(`R${digits}`) || text.replace(/[\s , ]/g, '').includes(`R${digits}`), `missing price for ${detail.name} ${t.name}`);
    }
  }
  assert.equal(knowledgeVersion(knowledgeText()), knowledgeVersion(text), 'prompt must be byte-stable for caching');
  for (const topic of ['PayFast', 'Ozow', 'POPIA', 'deposit', 'revision', 'support ticket', 'VAT']) assert.match(text, new RegExp(topic, 'i'), topic);
});

test('search finds the right article for common questions', () => {
  const chunks = buildChunks();
  const top = (q) => search(q, chunks, 1)[0]?.id;
  assert.match(top('how much does seo cost'), /seo|marketing/);
  assert.match(top('can I pay with instant EFT'), /pay/);
  assert.equal(search('zzqx flibbertigibbet', chunks).length, 0);
});

test('help centre API lists categories and searches', async () => {
  const help = (await call('GET', '/help')).data;
  assert.ok(help.categories.length >= 5);
  assert.ok(help.categories.every((c) => c.items.length && c.label));
  const hits = (await call('GET', '/help/search?q=refund')).data;
  assert.ok(hits.length > 0);
  const page = await fetch(`${root}/sitemap.xml`).then((r) => r.text());
  assert.match(page, /\/help</);
});

// ------------------------------------------------------------ FAQ mode
test('FAQ mode answers from the knowledge base and logs the conversation', async () => {
  assert.equal((await call('GET', '/chat/status')).data.mode, 'faq');
  const a = await chat('How do I pay? Do you take instant EFT?');
  assert.equal(a.mode, 'faq');
  assert.match(a.text, /PayFast|Ozow|EFT/);
  assert.equal(a.done.source, 'faq');
  assert.ok(a.done.links.length > 0);
  const b = await chat('zzqx flibbertigibbet', a.session_id);
  assert.equal(b.session_id, a.session_id, 'session continues');
  assert.match(b.text, /not sure/i);
  const msgs = db.prepare('SELECT role, answered FROM chat_messages WHERE session_id = ? ORDER BY id').all(a.session_id);
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(msgs[3].answered, 0, 'unanswered questions are flagged for the team');
});

test('chat validates input', async () => {
  const r = await fetch(`${base}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(801) }) });
  assert.equal(r.status, 400);
});

test('feedback is recorded only for assistant messages in that session', async () => {
  const a = await chat('What is the difference between the tiers?');
  assert.equal((await call('POST', `/chat/${a.session_id}/feedback`, { body: { message_id: a.done.message_id, helpful: true } })).status, 200);
  assert.equal(db.prepare('SELECT helpful FROM chat_messages WHERE id = ?').get(a.done.message_id).helpful, 1);
  const other = await chat('Hello');
  assert.equal((await call('POST', `/chat/${other.session_id}/feedback`, { body: { message_id: a.done.message_id, helpful: false } })).status, 404);
});

test('handoff to a person creates a chatbot lead with the transcript and emails the team', async () => {
  const a = await chat('Can you build a booking system for my salon?');
  const bad = await call('POST', `/chat/${a.session_id}/handoff`, { body: { name: 'Sipho', email: 'sipho@example.com', consent: false } });
  assert.equal(bad.status, 400);
  const r = await call('POST', `/chat/${a.session_id}/handoff`, { body: { name: 'Sipho Ndlovu', email: 'Sipho@Example.com', preferred_contact: 'whatsapp', phone: '0821234567', consent: true, website: '' } });
  assert.equal(r.status, 201);
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(r.data.lead_id);
  assert.equal(lead.source, 'chatbot');
  assert.equal(lead.email, 'sipho@example.com');
  assert.match(lead.message, /booking system/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'chat.handoff'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'lead.autoreply' AND to_email = 'sipho@example.com'").get().n, 1);
  const again = await call('POST', `/chat/${a.session_id}/handoff`, { body: { name: 'Sipho Ndlovu', email: 'sipho@example.com', consent: true } });
  assert.equal(again.data.lead_id, r.data.lead_id, 'idempotent');
  const b2 = await chat('Hi');
  const bot = await call('POST', `/chat/${b2.session_id}/handoff`, { body: { name: 'Bot', email: 'b@example.com', consent: true, website: 'http://spam' } });
  assert.equal(bot.data.lead_id, undefined, 'honeypot: bots are told “thanks” but nothing is stored');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM leads WHERE email = 'b@example.com'").get().n, 0);
});

// ------------------------------------------------------------ AI mode (mocked Claude)
function fakeClient({ chunks = ['Our ', 'Growth package ', 'suits you.'], stop_reason = 'end_turn', fail = null } = {}) {
  const calls = [];
  return {
    calls,
    beta: { messages: { stream(params) {
      calls.push(params);
      if (fail) throw fail;
      return {
        async *[Symbol.asyncIterator]() {
          for (const t of chunks) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } };
        },
        finalMessage: async () => ({ model: params.model, stop_reason, usage: { input_tokens: 40, output_tokens: 12, cache_read_input_tokens: 15000 } }),
      };
    } } },
  };
}

test('AI mode streams Claude answers with a cached knowledge base and server-side fallback', async () => {
  const fake = fakeClient();
  setChatClient(fake);
  try {
    assert.equal((await call('GET', '/chat/status')).data.mode, 'ai');
    const a = await chat('Which package suits a new online store?');
    assert.equal(a.text, 'Our Growth package suits you.');
    assert.equal(a.done.source, 'ai');
    const p = fake.calls[0];
    assert.equal(p.model, MODEL);
    assert.equal(p.fallbacks, 'default');
    assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
    assert.ok(p.output_config?.effort);
    assert.equal(p.system.length, 2);
    assert.deepEqual(p.system[1].cache_control, { type: 'ephemeral' });
    assert.match(p.system[1].text, /knowledge base/);
    assert.deepEqual(p.messages, [{ role: 'user', content: 'Which package suits a new online store?' }]);
    // Second turn carries history, and the system prompt is byte-identical (cache hit).
    await chat('And how long does it take?', a.session_id);
    assert.equal(fake.calls[1].messages.length, 3);
    assert.equal(fake.calls[1].system[1].text, p.system[1].text);
    const row = db.prepare("SELECT * FROM chat_messages WHERE session_id = ? AND role = 'assistant' ORDER BY id LIMIT 1").get(a.session_id);
    assert.equal(row.output_tokens, 12);
    assert.equal(row.cache_read_tokens, 15000);
  } finally { setChatClient(null); }
});

test('AI refusals get a polite message; AI errors fall back to the FAQ engine', async () => {
  setChatClient(fakeClient({ chunks: [], stop_reason: 'refusal' }));
  try {
    const r = await chat('Write my homework');
    assert.match(r.text, /can't help with that/);
    setChatClient(fakeClient({ fail: new Error('upstream down') }));
    const f = await chat('How do I pay? Do you take instant EFT?');
    assert.equal(f.done.source, 'fallback');
    assert.match(f.text, /PayFast|Ozow|EFT/);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM events WHERE type = 'chat.ai_error'").get().n >= 1);
  } finally { setChatClient(null); }
});

test('admin conversation analytics', async () => {
  const stats = (await call('GET', '/admin/chats/stats', { token: admin })).data;
  assert.ok(stats.conversations_7d >= 3);
  assert.ok(stats.unanswered_7d >= 1);
  assert.ok(stats.handoffs_30d >= 1);
  assert.ok(stats.knowledge.articles > 50);
  const list = (await call('GET', '/admin/chats?filter=handoff', { token: admin })).data;
  assert.ok(list.length >= 1 && list.every((c) => c.handoff_lead_id));
  const t = (await call('GET', `/admin/chats/${list[0].id}`, { token: admin })).data;
  assert.ok(t.messages.length >= 2);
  assert.equal((await call('GET', '/admin/chats', { token: alice })).status, 403);
});

// ------------------------------------------------------------ support desk
test('support ticket lifecycle: create, SLA, staff reply, resolve, CSAT, reopen', async () => {
  const create = await call('POST', '/support', { token: alice, body: { subject: 'Checkout broken on iPhone', category: 'technical', priority: 'high', body: 'Customers say the checkout button does nothing.' } });
  assert.equal(create.status, 201);
  const t = create.data;
  assert.match(t.reference, /^TCK-/);
  assert.equal(t.status, 'open');
  const hours = Math.round((Date.parse(`${t.sla_due_at}Z`) - Date.parse(`${t.created_at}Z`)) / 3.6e6);
  assert.equal(hours, 24, 'high priority → 24h first-response target');
  assert.ok(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'ticket.created'").get().n >= 1);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'ticket.notify'").get().n >= 1);

  // Access control
  assert.equal((await call('GET', `/support/${t.id}`, { token: bob })).status, 404);
  assert.equal((await call('GET', '/support', { token: bob })).data.length, 0);
  assert.equal((await call('PATCH', `/support/${t.id}`, { token: alice, body: { status: 'closed' } })).status, 403);

  // Internal note is hidden from the client and doesn't count as a response
  await call('POST', `/support/${t.id}/messages`, { token: staff, body: { body: 'Probably the Safari script bug.', internal: true } });
  let mine = (await call('GET', `/support/${t.id}`, { token: alice })).data;
  assert.equal(mine.messages.length, 1);
  assert.equal(mine.first_response_at, null);

  // Staff reply: first response, pending client, auto-assign
  const reply = await call('POST', `/support/${t.id}/messages`, { token: staff, body: { body: 'Fixed — please try again.' } });
  assert.equal(reply.data.status, 'pending_client');
  assert.ok(reply.data.first_response_at);
  assert.equal(reply.data.assigned_to, staffId);
  assert.equal(reply.data.messages.length, 3, 'staff see internal notes');
  assert.ok(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'ticket.reply' AND to_email = 'alice@example.com'").get().n >= 1);

  // Client can't rate before resolution
  assert.equal((await call('POST', `/support/${t.id}/csat`, { token: alice, body: { score: 5 } })).status, 409);
  const resolved = await call('POST', `/support/${t.id}/resolve`, { token: alice });
  assert.equal(resolved.data.status, 'resolved');
  assert.ok(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'ticket.resolved'").get().n >= 1);
  assert.equal((await call('POST', `/support/${t.id}/csat`, { token: staff, body: { score: 5 } })).status, 403);
  const rated = await call('POST', `/support/${t.id}/csat`, { token: alice, body: { score: 5, comment: 'Quick fix!' } });
  assert.equal(rated.data.csat_score, 5);

  // Client reply reopens a resolved ticket
  const reopened = await call('POST', `/support/${t.id}/messages`, { token: alice, body: { body: 'Actually it broke again.' } });
  assert.equal(reopened.data.status, 'open');

  const stats = (await call('GET', '/admin/support/stats', { token: admin })).data;
  assert.equal(stats.open, 1);
  assert.equal(stats.csat_avg_90d, 5);
  assert.equal(stats.sla_met_pct_30d, 100);
});

test('support validates input and engagement ownership', async () => {
  assert.equal((await call('POST', '/support', { token: alice, body: { subject: 'Hi', category: 'other', body: 'short' } })).status, 400);
  const o = db.prepare('INSERT INTO orders (reference, user_id, tier_id, price_cents) SELECT ?, u.id, (SELECT id FROM service_tiers LIMIT 1), 100 FROM users u WHERE email = ? RETURNING id');
  let orderId;
  try { orderId = o.get('HC-TEST01', 'bob@example.com').id; } catch { orderId = null; }
  if (orderId) {
    const r = await call('POST', '/support', { token: alice, body: { subject: 'About Bob order', category: 'project', order_id: orderId, body: 'This is not my engagement.' } });
    assert.equal(r.status, 400);
  }
  assert.equal((await call('GET', '/support')).status, 401);
});

test('SLA watch flags late tickets once and auto-closes old resolved tickets', async () => {
  const late = (await call('POST', '/support', { token: bob, body: { subject: 'Site is down!', category: 'technical', priority: 'urgent', body: 'Our website shows an error page.' } })).data;
  db.prepare("UPDATE tickets SET sla_due_at = datetime('now', '-1 hour') WHERE id = ?").run(late.id);
  const old = (await call('POST', '/support', { token: bob, body: { subject: 'Old question here', category: 'other', priority: 'low', body: 'An old question that was answered.' } })).data;
  db.prepare("UPDATE tickets SET status = 'resolved', resolved_at = datetime('now', '-8 days') WHERE id = ?").run(old.id);
  await runJob('support-sla');
  await runJob('support-sla');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM events WHERE type = 'support.sla_breach' AND ref = ?").get(late.reference).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM emails WHERE template = 'ticket.sla'").get().n, 1);
  assert.equal(db.prepare('SELECT status FROM tickets WHERE id = ?').get(old.id).status, 'closed');
  const ov = (await call('GET', '/admin/overview', { token: admin })).data;
  assert.ok(ov.tickets_breached >= 1);
  // Staff priority change recomputes the target while unanswered
  const p = await call('PATCH', `/support/${late.id}`, { token: staff, body: { priority: 'low' } });
  assert.equal(p.data.priority, 'low');
  assert.equal(p.data.sla_breached, 0);
});

test('chat retention removes conversations older than 180 days', async () => {
  const a = await chat('Hello there');
  db.prepare("UPDATE chat_sessions SET updated_at = datetime('now', '-181 days') WHERE id = ?").run(a.session_id);
  await runJob('chat-retention');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM chat_sessions WHERE id = ?').get(a.session_id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM chat_messages WHERE session_id = ?').get(a.session_id).n, 0);
});

test('email templates for customer care render', async () => {
  for (const tpl of ['ticket.created', 'ticket.notify', 'ticket.reply', 'ticket.resolved', 'ticket.sla', 'chat.handoff']) {
    const r = await fetch(`${base}/admin/email-templates/${tpl}/preview`, { headers: { authorization: `Bearer ${admin}` } });
    assert.equal(r.status, 200, tpl);
  }
});
