import { Link } from 'react-router-dom';

/** The Hipcastle Agency logo (transparent; works on light and dark backgrounds). */
export default function Logo({ light = false, size = 'md' }) {
  return (
    <Link to="/" className={`logo logo--${size} ${light ? 'logo--light' : ''}`} aria-label="Hipcastle Agency — home">
      <picture>
        <source type="image/webp" srcSet={`/brand/hipcastle-logo-128.webp 1x, /brand/hipcastle-logo-192.webp 1.5x, /brand/hipcastle-logo.webp 3x`} />
        <img src="/brand/hipcastle-logo-128.png" srcSet="/brand/hipcastle-logo-128.png 1x, /brand/hipcastle-logo-192.png 1.5x, /brand/hipcastle-logo.png 3x"
          width="99" height="64" alt="Hipcastle Agency" decoding="async" />
      </picture>
    </Link>
  );
}

/** The icon mark (C-ring + H) for small spaces: favicon, app icons, avatars. */
export const LogoMark = ({ size = 32, className = '' }) => (
  <img src="/favicon.svg" width={size} height={size} alt="" aria-hidden="true" className={`logo-mark ${className}`} />
);
