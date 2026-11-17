import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { dateTime } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { LiveDot, PanelHead, StatusFilter, usePolling } from './shared.jsx';
import { siteUrl } from '../../siteUrl.js';

// Real emails load the logo from the live domain; previews load it from this server.
const localAssets = (html) => html.replaceAll(siteUrl('/logo.png'), `${window.location.origin}/logo.png`);

const STATUS_CLASS = { sent: 'completed', logged: 'active', queued: 'pending', failed: 'cancelled', cancelled: 'cancelled' };

function Preview({ title, html, text, onClose }) {
  const [mode, setMode] = useState('html');
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal__card modal__card--wide">
        <div className="cc-panel-head">
          <div><h2 className="h3">{title}</h2></div>
          <div className="cc-panel-head__actions">
            <button className={`chip ${mode === 'html' ? 'chip--active' : ''}`} onClick={() => setMode('html')}>HTML</button>
            <button className={`chip ${mode === 'text' ? 'chip--active' : ''}`} onClick={() => setMode('text')}>Plain text</button>
            <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
          </div>
        </div>
        {mode === 'html'
          ? <iframe title="Email preview" className="email-frame" sandbox="" srcDoc={localAssets(html)} />
          : <pre className="code-block code-block--light">{text}</pre>}
      </div>
    </div>
  );
}

export default function Emails() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data: info, reload: reloadInfo } = useFetch('/admin/emails/status');
  const { data, error, loading, reload } = useFetch(`/admin/emails?status=${status}&q=${encodeURIComponent(q)}`);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);
  const [testTo, setTestTo] = useState(user.email);
  const [busy, setBusy] = useState('');
  usePolling(reload);
  usePolling(reloadInfo, 30000);

  const run = async (key, fn) => { setBusy(key); setMsg(null); try { await fn(); } catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(''); reload(); reloadInfo(); } };
  const open = (e) => run(`o${e.id}`, async () => { const full = await api(`/admin/emails/${e.id}`); setPreview({ title: full.subject, html: full.html, text: full.text }); });
  const openTpl = (t) => run(`t${t.id}`, async () => { const r = await api(`/admin/email-templates/${t.id}/preview`); setPreview({ title: `${r.subject} (sample)`, html: r.html, text: r.text }); });
  // Deep link from the Communications plan: /admin/emails?preview=<template>
  const [params] = useSearchParams();
  useEffect(() => { const t = params.get('preview'); if (t) openTpl({ id: t }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const verify = () => run('verify', async () => { const r = await api('/admin/emails/verify', { method: 'POST' }); setMsg({ error: !r.ok, text: r.message }); });
  const test = (e) => { e.preventDefault(); run('test', async () => { const r = await api('/admin/emails/test', { method: 'POST', body: { to: testTo } }); setMsg({ error: r.status === 'failed', text: r.status === 'sent' ? `Test email sent to ${testTo} ✓` : r.status === 'logged' ? 'Test email logged (SMTP not configured) — open it below to preview.' : `Status: ${r.status} ${r.last_error || ''}` }); }); };
  const retry = (e) => run(`r${e.id}`, () => api(`/admin/emails/${e.id}/retry`, { method: 'POST' }));

  const c = info?.config;
  return (
    <>
      <PanelHead title="Emails" sub="Every email the system sends — from hello@hipcastle.agency — with delivery status, previews and retries."><LiveDot /></PanelHead>
      {msg && <div className={`alert ${msg.error ? 'alert--error' : 'alert--success'}`} role="status">{msg.text}</div>}
      {!info ? <Loader /> : (
        <>
          <div className="kpis">
            <div className="kpi"><span>Delivery mode</span><strong className={c.mode === 'smtp' ? 'text-success' : ''}>{c.mode === 'smtp' ? '● SMTP' : '○ Log only'}</strong><small>{c.mode === 'smtp' ? `${c.host}:${c.port}${c.secure ? ' (TLS)' : ''}` : 'Set SMTP_HOST to deliver'}</small></div>
            <div className="kpi"><span>Sent (24h)</span><strong>{info.stats.sent_24h}</strong><small>{info.stats.logged_24h} logged</small></div>
            <div className="kpi"><span>Queued</span><strong>{info.stats.queued}</strong><small>retried automatically</small></div>
            <div className="kpi"><span>Failed (7 days)</span><strong className={info.stats.failed_7d ? 'text-error' : ''}>{info.stats.failed_7d}</strong></div>
          </div>
          <div className="grid grid--order">
            <div className="card">
              <h3>Sending identity</h3>
              <table className="table table--compact"><tbody>
                <tr><th>From</th><td><code>{c.from}</code></td></tr>
                <tr><th>Team alerts to</th><td>{info.settings.notify_email}</td></tr>
                <tr><th>Billing replies to</th><td>{info.settings.billing_email}</td></tr>
                <tr><th>Customer emails</th><td>{info.settings.emails_enabled ? 'On' : <span className="text-error">Paused</span>}</td></tr>
                <tr><th>SMTP user</th><td>{c.user || '—'} {c.user && (c.hasPassword ? '· password set' : <span className="text-error">· no password</span>)}</td></tr>
              </tbody></table>
              <p className="muted small">Change addresses in Settings. SMTP credentials are environment variables. For inbox delivery, publish SPF, DKIM and DMARC DNS records for hipcastle.agency (see README).</p>
              {admin && (
                <div className="stack">
                  <button className="btn btn--outline btn--sm" onClick={verify} disabled={busy === 'verify'}>{busy === 'verify' ? 'Checking…' : 'Check SMTP connection'}</button>
                  <form className="inline-form" onSubmit={test}>
                    <input className="input input--sm" type="email" required aria-label="Test recipient" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                    <button className="btn btn--primary btn--sm" disabled={busy === 'test'}>Send test</button>
                  </form>
                </div>
              )}
            </div>
            <div className="card">
              <h3>Templates ({info.templates.length})</h3>
              <ul className="tpl-list">
                {info.templates.map((t) => (
                  <li key={t.id}>
                    <button className="btn--link" onClick={() => openTpl(t)}><strong>{t.description}</strong></button>
                    <small><code>{t.id}</code> · to {t.audience}</small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      <h3 className="mt-lg">Outbox</h3>
      <div className="toolbar">
        <input type="search" className="input" placeholder="Search recipient or subject…" aria-label="Search emails" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <StatusFilter value={status} onChange={setStatus} options={['sent', 'logged', 'queued', 'failed']} label="Email status" />
      <ErrorBox error={error} />
      {loading && !data && <Loader />}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Created</th><th>To</th><th>Subject</th><th>Template</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{dateTime(e.created_at)}</td>
                <td>{e.to_name || e.to_email}{e.to_name && <small>{e.to_email}</small>}</td>
                <td><button className="btn--link" onClick={() => open(e)}>{e.subject}</button>{e.ref && <small>{e.ref}</small>}</td>
                <td><code>{e.template}</code></td>
                <td>
                  <span className={`status status--${STATUS_CLASS[e.status]}`}>{e.status}</span>
                  {e.attempts > 1 && <small>{e.attempts} attempts</small>}
                  {e.last_error && <small className="text-error">{e.last_error}</small>}
                </td>
                <td className="nowrap">
                  <button className="btn btn--text btn--sm" onClick={() => open(e)}>Preview</button>
                  {admin && e.status !== 'queued' && <button className="btn btn--text btn--sm" onClick={() => retry(e)} disabled={busy === `r${e.id}`}>{e.status === 'failed' ? 'Retry' : 'Resend'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="empty">No emails yet.</p>}
      </div>
      {preview && <Preview {...preview} onClose={() => setPreview(null)} />}
    </>
  );
}
