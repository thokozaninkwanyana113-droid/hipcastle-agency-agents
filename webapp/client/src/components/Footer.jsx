import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';

export default function Footer() {
  const { data: services } = useFetch('/services');
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', msg: '' });

  const subscribe = async (e) => {
    e.preventDefault();
    setState({ status: 'loading', msg: '' });
    try {
      await api('/newsletter', { method: 'POST', body: { email } });
      setState({ status: 'done', msg: 'Thanks — you’re on the list.' });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', msg: err.fields?.email || err.message });
    }
  };

  return (
    <footer className="footer">
      <div className="container footer__cta">
        <div>
          <h2>Ready to build your dream team?</h2>
          <p>Tell us what you need and we’ll assemble the right specialists within 48 hours.</p>
        </div>
        <div className="footer__cta-actions">
          <Link to="/contact" className="btn btn--primary btn--lg">Start a project</Link>
          <Link to="/pricing" className="btn btn--outline-light btn--lg">See pricing</Link>
        </div>
      </div>
      <div className="container footer__grid">
        <div className="footer__brand">
          <Logo light />
          <p>A full-service agency powered by 160+ specialist AI agents and the senior humans who orchestrate them.</p>
          <form className="newsletter" onSubmit={subscribe}>
            <label htmlFor="nl-email">Monthly insights, no spam</label>
            <div className="newsletter__row">
              <input id="nl-email" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn btn--primary btn--sm" disabled={state.status === 'loading'}>Subscribe</button>
            </div>
            {state.msg && <small className={state.status === 'error' ? 'text-error' : 'text-success'} role="status">{state.msg}</small>}
          </form>
        </div>
        <div>
          <h3>Services</h3>
          <ul>
            {services?.slice(0, 7).map((s) => <li key={s.slug}><Link to={`/services/${s.slug}`}>{s.name}</Link></li>)}
          </ul>
        </div>
        <div>
          <h3>More services</h3>
          <ul>
            {services?.slice(7).map((s) => <li key={s.slug}><Link to={`/services/${s.slug}`}>{s.name}</Link></li>)}
          </ul>
        </div>
        <div>
          <h3>Company</h3>
          <ul>
            <li><Link to="/about">About us</Link></li>
            <li><Link to="/agents">Our specialists</Link></li>
            <li><Link to="/pricing">Pricing</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/portal">Client portal</Link></li>
          </ul>
          <h3 className="mt">Contact</h3>
          <ul className="footer__contact">
            <li>hello@hipcastle.agency</li>
            <li>Mon–Fri, 08:00–18:00</li>
          </ul>
        </div>
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} Hipcastle Agency. All rights reserved.</span>
        <nav aria-label="Legal">
          <Link to="/about#privacy">Privacy</Link>
          <Link to="/about#terms">Terms</Link>
          <a href="https://github.com/thokozaninkwanyana113-droid/hipcastle-agency-agents" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
