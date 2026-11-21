// Results on an engagement: uptime, speed & quality, Google search, visitors, development activity,
// ad performance (and, for staff, tender matches and emails from the client). Staff link the
// client's site, repository and accounts here.
import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { dateTime } from '../format.js';
import { ErrorBox, Field } from './ui.jsx';

const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-ZA'));
const delta = (cur, prev) => {
  if (!prev) return null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return <small className={d >= 0 ? 'delta delta--up' : 'delta delta--down'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}%</small>;
};
const Score = ({ label, v }) => <div className={`score score--${v == null ? 'na' : v >= 90 ? 'good' : v >= 50 ? 'ok' : 'bad'}`}><strong>{v ?? '—'}</strong><span>{label}</span></div>;
const Kpi = ({ label, value, prev, raw }) => <div className="kpi"><span>{label}</span><strong>{value}</strong>{delta(raw ?? 0, prev)}</div>;

function Report({ id, r }) {
  const d = r.data;
  if (!d) return <p className="muted small">No data yet{r.configured === false ? ' — this integration isn’t set up (Command Centre → Integrations).' : '.'}</p>;
  switch (id) {
    case 'monitor': return (
      <>
        <div className="kpis kpis--small">
          <Kpi label={`Uptime (${d.days} days)`} value={d.uptime_pct == null ? '—' : `${d.uptime_pct}%`} />
          <Kpi label="Avg response" value={d.avg_ms ? `${d.avg_ms} ms` : '—'} />
          <Kpi label="Status now" value={d.last ? (d.last.ok ? '🟢 Up' : '🔴 Down') : '—'} />
          <Kpi label="Certificate" value={d.last?.ssl_days != null ? `${d.last.ssl_days} days left` : '—'} />
        </div>
        {d.incidents.length > 0 && <ul className="small">{d.incidents.map((i) => <li key={i.started_at}>{i.resolved_at ? '✅' : '🔴'} Down {dateTime(`${i.started_at}Z`)}{i.resolved_at && ` → back ${dateTime(`${i.resolved_at}Z`)}`} {i.cause && `(${i.cause})`}</li>)}</ul>}
      </>
    );
    case 'pagespeed': return (
      <>
        <div className="scores">{Object.entries(d.scores).map(([k, v]) => <Score key={k} label={{ seo: 'SEO', 'best-practices': 'Best practices' }[k] || k} v={v} />)}</div>
        <p className="small">Mobile test: largest content loads in <strong>{d.lab.lcp || '—'}</strong>{d.field?.lcp_ms && <> (real visitors: {(d.field.lcp_ms / 1000).toFixed(1)} s)</>}. Layout shift {d.lab.cls || '—'}.</p>
        {d.fix_first.length > 0 && <><p className="small"><strong>Fix first:</strong></p><ul className="small">{d.fix_first.map((f) => <li key={f}>{f}</li>)}</ul></>}
      </>
    );
    case 'search_console': return (
      <>
        <div className="kpis kpis--small">
          <Kpi label="Clicks from Google" value={n(d.totals.clicks)} raw={d.totals.clicks} prev={d.previous.clicks} />
          <Kpi label="Times shown" value={n(d.totals.impressions)} raw={d.totals.impressions} prev={d.previous.impressions} />
          <Kpi label="Click rate" value={`${d.totals.ctr}%`} />
          <Kpi label="Avg position" value={d.totals.position ?? '—'} />
        </div>
        {d.top_queries.length > 0 && <table className="table table--compact"><thead><tr><th>Top searches</th><th>Clicks</th><th>Position</th></tr></thead>
          <tbody>{d.top_queries.slice(0, 8).map((q) => <tr key={q.query}><td>{q.query}</td><td>{q.clicks}</td><td>{q.position}</td></tr>)}</tbody></table>}
      </>
    );
    case 'ga4': return (
      <>
        <div className="kpis kpis--small">
          <Kpi label="Visitors" value={n(d.totals.users)} raw={d.totals.users} prev={d.previous.users} />
          <Kpi label="Visits" value={n(d.totals.sessions)} raw={d.totals.sessions} prev={d.previous.sessions} />
          <Kpi label="Conversions" value={n(d.totals.conversions)} raw={d.totals.conversions} prev={d.previous.conversions} />
          <Kpi label="Engaged" value={`${d.totals.engagement_rate}%`} />
        </div>
        {d.channels.length > 0 && <p className="small">Where visits came from: {d.channels.map((c) => `${c.channel} ${n(c.sessions)}`).join(' · ')}</p>}
      </>
    );
    case 'github': return (
      <>
        <p className="small"><strong>{d.commits_30d}</strong> code changes in the last 30 days{d.releases[0] && <> · latest release <strong>{d.releases[0].name}</strong></>}</p>
        <ul className="small">{d.recent_commits.slice(0, 5).map((c) => <li key={c.sha}><code>{c.sha}</code> {c.message} <span className="muted">— {dateTime(c.date)}</span></li>)}</ul>
        {d.pull_requests.length > 0 && <p className="small muted">Recent work: {d.pull_requests.slice(0, 4).map((p) => `#${p.number} ${p.title} (${p.state})`).join(' · ')}</p>}
      </>
    );
    case 'meta_ads': return (
      <>
        <div className="kpis kpis--small">
          <Kpi label="Spend (30 days)" value={`R${n(Math.round(d.totals.spend))}`} />
          <Kpi label="People reached" value={n(d.totals.reach)} />
          <Kpi label="Clicks" value={`${n(d.totals.clicks)} (${d.totals.ctr}%)`} />
          <Kpi label="Leads" value={`${n(d.totals.leads)}${d.totals.cost_per_lead ? ` · R${d.totals.cost_per_lead} each` : ''}`} />
        </div>
        {d.campaigns.length > 0 && <table className="table table--compact"><thead><tr><th>Campaign</th><th>Spend</th><th>Clicks</th><th>Leads</th></tr></thead>
          <tbody>{d.campaigns.map((c) => <tr key={c.name}><td>{c.name}</td><td>R{n(Math.round(c.spend))}</td><td>{n(c.clicks)}</td><td>{c.leads}</td></tr>)}</tbody></table>}
      </>
    );
    case 'tenders': return d.matches.length ? (
      <ul className="small">{d.matches.slice(0, 8).map((t) => <li key={t.ocid}><a href={t.url} target="_blank" rel="noreferrer">{t.title}</a> — {t.buyer}{t.closing_at && <>, closes {dateTime(t.closing_at)}</>}</li>)}</ul>
    ) : <p className="muted small">No open tenders match “{d.keywords}” yet.</p>;
    default: return null;
  }
}

const LINKS = [
  ['site_url', 'Website URL', 'https://client.co.za — uptime monitoring & PageSpeed'],
  ['github_repo', 'GitHub repository', 'owner/name'],
  ['gsc_property', 'Search Console property', 'https://client.co.za/ or sc-domain:client.co.za'],
  ['ga4_property', 'GA4 property ID', 'e.g. 312345678'],
  ['meta_ad_account', 'Meta ad account ID', 'e.g. 1234567890'],
  ['tender_keywords', 'Tender keywords', 'e.g. security, guarding, cleaning'],
];

export default function EngagementReports({ order, isStaff }) {
  const { data, error, loading, setData } = useFetch(`/engagements/${order.id}`);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(null);
  if (loading && !data) return null;
  if (error) return isStaff ? <ErrorBox error={error} /> : null;
  const entries = Object.entries(data.reports);
  if (!isStaff && !entries.some(([, r]) => r.data)) return null;
  const run = async (label, fn) => { setBusy(label); setErr(null); try { setData(await fn()); } catch (e) { setErr(e); } finally { setBusy(''); } };
  const f = form || Object.fromEntries(LINKS.map(([k]) => [k, data.links[k] || '']));

  return (
    <section className="card engagement-reports" aria-labelledby="results-h">
      <h2 id="results-h">📊 Results &amp; monitoring</h2>
      <ErrorBox error={err} />
      {isStaff && (
        <details open={!entries.length}>
          <summary><strong>Linked accounts</strong> <span className="muted small">— staff only</span></summary>
          <form className="form design-brief" onSubmit={(e) => { e.preventDefault(); run('links', async () => { const d = await api(`/engagements/${order.id}/links`, { method: 'PUT', body: f }); setForm(null); return d; }); }}>
            {LINKS.map(([k, label, hint]) => <Field key={k} label={label} hint={hint}><input className="input" value={f[k]} onChange={(e) => setForm({ ...f, [k]: e.target.value })} /></Field>)}
            <div className="form__actions"><button className="btn btn--primary btn--sm" disabled={Boolean(busy)}>{busy === 'links' ? 'Saving…' : 'Save links'}</button></div>
          </form>
        </details>
      )}
      <div className="report-grid">
        {entries.map(([id, r]) => (
          <article key={id} className="report">
            <header>
              <h3>{r.label}</h3>
              <span className="muted small">{r.updated_at ? `Updated ${dateTime(`${r.updated_at}Z`)}` : ''}</span>
              {isStaff && id !== 'monitor' && <button className="btn--link small" disabled={Boolean(busy)} onClick={() => run(id, () => api(`/engagements/${order.id}/reports/${id}/refresh`, { method: 'POST' }))}>{busy === id ? 'Refreshing…' : 'Refresh'}</button>}
              {isStaff && id === 'monitor' && <button className="btn--link small" disabled={Boolean(busy)} onClick={() => run(id, () => api(`/engagements/${order.id}/monitor/check`, { method: 'POST' }))}>{busy === id ? 'Checking…' : 'Check now'}</button>}
            </header>
            {isStaff && r.last_error && <p className="text-error small">Last refresh failed: {r.last_error}</p>}
            <Report id={id} r={r} />
          </article>
        ))}
      </div>
      {isStaff && data.inbox?.length > 0 && (
        <details>
          <summary><strong>Emails from this client</strong> <span className="muted small">(Microsoft 365 inbox)</span></summary>
          <ul className="small">{data.inbox.map((m) => <li key={m.received_at + m.subject}><strong>{m.subject}</strong> — {m.preview?.slice(0, 140)} <span className="muted">({dateTime(m.received_at)})</span></li>)}</ul>
        </details>
      )}
    </section>
  );
}
