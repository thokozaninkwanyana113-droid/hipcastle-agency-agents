import { statusLabel } from '../format.js';

export const Loader = () => <div className="page-loader" role="status"><span className="spinner" /><span className="sr-only">Loading…</span></div>;

export const ErrorBox = ({ error }) => error ? <div className="alert alert--error" role="alert">{error.message || String(error)}</div> : null;

export const Status = ({ value }) => <span className={`status status--${value}`}>{statusLabel(value)}</span>;

export const Progress = ({ value }) => (
  <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: `${value}%` }} />
  </div>
);

export function Field({ label, error, children, hint }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && !error && <small className="field__hint">{hint}</small>}
      {error && <small className="field__error">{error}</small>}
    </label>
  );
}

export function PageHeader({ eyebrow, title, children }) {
  return (
    <section className="page-header">
      <div className="container">
        {eyebrow && <span className="eyebrow eyebrow--light">{eyebrow}</span>}
        <h1>{title}</h1>
        {children && <div className="page-header__lead">{children}</div>}
      </div>
    </section>
  );
}
