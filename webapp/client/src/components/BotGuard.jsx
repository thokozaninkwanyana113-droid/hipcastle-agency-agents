// Bot protection for public forms: a hidden honeypot field plus Cloudflare Turnstile
// when a site key is configured (Command Centre → System shows whether it is on).
import { useEffect, useRef } from 'react';
import { useSite } from '../context/SiteContext.jsx';

/** Hidden field real people never see or fill in. */
export function Honeypot({ value, onChange }) {
  return (
    <div className="hp" aria-hidden="true">
      <label>Leave this field empty<input type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} /></label>
    </div>
  );
}

let scriptPromise = null;
const loadScript = () => (scriptPromise ||= new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = resolve;
  s.onerror = reject;
  document.head.appendChild(s);
}));

/** Cloudflare Turnstile widget; renders nothing when no site key is configured. */
export function Captcha({ onToken }) {
  const { turnstile_site_key: siteKey } = useSite();
  const el = useRef(null);
  useEffect(() => {
    if (!siteKey || !el.current) return undefined;
    let id;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !window.turnstile) return;
      id = window.turnstile.render(el.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken('') });
    }).catch(() => onToken(''));
    return () => { cancelled = true; if (id !== undefined && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return siteKey ? <div ref={el} className="captcha" /> : null;
}
