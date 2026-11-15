import { useState } from 'react';
import { Link, NavLink, Route, Routes, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Loader, Progress, Status } from '../components/ui.jsx';
import { billingLabel, date, money } from '../format.js';
import { useFetch } from '../useFetch.js';

const TABS = [['', 'Overview'], ['orders', 'Engagements'], ['leads', 'Leads'], ['clients', 'Users'], ['invoices', 'Invoices'], ['catalog', 'Catalog']];

export default function Admin() {
  return (
    <section className="section portal admin">
      <div className="container">
        <div className="portal__head">
          <div><span className="eyebrow">Operations</span><h1>Agency dashboard</h1></div>
        </div>
        <nav className="tabs" aria-label="Admin sections">
          {TABS.map(([p, l]) => <NavLink key={p} end to={`/admin${p && `/${p}`}`} className="tabs__tab">{l}</NavLink>)}
        </nav>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="orders" element={<Orders />} />
          <Route path="leads" element={<Leads />} />
          <Route path="clients" element={<Users />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="catalog" element={<Catalog />} />
        </Routes>
      </div>
    </section>
  );
}

function Overview() {
  const { data: d, error, loading } = useFetch('/admin/overview');
  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const max = Math.max(1, ...d.by_service.map((s) => s.value_cents));
  const tierMax = Math.max(1, ...d.by_tier.map((t) => t.orders));
  return (
    <>
      <div className="kpis">
        <div className="kpi"><span>Revenue collected</span><strong>{money(d.revenue_paid_cents)}</strong></div>
        <div className="kpi"><span>Outstanding</span><strong>{money(d.outstanding_cents)}</strong>{d.overdue_invoices > 0 && <small className="text-error">{d.overdue_invoices} overdue</small>}</div>
        <div className="kpi"><span>Active engagements</span><strong>{d.active_orders}</strong><small>{d.pending_orders} pending</small></div>
        <div className="kpi"><span>New leads</span><strong>{d.new_leads}</strong><small>{d.clients} clients · {d.subscribers} subscribers</small></div>
      </div>
      <div className="grid grid--order">
        <div className="card">
          <h2>Pipeline value by service</h2>
          <ul className="bars">
            {d.by_service.map((s) => (
              <li key={s.name}>
                <span className="bars__label">{s.icon} {s.name}</span>
                <span className="bars__track"><span style={{ width: `${(s.value_cents / max) * 100}%` }} /></span>
                <span className="bars__value">{money(s.value_cents)} · {s.orders}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2>Engagements by tier</h2>
          <ul className="bars">
            {d.by_tier.map((t) => (
              <li key={t.tier}>
                <span className="bars__label">{t.tier}</span>
                <span className="bars__track"><span style={{ width: `${(t.orders / tierMax) * 100}%` }} /></span>
                <span className="bars__value">{t.orders}</span>
              </li>
            ))}
          </ul>
          <div className="quick-links">
            <Link to="/admin/leads" className="btn btn--outline btn--sm">Review leads</Link>
            <Link to="/admin/invoices?status=unpaid" className="btn btn--outline btn--sm">Chase invoices</Link>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusFilter({ value, onChange, options }) {
  return (
    <div className="filters">
      {['', ...options].map((s) => (
        <button key={s} className={`chip ${value === s ? 'chip--active' : ''}`} onClick={() => onChange(s)}>{s ? s.replace('_', ' ') : 'All'}</button>
      ))}
    </div>
  );
}

function Orders() {
  const [status, setStatus] = useState('');
  const { data, error, loading } = useFetch(`/orders?status=${status}`);
  return (
    <>
      <StatusFilter value={status} onChange={setStatus} options={['pending', 'active', 'in_review', 'completed', 'cancelled']} />
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Ref</th><th>Client</th><th>Service</th><th>Value</th><th>Progress</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {data?.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/portal/orders/${o.id}`}>{o.reference}</Link></td>
                <td>{o.client_name}<small>{o.client_company}</small></td>
                <td>{o.service_icon} {o.service_name}<small>{o.tier_name}</small></td>
                <td>{money(o.price_cents)}<small>{billingLabel(o.billing)}</small></td>
                <td className="w-progress"><Progress value={o.progress} /></td>
                <td>{date(o.due_date)}</td>
                <td><Status value={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="empty">No engagements.</p>}
      </div>
    </>
  );
}

function Leads() {
  const [status, setStatus] = useState('');
  const { data, error, loading, setData } = useFetch(`/admin/leads?status=${status}`);
  const [open, setOpen] = useState(null);
  const update = async (lead, s) => {
    const updated = await api(`/admin/leads/${lead.id}`, { method: 'PATCH', body: { status: s } });
    setData(data.map((l) => (l.id === lead.id ? { ...l, ...updated } : l)));
  };
  return (
    <>
      <StatusFilter value={status} onChange={setStatus} options={['new', 'contacted', 'qualified', 'won', 'lost']} />
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Received</th><th>Contact</th><th>Service</th><th>Budget</th><th>Message</th><th>Status</th></tr></thead>
          <tbody>
            {data?.map((l) => (
              <tr key={l.id}>
                <td>{date(l.created_at)}</td>
                <td>{l.name}<small><a href={`mailto:${l.email}`}>{l.email}</a>{l.company && ` · ${l.company}`}</small></td>
                <td>{l.service_name || '—'}</td>
                <td>{l.budget || '—'}</td>
                <td className="w-message">
                  <button className="btn--link" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    {open === l.id ? l.message : `${l.message.slice(0, 60)}${l.message.length > 60 ? '…' : ''}`}
                  </button>
                </td>
                <td>
                  <select className="input input--sm" aria-label="Lead status" value={l.status} onChange={(e) => update(l, e.target.value)}>
                    {['new', 'contacted', 'qualified', 'won', 'lost'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="empty">No leads yet.</p>}
      </div>
    </>
  );
}

function Users() {
  const { user } = useAuth();
  const [role, setRole] = useState('');
  const { data, error, loading, setData } = useFetch(`/admin/users?role=${role}`);
  const [err, setErr] = useState(null);
  const change = async (u, r) => {
    setErr(null);
    try {
      const updated = await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { role: r } });
      setData(data.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
    } catch (e) { setErr(e); }
  };
  return (
    <>
      <StatusFilter value={role} onChange={setRole} options={['client', 'staff', 'admin']} />
      {loading && !data && <Loader />}
      <ErrorBox error={error || err} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Name</th><th>Company</th><th>Joined</th><th>Engagements</th><th>Lifetime paid</th><th>Role</th></tr></thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<small>{u.email}</small></td>
                <td>{u.company || '—'}</td>
                <td>{date(u.created_at)}</td>
                <td>{u.order_count}</td>
                <td>{money(u.lifetime_cents)}</td>
                <td>
                  {user.role === 'admin' && u.id !== user.id ? (
                    <select className="input input--sm" aria-label="Role" value={u.role} onChange={(e) => change(u, e.target.value)}>
                      {['client', 'staff', 'admin'].map((r) => <option key={r}>{r}</option>)}
                    </select>
                  ) : <span className="tag">{u.role}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Invoices() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || '');
  const { data, error, loading, setData } = useFetch(`/admin/invoices?status=${status}`);
  const update = async (inv, s) => {
    const updated = await api(`/admin/invoices/${inv.id}`, { method: 'PATCH', body: { status: s } });
    setData(data.map((i) => (i.id === inv.id ? { ...i, ...updated } : i)));
  };
  const total = data?.reduce((a, i) => a + i.amount_cents, 0) ?? 0;
  return (
    <>
      <StatusFilter value={status} onChange={setStatus} options={['unpaid', 'paid', 'void']} />
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Number</th><th>Client</th><th>Engagement</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {data?.map((i) => {
              const overdue = i.status === 'unpaid' && i.due_at < new Date().toISOString().slice(0, 10);
              return (
                <tr key={i.id}>
                  <td>{i.number}</td>
                  <td>{i.client_name}</td>
                  <td><Link to={`/portal/orders/${i.order_id}`}>{i.reference}</Link><small>{i.service_name}</small></td>
                  <td>{date(i.issued_at)}</td>
                  <td className={overdue ? 'text-error' : ''}>{date(i.due_at)}{overdue && <small>overdue</small>}</td>
                  <td>{money(i.amount_cents)}</td>
                  <td>
                    <select className="input input--sm" aria-label="Invoice status" value={i.status} onChange={(e) => update(i, e.target.value)}>
                      {['unpaid', 'paid', 'void'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><th colSpan={5}>Total</th><th>{money(total)}</th><th /></tr></tfoot>
        </table>
      </div>
    </>
  );
}

function Catalog() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch('/services?include=tiers');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  if (loading && !data) return <Loader />;
  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/admin/tiers/${editing.id}`, { method: 'PATCH', body: {
        name: editing.name,
        price_cents: Math.round(Number(editing.price) * 100),
        delivery_days: Number(editing.delivery_days),
        summary: editing.summary,
        features: editing.featuresText.split('\n').map((f) => f.trim()).filter(Boolean),
        is_popular: editing.is_popular,
      } });
      setEditing(null);
      reload();
    } catch (e2) { setErr(e2); }
  };
  return (
    <>
      <ErrorBox error={error} />
      {user.role !== 'admin' && <p className="muted">Only admins can edit tiers.</p>}
      {data?.map((s) => (
        <div key={s.slug} className="card catalog-row">
          <h3>{s.icon} {s.name}</h3>
          <div className="catalog-row__tiers">
            {s.tiers.map((t) => (
              <div key={t.id} className={`catalog-tier ${t.is_popular ? 'catalog-tier--popular' : ''}`}>
                <strong>{t.name}</strong>
                <span>{money(t.price_cents)} {billingLabel(t.billing)}</span>
                <small>{t.features.length} features · {t.delivery_days} days</small>
                {user.role === 'admin' && (
                  <button className="btn btn--text btn--sm" onClick={() => setEditing({ ...t, price: t.price_cents / 100, featuresText: t.features.join('\n') })}>Edit</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {editing && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Edit tier" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="card form modal__card" onSubmit={save}>
            <h2>Edit tier</h2>
            <ErrorBox error={err} />
            <label className="field"><span className="field__label">Name</span><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <div className="form__row">
              <label className="field"><span className="field__label">Price ($)</span><input className="input" type="number" min="0" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></label>
              <label className="field"><span className="field__label">Delivery days</span><input className="input" type="number" min="1" value={editing.delivery_days} onChange={(e) => setEditing({ ...editing, delivery_days: e.target.value })} /></label>
            </div>
            <label className="field"><span className="field__label">Summary</span><input className="input" value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} /></label>
            <label className="field"><span className="field__label">Features (one per line)</span><textarea className="input" rows={6} value={editing.featuresText} onChange={(e) => setEditing({ ...editing, featuresText: e.target.value })} /></label>
            <label className="checkbox"><input type="checkbox" checked={!!editing.is_popular} onChange={(e) => setEditing({ ...editing, is_popular: e.target.checked })} /><span>Highlight as most popular</span></label>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn--primary">Save tier</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
