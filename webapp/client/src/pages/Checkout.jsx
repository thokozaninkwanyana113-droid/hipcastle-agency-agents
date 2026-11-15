import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Field, Loader } from '../components/ui.jsx';
import Seo from '../components/Seo.jsx';
import { PaymentBadges } from '../components/icons.jsx';
import { billingLabel, money, moneyExact } from '../format.js';
import { useFetch } from '../useFetch.js';
import { useSite } from '../context/SiteContext.jsx';

export default function Checkout() {
  const { tierId } = useParams();
  const navigate = useNavigate();
  const site = useSite();
  const { data: services, error, loading } = useFetch('/services?include=tiers');
  const [brief, setBrief] = useState('');
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const found = useMemo(() => {
    for (const s of services || []) {
      const t = s.tiers.find((x) => x.id === Number(tierId));
      if (t) return { service: s, tier: t };
    }
    return null;
  }, [services, tierId]);

  if (loading) return <Loader />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;
  if (!found) return <div className="container section"><ErrorBox error={{ message: 'That package no longer exists.' }} /><Link to="/pricing">Back to pricing</Link></div>;

  const { service, tier } = found;
  const subtotal = tier.billing === 'once' ? Math.round(tier.price_cents / 2) : tier.price_cents;
  const vat = site.vat_registered ? Math.round((subtotal * site.vat_rate) / 100) : 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const order = await api('/orders', { method: 'POST', body: { tier_id: tier.id, brief } });
      navigate(`/portal/orders/${order.id}?new=1`);
    } catch (e2) { setErr(e2.fields?.brief ? { message: e2.fields.brief } : e2); setBusy(false); }
  };

  return (
    <section className="section">
      <Seo title="Checkout" noindex />
      <div className="container layout-sidebar">
        <form className="card form" onSubmit={submit}>
          <nav className="breadcrumb breadcrumb--dark"><Link to={`/services/${service.slug}`}>{service.name}</Link> / <span>Checkout</span></nav>
          <h1>Start your engagement</h1>
          <p className="muted">Tell us about the project. Your dedicated lead will confirm scope at kick-off. You’ll pay the {tier.billing === 'once' ? 'deposit' : 'first month'} securely on the next screen.</p>
          {!site.orders_enabled && <div className="alert alert--error">We’re not taking new online orders right now — please <Link to="/contact">contact us</Link>.</div>}
          <ErrorBox error={err} />
          <Field label="Project brief *" hint="What do you sell, who are your customers, deadlines, and links to existing website or socials.">
            <textarea className="input" rows={8} value={brief} onChange={(e) => setBrief(e.target.value)} required minLength={20} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I agree to the <Link to="/terms" target="_blank">terms of service</Link> and <Link to="/privacy" target="_blank">privacy policy</Link>.</span>
          </label>
          <button className="btn btn--primary btn--lg" disabled={!agree || busy || brief.trim().length < 20 || !site.orders_enabled}>{busy ? 'Placing order…' : 'Place order & continue to payment'}</button>
          <PaymentBadges />
        </form>
        <aside className="sidebar">
          <div className="card summary">
            <span className="summary__icon" aria-hidden="true">{service.icon}</span>
            <h2 className="h3">{service.name}</h2>
            <p className="tag">{tier.name} tier</p>
            <ul className="tier__features">{tier.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <dl className="summary__lines">
              <div><dt>Package price</dt><dd>{money(tier.price_cents)} <small>{billingLabel(tier.billing)}</small></dd></div>
              <div><dt>{tier.billing === 'once' ? 'Deposit (50%)' : 'First month'}</dt><dd>{moneyExact(subtotal)}</dd></div>
              {site.vat_registered && <div><dt>VAT ({site.vat_rate}%)</dt><dd>{moneyExact(vat)}</dd></div>}
              <div className="summary__total"><dt>Due now</dt><dd><strong>{moneyExact(subtotal + vat)}</strong></dd></div>
            </dl>
            <p className="muted small">Pay by card, instant EFT, SnapScan or Zapper via PayFast, or instant EFT via Ozow. We never see your card or banking details.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
