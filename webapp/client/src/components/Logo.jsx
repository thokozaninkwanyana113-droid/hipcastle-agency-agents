import { Link } from 'react-router-dom';

export default function Logo({ light = false }) {
  return (
    <Link to="/" className={`logo ${light ? 'logo--light' : ''}`} aria-label="Hipcastle Agency home">
      <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="currentColor" className="logo__bg" />
        <path d="M7 25V12l3 2V9l3 2V7l3 2 3-2v4l3-2v5l3-2v13z" fill="#f2b544" />
        <rect x="14" y="18" width="4" height="7" rx="2" fill="#0b1530" />
      </svg>
      <span>Hipcastle<small>Agency</small></span>
    </Link>
  );
}
