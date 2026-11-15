import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { dateTime } from '../../format.js';
import { LiveDot, PanelHead, StatusFilter } from './shared.jsx';

const TYPES = ['order', 'payment', 'lead', 'invoice', 'user', 'auth', 'testimonial', 'post', 'settings', 'job', 'system'];

export default function Activity() {
  const [level, setLevel] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [more, setMore] = useState(true);

  const load = async (before) => {
    try {
      const list = await api(`/admin/events?level=${level}&type=${type}&q=${encodeURIComponent(q)}&limit=50${before ? `&before=${before}` : ''}`);
      setItems((prev) => (before ? [...prev, ...list] : list));
      setMore(list.length === 50);
    } catch (e) { setError(e); }
  };
  useEffect(() => { const t = setTimeout(() => load(), 200); return () => clearTimeout(t); }, [level, type, q]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 15000);
    return () => clearInterval(t);
  }, [level, type, q]);

  return (
    <>
      <PanelHead title="Activity log" sub="Every order, payment, gateway notification, sign-in and admin action."><LiveDot /></PanelHead>
      <div className="toolbar">
        <input type="search" className="input" placeholder="Search messages…" aria-label="Search activity" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <StatusFilter value={level} onChange={setLevel} options={['info', 'warn', 'error']} label="Severity" />
      <ErrorBox error={error} />
      {!items && <Loader />}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Level</th><th>Type</th><th>Event</th><th>By</th></tr></thead>
          <tbody>
            {items?.map((e) => (
              <tr key={e.id} className={`row--${e.level}`}>
                <td className="nowrap">{dateTime(e.created_at)}</td>
                <td><span className={`status status--lvl-${e.level}`}>{e.level}</span></td>
                <td><code>{e.type}</code></td>
                <td>{e.message}{e.meta && <small>{Object.entries(e.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')}</small>}</td>
                <td>{e.actor_name || 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items?.length === 0 && <p className="empty">No matching events.</p>}
      </div>
      {more && items?.length > 0 && <p className="center mt"><button className="btn btn--outline btn--sm" onClick={() => load(items[items.length - 1].id)}>Load older</button></p>}
    </>
  );
}
