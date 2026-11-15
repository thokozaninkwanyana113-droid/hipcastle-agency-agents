import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Seo from '../components/Seo.jsx';
import { ErrorBox } from '../components/ui.jsx';

/** Development-only stand-in for a gateway's hosted payment page. */
export default function PaymentSimulate() {
  const [params] = useSearchParams();
  const ref = params.get('ref');
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const act = async (outcome) => {
    try {
      await api(`/payments/simulated/${ref}`, { method: 'POST', body: { outcome } });
      navigate(`/payment/return?ref=${ref}`);
    } catch (e) { setError(e); }
  };
  return (
    <section className="auth">
      <Seo title="Test payment" noindex />
      <div className="card auth__card center">
        <span className="tag">Development only</span>
        <h1>Test payment</h1>
        <p className="muted">This simulates a gateway’s hosted payment page. No money moves. In production, customers are sent to PayFast or Ozow instead.</p>
        <ErrorBox error={error} />
        <div className="stack">
          <button className="btn btn--primary btn--block" onClick={() => act('complete')}>Approve payment</button>
          <button className="btn btn--outline btn--block" onClick={() => act('failed')}>Decline payment</button>
          <button className="btn btn--text btn--block" onClick={() => act('cancelled')}>Cancel</button>
        </div>
      </div>
    </section>
  );
}
