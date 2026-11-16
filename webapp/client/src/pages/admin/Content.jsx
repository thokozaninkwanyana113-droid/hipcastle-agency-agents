import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Markdown from '../../components/Markdown.jsx';
import { ErrorBox, Field, Loader, Status } from '../../components/ui.jsx';
import { Stars } from '../../components/Testimonials.jsx';
import { date } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { ExportButton, PanelHead, StatusFilter } from './shared.jsx';

// ------------------------------------------------------------------ Blog
export function BlogAdmin() {
  return (
    <Routes>
      <Route index element={<PostList />} />
      <Route path="new" element={<PostEditor />} />
      <Route path=":id" element={<PostEditor />} />
    </Routes>
  );
}

function PostList() {
  const { data, error, loading } = useFetch('/admin/posts');
  return (
    <>
      <PanelHead title="Blog" sub="Articles drive SEO and AI-search visibility. Aim for at least two new guides a month.">
        <Link to="/admin/blog/new" className="btn btn--primary btn--sm">+ New article</Link>
      </PanelHead>
      {loading && <Loader />}
      <ErrorBox error={error} />
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Published</th><th>Views</th><th /></tr></thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/admin/blog/${p.id}`}>{p.title}</Link><small>/blog/{p.slug}</small></td>
                <td>{p.category}</td>
                <td><Status value={p.status === 'published' ? 'completed' : 'pending'} /> <small>{p.status}</small></td>
                <td>{date(p.published_at)}</td>
                <td>{p.views}</td>
                <td>{p.status === 'published' && <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer">View ↗</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 90);
const EMPTY = { title: '', slug: '', excerpt: '', body: '## Quick answer\n\n', category: 'Insights', tags: [], cover_emoji: '📝', author: 'Hipcastle Team', meta_title: '', meta_description: '', status: 'draft' };

function PostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [p, setP] = useState(id ? null : EMPTY);
  const [tags, setTags] = useState('');
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (id) api(`/admin/posts/${id}`).then((x) => { setP({ ...EMPTY, ...x, meta_title: x.meta_title || '', meta_description: x.meta_description || '' }); setTags(x.tags.join(', ')); });
  }, [id]);
  if (!p) return <Loader />;
  const set = (k) => (e) => {
    const v = e.target.value;
    setP((cur) => ({ ...cur, [k]: v, ...(k === 'title' && !slugTouched ? { slug: slugify(v) } : {}) }));
  };
  const save = async (status) => {
    setErrors({}); setMsg('');
    const body = { ...p, status, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
    for (const k of ['id', 'views', 'updated_at', 'reading_minutes']) delete body[k];
    if (!body.published_at) delete body.published_at;
    try {
      const out = await api(id ? `/admin/posts/${id}` : '/admin/posts', { method: id ? 'PUT' : 'POST', body });
      setMsg(status === 'published' ? 'Published ✓' : 'Draft saved ✓');
      if (!id) navigate(`/admin/blog/${out.id}`, { replace: true });
      else setP({ ...p, ...out });
    } catch (e) { setErrors({ ...e.fields, _: e.message }); }
  };
  const remove = async () => {
    if (!window.confirm('Delete this article permanently?')) return;
    await api(`/admin/posts/${id}`, { method: 'DELETE' });
    navigate('/admin/blog');
  };
  const words = p.body.split(/\s+/).filter(Boolean).length;
  const metaDesc = p.meta_description || p.excerpt;
  const checks = [
    [p.title.length >= 20 && p.title.length <= 65, `Title length ${p.title.length} (20–65)`],
    [metaDesc.length >= 70 && metaDesc.length <= 160, `Meta description ${metaDesc.length} chars (70–160)`],
    [/^## Quick answer/m.test(p.body), 'Starts with a “Quick answer” (answer engines quote these)'],
    [(p.body.match(/^## /gm) || []).length >= 3, 'At least 3 H2 sections'],
    [/\]\(\/(services|contact|pricing)/.test(p.body), 'Links to a service, pricing or contact page'],
    [words >= 300, `${words} words (aim 300+)`],
  ];

  return (
    <>
      <PanelHead title={id ? 'Edit article' : 'New article'}>
        <Link to="/admin/blog" className="btn btn--text btn--sm">← All articles</Link>
      </PanelHead>
      {errors._ && <div className="alert alert--error">{errors._}</div>}
      {msg && <div className="alert alert--success">{msg}</div>}
      <div className="layout-sidebar">
        <div className="card form">
          <Field label="Title *" error={errors.title}><input className="input" value={p.title} onChange={set('title')} /></Field>
          <Field label="URL slug *" error={errors.slug} hint={`/blog/${p.slug}`}><input className="input" value={p.slug} onChange={(e) => { setSlugTouched(true); set('slug')(e); }} /></Field>
          <Field label="Excerpt *" error={errors.excerpt} hint="1–2 sentences shown on cards and in search results"><textarea className="input" rows={2} value={p.excerpt} onChange={set('excerpt')} /></Field>
          <div className="editor-tabs">
            <button className={`chip ${!preview ? 'chip--active' : ''}`} onClick={() => setPreview(false)}>Write</button>
            <button className={`chip ${preview ? 'chip--active' : ''}`} onClick={() => setPreview(true)}>Preview</button>
            <small className="muted">Markdown: ## heading, **bold**, - list, [link](/services/marketing)</small>
          </div>
          {preview ? <div className="card markdown-preview"><Markdown source={p.body} /></div> : (
            <Field label="Body *" error={errors.body}><textarea className="input input--mono" rows={22} value={p.body} onChange={set('body')} /></Field>
          )}
        </div>
        <aside className="sidebar sidebar--static">
          <div className="card form">
            <div className="stack">
              <button className="btn btn--primary btn--block" onClick={() => save('published')}>{p.status === 'published' ? 'Update' : 'Publish'}</button>
              <button className="btn btn--outline btn--block" onClick={() => save('draft')}>{p.status === 'published' ? 'Unpublish (draft)' : 'Save draft'}</button>
              {id && user.role === 'admin' && <button className="btn btn--text btn--block" onClick={remove}>Delete</button>}
            </div>
            <Field label="Category" error={errors.category}><input className="input" value={p.category} onChange={set('category')} list="cats" /></Field>
            <datalist id="cats">{['Web Development', 'Payments', 'SEO', 'Marketing', 'Compliance', 'Guides', 'Insights'].map((c) => <option key={c} value={c} />)}</datalist>
            <Field label="Tags" hint="Comma separated"><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
            <div className="form__row">
              <Field label="Emoji"><input className="input" value={p.cover_emoji} onChange={set('cover_emoji')} /></Field>
              <Field label="Author"><input className="input" value={p.author} onChange={set('author')} /></Field>
            </div>
            <Field label="SEO title" hint="Optional, ≤ 65 chars" error={errors.meta_title}><input className="input" value={p.meta_title} onChange={set('meta_title')} /></Field>
            <Field label="Meta description" hint="Optional, 120–160 chars" error={errors.meta_description}><textarea className="input" rows={3} value={p.meta_description} onChange={set('meta_description')} /></Field>
            <div className="serp" aria-label="Google preview">
              <small>www.hipcastle.agency › blog › {p.slug}</small>
              <strong>{(p.meta_title || p.title || 'Article title').slice(0, 65)}</strong>
              <span>{metaDesc.slice(0, 160) || 'Meta description…'}</span>
            </div>
            <h3>SEO / AEO checklist</h3>
            <ul className="checks">{checks.map(([ok, label]) => <li key={label} className={ok ? 'checks__ok' : 'checks__warn'}>{ok ? '✅' : '⚠️'} {label}</li>)}</ul>
          </div>
        </aside>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Testimonials
export function TestimonialsAdmin() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useFetch(`/admin/testimonials?status=${status}`);
  const update = async (t, body) => { await api(`/admin/testimonials/${t.id}`, { method: 'PATCH', body }); reload(); };
  const remove = async (t) => { if (window.confirm('Delete this review?')) { await api(`/admin/testimonials/${t.id}`, { method: 'DELETE' }); reload(); } };
  return (
    <>
      <PanelHead title="Testimonials" sub="Approve genuine client reviews before they appear on the site. Featured reviews show on the home and About pages." />
      <StatusFilter value={status} onChange={setStatus} options={['pending', 'approved', 'rejected']} />
      {loading && !data && <Loader />}
      <ErrorBox error={error} />
      <div className="review-list">
        {data?.map((t) => (
          <div key={t.id} className={`card review review--${t.status}`}>
            <div className="review__head">
              <div><Stars rating={t.rating} /> <strong>{t.author}</strong> <span className="muted">{[t.role, t.company, t.location].filter(Boolean).join(' · ')}</span></div>
              <span className={`status status--${t.status === 'approved' ? 'completed' : t.status === 'pending' ? 'pending' : 'cancelled'}`}>{t.status}</span>
            </div>
            <p>“{t.quote}”</p>
            <small className="muted">{t.service_name && `${t.service_name} · `}{t.email && `${t.email} · `}{date(t.created_at)}</small>
            <div className="review__actions">
              {t.status !== 'approved' && <button className="btn btn--primary btn--sm" onClick={() => update(t, { status: 'approved' })}>Approve</button>}
              {t.status !== 'rejected' && <button className="btn btn--outline btn--sm" onClick={() => update(t, { status: 'rejected' })}>Reject</button>}
              {t.status === 'approved' && <button className="btn btn--ghost btn--sm" onClick={() => update(t, { is_featured: !t.is_featured })}>{t.is_featured ? '★ Featured' : '☆ Feature'}</button>}
              {user.role === 'admin' && <button className="btn btn--text btn--sm" onClick={() => remove(t)}>Delete</button>}
            </div>
          </div>
        ))}
        {data?.length === 0 && <p className="empty">No reviews here.</p>}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Subscribers
export function Subscribers() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch('/admin/subscribers');
  const remove = async (s) => { if (window.confirm(`Remove ${s.email}?`)) { await api(`/admin/subscribers/${s.id}`, { method: 'DELETE' }); reload(); } };
  return (
    <>
      <PanelHead title="Newsletter subscribers" sub="Double opt-in: only confirmed subscribers are exported or emailed. Remove anyone who asks to unsubscribe (POPIA).">
        {user.role === 'admin' && <ExportButton kind="subscribers" />}
      </PanelHead>
      {loading && <Loader />}
      <ErrorBox error={error} />
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Email</th><th>Status</th><th>Signed up</th><th /></tr></thead>
          <tbody>{data?.map((s) => <tr key={s.id}><td>{s.email}</td><td>{s.status === 'active' ? <span className="health health--ok">Confirmed</span> : <span className="health health--muted">Awaiting confirmation</span>}</td><td>{date(s.created_at)}</td><td><button className="btn btn--text btn--sm" onClick={() => remove(s)}>Remove</button></td></tr>)}</tbody>
        </table>
        {data?.length === 0 && <p className="empty">No subscribers yet.</p>}
      </div>
    </>
  );
}
