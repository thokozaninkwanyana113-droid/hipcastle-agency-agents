import { Link } from 'react-router-dom';
import Hero from '../components/Hero.jsx';
import ServiceCard from '../components/ServiceCard.jsx';
import { useFetch } from '../useFetch.js';

const STEPS = [
  { n: '01', t: 'Discover', d: 'A free consultation to understand your goals, constraints and success metrics.' },
  { n: '02', t: 'Assemble', d: 'We hand-pick specialists from 14 divisions and match them to the right tier.' },
  { n: '03', t: 'Deliver', d: 'Milestone-based delivery with progress, invoices and messages in your portal.' },
  { n: '04', t: 'Optimise', d: 'Reality-checked QA, measurable outcomes and continuous improvement.' },
];

const TIERS = [
  { name: 'Essential', icon: '🌱', d: 'Focused, fixed-scope projects to get a quick win or validate an idea.' },
  { name: 'Growth', icon: '🚀', d: 'Our most popular tier: multi-specialist squads delivering complete outcomes.', popular: true },
  { name: 'Enterprise', icon: '🏰', d: 'Dedicated pods, SLAs and named leads embedded in your organisation.' },
];

const FAQ = [
  ['How do the three tiers work?', 'Every service line offers Essential, Growth and Enterprise. Essential is a fixed-scope starter, Growth is a complete multi-specialist engagement, and Enterprise is a dedicated, SLA-backed team.'],
  ['Who actually does the work?', 'Senior Hipcastle strategists orchestrate specialist AI agents — each with a defined mission, workflow and success metrics — and review every deliverable before it reaches you.'],
  ['How does billing work?', 'Projects take a 50% deposit to start, with the balance on delivery. Retainers are billed monthly in advance. Every invoice lives in your client portal.'],
  ['Can I combine services?', 'Absolutely. Many clients pair Engineering with Design and QA, or Growth Marketing with Paid Media. Our Strategy & Orchestration service coordinates multi-division programmes.'],
];

export default function Home() {
  const { data: services } = useFetch('/services');
  const { data: testimonials } = useFetch('/testimonials');
  const { data: agents } = useFetch('/agents');
  const featured = agents ? [...agents].sort((a, b) => a.name.localeCompare(b.name)).filter((_, i) => i % 20 === 0).slice(0, 8) : [];

  return (
    <>
      <Hero />

      <section className="trust">
        <div className="container trust__inner">
          <span>Trusted by founders, scale-ups and enterprise teams</span>
          <ul>{['Northwind', 'Lumen Labs', 'Kestrel', 'Bluefin', 'Atlas Co.', 'Meridian'].map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">What we do</span>
            <h2>Fourteen service lines. One accountable partner.</h2>
            <p>Each line is staffed by its own specialists from our agent roster, and each comes in three clear tiers.</p>
          </div>
          <div className="grid grid--services">
            {services?.map((s) => <ServiceCard key={s.slug} service={s} />)}
          </div>
        </div>
      </section>

      <section className="section section--alt">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Three tiers, every service</span>
            <h2>Start small or go all in</h2>
          </div>
          <div className="grid grid--3">
            {TIERS.map((t) => (
              <div key={t.name} className={`tier-explainer ${t.popular ? 'tier-explainer--popular' : ''}`}>
                <span className="tier-explainer__icon">{t.icon}</span>
                <h3>{t.name}</h3>
                <p>{t.d}</p>
              </div>
            ))}
          </div>
          <p className="center mt-lg"><Link to="/pricing" className="btn btn--primary">Compare all 42 packages</Link></p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">How we work</span>
            <h2>From first call to measurable outcome</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.n} className="step"><span className="step__n">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--dark">
        <div className="container">
          <div className="section__head section__head--split">
            <div>
              <span className="eyebrow eyebrow--light">Meet the bench</span>
              <h2>{agents?.length ?? '160+'} specialists, each with a mission</h2>
            </div>
            <Link to="/agents" className="btn btn--outline-light">Browse all specialists</Link>
          </div>
          <div className="grid grid--agents">
            {featured.map((a) => (
              <Link key={a.slug} to={`/agents/${a.slug}`} className="agent-chip">
                <span className="agent-chip__emoji">{a.emoji}</span>
                <span><strong>{a.name}</strong><small>{a.vibe || a.division}</small></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Client stories</span>
            <h2>Outcomes our clients talk about</h2>
          </div>
          <div className="grid grid--testimonials">
            {testimonials?.map((t) => (
              <figure key={t.id} className="testimonial">
                <div className="stars" aria-label={`${t.rating} out of 5`}>{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}</div>
                <blockquote>“{t.quote}”</blockquote>
                <figcaption><strong>{t.author}</strong><span>{t.role}</span></figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--alt">
        <div className="container container--narrow">
          <div className="section__head">
            <span className="eyebrow">FAQ</span>
            <h2>Questions, answered</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
