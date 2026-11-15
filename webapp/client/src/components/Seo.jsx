// Client-side head manager. The server already renders these tags for the first page view
// (for crawlers); this keeps them correct as users navigate inside the single-page app.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSite } from '../context/SiteContext.jsx';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); el.setAttribute('data-seo', ''); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

export default function Seo({ title, description, schema = [], noindex = false, type = 'website' }) {
  const { pathname } = useLocation();
  const site = useSite();
  useEffect(() => {
    const branded = title && `${title} | ${site.business_name}`;
    const full = !title ? `${site.business_name} | Digital Agency for SA Entrepreneurs` : title.includes(site.business_name) || branded.length > 60 ? title : branded;
    const desc = description || site.seo_default_description || '';
    const url = `${window.location.origin}${pathname}`;
    document.title = full;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', type);
    setMeta('name', 'twitter:title', full);
    setMeta('name', 'twitter:description', desc);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.setAttribute('data-seo', ''); document.head.appendChild(canonical); }
    canonical.href = url;
    // Replace page-level JSON-LD (the server renders the initial set).
    document.head.querySelectorAll('script[type="application/ld+json"][data-seo]').forEach((n) => n.remove());
    for (const s of schema.filter(Boolean)) {
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-seo', '');
      el.textContent = JSON.stringify(s);
      document.head.appendChild(el);
    }
  }, [title, description, noindex, type, pathname, site.business_name, site.seo_default_description, JSON.stringify(schema)]);
  return null;
}

export const faqSchema = (faqs) => faqs?.length ? ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}) : null;

export const breadcrumbSchema = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [{ name: 'Home', path: '/' }, ...items].map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${window.location.origin}${it.path}` })),
});
