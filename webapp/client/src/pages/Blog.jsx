import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import PostCard from '../components/PostCard.jsx';
import Seo, { breadcrumbSchema } from '../components/Seo.jsx';
import { useFetch } from '../useFetch.js';

export default function Blog() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const { data: all } = useFetch('/posts');
  const { data, error, loading } = useFetch(`/posts?category=${encodeURIComponent(category)}&q=${encodeURIComponent(debounced)}`);
  const categories = [...new Set(all?.map((p) => p.category) ?? [])];
  const [featured, ...rest] = data ?? [];
  const showFeatured = featured && !category && !debounced;

  return (
    <>
      <Seo title="Blog: Business Growth Guides for SA Entrepreneurs"
        description="Practical guides on websites, PayFast & Ozow payments, SEO, AI search, WhatsApp marketing and POPIA for South African entrepreneurs."
        schema={[breadcrumbSchema([{ name: 'Blog', path: '/blog' }])]} />
      <PageHeader eyebrow="Blog & guides" title="Grow smarter, Mzansi">
        <p>Free, practical guides for South African entrepreneurs — websites, payments, marketing, AI search and compliance, explained in plain language.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          <div className="toolbar">
            <input type="search" className="input" placeholder="Search articles…" aria-label="Search articles" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="filters filters--inline" role="group" aria-label="Categories">
              <button className={`chip ${!category ? 'chip--active' : ''}`} onClick={() => setParams({})}>All</button>
              {categories.map((c) => <button key={c} className={`chip ${category === c ? 'chip--active' : ''}`} onClick={() => setParams({ category: c })}>{c}</button>)}
            </div>
          </div>
          {loading && !data && <Loader />}
          <ErrorBox error={error} />
          {showFeatured && <div className="post-featured"><PostCard post={featured} /></div>}
          <div className="grid grid--3">{(showFeatured ? rest : data ?? []).map((p) => <PostCard key={p.slug} post={p} />)}</div>
          {data?.length === 0 && <p className="empty">No articles found.</p>}
          <p className="center mt-lg muted small"><a href="/blog/rss.xml">Subscribe via RSS</a></p>
        </div>
      </section>
    </>
  );
}
