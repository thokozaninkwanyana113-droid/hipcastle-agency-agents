import { siteUrl } from '../siteUrl.js';
import { Link, useParams } from 'react-router-dom';
import TierCard from '../components/TierCard.jsx';
import { ErrorBox, Loader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';
import NotFound from './NotFound.jsx';
import Seo, { breadcrumbSchema, faqSchema } from '../components/Seo.jsx';
import { Faq, TestimonialCard } from '../components/Testimonials.jsx';
import { money } from '../format.js';
import DeliveryJourney from '../components/DeliveryJourney.jsx';

export default function ServiceDetail() {
  const { slug } = useParams();
  const { data: s, error, loading } = useFetch(`/services/${slug}`);
  if (loading) return <Loader />;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;

  const allFeatures = [...new Set(s.tiers.flatMap((t) => t.features))];
  const from = money(s.tiers[0].price_cents);
  const serviceSchema = {
    '@context': 'https://schema.org', '@type': 'Service', name: s.name, serviceType: s.name, description: s.description,
    areaServed: { '@type': 'Country', name: 'South Africa' }, provider: { '@id': siteUrl('/#organization') },
    hasOfferCatalog: { '@type': 'OfferCatalog', name: `${s.name} packages`, itemListElement: s.tiers.map((t) => ({
      '@type': 'Offer', name: `${s.name} — ${t.name}`, price: (t.price_cents / 100).toFixed(2), priceCurrency: 'ZAR', description: t.summary })) },
  };
  return (
    <>
      <Seo title={`${s.name} in South Africa | From ${from}`} description={`${s.tagline} ${s.name} packages from ${from}. Essential, Growth & Enterprise tiers for SA businesses.`.slice(0, 160)}
        schema={[serviceSchema, faqSchema(s.faqs), breadcrumbSchema([{ name: 'Services', path: '/services' }, { name: s.name, path: `/services/${s.slug}` }])]} />
      <section className="page-header page-header--service">
        <div className="container">
          <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/services">Services</Link> / <span>{s.name}</span></nav>
          <span className="page-header__icon" aria-hidden="true">{s.icon}</span>
          <h1>{s.name} <span className="h1-sub">in South Africa</span></h1>
          <p className="page-header__lead">{s.description}</p>
          <ul className="outcomes">{s.outcomes.map((o) => <li key={o}>✓ {o}</li>)}</ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Packages</span>
            <h2>Choose your {s.name.toLowerCase()} tier</h2>
          </div>
          <div className="grid grid--tiers">{s.tiers.map((t) => <TierCard key={t.id} tier={t} />)}</div>

          <div className="table-wrap mt-lg">
            <table className="compare">
              <caption className="sr-only">Feature comparison</caption>
              <thead><tr><th scope="col">What’s included</th>{s.tiers.map((t) => <th key={t.id} scope="col">{t.name}</th>)}</tr></thead>
              <tbody>
                {allFeatures.map((f) => (
                  <tr key={f}><th scope="row">{f}</th>{s.tiers.map((t) => <td key={t.id}>{t.features.includes(f) ? <span className="tick">✓</span> : <span className="dash">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--alt">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Your team</span>
            <h2>{s.agents.length} specialists on this service</h2>
          </div>
          <div className="grid grid--agents">
            {s.agents.map((a) => (
              <Link key={a.slug} to={`/agents/${a.slug}`} className="agent-card">
                <span className="agent-card__emoji">{a.emoji}</span>
                <strong>{a.name}</strong>
                <p>{a.vibe || a.description}</p>
              </Link>
            ))}
          </div>
          {s.testimonials?.length > 0 && (
            <>
              <h2 className="mt-lg center">What clients say about our {s.name.toLowerCase()}</h2>
              <div className="grid grid--testimonials mt">{s.testimonials.map((t) => <TestimonialCard key={t.id} t={t} />)}</div>
            </>
          )}
          <div className="callout mt-lg">
            <div><h3>Not sure which tier fits?</h3><p>Book a free consultation and we’ll recommend the right package.</p></div>
            <Link to={`/contact?service=${s.slug}`} className="btn btn--primary">Talk to a strategist</Link>
          </div>
        </div>
      </section>

      {s.journey && <DeliveryJourney service={s} />}

      <section className="section" aria-labelledby="svc-faq">
        <div className="container container--narrow">
          <div className="section__head"><span className="eyebrow">FAQ</span><h2 id="svc-faq">{s.name}: common questions</h2></div>
          <Faq items={s.faqs} />
        </div>
      </section>
    </>
  );
}
