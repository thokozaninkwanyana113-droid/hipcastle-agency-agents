import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { setToken } from '../api.js';
import { Field } from '../components/ui.jsx';
import Seo from '../components/Seo.jsx';

function useAfterAuth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  return (user) => navigate(safe || (user.role === 'client' ? '/portal' : '/admin'), { replace: true });
}

export function Login() {
  const { login } = useAuth();
  const done = useAfterAuth();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { done(await login(form.email, form.password)); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <section className="auth">
      <Seo title="Sign in" noindex />
      <form className="card auth__card form" onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your Hipcastle client portal.</p>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <Field label="Email"><input className="input" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password"><input className="input" type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <p className="right small"><Link to="/forgot-password">Forgot your password?</Link></p>
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted center">New to Hipcastle? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Create an account</Link></p>
      </form>
    </section>
  );
}

export function Register() {
  const { register } = useAuth();
  const done = useAfterAuth();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', company: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    try { done(await register(form)); } catch (err) { setErrors({ ...err.fields, _: err.message }); setBusy(false); }
  };

  return (
    <section className="auth">
      <Seo title="Create an account" noindex />
      <form className="card auth__card form" onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <p className="muted">Order services, track progress and pay invoices in one place.</p>
        {errors._ && <div className="alert alert--error" role="alert">{errors._}</div>}
        <Field label="Full name" error={errors.name}><input className="input" required autoComplete="name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Work email" error={errors.email}><input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Company" error={errors.company}><input className="input" autoComplete="organization" value={form.company} onChange={set('company')} /></Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters"><input className="input" type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="muted center">Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Sign in</Link></p>
      </form>
    </section>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', msg: '' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'loading', msg: '' });
    try {
      const r = await api('/auth/forgot', { method: 'POST', body: { email } });
      setState({ status: 'done', msg: r.message });
    } catch (err) { setState({ status: 'error', msg: err.fields?.email || err.message }); }
  };
  return (
    <section className="auth">
      <Seo title="Forgot password" noindex />
      <form className="card auth__card form" onSubmit={submit}>
        <h1>Forgot your password?</h1>
        <p className="muted">Enter your account email and we’ll send you a secure link to choose a new password.</p>
        {state.status === 'done' ? <div className="alert alert--success" role="status">{state.msg} Check your inbox (and spam folder) — the link expires in 1 hour.</div> : (
          <>
            {state.status === 'error' && <div className="alert alert--error" role="alert">{state.msg}</div>}
            <Field label="Email"><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <button className="btn btn--primary btn--block" disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Sending…' : 'Send reset link'}</button>
          </>
        )}
        <p className="muted center"><Link to="/login">Back to sign in</Link></p>
      </form>
    </section>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.password !== pw.confirm) return setError('Passwords do not match.');
    setBusy(true); setError('');
    try {
      const r = await api('/auth/reset', { method: 'POST', body: { token, password: pw.password } });
      setToken(r.token); setUser(r.user);
      navigate(r.user.role === 'client' ? '/portal' : '/admin', { replace: true });
    } catch (err) { setError(err.fields?.password || err.message); setBusy(false); }
  };
  return (
    <section className="auth">
      <Seo title="Choose a new password" noindex />
      <form className="card auth__card form" onSubmit={submit}>
        <h1>Choose a new password</h1>
        {!token && <div className="alert alert--error">This link is missing its token. Please request a new reset email.</div>}
        {error && <div className="alert alert--error" role="alert">{error} {/expired|invalid/.test(error) && <Link to="/forgot-password">Request a new link</Link>}</div>}
        <Field label="New password" hint="At least 8 characters"><input className="input" type="password" required minLength={8} autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
        <Field label="Confirm new password"><input className="input" type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        <button className="btn btn--primary btn--block" disabled={busy || !token}>{busy ? 'Saving…' : 'Save password & sign in'}</button>
      </form>
    </section>
  );
}
