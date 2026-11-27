// Delivery integrations: monitoring, PageSpeed, Search Console/GA4 (service account), GitHub,
// Meta ads, WhatsApp, Microsoft 365 inbox and eTenders — all against simulated APIs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.SITE_URL = 'https://hipcastle.test';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify({ client_email: 'reports@hipcastle.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })).toString('base64');
process.env.GITHUB_TOKEN = 'gh-test';
process.env.PAGESPEED_API_KEY = 'ps-test';
process.env.META_ACCESS_TOKEN = 'meta-test';
process.env.WHATSAPP_TOKEN = 'wa-test';
process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
Object.assign(process.env, { M365_TENANT_ID: 'tenant', M365_CLIENT_ID: 'cid', M365_CLIENT_SECRET: 'secret', M365_MAILBOX: 'hello@hipcastle.agency' });

const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const { setIntegrationFetch } = await import('../src/integrations/http.js');
const { setTlsCheck, setResolver, checkSite } = await import('../src/integrations/monitor.js');
const { runIntegrationMonitor, runTenders, runMailboxSync } = await import('../src/integrations/jobs.js');
const { refreshDueReports } = await import('../src/integrations/reports.js');
const { waNumber } = await import('../src/integrations/meta.js');
const { TEMPLATES } = await import('../src/email/templates.js');
const { TOUCHPOINTS } = await import('../src/communications.js');

let server, base, admin, client, other, order;
const calls = [];
let siteUp = true;
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const settle = () => new Promise((r) => setTimeout(r, 50));

before(async () => {
  seed({ demo: false, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = (await call('POST', '/auth/login', { body: { email: 'admin@hipcastle.agency', password: 'ChangeMe123!' } })).data.token;
  client = (await call('POST', '/auth/register', { body: { name: 'Sipho Ndlovu', email: 'sipho@example.com', password: 'password123', company: 'Ndlovu Security', phone: '082 123 4567' } })).data.token;
  other = (await call('POST', '/auth/register', { body: { name: 'Other', email: 'other@example.com', password: 'password123' } })).data.token;
  const tier = (await call('GET', '/services/engineering')).data.tiers.find((t) => t.tier === 'essential');
  order = (await call('POST', '/orders', { token: client, body: { tier_id: tier.id, brief: 'Website and tender support for our security company.' } })).data;
  db.prepare("UPDATE orders SET status = 'active' WHERE id = ?").run(order.id);

  setTlsCheck(async () => 7);
  setResolver(async (host) => [{ address: host.startsWith('internal-') ? '10.0.0.5' : '203.0.113.10' }]);
  setIntegrationFetch(async (url, opts = {}) => {
    const u = String(url); calls.push({ url: u, opts });
    if (u.startsWith('https://ndlovu.example')) return new Response('ok', { status: siteUp ? 200 : 503 });
    if (u.includes('pagespeedonline')) return json({ lighthouseResult: { categories: { performance: { score: 0.62 }, accessibility: { score: 0.91 }, 'best-practices': { score: 1 }, seo: { score: 0.85 } },
      audits: { 'largest-contentful-paint': { displayValue: '3.9 s', score: 0.3 }, 'render-blocking-resources': { title: 'Eliminate render-blocking resources', score: 0.2, details: { type: 'opportunity' } } } },
      loadingExperience: { overall_category: 'AVERAGE', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100 } } } });
    if (u === 'https://oauth2.googleapis.com/token') {
      const assertion = new URLSearchParams(String(opts.body)).get('assertion');
      const [h, p, sig] = assertion.split('.');
      const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, 'base64url'));
      return ok ? json({ access_token: 'g-token', expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400);
    }
    if (u.includes('searchAnalytics/query')) {
      const b = JSON.parse(opts.body);
      if (b.dimensions?.[0] === 'query') return json({ rows: [{ keys: ['security company pretoria'], clicks: 40, impressions: 900, ctr: 0.044, position: 6.2 }] });
      if (b.dimensions?.[0] === 'page') return json({ rows: [{ keys: ['https://ndlovu.example/'], clicks: 80, impressions: 2000 }] });
      return json({ rows: [{ clicks: 120, impressions: 4000, ctr: 0.03, position: 11.4 }] });
    }
    if (u.includes('analyticsdata.googleapis.com')) {
      const b = JSON.parse(opts.body);
      if (b.dimensions) return json({ rows: [{ dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '300' }, { value: '12' }] }] });
      return json({ rows: [{ dimensionValues: [{ value: 'date_range_0' }], metricValues: [{ value: '500' }, { value: '650' }, { value: '20' }, { value: '0.61' }] },
        { dimensionValues: [{ value: 'date_range_1' }], metricValues: [{ value: '400' }, { value: '520' }, { value: '15' }, { value: '0.58' }] }] });
    }
    if (u.startsWith('https://api.github.com/repos/ndlovu/site')) {
      if (u.endsWith('/repos/ndlovu/site')) return json({ default_branch: 'main', pushed_at: '2026-11-20T10:00:00Z', private: true });
      if (u.includes('/commits')) return json([{ sha: 'abcdef1234', commit: { message: 'Add quote form\n\nDetails', author: { name: 'Dev', date: '2026-11-20T09:00:00Z' } } }]);
      if (u.includes('/pulls')) return json([{ number: 7, title: 'Contact page', merged_at: '2026-11-19T10:00:00Z', state: 'closed', updated_at: '2026-11-19T10:00:00Z' }]);
      return json([{ name: 'v1.0', tag_name: 'v1.0', published_at: '2026-11-18T10:00:00Z' }]);
    }
    if (u.includes('graph.facebook.com') && u.includes('/insights')) {
      if (u.includes('level=campaign')) return json({ data: [{ campaign_name: 'Pretoria guarding', spend: '1500.00', clicks: '300', ctr: '1.9', actions: [{ action_type: 'lead', value: '6' }] }] });
      return json({ data: [{ spend: '2000.00', impressions: '50000', reach: '20000', clicks: '400', ctr: '0.8', cpc: '5.00', account_currency: 'ZAR', actions: [{ action_type: 'lead', value: '8' }, { action_type: 'link_click', value: '390' }] }] });
    }
    if (u.includes('graph.facebook.com') && u.endsWith('/1234567890/messages')) return json({ messages: [{ id: 'wamid.TEST' }] });
    if (u.includes('login.microsoftonline.com')) return json({ access_token: 'ms-token', expires_in: 3600 });
    if (u.includes('graph.microsoft.com')) return json({ value: [
      { id: 'm1', from: { emailAddress: { address: 'Thandi@Example.com', name: 'Thandi' } }, subject: 'Re: Your enquiry', bodyPreview: 'Yes, Thursday works', receivedDateTime: '2026-11-21T07:00:00Z' },
      { id: 'm2', from: { emailAddress: { address: 'stranger@spam.test' } }, subject: 'SEO offer', bodyPreview: 'Cheap links', receivedDateTime: '2026-11-21T06:00:00Z' },
    ] });
    if (u.includes('ocds-api.etenders.gov.za')) return json({ releases: [
      { ocid: 'ocds-9t57fa-1', date: '2026-11-20T00:00:00Z', tender: { title: 'SCM/1/2026 Security guarding services', description: 'Provision of guarding services at clinics', procuringEntity: { name: 'City of Tshwane' }, mainProcurementCategory: 'services', tenderPeriod: { endDate: '2099-12-05T11:00:00Z' }, documents: [{ url: 'https://www.etenders.gov.za/doc1' }] } },
      { ocid: 'ocds-9t57fa-2', date: '2026-11-20T00:00:00Z', tender: { title: 'Supply of seedlings', description: 'Agricultural co-op', procuringEntity: { name: 'Mnquma LM' }, tenderPeriod: { endDate: '2099-12-01T12:00:00Z' } } },
    ], links: {} });
    return json({ error: { message: `unexpected ${u}` } }, 404);
  });
});
after(() => { setIntegrationFetch(null); server.close(); });

test('every new template is registered in the communications plan', () => {
  for (const t of ['site.down', 'site.recovered', 'site.ssl', 'tenders.digest']) { assert.ok(TEMPLATES[t], t); assert.ok(TOUCHPOINTS[t], t); }
});

test('links are validated and staff-only; clients see reports but not tender keywords', async () => {
  const bad = await call('PUT', `/engagements/${order.id}/links`, { token: admin, body: { github_repo: 'not a repo', ga4_property: 'abc' } });
  assert.equal(bad.status, 400);
  assert.equal((await call('PUT', `/engagements/${order.id}/links`, { token: client, body: { site_url: 'https://x.test' } })).status, 403);
  const ok = await call('PUT', `/engagements/${order.id}/links`, { token: admin, body: {
    site_url: 'https://ndlovu.example', github_repo: 'ndlovu/site', gsc_property: 'sc-domain:ndlovu.example', ga4_property: '123456789', meta_ad_account: 'act_1234567890', tender_keywords: 'security, guarding' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.links.meta_ad_account, '1234567890');
  const cv = (await call('GET', `/engagements/${order.id}`, { token: client })).data;
  assert.equal(cv.links.tender_keywords, undefined);
  assert.equal(cv.inbox, undefined);
  assert.equal((await call('GET', `/engagements/${order.id}`, { token: other })).status, 404);
});

test('website monitoring: incident after two failures, alert, recovery and TLS warning', async () => {
  siteUp = false;
  await runIntegrationMonitor();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM site_incidents').get().n, 0, 'one blip is not an incident');
  await runIntegrationMonitor();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM site_incidents WHERE resolved_at IS NULL').get().n, 1);
  assert.ok(db.prepare("SELECT 1 FROM emails WHERE template = 'site.down'").get());
  siteUp = true;
  await runIntegrationMonitor(); await runIntegrationMonitor();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM site_incidents WHERE resolved_at IS NULL').get().n, 0);
  assert.ok(db.prepare("SELECT 1 FROM emails WHERE template = 'site.recovered'").get());
  assert.ok(db.prepare("SELECT 1 FROM emails WHERE template = 'site.ssl'").get(), 'TLS expiring in 7 days');
  const r = (await call('GET', `/engagements/${order.id}`, { token: client })).data.reports.monitor.data;
  assert.equal(r.checks, 4);
  assert.equal(r.uptime_pct, 50);
});

test('reports: PageSpeed, Search Console + GA4 via a signed service-account JWT, GitHub, Meta ads', async () => {
  for (const p of ['pagespeed', 'search_console', 'ga4', 'github', 'meta_ads']) {
    const res = await call('POST', `/engagements/${order.id}/reports/${p}/refresh`, { token: admin });
    assert.equal(res.status, 200, `${p}: ${JSON.stringify(res.data)}`);
  }
  const rep = (await call('GET', `/engagements/${order.id}`, { token: client })).data.reports;
  assert.deepEqual(rep.pagespeed.data.scores, { performance: 62, accessibility: 91, 'best-practices': 100, seo: 85 });
  assert.equal(rep.pagespeed.data.lab.lcp, '3.9 s');
  assert.ok(rep.pagespeed.data.fix_first.includes('Eliminate render-blocking resources'));
  assert.equal(rep.search_console.data.totals.clicks, 120);
  assert.equal(rep.search_console.data.top_queries[0].query, 'security company pretoria');
  assert.equal(rep.ga4.data.totals.users, 500);
  assert.equal(rep.ga4.data.previous.users, 400);
  assert.equal(rep.github.data.recent_commits[0].message, 'Add quote form');
  assert.equal(rep.github.data.pull_requests[0].state, 'merged');
  assert.equal(rep.meta_ads.data.totals.leads, 8);
  assert.equal(rep.meta_ads.data.totals.cost_per_lead, 250);
  assert.equal(rep.tenders, undefined, 'tender matches are staff-only');
  const tok = calls.filter((c) => c.url === 'https://oauth2.googleapis.com/token');
  assert.equal(tok.length, 2, 'one token per scope, then cached');
  assert.equal(calls.find((c) => c.url.includes('/insights')).opts.headers.Authorization, 'Bearer meta-test');
  assert.equal((await call('POST', `/engagements/${order.id}/reports/pagespeed/refresh`, { token: client })).status, 403);
});

test('a failing provider is recorded for staff and does not break the others', async () => {
  const before = db.prepare('SELECT COUNT(*) n FROM engagement_reports').get().n;
  db.prepare("UPDATE engagement_links SET github_repo = 'ndlovu/missing' WHERE order_id = ?").run(order.id);
  const res = await call('POST', `/engagements/${order.id}/reports/github/refresh`, { token: admin });
  assert.equal(res.status, 400);
  const staff = (await call('GET', `/engagements/${order.id}`, { token: admin })).data.reports.github;
  assert.match(staff.last_error, /GitHub/);
  assert.equal(staff.data.recent_commits[0].sha, 'abcdef1', 'last good report still shown');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM engagement_reports').get().n, before + 1);
  db.prepare("UPDATE engagement_links SET github_repo = 'ndlovu/site' WHERE order_id = ?").run(order.id);
  assert.match(await refreshDueReports(), /report/);
});

test('eTenders: stores new tenders and emails the team matches by keyword', async () => {
  const r = await runTenders();
  assert.match(r, /2 new tender\(s\); 1 match/);
  const digest = db.prepare("SELECT text FROM emails WHERE template = 'tenders.digest'").get();
  assert.match(digest.text, /Security guarding services/);
  assert.doesNotMatch(digest.text, /seedlings/i);
  const list = (await call('GET', '/admin/integrations/tenders?q=guarding', { token: admin })).data;
  assert.equal(list.length, 1);
  await call('POST', `/engagements/${order.id}/reports/tenders/refresh`, { token: admin });
  const staff = (await call('GET', `/engagements/${order.id}`, { token: admin })).data.reports.tenders;
  assert.equal(staff.data.matches[0].buyer, 'City of Tshwane');
});

test('Microsoft 365: replies from known leads are logged and qualify the lead; strangers ignored', async () => {
  const lead = db.prepare("INSERT INTO leads (name, email, message, status) VALUES ('Thandi', 'thandi@example.com', 'Website please', 'contacted') RETURNING id").get().id;
  assert.match(await runMailboxSync(), /1 new email/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inbound_emails').get().n, 1);
  assert.equal(db.prepare('SELECT status FROM leads WHERE id = ?').get(lead).status, 'qualified');
  assert.match(await runMailboxSync(), /0 new email/, 'no duplicates');
});

test('WhatsApp: only for opted-in clients with a mobile number; mirrors invoice emails', async () => {
  assert.equal(waNumber('082 123 4567'), '27821234567');
  assert.equal(waNumber('123'), null);
  const bad = await call('PATCH', '/auth/me', { token: other, body: { whatsapp_opt_in: true } });
  assert.equal(bad.status, 400, 'needs a phone number');
  const inv = (await call('POST', `/orders/${order.id}/invoices`, { token: admin, body: { description: 'Hosting', amount_cents: 50000 } }));
  assert.ok([200, 201].includes(inv.status), JSON.stringify(inv.data));
  await settle();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM whatsapp_messages').get().n, 0, 'not opted in yet');
  const me = (await call('PATCH', '/auth/me', { token: client, body: { whatsapp_opt_in: true } })).data;
  assert.equal(me.whatsapp_opt_in, true);
  await call('POST', `/orders/${order.id}/invoices`, { token: admin, body: { description: 'Domain renewal', amount_cents: 25000 } });
  await settle();
  const m = db.prepare('SELECT * FROM whatsapp_messages ORDER BY id DESC').get();
  assert.equal(m.status, 'sent');
  assert.equal(m.to_phone, '27821234567');
  assert.equal(m.template, 'hc_invoice_issued');
  const sent = JSON.parse(calls.filter((c) => c.url.endsWith('/messages')).at(-1).opts.body);
  assert.equal(sent.template.language.code, 'en');
  assert.equal(sent.template.components[0].parameters[0].text, 'Sipho');
  assert.match(sent.template.components[0].parameters[2].text, /^R/);
});

test('Command Centre lists every integration with its status', async () => {
  const d = (await call('GET', '/admin/integrations', { token: admin })).data;
  const ids = d.services.map((s) => s.id);
  for (const k of ['monitor', 'pagespeed', 'google', 'github', 'meta_ads', 'whatsapp', 'm365', 'etenders', 'recraft', 'figma']) assert.ok(ids.includes(k), k);
  assert.match(d.services.find((s) => s.id === 'google').setup.join(' '), /reports@hipcastle\.iam\.gserviceaccount\.com/);
  assert.equal(JSON.stringify(d).includes('meta-test'), false, 'no secrets in the response');
});

test('monitoring refuses private and internal addresses (no SSRF)', async () => {
  for (const u of ['http://127.0.0.1:4000/api/health', 'http://169.254.169.254/latest/meta-data', 'http://localhost/', 'http://hipcastle.internal/', 'http://[::1]/', 'http://internal-db.example/', 'http://192.168.1.1/']) {
    const r = await checkSite(u);
    assert.equal(r.ok, false, u);
    assert.match(r.error, /Private address/, u);
  }
  const before = calls.length;
  await checkSite('http://10.1.2.3/');
  assert.equal(calls.length, before, 'no request was made');
});
