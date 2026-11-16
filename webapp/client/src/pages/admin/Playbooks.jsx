import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { STAGE_LABEL } from '../../components/Pipeline.jsx';
import { useFetch } from '../../useFetch.js';
import { PanelHead } from './shared.jsx';

export default function Playbooks() {
  const { data, error, loading } = useFetch('/admin/playbooks');
  const [svc, setSvc] = useState('engineering');
  const [tier, setTier] = useState('growth');
  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const s = data.find((x) => x.slug === svc) || data[0];
  const t = s.tiers.find((x) => x.tier === tier) || s.tiers[0];
  const stages = [];
  for (const m of t.milestones) { let g = stages.find((x) => x.stage === m.stage); if (!g) stages.push((g = { stage: m.stage, items: [] })); g.items.push(m); }

  return (
    <>
      <PanelHead title="Delivery playbooks" sub="How every service is onboarded and delivered, per tier. New engagements get these milestones, owners, approval gates and onboarding questions automatically." />
      <div className="filters" role="group" aria-label="Service">
        {data.map((x) => <button key={x.slug} className={`chip ${x.slug === s.slug ? 'chip--active' : ''}`} onClick={() => setSvc(x.slug)}>{x.icon} {x.name}</button>)}
      </div>
      <div className="filters" role="group" aria-label="Tier">
        {s.tiers.map((x) => <button key={x.tier} className={`chip ${x.tier === t.tier ? 'chip--active' : ''}`} onClick={() => setTier(x.tier)}>{x.name} · {x.kind === 'retainer' ? 'monthly retainer' : `${x.delivery_days}-day project`}</button>)}
      </div>
      <div className="card">
        <p><strong>{s.icon} {s.name} — {t.name}.</strong> {s.summary}</p>
        <p className="muted small">{t.kind === 'retainer' ? 'Retainer: onboarding and setup once, then the monthly cycle repeats (new milestones and invoice each month).' : `Project: ${t.milestones.length} milestones, launch planned within ~${t.delivery_days} days of kick-off, 50% balance invoiced automatically at launch.`} Revision rounds per deliverable: {t.revisions ?? 'unlimited'}.</p>
      </div>
      <div className="grid grid--order">
        <div className="card">
          <h3>Milestones</h3>
          {stages.map((g) => (
            <div key={g.stage} className="pb-stage">
              <h4>{g.stage === 'cycle' ? 'Monthly cycle (repeats)' : STAGE_LABEL[g.stage] || g.stage}</h4>
              <ol>
                {g.items.map((m) => (
                  <li key={m.title}>
                    <strong>{m.title.replace(/ \(month 1\)$/, '')}</strong>
                    <span className="muted small"> · {m.days}d</span>
                    {m.approval && <span className="tag">client approval</span>}
                    {m.client && <span className="tag">client task</span>}
                    {m.agent && <small> · <Link to={`/agents/${m.agent.slug}`}>{m.agent.emoji} {m.agent.name}</Link></small>}
                    {m.deliverable && <small className="pb-deliverable">📦 {m.deliverable}</small>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Onboarding questionnaire</h3>
          <ol className="pb-list">{t.intake.map((q) => <li key={q.key}>{q.label}{q.required && <strong> *</strong>}</li>)}</ol>
          <h3 className="mt">Access & assets checklist</h3>
          <ol className="pb-list">{t.checklist.map((c) => <li key={c.key}>{c.label} <span className="tag">{c.kind}</span>{c.required && <strong> *</strong>}</li>)}</ol>
          <p className="muted small">Playbooks are defined in <code>server/src/playbooks.js</code>. Changes apply to new engagements.</p>
        </div>
      </div>
    </>
  );
}
