import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui.jsx';
import Seo, { breadcrumbSchema, faqSchema } from '../components/Seo.jsx';
import { Faq, TestimonialCard } from '../components/Testimonials.jsx';
import { SocialLinks } from '../components/icons.jsx';
import { useSite } from '../context/SiteContext.jsx';
import { useFetch } from '../useFetch.js';

const VALUES = [
  ['🎯', 'Specialised, not generic', 'Every task goes to a specialist with a narrow, deep remit — the right expert for each job, not a generalist doing their best.'],
  ['💬', 'Radical transparency', 'Published rand pricing, live milestones in your portal and plain-language reporting. No mystery invoices.'],
  ['🔍', 'Evidence over opinion', 'Our QA “reality checkers” require proof — screenshots, test results, analytics — before anything is called done.'],
  ['🤝', 'Human accountability', 'A named Hipcastle lead owns every engagement end-to-end and is reachable by email, phone or WhatsApp.'],
  ['🇿🇦', 'Built for Mzansi', 'Local payment gateways, POPIA-aware data handling, load-shedding-resilient hosting and budget-Android testing as standard.'],
  ['📈', 'Outcomes, not hours', 'We agree success metrics up front — leads, sales, conversion, launch dates — and report against them.'],
];

const MODEL = [
  ['Strategy leads', 'Senior people who run your discovery session, recommend the right package, set KPIs and stay accountable for delivery.'],
  ['Specialist bench', `More than 160 specialist AI agents across engineering, design, marketing, paid media, sales, product, QA, operations, research and XR — each with a defined mission, workflow and success metrics.`],
  ['Quality reviewers', 'Every deliverable is checked against evidence, accessibility and security standards before it reaches you.'],
  ['Your client portal', 'One place for milestones, invoices, payments and messages — no chasing updates over email.'],
];

export default function About() {
  const site = useSite();
  const { data: faqs } = useFetch('/faqs');
  const { data: stats } = useFetch('/stats');
  const { data: testimonials } = useFetch('/testimonials?featured=1');
  const aboutFaqs = faqs?.filter((f) => /What does|Who does|Do you only|POPIA/.test(f.q)) ?? [];

  const aboutSchema = {
    '@context': 'https://schema.org', '@type': 'AboutPage', name: `About ${site.business_name}`, inLanguage: 'en-ZA',
    url: `${window.location.origin}/about`, mainEntity: { '@id': `${window.location.origin}/#organization` },
  };

  return (
    <>
      <Seo
        title="About Us — South African Digital Agency"
        description={`${site.business_name} is a ${site.address_locality} digital agency pairing senior strategists with 160+ specialist AI agents to help SA entrepreneurs grow.`}
        schema={[aboutSchema, faqSchema(aboutFaqs), breadcrumbSchema([{ name: 'About us', path: '/about' }])]}
      />
      <PageHeader eyebrow={`About ${site.business_name}`} title="A South African agency built for entrepreneurs">
        <p>
          <strong>{site.business_name}</strong> is a digital agency based in {site.address_locality}, {site.address_region}, serving
          entrepreneurs, SMEs and growing companies across all nine provinces. We combine senior strategists with a roster
          of {stats?.agents ?? '160+'} specialist AI agents to deliver websites, apps, marketing, SEO, advertising, sales and
          operations — in fixed-price packages, priced in rand.
        </p>
      </PageHeader>

      <section className="section" aria-labelledby="story">
        <div className="container grid grid--2 align-center">
          <div className="prose">
            <span className="eyebrow">Our story</span>
            <h2 id="story">Why Hipcastle exists</h2>
            <p>
              South African founders are some of the most resourceful in the world — but too often they’re forced to choose
              between expensive big agencies with vague quotes, or freelancers who disappear mid-project. We started Hipcastle
              to offer a third option: <strong>big-agency capability at small-business pricing</strong>, with complete
              transparency.
            </p>
            <p>
              Our name says it all. A castle has strong foundations, specialist towers and one gate. We give you solid
              strategy, deep specialists for every discipline, and one accountable point of contact.
            </p>
            <h3>What makes us different</h3>
            <ul className="checklist">
              <li>Every service has published Essential, Growth and Enterprise prices in rand.</li>
              <li>Pay online by card or instant EFT via PayFast and Ozow — deposits only, balance on delivery.</li>
              <li>A client portal with live milestones, invoices and messages.</li>
              <li>Local know-how: POPIA, WhatsApp-first customers, load-shedding and low-data users.</li>
            </ul>
          </div>
          <dl className="about-stats">
            <div><dt>Service lines</dt><dd>{stats?.services ?? 14}</dd></div>
            <div><dt>Fixed-price packages</dt><dd>{stats?.tiers ?? 42}</dd></div>
            <div><dt>Specialist agents</dt><dd>{stats?.agents ?? '160+'}</dd></div>
            <div><dt>Provinces served</dt><dd>9</dd></div>
          </dl>
        </div>
      </section>

      <section className="section section--alt" aria-labelledby="model">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">How we work</span>
            <h2 id="model">Human strategy, specialist execution</h2>
            <p>Our operating model gives you the speed of automation with the judgement of experienced people.</p>
          </div>
          <div className="grid grid--4">
            {MODEL.map(([t, d], i) => (
              <div key={t} className="card model-card"><span className="step__n">0{i + 1}</span><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="values">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Our values</span>
            <h2 id="values">What you can expect from us</h2>
          </div>
          <div className="grid grid--3">
            {VALUES.map(([i, t, d]) => <div key={t} className="card value"><span aria-hidden="true">{i}</span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section section--dark" aria-labelledby="who">
        <div className="container grid grid--2 align-center">
          <div>
            <span className="eyebrow eyebrow--light">Who we help</span>
            <h2 id="who">From first hustle to national brand</h2>
            <p>We work with township and suburban start-ups, family businesses going digital, professional practices, e-commerce brands, NPOs and corporate teams that need to move faster.</p>
            <div className="hero__actions">
              <Link to="/contact" className="btn btn--primary">Book a free strategy session</Link>
              <Link to="/services" className="btn btn--outline-light">Explore services</Link>
            </div>
          </div>
          <ul className="who-list">
            {['Retail & e-commerce', 'Professional services', 'Property & construction', 'Health & wellness', 'Logistics & transport', 'Hospitality & tourism', 'Education & training', 'Fintech & SaaS', 'Agriculture & food', 'NPOs & public-sector suppliers'].map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      </section>

      {testimonials?.length > 0 && (
        <section className="section" aria-labelledby="about-reviews">
          <div className="container">
            <div className="section__head section__head--split">
              <div><span className="eyebrow">Proof</span><h2 id="about-reviews">Trusted by South African businesses</h2></div>
              <Link to="/testimonials" className="btn btn--outline">All reviews</Link>
            </div>
            <div className="grid grid--testimonials">{testimonials.slice(0, 3).map((t) => <TestimonialCard key={t.id} t={t} />)}</div>
          </div>
        </section>
      )}

      <section className="section section--alt" aria-labelledby="about-faq">
        <div className="container container--narrow">
          <div className="section__head"><span className="eyebrow">FAQ</span><h2 id="about-faq">About Hipcastle: quick answers</h2></div>
          <Faq items={aboutFaqs} />
          <div className="center mt-lg">
            <p className="muted">Follow us for tips and behind-the-scenes</p>
            <SocialLinks social={site.social} whatsapp={site.whatsapp} size={22} className="socials--dark socials--center" />
          </div>
        </div>
      </section>
    </>
  );
}
