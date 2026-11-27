// Design studio on an engagement page. Staff: brief → directions → AI/Figma/uploaded concepts →
// share → final files → quality gate → brand kit. Client: concept board (star + comment) and the
// brand kit downloads once released.
import { useEffect, useState } from 'react';
import { api, getToken } from '../api.js';
import { useFetch } from '../useFetch.js';
import { ErrorBox, Field } from './ui.jsx';

const fileUrl = (orderId, id, download) => `/api/design/${orderId}/assets/${id}/file${download ? '?download=1' : ''}`;
const authFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${getToken()}` } });

/** Images need the login token, so they're fetched and shown from a local blob. */
function AuthImage({ src, alt, className }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u; let live = true;
    authFetch(src).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b && live) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [src]);
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <div className={`${className || ''} design-thumb--loading`} aria-label={alt} />;
}

async function download(orderId, a, brand, format = 'svg', size = 1024) {
  const res = await authFetch(fileUrl(orderId, a.id, true));
  const blob = await res.blob();
  const name = `${brand}-${a.title}`.replace(/[^\w.-]+/g, '-').toLowerCase();
  const save = (b, ext) => { const u = URL.createObjectURL(b); const l = Object.assign(document.createElement('a'), { href: u, download: `${name}.${ext}` }); l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
  if (format === 'svg' || a.mime !== 'image/svg+xml') return save(blob, a.mime === 'image/svg+xml' ? 'svg' : a.mime.split('/')[1].replace('jpeg', 'jpg'));
  // PNG at the chosen width, rendered in the browser from the vector file (transparent background).
  const img = new Image();
  const u = URL.createObjectURL(blob);
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = u; });
  const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
  const c = Object.assign(document.createElement('canvas'), { width: size, height: Math.round(size * ratio) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(u);
  c.toBlob((b) => save(b, `${size}px.png`), 'image/png');
}

const Swatches = ({ colors }) => <span className="swatches">{colors.map((c) => <span key={c} className="swatch" style={{ background: c }} title={c} />)}</span>;
const VARIANT = { primary: 'Primary logo', mono_dark: 'One colour — black', mono_light: 'One colour — white', icon: 'Icon / symbol', other: 'Other' };

function BrandKit({ orderId, kit, brand }) {
  if (!kit?.logos?.length) return null;
  const fontsHref = kit.fonts && `https://fonts.google.com/?query=${encodeURIComponent(kit.fonts.heading)}`;
  return (
    <div className="brand-kit">
      <h3>Brand kit</h3>
      <div className="design-grid">
        {kit.logos.map((a) => (
          <figure key={a.id} className={`design-card ${a.variant === 'mono_light' ? 'design-card--dark' : ''}`}>
            <AuthImage src={fileUrl(orderId, a.id)} alt={a.title} className="design-thumb" />
            <figcaption><strong>{VARIANT[a.variant] || a.title}</strong>
              <span className="design-dl">
                <button className="btn--link" onClick={() => download(orderId, a, brand, 'svg')}>{a.mime === 'image/svg+xml' ? 'SVG' : 'Download'}</button>
                {a.mime === 'image/svg+xml' && [512, 1024, 2048].map((s) => <button key={s} className="btn--link" onClick={() => download(orderId, a, brand, 'png', s)}>PNG {s}</button>)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {kit.palette.length > 0 && (
        <div className="table-wrap"><table className="table palette-table">
          <thead><tr><th>Colour</th><th>HEX</th><th>RGB</th><th>CMYK (approx.)</th></tr></thead>
          <tbody>{kit.palette.map((c) => (
            <tr key={c.hex}><td><span className="swatch swatch--lg" style={{ background: c.hex, color: c.text_on }}>Aa</span></td><td><code>{c.hex}</code></td><td>{c.rgb.join(', ')}</td><td>{c.cmyk.join(' / ')}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {kit.fonts && <p><strong>Fonts:</strong> {kit.fonts.heading} (headings) and {kit.fonts.body} (text) — free Google Fonts, fine for commercial use. <a href={fontsHref} target="_blank" rel="noreferrer">Get the fonts</a></p>}
      <ul className="small">{kit.usage.map((u) => <li key={u}>{u}</li>)}</ul>
      <p className="muted small">Tip: in Canva, add these files and colours to your Brand Kit so your team’s social posts stay on brand. Send printers the SVG and the CMYK values, and ask for a proof.</p>
    </div>
  );
}

function ClientBoard({ d, orderId, reload }) {
  const [err, setErr] = useState(null);
  const [comments, setComments] = useState({});
  const pick = async (a, pickIt) => {
    setErr(null);
    try { await api(`/design/${orderId}/assets/${a.id}/pick`, { method: 'POST', body: { pick: pickIt, comment: comments[a.id] ?? a.client_comment ?? '' } }); reload(); } catch (e) { setErr(e); }
  };
  if (!d.concepts.length && !d.kit) return null;
  return (
    <section className="card design-studio" id="design" aria-labelledby="design-h">
      <h2 id="design-h">🎨 Your designs</h2>
      {d.concepts.length > 0 && !d.kit && <p>Star the concepts you like and tell us what to change. When you’re ready, approve the <strong>Design concepts</strong> step in your delivery plan below.</p>}
      <ErrorBox error={err} />
      {!d.kit && (
        <div className="design-grid">
          {d.concepts.map((a) => (
            <figure key={a.id} className={`design-card ${a.client_pick ? 'design-card--picked' : ''}`}>
              <AuthImage src={fileUrl(orderId, a.id)} alt={a.title} className="design-thumb" />
              <figcaption>
                <strong>{a.title}</strong>
                <textarea className="input input--sm" rows={2} maxLength={1000} placeholder="What do you like, or what should change?" defaultValue={a.client_comment || ''} onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })} />
                <div className="form__actions">
                  <button className={`btn btn--sm ${a.client_pick ? 'btn--primary' : 'btn--ghost'}`} aria-pressed={Boolean(a.client_pick)} onClick={() => pick(a, !a.client_pick)}>{a.client_pick ? '★ Favourite' : '☆ Favourite'}</button>
                  {comments[a.id] !== undefined && <button className="btn btn--ghost btn--sm" onClick={() => pick(a, Boolean(a.client_pick))}>Save comment</button>}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <BrandKit orderId={orderId} kit={d.kit} brand={d.brief.business_name} />
      {d.figma_url && <p className="small"><a href={d.figma_url} target="_blank" rel="noreferrer">View the design file in Figma</a></p>}
    </section>
  );
}

function StaffStudio({ d, orderId, reload, setData }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [brief, setBrief] = useState(d.brief);
  const [selected, setSelected] = useState([]);
  const [shareNote, setShareNote] = useState('');
  const [figmaUrl, setFigmaUrl] = useState(d.figma_url || '');
  const [frames, setFrames] = useState([]);
  const [checks, setChecks] = useState({ designer_refined: false, trademark_checked: false, trademark_note: '', ...d.checks });
  const run = async (label, fn) => {
    setBusy(label); setErr(null); setInfo(null);
    try { const out = await fn(); if (out?.order_id) setData(out); if (out?.warning) setInfo(out.warning); } catch (e) { setErr(e); } finally { setBusy(''); }
  };
  const call = (path, method = 'POST', body) => api(`/design/${orderId}${path}`, { method, body });
  const upload = (kind) => async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    await run('upload', async () => {
      const q = new URLSearchParams({ title: f.name.replace(/\.[^.]+$/, '').slice(0, 100), kind, ...(kind === 'final' && { variant: 'primary' }) });
      const res = await authFetch(`/api/design/${orderId}/assets?${q}`, { method: 'POST', headers: { 'Content-Type': f.type || 'image/svg+xml' }, body: f });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    });
  };
  const B = (label, text, fn, cls = 'btn--ghost') => <button type="button" className={`btn btn--sm ${cls}`} disabled={Boolean(busy)} onClick={() => run(label, fn)}>{busy === label ? 'Working…' : text}</button>;
  const primary = d.finals.find((f) => f.variant === 'primary');

  return (
    <section className="card design-studio" id="design" aria-labelledby="design-h">
      <h2 id="design-h">🎨 Design studio</h2>
      <ErrorBox error={err} />
      {info && <p className="alert alert--info small">{info}</p>}

      <details open={!d.directions.length}>
        <summary><strong>1. Creative brief</strong> <span className="muted small">— from the client’s onboarding answers</span></summary>
        <div className="form design-brief">
          {[['business_name', 'Business name'], ['industry', 'Industry'], ['scope', 'What they need'], ['personality', 'Personality']].map(([k, l]) => (
            <Field key={k} label={l}><input className="input" value={brief[k] || ''} onChange={(e) => setBrief({ ...brief, [k]: e.target.value })} /></Field>
          ))}
          {[['audience', 'Audience'], ['likes', 'Likes & dislikes'], ['notes', 'Notes']].map(([k, l]) => (
            <Field key={k} label={l}><textarea className="input" rows={2} value={brief[k] || ''} onChange={(e) => setBrief({ ...brief, [k]: e.target.value })} /></Field>
          ))}
          <div className="form__actions">{B('brief', 'Save brief', () => call('/brief', 'PUT', { brief }), 'btn--primary')}{B('reset', 'Reset from onboarding', async () => { const o = await call('/brief/reset'); setBrief(o.brief); return o; })}</div>
        </div>
      </details>

      <h3>2. Concept directions {d.directions_by && <small className="muted">({d.directions_by === 'ai' ? 'suggested by AI' : d.directions_by === 'rules' ? 'starter set' : 'edited'})</small>}</h3>
      <div className="form__actions">{B('directions', d.directions.length ? 'Suggest new directions' : 'Suggest directions', () => call('/directions'), d.directions.length ? 'btn--ghost' : 'btn--primary')}
        <span className="muted small">{d.ai.recraft ? `AI concepts: ${d.ai.used}/${d.ai.limit} used on this engagement (Recraft, about $0.08 each).` : 'Add RECRAFT_API_TOKEN to generate AI concepts. You can still upload designs or import from Figma.'}</span></div>
      <div className="design-directions">
        {d.directions.map((x, i) => (
          <article key={i} className="design-direction">
            <h4>{x.name} <Swatches colors={x.palette} /></h4>
            <p className="small">{x.idea}</p>
            <p className="small muted">Fonts: {x.fonts.heading} / {x.fonts.body}</p>
            <details><summary className="small">Image prompt</summary><p className="small">{x.prompt}</p></details>
            {d.ai.recraft && B(`gen${i}`, 'Generate 4 concepts', () => call('/generate', 'POST', { direction: i, n: 4 }), 'btn--primary')}
          </article>
        ))}
      </div>

      <h3>3. Concepts</h3>
      <div className="form__actions design-sources">
        <label className="btn btn--ghost btn--sm">Upload design (SVG/PNG)<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" hidden onChange={upload('concept')} /></label>
        <input className="input input--sm" placeholder="Figma link (figma.com/design/…)" value={figmaUrl} onChange={(e) => setFigmaUrl(e.target.value)} />
        {B('figma', 'Link Figma file', () => call('/figma', 'POST', { url: figmaUrl }))}
      </div>
      {d.figma_meta && (
        <div className="design-figma small">
          <p>Figma: <a href={d.figma_url} target="_blank" rel="noreferrer">{d.figma_meta.name}</a> · updated {d.figma_meta.last_modified?.slice(0, 10)}</p>
          <div className="design-frames">{d.figma_meta.frames.slice(0, 40).map((f) => (
            <label key={f.id} className="check"><input type="checkbox" checked={frames.includes(f.id)} onChange={(e) => setFrames(e.target.checked ? [...frames, f.id] : frames.filter((x) => x !== f.id))} /> {f.page} / {f.name}</label>
          ))}</div>
          {frames.length > 0 && B('fimport', `Import ${frames.length} frame(s)`, async () => { const o = await call('/figma/import', 'POST', { ids: frames.slice(0, 12) }); setFrames([]); return o; })}
        </div>
      )}
      {d.figma_url && !d.figma_meta && !d.figma.configured && <p className="muted small">Linked. Add FIGMA_TOKEN to list and import frames.</p>}

      <div className="design-grid">
        {d.concepts.map((a) => (
          <figure key={a.id} className={`design-card ${a.client_pick ? 'design-card--picked' : ''}`}>
            <label className="design-select"><input type="checkbox" checked={selected.includes(a.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, a.id] : selected.filter((x) => x !== a.id))} /><span className="sr-only">Select {a.title}</span></label>
            <AuthImage src={fileUrl(orderId, a.id)} alt={a.title} className="design-thumb" />
            <figcaption>
              <strong>{a.title}</strong>
              <small className="muted">{a.source}{a.shared ? ' · shared' : ''}{a.client_pick ? ' · ★ client favourite' : ''}</small>
              {a.client_comment && <q className="small">{a.client_comment}</q>}
              <span className="design-dl">
                <button className="btn--link" disabled={Boolean(busy)} onClick={() => run('final', () => call(`/assets/${a.id}`, 'PATCH', { kind: 'final', variant: 'primary', title: 'Primary logo' }))}>Use as final</button>
                <button className="btn--link" onClick={() => download(orderId, a, d.brief.business_name)}>Download</button>
                <button className="btn--link text-error" disabled={Boolean(busy)} onClick={() => window.confirm(`Delete “${a.title}”?`) && run('del', () => call(`/assets/${a.id}`, 'DELETE'))}>Delete</button>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="design-share">
          <Field label={`Share ${selected.length} concept(s) with the client`} hint="Sends the “Design concepts” step for approval and emails the client.">
            <textarea className="input" rows={2} value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="Optional note to the client" />
          </Field>
          {B('share', 'Share with client', async () => { const o = await call('/share', 'POST', { asset_ids: selected, note: shareNote }); setSelected([]); return o; }, 'btn--primary')}
        </div>
      )}

      <h3>4. Final files</h3>
      <p className="muted small">Refine the chosen concept (in Figma or Illustrator), then upload the final SVG as the primary logo or mark a concept as final. Check the automatic one-colour versions: logos with overlapping shapes become a solid silhouette and need a hand-made version (upload it and set its type).</p>
      <div className="form__actions">
        <label className="btn btn--ghost btn--sm">Upload final logo (SVG)<input type="file" accept="image/svg+xml,image/png" hidden onChange={upload('final')} /></label>
        {primary?.mime === 'image/svg+xml' && B('variants', 'Make one-colour versions', () => call(`/assets/${primary.id}/variants`))}
      </div>
      {d.finals.length > 0 && (
        <ul className="design-finals">{d.finals.map((f) => (
          <li key={f.id}>
            <select className="input input--sm" value={f.variant || 'other'} onChange={(e) => run('variant', () => call(`/assets/${f.id}`, 'PATCH', { variant: e.target.value }))}>
              {Object.entries(VARIANT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span>{f.title}</span>
            <button className="btn--link text-error" onClick={() => window.confirm(`Delete “${f.title}”?`) && run('del', () => call(`/assets/${f.id}`, 'DELETE'))}>Delete</button>
          </li>
        ))}</ul>
      )}

      <h3>5. Quality gate & release</h3>
      <div className="form">
        <label className="check"><input type="checkbox" checked={checks.designer_refined} onChange={(e) => setChecks({ ...checks, designer_refined: e.target.checked })} /> A designer refined the final logo (spacing, curves, small-size legibility). AI concepts are never delivered as-is.</label>
        <label className="check"><input type="checkbox" checked={checks.trademark_checked} onChange={(e) => setChecks({ ...checks, trademark_checked: e.target.checked })} /> CIPC trade mark search done for the name and mark, with no conflicts in the client’s classes.</label>
        <Field label="Search notes"><input className="input" value={checks.trademark_note} onChange={(e) => setChecks({ ...checks, trademark_note: e.target.value })} placeholder="e.g. Searched 21 Nov, class 43: no conflicts" /></Field>
        <div className="form__actions">
          {B('checks', 'Save checks', () => call('/checks', 'PUT', checks))}
          {B('release', d.kit_released_at ? 'Re-release brand kit' : 'Release brand kit to client', () => call('/release'), 'btn--primary')}
          {d.kit_released_at && <span className="muted small">Released {d.kit_released_at}</span>}
        </div>
      </div>
      <BrandKit orderId={orderId} kit={d.kit} brand={d.brief.business_name} />
    </section>
  );
}

export default function DesignStudio({ order, isStaff }) {
  const { data, error, loading, reload, setData } = useFetch(`/design/${order.id}`);
  if (loading && !data) return null;
  if (error) return <ErrorBox error={error} />;
  return isStaff ? <StaffStudio d={data} orderId={order.id} reload={reload} setData={setData} /> : <ClientBoard d={data} orderId={order.id} reload={reload} />;
}
