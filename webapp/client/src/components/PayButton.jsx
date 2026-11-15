import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSite } from '../context/SiteContext.jsx';
import { startPayment } from '../payments.js';
import { moneyExact } from '../format.js';

/** Lets the client choose PayFast or Ozow (or test mode) and pay an invoice. */
export default function PayButton({ invoice, onError }) {
  const { payment_methods: methods = [] } = useSite();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const pay = async (gateway) => {
    setBusy(gateway);
    try { await startPayment(invoice.id, gateway, navigate); } catch (e) { onError?.(e); setBusy(null); }
  };
  if (!methods.length) return <span className="muted small">Online payment unavailable — please EFT using reference {invoice.number}</span>;
  return (
    <div className="pay">
      {!open ? (
        <button className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>Pay {moneyExact(invoice.amount_cents)}</button>
      ) : (
        <div className="pay__methods" role="group" aria-label={`Choose how to pay ${invoice.number}`}>
          {methods.map((m) => (
            <button key={m.id} className={`pay__method pay__method--${m.id}`} onClick={() => pay(m.id)} disabled={Boolean(busy)}>
              <strong>{busy === m.id ? 'Redirecting…' : m.name}</strong>
              <small>{m.methods}{m.test && m.id !== 'simulated' ? ' · sandbox' : ''}</small>
            </button>
          ))}
          <button className="btn btn--text btn--sm" onClick={() => setOpen(false)} disabled={Boolean(busy)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
