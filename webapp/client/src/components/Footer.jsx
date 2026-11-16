import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { useSite } from '../context/SiteContext.jsx';
import { Icon, PaymentBadges, SocialLinks } from './icons.jsx';
import { siteHost } from '../siteUrl.js';
import { Honeypot } from './BotGuard.jsx';

export default function Footer() {
  const site = useSite();
  const { data: services } = useFetch('/services');
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [state, setState] = useState({ status: 'idle', msg: '' });

  const subscribe = async (e) => {
    e.preventDefault();
    setState({ status: 'loading', msg: '' });
    try {
      const r = await api('/newsletter', { method: 'POST', body: { email, website: hp } });
      setState({ status: 'done', msg: r.status === 'active' ? 'You’re already subscribed — thank you!' : 'Almost done — check your inbox and click the link to confirm.' });
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
          <p>Tell us what you need — we’ll recommend the right package within one business day.</p>
        </div>
        <div className="footer__cta-actions">
          <Link to="/contact" className="btn btn--primary btn--lg">Book a free strategy session</Link>
          {site.whatsapp && (
            <a href={`https://wa.me/${site.whatsapp}`} className="btn btn--outline-light btn--lg" target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" /> WhatsApp us
            </a>
          )}
        </div>
      </div>
      <div className="container footer__grid">
        <div className="footer__brand">
          <Logo light />
          <p>{site.tagline}. A {site.address_locality}-based digital agency working with entrepreneurs across South Africa.</p>
          <SocialLinks social={site.social} whatsapp={site.whatsapp} />
          <form className="newsletter" onSubmit={subscribe}>
            <label htmlFor="nl-email">Monthly growth tips for SA founders</label>
            <div className="newsletter__row">
              <input id="nl-email" type="email" required placeholder="you@yourbusiness.co.za" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn btn--primary btn--sm" disabled={state.status === 'loading'}>Subscribe</button>
            </div>
            <Honeypot value={hp} onChange={setHp} />
            {state.msg && <small className={state.status === 'error' ? 'text-error' : 'text-success'} role="status">{state.msg}</small>}
          </form>
        </div>
        <nav aria-label="Services">
          <h2 className="footer__h">Services</h2>
          <ul>{services?.slice(0, 7).map((s) => <li key={s.slug}><Link to={`/services/${s.slug}`}>{s.name}</Link></li>)}</ul>
        </nav>
        <nav aria-label="More services">
          <h2 className="footer__h">More services</h2>
          <ul>{services?.slice(7).map((s) => <li key={s.slug}><Link to={`/services/${s.slug}`}>{s.name}</Link></li>)}</ul>
        </nav>
        <div>
          <h2 className="footer__h">Company</h2>
          <ul>
            <li><Link to="/about">About us</Link></li>
            <li><Link to="/testimonials">Client reviews</Link></li>
            <li><Link to="/blog">Blog & guides</Link></li>
            <li><Link to="/pricing">Pricing</Link></li>
            <li><Link to="/contact">Contact us</Link></li>
            <li><Link to="/help">Help Centre</Link></li>
            <li><Link to="/portal">Client portal</Link></li>
          </ul>
          <h2 className="footer__h mt">Get in touch</h2>
          <address className="footer__contact">
            <a href="/"><Icon name="globe" size={15} /> {siteHost()}</a>
            <a href={`mailto:${site.email}`}><Icon name="mail" size={15} /> {site.email}</a>
            {site.phone && <a href={`tel:${site.phone.replace(/\s/g, '')}`}><Icon name="phone" size={15} /> {site.phone}</a>}
            <span><Icon name="pin" size={15} /> {site.address_locality}, {site.address_region}</span>
            <span><Icon name="clock" size={15} /> {site.office_hours}</span>
          </address>
        </div>
      </div>
      <div className="container footer__pay">
        <span><Icon name="lock" size={15} /> Secure payments</span>
        <PaymentBadges />
      </div>
      <div className="container footer__bottom">
        <span>
          © {new Date().getFullYear()} {site.legal_name || site.business_name}.
          {site.company_reg_no && ` Reg. ${site.company_reg_no}.`}{site.vat_registered && site.vat_no && ` VAT ${site.vat_no}.`} Prices in ZAR.
        </span>
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy & POPIA</Link>
          <Link to="/terms">Terms</Link>
          <a href="/sitemap.xml">Sitemap</a>
        </nav>
      </div>
    </footer>
  );
}
