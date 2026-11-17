import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSite } from '../context/SiteContext.jsx';
import { startPayment } from '../payments.js';
import { moneyExact } from '../format.js';

/** Lets the client choose PayFast or Ozow (or test mode) and pay an invoice. */
/** `order` (optional) enables the automatic-monthly-payments option on monthly engagements. */
export default function PayButton({ invoice, order = null, onError }) {
  const { payment_methods: methods = [] } = useSite();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const canAutopay = order?.billing === 'monthly' && order.autopay_status !== 'active' && methods.some((m) => m.id === 'payfast');
  const [autopay, setAutopay] = useState(false);
  const pay = async (gateway) => {
    setBusy(gateway);
    try { await startPayment(invoice.id, gateway, navigate, { autopay: autopay && gateway === 'payfast' }); }
    catch (e) {
      if (e.status === 409 && e.message.includes('30 minutes')) {
        onError?.({ message: `${e.message} If you closed the payment page without paying, wait until the attempt expires or contact us.` });
      } else onError?.(e);
      setBusy(null);
    }
  };
  if (!methods.length) return <span className="muted small">Online payment unavailable — please EFT using reference {invoice.number}</span>;
  return (
    <div className="pay">
      {!open ? (
        <button className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>Pay {moneyExact(invoice.amount_cents)}</button>
      ) : (
        <div className="pay__methods" role="group" aria-label={`Choose how to pay ${invoice.number}`}>
          {canAutopay && (
            <label className="pay__autopay">
              <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
              <span><strong>Pay automatically every month</strong> by card through PayFast — {moneyExact(invoice.amount_cents)} per month, cancel any time in your portal.</span>
            </label>
          )}
          {methods.filter((m) => !autopay || m.id === 'payfast').map((m) => (
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
