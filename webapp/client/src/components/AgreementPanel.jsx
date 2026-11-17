// Service agreement: read and sign electronically before the first payment (ECTA-compliant record).
import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { dateTime } from '../format.js';
import { Field } from './ui.jsx';

export default function AgreementPanel({ order, canSign, onSigned }) {
  const a = order.agreement;
  const [open, setOpen] = useState(a?.requires_signature && a.status === 'pending');
  const { data: doc } = useFetch(open ? `/orders/${order.id}/agreement` : null);
  const [f, setF] = useState({ full_name: '', title: '', accept: false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!a) return null;
  const pending = a.requires_signature && a.status === 'pending';
  const sign = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api(`/orders/${order.id}/agreement/sign`, { method: 'POST', body: f }); onSigned?.(); }
    catch (ex) { setErr(ex.fields?.full_name || ex.fields?.accept || ex.message); }
    setBusy(false);
  };
  return (
    <section id="agreement" className={`card agreement ${pending ? 'agreement--pending' : ''}`} aria-labelledby="agreement-h">
      <div className="agreement__head">
        <div>
          <h2 id="agreement-h">{pending ? '✍️ Review & sign your service agreement' : 'Service agreement'}</h2>
          <p className="muted small">
            {pending ? 'Please sign before paying the first invoice. It sets out the scope, fees, ownership of the work and POPIA — in plain language.'
              : a.status === 'signed' ? `Signed by ${a.signer_name}${a.signer_title ? `, ${a.signer_title}` : ''} on ${dateTime(a.signed_at)}. A copy was emailed to you.`
                : a.status === 'accepted' ? `Accepted at checkout on ${dateTime(a.signed_at)}.` : 'Not yet accepted.'}
          </p>
        </div>
        {!pending && <button className="btn btn--ghost btn--sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'View agreement'}</button>}
      </div>
      {open && (doc ? <pre className="agreement__doc" tabIndex={0} aria-label="Agreement text">{doc.document}</pre> : <p className="muted">Loading…</p>)}
      {pending && canSign && doc && (
        <form className="form agreement__sign" onSubmit={sign}>
          <div className="form__row">
            <Field label="Your full name (your electronic signature)"><input className="input" required minLength={3} maxLength={120} autoComplete="name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Role (optional)"><input className="input" maxLength={80} placeholder="e.g. Owner, Director" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          </div>
          <label className="checkbox"><input type="checkbox" checked={f.accept} onChange={(e) => setF({ ...f, accept: e.target.checked })} />
            <span>I have read this agreement, I am authorised to sign for {order.client_company || 'myself'}, and I agree to it. I sign electronically under the Electronic Communications and Transactions Act.</span></label>
          {err && <p className="text-error" role="alert">{err}</p>}
          <button className="btn btn--primary" disabled={busy || !f.accept || f.full_name.trim().length < 3}>{busy ? 'Signing…' : 'Sign agreement'}</button>
          <p className="muted small">We record your name, the time, your IP address and a fingerprint (SHA-256) of the exact text above.</p>
        </form>
      )}
      {pending && !canSign && <p className="muted small">Waiting for the client to sign.</p>}
    </section>
  );
}
