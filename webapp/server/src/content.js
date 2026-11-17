// Shared marketing content used by both the API (for the React app) and the
// server-side SEO renderer, so crawlers and users see the same answers.
import { getSettings } from './settings.js';
import { db } from './db.js';

const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
export const rand = (cents) => zar.format((cents || 0) / 100).replace(/ /g, ' ');
export const billingText = (b) => (b === 'monthly' ? 'per month' : 'once-off');

export function generalFaqs() {
  const s = getSettings();
  const vat = s.vat_registered ? `in rand, excluding VAT at ${s.vat_rate}%` : 'in South African rand';
  const min = (billing) => db.prepare(`SELECT MIN(st.price_cents) n FROM service_tiers st JOIN services sv ON sv.id = st.service_id
    WHERE sv.is_active = 1 AND st.plan = 'core' AND st.billing = ?`).get(billing).n;
  return [
    { q: 'What does Hipcastle Agency do?',
      a: `${s.business_name} is a South African digital agency that gives entrepreneurs and growing businesses specialist teams for software engineering, design, digital marketing and SEO, paid advertising, sales, operations and strategy. Every service is sold in three fixed-price tiers: Essential, Growth and Enterprise.` },
    { q: 'How much do your services cost?',
      a: `Prices are published ${vat}. Monthly retainers start from ${rand(min('monthly'))} per month and once-off projects from ${rand(min('once'))}. Growth and Enterprise tiers add more specialists, scope and service levels. See the pricing page for every package.` },
    { q: 'How do I pay?',
      a: 'Pay securely online from your client portal by card, instant EFT, SnapScan or Zapper through PayFast, or by instant EFT from all major South African banks through Ozow. Projects require a 50% deposit with the balance on delivery; retainers are billed monthly in advance.' },
    { q: 'Do you only work with businesses in Johannesburg?',
      a: `No. We are based in ${s.address_locality}, ${s.address_region}, and can work remotely with businesses anywhere in South Africa — Cape Town, Durban, Pretoria, Gqeberha, Bloemfontein and beyond.` },
    { q: 'How quickly can you start?',
      a: 'Most engagements kick off within five working days of the deposit being paid. Your milestones, invoices and messages are visible in the client portal from day one.' },
    { q: 'Is my data safe and POPIA compliant?',
      a: 'Yes. We only collect the information needed to deliver your project, process it under POPIA, use encrypted connections, and never sell your data. Payments are handled by PayFast and Ozow — we never see or store your card or banking details.' },
    { q: 'Who does the work?',
      a: 'A human-led Hipcastle team owns every engagement. The team works with a library of more than 160 specialist AI playbooks — each with a defined mission, workflow and quality bar — for speed and consistency, and every deliverable is reviewed by a person before it reaches you.' },
  ];
}

/** Who each tier is for (used in answers). */
export const TIER_AUDIENCE = { essential: 'start-ups and side hustles', growth: 'SMEs with traction', enterprise: 'scale-ups and corporates' };
const SUPPORT_DAYS = { essential: 14, growth: 30, enterprise: 60 };
const careFrom = (serviceId) => db.prepare("SELECT MIN(price_cents) n, MIN(care_minutes) m FROM service_tiers WHERE service_id = ? AND plan = 'care'").get(serviceId);

/**
 * Answer-first summary of a service (AEO): the 40–60 word answer an assistant or featured snippet
 * can quote verbatim, plus the key facts as label/value pairs.
 */
export function serviceAnswer(service) {
  const s = getSettings();
  const [e, g, ent] = service.tiers;
  const name = service.name;
  const vat = s.vat_registered ? ' excl. VAT' : '';
  const once = service.tiers.filter((t) => t.billing === 'once');
  const care = careFrom(service.id);
  const answer = `${name} from ${s.business_name} costs ${rand(e.price_cents)} ${billingText(e.billing)} (Essential), ${rand(g.price_cents)} ${billingText(g.billing)} (Growth) or ${rand(ent.price_cents)} ${billingText(ent.billing)} (Enterprise)${vat}, priced in rand for South African businesses. ${service.tagline}${once.length ? ` Projects are typically delivered in ${once.map((t) => t.delivery_days).join('–')} days.` : ' Retainers run month to month with 30 days’ notice.'}`;
  const facts = [
    ['Price range', `${rand(Math.min(...service.tiers.map((t) => t.price_cents)))} – ${rand(Math.max(...service.tiers.map((t) => t.price_cents)))}${vat}`],
    ['Packages', service.tiers.map((t) => `${t.name} (${billingText(t.billing)})`).join(', ')],
    ...(once.length ? [['Typical delivery', once.map((t) => `${t.name}: ${t.delivery_days} days`).join(' · ')]] : []),
    ['Best for', service.tiers.map((t) => `${t.name}: ${TIER_AUDIENCE[t.tier] || ''}`).join(' · ')],
    ['Payment', once.length ? '50% deposit, balance on delivery — card, instant EFT, SnapScan or Zapper (PayFast/Ozow)' : 'Monthly in advance — card (optionally automatic) or instant EFT'],
    ...(care.n ? [['Aftercare', `Care plans from ${rand(care.n)}/month`]] : []),
    ['Where', `${s.address_locality}-based, working remotely across South Africa`],
  ].map(([label, value]) => ({ label, value }));
  return { answer, facts };
}

/** Question-and-answer pairs for one service — written for answer engines (AEO) and AI search (GEO). */
export function serviceFaqs(service) {
  const s = getSettings();
  const [e, g, ent] = service.tiers;
  const name = service.name.toLowerCase();
  const vat = s.vat_registered ? ' (excl. VAT)' : '';
  const care = service.id ? careFrom(service.id) : {};
  const monthly = service.tiers.some((t) => t.billing === 'monthly');
  return [
    { q: `How much does ${name} cost in South Africa?`,
      a: `At ${s.business_name}, ${name} starts at ${rand(e.price_cents)} ${billingText(e.billing)}${vat} for the Essential tier. The Growth tier is ${rand(g.price_cents)} ${billingText(g.billing)} and Enterprise is ${rand(ent.price_cents)} ${billingText(ent.billing)}. Prices are fixed and published — no surprise quotes.` },
    { q: `What is included in the ${service.name} Growth package?`,
      a: `${g.summary} It includes: ${g.features.join('; ')}.` },
    { q: `How long does ${name} take?`,
      a: e.billing === 'once'
        ? `Essential projects are typically delivered in about ${e.delivery_days} days, and Growth projects in about ${g.delivery_days} days, from the kick-off call. Timelines depend on how quickly content, access and approvals are provided; your portal shows every milestone and due date.`
        : 'Retainers run month to month and start within five working days of the first payment. Each month follows a plan you approve, with a monthly report and review call. You can cancel with 30 days’ notice.' },
    { q: `Which ${name} package is right for my business?`,
      a: `Essential suits ${TIER_AUDIENCE.essential} (${e.summary.toLowerCase()}), Growth suits ${TIER_AUDIENCE.growth} (${g.summary.toLowerCase()}) and Enterprise suits ${TIER_AUDIENCE.enterprise} (${ent.summary.toLowerCase()}). Book a free 30-minute strategy session if you are unsure and we'll recommend one.` },
    { q: `What happens after my ${name} project is delivered?`,
      a: `${e.billing === 'once' ? `Every project includes free post-launch support (${SUPPORT_DAYS.essential} days on Essential, ${SUPPORT_DAYS.growth} on Growth, ${SUPPORT_DAYS.enterprise} on Enterprise). ` : ''}${care?.n ? `After that you can add a monthly care plan from ${rand(care.n)} per month for maintenance, updates, hosting where relevant and a monthly allowance of hands-on time.` : 'You can continue with a monthly retainer.'}` },
    { q: `How do I pay for ${name}?`,
      a: `Online from your client portal by card, instant EFT, SnapScan or Zapper through PayFast, or instant EFT through Ozow; normal EFT also works.${monthly ? ' Monthly packages are billed in advance and can be paid automatically by card.' : ''}${service.tiers.some((t) => t.billing === 'once') ? ' Projects need a 50% deposit, with the balance on delivery.' : ''} We never see your card or banking details.` },
    { q: `Do I sign a contract for ${name}?`,
      a: `For larger projects${s.agreement_for_retainers ? ' and monthly retainers' : ''} you sign a short, plain-language service agreement online before the first payment (scope, fees, approvals, ownership of the work, POPIA and cancellation). Ownership of the final work passes to you once paid in full.` },
    { q: `Do you offer ${name} outside ${s.address_locality}?`,
      a: `Yes. ${s.business_name} is based in ${s.address_locality}, ${s.address_region}, and works remotely with businesses across South Africa — Cape Town, Durban, Pretoria, Gqeberha, Bloemfontein, Polokwane, Mbombela and beyond — using Google Meet, Teams, phone and WhatsApp.` },
    { q: `What do I need to get started with ${name}?`,
      a: 'After ordering you complete a 10-minute onboarding form in your portal (your business, goals, deadlines and who approves work) and invite us to the accounts we need — never send passwords. We then book a kick-off call and confirm the plan.' },
    { q: `Is ${name} with ${s.business_name} POPIA compliant?`,
      a: 'Yes. We process personal information only to deliver your work, act as your operator under POPIA when handling your customers’ data, keep it secure and never sell it. Security and POPIA checks are built into the delivery process.' },
  ];
}

export const PROVINCES = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Outside South Africa'];
