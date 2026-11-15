import { siteUrl } from '../siteUrl.js';
import { Link, useParams } from 'react-router-dom';
import Markdown from '../components/Markdown.jsx';
import PostCard from '../components/PostCard.jsx';
import Seo, { breadcrumbSchema } from '../components/Seo.jsx';
import { ErrorBox, Loader } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useFetch } from '../useFetch.js';
import { useSite } from '../context/SiteContext.jsx';
import { date } from '../format.js';
import NotFound from './NotFound.jsx';

export default function BlogPost() {
  const { slug } = useParams();
  const site = useSite();
  const { data: p, error, loading } = useFetch(`/posts/${slug}`);
  if (loading) return <Loader />;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;

  const url = siteUrl(`/blog/${p.slug}`);
  const share = [
    ['whatsapp', 'WhatsApp', `https://wa.me/?text=${encodeURIComponent(`${p.title} ${url}`)}`],
    ['linkedin', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
    ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
    ['x', 'X', `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(p.title)}`],
  ];
  const article = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.meta_description || p.excerpt,
    datePublished: p.published_at, dateModified: p.updated_at, inLanguage: 'en-ZA', articleSection: p.category, keywords: p.tags.join(', '),
    author: { '@type': 'Organization', name: p.author }, publisher: { '@id': siteUrl('/#organization') }, mainEntityOfPage: url,
    image: siteUrl('/og-image.png'),
  };

  return (
    <>
      <Seo title={p.meta_title || p.title} description={p.meta_description || p.excerpt} type="article"
        schema={[article, breadcrumbSchema([{ name: 'Blog', path: '/blog' }, { name: p.title, path: `/blog/${p.slug}` }])]} />
      <article>
        <header className="page-header page-header--article">
          <div className="container container--narrow">
            <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/blog">Blog</Link> / <Link to={`/blog?category=${encodeURIComponent(p.category)}`}>{p.category}</Link></nav>
            <span className="page-header__icon" aria-hidden="true">{p.cover_emoji}</span>
            <h1>{p.title}</h1>
            <p className="page-header__lead">{p.excerpt}</p>
            <p className="article-meta">By {p.author} · <time dateTime={p.published_at}>{date(p.published_at)}</time>
              {p.updated_at && p.updated_at.slice(0, 10) !== p.published_at?.slice(0, 10) && <> · Updated <time dateTime={p.updated_at}>{date(p.updated_at)}</time></>} · {p.reading_minutes} min read</p>
          </div>
        </header>
        <div className="section">
          <div className="container container--narrow">
            <div className="card article-body"><Markdown source={p.body} /></div>
            <div className="share">
              <span>Share this guide:</span>
              {share.map(([icon, label, href]) => (
                <a key={icon} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${label}`}><Icon name={icon} size={18} /></a>
              ))}
            </div>
            {p.tags.length > 0 && <ul className="tags">{p.tags.map((t) => <li key={t} className="tag">#{t}</li>)}</ul>}
            <aside className="callout mt-lg">
              <div><h2 className="h3">Want {site.business_name} to do this for you?</h2><p>Book a free 30-minute strategy session — fixed rand pricing, no obligation.</p></div>
              <Link to="/contact" className="btn btn--primary">Book my free session</Link>
            </aside>
          </div>
        </div>
      </article>
      {p.related?.length > 0 && (
        <section className="section section--alt" aria-labelledby="related">
          <div className="container">
            <h2 id="related">Keep reading</h2>
            <div className="grid grid--3 mt">{p.related.map((r) => <PostCard key={r.slug} post={r} />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
