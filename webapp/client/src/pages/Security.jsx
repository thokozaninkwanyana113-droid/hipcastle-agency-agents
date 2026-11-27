// Account → Security: two-step sign-in with an authenticator app, recovery codes, and signing out everywhere.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api, setToken } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { date } from '../format.js';
import { ErrorBox, Field, Loader } from '../components/ui.jsx';

function RecoveryCodes({ codes, onDone }) {
  const text = `Hipcastle Agency — two-step sign-in recovery codes\nEach code works once. Keep them somewhere safe (e.g. your password manager).\n\n${codes.join('\n')}\n`;
  const download = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: 'hipcastle-recovery-codes.txt' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const [copied, setCopied] = useState(false);
  return (
    <div className="recovery">
      <h3>Save your recovery codes</h3>
      <p>If you lose your phone, each of these codes lets you sign in once. <strong>This is the only time they’re shown.</strong> Store them in your password manager or print them.</p>
      <ol className="recovery__codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="form__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={download}>Download .txt</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true))}>{copied ? 'Copied ✓' : 'Copy'}</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onDone}>I’ve saved them</button>
      </div>
    </div>
  );
}

export default function Security() {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const { data: st, error, loading, setData } = useFetch('/auth/2fa');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [off, setOff] = useState({ password: '', code: '' });
  if (loading && !st) return <Loader />;
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e); } finally { setBusy(false); } };

  const start = () => run(async () => { setSetup(await api('/auth/2fa/setup', { method: 'POST' })); setCode(''); });
  const confirm = (e) => { e.preventDefault(); run(async () => {
    const r = await api('/auth/2fa/enable', { method: 'POST', body: { code } });
    signIn(r); setData(r.status); setSetup(null); setCodes(r.recovery_codes);
  }); };
  const regenerate = () => { const c = window.prompt('Enter a current 6-digit code from your authenticator app to create new recovery codes (the old ones stop working):'); if (c) run(async () => { const r = await api('/auth/2fa/recovery-codes', { method: 'POST', body: { code: c } }); setData(r.status); setCodes(r.recovery_codes); }); };
  const disable = (e) => { e.preventDefault(); run(async () => { const r = await api('/auth/2fa/disable', { method: 'POST', body: off }); signIn(r); setData(r.status); setOff({ password: '', code: '' }); }); };
  const signOutAll = () => window.confirm('Sign out of every other device and browser?') && run(async () => { const r = await api('/auth/logout-all', { method: 'POST' }); setToken(r.token); signIn(r); });
  const home = user.role === 'client' ? '/portal' : '/admin';

  return (
    <section className="section">
      <Seo title="Security" noindex />
      <div className="container narrow">
        <nav className="breadcrumb"><Link to="/account">Account</Link> / <span>Security</span></nav>
        <h1>Security</h1>
        {params.get('required') && !st?.enabled && <div className="alert alert--info">Team accounts must use two-step sign-in. Set it up below to open the Command Centre — it takes about a minute.</div>}
        <ErrorBox error={error || err} />

        <div className="card">
          <h2>🔐 Two-step sign-in {st?.enabled ? <span className="status status--paid">On</span> : <span className="status status--pending">Off</span>}</h2>
          <p className="muted">After your password, you’ll also enter a 6-digit code from an authenticator app on your phone — Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden or Authy. Someone who steals your password still can’t get in.</p>

          {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

          {!st?.enabled && !setup && <button className="btn btn--primary" disabled={busy} onClick={start}>Set up two-step sign-in</button>}

          {setup && (
            <form className="form two-step-setup" onSubmit={confirm}>
              <ol>
                <li>Open your authenticator app and add an account (usually the <strong>+</strong> button).</li>
                <li>Scan this QR code{' '}
                  <span className="muted small">(or enter the key by hand: <code className="two-step-key">{setup.secret}</code>, time-based)</span>
                  <div className="two-step-qr" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.qr_svg }} />
                </li>
                <li>Enter the 6-digit code the app shows:</li>
              </ol>
              <Field label="6-digit code"><input className="input input--code" required autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={7} placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
              <div className="form__actions">
                <button className="btn btn--primary" disabled={busy}>{busy ? 'Checking…' : 'Turn on two-step sign-in'}</button>
                <button type="button" className="btn btn--ghost" onClick={() => setSetup(null)}>Cancel</button>
              </div>
            </form>
          )}

          {st?.enabled && !codes && (
            <>
              <p>On since {date(st.enabled_at)}. <strong>{st.recovery_codes_left}</strong> recovery code{st.recovery_codes_left === 1 ? '' : 's'} left.{st.recovery_codes_left <= 3 && ' Create new ones soon.'}</p>
              <div className="form__actions"><button className="btn btn--ghost btn--sm" disabled={busy} onClick={regenerate}>Create new recovery codes</button></div>
              {st.required ? (
                <p className="muted small">Two-step sign-in is required for team accounts. New phone? Ask an admin to reset it (Command Centre → Users), then set it up again.</p>
              ) : (
                <details>
                  <summary className="small">Turn off two-step sign-in</summary>
                  <form className="form" onSubmit={disable}>
                    <Field label="Password"><input className="input" type="password" required autoComplete="current-password" value={off.password} onChange={(e) => setOff({ ...off, password: e.target.value })} /></Field>
                    <Field label="Code from your app (or a recovery code)"><input className="input" required value={off.code} onChange={(e) => setOff({ ...off, code: e.target.value })} /></Field>
                    <button className="btn btn--ghost btn--sm" disabled={busy}>Turn off</button>
                  </form>
                </details>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h2>Devices</h2>
          <p className="muted">Signed in somewhere you shouldn’t be? Sign out everywhere else. {user.role === 'client' ? 'Sessions last 7 days.' : 'Team sessions last 12 hours.'}</p>
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={signOutAll}>Sign out of all other devices</button>
        </div>
        {st?.enabled && <p><Link to={home}>← Back to {user.role === 'client' ? 'your portal' : 'the Command Centre'}</Link></p>}
      </div>
    </section>
  );
}
