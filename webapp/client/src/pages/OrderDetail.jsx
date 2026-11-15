import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Loader, Progress, Status } from '../components/ui.jsx';
import { billingLabel, date, money } from '../format.js';
import { useFetch } from '../useFetch.js';
import NotFound from './NotFound.jsx';

const STATUSES = ['pending', 'active', 'in_review', 'completed', 'cancelled'];

export default function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { isStaff, user } = useAuth();
  const { data: o, error, loading, reload } = useFetch(`/orders/${id}`);
  const [msg, setMsg] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading && !o) return <Loader />;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;

  const run = async (fn) => {
    setBusy(true); setActionError(null);
    try { await fn(); reload(); } catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const pay = (inv) => run(() => api(`/orders/${o.id}/invoices/${inv.id}/pay`, { method: 'POST' }));
  const send = (e) => { e.preventDefault(); if (msg.trim()) run(async () => { await api(`/orders/${o.id}/messages`, { method: 'POST', body: { body: msg } }); setMsg(''); }); };
  const update = (body) => run(() => api(`/orders/${o.id}`, { method: 'PATCH', body }));
  const toggle = (m) => run(() => api(`/orders/${o.id}/milestones/${m.id}`, { method: 'PATCH', body: { is_done: !m.is_done } }));
  const cancel = () => window.confirm('Cancel this engagement?') && run(() => api(`/orders/${o.id}/cancel`, { method: 'POST' }));

  const outstanding = o.invoices.filter((i) => i.status === 'unpaid');

  return (
    <section className="section portal">
      <div className="container">
        <nav className="breadcrumb breadcrumb--dark"><Link to={isStaff && o.user_id !== user.id ? '/admin/orders' : '/portal'}>Engagements</Link> / <span>{o.reference}</span></nav>
        {params.get('new') && o.status === 'pending' && (
          <div className="alert alert--success">🎉 Order placed! Pay the first invoice below to kick things off.</div>
        )}
        <ErrorBox error={actionError} />
        <div className="order-head card">
          <span className="order-row__icon">{o.service_icon}</span>
          <div className="order-head__main">
            <h1>{o.service_name} — {o.tier_name}</h1>
            <p className="muted">{o.reference} · {money(o.price_cents)} {billingLabel(o.billing)} · due {date(o.due_date)}{o.manager_name && ` · lead: ${o.manager_name}`}</p>
            <Progress value={o.progress} />
            <small className="muted">{o.progress}% complete</small>
          </div>
          <div className="order-head__side">
            <Status value={o.status} />
            {o.status === 'pending' && o.user_id === user.id && <button className="btn btn--text btn--sm" onClick={cancel} disabled={busy}>Cancel order</button>}
          </div>
        </div>

        {isStaff && (
          <div className="card staff-panel">
            <h3>Staff controls</h3>
            <p className="muted small">Client: {o.client_name} ({o.client_email}){o.client_company && `, ${o.client_company}`}</p>
            <div className="staff-panel__row">
              <label>Status
                <select className="input" value={o.status} onChange={(e) => update({ status: e.target.value })} disabled={busy}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label>Due date
                <input type="date" className="input" value={o.due_date || ''} onChange={(e) => update({ due_date: e.target.value || null })} disabled={busy} />
              </label>
              <button className="btn btn--outline btn--sm" disabled={busy} onClick={() => {
                const v = window.prompt('Invoice amount (in dollars)');
                const cents = Math.round(Number(v) * 100);
                if (cents > 0) run(() => api(`/orders/${o.id}/invoices`, { method: 'POST', body: { amount_cents: cents, due_in_days: 14 } }));
              }}>+ Issue invoice</button>
            </div>
          </div>
        )}

        <div className="grid grid--order">
          <div className="card">
            <h2>Milestones</h2>
            <ol className="milestones">
              {o.milestones.map((m) => (
                <li key={m.id} className={m.is_done ? 'done' : ''}>
                  {isStaff ? (
                    <label className="checkbox"><input type="checkbox" checked={!!m.is_done} onChange={() => toggle(m)} disabled={busy} /><span>{m.title}</span></label>
                  ) : (<><span className="milestones__dot" aria-hidden="true">{m.is_done ? '✓' : ''}</span>{m.title}</>)}
                  {m.done_at && <small>{date(m.done_at)}</small>}
                </li>
              ))}
            </ol>
            <h2 className="mt-lg">Brief</h2>
            <p className="brief">{o.brief}</p>
          </div>

          <div className="card">
            <h2>Invoices</h2>
            {outstanding.length > 0 && <p className="muted small">{money(outstanding.reduce((a, i) => a + i.amount_cents, 0))} outstanding</p>}
            <ul className="invoices">
              {o.invoices.map((inv) => (
                <li key={inv.id}>
                  <div><strong>{inv.number}</strong><small>Issued {date(inv.issued_at)} · due {date(inv.due_at)}</small></div>
                  <div className="invoices__side">
                    <span>{money(inv.amount_cents)}</span>
                    <Status value={inv.status} />
                    {inv.status === 'unpaid' && o.user_id === user.id && <button className="btn btn--primary btn--sm" onClick={() => pay(inv)} disabled={busy}>Pay now</button>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small">Payments are simulated in this build — connect Stripe, PayFast or Paystack in production.</p>
          </div>
        </div>

        <div className="card mt-lg">
          <h2>Messages</h2>
          <ul className="thread">
            {o.messages.length === 0 && <li className="muted">No messages yet. Say hello to your team!</li>}
            {o.messages.map((m) => (
              <li key={m.id} className={m.author_role === 'client' ? 'thread__client' : 'thread__staff'}>
                <div className="thread__meta"><strong>{m.author_name}</strong>{m.author_role !== 'client' && <span className="tag">Hipcastle</span>}<small>{date(m.created_at)}</small></div>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
          <form className="thread__form" onSubmit={send}>
            <textarea className="input" rows={3} placeholder="Write a message…" aria-label="Message" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button className="btn btn--primary" disabled={busy || !msg.trim()}>Send</button>
          </form>
        </div>
      </div>
    </section>
  );
}
