import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSite } from '../../context/SiteContext.jsx';
import { Field, Loader } from '../../components/ui.jsx';
import { SOCIALS } from '../../components/icons.jsx';
import { PanelHead } from './shared.jsx';

export default function Settings() {
  const { user } = useAuth();
  const { reloadSite } = useSite();
  const [s, setS] = useState(null);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/admin/settings').then(setS); }, []);
  if (!s) return <Loader />;
  const admin = user.role === 'admin';
  const set = (k, cast = (v) => v) => (e) => setS({ ...s, [k]: cast(e.target.type === 'checkbox' ? e.target.checked : e.target.value) });
  const setSocial = (k) => (e) => setS({ ...s, social: { ...s.social, [k]: e.target.value } });
  const save = async (e) => {
    e.preventDefault(); setErrors({}); setMsg('');
    const { jobs_disabled, ...body } = s;
    try { setS(await api('/admin/settings', { method: 'PUT', body })); setMsg('Settings saved — the website is updated.'); reloadSite(); }
    catch (err) { setErrors({ ...err.fields, _: err.message }); }
  };
  const text = (k, label, hint, type = 'text') => (
    <Field label={label} hint={hint} error={errors[k]}><input className="input" type={type} value={s[k] ?? ''} onChange={set(k)} disabled={!admin} /></Field>
  );
  const toggle = (k, label, hint) => (
    <label className="switch switch--row"><input type="checkbox" checked={!!s[k]} onChange={set(k)} disabled={!admin} /><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span></label>
  );

  return (
    <form onSubmit={save}>
      <PanelHead title="Settings" sub="Business details used across the website, invoices, structured data and llms.txt.">
        {admin && <button className="btn btn--primary btn--sm">Save settings</button>}
      </PanelHead>
      {!admin && <p className="muted">Only admins can change settings.</p>}
      {errors._ && <div className="alert alert--error">{errors._}</div>}
      {msg && <div className="alert alert--success">{msg}</div>}
      <div className="grid grid--2 settings">
        <fieldset className="card form">
          <legend>Business</legend>
          {text('business_name', 'Trading name')}
          {text('legal_name', 'Registered name', 'e.g. Hipcastle Agency (Pty) Ltd')}
          {text('company_reg_no', 'CIPC registration number')}
          {text('tagline', 'Tagline')}
          <Field label="Default SEO description" hint={`${(s.seo_default_description || '').length}/300 — used on the home page and as a fallback`} error={errors.seo_default_description}>
            <textarea className="input" rows={3} value={s.seo_default_description} onChange={set('seo_default_description')} disabled={!admin} />
          </Field>
        </fieldset>
        <fieldset className="card form">
          <legend>Contact & location (keep identical to Google Business Profile)</legend>
          {text('website', 'Website', 'Canonical address: https://www.hipcastle.agency', 'url')}
          {text('email', 'Public email & sender', 'Shown on the site; emails are sent from this address', 'email')}
          {text('phone', 'Phone', 'e.g. +27 11 123 4567')}
          {text('whatsapp', 'WhatsApp number', 'Digits only, international format: 27821234567')}
          {text('street_address', 'Street address')}
          <div className="form__row">{text('address_locality', 'City')}{text('address_region', 'Province')}</div>
          {text('postal_code', 'Postal code')}
          {text('office_hours', 'Office hours')}
        </fieldset>
        <fieldset className="card form">
          <legend>Payments & tax</legend>
          {toggle('payfast_enabled', 'Offer PayFast', 'Card, instant EFT, SnapScan, Zapper')}
          {toggle('ozow_enabled', 'Offer Ozow', 'Instant EFT')}
          {toggle('orders_enabled', 'Accept new online orders', 'Turn off to pause checkout (e.g. over the December break)')}
          {toggle('vat_registered', 'VAT registered', 'Adds VAT to new invoices and shows “excl. VAT” on prices')}
          <div className="form__row">
            <Field label="VAT rate (%)" error={errors.vat_rate}><input className="input" type="number" step="0.5" value={s.vat_rate} onChange={set('vat_rate', Number)} disabled={!admin} /></Field>
            {text('vat_no', 'VAT number')}
          </div>
          <p className="muted small">Gateway credentials (merchant IDs, keys, passphrases) are set with environment variables for security — see System & processes.</p>
        </fieldset>
        <fieldset className="card form">
          <legend>Email notifications</legend>
          {toggle('emails_enabled', 'Send customer emails', 'Welcome, order confirmations, invoices, receipts, reminders and messages. Team alerts and password resets always send.')}
          {text('notify_email', 'Team inbox', 'New leads, orders, payments, reviews and client messages go here', 'email')}
          {text('billing_email', 'Billing reply-to', 'Replies to invoices, receipts and reminders go here', 'email')}
          <p className="muted small">Preview every template and check delivery in <a href="/admin/emails">Emails</a>.</p>
        </fieldset>
        <fieldset className="card form">
          <legend>Website</legend>
          <Field label="Announcement bar" hint="Shown above the header on every page. Leave empty to hide." error={errors.announcement}>
            <input className="input" value={s.announcement} onChange={set('announcement')} disabled={!admin} />
          </Field>
          <h3>Social media profiles</h3>
          <p className="muted small">Full profile URLs, e.g. https://www.instagram.com/hipcastle.za. Leave empty to hide an icon. These are also used as “sameAs” signals for Google and AI search.</p>
          {SOCIALS.map(([k, label]) => (
            <Field key={k} label={label} error={errors[`social.${k}`]}><input className="input" type="url" value={s.social?.[k] ?? ''} onChange={setSocial(k)} disabled={!admin} /></Field>
          ))}
        </fieldset>
      </div>
      {admin && <div className="center mt-lg"><button className="btn btn--primary btn--lg">Save settings</button></div>}
    </form>
  );
}
