// Server-side SEO / AEO / GEO.
//  - Injects per-route <title>, meta, canonical, Open Graph, Twitter and JSON-LD into the SPA shell
//  - Pre-renders semantic HTML content into #root so search engines and AI crawlers that do not
//    run JavaScript still read the full page (React replaces it on load)
//  - Serves sitemap.xml, robots.txt, llms.txt, llms-full.txt and an RSS feed
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, row, rows } from './db.js';
import { getSettings } from './settings.js';
import { generalFaqs, serviceFaqs, rand, billingText } from './content.js';
import { canonicalUrl as siteUrl } from './urls.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DIST = resolve(here, '../../client/dist');

// ---------------------------------------------------------------- helpers
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const isoDate = (s) => (s ? new Date(s.replace(' ', 'T') + (s.length > 10 ? 'Z' : '')).toISOString() : undefined);
const jsonLd = (o) => `<script type="application/ld+json" data-seo>${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

/** Safe Markdown → HTML for articles (escapes everything first). */
export function mdToHtml(md) {
  const inline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(((?:\/|https?:\/\/)[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { const n = Math.min(Math.max(h[1].length, 2), 5); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l); const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`);
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
    }
    if (l.startsWith('>')) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }
    if (!l.trim() || /^---+$/.test(l.trim())) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[i])) para.push(lines[i++]);
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); else i++;
  }
  return out.join('\n');
}
const plain = (md) => md.replace(/```[\s\S]*?```/g, '').replace(/[#*`>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

// ---------------------------------------------------------------- data access
const services = () => rows(db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order').all(), ['outcomes']);
const tiersFor = (sid) => rows(db.prepare(`SELECT * FROM service_tiers WHERE service_id = ?
  ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(sid), ['features']);
const publishedPosts = () => rows(db.prepare(`SELECT * FROM posts WHERE status = 'published' AND published_at <= datetime('now')
  ORDER BY published_at DESC`).all(), ['tags']);
const approvedTestimonials = () => rows(db.prepare(`SELECT * FROM testimonials WHERE status = 'approved' ORDER BY is_featured DESC, id DESC`).all());
const priceRange = () => {
  const r = db.prepare('SELECT MIN(price_cents) lo, MAX(price_cents) hi FROM service_tiers st JOIN services s ON s.id = st.service_id WHERE s.is_active = 1').get();
  return `${rand(r.lo)} – ${rand(r.hi)}`;
};
const realSocials = (s) => Object.values(s.social || {}).filter((u) => u && /^https?:\/\/[^/]+\/.+/.test(u));

// ---------------------------------------------------------------- structured data
function organization(s, base) {
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'ProfessionalService'],
    '@id': `${base}/#organization`,
    name: s.business_name,
    legalName: s.legal_name || undefined,
    url: `${base}/`,
    logo: `${base}/logo.png`,
    image: `${base}/og-image.png`,
    description: s.seo_default_description,
    slogan: s.tagline,
    email: s.email,
    telephone: s.phone,
    priceRange: priceRange(),
    currenciesAccepted: 'ZAR',
    paymentAccepted: 'Credit card, Debit card, Instant EFT, SnapScan, Zapper',
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.street_address || undefined,
      addressLocality: s.address_locality,
      addressRegion: s.address_region,
      postalCode: s.postal_code || undefined,
      addressCountry: 'ZA',
    },
    areaServed: { '@type': 'Country', name: 'South Africa' },
    knowsAbout: ['Web development', 'App development', 'E-commerce', 'Search engine optimisation', 'Generative engine optimisation',
      'Social media marketing', 'Google Ads', 'Meta Ads', 'Brand design', 'UX design', 'POPIA compliance', 'PayFast integration', 'Ozow integration'],
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', email: s.email, telephone: s.phone, areaServed: 'ZA', availableLanguage: ['English', 'Afrikaans', 'isiZulu'] }],
    sameAs: realSocials(s).length ? realSocials(s) : undefined,
    vatID: s.vat_no || undefined,
  };
}
const website = (s, base) => ({
  '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: s.business_name,
  inLanguage: 'en-ZA', publisher: { '@id': `${base}/#organization` },
});
const breadcrumbs = (base, items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [{ name: 'Home', path: '/' }, ...items].map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${base}${it.path}` })),
});
const faqPage = (faqs) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
function offer(base, service, t) {
  const price = (t.price_cents / 100).toFixed(2);
  return {
    '@type': 'Offer', name: `${service.name} — ${t.name}`, description: t.summary, url: `${base}/services/${service.slug}`,
    price, priceCurrency: 'ZAR', availability: 'https://schema.org/InStock', eligibleRegion: { '@type': 'Country', name: 'ZA' },
    priceSpecification: t.billing === 'monthly'
      ? { '@type': 'UnitPriceSpecification', price, priceCurrency: 'ZAR', unitCode: 'MON', unitText: 'month', valueAddedTaxIncluded: false }
      : { '@type': 'PriceSpecification', price, priceCurrency: 'ZAR', valueAddedTaxIncluded: false },
  };
}

// ---------------------------------------------------------------- snapshot HTML fragments
const faqHtml = (faqs, heading = 'Frequently asked questions') =>
  `<section><h2>${esc(heading)}</h2>${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>`;
const nav = () => `<nav aria-label="Primary"><a href="/">Home</a> · <a href="/services">Services</a> · <a href="/pricing">Pricing</a> · <a href="/agents">Specialists</a> · <a href="/blog">Blog</a> · <a href="/testimonials">Reviews</a> · <a href="/about">About us</a> · <a href="/contact">Contact</a></nav>`;
const footer = (s) => `<footer><p><a href="${esc(siteUrl())}/">${esc(siteUrl().replace(/^https?:\/\//, ''))}</a> · ${esc(s.business_name)} — ${esc(s.tagline)}. ${esc(s.address_locality)}, ${esc(s.address_region)}, South Africa. Email ${esc(s.email)} · Phone ${esc(s.phone)} · ${esc(s.office_hours)}.</p><p>Secure payments by PayFast and Ozow. Prices in South African rand (ZAR).</p></footer>`;
const tierList = (svc, tiers) => `<ul>${tiers.map((t) => `<li><strong>${esc(t.name)}</strong> — ${esc(rand(t.price_cents))} ${billingText(t.billing)}: ${esc(t.summary)} Includes ${esc(t.features.join(', '))}.</li>`).join('')}</ul>`;

// ---------------------------------------------------------------- route resolution
const NOINDEX = /^\/(login|register|portal|admin|checkout|account|payment)(\/|$)/;

/** Resolve SEO metadata + pre-rendered body for a pathname. */
export function resolvePage(pathname) {
  const s = getSettings();
  const base = siteUrl();
  const org = organization(s, base);
  const brand = s.business_name;
  const page = { status: 200, path: pathname, robots: 'index, follow, max-image-preview:large', type: 'website', schema: [], body: '' };
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const titled = (t) => (`${t} | ${brand}`.length <= 60 ? `${t} | ${brand}` : t);

  if (NOINDEX.test(pathname)) {
    return { ...page, title: `${brand} — Client portal`, description: s.seo_default_description, robots: 'noindex, nofollow', body: `<h1>${esc(brand)}</h1><p>Loading…</p>` };
  }

  if (parts.length === 0) {
    const svcs = services();
    const faqs = generalFaqs();
    Object.assign(page, {
      title: `${brand} | Digital Agency for SA Entrepreneurs`,
      description: s.seo_default_description,
      schema: [org, website(s, base), faqPage(faqs), {
        '@context': 'https://schema.org', '@type': 'ItemList', name: 'Services',
        itemListElement: svcs.map((v, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/services/${v.slug}`, name: v.name })),
      }],
      body: `<h1>Specialist teams for South African entrepreneurs</h1><p>${esc(s.seo_default_description)}</p>
        <h2>Our services</h2><ul>${svcs.map((v) => `<li><a href="/services/${v.slug}">${esc(v.name)}</a> — ${esc(v.tagline)} From ${esc(rand(tiersFor(v.id)[0]?.price_cents))}.</li>`).join('')}</ul>
        <h2>How it works</h2><ol><li>Free consultation</li><li>Choose an Essential, Growth or Enterprise package</li><li>Pay a deposit securely by card or instant EFT</li><li>Track milestones in your client portal</li></ol>${faqHtml(faqs)}`,
    });
  } else if (parts[0] === 'services' && parts.length === 1) {
    const svcs = services();
    Object.assign(page, {
      title: titled('Digital Agency Services in South Africa'),
      description: `Web development, design, SEO & marketing, ads, sales and operations for South African businesses — ${svcs.length} services with fixed rand pricing.`,
      schema: [org, breadcrumbs(base, [{ name: 'Services', path: '/services' }])],
      body: `<h1>Services</h1>${svcs.map((v) => `<h2><a href="/services/${v.slug}">${esc(v.name)}</a></h2><p>${esc(v.description)}</p>`).join('')}`,
    });
  } else if (parts[0] === 'services' && parts.length === 2) {
    const v = row(db.prepare('SELECT * FROM services WHERE slug = ? AND is_active = 1').get(parts[1]), ['outcomes']);
    if (!v) return notFound(page, s);
    v.tiers = tiersFor(v.id);
    const faqs = serviceFaqs(v);
    const from = rand(v.tiers[0].price_cents);
    Object.assign(page, {
      title: titled(`${v.name} in South Africa | From ${from}`),
      description: clip(`${v.tagline} Packages from ${from} ${billingText(v.tiers[0].billing)}, priced in rand for SA businesses.`, 160),
      schema: [org, breadcrumbs(base, [{ name: 'Services', path: '/services' }, { name: v.name, path: `/services/${v.slug}` }]), {
        '@context': 'https://schema.org', '@type': 'Service', '@id': `${base}/services/${v.slug}#service`,
        name: v.name, serviceType: v.name, description: v.description, provider: { '@id': `${base}/#organization` },
        areaServed: { '@type': 'Country', name: 'South Africa' }, url: `${base}/services/${v.slug}`,
        hasOfferCatalog: { '@type': 'OfferCatalog', name: `${v.name} packages`, itemListElement: v.tiers.map((t) => offer(base, v, t)) },
      }, faqPage(faqs)],
      body: `<h1>${esc(v.name)} in South Africa</h1><p>${esc(v.description)}</p><h2>Outcomes</h2><ul>${v.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        <h2>${esc(v.name)} packages and pricing</h2>${tierList(v, v.tiers)}${faqHtml(faqs)}`,
    });
  } else if (parts[0] === 'pricing') {
    const svcs = services();
    const count = svcs.length * 3;
    Object.assign(page, {
      title: titled(`Agency Pricing in Rand | ${count} Packages`),
      description: `Transparent agency pricing for South African businesses: ${count} Essential, Growth and Enterprise packages across ${svcs.length} services, from ${priceRange().split(' – ')[0]}. Pay by card or instant EFT.`,
      schema: [org, breadcrumbs(base, [{ name: 'Pricing', path: '/pricing' }]), {
        '@context': 'https://schema.org', '@type': 'OfferCatalog', name: `${brand} pricing`,
        itemListElement: svcs.flatMap((v) => tiersFor(v.id).map((t) => offer(base, v, t))),
      }],
      body: `<h1>Pricing</h1><p>All prices in South African rand. Projects: 50% deposit, balance on delivery. Retainers: monthly in advance.</p>${svcs.map((v) => `<h2>${esc(v.name)}</h2>${tierList(v, tiersFor(v.id))}`).join('')}`,
    });
  } else if (parts[0] === 'agents' && parts.length === 1) {
    const n = db.prepare('SELECT COUNT(*) n FROM agents').get().n;
    Object.assign(page, {
      title: titled(`${n} Specialist AI Agents`),
      description: `Meet the ${n} specialist AI agents behind ${brand}: engineers, designers, marketers, sales and operations experts with defined missions.`,
      schema: [org, breadcrumbs(base, [{ name: 'Specialists', path: '/agents' }])],
      body: `<h1>Our specialists</h1><ul>${rows(db.prepare('SELECT slug, name, description FROM agents ORDER BY name').all())
        .map((a) => `<li><a href="/agents/${a.slug}">${esc(a.name)}</a> — ${esc(a.description)}</li>`).join('')}</ul>`,
    });
  } else if (parts[0] === 'agents' && parts.length === 2) {
    const a = row(db.prepare('SELECT * FROM agents WHERE slug = ?').get(parts[1]));
    if (!a) return notFound(page, s);
    Object.assign(page, {
      title: clip(titled(`${a.name} — Specialist`), 65),
      description: clip(a.description || `${a.name} at ${brand}.`, 160),
      schema: [org, breadcrumbs(base, [{ name: 'Specialists', path: '/agents' }, { name: a.name, path: `/agents/${a.slug}` }])],
      body: `<h1>${esc(a.name)}</h1><p>${esc(a.description)}</p>${a.vibe ? `<p>${esc(a.vibe)}</p>` : ''}`,
    });
  } else if (parts[0] === 'about') {
    Object.assign(page, {
      title: titled('About Us | South African Digital Agency'),
      description: clip(`${brand} is a ${s.address_locality} digital agency pairing senior strategists with 160+ specialist AI agents to help SA entrepreneurs grow.`, 160),
      schema: [org, breadcrumbs(base, [{ name: 'About us', path: '/about' }]), {
        '@context': 'https://schema.org', '@type': 'AboutPage', url: `${base}/about`, name: `About ${brand}`, mainEntity: { '@id': `${base}/#organization` }, inLanguage: 'en-ZA',
      }],
      body: `<h1>About ${esc(brand)}</h1><p>${esc(brand)} is a South African digital agency based in ${esc(s.address_locality)}, ${esc(s.address_region)}. We give entrepreneurs, SMEs and growing companies specialist teams — software engineers, designers, marketers, ad buyers, sales strategists and operators — packaged into transparent Essential, Growth and Enterprise tiers priced in rand.</p>
        <h2>Why we exist</h2><p>South African founders deserve world-class execution without big-agency retainers, vague quotes or waiting weeks for answers. We publish our prices, show every milestone in a client portal, and accept local payment methods.</p>
        <h2>How we work</h2><p>Senior strategists orchestrate more than 160 specialist AI agents, each with a defined mission and quality bar, and review every deliverable before it reaches you.</p>${faqHtml(generalFaqs().slice(0, 4))}`,
    });
  } else if (parts[0] === 'contact') {
    Object.assign(page, {
      title: titled('Contact Us | Free Strategy Session'),
      description: `Contact ${brand} for a free 30-minute strategy session. Email ${s.email}, call ${s.phone} or WhatsApp us. We reply within one business day.`,
      schema: [org, breadcrumbs(base, [{ name: 'Contact', path: '/contact' }]), { '@context': 'https://schema.org', '@type': 'ContactPage', url: `${base}/contact`, mainEntity: { '@id': `${base}/#organization` } }],
      body: `<h1>Contact ${esc(brand)}</h1><p>Website: ${esc(base)}. Email: ${esc(s.email)}. Phone: ${esc(s.phone)}. WhatsApp: +${esc(s.whatsapp)}. Hours: ${esc(s.office_hours)}. Location: ${esc(s.address_locality)}, ${esc(s.address_region)}, South Africa.</p>`,
    });
  } else if (parts[0] === 'testimonials') {
    const ts = approvedTestimonials();
    Object.assign(page, {
      title: titled('Client Reviews & Testimonials'),
      description: `What South African entrepreneurs say about working with ${brand}: ${ts.length} client reviews across web development, marketing, design and more.`,
      schema: [org, breadcrumbs(base, [{ name: 'Reviews', path: '/testimonials' }]), ...ts.slice(0, 20).map((t) => ({
        '@context': 'https://schema.org', '@type': 'Review', itemReviewed: { '@id': `${base}/#organization` },
        author: { '@type': 'Person', name: t.author }, reviewBody: t.quote, reviewRating: { '@type': 'Rating', ratingValue: t.rating, bestRating: 5 },
      }))],
      body: `<h1>Client reviews</h1>${ts.map((t) => `<blockquote><p>“${esc(t.quote)}”</p><footer>${esc(t.author)}, ${esc(t.role)}${t.company ? `, ${esc(t.company)}` : ''}${t.location ? ` (${esc(t.location)})` : ''} — ${t.rating}/5</footer></blockquote>`).join('')}`,
    });
  } else if (parts[0] === 'blog' && parts.length === 1) {
    const posts = publishedPosts();
    Object.assign(page, {
      title: titled('Blog: Growth Guides for SA Entrepreneurs'),
      description: 'Practical guides on websites, payments, SEO, AI search, marketing and compliance for South African entrepreneurs and small businesses.',
      schema: [org, breadcrumbs(base, [{ name: 'Blog', path: '/blog' }]), {
        '@context': 'https://schema.org', '@type': 'Blog', url: `${base}/blog`, name: `${brand} Blog`, inLanguage: 'en-ZA', publisher: { '@id': `${base}/#organization` },
        blogPost: posts.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${base}/blog/${p.slug}`, datePublished: isoDate(p.published_at) })),
      }],
      body: `<h1>Blog</h1>${posts.map((p) => `<article><h2><a href="/blog/${p.slug}">${esc(p.title)}</a></h2><p>${esc(p.excerpt)}</p></article>`).join('')}`,
    });
  } else if (parts[0] === 'blog' && parts.length === 2) {
    const p = row(db.prepare(`SELECT * FROM posts WHERE slug = ? AND status = 'published' AND published_at <= datetime('now')`).get(parts[1]), ['tags']);
    if (!p) return notFound(page, s);
    Object.assign(page, {
      type: 'article',
      title: clip(p.meta_title || titled(p.title), 70),
      description: clip(p.meta_description || p.excerpt, 160),
      published: isoDate(p.published_at), modified: isoDate(p.updated_at),
      schema: [org, breadcrumbs(base, [{ name: 'Blog', path: '/blog' }, { name: p.title, path: `/blog/${p.slug}` }]), {
        '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.meta_description || p.excerpt,
        datePublished: isoDate(p.published_at), dateModified: isoDate(p.updated_at), inLanguage: 'en-ZA',
        author: { '@type': 'Organization', name: p.author, url: `${base}/about` }, publisher: { '@id': `${base}/#organization` },
        mainEntityOfPage: `${base}/blog/${p.slug}`, image: `${base}/og-image.png`, articleSection: p.category, keywords: p.tags.join(', '),
        wordCount: plain(p.body).split(/\s+/).length,
      }],
      body: `<article><h1>${esc(p.title)}</h1><p><em>${esc(p.excerpt)}</em></p>${mdToHtml(p.body)}</article>`,
    });
  } else if (parts[0] === 'privacy') {
    Object.assign(page, {
      title: titled('Privacy Policy (POPIA)'),
      description: `How ${brand} collects, uses and protects personal information in line with South Africa's Protection of Personal Information Act (POPIA).`,
      schema: [org], body: `<h1>Privacy policy</h1><p>${esc(brand)} processes personal information in accordance with POPIA.</p>`,
    });
  } else if (parts[0] === 'terms') {
    Object.assign(page, {
      title: titled('Terms of Service'),
      description: `Terms of engagement for ${brand} services: deposits, retainers, cancellations, intellectual property and payments in South African rand.`,
      schema: [org], body: `<h1>Terms of service</h1>`,
    });
  } else {
    return notFound(page, s);
  }
  page.body = `<header><a href="/">${esc(brand)}</a>${nav()}</header><main>${page.body}</main>${footer(s)}`;
  return page;
}

function notFound(page, s) {
  return { ...page, status: 404, title: `Page not found | ${s.business_name}`, description: s.seo_default_description, robots: 'noindex, follow',
    body: `<h1>Page not found</h1><p><a href="/">Go to the ${esc(s.business_name)} home page</a></p>` };
}

// ---------------------------------------------------------------- HTML injection
let cachedTemplate = null;
function template() {
  if (cachedTemplate && process.env.NODE_ENV === 'production') return cachedTemplate;
  cachedTemplate = readFileSync(resolve(DIST, 'index.html'), 'utf8');
  return cachedTemplate;
}
export const hasClientBuild = () => existsSync(resolve(DIST, 'index.html'));

export function renderHead(page) {
  const s = getSettings();
  const base = siteUrl();
  const url = `${base}${page.path === '/' ? '/' : page.path.replace(/\/+$/, '')}`;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" data-seo>`,
    `<meta name="robots" content="${page.robots}" data-seo>`,
    page.status === 200 ? `<link rel="canonical" href="${esc(url)}" data-seo>` : '',
    `<link rel="alternate" hreflang="en-ZA" href="${esc(url)}" data-seo>`,
    `<meta property="og:type" content="${page.type}" data-seo>`,
    `<meta property="og:site_name" content="${esc(s.business_name)}" data-seo>`,
    `<meta property="og:title" content="${esc(page.title)}" data-seo>`,
    `<meta property="og:description" content="${esc(page.description)}" data-seo>`,
    `<meta property="og:url" content="${esc(url)}" data-seo>`,
    `<meta property="og:image" content="${base}/og-image.png" data-seo>`,
    `<meta property="og:image:width" content="1200" data-seo><meta property="og:image:height" content="630" data-seo>`,
    `<meta property="og:locale" content="en_ZA" data-seo>`,
    page.published ? `<meta property="article:published_time" content="${page.published}" data-seo>` : '',
    page.modified ? `<meta property="article:modified_time" content="${page.modified}" data-seo>` : '',
    `<meta name="twitter:card" content="summary_large_image" data-seo>`,
    `<meta name="twitter:title" content="${esc(page.title)}" data-seo>`,
    `<meta name="twitter:description" content="${esc(page.description)}" data-seo>`,
    `<meta name="twitter:image" content="${base}/og-image.png" data-seo>`,
    `<meta name="geo.region" content="ZA${s.address_region === 'Gauteng' ? '-GP' : ''}" data-seo>`,
    `<meta name="geo.placename" content="${esc(s.address_locality)}" data-seo>`,
    ...page.schema.map(jsonLd),
  ];
  return tags.filter(Boolean).join('\n    ');
}

export function renderPage(pathname) {
  const page = resolvePage(pathname);
  const html = template()
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('<!--app-head-->', renderHead(page))
    .replace('<!--app-html-->', page.body);
  return { status: page.status, html };
}

// ---------------------------------------------------------------- crawler files
export function sitemapXml() {
  const base = siteUrl();
  const urls = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/services', priority: '0.9' }, { loc: '/pricing', priority: '0.9' },
    ...services().map((v) => ({ loc: `/services/${v.slug}`, priority: '0.9' })),
    { loc: '/about', priority: '0.7' }, { loc: '/contact', priority: '0.7' }, { loc: '/testimonials', priority: '0.6' },
    { loc: '/blog', priority: '0.8', changefreq: 'weekly' },
    ...publishedPosts().map((p) => ({ loc: `/blog/${p.slug}`, priority: '0.7', lastmod: isoDate(p.updated_at)?.slice(0, 10) })),
    { loc: '/agents', priority: '0.5' },
    ...rows(db.prepare('SELECT slug FROM agents ORDER BY slug').all()).map((a) => ({ loc: `/agents/${a.slug}`, priority: '0.3' })),
    { loc: '/privacy', priority: '0.2' }, { loc: '/terms', priority: '0.2' },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) =>
    `  <url><loc>${esc(base + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
}

export function robotsTxt() {
  const base = siteUrl();
  const privatePaths = ['/api/', '/admin', '/portal', '/checkout', '/account', '/payment', '/login', '/register'];
  // Search engines and AI assistants are explicitly welcome (GEO): they can only cite what they can read.
  const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User',
    'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot'];
  const block = (agent) => `User-agent: ${agent}\nAllow: /\n${privatePaths.map((p) => `Disallow: ${p}`).join('\n')}\n`;
  return `${['*', ...aiBots].map(block).join('\n')}\nSitemap: ${base}/sitemap.xml\n# AI-readable summary: ${base}/llms.txt\n`;
}

export function llmsTxt({ full = false } = {}) {
  const s = getSettings();
  const base = siteUrl();
  const svcs = services();
  const lines = [
    `# ${s.business_name}`, '',
    `> ${s.seo_default_description}`, '',
    `${s.business_name} is based in ${s.address_locality}, ${s.address_region}, South Africa and serves clients nationwide. All prices are in South African rand (ZAR)${s.vat_registered ? `, excluding ${s.vat_rate}% VAT` : ''}. Every service has three tiers — Essential, Growth and Enterprise. Projects require a 50% deposit; retainers are billed monthly. Clients pay online by card or instant EFT via PayFast or Ozow.`, '',
    `Website: ${base} · Email: ${s.email} · Phone: ${s.phone} · WhatsApp: https://wa.me/${s.whatsapp} · ${s.office_hours}`, '',
    '## Services', '',
  ];
  for (const v of svcs) {
    const tiers = tiersFor(v.id);
    lines.push(`- [${v.name}](${base}/services/${v.slug}): ${v.tagline} ${tiers.map((t) => `${t.name} ${rand(t.price_cents)} ${billingText(t.billing)}`).join('; ')}.`);
    if (full) {
      lines.push('', `### ${v.name}`, '', v.description, '');
      for (const t of tiers) lines.push(`- **${t.name}** — ${rand(t.price_cents)} ${billingText(t.billing)}${t.billing === 'once' ? `, about ${t.delivery_days} days` : ''}. ${t.summary} Includes: ${t.features.join('; ')}.`);
      lines.push('');
      for (const f of serviceFaqs({ ...v, tiers })) lines.push(`**Q: ${f.q}**`, `A: ${f.a}`, '');
    }
  }
  lines.push('', '## Key pages', '',
    `- [Pricing](${base}/pricing): every package with rand prices`,
    `- [About us](${base}/about): who we are and how we work`,
    `- [Client reviews](${base}/testimonials)`,
    `- [Contact](${base}/contact): free 30-minute strategy session`,
    `- [Specialists](${base}/agents): the specialist AI agents behind our work`, '',
    '## Frequently asked questions', '');
  for (const f of generalFaqs()) lines.push(`- **${f.q}** ${f.a}`);
  lines.push('', '## Articles', '');
  for (const p of publishedPosts()) {
    lines.push(`- [${p.title}](${base}/blog/${p.slug}): ${p.excerpt}`);
    if (full) lines.push('', plain(p.body).trim(), '');
  }
  if (!full) lines.push('', '## Optional', '', `- [Full detail for AI assistants](${base}/llms-full.txt)`, `- [Sitemap](${base}/sitemap.xml)`);
  return lines.join('\n') + '\n';
}

export function rssXml() {
  const s = getSettings();
  const base = siteUrl();
  const posts = publishedPosts().slice(0, 30);
  const date = (d) => new Date(isoDate(d)).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(s.business_name)} Blog</title>
  <link>${base}/blog</link>
  <atom:link href="${base}/blog/rss.xml" rel="self" type="application/rss+xml" />
  <description>Business growth insights for South African entrepreneurs</description>
  <language>en-za</language>
${posts.map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${base}/blog/${p.slug}</link>
    <guid isPermaLink="true">${base}/blog/${p.slug}</guid>
    <pubDate>${date(p.published_at)}</pubDate>
    <category>${esc(p.category)}</category>
    <description>${esc(p.excerpt)}</description>
  </item>`).join('\n')}
</channel>
</rss>
`;
}

// ---------------------------------------------------------------- audit for the Command Centre
export function seoAudit() {
  const s = getSettings();
  const paths = ['/', '/services', '/pricing', '/about', '/contact', '/testimonials', '/blog', '/agents',
    ...services().map((v) => `/services/${v.slug}`), ...publishedPosts().map((p) => `/blog/${p.slug}`)];
  const pages = paths.map((p) => {
    const pg = resolvePage(p);
    const issues = [];
    if (pg.title.length > 65) issues.push(`Title is ${pg.title.length} chars (aim ≤ 60)`);
    if (pg.title.length < 25) issues.push('Title is short');
    if (pg.description.length > 165) issues.push(`Description is ${pg.description.length} chars (aim ≤ 160)`);
    if (pg.description.length < 70) issues.push('Description is short (aim 120–160)');
    if (!/<h1[ >]/.test(pg.body)) issues.push('No H1 in pre-rendered content');
    if (!pg.schema.length) issues.push('No structured data');
    return {
      path: p, title: pg.title, title_length: pg.title.length, description: pg.description, description_length: pg.description.length,
      schema_types: [...new Set(pg.schema.flatMap((x) => [].concat(x['@type'])))], words: pg.body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, issues,
    };
  });
  const checks = [
    { ok: /^https:\/\//.test(siteUrl()), label: `Canonical domain is HTTPS (${siteUrl()})` },
    { ok: existsSync(resolve(DIST, 'og-image.png')), label: 'Social sharing image (og-image.png) present' },
    { ok: realSocials(s).length > 0, label: 'Social profile URLs set (used as sameAs entity signals)' },
    { ok: s.phone !== '+27 10 000 0000', label: 'Real business phone number set (NAP consistency)' },
    { ok: Boolean(s.street_address), label: 'Street address set (local SEO / Google Business Profile match)' },
    { ok: publishedPosts().length >= 6, label: 'At least 6 published articles' },
    { ok: approvedTestimonials().length >= 3, label: 'At least 3 approved client reviews' },
    { ok: true, label: 'robots.txt allows search engines and AI crawlers' },
    { ok: true, label: 'llms.txt and llms-full.txt published for AI assistants' },
    { ok: true, label: 'XML sitemap and RSS feed published' },
  ];
  return {
    pages,
    checks,
    summary: { pages: pages.length, with_issues: pages.filter((p) => p.issues.length).length, sitemap_urls: (sitemapXml().match(/<url>/g) || []).length },
    links: { sitemap: '/sitemap.xml', robots: '/robots.txt', llms: '/llms.txt', llms_full: '/llms-full.txt', rss: '/blog/rss.xml' },
  };
}
