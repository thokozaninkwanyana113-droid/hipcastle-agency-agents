import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Seo from '../components/Seo.jsx';
import { ErrorBox } from '../components/ui.jsx';
import { moneyExact } from '../format.js';

const COPY = {
  complete: ['✅', 'Payment received — thank you!', 'Your invoice is marked as paid and your team has been notified.'],
  pending: ['⏳', 'Confirming your payment…', 'We’re waiting for confirmation from the payment provider. This usually takes a few seconds.'],
  initiated: ['⏳', 'Confirming your payment…', 'We’re waiting for confirmation from the payment provider. This usually takes a few seconds.'],
  cancelled: ['↩️', 'Payment cancelled', 'No money was taken. You can try again from your portal at any time.'],
  failed: ['⚠️', 'Payment unsuccessful', 'The payment was not completed. Please try again or choose another payment method.'],
  abandoned: ['⌛', 'Payment not completed', 'This checkout expired. Please start a new payment from your portal.'],
};

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const ref = params.get('ref');
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!ref) return;
    let stop = false;
    const gatewayStatus = params.get('gateway_status');
    const poll = async (n) => {
      try {
        const r = await api(`/payments/status/${ref}`);
        if (stop) return;
        setP(r); setTries(n);
        if (!r.terminal && n < 20) setTimeout(() => poll(n + 1), 3000);
      } catch (e) { if (!stop) setError(e); }
    };
    // The customer pressed Cancel at the gateway: abandon this attempt (only they can, while signed in).
    (gatewayStatus === 'cancelled' ? api(`/payments/${ref}/cancel`, { method: 'POST' }).catch(() => {}) : Promise.resolve()).then(() => poll(0));
    return () => { stop = true; };
  }, [ref]);

  const [icon, title, text] = COPY[p?.status] || COPY.pending;
  return (
    <section className="auth">
      <Seo title="Payment status" noindex />
      <div className="card auth__card center" role="status" aria-live="polite">
        <ErrorBox error={error} />
        <p className="payment-icon" aria-hidden="true">{icon}</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        {p && <p><strong>{moneyExact(p.amount_cents)}</strong> · {p.invoice.number} · ref {p.reference}</p>}
        {p && !p.terminal && tries >= 20 && <p className="muted small">Still waiting. You can safely leave this page — we’ll update your invoice automatically once the payment is confirmed.</p>}
        {p && <Link className="btn btn--primary btn--block" to={`/portal/orders/${p.invoice.order_id}`}>Back to my engagement</Link>}
      </div>
    </section>
  );
}
