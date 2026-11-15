import { Link } from 'react-router-dom';
import Hero from '../components/Hero.jsx';
import ServiceCard from '../components/ServiceCard.jsx';
import PostCard from '../components/PostCard.jsx';
import Seo, { faqSchema } from '../components/Seo.jsx';
import { Faq, TestimonialCard } from '../components/Testimonials.jsx';
import { PaymentBadges } from '../components/icons.jsx';
import { useFetch } from '../useFetch.js';
import { useSite } from '../context/SiteContext.jsx';

const PAINS = [
  ['😩', 'Quotes that change every week', 'Every package has a fixed rand price and a clear scope — published on our site.'],
  ['👻', 'Agencies that go quiet', 'Your client portal shows live milestones, invoices and a message thread with your team.'],
  ['💳', 'No easy way to pay', 'Pay deposits by card, instant EFT, SnapScan or Zapper through PayFast and Ozow.'],
  ['🔌', 'Websites that break with load-shedding', 'Cloud hosting, backups and monitoring keep you selling when the lights go out.'],
];

const STEPS = [
  { n: '01', t: 'Free strategy session', d: '30 minutes on Google Meet, Teams or WhatsApp call to understand your goals and budget.' },
  { n: '02', t: 'Pick your package', d: 'Choose Essential, Growth or Enterprise — or let us recommend one. No surprise costs.' },
  { n: '03', t: 'Pay securely & kick off', d: '50% deposit via PayFast or Ozow. Work starts within five working days.' },
  { n: '04', t: 'Track & launch', d: 'Follow milestones in your portal, approve deliverables, then launch and grow.' },
];

const TIERS = [
  { name: 'Essential', icon: '🌱', who: 'Start-ups & side hustles', d: 'A fixed-scope quick win: a website, brand kit, ad account or strategy sprint.' },
  { name: 'Growth', icon: '🚀', who: 'SMEs with traction', d: 'Our most popular tier: multi-specialist squads delivering a complete outcome.', popular: true },
  { name: 'Enterprise', icon: '🏰', who: 'Scale-ups & corporates', d: 'Dedicated teams, SLAs and a named lead embedded in your business.' },
];

export default function Home() {
  const site = useSite();
  const { data: services } = useFetch('/services');
  const { data: testimonials } = useFetch('/testimonials?featured=1');
  const { data: faqs } = useFetch('/faqs');
  const { data: posts } = useFetch('/posts?limit=3');

  return (
    <>
      <Seo
        title={`${site.business_name} | Digital Agency for SA Entrepreneurs`}
        description={site.seo_default_description}
        schema={[faqSchema(faqs)]}
      />
      <Hero />

      <section className="trust" aria-label="Payment and trust">
        <div className="container trust__inner">
          <span>Secure online payments for South African businesses</span>
          <PaymentBadges />
        </div>
      </section>

      <section className="section" aria-labelledby="pains">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Built for SA founders</span>
            <h2 id="pains">Agency work without the agency headaches</h2>
            <p>We built Hipcastle around the frustrations South African entrepreneurs tell us about most.</p>
          </div>
          <div className="grid grid--4">
            {PAINS.map(([i, t, d]) => (
              <div key={t} className="pain"><span aria-hidden="true">{i}</span><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--alt" aria-labelledby="services-h">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">What we do</span>
            <h2 id="services-h">{services?.length ?? 14} services. One accountable partner.</h2>
            <p>Each service is staffed by its own specialists and comes in three fixed-price tiers.</p>
          </div>
          <div className="grid grid--services">{services?.map((s) => <ServiceCard key={s.slug} service={s} />)}</div>
        </div>
      </section>

      <section className="section" aria-labelledby="tiers-h">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Three tiers, every service</span>
            <h2 id="tiers-h">Start small or go all in</h2>
          </div>
          <div className="grid grid--3">
            {TIERS.map((t) => (
              <div key={t.name} className={`tier-explainer ${t.popular ? 'tier-explainer--popular' : ''}`}>
                <span className="tier-explainer__icon" aria-hidden="true">{t.icon}</span>
                <h3>{t.name}</h3>
                <p className="tier-explainer__who">{t.who}</p>
                <p>{t.d}</p>
              </div>
            ))}
          </div>
          <p className="center mt-lg"><Link to="/pricing" className="btn btn--primary">Compare all {services ? services.length * 3 : 42} packages</Link></p>
        </div>
      </section>

      <section className="section section--dark" aria-labelledby="how-h">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow eyebrow--light">How it works</span>
            <h2 id="how-h">From first call to launch in four steps</h2>
          </div>
          <ol className="steps steps--dark">
            {STEPS.map((s) => <li key={s.n} className="step"><span className="step__n">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p></li>)}
          </ol>
        </div>
      </section>

      {testimonials?.length > 0 && (
        <section className="section" aria-labelledby="reviews-h">
          <div className="container">
            <div className="section__head section__head--split">
              <div><span className="eyebrow">Client stories</span><h2 id="reviews-h">What our clients say</h2></div>
              <Link to="/testimonials" className="btn btn--outline">Read all reviews</Link>
            </div>
            <div className="grid grid--testimonials">{testimonials.slice(0, 3).map((t) => <TestimonialCard key={t.id} t={t} />)}</div>
          </div>
        </section>
      )}

      {posts?.length > 0 && (
        <section className="section section--alt" aria-labelledby="blog-h">
          <div className="container">
            <div className="section__head section__head--split">
              <div><span className="eyebrow">Free guides</span><h2 id="blog-h">Grow smarter: guides for SA entrepreneurs</h2></div>
              <Link to="/blog" className="btn btn--outline">Visit the blog</Link>
            </div>
            <div className="grid grid--3">{posts.map((p) => <PostCard key={p.slug} post={p} />)}</div>
          </div>
        </section>
      )}

      {faqs && (
        <section className="section" aria-labelledby="faq-h">
          <div className="container container--narrow">
            <div className="section__head">
              <span className="eyebrow">FAQ</span>
              <h2 id="faq-h">Questions South African founders ask us</h2>
            </div>
            <Faq items={faqs} />
          </div>
        </section>
      )}
    </>
  );
}
