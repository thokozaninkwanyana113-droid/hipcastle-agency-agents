// Help Centre: every article the assistant knows, browsable and searchable.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Seo, { breadcrumbSchema } from '../components/Seo.jsx';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import { ChatText, openChat } from '../components/ChatWidget.jsx';
import { useFetch } from '../useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';

const norm = (s) => s.toLowerCase().normalize('NFKD');

export default function Help() {
  const { data, error, loading } = useFetch('/help');
  const { user } = useAuth();
  const { hash } = useLocation();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const words = norm(q).split(/\s+/).filter((w) => w.length > 1);
    return data.categories
      .filter((c) => !cat || c.key === cat)
      .map((c) => ({ ...c, items: c.items.filter((i) => words.every((w) => norm(`${i.title} ${i.body}`).includes(w))) }))
      .filter((c) => c.items.length);
  }, [data, q, cat]);
  const total = filtered.reduce((a, c) => a + c.items.length, 0);

  useEffect(() => {
    if (!data || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) { el.open = true; el.scrollIntoView({ block: 'center' }); }
  }, [data, hash]);

  const faqs = data?.categories.flatMap((c) => c.items).slice(0, 40) || [];

  return (
    <>
      <Seo title="Help Centre — services, prices, payments & support"
        description="Answers about Hipcastle's services, packages and rand prices, PayFast and Ozow payments, delivery, the client portal, support and POPIA."
        schema={[breadcrumbSchema([{ name: 'Help Centre', path: '/help' }]),
          faqs.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.title, acceptedAnswer: { '@type': 'Answer', text: f.body } })) } : null]} />
      <PageHeader eyebrow="Help Centre" title="How can we help?">
        <p>Everything about our services, packages, payments, delivery and support — the same knowledge our assistant uses.</p>
        <div className="help-search">
          <label htmlFor="help-q" className="sr-only">Search the help centre</label>
          <input id="help-q" type="search" placeholder="Search e.g. “EFT”, “refund”, “SEO price”" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </PageHeader>
      <section className="section">
        <div className="container help">
          {loading && <Loader />}
          <ErrorBox error={error} />
          {data && (
            <>
              <div className="help__cats" role="group" aria-label="Filter by topic">
                <button className={!cat ? 'is-active' : ''} onClick={() => setCat('')} aria-pressed={!cat}>All topics</button>
                {data.categories.map((c) => (
                  <button key={c.key} className={cat === c.key ? 'is-active' : ''} onClick={() => setCat(c.key)} aria-pressed={cat === c.key}>{c.label} <small>{c.items.length}</small></button>
                ))}
              </div>
              <p className="help__count" aria-live="polite">{total} article{total === 1 ? '' : 's'}{q && ` matching “${q}”`}</p>
              {filtered.map((c) => (
                <div key={c.key} className="help__group">
                  <h2>{c.label}</h2>
                  <div className="faq">
                    {c.items.map((i) => (
                      <details key={i.id} id={i.id}>
                        <summary><h3>{i.title}</h3></summary>
                        <div className="help__body"><ChatText text={i.body} /></div>
                        {i.link && <p><Link to={i.link} className="btn btn--outline btn--sm">Open {i.link}</Link></p>}
                      </details>
                    ))}
                  </div>
                </div>
              ))}
              {total === 0 && (
                <div className="card empty-state">
                  <span>🔎</span><h2>No articles match</h2>
                  <p>Ask our assistant instead — or a person.</p>
                  <button className="btn btn--primary" onClick={() => openChat(q)}>Ask “{q}”</button>
                </div>
              )}
              <div className="help__cta card">
                <div>
                  <h2>Still need help?</h2>
                  <p>{user ? 'Open a support ticket and a team member will respond within our published response times.' : 'Ask the assistant, or talk to our team.'}</p>
                </div>
                <div className="help__cta-actions">
                  <button className="btn btn--outline" onClick={() => openChat()}>💬 Ask the assistant</button>
                  {user ? <Link to="/portal/support" className="btn btn--primary">Open a support ticket</Link> : <Link to="/contact" className="btn btn--primary">Contact us</Link>}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
