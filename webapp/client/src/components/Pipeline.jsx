// Engagement delivery pipeline UI — shared by the client portal and staff (Command Centre) views.
import { useSite } from '../context/SiteContext.jsx';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { date } from '../format.js';

export const STAGE_LABEL = {
  awaiting_deposit: 'Awaiting deposit', onboarding: 'Onboarding', discovery: 'Discovery', strategy: 'Strategy & design', setup: 'Setup',
  production: 'Build & production', cycle: 'Monthly cycle', review: 'Quality review', launch: 'Launch', handover: 'Handover & support',
  completed: 'Completed', cancelled: 'Cancelled',
};
export const HEALTH = {
  on_track: ['On track', 'ok'], at_risk: ['At risk', 'warn'], off_track: ['Off track', 'bad'], waiting_on_client: ['Waiting on client', 'info'],
  awaiting_deposit: ['Awaiting deposit', 'muted'], completed: ['Completed', 'ok'], cancelled: ['Cancelled', 'muted'],
};
const MS_STATUS = {
  todo: 'To do', in_progress: 'In progress', awaiting_client: 'Awaiting approval', changes_requested: 'Changes requested', blocked: 'Blocked', done: 'Done',
};

export const HealthBadge = ({ health }) => {
  const [label, tone] = HEALTH[health] || [health, 'muted'];
  return <span className={`health health--${tone}`}>{label}</span>;
};

/** Stage progress strip: onboarding → … → handover */
export function StageStrip({ milestones, current }) {
  const stages = [];
  for (const m of milestones) if (!stages.includes(m.stage)) stages.push(m.stage);
  const idx = stages.indexOf(current);
  return (
    <ol className="stage-strip" aria-label="Delivery stages">
      {stages.map((s, i) => {
        const all = milestones.filter((m) => m.stage === s);
        const done = all.every((m) => m.status === 'done');
        const state = done ? 'done' : s === current ? 'current' : i < idx ? 'done' : 'next';
        return <li key={s} className={`stage-strip__item stage-strip__item--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="stage-strip__dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
          <span>{STAGE_LABEL[s] || s}</span>
        </li>;
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- onboarding
export function OnboardingPanel({ order, items, canEdit, isStaff, onSaved }) {
  const initial = useMemo(() => Object.fromEntries(items.map((i) => [i.key, i.response || ''])), [items]);
  const [values, setValues] = useState(initial);
  const [state, setState] = useState({ busy: false, msg: '', error: '' });
  useEffect(() => setValues(initial), [initial]);
  const done = items.filter((i) => i.status === 'done').length;
  const complete = Boolean(order.onboarding_completed_at);
  const [open, setOpen] = useState(!complete);
  const questions = items.filter((i) => i.kind === 'question');
  const checklist = items.filter((i) => i.kind !== 'question');
  const site = useSite();

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, msg: '', error: '' });
    try {
      const responses = items.filter((i) => (values[i.key] || '') !== (i.response || '')).map((i) => ({ key: i.key, response: values[i.key] || '' }));
      if (!responses.length) { setState({ busy: false, msg: 'Nothing new to save.', error: '' }); return; }
      const r = await api(`/orders/${order.id}/onboarding`, { method: 'POST', body: { responses } });
      setState({ busy: false, msg: r.onboarding_complete ? '🎉 Onboarding complete — your team will confirm the kick-off call.' : 'Saved. You can finish the rest later.', error: '' });
      onSaved?.();
    } catch (err) { setState({ busy: false, msg: '', error: err.message }); }
  };
  const toggleItem = async (item) => {
    await api(`/orders/${order.id}/onboarding/${item.id}`, { method: 'PATCH', body: { status: item.status === 'done' ? 'pending' : 'done' } });
    onSaved?.();
  };

  const field = (i) => {
    const props = { id: `ob-${i.key}`, className: 'input', value: values[i.key] || '', disabled: !canEdit, onChange: (e) => setValues({ ...values, [i.key]: e.target.value }) };
    if (i.field_type === 'select') return <select {...props}><option value="">Choose…</option>{(i.options || []).map((o) => <option key={o}>{o}</option>)}</select>;
    if (i.field_type === 'textarea') return <textarea rows={3} {...props} />;
    return <input {...props} />;
  };
  const row = (i) => (
    <div key={i.id} className={`ob-item ob-item--${i.status}`}>
      <label htmlFor={`ob-${i.key}`} className="field__label">
        {i.status === 'done' ? '✅ ' : ''}{i.label}{i.required ? ' *' : ''}
        {i.kind !== 'question' && <span className="tag">{i.kind}</span>}
      </label>
      {field(i)}
      {isStaff && i.kind !== 'question' && <button type="button" className="btn btn--text btn--sm" onClick={() => toggleItem(i)}>{i.status === 'done' ? 'Mark as pending' : 'Mark as received'}</button>}
    </div>
  );

  return (
    <section id="onboarding" className="card pipeline-card" aria-labelledby="ob-h">
      <div className="pipeline-card__head">
        <h2 id="ob-h">Onboarding {complete ? '✅' : ''}</h2>
        <span className="muted small">{done}/{items.length} complete</span>
        <button className="btn btn--text btn--sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {!complete && order.status === 'pending' && <p className="muted small">You can start onboarding now — work begins once the deposit is paid.</p>}
      {open && (
        <form className="form" onSubmit={save}>
          {!complete && canEdit && <p className="alert alert--info">These answers help your team start fast. Required items are marked *. 🔒 Share access by <strong>inviting us as a user or partner</strong> — never type passwords here.</p>}
          {state.error && <div className="alert alert--error">{state.error}</div>}
          {state.msg && <div className="alert alert--success" role="status">{state.msg}</div>}
          <h3>About your business & goals</h3>
          {questions.map(row)}
          <h3 className="mt">Access & assets</h3>
          <p className="secure-hint">🔐 {site.secure_share_hint || 'Never send passwords in messages — invite us as a user, or share a one-time link from a password manager.'}</p>
          {checklist.map(row)}
          {canEdit && <button className="btn btn--primary" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save onboarding'}</button>}
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- milestones
function ClientReview({ order, m, onDone }) {
  const [mode, setMode] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const left = order.revisions_allowed === null ? null : Math.max(0, order.revisions_allowed - m.revisions_used);
  const act = async (path, body) => {
    setBusy(true); setErr('');
    try { await api(`/orders/${order.id}/milestones/${m.id}/${path}`, { method: 'POST', body }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="review-box">
      <p><strong>Your approval is needed.</strong> {left === null ? 'Unlimited revision rounds included.' : `${left} revision round(s) left for this deliverable.`}</p>
      {err && <div className="alert alert--error">{err}</div>}
      {mode === 'changes' ? (
        <div className="form">
          <label className="field"><span className="field__label">What should we change?</span>
            <textarea className="input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Be as specific as you can — what to keep, what to change, examples." /></label>
          <div className="row-actions">
            <button className="btn btn--primary btn--sm" disabled={busy || feedback.trim().length < 10} onClick={() => act('changes', { feedback })}>Send change request</button>
            <button className="btn btn--text btn--sm" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => act('approve')}>✓ Approve</button>
          <button className="btn btn--outline btn--sm" disabled={busy || left === 0} onClick={() => setMode('changes')}>Request changes</button>
          {left === 0 && <small className="muted">No revision rounds left — message your team to arrange more.</small>}
        </div>
      )}
    </div>
  );
}

function StaffActions({ order, m, onDone }) {
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState(m.deliverable_url || '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const run = async (fn) => { setErr(''); try { await fn(); setSubmitting(false); onDone(); } catch (e) { setErr(e.message); } };
  const post = (path, body) => api(`/orders/${order.id}/milestones/${m.id}/${path}`, { method: 'POST', body });
  const patch = (body) => api(`/orders/${order.id}/milestones/${m.id}`, { method: 'PATCH', body });
  if (m.status === 'done') return <button className="btn btn--text btn--sm" onClick={() => run(() => patch({ is_done: false }))}>Reopen</button>;
  return (
    <div className="staff-actions">
      {err && <div className="alert alert--error">{err}</div>}
      {submitting ? (
        <div className="form">
          <label className="field"><span className="field__label">Deliverable link (optional)</span><input className="input" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <label className="field"><span className="field__label">Note to the client</span><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="row-actions">
            <button className="btn btn--primary btn--sm" onClick={() => run(() => post('submit', { url, note }))}>{m.requires_approval ? 'Send for approval' : 'Mark done'}</button>
            <button className="btn btn--text btn--sm" onClick={() => setSubmitting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          {['todo', 'blocked'].includes(m.status) && !m.client_task && <button className="btn btn--ghost btn--sm" onClick={() => run(() => post('start'))}>Start</button>}
          {!m.client_task && m.status !== 'awaiting_client' && (
            m.requires_approval
              ? <button className="btn btn--outline btn--sm" onClick={() => setSubmitting(true)}>{m.status === 'changes_requested' ? 'Resubmit' : 'Submit deliverable'}</button>
              : <button className="btn btn--outline btn--sm" onClick={() => setSubmitting(true)}>Mark done…</button>
          )}
          <button className="btn btn--text btn--sm" title="Mark done without client approval" onClick={() => window.confirm(`Mark “${m.title}” as done?`) && run(() => post('complete'))}>Force done</button>
          {m.status !== 'blocked' ? <button className="btn btn--text btn--sm" onClick={() => run(() => patch({ status: 'blocked' }))}>Block</button>
            : <button className="btn btn--text btn--sm" onClick={() => run(() => patch({ status: 'todo' }))}>Unblock</button>}
          <label className="inline-date">Due <input type="date" className="input input--sm" value={m.due_date || ''} onChange={(e) => e.target.value && run(() => patch({ due_date: e.target.value }))} /></label>
        </div>
      )}
    </div>
  );
}

export function MilestoneTimeline({ order, milestones, isClient, isStaff, onChanged }) {
  const today = new Date().toISOString().slice(0, 10);
  const groups = [];
  for (const m of milestones) {
    const key = m.stage === 'cycle' ? `cycle-${m.cycle}` : m.stage;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label: m.stage === 'cycle' ? `Month ${m.cycle}` : STAGE_LABEL[m.stage] || m.stage, items: [] }));
    g.items.push(m);
  }
  // Retainers: show the current and previous month, collapse older months.
  const cycles = groups.filter((g) => g.key.startsWith('cycle-'));
  const hidden = new Set(cycles.slice(0, Math.max(0, cycles.length - 2)).map((g) => g.key));
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="timeline">
      {hidden.size > 0 && <button className="btn btn--text btn--sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide' : 'Show'} {hidden.size} earlier month(s)</button>}
      {groups.filter((g) => showAll || !hidden.has(g.key)).map((g) => {
        const done = g.items.filter((m) => m.status === 'done').length;
        return (
          <section key={g.key} className="timeline__stage">
            <h3>{g.label} <small className="muted">{done}/{g.items.length}</small></h3>
            <ol>
              {g.items.map((m) => {
                const late = m.status !== 'done' && m.due_date && m.due_date < today && !m.client_task && m.status !== 'awaiting_client';
                return (
                  <li key={m.id} id={`milestone-${m.id}`} className={`ms ms--${m.status} ${late ? 'ms--late' : ''}`}>
                    <span className="ms__dot" aria-hidden="true">{m.status === 'done' ? '✓' : ''}</span>
                    <div className="ms__body">
                      <div className="ms__title">
                        <strong>{m.title}</strong>
                        <span className={`ms__status ms__status--${m.status}`}>{m.client_task && m.status !== 'done' ? 'Your task' : MS_STATUS[m.status]}</span>
                        {m.requires_approval ? <span className="tag" title="Needs your approval">approval</span> : null}
                      </div>
                      <div className="ms__meta">
                        {m.agent_name && <Link to={`/agents/${m.agent_slug}`}>{m.agent_emoji} {m.agent_name}</Link>}
                        <span className={late ? 'text-error' : ''}>{m.status === 'done' ? `Done ${date(m.done_at)}` : `Due ${date(m.due_date)}${late ? ' · overdue' : ''}`}</span>
                        {m.revisions_used > 0 && <span>{m.revisions_used} revision round(s)</span>}
                      </div>
                      {m.deliverable && <p className="ms__deliverable">📦 {m.deliverable}</p>}
                      {(m.deliverable_url || m.deliverable_note) && (
                        <div className="ms__handoff">
                          {m.deliverable_url && <a href={m.deliverable_url} target="_blank" rel="noopener noreferrer">Open deliverable ↗</a>}
                          {m.deliverable_note && <p>{m.deliverable_note}</p>}
                        </div>
                      )}
                      {m.client_feedback && m.status !== 'done' && <blockquote className="ms__feedback">Your feedback: {m.client_feedback}</blockquote>}
                      {m.client_task && m.status !== 'done' && isClient && <a className="btn btn--primary btn--sm" href="#onboarding">Complete onboarding</a>}
                      {m.status === 'awaiting_client' && isClient && <ClientReview order={order} m={m} onDone={onChanged} />}
                      {isStaff && <StaffActions order={order} m={m} onDone={onChanged} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- feedback
export function FeedbackPanel({ order, onSaved }) {
  const [score, setScore] = useState(null);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  if (order.nps_score !== null && order.nps_score !== undefined) {
    return (
      <section id="feedback" className="card pipeline-card">
        <h2>Thank you for your feedback 🙏</h2>
        <p>You rated this engagement <strong>{order.nps_score}/10</strong>.{order.nps_score >= 9 && <> Would you share a short public review? <Link to="/testimonials">Leave a review</Link></>}</p>
      </section>
    );
  }
  const submit = async () => {
    try { await api(`/orders/${order.id}/feedback`, { method: 'POST', body: { score, comment } }); onSaved(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <section id="feedback" className="card pipeline-card" aria-labelledby="fb-h">
      <h2 id="fb-h">How did we do?</h2>
      <p className="muted">How likely are you to recommend Hipcastle to a friend or colleague?</p>
      {err && <div className="alert alert--error">{err}</div>}
      <div className="nps" role="radiogroup" aria-label="Score from 0 to 10">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" role="radio" aria-checked={score === n} className={`nps__btn ${score === n ? 'nps__btn--on' : ''}`} onClick={() => setScore(n)}>{n}</button>
        ))}
      </div>
      <div className="nps__scale muted small"><span>Not likely</span><span>Very likely</span></div>
      <textarea className="input mt" rows={3} placeholder="What should we keep doing or improve? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn btn--primary mt" disabled={score === null} onClick={submit}>Send feedback</button>
    </section>
  );
}
