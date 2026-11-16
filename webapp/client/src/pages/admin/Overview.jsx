import { Link } from 'react-router-dom';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { money, timeAgo } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { HBars, LiveDot, PanelHead, RevenueChart, usePolling } from './shared.jsx';

export default function Overview() {
  const { data: d, error, loading, reload } = useFetch('/admin/overview');
  const { data: sys, reload: reloadSys } = useFetch('/admin/system');
  usePolling(reload);
  usePolling(reloadSys, 30000);
  if (loading && !d) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const conv = d.leads_total ? Math.round((d.leads_won / d.leads_total) * 100) : 0;
  const alerts = sys?.warnings?.filter((w) => w.level !== 'info') ?? [];
  return (
    <>
      <PanelHead title="Business overview" sub="Everything happening across Hipcastle, refreshed automatically."><LiveDot /></PanelHead>
      {alerts.length > 0 && (
        <div className="cc-alerts">
          {alerts.map((w) => <div key={w.message} className={`alert alert--${w.level === 'error' ? 'error' : 'warn'}`}>{w.level === 'error' ? '⛔' : '⚠️'} {w.message}</div>)}
          <Link to="/admin/system" className="small">View system health →</Link>
        </div>
      )}
      <div className="kpis">
        <div className="kpi"><span>Revenue (30 days)</span><strong>{money(d.revenue_30d_cents)}</strong><small>{money(d.revenue_paid_cents)} all time</small></div>
        <div className="kpi"><span>Outstanding</span><strong>{money(d.outstanding_cents)}</strong>{d.overdue_invoices > 0 ? <small className="text-error">⚠ {d.overdue_invoices} overdue</small> : <small>none overdue</small>}</div>
        <div className="kpi"><span>Active engagements</span><strong>{d.active_orders}</strong><small>{d.pending_orders} awaiting deposit · {d.completed_orders} completed</small></div>
        <div className="kpi"><span>New leads</span><strong>{d.new_leads}</strong><small>{conv}% win rate · {d.clients} clients</small></div>
      </div>
      <div className="kpis kpis--small">
        <div className="kpi"><span>Payments today</span><strong>{d.payments_today}</strong>{d.payments_failed_7d > 0 && <small className="text-error">{d.payments_failed_7d} failed (7d)</small>}</div>
        <div className="kpi"><span>Reviews</span><strong>{d.avg_rating ?? '—'}★</strong><small>{d.pending_testimonials} awaiting moderation</small></div>
        <div className="kpi"><span>Published articles</span><strong>{d.published_posts}</strong></div>
        <div className="kpi"><span>Subscribers</span><strong>{d.subscribers}</strong></div>
      </div>
      <div className="kpis kpis--small">
        <div className="kpi"><span>Open support tickets</span><strong>{d.open_tickets}</strong>{d.tickets_breached > 0 ? <small className="text-error">⚠ {d.tickets_breached} past response target</small> : <small><Link to="/admin/support">support desk</Link></small>}</div>
        <div className="kpi"><span>Support CSAT (90d)</span><strong>{d.csat_avg ?? '—'}{d.csat_avg !== null && '/5'}</strong></div>
        <div className="kpi"><span>Care plans</span><strong>{d.care_active}</strong><small>{money(d.care_mrr_cents)}/month · <Link to="/admin/care">manage</Link></small></div>
        <div className="kpi"><span>Assistant chats (7d)</span><strong>{d.chats_7d}</strong><small><Link to="/admin/conversations">view conversations</Link></small></div>
      </div>
      <div className="card"><RevenueChart data={d.revenue_by_day} /></div>
      <div className="grid grid--order">
        <div className="card">
          <h3>Pipeline value by service</h3>
          <HBars label="Pipeline value by service" items={d.by_service.map((s) => ({ label: `${s.icon} ${s.name}`, value: s.value_cents, note: `${s.orders} orders` }))} format={money} />
        </div>
        <div className="card">
          <h3>Engagements by tier</h3>
          <HBars label="Engagements by tier" items={d.by_tier.map((t) => ({ label: t.tier, value: t.orders }))} />
          <h3 className="mt-lg">Latest activity</h3>
          <ul className="feed">
            {d.recent_events.map((e) => <li key={e.id} className={`feed__item feed__item--${e.level}`}><span>{e.message}</span><small>{timeAgo(e.created_at)}</small></li>)}
          </ul>
          <Link to="/admin/activity" className="small">Full activity log →</Link>
        </div>
      </div>
      <div className="quick-links">
        <Link to="/admin/leads" className="btn btn--outline btn--sm">Review leads</Link>
        <Link to="/admin/invoices" className="btn btn--outline btn--sm">Chase invoices</Link>
        <Link to="/admin/testimonials" className="btn btn--outline btn--sm">Moderate reviews</Link>
        <Link to="/admin/blog/new" className="btn btn--outline btn--sm">Write an article</Link>
      </div>
    </>
  );
}
