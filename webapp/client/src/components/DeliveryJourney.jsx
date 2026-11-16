import { useState } from 'react';
import { Link } from 'react-router-dom';

/** Public "how delivery works" timeline for a service, per tier. */
export default function DeliveryJourney({ service }) {
  const [tier, setTier] = useState(service.journey.find((j) => j.tier === 'growth')?.tier || service.journey[0].tier);
  const j = service.journey.find((x) => x.tier === tier);
  return (
    <section className="section section--alt" aria-labelledby="journey-h">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">How delivery works</span>
          <h2 id="journey-h">Your {service.name.toLowerCase()} journey, step by step</h2>
          <p>From onboarding to handover — every step has an owner, a deadline and, where it matters, your sign-off.</p>
        </div>
        <div className="filters filters--center" role="tablist" aria-label="Choose a tier">
          {service.journey.map((x) => (
            <button key={x.tier} role="tab" aria-selected={x.tier === tier} className={`chip ${x.tier === tier ? 'chip--active' : ''}`} onClick={() => setTier(x.tier)}>{x.name}</button>
          ))}
        </div>
        <p className="center journey__facts">
          {j.kind === 'project'
            ? <>Launch in about <strong>{j.launch_days} days</strong> · <strong>{j.support_days} days</strong> post-launch support · </>
            : <>Monthly retainer · onboarding & setup, then a <strong>repeating monthly cycle</strong> · </>}
          <strong>{j.revisions === null ? 'unlimited' : j.revisions}</strong> revision rounds per deliverable
        </p>
        <ol className="journey">
          {j.stages.map((st, i) => (
            <li key={st.stage} className="journey__stage">
              <span className="journey__n">{i + 1}</span>
              <h3>{st.stage === 'cycle' ? 'Every month' : st.label}{st.stage !== 'cycle' && <small> · ~{st.days} day{st.days === 1 ? '' : 's'}</small>}</h3>
              <ul>
                {st.steps.map((x) => (
                  <li key={x.title}>
                    {x.title}
                    {x.client && <span className="tag">you</span>}
                    {x.approval && <span className="tag tag--gold">your approval</span>}
                    {x.deliverable && <small>📦 {x.deliverable}</small>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="center mt"><Link to={`/contact?service=${service.slug}`} className="btn btn--primary">Plan my project</Link></p>
      </div>
    </section>
  );
}
