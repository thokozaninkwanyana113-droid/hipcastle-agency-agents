import { useState } from 'react';
import { api, setToken } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';
import Seo from '../components/Seo.jsx';

export default function Account() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, company: user.company || '', phone: user.phone || '', currentPassword: '', newPassword: '' });
  const [state, setState] = useState({ msg: '', error: '', fields: {} });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const body = { name: form.name, company: form.company, phone: form.phone };
    if (form.newPassword) Object.assign(body, { currentPassword: form.currentPassword, newPassword: form.newPassword });
    try {
      const { token, ...u } = await api('/auth/me', { method: 'PATCH', body });
      if (token) setToken(token); // a password change signs out every other session
      setUser(u);
      setForm({ ...form, currentPassword: '', newPassword: '' });
      setState({ msg: token ? 'Password changed — you’ve been signed out on all other devices.' : 'Saved.', error: '', fields: {} });
    } catch (err) { setState({ msg: '', error: err.message, fields: err.fields }); }
  };
  const logoutAll = async () => {
    if (!window.confirm('Sign out of Hipcastle on every other device?')) return;
    try {
      const r = await api('/auth/logout-all', { method: 'POST' });
      setToken(r.token);
      setState({ msg: 'Signed out of all other devices.', error: '', fields: {} });
    } catch (err) { setState({ msg: '', error: err.message, fields: {} }); }
  };

  return (
    <section className="auth">
      <Seo title="Account settings" noindex />
      <form className="card auth__card form" onSubmit={submit}>
        <h1>Account settings</h1>
        <p className="muted">{user.email}</p>
        {state.error && <div className="alert alert--error">{state.error}</div>}
        {state.msg && <div className="alert alert--success">{state.msg}</div>}
        <Field label="Name" error={state.fields.name}><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Company"><input className="input" value={form.company} onChange={set('company')} /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <hr />
        <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} /></Field>
        <Field label="New password" error={state.fields.newPassword} hint="Leave blank to keep your current password"><input className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} /></Field>
        <button className="btn btn--primary">Save changes</button>
        <hr />
        <p className="muted small">Lost a device or shared a computer? This ends every other session.</p>
        <button type="button" className="btn btn--outline" onClick={logoutAll}>Sign out of all other devices</button>
      </form>
    </section>
  );
}
