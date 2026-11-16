import { useState } from 'react';
import { Link } from 'react-router-dom';
import TierCard from '../components/TierCard.jsx';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';
import Seo, { breadcrumbSchema } from '../components/Seo.jsx';
import { useSite } from '../context/SiteContext.jsx';
import { PaymentBadges } from '../components/icons.jsx';

export default function Pricing() {
  const { data, error, loading } = useFetch('/services?include=tiers');
  const site = useSite();
  const [active, setActive] = useState('all');
  const shown = data?.filter((s) => active === 'all' || s.slug === active) ?? [];
  return (
    <>
      <Seo title="Agency Pricing in Rand — 42 Fixed-Price Packages" description="Transparent agency pricing for South African businesses: Essential, Growth and Enterprise packages for every service, priced in rand. Pay by card or instant EFT."
        schema={[breadcrumbSchema([{ name: 'Pricing', path: '/pricing' }])]} />
      <PageHeader eyebrow="Pricing" title="Transparent rand pricing, three tiers per service">
        <p>All prices in South African rand{site.vat_registered ? `, excluding ${site.vat_rate}% VAT` : ''}. Projects: 50% deposit, balance on delivery. Retainers: billed monthly, cancel with 30 days’ notice. No hidden fees. After launch, keep it running with a <Link to="/care">care plan</Link>.</p>
        <div className="mt"><PaymentBadges /></div>
      </PageHeader>
      <section className="section">
        <div className="container">
          {loading && <Loader />}
          <ErrorBox error={error} />
          {data && (
            <div className="filters" role="tablist" aria-label="Filter by service">
              <button role="tab" aria-selected={active === 'all'} className={`chip ${active === 'all' ? 'chip--active' : ''}`} onClick={() => setActive('all')}>All services</button>
              {data.map((s) => (
                <button key={s.slug} role="tab" aria-selected={active === s.slug} className={`chip ${active === s.slug ? 'chip--active' : ''}`} onClick={() => setActive(s.slug)}>
                  {s.icon} {s.name}
                </button>
              ))}
            </div>
          )}
          {shown.map((s) => (
            <div key={s.slug} className="pricing-block">
              <div className="pricing-block__head">
                <h2><span aria-hidden="true">{s.icon}</span> {s.name}</h2>
                <Link to={`/services/${s.slug}`}>Full details →</Link>
              </div>
              <div className="grid grid--tiers">{s.tiers.map((t) => <TierCard key={t.id} tier={t} />)}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
