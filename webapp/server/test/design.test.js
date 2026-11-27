// Design studio: brief → directions → AI concepts (Recraft) / Figma / uploads → client picks → brand kit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_URL = 'https://hipcastle.test';
process.env.RECRAFT_API_TOKEN = 'test-recraft';
process.env.FIGMA_TOKEN = 'test-figma';
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { setRecraftFetch } = await import('../src/design/recraft.js');
const { setFigmaFetch, figmaKey } = await import('../src/design/figma.js');
const { setDesignClient } = await import('../src/design/brief.js');
const { sanitizeSvg, svgColors, recolorSvg, hexToCmyk } = await import('../src/design/svg.js');

let server, base, admin, client, other, order;
const call = async (method, path, { token, body, raw, type } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': type || 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: raw ?? (body && JSON.stringify(body)) });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: ct.includes('json') ? await res.json() : await res.text() };
};
const LOGO = (c = '#c1440e') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="#ffffff"/><circle cx="50" cy="50" r="40" fill="${c}"/><path d="M30 50h40" stroke="#2f4858" stroke-width="8"/></svg>`;
const recraftCalls = [];

before(async () => {
  seed({ demo: false, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = (await call('POST', '/auth/login', { body: { email: 'admin@hipcastle.agency', password: 'ChangeMe123!' } })).data.token;
  client = (await call('POST', '/auth/register', { body: { name: 'Naledi Khumalo', email: 'naledi@example.com', password: 'password123', company: 'Khumalo Foods' } })).data.token;
  other = (await call('POST', '/auth/register', { body: { name: 'Other Person', email: 'other@example.com', password: 'password123' } })).data.token;
  const tier = (await call('GET', '/services/design')).data.tiers.find((t) => t.tier === 'essential');
  order = (await call('POST', '/orders', { token: client, body: { tier_id: tier.id, brief: 'New brand identity for our catering business.' } })).data;
  const o = (await call('GET', `/orders/${order.id}`, { token: client })).data;
  const inv = o.invoices.find((i) => i.status === 'unpaid');
  const co = (await call('POST', '/payments/checkout', { token: client, body: { invoice_id: inv.id, gateway: 'simulated' } })).data;
  await call('POST', `/payments/simulated/${co.reference}`, { token: client, body: { outcome: 'complete' } });
  db.prepare("UPDATE onboarding_items SET response = 'warm, proudly local, generous' WHERE order_id = ? AND key = 'des_personality'").run(order.id);

  setRecraftFetch(async (url, opts) => {
    if (String(url).includes('/images/generations')) {
      const b = JSON.parse(opts.body); recraftCalls.push(b);
      return new Response(JSON.stringify({ credits: 80 * b.n, data: Array.from({ length: b.n }, (_, i) => ({ image_id: `img${i}`, url: `https://img.recraft.test/${i}.svg` })) }), { status: 200 });
    }
    return new Response(`<?xml version="1.0"?>${LOGO()}<script>alert(1)</script>`, { status: 200 });
  });
  setFigmaFetch(async (url) => {
    if (String(url).includes('/files/')) return new Response(JSON.stringify({ name: 'Khumalo brand', lastModified: '2026-11-20T10:00:00Z', thumbnailUrl: 'https://figma.test/t.png',
      document: { children: [{ name: 'Logo', children: [{ id: '1:2', name: 'Primary logo', type: 'FRAME' }, { id: '1:3', name: 'Icon', type: 'COMPONENT' }] }] } }), { status: 200 });
    if (String(url).includes('/images/')) return new Response(JSON.stringify({ images: { '1:2': 'https://figma-export.test/a.svg' } }), { status: 200 });
    return new Response(LOGO('#1fa2a8'), { status: 200 });
  });
});
after(() => server.close());

test('SVG safety: scripts, handlers and external references are removed', () => {
  const dirty = '<svg onload="x()"><script>evil()</script><a href="https://evil.test"><circle fill="#F00" onclick="y()"/></a><image href="http://x/y.png"/><foreignObject><div/></foreignObject><style>@import url(http://x);</style></svg>';
  const s = sanitizeSvg(dirty);
  assert.doesNotMatch(s, /script|onload|onclick|evil\.test|http:\/\/x|foreignObject|@import/i);
  assert.throws(() => sanitizeSvg('<html><body/></html>'), /Not an SVG/);
  assert.deepEqual(svgColors(LOGO()), ['#ffffff', '#c1440e', '#2f4858']);
  assert.deepEqual(svgColors('<svg><circle fill="#AA0000"/><circle fill="#00aa00"/><circle fill="#0000aa"/><circle fill="#aa0000"/></svg>'), ['#aa0000', '#00aa00', '#0000aa'], 'every colour counted');
  assert.doesNotMatch(recolorSvg(LOGO(), '#111111'), /#c1440e|#2f4858|<rect/);
  assert.deepEqual(hexToCmyk('#000000'), [0, 0, 0, 100]);
  assert.equal(figmaKey('https://www.figma.com/design/AbCdEf1234567890/Khumalo?node-id=1-2'), 'AbCdEf1234567890');
  assert.equal(figmaKey('https://evil.test/design/AbCdEf1234567890'), null);
});

test('brief is built from onboarding; starter directions without AI', async () => {
  setDesignClient(null);
  const d = (await call('GET', `/design/${order.id}`, { token: admin })).data;
  assert.equal(d.brief.business_name, 'Khumalo Foods');
  assert.match(d.brief.personality, /proudly local/);
  const g = (await call('POST', `/design/${order.id}/directions`, { token: admin })).data;
  assert.equal(g.directions_by, 'rules');
  assert.equal(g.directions.length, 3);
  assert.ok(g.directions[0].palette.includes('#c1440e'), 'palette follows the personality (warm/local)');
  assert.match(g.directions[1].prompt, /without any text/);
});

test('AI directions via Claude (forced tool), with validation fallback', async () => {
  const dir = (name) => ({ name, idea: 'A warm, generous mark for a family caterer.', palette: ['#c1440e', '#f2a541', '#2f4858'], fonts: { heading: 'Poppins', body: 'Inter' }, prompt: 'Flat vector symbol of a serving bowl, no text or letters, white background.' });
  let params;
  setDesignClient({ messages: { create: async (p) => { params = p; return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'save_directions', input: { directions: [dir('Bowl'), dir('Monogram'), dir('Wordmark')] } }] }; } } });
  const g = (await call('POST', `/design/${order.id}/directions`, { token: admin })).data;
  assert.equal(g.directions_by, 'ai');
  assert.equal(g.directions[0].name, 'Bowl');
  assert.equal(params.tool_choice.name, 'save_directions');
  assert.match(params.messages[0].content, /Khumalo Foods/);
  setDesignClient({ messages: { create: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'save_directions', input: { directions: [{ name: 'x' }] } }] }) } });
  const bad = (await call('POST', `/design/${order.id}/directions`, { token: admin })).data;
  assert.equal(bad.directions_by, 'rules');
  assert.match(bad.warning, /wrong shape/);
  setDesignClient(null);
});

test('Recraft concepts are generated as sanitised SVG, within the per-engagement limit', async () => {
  const g = (await call('POST', `/design/${order.id}/generate`, { token: admin, body: { direction: 1, n: 3 } }));
  assert.equal(g.status, 200, JSON.stringify(g.data));
  const b = recraftCalls.at(-1);
  assert.equal(b.model, 'recraftv4_1_vector');
  assert.equal(b.size, '1:1');
  assert.ok(b.controls.colors.length >= 2);
  assert.equal(g.data.concepts.length, 3);
  assert.equal(g.data.ai.used, 3);
  const file = await call('GET', `/design/${order.id}/assets/${g.data.concepts[0].id}/file`, { token: admin });
  assert.match(file.headers.get('content-type'), /^image\/svg\+xml/);
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  assert.doesNotMatch(file.data, /<script|<\?xml/);
  db.prepare('UPDATE design_projects SET generations = 48 WHERE order_id = ?').run(order.id);
  assert.equal((await call('POST', `/design/${order.id}/generate`, { token: admin, body: { direction: 0 } })).status, 429);
  db.prepare('UPDATE design_projects SET generations = 3 WHERE order_id = ?').run(order.id);
});

test('uploads: SVG sanitised, PNG checked by its bytes, wrong files refused', async () => {
  const up = await call('POST', `/design/${order.id}/assets?title=Hand-drawn%20idea`, { token: admin, raw: LOGO('#000000').replace('<circle', '<circle onclick="x()"'), type: 'image/svg+xml' });
  assert.equal(up.status, 200);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal((await call('POST', `/design/${order.id}/assets?title=Sketch`, { token: admin, raw: png, type: 'image/png' })).status, 200);
  assert.equal((await call('POST', `/design/${order.id}/assets`, { token: admin, raw: Buffer.from('<html>not png</html>'), type: 'image/png' })).status, 400);
  assert.equal((await call('POST', `/design/${order.id}/assets`, { token: client, raw: LOGO(), type: 'image/svg+xml' })).status, 403);
  const stored = db.prepare("SELECT data FROM design_assets WHERE title = 'Hand-drawn idea'").get().data.toString();
  assert.doesNotMatch(stored, /onclick/);
});

test('Figma: link a file, list frames, import frames as concepts', async () => {
  const bad = await call('POST', `/design/${order.id}/figma`, { token: admin, body: { url: 'https://example.com/not-figma' } });
  assert.equal(bad.status, 400);
  const d = (await call('POST', `/design/${order.id}/figma`, { token: admin, body: { url: 'https://www.figma.com/design/AbCdEf1234567890/Khumalo' } })).data;
  assert.equal(d.figma_meta.name, 'Khumalo brand');
  assert.equal(d.figma_meta.frames.length, 2);
  const imp = (await call('POST', `/design/${order.id}/figma/import`, { token: admin, body: { ids: ['1:2'] } })).data;
  assert.ok(imp.concepts.some((c) => c.title === 'Primary logo' && c.source === 'figma'));
});

test('client sees only shared concepts (no prompts), picks favourites; sharing submits the concepts milestone', async () => {
  const staffView = (await call('GET', `/design/${order.id}`, { token: admin })).data;
  const [a, b] = staffView.concepts;
  let cv = (await call('GET', `/design/${order.id}`, { token: client })).data;
  assert.equal(cv.concepts.length, 0, 'nothing visible before sharing');
  assert.equal((await call('GET', `/design/${order.id}/assets/${a.id}/file`, { token: client })).status, 404);
  assert.equal((await call('GET', `/design/${order.id}`, { token: other })).status, 404);

  const shared = await call('POST', `/design/${order.id}/share`, { token: admin, body: { asset_ids: [a.id, b.id] } });
  assert.equal(shared.status, 200);
  const m = db.prepare("SELECT status, deliverable_url FROM milestones WHERE order_id = ? AND key = 'concepts'").get(order.id);
  assert.equal(m.status, 'awaiting_client');
  assert.match(m.deliverable_url, /#design$/);
  assert.ok(db.prepare("SELECT 1 FROM emails WHERE template = 'deliverable.ready' AND to_email = 'naledi@example.com'").get());

  cv = (await call('GET', `/design/${order.id}`, { token: client })).data;
  assert.equal(cv.concepts.length, 2);
  assert.equal(cv.concepts[0].prompt, undefined);
  assert.equal(cv.directions[0].prompt, undefined);
  assert.equal(cv.kit, null);
  assert.equal((await call('GET', `/design/${order.id}/assets/${a.id}/file`, { token: client })).status, 200);
  const pick = (await call('POST', `/design/${order.id}/assets/${a.id}/pick`, { token: client, body: { pick: true, comment: 'Love this — can the bowl be rounder?' } })).data;
  assert.equal(pick.concepts.find((c) => c.id === a.id).client_pick, 1);
  assert.equal((await call('POST', `/design/${order.id}/assets/${a.id}/pick`, { token: admin, body: { pick: true } })).status, 403);
});

test('final files, one-colour versions, quality gate and brand kit release', async () => {
  const { concepts } = (await call('GET', `/design/${order.id}`, { token: admin })).data;
  const chosen = concepts.find((c) => c.client_pick);
  let d = (await call('PATCH', `/design/${order.id}/assets/${chosen.id}`, { token: admin, body: { kind: 'final', variant: 'primary', title: 'Primary logo' } })).data;
  const primary = d.finals.find((f) => f.variant === 'primary');
  assert.ok(primary);
  assert.equal(d.concepts.find((c) => c.id === chosen.id).kind, 'concept', 'concept board unchanged');
  d = (await call('POST', `/design/${order.id}/assets/${primary.id}/variants`, { token: admin })).data;
  assert.deepEqual(d.finals.map((f) => f.variant).sort(), ['mono_dark', 'mono_light', 'primary']);
  const mono = await call('GET', `/design/${order.id}/assets/${d.finals.find((f) => f.variant === 'mono_dark').id}/file`, { token: admin });
  assert.match(mono.data, /^<svg/);
  assert.match(mono.data, /#111111/);
  assert.doesNotMatch(mono.data, /#c1440e|#2f4858/);
  assert.deepEqual(d.kit.palette.map((c) => c.hex), ['#c1440e', '#2f4858'], 'palette read from the final logo itself');
  assert.equal(d.kit.palette[0].rgb.join(','), '193,68,14');

  assert.equal((await call('POST', `/design/${order.id}/release`, { token: admin })).status, 409, 'blocked until checks are done');
  await call('PUT', `/design/${order.id}/checks`, { token: admin, body: { designer_refined: true, trademark_checked: true, trademark_note: 'CIPC search 21 Nov: no conflicts in class 43' } });
  const rel = await call('POST', `/design/${order.id}/release`, { token: admin });
  assert.equal(rel.status, 200);
  const cv = (await call('GET', `/design/${order.id}`, { token: client })).data;
  assert.equal(cv.kit.logos.length, 3);
  assert.ok(cv.kit.fonts.heading);
  const dl = await call('GET', `/design/${order.id}/assets/${primary.id}/file?download=1`, { token: client });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment; filename="khumalo-foods-primary-logo\.svg"/);
});
