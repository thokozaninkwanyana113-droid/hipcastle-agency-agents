import { Link } from 'react-router-dom';
import { useFetch } from '../useFetch.js';
import { money } from '../format.js';
import { openChat } from './ChatWidget.jsx';

const ORBIT = [
  { e: '🖥️', n: 'Web Developer' }, { e: '🎨', n: 'Brand Designer' }, { e: '📈', n: 'SEO & Growth' },
  { e: '🔒', n: 'Security & POPIA' }, { e: '🤝', n: 'Sales Strategist' }, { e: '💳', n: 'PayFast & Ozow' },
];

export default function Hero() {
  const { data: stats } = useFetch('/stats');
  const { data: services } = useFetch('/services');
  const from = services?.length ? Math.min(...services.map((s) => s.from_price_cents)) : null;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="eyebrow eyebrow--light">🇿🇦 Digital agency for South African entrepreneurs</span>
          <h1 id="hero-title">
            Big-agency talent.<br />
            <em>Small-business pricing.</em>
          </h1>
          <p className="hero__lead">
            Websites, online stores, marketing, SEO, ads and operations — delivered by a human-led team working with a library of {stats?.agents ?? '160+'}{' '}
            specialist AI playbooks. Fixed prices in rand{from ? `, from ${money(from)}` : ''}, a portal that shows every milestone, and checkout with PayFast or Ozow.
          </p>
          <div className="hero__actions">
            <Link to="/contact" className="btn btn--primary btn--lg">Book a free strategy session</Link>
            <Link to="/pricing" className="btn btn--outline-light btn--lg">See rand pricing</Link>
          </div>
          <button type="button" className="hero__ask" onClick={() => openChat()}>💬 Not sure where to start? <u>Ask our assistant</u> — instant answers on services, prices and payments.</button>
          <ul className="hero__trust">
            <li>✓ No lock-in on retainers</li>
            <li>✓ 50% deposit, balance on delivery</li>
            <li>✓ POPIA-aware by design</li>
          </ul>
          <dl className="hero__stats">
            <div><dt>Service lines</dt><dd>{stats?.services ?? 14}</dd></div>
            <div><dt>Fixed-price packages</dt><dd>{stats?.tiers ?? 42}</dd></div>
            <div><dt>AI playbooks</dt><dd>{stats?.agents ?? '160+'}</dd></div>
          </dl>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="orbit">
            <div className="orbit__core">
              <svg viewBox="0 0 32 32" width="64" height="64"><path d="M7 25V12l3 2V9l3 2V7l3 2 3-2v4l3-2v5l3-2v13z" fill="#f2b544" /></svg>
              <strong>NEXUS</strong>
              <small>orchestration</small>
            </div>
            {ORBIT.map((a, i) => (
              <div key={a.n} className="orbit__chip" style={{ '--i': i, '--n': ORBIT.length }}><span>{a.e}</span>{a.n}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
