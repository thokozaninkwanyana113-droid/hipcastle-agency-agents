// Care plans: monthly aftercare, maintenance and hosting for what Hipcastle delivers.
//
// Every service has three care tiers. They are stored as service tiers with plan = 'care'
// (billing always monthly), so checkout, invoicing, payments and pipelines work unchanged.
//
// Pricing (ZAR, excl. VAT) is benchmarked against the South African market (Nov 2026):
//   • Website care / maintenance plans: ~R300–R800 / month for basic plans, ~R1 500+ for
//     managed hosting + maintenance.
//   • Local shared / managed WordPress hosting: ~R99–R360 / month.
//   • Small-agency hourly rates: ~R500–R1 500 / hour.
// Essential care is priced at the market's middle so a R6 500–R15 000 project can afford it;
// included hours work out at roughly R450–R800 an hour, below typical ad-hoc agency rates.

/** Extra hours beyond the plan's allowance (care clients). Always quoted before work starts. */
export const CARE_EXTRA_HOUR_CENTS = 65000;
/** First-response target used for care clients' tickets, by tier. */
export const CARE_PRIORITY = { essential: 'normal', growth: 'high', enterprise: 'urgent' };
export const CARE_TERMS = [
  'Month-to-month: no lock-in contract, cancel with 30 days’ notice.',
  'Billed monthly in advance; pay by card or instant EFT (PayFast or Ozow).',
  'Included hours reset every month and don’t roll over.',
  `Extra work is quoted first and billed at R ${(CARE_EXTRA_HOUR_CENTS / 100).toLocaleString('en-ZA').replace(/\s/g, ' ')} per hour.`,
  'Tickets from care clients jump the queue with a faster response target.',
];

const c = (rand, hours, summary, features, popular = false) => ({ price_cents: rand * 100, care_minutes: Math.round(hours * 60), summary, features, is_popular: popular });

/**
 * Per service: the plan's title, what "looking after it" means, the three tiers and the monthly
 * tasks that appear in the client's pipeline (title, tiers subset).
 */
export const CARE = {
  engineering: {
    title: 'Website & App Care', blurb: 'Hosting, updates, backups and fixes for your website, online store or app — so it stays fast, secure and selling.',
    tiers: [
      c(595, 0.5, 'Hosting and peace of mind for a business website.',
        ['South African hosting & SSL certificate', 'Weekly off-site backups', 'Monthly core, plugin & security updates', 'Uptime monitoring with alerts', '30 min of content changes', 'Domain renewal reminders']),
      c(1450, 2, 'Managed care for online stores and web apps.',
        ['Fast SSD hosting with CDN', 'Daily backups (30-day history)', 'Updates tested on staging first', 'Uptime, error & checkout monitoring', 'Monthly speed & security scan', '2 hours of changes'], true),
      c(3950, 6, 'Business-critical systems with urgent response.',
        ['Load-shedding-resilient cloud hosting (up to R1 500/month usage included, the rest at cost)', 'Daily backups & quarterly restore drill', 'Staging site & dependency upgrades', 'Quarterly security review', '6 hours of changes or small features', 'Monthly health report']),
    ],
    tasks: [['Updates, backups & security checks', ''], ['Content changes & fixes', ''], ['Speed & security scan', 'gx']],
  },
  design: {
    title: 'Brand Care', blurb: 'Keep your brand consistent as you grow: quick artwork changes, fresh templates and print-ready files.',
    tiers: [
      c(450, 1, 'Small design changes without paying per job.',
        ['1 hour of design changes (price lists, flyers, resizes)', 'Brand asset library kept organised & shareable', 'Print & social file conversions', 'Brand guideline questions answered']),
      c(1250, 3, 'A part-time designer for growing brands.',
        ['3 hours of design work', 'Quarterly refresh of social media templates', 'Print-ready checks with your printer', 'Same-week turnaround'], true),
      c(3500, 8, 'Brand guardianship for busy marketing teams.',
        ['8 hours of design work', 'Brand review of all new material', 'Campaign & event artwork', 'Quarterly brand consistency audit']),
    ],
    tasks: [['Design requests & file updates', ''], ['Template refresh', 'gx']],
  },
  marketing: {
    title: 'Visibility Care', blurb: 'Stay findable on Google after your campaign or retainer ends — without paying for a full marketing team.',
    tiers: [
      c(495, 0.5, 'Keep your Google presence accurate and responsive.',
        ['Google Business Profile kept current (hours, photos, offers)', 'Replies to Google reviews within 2 business days', 'Monthly SEO health scan', 'Broken link & 404 checks']),
      c(1250, 1.5, 'Hold and slowly grow your rankings.',
        ['Everything in Essential', '2 Google Business Profile posts per month', 'Ranking tracker (20 keywords)', 'Monthly search performance summary', '1.5 hours of SEO fixes'], true),
      c(2950, 4, 'Protect high-value rankings and reputation.',
        ['4 hours of technical & on-page SEO fixes', 'Ranking tracker (100 keywords) & AI-search visibility checks', 'Review & reputation monitoring', 'Quarterly SEO strategy call']),
    ],
    tasks: [['Google Business Profile & reviews', ''], ['SEO health scan & fixes', '']],
  },
  'paid-media': {
    title: 'Ad Account Care', blurb: 'A specialist keeps an eye on your ad accounts and tracking so you don’t waste budget. Ad spend is paid directly to Google/Meta/TikTok.',
    tiers: [
      c(450, 0.5, 'A monthly safety check for self-managed ads.',
        ['Monthly ad account health check', 'Pixel, Conversions API & tag checks', 'Billing & policy-issue alerts', 'Ad spend not included']),
      c(1150, 1.5, 'Regular checks for steady campaigns.',
        ['Fortnightly health & budget pacing checks', 'Conversion tracking audit', 'Creative refresh suggestions', 'Monthly spend & results summary'], true),
      c(2750, 4, 'Close watch on larger budgets.',
        ['Weekly health & pacing checks', 'Landing page & funnel tracking QA', '4 hours of optimisation', 'Urgent help with disapproved ads or restricted accounts']),
    ],
    tasks: [['Account health & tracking checks', ''], ['Budget pacing review', 'gx']],
  },
  sales: {
    title: 'Tender & Sales Care', blurb: 'Never miss a tender because a certificate expired: compliance documents, CSD and bid packs kept current.',
    tiers: [
      c(450, 1, 'Compliance documents always ready.',
        ['Tracking of tax clearance PIN, B-BBEE affidavit/certificate, CSD registration & CIPC annual return', 'Expiry reminders 30 days ahead', 'Monthly CRM hygiene check', '1 hour of document updates']),
      c(1250, 3, 'Find and prepare for more tenders.',
        ['Everything in Essential', 'Weekly eTenders & provincial portal scan for your sector', 'Company profile & capability statement kept current', '3 hours of bid-document updates'], true),
      c(2950, 6, 'Ongoing bid support.',
        ['6 hours of bid support', 'Tender go/no-go reviews', 'Pricing schedule checks', 'Urgent turnaround before closing dates']),
    ],
    tasks: [['Compliance document check & reminders', ''], ['Tender scan & bid updates', 'gx']],
  },
  product: {
    title: 'Product Care', blurb: 'Keep your roadmap, backlog and product analytics in shape after launch.',
    tiers: [
      c(650, 1, 'A monthly product check-in.',
        ['1-hour roadmap & backlog check-in', 'Product analytics dashboard kept working', 'Feedback inbox triage']),
      c(1650, 3, 'Part-time product management.',
        ['Fortnightly backlog grooming', 'Monthly product metrics review', 'User feedback synthesis', '3 hours of product work'], true),
      c(3950, 8, 'Product leadership on call.',
        ['Weekly product check-ins', 'Quarterly roadmap refresh', 'Release notes & changelog', '8 hours of product work']),
    ],
    tasks: [['Backlog & roadmap check-in', ''], ['Product metrics review', 'gx']],
  },
  'project-management': {
    title: 'Workspace Care', blurb: 'Your project tools, templates and reporting kept tidy and working.',
    tiers: [
      c(450, 1, 'Keep your project workspace tidy.',
        ['Project tool workspace upkeep (Trello, Asana, Monday, Jira)', 'Templates & automations maintained', 'Monthly check-in']),
      c(1150, 3, 'Light ongoing project support.',
        ['Fortnightly status reports', 'Risk & dependency log upkeep', '3 hours of project support'], true),
      c(2750, 6, 'A project manager on call.',
        ['Weekly status & stakeholder updates', '6 hours of project support', 'Urgent escalation support']),
    ],
    tasks: [['Workspace & automation upkeep', ''], ['Status report', 'gx']],
  },
  testing: {
    title: 'Quality Care', blurb: 'Catch broken checkouts and forms before your customers do — testing after every update.',
    tiers: [
      c(650, 1, 'A monthly check of the journeys that make you money.',
        ['Monthly smoke test of key journeys (sign-up, checkout, forms)', 'Bug report with screenshots', 'Mobile & browser spot checks']),
      c(1650, 3, 'Regression testing for active products.',
        ['Regression test after every update', 'Automated test suite kept passing', 'Real-device checks (Android & iPhone)', '3 hours of QA'], true),
      c(3950, 8, 'Release sign-off for frequent deployments.',
        ['Sign-off for every release', 'Monthly performance check', 'Accessibility re-test', '8 hours of QA']),
    ],
    tasks: [['Smoke & regression testing', ''], ['Test suite upkeep', 'gx']],
  },
  support: {
    title: 'Operations Care', blurb: 'Your help desk, knowledge base and POPIA basics kept current after setup.',
    tiers: [
      c(395, 1, 'Keep your answers and templates up to date.',
        ['Knowledge base & reply templates kept current', 'Price list & FAQ updates', 'Annual POPIA checklist reminder']),
      c(995, 2.5, 'Keep the tools and routing working.',
        ['Monthly help desk & WhatsApp Business setup check', 'Automations & routing rules maintained', 'Quarterly POPIA check-up', '2.5 hours of support'], true),
      c(2450, 6, 'Operations upkeep for larger teams.',
        ['Process & SOP upkeep', 'Systems access reviews for joiners and leavers', '6 hours of operations support']),
    ],
    tasks: [['Knowledge base & templates update', ''], ['Tools & POPIA check', 'gx']],
  },
  'game-development': {
    title: 'Live Game Care', blurb: 'Keep your game running on new OS versions, with crash monitoring and store upkeep.',
    tiers: [
      c(1250, 1.5, 'Keep a released game healthy.',
        ['Crash & store review monitoring', 'Store listing upkeep', 'OS & SDK compatibility checks', '1.5 hours of fixes']),
      c(3250, 4, 'Regular updates for an active player base.',
        ['Game backend monitoring', 'Monthly compatibility update build', 'Analytics & retention summary', '4 hours of updates'], true),
      c(7950, 10, 'Live operations support.',
        ['Live-ops event support', 'Backend hosting up to R2 000/month included', '10 hours of updates', 'Urgent response for outages']),
    ],
    tasks: [['Crash monitoring & compatibility checks', ''], ['Update build', 'gx']],
  },
  'spatial-computing': {
    title: 'XR Experience Care', blurb: 'Keep your AR/VR experience working on new headsets and OS updates, with hosting included.',
    tiers: [
      c(1450, 1.5, 'Keep an experience live and compatible.',
        ['Headset & OS update compatibility checks', 'Hosting of your WebXR experience', '1.5 hours of content swaps or fixes']),
      c(3650, 4, 'Regular updates and analytics.',
        ['Monthly update build', 'Usage analytics summary', '4 hours of updates'], true),
      c(8950, 10, 'For installations and device fleets.',
        ['Device fleet checks', 'On-site support visits quoted separately', '10 hours of updates', 'Urgent response for event days']),
    ],
    tasks: [['Compatibility checks & hosting', ''], ['Update build', 'gx']],
  },
  academic: {
    title: 'Insights Care', blurb: 'Keep your research current: market watch, refreshed statistics and quick follow-up analysis.',
    tiers: [
      c(450, 1, 'A monthly market & competitor watch.',
        ['Monthly market & competitor brief', 'Key statistics refreshed from new Stats SA releases', '1 hour of follow-up questions']),
      c(1250, 3, 'Living research for ongoing decisions.',
        ['Dashboard data refresh', 'Quarterly customer pulse survey', '3 hours of analysis'], true),
      c(2950, 6, 'An insights analyst on call.',
        ['Monthly insights report', 'Ad-hoc research requests', '6 hours of analysis']),
    ],
    tasks: [['Market watch & data refresh', ''], ['Analysis requests', 'gx']],
  },
  specialized: {
    title: 'Systems & Automation Care', blurb: 'Automations and integrations break when apps change — we monitor them and fix them fast.',
    tiers: [
      c(750, 1, 'Monitoring and fixes for your automations.',
        ['Automation & integration monitoring (e.g. Zapier, WhatsApp, Xero)', 'Fixes when a connected app changes', 'Monthly run-log check']),
      c(1850, 3, 'Proactive care for business-critical flows.',
        ['Daily failure alerts', 'Token & credential renewals', '3 hours of changes'], true),
      c(4450, 8, 'Systems care with urgent response.',
        ['Automation hosting up to R1 000/month included', 'Quarterly security & access review', '8 hours of changes']),
    ],
    tasks: [['Automation monitoring & fixes', ''], ['Access & credential review', 'gx']],
  },
  strategy: {
    title: 'Strategy Care', blurb: 'Keep your strategy alive after the plan is delivered: monthly check-ins and KPI tracking.',
    tiers: [
      c(650, 1, 'A monthly strategy check-in.',
        ['1-hour monthly strategy check-in', 'KPI dashboard kept current', 'Quarterly plan review']),
      c(1650, 3, 'Ongoing strategic support.',
        ['Monthly KPI review & action list', 'Quarterly strategy session', '3 hours of advisory work'], true),
      c(3950, 8, 'An advisor on call.',
        ['Fortnightly advisory sessions', 'Board & investor update support', '8 hours of advisory work']),
    ],
    tasks: [['Strategy check-in & KPI update', ''], ['Quarterly review prep', 'gx']],
  },
};

export const careTitle = (slug) => CARE[slug]?.title || 'Care plan';
export const hoursLabel = (minutes = 0) => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 30) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  const h = minutes / 60;
  return `${h} hour${h === 1 ? '' : 's'}`;
};
