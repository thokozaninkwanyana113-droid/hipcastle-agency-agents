// Command Centre → Growth: first-party traffic and the acquisition funnel by first-touch source.
import { useState } from 'react';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { useFetch } from '../../useFetch.js';
import { money } from '../../format.js';
import { HBars, PanelHead, StatusFilter, usePolling } from './shared.jsx';

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');

export default function Growth() {
  const [days, setDays] = useState('30');
  const { data: d, error, loading, reload } = useFetch(`/admin/growth?days=${days}`);
  usePolling(reload, 60000);
  if (loading && !d) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const t = d.totals;
  const steps = [['Visitors', t.visitors], ['Leads', t.leads], ['Sign-ups', t.signups], ['Orders', t.orders], ['Paid', t.paid]];
  return (
    <>
      <PanelHead title="Growth" sub="Cookie-free, first-party analytics. Sources are where each person first found you (UTM tags or referring site), carried through to leads, sign-ups and paid orders.">
        <StatusFilter value={days} onChange={(v) => setDays(v || '30')} options={['7', '30', '90']} label="Period in days" />
      </PanelHead>
      <div className="funnel" aria-label="Acquisition funnel">
        {steps.map(([label, n], i) => (
          <div key={label} className="funnel__step">
            <span>{label}</span>
            <strong>{n.toLocaleString('en-ZA')}</strong>
            {i > 0 && <small>{pct(n, steps[i - 1][1])} of {steps[i - 1][0].toLowerCase()}</small>}
          </div>
        ))}
        <div className="funnel__step funnel__step--money"><span>Revenue collected</span><strong>{money(t.revenue_cents)}</strong><small>excl. VAT</small></div>
      </div>

      <div className="card">
        <h3>Daily visitors</h3>
        <div className="spark" role="img" aria-label={`Daily unique visitors over ${d.days} days`}>
          {d.by_day.map((x) => {
            const max = Math.max(1, ...d.by_day.map((y) => y.visitors));
            return <span key={x.day} title={`${x.day}: ${x.visitors} visitors, ${x.views} page views`} style={{ height: `${Math.max(2, (x.visitors / max) * 100)}%` }} />;
          })}
        </div>
        <p className="muted small">{d.traffic.views.toLocaleString('en-ZA')} page views · {d.traffic.unique_visitors.toLocaleString('en-ZA')} daily-unique visitors in the last {d.days} days.</p>
      </div>

      <div className="card">
        <h3>Sources → clients</h3>
        <p className="muted small">Tag links you share with <code>?utm_source=…&amp;utm_medium=…&amp;utm_campaign=…</code> (e.g. <code>?utm_source=whatsapp&amp;utm_medium=status</code>) so campaigns show up here by name.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Source / medium</th><th>Visitors</th><th>Leads</th><th>Sign-ups</th><th>Orders</th><th>Paid</th><th>Visitor → paid</th><th>Revenue</th></tr></thead>
            <tbody>
              {d.funnel.map((r) => (
                <tr key={r.source}>
                  <td>{r.source}</td><td>{r.visitors}</td><td>{r.leads}</td><td>{r.signups}</td><td>{r.orders}</td><td>{r.paid}</td>
                  <td>{pct(r.paid, r.visitors)}</td><td className="nowrap">{money(r.revenue_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.funnel.length === 0 && <p className="empty">No traffic recorded yet. Data appears as soon as people visit the live site.</p>}
        </div>
      </div>

      <div className="card">
        <h3>Top pages</h3>
        {d.top_pages.length ? <HBars label="Top pages by visitors" items={d.top_pages.map((p) => ({ label: p.key, value: p.visitors, note: `${p.views} views` }))} /> : <p className="empty">No page views yet.</p>}
      </div>
    </>
  );
}
