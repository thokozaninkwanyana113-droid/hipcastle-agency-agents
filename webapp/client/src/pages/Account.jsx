import { useState } from 'react';
import { api } from '../api.js';
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
      setUser(await api('/auth/me', { method: 'PATCH', body }));
      setForm({ ...form, currentPassword: '', newPassword: '' });
      setState({ msg: 'Saved.', error: '', fields: {} });
    } catch (err) { setState({ msg: '', error: err.message, fields: err.fields }); }
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
      </form>
    </section>
  );
}
