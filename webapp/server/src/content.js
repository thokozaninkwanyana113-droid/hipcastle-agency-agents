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
    WHERE sv.is_active = 1 AND st.billing = ?`).get(billing).n;
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

/** Question-and-answer pairs for one service — great for answer engines. */
export function serviceFaqs(service) {
  const [e, g, ent] = service.tiers;
  const name = service.name.toLowerCase();
  const vat = getSettings().vat_registered ? ' (excl. VAT)' : '';
  return [
    { q: `How much does ${name} cost in South Africa?`,
      a: `At Hipcastle, ${name} starts at ${rand(e.price_cents)} ${billingText(e.billing)}${vat} for the Essential tier. The Growth tier is ${rand(g.price_cents)} ${billingText(g.billing)} and Enterprise is ${rand(ent.price_cents)} ${billingText(ent.billing)}.` },
    { q: `What is included in the ${service.name} Growth package?`,
      a: `${g.summary} It includes: ${g.features.join('; ')}.` },
    { q: `How long does ${name} take?`,
      a: e.billing === 'once'
        ? `Essential projects are typically delivered in about ${e.delivery_days} days, and Growth projects in about ${g.delivery_days} days, depending on how quickly content and feedback are provided.`
        : 'Retainers run month to month and start within five working days of the first payment. You can cancel with 30 days’ notice.' },
    { q: `Which ${name} tier is right for my business?`,
      a: `Choose Essential (${e.summary.toLowerCase()}), Growth (${g.summary.toLowerCase()}) or Enterprise (${ent.summary.toLowerCase()}). Book a free consultation if you are unsure.` },
  ];
}

export const PROVINCES = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Outside South Africa'];
