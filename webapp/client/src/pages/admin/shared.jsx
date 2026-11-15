import { useEffect, useState } from 'react';
import { getToken } from '../../api.js';
import { money } from '../../format.js';

export function StatusFilter({ value, onChange, options, label = 'Filter' }) {
  return (
    <div className="filters" role="group" aria-label={label}>
      {['', ...options].map((s) => (
        <button key={s} className={`chip ${value === s ? 'chip--active' : ''}`} onClick={() => onChange(s)}>{s ? s.replace(/_/g, ' ') : 'All'}</button>
      ))}
    </div>
  );
}

export function PanelHead({ title, children, sub }) {
  return (
    <div className="cc-panel-head">
      <div><h2>{title}</h2>{sub && <p className="muted small">{sub}</p>}</div>
      <div className="cc-panel-head__actions">{children}</div>
    </div>
  );
}

/** Re-run `reload` every `ms` while the tab is visible. */
export function usePolling(reload, ms = 15000) {
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), ms);
    return () => clearInterval(t);
  }, [reload, ms]);
}

export function LiveDot() { return <span className="live"><span className="live__dot" aria-hidden="true" /> Live</span>; }

export function ExportButton({ kind, label = 'Export CSV' }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/export/${kind}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json()).error || 'Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `hipcastle-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  return <button className="btn btn--ghost btn--sm" onClick={download} disabled={busy}>⬇ {busy ? 'Exporting…' : label}</button>;
}

// ---- Charts (single series: one hue, no legend; per-bar tooltip; table view) ----
const SERIES = '#2a78d6';

/** Daily revenue columns with hover tooltip and an accessible table view. */
export function RevenueChart({ data, title = 'Revenue collected, last 30 days' }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 180, padL = 52, padB = 24, padT = 12;
  const max = Math.max(1, ...data.map((d) => d.cents));
  const step = niceStep(max / 100);
  const top = Math.ceil(max / 100 / step) * step * 100 || 100;
  const slot = (W - padL) / data.length;
  const bw = Math.min(16, slot - 2);
  const y = (c) => H - padB - ((H - padB - padT) * c) / top;
  const ticks = [0, top / 2, top];
  const total = data.reduce((a, d) => a + d.cents, 0);
  return (
    <figure className="chart">
      <figcaption className="chart__title">{title} <strong>{money(total)}</strong></figcaption>
      <div className="chart__wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: total ${money(total)}`} className="chart__svg">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="chart__grid" />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart__tick">{compactRand(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * slot + (slot - bw) / 2;
            const h = Math.max(0, H - padB - y(d.cents));
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + i * slot} y={padT} width={slot} height={H - padB - padT} fill="transparent" />
                {h > 0 && <path d={roundedTop(x, H - padB - h, bw, h, 4)} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {i % 7 === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="chart__tick">{d.day.slice(5)}</text>}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="chart__tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }}>
            <strong>{money(data[hover].cents)}</strong><span>{new Date(data[hover].day).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
          </div>
        )}
      </div>
      <details className="chart__table"><summary>View as table</summary>
        <table className="table"><thead><tr><th>Date</th><th>Revenue</th></tr></thead>
          <tbody>{data.filter((d) => d.cents).map((d) => <tr key={d.day}><td>{d.day}</td><td>{money(d.cents)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/** Horizontal bars: label · bar · value. */
export function HBars({ items, format = (v) => v, label }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="bars" aria-label={label}>
      {items.map((it) => (
        <li key={it.label} title={`${it.label}: ${format(it.value)}${it.note ? ` · ${it.note}` : ''}`}>
          <span className="bars__label">{it.label}</span>
          <span className="bars__track"><span style={{ width: `${(it.value / max) * 100}%`, background: SERIES }} /></span>
          <span className="bars__value">{format(it.value)}{it.note && <small> · {it.note}</small>}</span>
        </li>
      ))}
    </ul>
  );
}

function roundedTop(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
function niceStep(v) {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p / 2;
}
function compactRand(cents) {
  const r = cents / 100;
  if (r >= 1e6) return `R${(r / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (r >= 1e3) return `R${Math.round(r / 1e3)}K`;
  return `R${Math.round(r)}`;
}
