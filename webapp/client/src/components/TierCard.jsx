import { Link } from 'react-router-dom';
import { billingLabel, hoursLabel, money } from '../format.js';
import { useSite } from '../context/SiteContext.jsx';

const RESPONSE = { normal: '2 business days', high: '1 business day', urgent: '4 business hours' };

export default function TierCard({ tier, covers = null }) {
  const { vat_registered } = useSite();
  const care = tier.plan === 'care';
  return (
    <article className={`tier ${tier.is_popular ? 'tier--popular' : ''} ${care ? 'tier--care' : ''}`}>
      {tier.is_popular ? <span className="tier__badge">Most popular</span> : null}
      <h3 className="tier__name">{tier.name}</h3>
      <p className="tier__summary">{tier.summary}</p>
      <p className="tier__price">
        <strong>{money(tier.price_cents)}</strong>
        <span>{billingLabel(tier.billing)}{vat_registered ? ' excl. VAT' : ''}</span>
      </p>
      <p className="tier__meta">
        {care
          ? <>{hoursLabel(tier.care_minutes)} hands-on time / month · support reply within {RESPONSE[tier.support_priority] || '2 business days'} · no lock-in</>
          : tier.billing === 'monthly' ? 'Monthly retainer · cancel with 30 days’ notice' : `50% deposit · typical delivery ${tier.delivery_days} days`}
      </p>
      <ul className="tier__features">{tier.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <Link to={`/checkout/${tier.id}${covers ? `?covers=${covers}` : ''}`} className={`btn btn--block ${tier.is_popular ? 'btn--primary' : 'btn--outline'}`}>
        {care ? `Add ${tier.name}` : `Choose ${tier.name}`}
      </Link>
    </article>
  );
}
