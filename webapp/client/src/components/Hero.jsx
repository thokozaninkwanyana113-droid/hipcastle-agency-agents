import { Link } from 'react-router-dom';
import { useFetch } from '../useFetch.js';

const ORBIT = [
  { e: '🖥️', n: 'Frontend Developer' }, { e: '🎨', n: 'Brand Guardian' }, { e: '📈', n: 'Growth Hacker' },
  { e: '🔒', n: 'Security Engineer' }, { e: '🤝', n: 'Deal Strategist' }, { e: '🧪', n: 'Reality Checker' },
];

export default function Hero() {
  const { data: stats } = useFetch('/stats');
  return (
    <section className="hero">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="eyebrow eyebrow--light">Full-service digital agency</span>
          <h1>
            Your specialist team,<br />
            <em>assembled on demand.</em>
          </h1>
          <p className="hero__lead">
            Hipcastle combines {stats?.agents ?? '160+'} specialist AI agents with senior strategists to deliver
            engineering, design, marketing, sales and operations — in three clear tiers, with a client portal
            that shows every milestone.
          </p>
          <div className="hero__actions">
            <Link to="/services" className="btn btn--primary btn--lg">Explore services</Link>
            <Link to="/contact" className="btn btn--outline-light btn--lg">Book free consultation</Link>
          </div>
          <dl className="hero__stats">
            <div><dt>Service lines</dt><dd>{stats?.services ?? 14}</dd></div>
            <div><dt>Packaged tiers</dt><dd>{stats?.tiers ?? 42}</dd></div>
            <div><dt>Specialists</dt><dd>{stats?.agents ?? '160+'}</dd></div>
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
              <div key={a.n} className="orbit__chip" style={{ '--i': i, '--n': ORBIT.length }}>
                <span>{a.e}</span>{a.n}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
