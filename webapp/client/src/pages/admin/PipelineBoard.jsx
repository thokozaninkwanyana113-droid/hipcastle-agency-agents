import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, Loader, Progress } from '../../components/ui.jsx';
import { HEALTH, HealthBadge, STAGE_LABEL } from '../../components/Pipeline.jsx';
import { date, money } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { LiveDot, PanelHead, StatusFilter, usePolling } from './shared.jsx';

const COLUMNS = [
  ['awaiting_deposit', ['awaiting_deposit']],
  ['onboarding', ['onboarding']],
  ['discovery', ['discovery', 'strategy', 'setup']],
  ['production', ['production', 'cycle']],
  ['review', ['review']],
  ['launch', ['launch', 'handover']],
  ['completed', ['completed']],
];
const COL_LABEL = { discovery: 'Discovery & strategy', production: 'Production / monthly cycle', launch: 'Launch & handover' };

export default function PipelineBoard() {
  const { data, error, loading, reload } = useFetch('/admin/pipeline');
  const { data: services } = useFetch('/services');
  const [service, setService] = useState('');
  const [health, setHealth] = useState('');
  usePolling(reload, 20000);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const cards = data.cards.filter((c) => (!service || c.service_slug === service) && (!health || c.health === health));
  const count = (h) => data.cards.filter((c) => c.health === h).length;

  return (
    <>
      <PanelHead title="Delivery pipeline" sub="Every engagement from deposit to delivery. Cards show the current stage, next milestone and its owner."><LiveDot /></PanelHead>
      <div className="kpis">
        <div className="kpi"><span>In delivery</span><strong>{data.cards.filter((c) => ['active', 'in_review'].includes(c.status)).length}</strong><small>{count('awaiting_deposit')} awaiting deposit</small></div>
        <div className="kpi"><span>Off track / at risk</span><strong className={count('off_track') ? 'text-error' : ''}>{count('off_track')} / {count('at_risk')}</strong><small>overdue milestones</small></div>
        <div className="kpi"><span>Waiting on clients</span><strong>{count('waiting_on_client')}</strong><small>approvals & onboarding</small></div>
        <div className="kpi"><span>Client NPS</span><strong>{data.nps ?? '—'}</strong><small>{data.feedback_count} rating(s)</small></div>
      </div>
      <div className="toolbar">
        <select className="input" aria-label="Filter by service" value={service} onChange={(e) => setService(e.target.value)}>
          <option value="">All services</option>{services?.map((s) => <option key={s.slug} value={s.slug}>{s.icon} {s.name}</option>)}
        </select>
        <Link to="/admin/playbooks" className="btn btn--ghost btn--sm">View delivery playbooks</Link>
      </div>
      <StatusFilter value={health} onChange={setHealth} options={Object.keys(HEALTH).filter((h) => !['cancelled'].includes(h))} label="Health" />
      <div className="board" role="list">
        {COLUMNS.map(([col, stages]) => {
          const list = cards.filter((c) => stages.includes(c.stage));
          return (
            <section key={col} className="board__col" aria-label={COL_LABEL[col] || STAGE_LABEL[col]}>
              <h3>{COL_LABEL[col] || STAGE_LABEL[col]} <span className="board__count">{list.length}</span></h3>
              {list.map((c) => (
                <Link key={c.id} to={`/portal/orders/${c.id}`} className={`board__card board__card--${HEALTH[c.health]?.[1] || 'muted'}`} role="listitem">
                  <div className="board__card-head"><span>{c.service_icon} {c.reference}</span><HealthBadge health={c.health} /></div>
                  <strong>{c.client_name}</strong>
                  <small>{c.service_name} — {c.tier_name}{c.kind === 'retainer' && c.current_cycle ? ` · month ${c.current_cycle}` : ''}</small>
                  {c.next && (
                    <p className="board__next">
                      <span>Next: {c.next.title}</span>
                      <small>{c.next.agent_name ? `${c.next.agent_name} · ` : ''}due {date(c.next.due_date)}{c.days_late ? ` · ${c.days_late}d late` : ''}</small>
                    </p>
                  )}
                  {c.onboarding.required_open > 0 && c.stage === 'onboarding' && <small className="text-warn">{c.onboarding.required_open} onboarding item(s) outstanding</small>}
                  <Progress value={c.progress} />
                  <small className="muted">{money(c.price_cents)}{c.nps_score !== null && c.nps_score !== undefined ? ` · rated ${c.nps_score}/10` : ''}</small>
                </Link>
              ))}
              {list.length === 0 && <p className="board__empty">—</p>}
            </section>
          );
        })}
      </div>
      <div className="card mt-lg">
        <h3>Open work by specialist</h3>
        <table className="table table--compact">
          <thead><tr><th>Specialist</th><th>Open milestones</th><th>Overdue</th></tr></thead>
          <tbody>{data.workload.map((w) => (
            <tr key={w.agent_slug}><td><Link to={`/agents/${w.agent_slug}`}>{w.emoji} {w.agent_name || w.agent_slug}</Link></td><td>{w.open}</td><td className={w.overdue ? 'text-error' : ''}>{w.overdue}</td></tr>
          ))}</tbody>
        </table>
        {data.workload.length === 0 && <p className="empty">No open work.</p>}
      </div>
    </>
  );
}
