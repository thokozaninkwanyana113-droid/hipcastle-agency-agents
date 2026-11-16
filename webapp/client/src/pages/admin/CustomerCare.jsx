// Command Centre → Support desk and Assistant conversations.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, Loader, Status } from '../../components/ui.jsx';
import { ChatText } from '../../components/ChatWidget.jsx';
import { PriorityBadge, RESPONSE } from '../Support.jsx';
import { useFetch } from '../../useFetch.js';
import { api } from '../../api.js';
import { dateTime, timeAgo } from '../../format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { LiveDot, PanelHead, StatusFilter, usePolling } from './shared.jsx';
import { CareUsage } from '../../components/Care.jsx';

const TICKET_STATUSES = ['open', 'pending_client', 'resolved', 'closed'];

function TicketPanel({ id, staff, onChange }) {
  const { user } = useAuth();
  const { data: t, error, loading, setData } = useFetch(`/support/${id}`);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn) => {
    setBusy(true); setErr(null);
    try { const r = await fn(); setData(r); onChange(); } catch (ex) { setErr(ex); }
    setBusy(false);
  };
  if (loading && !t) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const patch = (body) => act(() => api(`/support/${t.id}`, { method: 'PATCH', body }));
  return (
    <div className="card ticket-panel">
      <div className="ticket-panel__head">
        <div>
          <small className="muted">{t.reference} · {t.client_name}{t.client_company ? ` (${t.client_company})` : ''} · <a href={`mailto:${t.client_email}`}>{t.client_email}</a></small>
          <h3>{t.subject}</h3>
          <small className="muted">Opened {dateTime(t.created_at)} · {t.category}{t.order_ref ? ` · ${t.order_ref}` : ''} · first response due {dateTime(t.sla_due_at)}
            {t.first_response_at ? ` · responded ${dateTime(t.first_response_at)}` : ''}</small>
        </div>
        {t.sla_breached ? <span className="prio prio--urgent">SLA breached</span> : null}
      </div>
      <div className="ticket-panel__controls">
        <label>Status <select className="input input--sm" value={t.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })}>{TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></label>
        <label>Priority <select className="input input--sm" value={t.priority} disabled={busy} onChange={(e) => patch({ priority: e.target.value })}>{Object.keys(RESPONSE).map((p) => <option key={p}>{p}</option>)}</select></label>
        <label>Assignee <select className="input input--sm" value={t.assigned_to || ''} disabled={busy} onChange={(e) => patch({ assigned_to: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Unassigned</option>{staff?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {t.care_ref && <span className="care-pill">🛟 {t.care_ref} · {t.care_tier_name}</span>}
        {t.csat_score && <span className="csat-pill">CSAT {t.csat_score}/5{t.csat_comment ? ` — “${t.csat_comment}”` : ''}</span>}
      </div>
      {t.care_usage && (
        <div className="care-time">
          <CareUsage usage={t.care_usage} compact />
          <form className="care-time__form" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            act(async () => { const r = await api(`/support/${t.id}/time`, { method: 'POST', body: { minutes: Number(f.get('minutes')), note: String(f.get('note')) } }); form.reset(); return r; });
          }}>
            <label>Log time <input className="input input--sm" name="minutes" type="number" min={5} max={1440} step={5} required placeholder="min" aria-label="Minutes" /></label>
            <input className="input input--sm" name="note" required minLength={3} maxLength={300} placeholder="What was done" aria-label="What was done" />
            <button className="btn btn--outline btn--sm" disabled={busy}>Log</button>
          </form>
        </div>
      )}
      <ol className="thread">
        {t.messages.map((m) => (
          <li key={m.id} className={`thread__msg ${m.author_role !== 'client' ? 'thread__msg--mine' : ''} ${m.internal ? 'thread__msg--internal' : ''}`}>
            <div className="thread__who"><strong>{m.author_name}{m.internal ? ' · internal note' : ''}</strong><small>{dateTime(m.created_at)}</small></div>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      <ErrorBox error={err} />
      {t.status !== 'closed' && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await api(`/support/${t.id}/messages`, { method: 'POST', body: { body: reply, internal } }); setReply(''); return r; }); }}>
          <textarea className="input" rows={4} required maxLength={5000} aria-label="Reply" placeholder={internal ? 'Internal note — the client won’t see this' : `Reply to ${t.client_name.split(' ')[0]}…`} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="form__actions">
            <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label>
            <button className="btn btn--primary btn--sm" disabled={busy || !reply.trim()}>{internal ? 'Add note' : 'Send reply'}</button>
            {t.status !== 'resolved' && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => act(() => api(`/support/${t.id}/resolve`, { method: 'POST' }))}>Resolve</button>}
          </div>
          <small className="muted">Replying sets the ticket to “pending client” and emails {t.client_name.split(' ')[0]}. {user.name.split(' ')[0]} will be assigned if nobody is.</small>
        </form>
      )}
    </div>
  );
}

export function SupportDesk() {
  const [status, setStatus] = useState('open');
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState(null);
  const { data, error, loading, reload } = useFetch(`/support?status=${status}${mine ? '&mine=1' : ''}`);
  const { data: stats, reload: reloadStats } = useFetch('/admin/support/stats');
  const { data: staff } = useFetch('/admin/staff');
  usePolling(reload, 20000);
  usePolling(reloadStats, 60000);
  return (
    <>
      <PanelHead title="Support desk" sub={`Client tickets with first-response targets: urgent ${RESPONSE.urgent}, high ${RESPONSE.high}, normal ${RESPONSE.normal}, low ${RESPONSE.low}.`}><LiveDot /></PanelHead>
      {stats && (
        <div className="kpis kpis--small">
          <div className="kpi"><span>Open</span><strong>{stats.open}</strong>{stats.breached > 0 ? <small className="text-error">⚠ {stats.breached} past target</small> : <small>all within target</small>}</div>
          <div className="kpi"><span>Awaiting client</span><strong>{stats.pending_client}</strong></div>
          <div className="kpi"><span>Response target met (30d)</span><strong>{stats.sla_met_pct_30d ?? '—'}{stats.sla_met_pct_30d !== null && '%'}</strong><small>avg first reply {stats.avg_first_response_hours_30d ?? '—'} h</small></div>
          <div className="kpi"><span>CSAT (90d)</span><strong>{stats.csat_avg_90d ?? '—'}{stats.csat_avg_90d !== null && '/5'}</strong><small>{stats.csat_count_90d} ratings · {stats.resolved_30d} resolved (30d)</small></div>
        </div>
      )}
      <div className="filters-row">
        <StatusFilter value={status} onChange={(s) => { setStatus(s); setOpen(null); }} options={TICKET_STATUSES} />
        <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me</label>
      </div>
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Ticket</th><th>Client</th><th>Priority</th><th>Status</th><th>Response due</th><th>Assignee</th><th>Updated</th></tr></thead>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id} className={open === t.id ? 'is-selected' : ''}>
                <td><button className="btn--link" onClick={() => setOpen(open === t.id ? null : t.id)}>{t.subject}</button><small>{t.reference} · {t.category} · {t.message_count} msg{t.care_ref ? ` · 🛟 ${t.care_ref}` : ''}</small></td>
                <td>{t.client_name}<small>{t.client_company}</small></td>
                <td><PriorityBadge value={t.priority} /></td>
                <td><Status value={t.status} /></td>
                <td className={t.sla_breached ? 'text-error nowrap' : 'nowrap'}>{t.first_response_at ? '✓ responded' : `${t.sla_breached ? '⚠ ' : ''}${dateTime(t.sla_due_at)}`}</td>
                <td>{t.assignee_name || <span className="muted">—</span>}</td>
                <td className="nowrap">{timeAgo(t.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="empty">No {status.replace('_', ' ')} tickets. 🎉</p>}
      </div>
      {open && <TicketPanel key={open} id={open} staff={staff} onChange={() => { reload(); reloadStats(); }} />}
    </>
  );
}

function Transcript({ sid }) {
  const { data, error, loading } = useFetch(`/admin/chats/${sid}`);
  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="card chat-transcript">
      <small className="muted">Started {dateTime(data.created_at)} on {data.page} · {data.mode === 'ai' ? 'AI mode' : 'FAQ mode'}{data.handoff_lead_id ? ' · handed to a person' : ''}</small>
      {data.messages.map((m) => (
        <div key={m.id} className={`chat__msg chat__msg--${m.role}`}>
          {m.role === 'user' ? <p>{m.content}</p> : <ChatText text={m.content} />}
          {m.role === 'assistant' && (
            <small className="muted">
              {m.source}{m.answered === 0 ? ' · ❓ not answered' : ''}{m.helpful === 1 ? ' · 👍' : m.helpful === 0 ? ' · 👎' : ''}
              {m.output_tokens ? ` · ${m.input_tokens + (m.cache_read_tokens || 0)} in / ${m.output_tokens} out tokens` : ''}
            </small>
          )}
        </div>
      ))}
    </div>
  );
}

export function Conversations() {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(null);
  const { data: stats, reload: reloadStats } = useFetch('/admin/chats/stats');
  const { data, error, loading, reload } = useFetch(`/admin/chats?filter=${filter}`);
  usePolling(reload, 30000);
  usePolling(reloadStats, 60000);
  const tk = stats?.tokens_30d;
  return (
    <>
      <PanelHead title="Assistant conversations" sub="What visitors ask the homepage assistant, how well it answers, and when they want a person."><LiveDot /></PanelHead>
      {stats && (
        <>
          <div className={`alert ${stats.mode === 'ai' ? 'alert--success' : 'alert--info'}`}>
            {stats.mode === 'ai'
              ? <>🤖 AI mode is on (model <code>{stats.model}</code>), answering from {stats.knowledge.articles} knowledge articles (~{stats.knowledge.approx_tokens.toLocaleString()} tokens, cached). If the AI is unavailable it falls back to the built-in FAQ engine.</>
              : <>📚 FAQ mode: answers come from {stats.knowledge.articles} knowledge articles with no AI cost. Add an <code>ANTHROPIC_API_KEY</code> secret to switch on AI answers.</>}
          </div>
          <div className="kpis kpis--small">
            <div className="kpi"><span>Conversations (7d)</span><strong>{stats.conversations_7d}</strong><small>{stats.questions_7d} questions</small></div>
            <div className="kpi"><span>Helpful (30d)</span><strong>{stats.helpful_pct_30d ?? '—'}{stats.helpful_pct_30d !== null && '%'}</strong><small>{stats.rated_30d} ratings</small></div>
            <div className="kpi"><span>Unanswered (7d)</span><strong>{stats.unanswered_7d}</strong>{stats.fallbacks_7d > 0 && <small className="text-error">{stats.fallbacks_7d} AI fallbacks</small>}</div>
            <div className="kpi"><span>Handoffs to a person (30d)</span><strong>{stats.handoffs_30d}</strong><small><Link to="/admin/leads">see Leads</Link></small></div>
          </div>
          {tk && tk.output > 0 && <p className="muted small">AI usage (30d): {tk.input.toLocaleString()} input · {tk.cache_read.toLocaleString()} cached · {tk.output.toLocaleString()} output tokens.</p>}
          {stats.unanswered_recent.length > 0 && (
            <div className="card">
              <h3>Questions to improve on</h3>
              <p className="muted small">Not answered or rated unhelpful. Add the answer to an FAQ, service description or blog post and the assistant learns it automatically.</p>
              <ul className="gap-list">{stats.unanswered_recent.map((u, i) => <li key={i}><button className="btn--link" onClick={() => setOpen(u.session_id)}>“{u.question}”</button> <small className="muted">{timeAgo(u.created_at)}</small></li>)}</ul>
            </div>
          )}
        </>
      )}
      <StatusFilter value={filter} onChange={setFilter} options={['issues', 'handoff']} label="Filter conversations" />
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Started</th><th>First question</th><th>Messages</th><th>Signals</th></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className={open === c.id ? 'is-selected' : ''}>
                <td className="nowrap">{timeAgo(c.created_at)}</td>
                <td><button className="btn--link" onClick={() => setOpen(open === c.id ? null : c.id)}>{c.first_question || '—'}</button></td>
                <td>{c.message_count}</td>
                <td>{c.lead_name && <span className="prio prio--normal">🙋 {c.lead_name}</span>} {c.unanswered > 0 && <span className="prio prio--high">❓ {c.unanswered}</span>} {c.unhelpful > 0 && <span className="prio prio--urgent">👎 {c.unhelpful}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="empty">No conversations yet.</p>}
      </div>
      {open && <Transcript key={open} sid={open} />}
    </>
  );
}
