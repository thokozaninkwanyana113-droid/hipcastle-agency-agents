// Command Centre → Integrations: delivery integrations, Xero, accountant exports, booking, agreements,
// the credential guard and the government tender feed.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getToken } from '../../api.js';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { useFetch } from '../../useFetch.js';
import { dateTime } from '../../format.js';
import { PanelHead } from './shared.jsx';

/** Delivery integrations: one card per service, with status, cost, what it does and how to set it up. */
function DeliveryIntegrations({ services }) {
  const ready = services.filter((s) => s.configured).length;
  return (
    <section className="card">
      <h3>🔌 Delivery integrations <small className="muted">· {ready} of {services.length} ready</small></h3>
      <p className="muted small">These power client reports and alerts on each engagement (link them on the engagement page). Secrets are set on the server (e.g. <code>fly secrets set NAME=value</code>), never pasted into the app or chat.</p>
      <div className="integration-grid">
        {services.map((s) => (
          <details key={s.id} className="integration-tile">
            <summary>
              <span><strong>{s.name}</strong><small className="muted"> {s.services.join(' · ')}</small></span>
              <span className={`status status--${s.configured ? 'paid' : 'pending'}`}>{s.configured ? 'Ready' : 'Not set up'}</span>
            </summary>
            <p className="small">{s.what}</p>
            <p className="small muted">Cost: {s.cost}</p>
            {s.env.length > 0 && <p className="small">Secrets: {s.env.map((e) => <code key={e}>{e}</code>).reduce((a, b) => [a, ', ', b])}</p>}
            <ol className="setup-steps small">{s.setup.map((step) => <li key={step}>{step}</li>)}</ol>
          </details>
        ))}
      </div>
    </section>
  );
}

function TenderBrowser() {
  const [q, setQ] = useState('');
  const { data, error, reload } = useFetch(`/admin/integrations/tenders?q=${encodeURIComponent(q)}`);
  return (
    <section className="card">
      <h3>📑 Open government tenders</h3>
      <p className="muted small">From the National Treasury eTender Portal, refreshed daily. Matches for Sales &amp; Tenders clients are emailed to the team.</p>
      <div className="filters-row"><input className="input input--sm" placeholder="Search title, description or buyer" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reload()} /></div>
      <ErrorBox error={error} />
      {data?.length ? (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Closes</th><th>Tender</th><th>Buyer</th></tr></thead>
          <tbody>{data.slice(0, 50).map((t) => (
            <tr key={t.ocid}><td className="nowrap">{t.closing_at ? dateTime(t.closing_at) : '—'}</td>
              <td><a href={t.url} target="_blank" rel="noreferrer">{t.title}</a>{t.description && <div className="muted small">{t.description.slice(0, 160)}</div>}</td><td>{t.buyer}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <p className="empty">No open tenders loaded yet — they arrive with the daily “Government tenders” job (Command Centre → System &amp; processes).</p>}
    </section>
  );
}

function Download({ kind, label }) {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-03-01`); // SA tax year starts 1 March
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    const res = await fetch(`/api/admin/integrations/export/${kind}?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'Export failed'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = `hipcastle-invoices-${kind}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="export-row">
      <strong>{label}</strong>
      <label>From <input className="input input--sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>To <input className="input input--sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button className="btn btn--outline btn--sm" onClick={go}>⬇ Download CSV</button>
      {err && <small className="text-error">{err}</small>}
    </div>
  );
}

export default function Integrations() {
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useFetch('/admin/integrations');
  const { data: settings, reload: reloadSettings } = useFetch('/admin/settings');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (settings) setForm({
      xero_sales_account: settings.xero_sales_account, xero_bank_account: settings.xero_bank_account, xero_tax_type: settings.xero_tax_type,
      accounting_sync_from: settings.accounting_sync_from, booking_url: settings.booking_url,
      agreement_min: String((settings.agreement_min_cents || 0) / 100), agreement_for_retainers: settings.agreement_for_retainers,
      secure_share_hint: settings.secure_share_hint,
    });
  }, [settings]);
  const act = async (fn, ok) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try { const r = await fn(); setMsg({ ok: typeof ok === 'function' ? ok(r) : ok, err: '' }); reload(); reloadSettings(); }
    catch (e) { setMsg({ ok: '', err: Object.values(e.fields || {})[0] || e.message }); }
    setBusy(false);
  };
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const x = data.xero;
  const flag = params.get('xero');
  const save = (e) => {
    e.preventDefault();
    const { agreement_min, ...rest } = form;
    act(() => api('/admin/settings', { method: 'PUT', body: { ...rest, agreement_min_cents: Math.round(Number(agreement_min || 0) * 100) } }), 'Saved.');
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <>
      <PanelHead title="Integrations" sub="Accounting, booking, agreements and security settings for the services Hipcastle runs on." />
      {flag === 'connected' && <div className="alert alert--success">✅ Xero connected. New invoices and payments will sync every 15 minutes.</div>}
      {flag === 'error' && <div className="alert alert--error">Xero connection failed: {params.get('reason')}</div>}
      {msg.ok && <div className="alert alert--success">{msg.ok}</div>}
      {msg.err && <div className="alert alert--error">{msg.err}</div>}

      {data.services && <DeliveryIntegrations services={data.services} />}

      <div className="card integration">
        <div className="integration__head">
          <div><h3>📒 Xero — accounting</h3><p className="muted small">Pushes every invoice (as a tax invoice), payment and void to Xero, with the client as a contact. Your accountant reconciles PayFast/Ozow payouts against them in Xero.</p></div>
          <span className={`status status--${x.connected ? 'paid' : 'pending'}`}>{x.connected ? 'Connected' : x.configured ? 'Not connected' : 'Not set up'}</span>
        </div>
        {!x.configured && (
          <ol className="setup-steps">
            <li>At <a href="https://developer.xero.com/app/manage" target="_blank" rel="noreferrer">developer.xero.com</a> create a <strong>Web app</strong>, with redirect URI <code>{x.redirect_uri}</code>.</li>
            <li>Add its client ID and secret as the <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code> secrets, and redeploy.</li>
            <li>Come back here and press <strong>Connect Xero</strong>.</li>
          </ol>
        )}
        {x.configured && !x.connected && <button className="btn btn--primary" disabled={busy} onClick={() => act(async () => { const r = await api('/admin/integrations/xero/connect', { method: 'POST' }); window.location.href = r.url; }, 'Redirecting to Xero…')}>Connect Xero</button>}
        {x.connected && (
          <>
            <p>Organisation: <strong>{x.organisation}</strong> · connected {dateTime(x.since)} · {x.synced.invoices} invoices and {x.synced.payments} payments synced.</p>
            <div className="form__actions">
              <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => act(() => api('/admin/integrations/xero/sync', { method: 'POST', body: {} }), (r) => r.result)}>Sync now</button>
              {x.failures.length > 0 && <button className="btn btn--outline btn--sm" disabled={busy} onClick={() => act(() => api('/admin/integrations/xero/sync', { method: 'POST', body: { retry_failed: true } }), (r) => r.result)}>Retry failed</button>}
              <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => window.confirm('Disconnect Xero? Nothing already in Xero is deleted.') && act(() => api('/admin/integrations/xero', { method: 'DELETE' }), 'Xero disconnected.')}>Disconnect</button>
            </div>
            {x.failures.length > 0 && (
              <div className="table-wrap mt"><table className="table"><thead><tr><th>Invoice</th><th>Step</th><th>Error</th><th>Attempts</th></tr></thead>
                <tbody>{x.failures.map((f) => <tr key={`${f.number}-${f.entity}`}><td>{f.number}</td><td>{f.entity}</td><td className="w-message">{f.error}</td><td>{f.attempts}/5</td></tr>)}</tbody></table></div>
            )}
          </>
        )}
      </div>

      <div className="card integration">
        <h3>🧾 Exports for your accountant</h3>
        <p className="muted small">For Sage Business Cloud, Xero (without connecting) or any accounting package. The SA tax year runs from 1 March.</p>
        <Download kind="xero" label="Xero sales-invoice import" />
        <Download kind="sage" label="Sage / general CSV" />
      </div>

      {form && (
        <form className="card integration form" onSubmit={save}>
          <h3>⚙️ Settings</h3>
          <h4>Xero account codes</h4>
          <div className="form__row form__row--3">
            <label className="field"><span className="field__label">Sales account</span><input className="input" value={form.xero_sales_account} onChange={set('xero_sales_account')} /></label>
            <label className="field"><span className="field__label">Bank account (payouts)</span><input className="input" value={form.xero_bank_account} onChange={set('xero_bank_account')} /></label>
            <label className="field"><span className="field__label">Tax type (15% sales)</span><input className="input" value={form.xero_tax_type} onChange={set('xero_tax_type')} /></label>
          </div>
          <label className="field"><span className="field__label">Only sync invoices issued from (optional)</span><input className="input" type="date" value={form.accounting_sync_from} onChange={set('accounting_sync_from')} /></label>
          <h4>📅 Online booking for the free strategy session</h4>
          <label className="field"><span className="field__label">Booking page link — Cal.com, Calendly or Microsoft Bookings (included in Microsoft 365)</span>
            <input className="input" type="url" placeholder="https://cal.com/hipcastle/strategy-session" value={form.booking_url} onChange={set('booking_url')} /></label>
          <p className="muted small">Shown on the Contact page and in the enquiry auto-reply email. Cal.com and Calendly open inline; Microsoft Bookings opens in a new tab.</p>
          <h4>✍️ Service agreements</h4>
          <div className="form__row">
            <label className="field"><span className="field__label">Signature required for once-off packages from (R)</span><input className="input" type="number" min="0" step="500" value={form.agreement_min} onChange={set('agreement_min')} /></label>
            <label className="checkbox"><input type="checkbox" checked={!!form.agreement_for_retainers} onChange={set('agreement_for_retainers')} /><span>Also require a signature for monthly retainers</span></label>
          </div>
          <p className="muted small">Smaller orders and care plans are covered by the terms the client accepts at checkout. Have the agreement template (server/src/agreements.js) reviewed by your attorney.</p>
          <h4>🔐 Credential guard</h4>
          <label className="field"><span className="field__label">What clients are told when a password, card or ID number is removed</span><textarea className="input" rows={2} value={form.secure_share_hint} onChange={set('secure_share_hint')} /></label>
          <p className="muted small">Your team should keep client logins in a shared password manager vault (Bitwarden Teams or 1Password Business), never in email, WhatsApp or this system.</p>
          <button className="btn btn--primary" disabled={busy}>Save settings</button>
        </form>
      )}
      <TenderBrowser />
    </>
  );
}
