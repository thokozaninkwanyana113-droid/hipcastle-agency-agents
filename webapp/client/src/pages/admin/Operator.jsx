// Command Centre → Operator: the internal agent that runs the business day to day. It reviews
// sales, marketing, advertising, finance, delivery, support and retention, then prepares work.
// Anything that reaches a client or spends money waits here for a person to approve it.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Markdown from '../../components/Markdown.jsx';
import { ErrorBox, Field, Loader } from '../../components/ui.jsx';
import { useFetch } from '../../useFetch.js';
import { dateTime, timeAgo } from '../../format.js';
import { PanelHead, StatusFilter, usePolling } from './shared.jsx';

const AREA_ICON = { sales: '🎯', marketing: '📣', advertising: '📢', finance: '💰', delivery: '🚦', support: '🎧', retention: '🤝', operations: '⚙️' };
const KIND_LABEL = { email: 'Email', blog_post: 'Blog draft', social_posts: 'Social posts', ad_campaign: 'Ad campaign', task: 'Task', call: 'Call' };
const PRIO = { 1: ['Today', 'urgent'], 2: ['This week', 'high'], 3: ['When possible', 'normal'] };

function Preview({ a, editing, draft, setDraft }) {
  const p = a.payload;
  if (a.kind === 'email') {
    return editing ? (
      <div className="form">
        <Field label="Subject"><input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
        <Field label="Message"><textarea className="input" rows={9} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
      </div>
    ) : (
      <div className="op-email"><p><strong>To:</strong> {a.recipient || `${p.recipient_type} #${p.recipient_id}`} · <strong>Subject:</strong> {p.subject}</p><pre>{p.body}</pre></div>
    );
  }
  if (a.kind === 'blog_post') return <details><summary>{p.title} — {p.excerpt}</summary><Markdown source={p.body} /></details>;
  if (a.kind === 'social_posts') return <ul className="op-list">{p.posts.map((s, i) => <li key={i}><strong>{s.platform}</strong>: {s.text}{s.link_path && <span className="muted"> → {s.link_path}</span>}</li>)}</ul>;
  if (a.kind === 'ad_campaign') {
    return (
      <table className="table"><tbody>
        <tr><th>Platform</th><td>{p.platform.replace('_', ' ')} · {p.service_slug}</td></tr>
        <tr><th>Budget</th><td>R{p.daily_budget_rand}/day × {p.duration_days} days = <strong>R{Math.round(p.daily_budget_rand * p.duration_days).toLocaleString('en-ZA')}</strong></td></tr>
        <tr><th>Audience</th><td>{p.audience}</td></tr>
        <tr><th>Headlines</th><td>{p.headlines.join(' · ')}</td></tr>
        <tr><th>Descriptions</th><td>{p.descriptions.join(' · ')}</td></tr>
        {p.keywords?.length > 0 && <tr><th>Keywords</th><td>{p.keywords.join(', ')}</td></tr>}
        <tr><th>Landing page</th><td>{p.landing_path}</td></tr>
        <tr><th>Success</th><td>{p.success_metric}</td></tr>
      </tbody></table>
    );
  }
  if (a.kind === 'call') return <div><p><strong>{p.who}</strong>{p.phone && ` · ${p.phone}`}</p><ul className="op-list">{p.talking_points.map((t) => <li key={t}>{t}</li>)}</ul></div>;
  return <p className="op-details">{p.details}{p.due_date && <span className="muted"> · due {p.due_date}</span>}</p>;
}

function ActionCard({ a, onChange, isAdmin }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a.kind === 'email' ? { subject: a.payload.subject, body: a.payload.body } : {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const act = async (path, opts) => {
    setBusy(true); setErr(null);
    try { await api(`/admin/operator/actions/${a.id}${path}`, opts); setEditing(false); onChange(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const [prio, prioClass] = PRIO[a.priority] || PRIO[2];
  const needsAdmin = a.kind === 'ad_campaign' && !isAdmin;
  return (
    <article className="card op-action">
      <header className="op-action__head">
        <span className="op-action__area" title={a.area}>{AREA_ICON[a.area]}</span>
        <div>
          <h4>{a.title}</h4>
          <small className="muted">{KIND_LABEL[a.kind]} · {a.area} · <span className={`prio prio--${prioClass}`}>{prio}</span> · {timeAgo(a.created_at)}</small>
        </div>
        {a.status === 'approved' && <span className="status status--in_progress">to do</span>}
      </header>
      <p className="op-action__why">{a.rationale}</p>
      <Preview a={a} editing={editing} draft={draft} setDraft={setDraft} />
      {a.result && <p className="alert alert--info small">{a.result}</p>}
      <ErrorBox error={err} />
      <div className="form__actions">
        {a.status === 'proposed' && (editing ? (
          <>
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => act('', { method: 'PATCH', body: { payload: draft } })}>Save changes</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn--primary btn--sm" disabled={busy || needsAdmin} title={needsAdmin ? 'Only an admin can approve ad spend' : ''} onClick={() => act('/approve', { method: 'POST' })}>
              {a.kind === 'email' ? 'Approve & send' : a.kind === 'blog_post' ? 'Save as draft post' : a.kind === 'ad_campaign' ? 'Approve budget' : 'Approve'}
            </button>
            {a.kind === 'email' && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>Edit</button>}
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => act('/dismiss', { method: 'POST', body: {} })}>Dismiss</button>
          </>
        ))}
        {a.status === 'approved' && (
          <>
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => act('/done', { method: 'POST', body: {} })}>Mark done</button>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => act('/dismiss', { method: 'POST', body: {} })}>Drop it</button>
          </>
        )}
      </div>
    </article>
  );
}

function SettingsCard({ s, onSaved, isAdmin }) {
  const [f, setF] = useState(s);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault(); setErr(null); setMsg(null);
    try { await api('/admin/settings', { method: 'PUT', body: { ...f, operator_monthly_ad_budget: Number(f.operator_monthly_ad_budget) || 0 } }); setMsg('Saved'); onSaved(); } catch (x) { setErr(x); }
  };
  return (
    <form className="card form" onSubmit={save}>
      <h3>How the Operator works for you</h3>
      <label className="check"><input type="checkbox" checked={f.operator_enabled} disabled={!isAdmin} onChange={(e) => setF({ ...f, operator_enabled: e.target.checked })} /> Run every weekday at 07:30 and email me the brief</label>
      <Field label="Autonomy" hint="Emails and ad spend always need your approval, whichever you choose.">
        <select className="input" value={f.operator_autonomy} disabled={!isAdmin} onChange={(e) => setF({ ...f, operator_autonomy: e.target.value })}>
          <option value="suggest">Suggest — I approve everything</option>
          <option value="assist">Assist — auto-accept internal work (tasks, call lists, social copy, blog drafts)</option>
        </select>
      </Field>
      <Field label="Monthly ad budget (rand)" hint="The Operator only plans campaigns that fit. 0 = no paid ads yet.">
        <input className="input" type="number" min="0" step="100" value={f.operator_monthly_ad_budget} disabled={!isAdmin} onChange={(e) => setF({ ...f, operator_monthly_ad_budget: e.target.value })} />
      </Field>
      <Field label="Standing focus" hint="e.g. “Grow care-plan sign-ups in Gauteng; push e-commerce sites before Black Friday.”">
        <textarea className="input" rows={3} maxLength={500} value={f.operator_focus} disabled={!isAdmin} onChange={(e) => setF({ ...f, operator_focus: e.target.value })} />
      </Field>
      <ErrorBox error={err} />
      {isAdmin && <div className="form__actions"><button className="btn btn--primary btn--sm">Save</button>{msg && <span className="muted">{msg}</span>}</div>}
    </form>
  );
}

export default function Operator() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { data: d, error, loading, reload } = useFetch('/admin/operator');
  usePolling(reload, 30000);
  const [instruction, setInstruction] = useState('');
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState(null);
  const [area, setArea] = useState('');
  if (loading && !d) return <Loader />;
  if (error) return <ErrorBox error={error} />;

  const run = async (e) => {
    e.preventDefault(); setRunning(true); setRunErr(null);
    try { await api('/admin/operator/run', { method: 'POST', body: { instruction } }); setInstruction(''); reload(); } catch (x) { setRunErr(x); } finally { setRunning(false); }
  };
  const shown = d.actions.filter((a) => !area || a.area === area);
  const waiting = d.actions.filter((a) => a.status === 'proposed').length;
  return (
    <>
      <PanelHead title="Operator" sub="Your internal business manager. Every weekday it reviews sales, marketing, advertising, finance, delivery, support and retention, then prepares the work. You stay in control: nothing reaches a client and no money is spent until you approve it." />
      <div className="alert alert--info">
        {d.mode === 'ai' ? '🧠 AI mode — Claude analyses the business and writes bespoke drafts.' : '📏 Rules mode — set ANTHROPIC_API_KEY for AI drafts and analysis. Best-practice checks still run.'}
        {' '}{waiting} action{waiting === 1 ? '' : 's'} waiting for you.
      </div>

      <div className="op-grid">
        <section className="card op-brief">
          <h3>Latest brief {d.latest && <small className="muted">· {dateTime(d.latest.finished_at || d.latest.started_at)} · {d.latest.trigger} · {d.latest.mode}</small>}</h3>
          {d.latest?.brief ? <Markdown source={d.latest.brief} /> : <p className="empty">No runs yet. Ask the Operator to review the business below.</p>}
          {isAdmin && (
            <form className="op-run" onSubmit={run}>
              <Field label="Ask the Operator" hint="Optional — e.g. “Plan next month’s marketing for care plans” or “Who should I call today?”">
                <textarea className="input" rows={2} maxLength={1000} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              </Field>
              <ErrorBox error={runErr} />
              <button className="btn btn--primary" disabled={running || d.running}>{running ? 'Reviewing the business…' : 'Run now'}</button>
            </form>
          )}
        </section>
        <SettingsCard key={JSON.stringify(d.settings)} s={d.settings} onSaved={reload} isAdmin={isAdmin} />
      </div>

      <PanelHead title="Action queue" sub="Today first. Edit emails before sending; approved tasks stay here until you mark them done. Untouched proposals expire after 10 days.">
        <StatusFilter value={area} onChange={setArea} options={[...new Set(d.actions.map((a) => a.area))]} label="Area" />
      </PanelHead>
      {shown.length ? <div className="op-actions">{shown.map((a) => <ActionCard key={`${a.id}-${a.status}`} a={a} onChange={reload} isAdmin={isAdmin} />)}</div> : <p className="empty card">Nothing waiting. 🎉</p>}

      <details className="card">
        <summary><strong>History</strong> — recent runs and decisions</summary>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Run</th><th>When</th><th>Trigger</th><th>Mode</th><th>Actions</th><th>Status</th></tr></thead>
            <tbody>{d.history.map((h) => (
              <tr key={h.id}><td>#{h.id}</td><td className="nowrap">{dateTime(h.started_at)}</td><td>{h.trigger}{h.instruction && <span className="muted"> — “{h.instruction.slice(0, 60)}”</span>}</td><td>{h.mode}</td><td>{h.actions_proposed ?? '—'}</td><td>{h.status}{h.error && <span className="text-error"> {h.error}</span>}</td></tr>
            ))}</tbody>
          </table>
          <table className="table">
            <thead><tr><th>Decision</th><th>Action</th><th>Outcome</th></tr></thead>
            <tbody>{d.recent.map((a) => (
              <tr key={a.id}><td className="nowrap">{a.status} · {dateTime(a.decided_at || a.created_at)}</td><td>{AREA_ICON[a.area]} {a.title}</td><td className="muted small">{a.result}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
