// Shown when the credential guard removed a password, card or ID number from something the user sent.
import { useEffect, useState } from 'react';
import { useSite } from '../context/SiteContext.jsx';

export default function RedactionNotice() {
  const { secure_share_hint: hint } = useSite();
  const [kinds, setKinds] = useState(null);
  useEffect(() => {
    const h = (e) => setKinds(e.detail);
    window.addEventListener('hipcastle:redacted', h);
    return () => window.removeEventListener('hipcastle:redacted', h);
  }, []);
  if (!kinds) return null;
  return (
    <div className="redaction" role="alert">
      <strong>🔐 We removed a {kinds.join(' / ')} from your message for your security.</strong>
      <span>{hint || 'Never send passwords in messages — invite us as a user, or share a one-time link from a password manager.'}</span>
      <button className="btn btn--text btn--sm" onClick={() => setKinds(null)} aria-label="Dismiss">OK</button>
    </div>
  );
}
