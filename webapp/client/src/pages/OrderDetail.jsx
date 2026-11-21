import { CareSection, CareUsage } from '../components/Care.jsx';
import AgreementPanel from '../components/AgreementPanel.jsx';
import DesignStudio from '../components/DesignStudio.jsx';
import EngagementReports from '../components/EngagementReports.jsx';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Loader, Progress, Status } from '../components/ui.jsx';
import { billingLabel, date, dateTime, money, moneyExact } from '../format.js';
import { useFetch } from '../useFetch.js';
import NotFound from './NotFound.jsx';
import Seo from '../components/Seo.jsx';
import PayButton from '../components/PayButton.jsx';
import { FeedbackPanel, HealthBadge, MilestoneTimeline, OnboardingPanel, STAGE_LABEL, StageStrip } from '../components/Pipeline.jsx';

const STATUSES = ['pending', 'active', 'in_review', 'completed', 'cancelled'];

export default function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { isStaff, user } = useAuth();
  const { data: o, error, loading, reload } = useFetch(`/orders/${id}`);
  const [msg, setMsg] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading && !o) return <Loader />;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;

  const run = async (fn) => {
    setBusy(true); setActionError(null);
    try { await fn(); reload(); } catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const send = (e) => { e.preventDefault(); if (msg.trim()) run(async () => { await api(`/orders/${o.id}/messages`, { method: 'POST', body: { body: msg } }); setMsg(''); }); };
  const update = (body) => run(() => api(`/orders/${o.id}`, { method: 'PATCH', body }));
  const isClient = o.user_id === user.id;
  const p = o.pipeline;
  const rebaseline = () => run(() => api(`/orders/${o.id}/rebaseline`, { method: 'POST', body: {} }));
  const nextCycle = () => window.confirm('Start the next month now? This creates the month’s milestones and issues the monthly invoice.') && run(() => api(`/orders/${o.id}/next-cycle`, { method: 'POST' }));
  const cancel = () => window.confirm('Cancel this engagement?') && run(() => api(`/orders/${o.id}/cancel`, { method: 'POST' }));

  const outstanding = o.invoices.filter((i) => i.status === 'unpaid');

  return (
    <section className="section portal">
      <Seo title={`Engagement ${o.reference}`} noindex />
      <div className="container">
        <nav className="breadcrumb breadcrumb--dark"><Link to={isStaff && o.user_id !== user.id ? '/admin/orders' : '/portal'}>Engagements</Link> / <span>{o.reference}</span></nav>
        {params.get('new') && o.status === 'pending' && (
          <div className="alert alert--success">🎉 Order placed! Pay the first invoice by card or instant EFT to kick things off — you can start onboarding straight away.</div>
        )}
        <ErrorBox error={actionError} />
        <div className="order-head card">
          <span className="order-row__icon">{o.service_icon}</span>
          <div className="order-head__main">
            <h1>{o.service_name} — {o.tier_name}</h1>
            <p className="muted">{o.reference} · {money(o.price_cents)} {billingLabel(o.billing)} · due {date(o.due_date)}{o.manager_name && ` · lead: ${o.manager_name}`}</p>
            <Progress value={o.progress} />
            <small className="muted">{o.progress}% complete{o.pipeline_kind === 'retainer' && o.current_cycle ? ` · month ${o.current_cycle}` : ''}</small>
            {p && (
              <div className="pipeline-summary">
                <span><strong>Stage:</strong> {STAGE_LABEL[p.stage] || p.stage_label}</span>
                <HealthBadge health={p.health} />
                {p.next && <span><strong>Next:</strong> {p.next.title}{p.next.due_date && ` · due ${date(p.next.due_date)}`}</span>}
                <span className="muted">{o.revisions_allowed === null ? 'Unlimited revisions' : `${o.revisions_allowed} revision rounds per deliverable`}</span>
              </div>
            )}
          </div>
          <div className="order-head__side">
            <Status value={o.status} />
            {o.status === 'pending' && o.user_id === user.id && <button className="btn btn--text btn--sm" onClick={cancel} disabled={busy}>Cancel order</button>}
          </div>
        </div>

        {isStaff && (
          <div className="card staff-panel">
            <h3>Staff controls</h3>
            <p className="muted small">Client: {o.client_name} ({o.client_email}){o.client_company && `, ${o.client_company}`}</p>
            <div className="staff-panel__row">
              <label>Status
                <select className="input" value={o.status} onChange={(e) => update({ status: e.target.value })} disabled={busy}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label>Due date
                <input type="date" className="input" value={o.due_date || ''} onChange={(e) => update({ due_date: e.target.value || null })} disabled={busy} />
              </label>
              <button className="btn btn--outline btn--sm" disabled={busy} onClick={() => {
                const v = window.prompt('Invoice amount in rand (excl. VAT)');
                const cents = Math.round(Number(String(v).replace(/[^\d.]/g, '')) * 100);
                const description = cents > 0 ? window.prompt('Description (e.g. Balance on delivery)', 'Balance on delivery') : null;
                if (cents > 0) run(() => api(`/orders/${o.id}/invoices`, { method: 'POST', body: { amount_cents: cents, description: description || '', due_in_days: 14 } }));
              }}>+ Issue invoice</button>
              <button className="btn btn--ghost btn--sm" disabled={busy} onClick={rebaseline} title="Re-plan open milestones from today">↻ Re-plan timeline</button>
              {o.pipeline_kind === 'retainer' && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={nextCycle}>Start next month</button>}
            </div>
            {o.nps_score !== null && o.nps_score !== undefined && <p className="small mt">Client rating: <strong>{o.nps_score}/10</strong>{o.nps_comment && ` — “${o.nps_comment}”`}</p>}
          </div>
        )}

        <AgreementPanel order={o} canSign={isClient} onSigned={reload} />

        {o.care_usage && <div className="card"><CareUsage usage={o.care_usage} /></div>}

        {o.status === 'completed' && isClient && <FeedbackPanel order={o} onSaved={reload} />}

        {o.care_offer && !o.care_offer.existing && (o.delivered_at || o.status === 'completed') && (
          <section className="card care-offer" id="care" aria-label="Care plans">
            <p className="care-offer__note">{o.support_ends_at
              ? (o.support_ends_at > new Date().toISOString().replace('T', ' ') ? `🛟 Your free post-launch support runs until ${date(o.support_ends_at)}.` : `🛟 Your free post-launch support ended on ${date(o.support_ends_at)}.`)
              : '🛟 Your project is live.'} Keep it maintained with a monthly care plan:</p>
            <CareSection care={o.care_offer} covers={isClient ? o.id : null} heading="h2" />
          </section>
        )}
        {o.care_offer?.existing && o.plan !== 'care' && (
          <p className="care-offer__covered">🛟 Looked after by care plan <Link to={`/portal/orders/${o.care_offer.existing.id}`}>{o.care_offer.existing.reference}</Link> ({o.care_offer.existing.status}).</p>
        )}

        {o.onboarding?.length > 0 && o.status !== 'cancelled' && (
          <OnboardingPanel order={o} items={o.onboarding} canEdit={isClient || isStaff} isStaff={isStaff} onSaved={reload} />
        )}

        {o.service_slug === 'design' && o.status !== 'cancelled' && <DesignStudio order={o} isStaff={isStaff} />}
        {o.status !== 'cancelled' && o.status !== 'pending' && <EngagementReports order={o} isStaff={isStaff} />}

        <section className="card pipeline-card" aria-labelledby="delivery-h">
          <div className="pipeline-card__head">
            <h2 id="delivery-h">Delivery plan</h2>
            <span className="muted small">{o.milestones.filter((m) => m.status === 'done').length}/{o.milestones.length} milestones done</span>
          </div>
          <StageStrip milestones={o.milestones.filter((m) => m.stage !== 'cycle' || m.cycle === o.current_cycle)} current={p?.stage} />
          <MilestoneTimeline order={o} milestones={o.milestones} isClient={isClient} isStaff={isStaff} onChanged={reload} />
        </section>

        <div className="grid grid--order">
          <div className="card">
            <h2>Brief</h2>
            <p className="brief">{o.brief}</p>
          </div>
          <div className="card">
            <h2>Invoices</h2>
            {o.autopay_status === 'active' && (
              <div className="autopay">
                <span>🔁 <strong>Automatic monthly payments on</strong> — {moneyExact(o.autopay_amount_cents)} charged to your card via PayFast each month{o.autopay_since && ` since ${date(o.autopay_since)}`}.</span>
                {(isClient || isStaff) && <button className="btn btn--text btn--sm" disabled={busy} onClick={() => {
                  if (window.confirm('Stop automatic monthly payments? Future invoices will need to be paid manually.')) run(() => api(`/orders/${o.id}/autopay/cancel`, { method: 'POST' }));
                }}>Stop automatic payments</button>}
              </div>
            )}
            {o.autopay_status === 'cancelled' && <p className="muted small">Automatic payments were stopped — monthly invoices are paid manually.</p>}
            {outstanding.length > 0 && <p className="muted small">{money(outstanding.reduce((a, i) => a + i.amount_cents, 0))} outstanding</p>}
            <ul className="invoices">
              {o.invoices.map((inv) => (
                <li key={inv.id}>
                  <div>
                    <strong><Link to={`/portal/orders/${o.id}/invoices/${inv.id}`} title="View / print invoice">{inv.number}</Link></strong>{inv.description && <span className="muted"> · {inv.description}</span>}
                    <small>Issued {date(inv.issued_at)} · due {date(inv.due_at)}{inv.vat_cents > 0 && ` · incl. VAT ${moneyExact(inv.vat_cents)}`}</small>
                  </div>
                  <div className="invoices__side">
                    <span>{moneyExact(inv.amount_cents)}</span>
                    <Status value={inv.status} />
                  </div>
                  {inv.status === 'unpaid' && o.user_id === user.id && (o.agreement?.requires_signature && o.agreement.status !== 'signed'
                    ? <div className="invoices__pay"><a className="btn btn--outline btn--sm" href="#agreement">Sign the agreement to pay</a></div>
                    : <div className="invoices__pay"><PayButton invoice={inv} order={o} onError={setActionError} /></div>)}
                </li>
              ))}
            </ul>
            {o.payments?.length > 0 && (
              <details className="payments-log">
                <summary>Payment history ({o.payments.length})</summary>
                <ul>{o.payments.map((p) => (
                  <li key={p.reference}><span>{dateTime(p.created_at)} · {p.gateway} · {p.invoice_number}</span><span>{moneyExact(p.amount_cents)} <Status value={p.status} /></span></li>
                ))}</ul>
              </details>
            )}
            <p className="muted small">🔒 Secure payments by PayFast & Ozow. We never see your card or banking details.</p>
          </div>
        </div>

        <div className="card mt-lg">
          <h2>Messages</h2>
          <ul className="thread">
            {o.messages.length === 0 && <li className="muted">No messages yet. Say hello to your team!</li>}
            {o.messages.map((m) => (
              <li key={m.id} className={m.author_role === 'client' ? 'thread__client' : 'thread__staff'}>
                <div className="thread__meta"><strong>{m.author_name}</strong>{m.author_role !== 'client' && <span className="tag">Hipcastle</span>}<small>{date(m.created_at)}</small></div>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
          <form className="thread__form" onSubmit={send}>
            <textarea className="input" rows={3} placeholder="Write a message…" aria-label="Message" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button className="btn btn--primary" disabled={busy || !msg.trim()}>Send</button>
          </form>
        </div>
      </div>
    </section>
  );
}
