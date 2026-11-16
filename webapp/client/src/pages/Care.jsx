// Care plans: aftercare, maintenance & hosting for every service.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Seo, { breadcrumbSchema, faqSchema } from '../components/Seo.jsx';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import { CareSection } from '../components/Care.jsx';
import { Faq } from '../components/Testimonials.jsx';
import { money } from '../format.js';
import { useFetch } from '../useFetch.js';
import { useSite } from '../context/SiteContext.jsx';
import { openChat } from '../components/ChatWidget.jsx';

export default function Care() {
  const site = useSite();
  const { hash } = useLocation();
  const { data, error, loading } = useFetch('/care');
  const [active, setActive] = useState('engineering');
  useEffect(() => { if (hash && data?.services.some((s) => s.slug === hash.slice(1))) setActive(hash.slice(1)); }, [hash, data]);
  const svc = data?.services.find((s) => s.slug === active) || data?.services[0];
  const from = data ? Math.min(...data.services.flatMap((s) => s.tiers.map((t) => t.price_cents))) : null;
  const extra = data ? money(data.extra_hour_cents) : '';
  const faqs = data ? [
    { q: 'What happens when my free post-launch support ends?', a: 'Every once-off project includes free support after launch (14, 30 or 60 days depending on the package). A week before it ends we email you the care plans for your service. Without one, changes and fixes are quoted per job.' },
    { q: 'Is hosting included?', a: 'Website & App Care includes South African hosting, SSL and backups on every tier; Enterprise Care uses load-shedding-resilient cloud hosting. Game, XR and automation care plans include hosting where listed. Everything is set up in your name — you own it.' },
    { q: 'What if I need more than my included hours?', a: `We tell you when this month’s hours are used up. Monitoring, backups and urgent outage fixes continue; anything else is quoted first at ${extra}/hour, or scheduled for next month when your hours reset.` },
    { q: 'Do unused hours roll over?', a: 'No — included hours reset every month. That keeps prices low and our team available for you each month.' },
    { q: 'Can I cancel?', a: 'Yes. Care plans are month-to-month with 30 days’ notice and no lock-in contract.' },
    { q: 'Can you look after something another agency built?', a: 'Usually, yes. We start with an access handover and a baseline health check; if anything needs fixing first we quote it before you commit.' },
  ] : [];
  return (
    <>
      <Seo title="Website Maintenance, Hosting & Care Plans in South Africa"
        description={`Monthly care plans for websites, apps, brands, marketing and more — maintenance, hosting, updates and support${from ? ` from ${money(from)}/month` : ''}. Month-to-month, no lock-in.`}
        schema={[breadcrumbSchema([{ name: 'Care plans', path: '/care' }]), faqSchema(faqs)]} />
      <PageHeader eyebrow="Care plans" title="Keep what we build working, long after launch">
        <p>Maintenance, hosting, updates and a monthly allowance of expert time — for every service, priced for South African businesses{from ? `, from ${money(from)} a month` : ''}{site.vat_registered ? ' excl. VAT' : ''}.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          {loading && <Loader />}
          <ErrorBox error={error} />
          {data && (
            <>
              <ul className="care-terms">{data.terms.map((t) => <li key={t}>✓ {t}</li>)}</ul>
              <div className="filters" role="tablist" aria-label="Choose a service">
                {data.services.map((s) => (
                  <button key={s.slug} role="tab" aria-selected={svc?.slug === s.slug} className={`chip ${svc?.slug === s.slug ? 'chip--active' : ''}`}
                    onClick={() => { setActive(s.slug); window.history.replaceState(null, '', `#${s.slug}`); }}>
                    {s.icon} {s.title}
                  </button>
                ))}
              </div>
              {svc && <div role="tabpanel"><CareSection care={svc} /><p className="center small"><Link to={`/services/${svc.slug}`}>About our {svc.name} service →</Link></p></div>}
            </>
          )}
        </div>
      </section>
      <section className="section section--alt" aria-labelledby="care-how">
        <div className="container">
          <div className="section__head"><span className="eyebrow">How it works</span><h2 id="care-how">From launch to looked-after</h2></div>
          <ol className="steps">
            <li className="step"><span className="step__n">01</span><h3>Free support after launch</h3><p>The team that built it fixes launch issues during your package’s support window.</p></li>
            <li className="step"><span className="step__n">02</span><h3>Choose a care plan</h3><p>Add one from this page or your client portal — we remind you a week before free support ends.</p></li>
            <li className="step"><span className="step__n">03</span><h3>Handover & health check</h3><p>We confirm access (invites, never passwords) and send a baseline health report.</p></li>
            <li className="step"><span className="step__n">04</span><h3>Monthly care</h3><p>Updates, monitoring and your requests via support tickets — with time used shown in your portal.</p></li>
          </ol>
        </div>
      </section>
      {faqs.length > 0 && (
        <section className="section" aria-labelledby="care-faq">
          <div className="container container--narrow">
            <div className="section__head"><span className="eyebrow">FAQ</span><h2 id="care-faq">Care plan questions</h2></div>
            <Faq items={faqs} />
            <p className="center mt-lg"><button className="btn btn--outline" onClick={() => openChat('Which care plan do I need?')}>💬 Not sure which plan? Ask our assistant</button></p>
          </div>
        </section>
      )}
    </>
  );
}
