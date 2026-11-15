import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Field, PageHeader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';

const BUDGETS = ['Under $2,500', '$2,500 – $10,000', '$10,000 – $25,000', '$25,000+', 'Not sure yet'];

export default function Contact() {
  const [params] = useSearchParams();
  const { data: services } = useFetch('/services');
  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', service: params.get('service') || '', budget: '', message: '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrors({});
    try {
      await api('/leads', { method: 'POST', body: form });
      setStatus('done');
    } catch (err) {
      setErrors({ ...err.fields, _: err.fields && Object.keys(err.fields).length ? '' : err.message });
      setStatus('idle');
    }
  };

  return (
    <>
      <PageHeader eyebrow="Contact" title="Let’s build something great">
        <p>Tell us about your project. A strategist will reply within one business day with a recommended tier and next steps.</p>
      </PageHeader>
      <section className="section">
        <div className="container layout-sidebar layout-sidebar--left">
          <aside className="sidebar">
            <div className="card contact-info">
              <h3>Talk to us</h3>
              <p><strong>Email</strong><br />hello@hipcastle.agency</p>
              <p><strong>Hours</strong><br />Monday – Friday, 08:00 – 18:00</p>
              <p><strong>Response time</strong><br />Within 1 business day</p>
              <hr />
              <h3>What happens next?</h3>
              <ol className="mini-steps"><li>We review your brief</li><li>30-minute discovery call</li><li>Tailored proposal & tier recommendation</li></ol>
            </div>
          </aside>
          <div className="card">
            {status === 'done' ? (
              <div className="success-panel" role="status">
                <span>✅</span>
                <h2>Thanks, {form.name.split(' ')[0]}!</h2>
                <p>Your enquiry is in. We’ll be in touch at {form.email} shortly.</p>
              </div>
            ) : (
              <form className="form" onSubmit={submit} noValidate>
                {errors._ && <div className="alert alert--error">{errors._}</div>}
                <div className="form__row">
                  <Field label="Full name *" error={errors.name}><input className="input" value={form.name} onChange={set('name')} required autoComplete="name" /></Field>
                  <Field label="Work email *" error={errors.email}><input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></Field>
                </div>
                <div className="form__row">
                  <Field label="Company" error={errors.company}><input className="input" value={form.company} onChange={set('company')} autoComplete="organization" /></Field>
                  <Field label="Phone" error={errors.phone}><input className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
                </div>
                <div className="form__row">
                  <Field label="Service of interest" error={errors.service}>
                    <select className="input" value={form.service} onChange={set('service')}>
                      <option value="">Not sure yet</option>
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
                <Field label="Project details *" error={errors.message} hint="Goals, timeline, links — anything that helps.">
                  <textarea className="input" rows={6} value={form.message} onChange={set('message')} required />
                </Field>
                <button className="btn btn--primary btn--lg" disabled={status === 'loading'}>{status === 'loading' ? 'Sending…' : 'Send enquiry'}</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
