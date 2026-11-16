import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { billingLabel, hoursLabel, money } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { PanelHead } from './shared.jsx';

export default function Catalog() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const { data: services, error, loading, reload } = useFetch('/admin/services');
  const { data: tiers, reload: reloadTiers } = useFetch('/services?include=tiers,care');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  if (loading && !services) return <Loader />;
  const tiersBySlug = Object.fromEntries((tiers || []).map((s) => [s.slug, [...s.tiers, ...(s.care?.tiers || [])]]));

  const toggle = async (s) => {
    if (s.is_active && !window.confirm(`Hide ${s.name} from the website? Existing engagements are unaffected.`)) return;
    setErr(null);
    try { await api(`/admin/services/${s.id}`, { method: 'PATCH', body: { is_active: !s.is_active } }); reload(); reloadTiers(); } catch (e) { setErr(e); }
  };
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      await api(`/admin/tiers/${editing.id}`, { method: 'PATCH', body: {
        name: editing.name, price_cents: Math.round(Number(editing.price) * 100), delivery_days: Number(editing.delivery_days),
        summary: editing.summary, features: editing.featuresText.split('\n').map((f) => f.trim()).filter(Boolean), is_popular: editing.is_popular,
        ...(editing.plan === 'care' && { care_minutes: Math.round(Number(editing.hours) * 60) }),
      } });
      setEditing(null); reloadTiers();
    } catch (e2) { setErr(e2); }
  };

  return (
    <>
      <PanelHead title="Services & pricing" sub="Switch service lines on or off and edit package and 🛟 care plan prices (in rand, excl. VAT), scope, features and care hours. Changes are live immediately." />
      <ErrorBox error={error || err} />
      {!admin && <p className="muted">Only admins can change the catalog.</p>}
      {services?.map((s) => (
        <div key={s.slug} className={`card catalog-row ${s.is_active ? '' : 'catalog-row--off'}`}>
          <div className="catalog-row__head">
            <h3>{s.icon} {s.name} <small className="muted">· {s.order_count} orders</small></h3>
            {admin && (
              <label className="switch">
                <input type="checkbox" checked={!!s.is_active} onChange={() => toggle(s)} />
                <span>{s.is_active ? 'Live on website' : 'Hidden'}</span>
              </label>
            )}
          </div>
          <div className="catalog-row__tiers">
            {(tiersBySlug[s.slug] || []).map((t) => (
              <div key={t.id} className={`catalog-tier ${t.is_popular ? 'catalog-tier--popular' : ''} ${t.plan === 'care' ? 'catalog-tier--care' : ''}`}>
                <strong>{t.plan === 'care' ? '🛟 ' : ''}{t.name}</strong>
                <span>{money(t.price_cents)} {billingLabel(t.billing)}</span>
                <small>{t.features.length} features · {t.plan === 'care' ? `${hoursLabel(t.care_minutes)} / month` : `${t.delivery_days} days`}</small>
                {admin && <button className="btn btn--text btn--sm" onClick={() => setEditing({ ...t, price: t.price_cents / 100, hours: (t.care_minutes || 0) / 60, featuresText: t.features.join('\n') })}>Edit</button>}
              </div>
            ))}
            {!s.is_active && <p className="muted small">Hidden services keep their tiers; reactivate to show them again.</p>}
          </div>
        </div>
      ))}
      {editing && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Edit tier" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="card form modal__card" onSubmit={save}>
            <h2>Edit {editing.name} tier</h2>
            <ErrorBox error={err} />
            <label className="field"><span className="field__label">Name</span><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <div className="form__row">
              <label className="field"><span className="field__label">Price (R, excl. VAT) {billingLabel(editing.billing)}</span><input className="input" type="number" min="0" step="100" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></label>
              {editing.plan === 'care'
                ? <label className="field"><span className="field__label">Hours included per month</span><input className="input" type="number" min="0" step="0.5" value={editing.hours} onChange={(e) => setEditing({ ...editing, hours: e.target.value })} /></label>
                : <label className="field"><span className="field__label">Delivery days</span><input className="input" type="number" min="1" value={editing.delivery_days} onChange={(e) => setEditing({ ...editing, delivery_days: e.target.value })} /></label>}
            </div>
            <label className="field"><span className="field__label">Summary</span><input className="input" value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} /></label>
            <label className="field"><span className="field__label">Features (one per line)</span><textarea className="input" rows={7} value={editing.featuresText} onChange={(e) => setEditing({ ...editing, featuresText: e.target.value })} /></label>
            <label className="checkbox"><input type="checkbox" checked={!!editing.is_popular} onChange={(e) => setEditing({ ...editing, is_popular: e.target.checked })} /><span>Highlight as most popular</span></label>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn--primary">Save tier</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
