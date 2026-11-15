import { Link } from 'react-router-dom';
import { money } from '../format.js';

export default function ServiceCard({ service }) {
  return (
    <Link to={`/services/${service.slug}`} className="service-card">
      <span className="service-card__icon" aria-hidden="true">{service.icon}</span>
      <h3>{service.name}</h3>
      <p>{service.tagline}</p>
      <div className="service-card__foot">
        <span>{service.agent_count} specialists</span>
        <span>From <strong>{money(service.from_price_cents)}</strong></span>
      </div>
    </Link>
  );
}
