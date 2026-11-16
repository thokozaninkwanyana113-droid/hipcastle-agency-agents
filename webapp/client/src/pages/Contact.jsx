import { siteHost, siteUrl } from '../siteUrl.js';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Field, PageHeader } from '../components/ui.jsx';
import Seo, { breadcrumbSchema } from '../components/Seo.jsx';
import { Icon, SocialLinks } from '../components/icons.jsx';
import { useSite } from '../context/SiteContext.jsx';
import { useFetch } from '../useFetch.js';
import { waLink } from '../format.js';
import { Captcha, Honeypot } from '../components/BotGuard.jsx';

const BUDGETS = ['Under R10 000', 'R10 000 – R30 000', 'R30 000 – R75 000', 'R75 000 – R150 000', 'R150 000+', 'Monthly retainer', 'Not sure yet'];

export default function Contact() {
  const site = useSite();
  const [params] = useSearchParams();
  const { data: services } = useFetch('/services');
  const [form, setForm] = useState({
    name: '', email: '', company: '', phone: '', service: params.get('service') || '', budget: '', province: '',
    preferred_contact: 'email', message: '', consent: false, source: params.get('utm_source') || 'website', website: '', captcha_token: '',
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrors({});
    try {
      await api('/leads', { method: 'POST', body: form });
      setStatus('done');
    } catch (err) {
      setErrors({ ...err.fields, _: err.fields && Object.keys(err.fields).length ? 'Please check the highlighted fields.' : err.message });
      setStatus('idle');
    }
  };

  const contactSchema = { '@context': 'https://schema.org', '@type': 'ContactPage', url: siteUrl('/contact'), mainEntity: { '@id': siteUrl('/#organization') } };

  return (
    <>
      <Seo title="Contact Us — Book a Free Strategy Session"
        description={`Contact ${site.business_name}: book a free 30-minute strategy session, email ${site.email}, call or WhatsApp us. We reply within one business day.`}
        schema={[contactSchema, breadcrumbSchema([{ name: 'Contact', path: '/contact' }])]} />
      <PageHeader eyebrow="Contact us" title="Let’s grow your business">
        <p>Book a free 30-minute strategy session. Tell us about your goals and we’ll reply within one business day with a recommended package and next steps — no obligation.</p>
      </PageHeader>

      <section className="section">
        <div className="container">
          <div className="contact-cards">
            {site.whatsapp && (
              <a className="contact-card contact-card--wa" href={waLink(site.whatsapp, `Hi ${site.business_name}, I'd like to book a strategy session.`)} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={26} /><strong>WhatsApp</strong><span>Fastest response</span>
              </a>
            )}
            <a className="contact-card" href={`mailto:${site.email}`}><Icon name="mail" size={26} /><strong>Email</strong><span>{site.email}</span></a>
            {site.phone && <a className="contact-card" href={`tel:${site.phone.replace(/\s/g, '')}`}><Icon name="phone" size={26} /><strong>Call</strong><span>{site.phone}</span></a>}
            <a className="contact-card" href="/"><Icon name="globe" size={26} /><strong>Website</strong><span>{siteHost()}</span></a>
          </div>
        </div>
        <div className="container layout-sidebar layout-sidebar--left mt-lg">
          <aside className="sidebar">
            <div className="card contact-info">
              <h2 className="h3">Where we are</h2>
              <p><Icon name="pin" size={16} /> {site.street_address ? `${site.street_address}, ` : ''}{site.address_locality}, {site.address_region}{site.postal_code ? `, ${site.postal_code}` : ''}, South Africa</p>
              <p><Icon name="clock" size={16} /> {site.office_hours}</p>
              <p className="muted small">We work remotely with clients anywhere in South Africa, and meet in person in {site.address_locality} by appointment.</p>
              <hr />
              <h2 className="h3">What happens next?</h2>
              <ol className="mini-steps">
                <li>We review your brief (within 1 business day)</li>
                <li>30-minute discovery call — Meet, Teams, phone or WhatsApp</li>
                <li>Tailored proposal with a fixed rand price</li>
                <li>Pay the deposit online and we kick off</li>
              </ol>
              <hr />
              <h2 className="h3">Follow us</h2>
              <SocialLinks social={site.social} whatsapp={site.whatsapp} className="socials--dark" />
            </div>
          </aside>
          <div className="card">
            {status === 'done' ? (
              <div className="success-panel" role="status">
                <span aria-hidden="true">✅</span>
                <h2>Thanks, {form.name.split(' ')[0]}!</h2>
                <p>Your enquiry is in. We’ll contact you by {form.preferred_contact === 'whatsapp' ? 'WhatsApp' : form.preferred_contact} within one business day.</p>
                <p><Link to="/blog" className="btn btn--outline">Read our free guides while you wait</Link></p>
              </div>
            ) : (
              <form className="form" onSubmit={submit} noValidate aria-label="Strategy session request">
                <h2 className="h3">Request your free strategy session</h2>
                {errors._ && <div className="alert alert--error" role="alert">{errors._}</div>}
                <div className="form__row">
                  <Field label="Full name *" error={errors.name}><input className="input" value={form.name} onChange={set('name')} required autoComplete="name" /></Field>
                  <Field label="Email *" error={errors.email}><input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></Field>
                </div>
                <div className="form__row">
                  <Field label="Mobile number" error={errors.phone}><input className="input" type="tel" placeholder="082 123 4567" value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
                  <Field label="Business name" error={errors.company}><input className="input" value={form.company} onChange={set('company')} autoComplete="organization" /></Field>
                </div>
                <div className="form__row">
                  <Field label="Service you’re interested in" error={errors.service}>
                    <select className="input" value={form.service} onChange={set('service')}>
                      <option value="">Not sure yet — advise me</option>
                      {services?.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Budget" error={errors.budget}>
                    <select className="input" value={form.budget} onChange={set('budget')}>
                      <option value="">Select a range</option>
                      {BUDGETS.map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="form__row">
                  <Field label="Province" error={errors.province}>
                    <select className="input" value={form.province} onChange={set('province')}>
                      <option value="">Select province</option>
                      {site.provinces?.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                  <fieldset className="field">
                    <legend className="field__label">Best way to reach you</legend>
                    <div className="radio-row">
                      {[['email', 'Email'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp']].map(([v, l]) => (
                        <label key={v} className="radio"><input type="radio" name="pc" value={v} checked={form.preferred_contact === v} onChange={set('preferred_contact')} /> {l}</label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <Field label="Tell us about your business and goals *" error={errors.message} hint="What do you sell, who are your customers, and what would success look like in 3 months?">
                  <textarea className="input" rows={6} value={form.message} onChange={set('message')} required />
                </Field>
                <label className={`checkbox ${errors.consent ? 'checkbox--error' : ''}`}>
                  <input type="checkbox" checked={form.consent} onChange={set('consent')} />
                  <span>I agree that {site.business_name} may contact me about this enquiry and process my details as described in the <Link to="/privacy" target="_blank">privacy policy</Link> (POPIA). *</span>
                </label>
                {errors.consent && <small className="field__error">{errors.consent}</small>}
                <Honeypot value={form.website} onChange={(v) => setForm((f) => ({ ...f, website: v }))} />
                <Captcha onToken={(t) => setForm((f) => ({ ...f, captcha_token: t }))} />
                {errors.captcha && <small className="field__error">{errors.captcha}</small>}
                <button className="btn btn--primary btn--lg" disabled={status === 'loading'}>{status === 'loading' ? 'Sending…' : 'Book my free session'}</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
