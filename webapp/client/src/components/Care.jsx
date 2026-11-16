// Care plans: aftercare, maintenance & hosting.
import { Link } from 'react-router-dom';
import TierCard from './TierCard.jsx';
import { hoursLabel, money, date } from '../format.js';

/** The three care tiers of one service, with its title and blurb. */
export function CareSection({ care, covers = null, heading = 'h2', id }) {
  if (!care?.tiers?.length) return null;
  const H = heading;
  return (
    <div className="care-section" id={id}>
      <div className="care-section__head">
        <span className="eyebrow">After launch</span>
        <H>{care.title}</H>
        <p>{care.blurb}</p>
      </div>
      <div className="grid grid--tiers">{care.tiers.map((t) => <TierCard key={t.id} tier={t} covers={covers} />)}</div>
      <p className="muted small center">Month-to-month — cancel with 30 days’ notice. Hours reset monthly. <Link to="/care">How care plans work →</Link></p>
    </div>
  );
}

/** Hours used vs included in the current month of a care plan. */
export function CareUsage({ usage, compact = false }) {
  if (!usage) return null;
  const pct = usage.included_minutes ? Math.min(100, Math.round((usage.used_minutes / usage.included_minutes) * 100)) : 0;
  return (
    <div className={`care-usage ${compact ? 'care-usage--compact' : ''}`}>
      <div className="care-usage__head">
        <strong>{compact ? 'Care hours this month' : `${usage.title} — month ${usage.cycle}`}</strong>
        <span>{hoursLabel(usage.used_minutes)} of {hoursLabel(usage.included_minutes)} used</span>
      </div>
      <div className={`meter ${usage.over_minutes > 0 ? 'meter--over' : pct >= 80 ? 'meter--warn' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Care hours used">
        <span style={{ width: `${pct}%` }} />
      </div>
      {usage.over_minutes > 0
        ? <small className="text-error">{hoursLabel(usage.over_minutes)} over the allowance — extra work is quoted first at {money(usage.extra_hour_cents)}/hour.</small>
        : <small className="muted">{hoursLabel(usage.remaining_minutes)} left · resets next month{usage.covers_reference ? ` · looks after ${usage.covers_reference}` : ''}</small>}
      {!compact && usage.entries?.length > 0 && (
        <ul className="care-usage__log">
          {usage.entries.map((e) => <li key={e.id}><span>{date(e.created_at)} · {e.note}{e.ticket_reference ? ` (${e.ticket_reference})` : ''}</span><strong>{hoursLabel(e.minutes)}</strong></li>)}
        </ul>
      )}
    </div>
  );
}
