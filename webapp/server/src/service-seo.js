// Service pages for search, answer and generative engines (SEO / AEO / GEO).
// One source for: the answer box, structured data (Service, HowTo, FAQPage, WebPage) and the
// Markdown version AI crawlers read (/services/<slug>.md, listed in llms.txt).
import { db, rows } from './db.js';
import { getSettings } from './settings.js';
import { billingText, rand, serviceAnswer, serviceFaqs, TIER_AUDIENCE } from './content.js';
import { journey } from './playbooks.js';
import { CARE } from './care.js';
import { canonicalUrl } from './urls.js';

/** Date the published catalogue copy last changed (bump with content releases). */
export const CONTENT_DATE = '2026-11-17';
const PROVINCES = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'];

const tiers = (sid, plan = 'core') => rows(db.prepare(`SELECT * FROM service_tiers WHERE service_id = ? AND plan = ?
  ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(sid, plan), ['features']);

/** Last time this service's packages changed (catalogue release or an admin edit). */
export function serviceUpdatedAt(service) {
  const ids = db.prepare("SELECT id FROM service_tiers WHERE service_id = ?").all(service.id).map((t) => t.id);
  const edits = ids.length ? db.prepare(`SELECT MAX(created_at) d FROM events WHERE type = 'catalog.tier' AND (${ids.map(() => 'message LIKE ?').join(' OR ')})`)
    .get(...ids.map((i) => `Tier #${i} %`)).d : null;
  const d = edits ? edits.slice(0, 10) : CONTENT_DATE;
  return d > CONTENT_DATE ? d : CONTENT_DATE;
}

/** Everything a service page needs for AEO/GEO. `service` must include tiers. */
export function serviceSeo(service) {
  const base = canonicalUrl();
  const s = getSettings();
  const url = `${base}/services/${service.slug}`;
  const care = tiers(service.id, 'care');
  const { answer, facts } = serviceAnswer(service);
  const faqs = serviceFaqs(service);
  const updated = serviceUpdatedAt(service);
  const plan = journey(service.slug, service.tiers).find((j) => j.tier === 'growth') || journey(service.slug, service.tiers)[0];
  const offer = (t, label = service.name) => {
    const price = (t.price_cents / 100).toFixed(2);
    return {
      '@type': 'Offer', name: `${label} — ${t.name}`, description: t.summary, url, price, priceCurrency: 'ZAR',
      availability: 'https://schema.org/InStock', eligibleRegion: { '@type': 'Country', name: 'ZA' },
      priceSpecification: t.billing === 'monthly'
        ? { '@type': 'UnitPriceSpecification', price, priceCurrency: 'ZAR', unitCode: 'MON', unitText: 'month', valueAddedTaxIncluded: false }
        : { '@type': 'PriceSpecification', price, priceCurrency: 'ZAR', valueAddedTaxIncluded: false },
    };
  };
  const schema = [
    {
      '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, url, name: `${service.name} in South Africa`,
      description: answer, inLanguage: 'en-ZA', dateModified: updated, isPartOf: { '@id': `${base}/#website` },
      about: { '@id': `${url}#service` }, mainEntity: { '@id': `${url}#service` },
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.answer-box__text'] },
    },
    {
      '@context': 'https://schema.org', '@type': 'Service', '@id': `${url}#service`, name: service.name, serviceType: service.name,
      description: service.description, disambiguatingDescription: answer, slogan: service.tagline, url,
      provider: { '@id': `${base}/#organization` }, brand: { '@id': `${base}/#organization` },
      areaServed: [{ '@type': 'Country', name: 'South Africa' }, ...PROVINCES.map((p) => ({ '@type': 'AdministrativeArea', name: p }))],
      audience: { '@type': 'BusinessAudience', audienceType: `South African ${Object.values(TIER_AUDIENCE).join(', ')}`, geographicArea: { '@type': 'Country', name: 'South Africa' } },
      availableChannel: { '@type': 'ServiceChannel', serviceUrl: url, availableLanguage: ['en-ZA'] },
      termsOfService: `${base}/terms`,
      hasOfferCatalog: { '@type': 'OfferCatalog', name: `${service.name} packages`,
        itemListElement: [...service.tiers.map((t) => offer(t)), ...care.map((t) => offer(t, CARE[service.slug]?.title || 'Care plan'))] },
      offers: { '@type': 'AggregateOffer', priceCurrency: 'ZAR', lowPrice: (Math.min(...service.tiers.map((t) => t.price_cents)) / 100).toFixed(2),
        highPrice: (Math.max(...service.tiers.map((t) => t.price_cents)) / 100).toFixed(2), offerCount: service.tiers.length },
    },
    ...(plan ? [{
      '@context': 'https://schema.org', '@type': 'HowTo', '@id': `${url}#process`, name: `How ${service.name} works at ${s.business_name}`,
      description: `The delivery process for the ${service.name} ${plan.name} package, from ordering to ${plan.kind === 'project' ? 'launch and handover' : 'monthly reporting'}.`,
      ...(plan.launch_days ? { totalTime: `P${plan.launch_days}D` } : {}),
      step: plan.stages.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st.label, text: st.steps.map((x) => x.title).join('; ') })),
    }] : []),
    { '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ];
  return { answer, facts, faqs, updated_at: updated, process: plan, care, schema };
}

/** Clean Markdown of a service page for AI crawlers and assistants (GEO). */
export function serviceMarkdown(service) {
  const s = getSettings();
  const seo = serviceSeo(service);
  const base = canonicalUrl();
  const lines = [
    `# ${service.name} in South Africa — ${s.business_name}`, '',
    `> ${seo.answer}`, '',
    `Source: ${base}/services/${service.slug} · Last updated: ${seo.updated_at} · Prices in South African rand${s.vat_registered ? `, excluding ${s.vat_rate}% VAT` : ''}.`, '',
    service.description, '',
    '## Key facts', '', ...seo.facts.map((f) => `- **${f.label}:** ${f.value}`), '',
    '## Packages', '',
    ...service.tiers.flatMap((t) => [`### ${t.name} — ${rand(t.price_cents)} ${billingText(t.billing)}`, '', `${t.summary}${t.billing === 'once' ? ` Typical delivery: ${t.delivery_days} days.` : ''} Best for ${TIER_AUDIENCE[t.tier]}.`, '', ...t.features.map((f) => `- ${f}`), '']),
    ...(seo.process ? ['## How it works', '', ...seo.process.stages.map((st, i) => `${i + 1}. **${st.label}** — ${st.steps.map((x) => x.title).join('; ')}`), ''] : []),
    ...(seo.care.length ? [`## Aftercare: ${CARE[service.slug]?.title || 'Care plans'}`, '', ...seo.care.map((t) => `- **${t.name}** — ${rand(t.price_cents)} per month: ${t.features.slice(0, 4).join('; ')}`), ''] : []),
    '## Frequently asked questions', '', ...seo.faqs.flatMap((f) => [`### ${f.q}`, '', f.a, '']),
    '## Next step', '', `Book a free 30-minute strategy session: ${base}/contact · Email ${s.email}${s.whatsapp ? ` · WhatsApp https://wa.me/${s.whatsapp}` : ''}`, '',
  ];
  return lines.join('\n');
}
