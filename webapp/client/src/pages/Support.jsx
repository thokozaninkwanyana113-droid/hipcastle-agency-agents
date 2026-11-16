// Client portal → Support: open tickets, threaded replies, resolve/reopen and rate the help.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { ErrorBox, Field, Loader, Status } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';
import { api } from '../api.js';
import { dateTime, timeAgo } from '../format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { CareUsage } from '../components/Care.jsx';

export const RESPONSE = { urgent: '4 business hours', high: '1 business day', normal: '2 business days', low: '3 business days' };
const CATEGORIES = [['project', 'My project / deliverables'], ['billing', 'Invoices & payments'], ['technical', 'Website or technical issue'], ['account', 'Account & login'], ['other', 'Something else']];

export function PriorityBadge({ value }) {
  return <span className={`prio prio--${value}`}>{value}</span>;
}

function NewTicket({ orders, onCreated }) {
  const [f, setF] = useState({ subject: '', category: 'project', priority: 'normal', order_id: '', body: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const t = await api('/support', { method: 'POST', body: { ...f, order_id: f.order_id ? Number(f.order_id) : null } });
      onCreated(t);
    } catch (ex) { setErr(ex); }
    setBusy(false);
  };
  return (
    <form className="card form ticket-form" onSubmit={submit}>
      <h2>Open a support ticket</h2>
      <ErrorBox error={err} />
      <Field label="Subject" error={err?.fields?.subject}><input required minLength={5} maxLength={140} value={f.subject} onChange={set('subject')} placeholder="e.g. Contact form not sending emails" /></Field>
      <div className="form__row">
        <Field label="Topic"><select value={f.category} onChange={set('category')}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Priority" hint={`First response within ${RESPONSE[f.priority]}`}>
          <select value={f.priority} onChange={set('priority')}>
            <option value="low">Low — a question, no rush</option>
            <option value="normal">Normal</option>
            <option value="high">High — affecting my business</option>
            <option value="urgent">Urgent — site down / can’t trade</option>
          </select>
        </Field>
      </div>
      {orders?.length > 0 && (
        <Field label="Related engagement (optional)">
          <select value={f.order_id} onChange={set('order_id')}>
            <option value="">Not about a specific engagement</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.reference} — {o.service_name} ({o.tier_name})</option>)}
          </select>
        </Field>
      )}
      <Field label="Describe the issue" error={err?.fields?.body} hint="What happened, what you expected, and any links or steps to reproduce. Never include passwords or card details.">
        <textarea required minLength={10} maxLength={5000} rows={6} value={f.body} onChange={set('body')} />
      </Field>
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Sending…' : 'Submit ticket'}</button>
    </form>
  );
}

export function SupportList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: tickets, error, loading } = useFetch('/support');
  const { data: orders } = useFetch('/orders');
  const [creating, setCreating] = useState(false);
  const mine = tickets?.filter((t) => t.user_id === user.id) ?? [];
  const myOrders = orders?.filter((o) => o.user_id === user.id);
  return (
    <section className="section portal">
      <Seo title="Support" noindex />
      <div className="container">
        <div className="portal__head">
          <div><span className="eyebrow"><Link to="/portal">Client portal</Link> / Support</span><h1>Support</h1></div>
          <div className="portal__actions">
            <Link to="/help" className="btn btn--ghost">Help Centre</Link>
            {!creating && <button className="btn btn--primary" onClick={() => setCreating(true)}>New ticket</button>}
          </div>
        </div>
        <p className="muted">Response targets: urgent within {RESPONSE.urgent}, high within {RESPONSE.high}, normal within {RESPONSE.normal}. You’ll get an email whenever we reply. Clients on a <Link to="/care">care plan</Link> get their plan’s faster response automatically.</p>
        {creating && <NewTicket orders={myOrders} onCreated={(t) => nav(`/portal/support/${t.id}`)} />}
        {loading && <Loader />}
        <ErrorBox error={error} />
        {tickets && mine.length === 0 && !creating && (
          <div className="card empty-state"><span>🎧</span><h2>No support tickets</h2><p>Questions, bugs or billing queries — open a ticket and we’ll take it from there.</p>
            <button className="btn btn--primary" onClick={() => setCreating(true)}>Open a ticket</button></div>
        )}
        <div className="ticket-list">
          {mine.map((t) => (
            <Link key={t.id} to={`/portal/support/${t.id}`} className="card ticket-row">
              <div className="ticket-row__main">
                <strong>{t.subject}</strong>
                <small>{t.reference} · {t.category}{t.order_ref ? ` · ${t.order_ref}` : ''} · updated {timeAgo(t.updated_at)}</small>
              </div>
              {t.care_ref && <span className="care-pill" title="Covered by your care plan">🛟 Care</span>}
              <PriorityBadge value={t.priority} />
              <Status value={t.status === 'pending_client' ? 'awaiting_you' : t.status} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Csat({ ticket, onDone }) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(null);
  if (ticket.csat_score) return <p className="csat__done">You rated this help <strong>{ticket.csat_score}/5</strong>. Thank you!</p>;
  const submit = async (e) => {
    e.preventDefault();
    try { onDone(await api(`/support/${ticket.id}/csat`, { method: 'POST', body: { score, comment } })); } catch (ex) { setErr(ex); }
  };
  return (
    <form id="rate" className="card csat" onSubmit={submit}>
      <h2>How did we do?</h2>
      <div className="csat__stars" role="radiogroup" aria-label="Rate the help from 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={score === n} aria-label={`${n} out of 5`} className={n <= score ? 'is-on' : ''} onClick={() => setScore(n)}>★</button>
        ))}
      </div>
      <textarea rows={2} maxLength={1000} placeholder="Anything we could do better? (optional)" aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      <ErrorBox error={err} />
      <button className="btn btn--primary btn--sm" disabled={!score}>Send rating</button>
    </form>
  );
}

export function SupportTicket() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: t, error, loading, setData } = useFetch(`/support/${id}`);
  const [reply, setReply] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn) => { setBusy(true); setErr(null); try { setData(await fn()); } catch (ex) { setErr(ex); } setBusy(false); };
  if (loading) return <Loader />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;
  const closed = t.status === 'closed';
  return (
    <section className="section portal">
      <Seo title={`${t.reference} — Support`} noindex />
      <div className="container container--narrow">
        <span className="eyebrow"><Link to="/portal/support">Support</Link> / {t.reference}</span>
        <h1 className="ticket__title">{t.subject}</h1>
        <div className="ticket__meta">
          <Status value={t.status === 'pending_client' ? 'awaiting_you' : t.status} />
          <PriorityBadge value={t.priority} />
          <span>{t.category}</span>
          {t.order_ref && <Link to={`/portal/orders/${t.order_id}`}>{t.order_ref}</Link>}
          <span>Opened {dateTime(t.created_at)}</span>
          {!t.first_response_at && t.status === 'open' && <span>First response within {RESPONSE[t.priority]}</span>}
          {t.care_ref && <span className="care-pill">🛟 Care plan {t.care_ref}</span>}
        </div>
        {t.care_usage && <div className="card"><CareUsage usage={t.care_usage} compact /></div>}
        <ol className="thread">
          {t.messages.map((m) => (
            <li key={m.id} className={`thread__msg ${m.author_id === user.id ? 'thread__msg--mine' : ''} ${m.internal ? 'thread__msg--internal' : ''}`}>
              <div className="thread__who"><strong>{m.author_id === user.id ? 'You' : m.author_role === 'client' ? m.author_name : `${m.author_name} · Hipcastle`}</strong><small>{dateTime(m.created_at)}</small></div>
              <p>{m.body}</p>
            </li>
          ))}
        </ol>
        <ErrorBox error={err} />
        {['resolved', 'closed'].includes(t.status) && t.user_id === user.id && <Csat ticket={t} onDone={setData} />}
        {!closed ? (
          <form className="card form" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await api(`/support/${t.id}/messages`, { method: 'POST', body: { body: reply } }); setReply(''); return r; }); }}>
            <Field label={t.status === 'resolved' ? 'Still not right? Reply to reopen' : 'Add a reply'}>
              <textarea required rows={4} maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} />
            </Field>
            <div className="form__actions">
              <button className="btn btn--primary" disabled={busy || !reply.trim()}>Send reply</button>
              {!['resolved'].includes(t.status) && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act(() => api(`/support/${t.id}/resolve`, { method: 'POST' }))}>Mark as resolved</button>}
            </div>
          </form>
        ) : <p className="muted">This ticket is closed. <Link to="/portal/support">Open a new ticket</Link> if you need more help.</p>}
      </div>
    </section>
  );
}
