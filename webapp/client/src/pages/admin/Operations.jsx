import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBox, Loader, Progress, Status } from '../../components/ui.jsx';
import { billingLabel, date, money, moneyExact, waLink } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { ExportButton, PanelHead, StatusFilter } from './shared.jsx';

export function Engagements() {
  const [status, setStatus] = useState('');
  const { data, error, loading } = useFetch(`/orders?status=${status}`);
  return (
    <>
      <PanelHead title="Engagements" sub="Every order placed through the website. Open one to update status, milestones and invoices." />
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

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];
export function Leads() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const { data, error, loading, setData } = useFetch(`/admin/leads?status=${status}`);
  const [open, setOpen] = useState(null);
  const update = async (lead, s) => {
    const updated = await api(`/admin/leads/${lead.id}`, { method: 'PATCH', body: { status: s } });
    setData(data.map((l) => (l.id === lead.id ? { ...l, ...updated } : l)));
  };
  return (
    <>
      <PanelHead title="Leads & CRM" sub="Strategy-session requests from the contact form. Move each lead through the pipeline.">
        {user.role === 'admin' && <ExportButton kind="leads" />}
      </PanelHead>
      <StatusFilter value={status} onChange={setStatus} options={LEAD_STATUSES} />
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Received</th><th>Contact</th><th>Interest</th><th>Message</th><th>Reach via</th><th>Status</th></tr></thead>
          <tbody>
            {data?.map((l) => (
              <tr key={l.id}>
                <td className="nowrap">{date(l.created_at)}</td>
                <td>{l.name}<small>{l.company}{l.province && ` · ${l.province}`}</small></td>
                <td>{l.service_name || '—'}<small>{l.budget}</small></td>
                <td className="w-message">
                  <button className="btn--link" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    {open === l.id ? l.message : `${l.message.slice(0, 70)}${l.message.length > 70 ? '…' : ''}`}
                  </button>
                </td>
                <td className="nowrap">
                  <a href={`mailto:${l.email}`} title={l.email}>✉️</a>{' '}
                  {l.phone && <a href={`tel:${l.phone}`} title={l.phone}>📞</a>}{' '}
                  {l.phone && <a href={waLink(l.phone.replace(/\D/g, '').replace(/^0/, '27'), `Hi ${l.name.split(' ')[0]}, thanks for contacting Hipcastle!`)} target="_blank" rel="noreferrer" title="WhatsApp">💬</a>}
                  {l.preferred_contact && <small>prefers {l.preferred_contact}</small>}
                </td>
                <td>
                  <select className="input input--sm" aria-label="Lead status" value={l.status} onChange={(e) => update(l, e.target.value)}>
                    {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
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

export function Users() {
  const { user } = useAuth();
  const [role, setRole] = useState('');
  const { data, error, loading, setData } = useFetch(`/admin/users?role=${role}`);
  const [err, setErr] = useState(null);
  const change = async (u, r) => {
    if (!window.confirm(`Change ${u.name}'s role to ${r}?`)) return;
    setErr(null);
    try {
      const updated = await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { role: r } });
      setData(data.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
    } catch (e) { setErr(e); }
  };
  return (
    <>
      <PanelHead title="Users & clients" sub="Client accounts and staff access.">{user.role === 'admin' && <ExportButton kind="clients" />}</PanelHead>
      <StatusFilter value={role} onChange={setRole} options={['client', 'staff', 'admin']} />
      {loading && !data && <Loader />}
      <ErrorBox error={error || err} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Name</th><th>Company</th><th>Joined</th><th>Engagements</th><th>Lifetime paid</th><th>Role</th></tr></thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<small>{u.email}{u.phone && ` · ${u.phone}`}</small></td>
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

export function Invoices() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || '');
  const { data, error, loading, setData } = useFetch(`/admin/invoices?status=${status}`);
  const update = async (inv, s) => {
    if (!window.confirm(`Manually mark ${inv.number} as ${s}? This is logged.`)) return;
    const updated = await api(`/admin/invoices/${inv.id}`, { method: 'PATCH', body: { status: s } });
    setData(data.map((i) => (i.id === inv.id ? { ...i, ...updated } : i)));
  };
  const total = data?.reduce((a, i) => a + i.amount_cents, 0) ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PanelHead title="Invoices" sub="Invoices are marked paid automatically when PayFast/Ozow confirm payment. Use manual changes only for EFTs.">
        {user.role === 'admin' && <ExportButton kind="invoices" />}
      </PanelHead>
      <StatusFilter value={status} onChange={setStatus} options={['unpaid', 'paid', 'void']} />
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Number</th><th>Client</th><th>Engagement</th><th>Issued</th><th>Due</th><th>VAT</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            {data?.map((i) => {
              const overdue = i.status === 'unpaid' && i.due_at < today;
              return (
                <tr key={i.id}>
                  <td>{i.number}<small>{i.description}</small></td>
                  <td>{i.client_name}</td>
                  <td><Link to={`/portal/orders/${i.order_id}`}>{i.reference}</Link><small>{i.service_name}</small></td>
                  <td>{date(i.issued_at)}</td>
                  <td className={overdue ? 'text-error' : ''}>{date(i.due_at)}{overdue && <small>overdue</small>}</td>
                  <td>{moneyExact(i.vat_cents)}</td>
                  <td>{moneyExact(i.amount_cents)}</td>
                  <td>
                    <select className="input input--sm" aria-label="Invoice status" value={i.status} onChange={(e) => update(i, e.target.value)}>
                      {['unpaid', 'paid', 'void'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><th colSpan={6}>Total</th><th>{moneyExact(total)}</th><th /></tr></tfoot>
        </table>
      </div>
    </>
  );
}
