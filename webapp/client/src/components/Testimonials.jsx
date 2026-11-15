export function Stars({ rating }) {
  return <span className="stars" role="img" aria-label={`${rating} out of 5 stars`}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>;
}

export function TestimonialCard({ t }) {
  return (
    <figure className="testimonial">
      <Stars rating={t.rating} />
      <blockquote>“{t.quote}”</blockquote>
      <figcaption>
        <span className="testimonial__avatar" aria-hidden="true">{t.author.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>
        <span>
          <strong>{t.author}</strong>
          <span>{[t.role, t.company].filter(Boolean).join(', ')}{t.location ? ` · ${t.location}` : ''}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Faq({ items }) {
  return (
    <div className="faq">
      {items.map((f) => (
        <details key={f.q}><summary><h3>{f.q}</h3></summary><p>{f.a}</p></details>
      ))}
    </div>
  );
}
