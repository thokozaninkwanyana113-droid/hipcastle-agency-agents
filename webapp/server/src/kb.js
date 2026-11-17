// Hipcastle knowledge base — one source of truth for the chatbot, the Help Centre and the
// offline (no-API-key) answer engine. Built from live data (catalog, playbooks, settings,
// blog, FAQs), so answers always match what the system actually offers and charges.
//
// Output is deterministic (stable ordering, no timestamps) so the chatbot's system prompt
// stays byte-identical between requests and can be prompt-cached.
import { createHash } from 'node:crypto';
import { db, rows } from './db.js';
import { getSettings } from './settings.js';
import { generalFaqs, rand, billingText } from './content.js';
import { buildPlan, journey, PLAYBOOKS } from './playbooks.js';
import { canonicalUrl } from './urls.js';
import { CARE, CARE_EXTRA_HOUR_CENTS, CARE_TERMS, hoursLabel } from './care.js';
import { SUPPORT_DAYS } from './playbooks.js';

export const CATEGORIES = [
  ['about', 'About Hipcastle'],
  ['services', 'Services & packages'],
  ['pricing', 'Pricing, VAT & billing'],
  ['payments', 'Payments'],
  ['delivery', 'Onboarding & delivery'],
  ['portal', 'Client portal & account'],
  ['care', 'Care plans, maintenance & hosting'],
  ['support', 'Support & contact'],
  ['policies', 'Privacy & terms'],
  ['guides', 'Guides & articles'],
];

const chunk = (id, category, title, body, { keywords = '', link = null, links = [] } = {}) =>
  ({ id, category, title, body: body.replace(/\s+\n/g, '\n').trim(), keywords, link, links });

function services() {
  return rows(db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order').all(), ['outcomes']).map((s) => ({
    ...s,
    tiers: rows(db.prepare(`SELECT * FROM service_tiers WHERE service_id = ? AND plan = 'core'
      ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(s.id), ['features']),
    care: rows(db.prepare(`SELECT * FROM service_tiers WHERE service_id = ? AND plan = 'care'
      ORDER BY CASE tier WHEN 'essential' THEN 1 WHEN 'growth' THEN 2 ELSE 3 END`).all(s.id), ['features']),
  }));
}

/** Build every knowledge chunk. */
export function buildChunks() {
  const s = getSettings();
  const vat = s.vat_registered ? `excluding VAT (${s.vat_rate}% VAT is added on invoices)` : 'in South African rand (Hipcastle is not currently charging VAT)';
  const svc = services();
  const out = [];
  const minMonthly = Math.min(...svc.flatMap((x) => x.tiers.filter((t) => t.billing === 'monthly').map((t) => t.price_cents)));
  const minOnce = Math.min(...svc.flatMap((x) => x.tiers.filter((t) => t.billing === 'once').map((t) => t.price_cents)));

  // ---------------------------------------------------------------- about & contact
  out.push(chunk('about', 'about', `What is ${s.business_name}?`,
    `${s.business_name} is a South African digital agency for entrepreneurs, SMEs and growing companies, based in ${s.address_locality}, ${s.address_region}, working remotely with clients anywhere in South Africa. A human-led team delivers websites, apps, design, digital marketing & SEO, paid ads, sales, operations and strategy, working with a library of ${db.prepare('SELECT COUNT(*) n FROM agents').get().n} specialist AI playbooks for speed and consistency. Every deliverable is reviewed by a person. Every service is sold in three fixed-price tiers — Essential, Growth and Enterprise — priced in rand.`,
    { keywords: 'who are you about company agency what do you do hipcastle', link: '/about' }));
  out.push(chunk('ai-playbooks', 'about', 'What are the "AI playbooks"?',
    `The AI playbooks are open-source specialist AI agent definitions (for example Frontend Developer, Brand Guardian, SEO Specialist, Reality Checker). Each one describes a role's mission, workflow and quality bar. Hipcastle's team uses them to work faster and more consistently; people own every engagement and review every deliverable. You can browse them on the AI Playbooks page.`,
    { keywords: 'ai agents playbooks specialists automation robots human', link: '/agents' }));
  out.push(chunk('contact', 'support', 'How do I contact Hipcastle?',
    `Email ${s.email}${s.phone ? `, call ${s.phone}` : ''}${s.whatsapp ? `, or WhatsApp https://wa.me/${s.whatsapp}` : ''}. Office hours: ${s.office_hours}. Website: ${canonicalUrl()}. You can book a free 30-minute strategy session on the Contact page — a strategist replies within one business day.`,
    { keywords: 'contact email phone call whatsapp hours reach talk human person strategy session book consultation', link: '/contact' }));
  out.push(chunk('free-session', 'support', 'Is the strategy session really free?',
    `Yes. The 30-minute strategy session is free and there is no obligation. Request it on the Contact page (or ask the chatbot to put you in touch). We review your goals, then recommend a package with a fixed rand price.${s.booking_url ? ` You can pick a time straight away on the Contact page (online booking).` : ''}`,
    { keywords: 'free consultation strategy session call meeting obligation quote', link: '/contact' }));

  // ---------------------------------------------------------------- services
  out.push(chunk('services-list', 'services', 'Which services does Hipcastle offer?',
    `Hipcastle offers ${svc.length} services:\n${svc.map((x) => `- ${x.name}: ${x.tagline} From ${rand(x.tiers[0].price_cents)} ${billingText(x.tiers[0].billing)}.`).join('\n')}`,
    { keywords: 'services offer list what can you do help', link: '/services' }));
  for (const x of svc) {
    const pb = PLAYBOOKS[x.slug];
    const jr = journey(x.slug, x.tiers);
    out.push(chunk(`svc-${x.slug}`, 'services', `${x.name}: what's included and what does it cost?`,
      `${x.name} — ${x.tagline}\n${x.description}\nOutcomes: ${x.outcomes.join('; ')}.\nPackages (${vat}):\n${x.tiers.map((t) =>
        `- ${t.name}: ${rand(t.price_cents)} ${billingText(t.billing)}${t.billing === 'once' ? `, typical delivery ${t.delivery_days} days` : ''}. ${t.summary} Includes: ${t.features.join('; ')}.${t.is_popular ? ' (Most popular)' : ''}`).join('\n')}`,
      { keywords: `${x.name} ${x.slug} ${x.tagline} price cost how much package tier ${x.tiers.map((t) => t.name).join(' ')}`, link: `/services/${x.slug}` }));
    out.push(chunk(`journey-${x.slug}`, 'delivery', `How is ${x.name} delivered, and how long does it take?`,
      `${pb?.summary || ''}\n${jr.map((j) => j.kind === 'project'
        ? `- ${j.name} (project): launch in about ${j.launch_days} days, then ${j.support_days} days of post-launch support; ${j.revisions === null ? 'unlimited' : j.revisions} revision rounds per deliverable. Stages: ${j.stages.map((st) => `${st.label} (${st.steps.map((p) => p.title + (p.approval ? ' — your approval' : '')).join(', ')})`).join(' → ')}.`
        : `- ${j.name} (monthly retainer): onboarding and setup once, then a monthly cycle (${j.stages.find((st) => st.stage === 'cycle')?.steps.map((p) => p.title).join(', ')}); ${j.revisions === null ? 'unlimited' : j.revisions} revision rounds per deliverable.`).join('\n')}`,
      { keywords: `${x.name} ${x.slug} how long timeline delivery process steps stages days weeks turnaround`, link: `/services/${x.slug}` }));
    const plan = buildPlan(x.slug, 'growth', 'once', 30);
    const own = plan.intake.slice(5).map((q) => q.label);
    const access = plan.checklist.slice(2).map((c) => c.label);
    out.push(chunk(`onboard-${x.slug}`, 'delivery', `What do I need to provide to start ${x.name}?`,
      `After the deposit, you complete a short onboarding form in your client portal: your business, 3-month goals, deadlines, who approves work, and competitors you admire${own.length ? `, plus: ${own.join(' ')}` : ''}. Access & assets: share your logo and brand material, suggest two kick-off call times${access.length ? `, and: ${access.join(' ')}` : ''}. Grant access by inviting Hipcastle as a user or partner — never send passwords.`,
      { keywords: `${x.name} ${x.slug} need provide start requirements access onboarding information prepare`, link: `/services/${x.slug}` }));
  }
  out.push(chunk('tiers', 'services', 'Essential, Growth or Enterprise — which tier should I choose?',
    `Essential is a fixed-scope quick win (2 revision rounds per deliverable). Growth is the most popular: a multi-specialist team delivering a complete outcome (3 revision rounds). Enterprise is a dedicated, SLA-backed team on a monthly retainer (unlimited revisions). Not sure? Book the free strategy session and we'll recommend one.`,
    { keywords: 'which tier package choose essential growth enterprise difference compare best recommend', link: '/pricing' }));

  // ---------------------------------------------------------------- pricing & billing
  out.push(chunk('pricing', 'pricing', 'How much do your services cost?',
    `All prices are published ${vat}. Monthly retainers start from ${rand(minMonthly)} per month and once-off projects from ${rand(minOnce)}. Every service and tier is listed on the Pricing page.`,
    { keywords: 'price cost how much rates fees cheap expensive budget rand zar', link: '/pricing' }));
  out.push(chunk('billing', 'pricing', 'How does billing work (deposits, balances and retainers)?',
    `Once-off projects: a 50% deposit when you order, and the 50% balance is invoiced automatically when the work goes live. Retainers: billed monthly in advance; each new month starts with a new invoice. Invoices are due within 7 days and live in your client portal.`,
    { keywords: 'deposit balance invoice billing pay upfront 50% retainer monthly when due', link: '/terms' }));
  out.push(chunk('vat', 'pricing', 'Do your prices include VAT?',
    s.vat_registered ? `Prices exclude VAT. VAT at ${s.vat_rate}% is added to each invoice${s.vat_no ? ` (VAT no. ${s.vat_no})` : ''}.` : `Prices are in South African rand and Hipcastle is not currently charging VAT. If that changes, VAT will be shown separately on invoices.`,
    { keywords: 'vat tax inclusive exclusive 15%', link: '/pricing' }));
  out.push(chunk('cancel', 'pricing', 'Can I cancel? What is your refund policy?',
    `You can cancel an order free of charge before paying the deposit (Cancel order in your portal). Retainers can be cancelled with 30 days' written notice — message your team or open a support ticket. Deposits cover work already scheduled and are non-refundable once work has started, except where the Consumer Protection Act requires otherwise. If you were charged twice for the same invoice, we refund the duplicate.`,
    { keywords: 'cancel cancellation refund money back stop retainer notice terminate', link: '/terms' }));
  // ---------------------------------------------------------------- care plans (aftercare)
  const withCare = svc.filter((x) => x.care.length);
  const careMin = Math.min(...withCare.flatMap((x) => x.care.map((t) => t.price_cents)));
  out.push(chunk('care-overview', 'care', 'What happens after my project launches? Who maintains and hosts it?',
    `Every once-off project includes free post-launch support: ${SUPPORT_DAYS.essential} days on Essential, ${SUPPORT_DAYS.growth} days on Growth and ${SUPPORT_DAYS.enterprise} days on Enterprise packages (some packages list longer support). Hipcastle's team that built it fixes launch issues during that window.
After that, you can keep it looked after with a monthly care plan — every service has one, from ${rand(careMin)} per month (${vat}). Care plans cover maintenance, updates, hosting where relevant, a monthly allowance of hands-on time for changes, monitoring and a faster support response. A week before your free support ends we email you the matching plans, and you can add one any time from your client portal or the Care plans page.
Without a care plan, changes and fixes are quoted per job.
${CARE_TERMS.map((t) => `- ${t}`).join('\n')}`,
    { keywords: 'maintenance maintain hosting host updates after launch aftercare care plan support after website app keep running who handles retainer monthly fixes changes', link: '/care' }));
  out.push(chunk('care-hours', 'care', 'How do care plan hours work, and what if I need more?',
    `Each care plan includes hands-on time every month (for example ${withCare.find((x) => x.slug === 'engineering') ? withCare.find((x) => x.slug === 'engineering').care.map((t) => `${t.name} ${hoursLabel(t.care_minutes)}`).join(', ') : ''} for Website & App Care). Time is logged against your plan and visible in your client portal. Hours reset monthly and don't roll over. When the month's hours are used up we tell you; monitoring, backups and urgent outage fixes continue, and any other work is quoted first at ${rand(CARE_EXTRA_HOUR_CENTS)} per hour or scheduled for next month.`,
    { keywords: 'hours time allowance extra hours rollover roll over overage additional work rate per hour', link: '/care' }));
  out.push(chunk('care-hosting', 'care', 'Do you host websites and apps? How much does hosting cost?',
    `Yes. Hosting is included in Website & App Care: Essential Care (${rand(withCare.find((x) => x.slug === 'engineering')?.care[0]?.price_cents)} per month) includes South African hosting, an SSL certificate, weekly off-site backups, monthly updates and uptime monitoring; Growth Care adds faster SSD hosting with a CDN and daily backups; Enterprise Care includes load-shedding-resilient cloud hosting (cloud usage above R1 500 a month is passed on at cost). Game, XR and automation care plans also include hosting where listed. Hosting, domains and accounts are set up in your name, so you always own them. If you prefer your own hosting provider, we can maintain the site there.`,
    { keywords: 'hosting host server domain ssl cloud load-shedding uptime backups where hosted own my website', link: '/care' }));
  for (const x of withCare) {
    const c = CARE[x.slug];
    out.push(chunk(`care-${x.slug}`, 'care', `${c.title}: care plan for ${x.name} — what's included and how much?`,
      `${c.blurb}\nMonthly care plans for ${x.name} (${vat}, month-to-month):\n${x.care.map((t) =>
        `- ${t.name}: ${rand(t.price_cents)} per month, ${hoursLabel(t.care_minutes)} of hands-on time included, ${t.support_priority} support priority. ${t.summary} Includes: ${t.features.join('; ')}.${t.is_popular ? ' (Most popular)' : ''}`).join('\n')}`,
      { keywords: `${c.title} ${x.name} ${x.slug} care plan maintenance aftercare upkeep monthly after launch price cost`, link: `/care#${x.slug}` }));
  }

  out.push(chunk('revisions', 'delivery', 'How many revisions do I get?',
    `Deliverables that need your sign-off come with revision rounds: Essential 2, Growth 3, Enterprise unlimited (per deliverable). You approve or request changes in your portal. If you need more rounds than your package includes, your team will arrange it with you.`,
    { keywords: 'revisions changes edits rounds feedback approve', link: '/pricing' }));

  // ---------------------------------------------------------------- payments
  out.push(chunk('payments', 'payments', 'How can I pay?',
    `Pay online from your client portal: PayFast (card, instant EFT, SnapScan, Zapper and more) or Ozow (instant EFT from all major South African banks). Hipcastle never sees or stores your card or banking details. Prices are in rand (ZAR).`,
    { keywords: 'pay payment methods card visa mastercard eft instant eft payfast ozow snapscan zapper bank', link: '/pricing' }));
  out.push(chunk('payment-issues', 'payments', 'My payment failed or I cancelled it — what now?',
    `No money is taken for a failed or cancelled payment. Go back to your engagement in the portal and press Pay again, optionally with a different method. A new attempt can start once the previous one has finished (or after 30 minutes). If you were charged but the invoice still shows unpaid, open a support ticket with the payment reference and we'll reconcile it.`,
    { keywords: 'payment failed declined error cancelled charged twice double unpaid problem', link: '/portal' }));
  out.push(chunk('autopay', 'payments', 'Can retainers and care plans be paid automatically each month?',
    `Yes. When you pay a monthly invoice (retainer or care plan) with PayFast, tick "Pay automatically every month": your card is saved securely by PayFast (we never see it) and the same amount is charged each month, settling that month's invoice automatically — you still get the invoice and a receipt. You can stop automatic payments any time in your client portal; ending the engagement stops them too. Instant EFT (Ozow) and normal EFT are paid manually each month.`,
    { keywords: 'automatic monthly payment debit order recurring card subscription autopay stop cancel retainer care plan', link: '/portal' }));
  out.push(chunk('agreement', 'policies', 'Do I sign a contract or service agreement?',
    `For once-off packages from ${rand(Number(s.agreement_min_cents ?? 1500000))}${s.agreement_for_retainers ? ' and for monthly retainers' : ''}, you review and sign a short, plain-language service agreement in your client portal before the first payment — scope, fees, deliverable approvals, ownership of the work (yours once paid in full), confidentiality and POPIA, cancellation and liability. You sign electronically by typing your name (valid under the Electronic Communications and Transactions Act), and a copy is emailed to you. Smaller packages and care plans are covered by the terms you accept at checkout.`,
    { keywords: 'contract agreement sign signature terms legal scope ownership intellectual property ip ecta', link: '/terms' }));
  out.push(chunk('tax-invoice', 'pricing', 'Do I get a proper tax invoice?',
    `Yes. Every invoice can be viewed and printed (or saved as PDF) from your client portal${s.vat_registered ? ` as a full tax invoice showing our VAT number (${s.vat_no || 'on the invoice'}), your business details and the VAT charged` : ''}. Add your billing address and VAT number in Account settings so they appear on your invoices — SARS requires them on tax invoices over R5 000.`,
    { keywords: 'tax invoice vat invoice pdf print sars receipt billing address vat number', link: '/account' }));
  out.push(chunk('eft', 'payments', 'Can I pay by normal EFT?',
    `Instant EFT through PayFast or Ozow is fastest and confirms automatically. If you need to pay by normal EFT, contact us for banking details and send proof of payment; we'll mark the invoice paid once it clears.`,
    { keywords: 'eft bank transfer banking details proof of payment manual', link: '/contact' }));

  // ---------------------------------------------------------------- process & portal
  out.push(chunk('process', 'delivery', 'How does working with Hipcastle work, step by step?',
    `1) Free strategy session. 2) Choose a package (or get a recommendation). 3) Place your order and pay the deposit securely. 4) Complete onboarding in your portal (about 10 minutes). 5) Kick-off call; your timeline is re-planned from that date. 6) Your team works through the milestones; deliverables that need your sign-off are sent for approval. 7) Launch and handover, then post-launch support. Retainers repeat a monthly plan → work → report → review cycle.`,
    { keywords: 'how it works process steps start begin get started next order', link: '/services' }));
  out.push(chunk('portal', 'portal', 'What can I do in the client portal?',
    `Your portal shows each engagement's stage, health and next step; the onboarding form; every milestone with its owner, due date and deliverable links; approve or request changes; invoices and secure payment; payment history; messages with your team; support tickets; and a feedback form when the project is complete.`,
    { keywords: 'portal dashboard account track progress status milestones login', link: '/portal' }));
  out.push(chunk('account', 'portal', 'I forgot my password or want to secure my account',
    `Use "Forgot your password?" on the sign-in page to get a reset link (valid for 1 hour). Changing your password signs you out on every other device, and Account settings has a "Sign out of all other devices" button.`,
    { keywords: 'forgot password reset login sign in locked account security hacked', link: '/forgot-password' }));
  out.push(chunk('status-own', 'portal', 'Can you tell me the status of my order or invoice?',
    `For privacy, the chatbot can't see your account. Sign in to your client portal to see your engagement's stage, next milestone, invoices and payments — or open a support ticket and your team will reply.`,
    { keywords: 'my order status my invoice my project update where is progress account specific', link: '/portal' }));

  // ---------------------------------------------------------------- support & policies
  out.push(chunk('passwords', 'policies', 'How do I give you access to my website or accounts safely?',
    `${s.secure_share_hint || 'Never send passwords in messages.'} Our system automatically removes passwords, card numbers and ID numbers from messages, tickets, onboarding answers and chat, so please use an invitation (e.g. add hello@ as a user in WordPress, Google, Meta or your hosting) or a one-time password-manager link instead.`,
    { keywords: 'password login access credentials share safely security bitwarden 1password invite user admin account', link: '/privacy' }));
  out.push(chunk('support', 'support', 'How do I get help as a client?',
    `Open a support ticket from your client portal (Support). Target first-response times: urgent within 4 business hours, high within 1 business day, normal within 2 business days, low within 3 business days. You'll get an email when we reply, and you can rate the help you received once a ticket is resolved. You can also message your team on any engagement.`,
    { keywords: 'support help ticket problem issue bug complaint response time sla', link: '/portal/support' }));
  out.push(chunk('privacy', 'policies', 'How do you handle my personal information (POPIA)?',
    `Hipcastle processes personal information under South Africa's Protection of Personal Information Act (POPIA): only what's needed to respond to enquiries and deliver your project, never sold, protected with encrypted connections and access controls. You can request access, correction or deletion at ${s.email}. Chatbot conversations are stored to improve the service — please don't share sensitive information in chat.`,
    { keywords: 'privacy popia data personal information gdpr delete my data security', link: '/privacy' }));
  out.push(chunk('ip', 'policies', 'Who owns the work you create?',
    `Ownership of deliverables transfers to you once paid in full. We may show non-confidential work in our portfolio unless you ask us not to.`,
    { keywords: 'ownership intellectual property ip copyright own code design source files', link: '/terms' }));
  out.push(chunk('newsletter', 'support', 'How do I subscribe or unsubscribe from the newsletter?',
    `Enter your email in the website footer and click the confirmation link we send. Every newsletter email has a one-click unsubscribe link.`,
    { keywords: 'newsletter subscribe unsubscribe emails tips', link: '/blog' }));

  // ---------------------------------------------------------------- FAQs & guides
  generalFaqs().forEach((f, i) => out.push(chunk(`faq-${i}`, 'about', f.q, f.a, { keywords: f.q })));
  for (const p of rows(db.prepare(`SELECT slug, title, excerpt, category FROM posts WHERE status = 'published' AND published_at <= datetime('now') ORDER BY published_at DESC, id`).all())) {
    out.push(chunk(`post-${p.slug}`, 'guides', p.title, `${p.excerpt} Read the full guide: /blog/${p.slug}`, { keywords: `${p.title} ${p.category}`, link: `/blog/${p.slug}` }));
  }
  return out;
}

/** Plain-text knowledge base for the chatbot's system prompt. */
export function knowledgeText(chunks = buildChunks()) {
  return CATEGORIES.map(([key, label]) => {
    const list = chunks.filter((c) => c.category === key);
    return list.length ? `## ${label}\n\n${list.map((c) => `### ${c.title}\n${c.body}${c.link ? `\nLink: ${c.link}` : ''}`).join('\n\n')}` : '';
  }).filter(Boolean).join('\n\n');
}

export const knowledgeVersion = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

// ---------------------------------------------------------------- offline answer engine
const STOP = new Set('a an and are can do does for from have how i in is it me my of on or our please the to we what when where which who why will with you your about there this that'.split(' '));
const tokens = (t) => String(t).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
const stem = (w) => w.replace(/(ing|ers|er|es|s)$/, '');

/** Rank knowledge chunks for a question (keyword overlap with title/keyword boosts). */
export function search(question, chunks = buildChunks(), limit = 3) {
  const q = [...new Set(tokens(question).map(stem))];
  if (!q.length) return [];
  return chunks.map((c) => {
    const title = new Set(tokens(c.title).map(stem));
    const kw = new Set(tokens(c.keywords).map(stem));
    const body = new Set(tokens(c.body).map(stem));
    let score = 0;
    for (const w of q) score += (kw.has(w) ? 3 : 0) + (title.has(w) ? 2 : 0) + (body.has(w) ? 1 : 0);
    return { c, score: score / Math.sqrt(q.length) };
  }).filter((x) => x.score >= 1.5).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => ({ ...x.c, score: +x.score.toFixed(2) }));
}
