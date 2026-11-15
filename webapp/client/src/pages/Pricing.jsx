import { useState } from 'react';
import { Link } from 'react-router-dom';
import TierCard from '../components/TierCard.jsx';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';

export default function Pricing() {
  const { data, error, loading } = useFetch('/services?include=tiers');
  const [active, setActive] = useState('all');
  const shown = data?.filter((s) => active === 'all' || s.slug === active) ?? [];
  return (
    <>
      <PageHeader eyebrow="Pricing" title="Transparent pricing, three tiers per service">
        <p>Projects require a 50% deposit; retainers are billed monthly. No hidden fees, cancel retainers with 30 days’ notice.</p>
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
