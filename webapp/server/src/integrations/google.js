// Google: PageSpeed Insights (speed, accessibility, SEO audits), and Search Console + GA4 reports
// through one service account. Clients add the service account's email as a user on their
// Search Console property and as a Viewer on their GA4 property — no OAuth screens needed.
import { createSign } from 'node:crypto';
import { getJson } from './http.js';

// ---------------------------------------------------------------- PageSpeed Insights
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
export async function pageSpeed(url, strategy = 'mobile') {
  const q = new URLSearchParams({ url, strategy });
  for (const c of CATS) q.append('category', c);
  if (process.env.PAGESPEED_API_KEY) q.set('key', process.env.PAGESPEED_API_KEY);
  const d = await getJson(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { timeout: 90_000, label: 'PageSpeed' });
  const lr = d.lighthouseResult || {};
  const audit = (id) => lr.audits?.[id]?.displayValue || null;
  const field = d.loadingExperience?.metrics || {};
  const failing = Object.values(lr.audits || {}).filter((a) => a.score !== null && a.score < 0.5 && a.scoreDisplayMode === 'binary' || (a.score !== null && a.score < 0.5 && a.details?.type === 'opportunity'))
    .slice(0, 8).map((a) => a.title);
  return {
    url, strategy, tested_at: new Date().toISOString(),
    scores: Object.fromEntries(CATS.map((c) => [c, lr.categories?.[c]?.score != null ? Math.round(lr.categories[c].score * 100) : null])),
    lab: { lcp: audit('largest-contentful-paint'), cls: audit('cumulative-layout-shift'), tbt: audit('total-blocking-time'), fcp: audit('first-contentful-paint') },
    field: Object.keys(field).length ? { overall: d.loadingExperience?.overall_category || null, lcp_ms: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null, inp_ms: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null, cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null } : null,
    fix_first: failing,
  };
}

// ---------------------------------------------------------------- service account auth
function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(json);
    return sa.client_email && sa.private_key ? sa : null;
  } catch { return null; }
}
export const googleConfigured = () => Boolean(serviceAccount());
export const googleServiceEmail = () => serviceAccount()?.client_email || null;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const tokens = new Map();
export async function googleToken(scope) {
  const sa = serviceAccount();
  if (!sa) throw Object.assign(new Error('Add GOOGLE_SERVICE_ACCOUNT_JSON to read Search Console and Analytics.'), { status: 400 });
  const hit = tokens.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const d = await getJson('https://oauth2.googleapis.com/token', { method: 'POST', label: 'Google auth',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  tokens.set(scope, { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 });
  return d.access_token;
}
export const clearGoogleTokens = () => tokens.clear();

const ymd = (d) => d.toISOString().slice(0, 10);
const range = (days, endOffset = 3) => { const end = new Date(Date.now() - endOffset * 864e5); return { start: ymd(new Date(end - (days - 1) * 864e5)), end: ymd(end) }; };

// ---------------------------------------------------------------- Search Console
export async function searchConsole(property, days = 28) {
  const token = await googleToken('https://www.googleapis.com/auth/webmasters.readonly');
  const site = encodeURIComponent(property);
  const cur = range(days); const prev = range(days, 3 + days);
  const q = (r, extra = {}) => getJson(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, { method: 'POST', label: 'Search Console',
    headers: { Authorization: `Bearer ${token}` }, body: { startDate: r.start, endDate: r.end, ...extra } });
  const [tot, before, queries, pages] = await Promise.all([q(cur), q(prev), q(cur, { dimensions: ['query'], rowLimit: 10 }), q(cur, { dimensions: ['page'], rowLimit: 5 })]);
  const sum = (d) => (d.rows?.[0] ? { clicks: d.rows[0].clicks, impressions: d.rows[0].impressions, ctr: Math.round(d.rows[0].ctr * 1000) / 10, position: Math.round(d.rows[0].position * 10) / 10 } : { clicks: 0, impressions: 0, ctr: 0, position: null });
  return {
    property, period: cur, totals: sum(tot), previous: sum(before),
    top_queries: (queries.rows || []).map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 })),
    top_pages: (pages.rows || []).map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
  };
}

// ---------------------------------------------------------------- GA4
export async function ga4(propertyId, days = 28) {
  const token = await googleToken('https://www.googleapis.com/auth/analytics.readonly');
  const cur = range(days, 1); const prev = range(days, 1 + days);
  const run = (body) => getJson(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, { method: 'POST', label: 'Google Analytics', headers: { Authorization: `Bearer ${token}` }, body });
  const metrics = [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'conversions' }, { name: 'engagementRate' }];
  const [tot, channels] = await Promise.all([
    run({ dateRanges: [{ startDate: cur.start, endDate: cur.end }, { startDate: prev.start, endDate: prev.end }], metrics }),
    run({ dateRanges: [{ startDate: cur.start, endDate: cur.end }], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'conversions' }], limit: 8, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] }),
  ]);
  // With two date ranges GA4 adds a dateRange dimension; rows come back per range.
  const byRange = {};
  for (const r of tot.rows || []) {
    const key = r.dimensionValues?.[0]?.value || 'date_range_0';
    byRange[key] = Object.fromEntries(metrics.map((m, i) => [m.name, Number(r.metricValues[i].value)]));
  }
  const shape = (v = {}) => ({ users: v.activeUsers || 0, sessions: v.sessions || 0, conversions: v.conversions || 0, engagement_rate: Math.round((v.engagementRate || 0) * 1000) / 10 });
  return {
    property: propertyId, period: cur, totals: shape(byRange.date_range_0), previous: shape(byRange.date_range_1),
    channels: (channels.rows || []).map((r) => ({ channel: r.dimensionValues[0].value, sessions: Number(r.metricValues[0].value), conversions: Number(r.metricValues[1].value) })),
  };
}
