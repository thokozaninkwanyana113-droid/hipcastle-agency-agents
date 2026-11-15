import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { dateTime, timeAgo } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { LiveDot, PanelHead, usePolling } from './shared.jsx';

const fmtUptime = (s) => `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
const Flag = ({ ok, children }) => <span className={`flag ${ok ? 'flag--ok' : 'flag--off'}`}>{ok ? '●' : '○'} {children}</span>;

export default function System() {
  const { user } = useAuth();
  const { data: s, error, loading, reload } = useFetch('/admin/system');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  usePolling(reload, 10000);
  if (loading && !s) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const act = async (id, fn) => { setBusy(id); setErr(null); try { await fn(); reload(); } catch (e) { setErr(e); } finally { setBusy(null); } };
  const m = s.metrics;
  const admin = user.role === 'admin';
  return (
    <>
      <PanelHead title="System & processes" sub="Health, performance, payment gateways and background jobs."><LiveDot /></PanelHead>
      <ErrorBox error={err} />
      <div className="kpis">
        <div className="kpi"><span>Status</span><strong className="text-success">● {s.status}</strong><small>{s.env} · Node {s.node}</small></div>
        <div className="kpi"><span>Uptime</span><strong>{fmtUptime(s.uptime_s)}</strong><small>{s.memory_mb.rss} MB memory</small></div>
        <div className="kpi"><span>API (last 5 min)</span><strong>{m.last_5m.requests} req</strong><small>avg {m.last_5m.avg_ms} ms · p95 {m.last_5m.p95_ms} ms</small></div>
        <div className="kpi"><span>Errors (last hour)</span><strong className={m.last_60m.errors_5xx ? 'text-error' : ''}>{m.last_60m.errors_5xx}</strong><small>{m.last_60m.errors_4xx} client errors (4xx)</small></div>
      </div>

      {s.warnings.length > 0 && (
        <div className="card">
          <h3>Configuration checks</h3>
          <ul className="checks">{s.warnings.map((w) => <li key={w.message} className={`checks__${w.level}`}>{w.level === 'error' ? '⛔' : w.level === 'warn' ? '⚠️' : 'ℹ️'} {w.message}</li>)}</ul>
        </div>
      )}

      <div className="grid grid--order">
        <div className="card">
          <h3>Payment gateways <span className="tag">{s.gateways.mode}</span></h3>
          <div className="gateway">
            <div className="gateway__head"><strong>PayFast</strong>
              <Flag ok={s.gateways.payfast.configured}>configured</Flag><Flag ok={s.gateways.payfast.enabled}>enabled</Flag></div>
            <small className="muted">Host {s.gateways.payfast.host}{s.gateways.payfast.sandbox_defaults && ' · shared sandbox account'} · remote validation {s.gateways.payfast.validate_remote ? 'on' : 'off'} · IP check {s.gateways.payfast.check_ip ? 'on' : 'off'}</small>
            <code className="code-line">{s.gateways.payfast.notify_url}</code>
          </div>
          <div className="gateway">
            <div className="gateway__head"><strong>Ozow</strong>
              <Flag ok={s.gateways.ozow.configured}>configured</Flag><Flag ok={s.gateways.ozow.enabled}>enabled</Flag></div>
            <small className="muted">{s.gateways.ozow.is_test ? 'Test mode' : 'Live'} · API double-check {s.gateways.ozow.api_check ? 'on' : 'off (set OZOW_API_KEY)'}</small>
            <code className="code-line">{s.gateways.ozow.notify_url}</code>
          </div>
          {s.gateways.simulated && <p className="muted small">Simulated test payments enabled (non-production only).</p>}
          <p className="muted small">Enable/disable gateways for customers in Settings. Credentials are set with environment variables.</p>
        </div>
        <div className="card">
          <h3>Database</h3>
          <p className="muted small">{s.db.path} · {s.db.size_kb.toLocaleString('en-ZA')} KB</p>
          <table className="table table--compact"><tbody>
            {Object.entries(s.db.tables).map(([t, n]) => <tr key={t}><th>{t.replace(/_/g, ' ')}</th><td>{n.toLocaleString('en-ZA')}</td></tr>)}
          </tbody></table>
        </div>
      </div>

      <div className="card mt-lg">
        <h3>Background processes</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Process</th><th>Schedule</th><th>Last run</th><th>Result</th><th>Next run</th><th>Controls</th></tr></thead>
            <tbody>
              {s.jobs.map((j) => (
                <tr key={j.id}>
                  <td><strong>{j.name}</strong><small>{j.description}</small></td>
                  <td>Every {j.every_minutes >= 60 ? `${j.every_minutes / 60}h` : `${j.every_minutes}m`}</td>
                  <td>{j.running ? <span className="tag">running…</span> : j.last_run_at ? <>{timeAgo(j.last_run_at)}<small>{j.last_duration_ms} ms</small></> : 'Not yet'}</td>
                  <td>{j.last_error ? <span className="text-error">{j.last_error}</span> : j.last_result || '—'}</td>
                  <td>{j.enabled ? dateTime(j.next_run_at) : <span className="tag">paused</span>}</td>
                  <td className="nowrap">
                    {admin ? (
                      <>
                        <button className="btn btn--outline btn--sm" disabled={busy === j.id} onClick={() => act(j.id, () => api(`/admin/jobs/${j.id}/run`, { method: 'POST' }))}>Run now</button>{' '}
                        <button className="btn btn--text btn--sm" onClick={() => act(`${j.id}-t`, () => api(`/admin/jobs/${j.id}`, { method: 'PATCH', body: { enabled: !j.enabled } }))}>{j.enabled ? 'Pause' : 'Resume'}</button>
                      </>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid--order mt-lg">
        <div className="card">
          <h3>Busiest API routes</h3>
          <table className="table table--compact">
            <thead><tr><th>Route</th><th>Calls</th><th>Avg</th><th>5xx</th></tr></thead>
            <tbody>{m.top_routes.map((r) => <tr key={r.route}><td><code>{r.route}</code></td><td>{r.count}</td><td>{r.avg_ms} ms</td><td className={r.errors ? 'text-error' : ''}>{r.errors}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <h3>Recent server errors</h3>
          {m.recent_errors.length === 0 ? <p className="muted">No errors since the last restart. 🎉</p> : (
            <ul className="feed">{m.recent_errors.map((e, i) => <li key={i} className="feed__item feed__item--error"><span><code>{e.method} {e.path}</code> {e.message}</span><small>{timeAgo(e.at)}</small></li>)}</ul>
          )}
        </div>
      </div>
    </>
  );
}
