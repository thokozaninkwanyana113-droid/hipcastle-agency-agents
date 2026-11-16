// Command Centre → Care plans: recurring aftercare revenue, hours used and support windows ending.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, Loader, Status } from '../../components/ui.jsx';
import { CareUsage } from '../../components/Care.jsx';
import { useFetch } from '../../useFetch.js';
import { api } from '../../api.js';
import { date, money } from '../../format.js';
import { LiveDot, PanelHead, usePolling } from './shared.jsx';

function LogTime({ plan, onDone }) {
  const [err, setErr] = useState(null);
  return (
    <form className="care-time__form" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      try { await api(`/admin/care/${plan.id}/time`, { method: 'POST', body: { minutes: Number(f.get('minutes')), note: String(f.get('note')) } }); form.reset(); setErr(null); onDone(); }
      catch (ex) { setErr(ex); }
    }}>
      <input className="input input--sm" name="minutes" type="number" min={5} max={1440} step={5} required placeholder="min" aria-label={`Minutes for ${plan.reference}`} />
      <input className="input input--sm" name="note" required minLength={3} maxLength={300} placeholder="Work done (e.g. plugin updates)" aria-label="Work done" />
      <button className="btn btn--outline btn--sm">Log time</button>
      {err && <small className="text-error">{err.message}</small>}
    </form>
  );
}

export default function CarePlans() {
  const { data, error, loading, reload } = useFetch('/admin/care');
  usePolling(reload, 60000);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <PanelHead title="Care plans" sub="Monthly aftercare, maintenance & hosting. Log hands-on time here or on support tickets; clients see it in their portal."><LiveDot /></PanelHead>
      <div className="kpis kpis--small">
        <div className="kpi"><span>Care revenue / month</span><strong>{money(data.mrr_cents)}</strong><small>excl. VAT</small></div>
        <div className="kpi"><span>Active plans</span><strong>{data.active}</strong><small>{data.pending} awaiting first payment</small></div>
        <div className="kpi"><span>Over allowance</span><strong>{data.over_allowance}</strong><small>quote extra work first</small></div>
        <div className="kpi"><span>Support windows ending</span><strong>{data.ending.length}</strong><small>projects without care</small></div>
      </div>

      <div className="card">
        <h3>Plans</h3>
        {data.plans.length === 0 && <p className="empty">No care plans yet. Clients are offered one automatically 7 days before their free support ends.</p>}
        <div className="care-board">
          {data.plans.map((p) => (
            <div key={p.id} className="care-board__row">
              <div className="care-board__who">
                <Link to={`/portal/orders/${p.id}`}><strong>{p.client_name}</strong></Link>
                <small>{p.reference} · {p.title} — {p.tier_name} · {money(p.price_cents)}/month{p.covers_reference ? ` · covers ${p.covers_reference}` : ''}</small>
                <Status value={p.status} />
              </div>
              {p.usage ? <div><CareUsage usage={p.usage} compact /><LogTime plan={p} onDone={reload} /></div> : <small className="muted">Starts when the first month is paid.</small>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Free support windows ending</h3>
        <p className="muted small">Delivered projects without a care plan. Clients get an automatic offer 7 days before the end date; a personal call converts better.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Project</th><th>Client</th><th>Service</th><th>Free support ends</th><th>Offer emailed</th></tr></thead>
            <tbody>
              {data.ending.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/portal/orders/${o.id}`}>{o.reference}</Link></td>
                  <td>{o.client_name}</td>
                  <td>{o.service_name}</td>
                  <td className="nowrap">{date(o.support_ends_at)}</td>
                  <td>{o.offered ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.ending.length === 0 && <p className="empty">Nothing ending soon.</p>}
        </div>
      </div>
    </>
  );
}
