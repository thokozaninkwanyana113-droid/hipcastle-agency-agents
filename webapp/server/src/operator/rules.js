// The Operator without AI: deterministic best-practice checks over the snapshot. Always available,
// free, and the fallback if the AI call fails. Drafts are templated; the AI writes bespoke ones.
import { db, row } from '../db.js';
import { getSettings } from '../settings.js';
import { propose } from './actions.js';
import { catalogBrief } from './snapshot.js';

const first = (n = '') => n.trim().split(/\s+/)[0] || 'there';
const R = (n) => `R${Number(n).toLocaleString('en-ZA').replace(/\s/g, ' ')}`;

export function runRules(snap, runId) {
  const s = getSettings();
  const made = [];
  const add = (kind, input) => { const r = propose(kind, input, { runId }); if (r.ok) made.push({ kind, title: input.title }); };
  const booking = s.booking_url ? `You can pick a time that suits you here: ${s.booking_url}` : `Just reply with two times that suit you this week.`;

  // SALES — speed to lead
  for (const l of snap.sales.waiting_over_a_day) {
    const svc = l.service ? ` about ${l.service}` : '';
    add('email', { area: 'sales', priority: 1, title: `Reply to ${l.name}${l.company ? ` (${l.company})` : ''}`,
      rationale: `Enquiry${svc} has waited since ${l.created_at}. Replies within a day convert far better.`,
      payload: { recipient_type: 'lead', recipient_id: l.id, subject: `Your enquiry${svc}`,
        body: `Hi ${first(l.name)},\n\nThanks for reaching out to ${s.business_name}${svc}. I'd love to understand what you're aiming for and suggest the right package — our prices are fixed and published, so there are no surprises.\n\nCould we do a free 30-minute call? ${booking}\n\nKind regards,\nThe ${s.business_name} team` } });
  }
  for (const o of snap.sales.unpaid_new_orders.filter((x) => Date.parse(`${x.created_at.replace(' ', 'T')}Z`) < Date.now() - 2 * 864e5)) {
    add('call', { area: 'sales', priority: 2, title: `Call ${o.client} about ${o.reference}`,
      rationale: `${o.service} (${o.tier}, R${o.price_rand}) ordered on ${o.created_at.slice(0, 10)} but not paid. A short call usually unblocks it (questions about scope, agreement or payment).`,
      payload: { who: o.client, talking_points: ['Any questions about scope or the agreement?', 'Payment options: card, instant EFT, SnapScan; 50% deposit for projects', 'Offer to book the kick-off as soon as it’s paid'] } });
  }
  // FINANCE
  for (const i of snap.finance.overdue) {
    add('call', { area: 'finance', priority: 1, title: `Follow up overdue ${i.number} (${i.client})`,
      rationale: `R${i.amount_rand} was due ${i.due_at}. Cash flow is the first thing to protect.`,
      payload: { who: i.client, talking_points: [`Invoice ${i.number}, R${i.amount_rand}, due ${i.due_at}`, 'Offer to resend the payment link; ask if anything is blocking payment', 'For retainers, suggest automatic monthly card payments'] } });
  }
  // DELIVERY & SUPPORT
  if (snap.delivery.overdue_milestones.length) {
    add('task', { area: 'delivery', priority: 1, title: `Unblock ${snap.delivery.overdue_milestones.length} overdue milestone(s)`,
      rationale: 'Late milestones are the biggest risk to reviews and referrals.',
      payload: { details: snap.delivery.overdue_milestones.map((m) => `${m.reference}: ${m.title} (due ${m.due_date})`).join('\n') } });
  }
  if (snap.support.past_target) {
    add('task', { area: 'support', priority: 1, title: `Reply to ${snap.support.past_target} support ticket(s) past target`, rationale: 'Missed response targets hurt satisfaction scores.', payload: { details: 'Open Command Centre → Support desk, filter “open”, and reply to the oldest first.' } });
  }
  // RETENTION
  for (const d of snap.retention.detractors_30d) {
    add('call', { area: 'retention', priority: 1, title: `Call ${d.client} — rated ${d.reference} ${d.nps_score}/10`,
      rationale: `Unhappy clients told quickly that we care often become loyal. Comment: “${(d.nps_comment || 'none').slice(0, 160)}”.`,
      payload: { who: d.client, talking_points: ['Thank them for the honest feedback', 'Ask what went wrong and what would make it right', 'Agree a concrete fix and a date'] } });
  }
  for (const p of snap.retention.promoters_without_review.slice(0, 3)) {
    add('email', { area: 'retention', priority: 2, title: `Ask ${p.client} for a review`,
      rationale: `They rated ${p.reference} 9–10 but haven’t left a public review. Reviews are our biggest growth lever right now.`,
      payload: { recipient_type: 'client', recipient_id: p.client_id, subject: 'Would you share a few words about working with us?',
        body: `Hi ${first(p.client)},\n\nThank you again for the great rating on ${p.reference} — it made our week. Would you mind sharing a sentence or two publicly? It genuinely helps other South African business owners decide.\n\nYou can leave it here: ${'/testimonials'} (or on Google if you prefer).\n\nThank you!\nThe ${s.business_name} team` } });
  }
  // MARKETING
  if (snap.marketing.unanswered_chat_questions.length) {
    add('task', { area: 'marketing', priority: 2, title: 'Answer the questions visitors asked that we couldn’t',
      rationale: 'Each answered question improves the assistant, the Help Centre and AI-search visibility.',
      payload: { details: `Add these to an FAQ, service page or blog post:\n- ${snap.marketing.unanswered_chat_questions.slice(0, 6).join('\n- ')}` } });
  }
  if (snap.marketing.days_since_last_post === null || snap.marketing.days_since_last_post > 14) {
    const svc = catalogBrief()[0];
    add('task', { area: 'marketing', priority: 3, title: 'Publish a new guide this week',
      rationale: `It has been ${snap.marketing.days_since_last_post ?? 'a long time'} days since the last article. Fresh, question-led guides build Google and AI-search traffic.`,
      payload: { details: `Suggested topic: “How much does ${svc.name.toLowerCase()} cost in South Africa in ${new Date().getFullYear()}?” — answer first, use our published prices, link to /services/${svc.slug}.` } });
  }
  if (snap.weekday === 'Monday') {
    const svc = catalogBrief()[0];
    const from = svc.packages.find((p) => p.plan === 'core');
    add('social_posts', { area: 'marketing', priority: 3, title: `Social posts for the week of ${snap.today}`,
      rationale: 'Consistent posting keeps the brand visible; each post links to a tracked page.',
      payload: { posts: [
        { platform: 'linkedin', text: `South African businesses: ${svc.name.toLowerCase()} from ${R(from.price_rand)} with a fixed, published price — no surprise quotes. See what's included.`, link_path: `/services/${svc.slug}?utm_source=linkedin&utm_medium=social` },
        { platform: 'facebook', text: `Your website shouldn't stop working when the developer disappears. Our care plans cover hosting, updates and fixes from ${R(Math.min(...catalogBrief().flatMap((x) => x.packages.filter((p) => p.plan === 'care').map((p) => p.price_rand))))} a month.`, link_path: '/care?utm_source=facebook&utm_medium=social' },
        { platform: 'whatsapp_status', text: 'Free 30-minute strategy session this week — tell us your goal and get a fixed rand price for it.', link_path: '/contact?utm_source=whatsapp&utm_medium=status' },
      ] } });
  }
  // ADVERTISING — only when a budget has been set
  if (Number(s.operator_monthly_ad_budget) >= 600 && !snap.marketing.top_sources.some((x) => /\/ paid$/.test(x.source))) {
    const svc = catalogBrief().find((x) => x.slug === 'engineering') || catalogBrief()[0];
    const from = svc.packages.find((p) => p.plan === 'core');
    add('ad_campaign', { area: 'advertising', priority: 2, title: `Google Search test: ${svc.name}`,
      rationale: `No paid traffic yet. A 14-day search test within the R${s.operator_monthly_ad_budget}/month budget shows the real cost per enquiry before spending more.`,
      payload: { platform: 'google_search', service_slug: svc.slug, objective: 'Enquiries (contact form or booked call)', audience: 'South Africa; searches with buying intent',
        daily_budget_rand: Math.max(20, Math.floor(Number(s.operator_monthly_ad_budget) / 30)), duration_days: 14,
        headlines: [`${svc.name} from ${R(from.price_rand)}`, 'Fixed Rand Prices, No Surprises', 'Free 30-Min Strategy Call'], descriptions: [`${svc.tagline} Pay by card or instant EFT. Track every milestone online.`],
        keywords: [`${svc.name.toLowerCase()} south africa`, `${svc.name.toLowerCase()} price`, `${svc.name.toLowerCase()} johannesburg`],
        landing_path: `/services/${svc.slug}`, success_metric: 'Cost per enquiry under R500; at least 3 enquiries in 14 days' } });
  }
  return made;
}

/** Plain-language brief from the snapshot (rules mode). */
export function rulesBrief(snap, made) {
  const lines = [
    `## Good morning — ${snap.weekday} ${snap.today}`, '',
    `**Money:** R${snap.finance.revenue_30d_rand.toLocaleString('en-ZA')} collected in 30 days · R${snap.finance.monthly_recurring_rand.toLocaleString('en-ZA')} monthly recurring · R${snap.finance.outstanding_rand.toLocaleString('en-ZA')} outstanding${snap.finance.overdue.length ? ` (**${snap.finance.overdue.length} overdue**)` : ''}.`,
    `**Sales:** ${snap.sales.new_leads} new enquir${snap.sales.new_leads === 1 ? 'y' : 'ies'}${snap.sales.waiting_over_a_day.length ? ` — **${snap.sales.waiting_over_a_day.length} waiting more than a day**` : ''} · ${snap.sales.unpaid_new_orders.length} unpaid order(s).`,
    `**Delivery:** ${snap.delivery.active_projects} active project(s), ${snap.delivery.active_retainers} retainer(s)${snap.delivery.overdue_milestones.length ? ` — **${snap.delivery.overdue_milestones.length} overdue milestone(s)**` : ''}; ${snap.delivery.waiting_on_clients} item(s) waiting on clients.`,
    `**Support:** ${snap.support.open_tickets} open ticket(s)${snap.support.past_target ? ` — **${snap.support.past_target} past target**` : ''}.`,
    `**Marketing:** ${snap.marketing.visitors_30d} visitors and ${snap.marketing.leads_from_web_30d} leads in 30 days; ${snap.marketing.published_posts} published guides.`, '',
    made.length ? `### I've prepared ${made.length} action(s) for you` : '### Nothing urgent today', '',
    ...made.map((m) => `- ${m.title}`),
    '', 'Rules mode: add an ANTHROPIC_API_KEY for bespoke drafts, campaign ideas and deeper analysis.',
  ];
  return lines.join('\n');
}
