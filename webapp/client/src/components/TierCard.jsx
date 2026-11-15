import { Link } from 'react-router-dom';
import { billingLabel, money } from '../format.js';

export default function TierCard({ tier, compact = false }) {
  return (
    <article className={`tier ${tier.is_popular ? 'tier--popular' : ''}`}>
      {tier.is_popular ? <span className="tier__badge">Most popular</span> : null}
      <h3 className="tier__name">{tier.name}</h3>
      <p className="tier__summary">{tier.summary}</p>
      <p className="tier__price">
        <strong>{money(tier.price_cents)}</strong>
        <span>{billingLabel(tier.billing)}</span>
      </p>
      <p className="tier__meta">
        {tier.billing === 'monthly' ? 'Rolling monthly retainer' : `Typical delivery: ${tier.delivery_days} days`}
      </p>
      {!compact && (
        <ul className="tier__features">
          {tier.features.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      <Link to={`/checkout/${tier.id}`} className={`btn btn--block ${tier.is_popular ? 'btn--primary' : 'btn--outline'}`}>
        Choose {tier.name}
      </Link>
    </article>
  );
}
