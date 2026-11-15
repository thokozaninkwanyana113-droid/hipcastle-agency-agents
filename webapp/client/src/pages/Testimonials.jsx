import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Field, Loader, PageHeader } from '../components/ui.jsx';
import Seo, { breadcrumbSchema } from '../components/Seo.jsx';
import { Stars, TestimonialCard } from '../components/Testimonials.jsx';
import { useFetch } from '../useFetch.js';
import { useSite } from '../context/SiteContext.jsx';

function ReviewForm({ services }) {
  const [f, setF] = useState({ author: '', email: '', role: '', company: '', location: '', service: '', rating: 5, quote: '', consent: false });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setStatus('loading'); setErrors({});
    try { await api('/testimonials', { method: 'POST', body: { ...f, rating: Number(f.rating) } }); setStatus('done'); }
    catch (err) { setErrors({ ...err.fields, _: err.message }); setStatus('idle'); }
  };
  if (status === 'done') return <div className="success-panel" role="status"><span aria-hidden="true">🙏</span><h2>Thank you!</h2><p>Your review has been received and will appear once it has been verified.</p></div>;
  return (
    <form className="form" onSubmit={submit} noValidate>
      <h2 className="h3">Worked with us? Leave a review</h2>
      {errors._ && <div className="alert alert--error" role="alert">{errors._}</div>}
      <div className="form__row">
        <Field label="Your name *" error={errors.author}><input className="input" value={f.author} onChange={set('author')} autoComplete="name" /></Field>
        <Field label="Email (not published) *" error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
      </div>
      <div className="form__row">
        <Field label="Your role *" error={errors.role}><input className="input" placeholder="e.g. Founder" value={f.role} onChange={set('role')} /></Field>
        <Field label="Business" error={errors.company}><input className="input" value={f.company} onChange={set('company')} /></Field>
      </div>
      <div className="form__row">
        <Field label="Town / city"><input className="input" placeholder="e.g. Durban" value={f.location} onChange={set('location')} /></Field>
        <Field label="Service used">
          <select className="input" value={f.service} onChange={set('service')}>
            <option value="">Select a service</option>
            {services?.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <fieldset className="field">
        <legend className="field__label">Rating *</legend>
        <div className="rating-input">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className={Number(f.rating) === n ? 'active' : ''}>
              <input type="radio" name="rating" value={n} checked={Number(f.rating) === n} onChange={set('rating')} /> {n}★
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Your review *" error={errors.quote}><textarea className="input" rows={4} value={f.quote} onChange={set('quote')} /></Field>
      <label className="checkbox">
        <input type="checkbox" checked={f.consent} onChange={set('consent')} />
        <span>I agree that my name, role, business and review may be published on this website. *</span>
      </label>
      {errors.consent && <small className="field__error">{errors.consent}</small>}
      <button className="btn btn--primary" disabled={status === 'loading'}>{status === 'loading' ? 'Submitting…' : 'Submit review'}</button>
    </form>
  );
}

export default function Testimonials() {
  const site = useSite();
  const { data, loading } = useFetch('/testimonials');
  const { data: services } = useFetch('/services');
  const [filter, setFilter] = useState('');
  const shown = data?.filter((t) => !filter || t.service_slug === filter) ?? [];
  const avg = data?.length ? (data.reduce((a, t) => a + t.rating, 0) / data.length).toFixed(1) : null;
  const usedServices = services?.filter((s) => data?.some((t) => t.service_slug === s.slug)) ?? [];

  return (
    <>
      <Seo title="Client Reviews & Testimonials"
        description={`What South African entrepreneurs say about working with ${site.business_name}${avg ? ` — rated ${avg}/5 across ${data.length} reviews` : ''}.`}
        schema={[breadcrumbSchema([{ name: 'Reviews', path: '/testimonials' }])]} />
      <PageHeader eyebrow="Client reviews" title="What our clients say">
        <p>Honest feedback from South African businesses we’ve worked with. Every review is verified before publishing.</p>
        {avg && <p className="rating-summary"><Stars rating={Math.round(avg)} /> <strong>{avg} / 5</strong> from {data.length} reviews</p>}
      </PageHeader>
      <section className="section">
        <div className="container">
          {usedServices.length > 1 && (
            <div className="filters" role="group" aria-label="Filter reviews by service">
              <button className={`chip ${!filter ? 'chip--active' : ''}`} onClick={() => setFilter('')}>All</button>
              {usedServices.map((s) => <button key={s.slug} className={`chip ${filter === s.slug ? 'chip--active' : ''}`} onClick={() => setFilter(s.slug)}>{s.icon} {s.name}</button>)}
            </div>
          )}
          {loading && <Loader />}
          <div className="grid grid--testimonials">{shown.map((t) => <TestimonialCard key={t.id} t={t} />)}</div>
        </div>
      </section>
      <section className="section section--alt">
        <div className="container layout-sidebar">
          <div className="card"><ReviewForm services={services} /></div>
          <aside className="sidebar">
            <div className="card">
              <h2 className="h3">Ready for results like these?</h2>
              <p className="muted">Book a free 30-minute strategy session and get a fixed-price recommendation.</p>
              <Link to="/contact" className="btn btn--primary btn--block">Book my free session</Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
