// Delivery playbooks: how every Hipcastle service is onboarded and delivered.
//
// Each service defines
//   intake      – questions the client answers during onboarding
//   checklist   – access & assets the client provides (never passwords — invites only)
//   project     – milestones for once-off tiers (billing 'once')
//   setup/cycle – milestones for retainers (billing 'monthly'): setup runs once, the cycle repeats monthly
//
// Milestone fields
//   key       unique per pipeline           stage     onboarding|discovery|strategy|production|review|launch|handover|setup|cycle
//   title     shown to client & team        agent     owner specialist (agent slug from this repository)
//   days      planned working duration      deliverable  what the client receives (optional)
//   approval  client must approve           client    the client completes it (e.g. questionnaire)
//   tiers     'e','g','x' subset (default all) for essential / growth / enterprise

import { CARE } from './care.js';

export const STAGES = {
  onboarding: { label: 'Onboarding', order: 1 },
  discovery: { label: 'Discovery', order: 2 },
  strategy: { label: 'Strategy & design', order: 3 },
  setup: { label: 'Setup', order: 3 },
  production: { label: 'Build & production', order: 4 },
  cycle: { label: 'Monthly cycle', order: 4 },
  review: { label: 'Quality review', order: 5 },
  launch: { label: 'Launch', order: 6 },
  handover: { label: 'Handover & support', order: 7 },
};

export const TIER_KEY = { essential: 'e', growth: 'g', enterprise: 'x' };
/** Client revision rounds included per deliverable (null = unlimited). */
export const REVISIONS = { essential: 2, growth: 3, enterprise: null };
/** Post-launch support days for once-off projects. */
export const SUPPORT_DAYS = { essential: 14, growth: 30, enterprise: 60 };

const m = (stage, key, title, agent, days, opts = {}) => ({ stage, key, title, agent, days, ...opts });

// ---------------------------------------------------------------- shared steps
const COMMON_INTAKE = [
  { key: 'business', label: 'Describe your business: what you sell, to whom, and where (towns/provinces).', type: 'textarea', required: true },
  { key: 'goals', label: 'What does success look like in 3 months? Give measurable goals if you can (e.g. 30 leads/month).', type: 'textarea', required: true },
  { key: 'deadline', label: 'Any hard deadlines or launch dates?', type: 'text' },
  { key: 'decision_maker', label: 'Who approves deliverables on your side? (name, role, email/WhatsApp)', type: 'text', required: true },
  { key: 'competitors', label: 'List 2–3 competitors or businesses you admire, with links.', type: 'textarea' },
];
const COMMON_CHECKLIST = [
  { key: 'brand_assets', label: 'Share your logo, brand colours and existing marketing material (shared folder link).', kind: 'asset' },
  { key: 'kickoff_slot', label: 'Suggest two times for the kick-off call (we use Google Meet, Teams or WhatsApp).', kind: 'meeting', required: true },
];

const onboarding = () => [
  m('onboarding', 'intake', 'Complete the onboarding questionnaire', null, 2, { client: true }),
  m('onboarding', 'kickoff', 'Kick-off call & scope confirmation', 'project-manager-senior', 2, { deliverable: 'Kick-off notes, confirmed scope and timeline' }),
  m('onboarding', 'access', 'Access & assets received', 'project-management-project-shepherd', 1),
];
const projectClose = () => [
  m('handover', 'handover', 'Handover & training', 'project-manager-senior', 2, { approval: true, deliverable: 'Handover pack, ownership transfer and walkthrough recording' }),
  m('handover', 'support', 'Post-launch support window', 'support-support-responder', 'support'),
];
const monthlyCycle = (work, report = 'support-analytics-reporter') => [
  m('cycle', 'plan', 'Monthly plan agreed', 'project-manager-senior', 3, { approval: true, deliverable: 'Plan for the month with priorities and KPIs' }),
  ...work,
  m('cycle', 'report', 'Monthly performance report', report, 3, { deliverable: 'KPI report with insights and next steps' }),
  m('cycle', 'review', 'Monthly review call', 'project-manager-senior', 1, { approval: true }),
];

// ---------------------------------------------------------------- services
export const PLAYBOOKS = {
  engineering: {
    summary: 'Discovery → architecture & design → build sprints → QA → launch → handover.',
    intake: [
      { key: 'eng_type', label: 'What are we building?', type: 'select', options: ['Business website', 'Online store', 'Web app / portal', 'Mobile app', 'Integration / automation', 'Other'], required: true },
      { key: 'eng_features', label: 'List the must-have features or pages.', type: 'textarea', required: true },
      { key: 'eng_payments', label: 'Do you need online payments? Which (PayFast, Ozow, Yoco, other)?', type: 'text' },
      { key: 'eng_existing', label: 'Existing website/app URL and where it is hosted (if any).', type: 'text' },
    ],
    checklist: [
      { key: 'domain', label: 'Domain registrar access — invite us as a delegate (do not share passwords).', kind: 'access' },
      { key: 'hosting', label: 'Hosting / cloud account access (or let us set up a new account in your name).', kind: 'access' },
      { key: 'content', label: 'Page copy, product data and images (shared folder link).', kind: 'asset' },
    ],
    project: [
      m('discovery', 'requirements', 'Requirements & user stories', 'product-manager', 3, { deliverable: 'Prioritised feature list with acceptance criteria', approval: true, tiers: 'gx' }),
      m('strategy', 'architecture', 'Architecture & technical plan', 'engineering-software-architect', 3, { deliverable: 'Architecture decision record and data model', tiers: 'gx' }),
      m('strategy', 'design', 'Wireframes & UI design', 'design-ui-designer', 4, { deliverable: 'Clickable design for key screens', approval: true }),
      m('production', 'build1', 'Build sprint 1 — core features', 'engineering-senior-developer', 7, { deliverable: 'Staging link with core features' }),
      m('production', 'payments', 'Payments & integrations', 'engineering-backend-architect', 4, { tiers: 'gx', deliverable: 'PayFast/Ozow checkout working on staging' }),
      m('production', 'build2', 'Build sprint 2 — remaining features & content', 'engineering-frontend-developer', 7, { tiers: 'gx', deliverable: 'Feature-complete staging site', approval: true }),
      m('review', 'qa', 'QA, performance & accessibility testing', 'testing-reality-checker', 3, { deliverable: 'Test evidence report (devices, speed, accessibility)' }),
      m('review', 'security', 'Security & POPIA review', 'engineering-security-engineer', 2, { tiers: 'gx', deliverable: 'Security checklist and fixes' }),
      m('launch', 'launch', 'Go-live, DNS & monitoring', 'engineering-devops-automator', 1, { deliverable: 'Live site with SSL, backups and uptime monitoring', approval: true }),
      ...projectClose(),
    ],
    setup: [
      m('setup', 'audit', 'Codebase & infrastructure audit', 'engineering-software-architect', 4, { deliverable: 'Audit report and 90-day technical roadmap', approval: true }),
      m('setup', 'pod', 'Pod assembly & tooling (repo, CI/CD, boards)', 'engineering-devops-automator', 3),
    ],
    cycle: monthlyCycle([
      m('cycle', 'sprints', 'Development sprints & weekly releases', 'engineering-senior-developer', 18, { deliverable: 'Release notes for shipped work' }),
      m('cycle', 'ops', 'Uptime, security patches & incident response', 'engineering-sre', 4),
    ]),
  },

  design: {
    summary: 'Brand discovery → concepts → refinement → final files & guidelines.',
    intake: [
      { key: 'des_scope', label: 'What do you need?', type: 'select', options: ['New logo & brand identity', 'Brand refresh', 'Website / app UI', 'Marketing & social design', 'Other'], required: true },
      { key: 'des_personality', label: 'Describe your brand personality in 3–5 words.', type: 'text', required: true },
      { key: 'des_likes', label: 'Brands or designs you like and dislike (with links), and why.', type: 'textarea' },
      { key: 'des_audience', label: 'Who is your ideal customer? (age, location, income, language)', type: 'textarea' },
    ],
    checklist: [
      { key: 'existing_brand', label: 'Existing logo files and any brand guidelines (shared folder link).', kind: 'asset' },
    ],
    project: [
      m('discovery', 'research', 'Brand & audience research', 'design-ux-researcher', 3, { deliverable: 'Moodboard, audience insights and positioning', approval: true }),
      m('strategy', 'concepts', 'Design concepts', 'design-brand-guardian', 5, { deliverable: '2–3 concept directions', approval: true }),
      m('production', 'refine', 'Refinement of chosen concept', 'design-ui-designer', 4, { deliverable: 'Refined design', approval: true }),
      m('production', 'screens', 'High-fidelity screens & prototype', 'design-ux-architect', 7, { tiers: 'gx', deliverable: 'Clickable prototype', approval: true }),
      m('production', 'system', 'Brand guidelines & component library', 'design-brand-guardian', 4, { tiers: 'gx', deliverable: 'Brand guidelines PDF and component library' }),
      m('review', 'a11y', 'Accessibility & inclusivity check', 'design-inclusive-visuals-specialist', 2, { tiers: 'gx' }),
      m('launch', 'files', 'Final files exported', 'design-visual-storyteller', 2, { deliverable: 'Logo pack (SVG/PNG/PDF), social kit and source files', approval: true }),
      ...projectClose(),
    ],
    setup: [m('setup', 'system_audit', 'Design system audit', 'design-ux-architect', 5, { deliverable: 'Design system gaps and roadmap', approval: true })],
    cycle: monthlyCycle([
      m('cycle', 'requests', 'Design requests & sprints', 'design-ui-designer', 18, { deliverable: 'Delivered design requests' }),
      m('cycle', 'research', 'UX research & accessibility audits', 'design-ux-researcher', 4),
    ], 'design-ux-researcher'),
  },

  marketing: {
    summary: 'Audit → strategy & content calendar → monthly production, SEO & reporting.',
    intake: [
      { key: 'mkt_channels', label: 'Which channels do you use today, and which should we focus on?', type: 'textarea', required: true },
      { key: 'mkt_offers', label: 'Your top products/services and current promotions.', type: 'textarea', required: true },
      { key: 'mkt_voice', label: 'Tone of voice and languages (e.g. English, isiZulu, Afrikaans).', type: 'text' },
      { key: 'mkt_areas', label: 'Which towns or regions should we target for local SEO?', type: 'text' },
    ],
    checklist: [
      { key: 'social_access', label: 'Add us to Meta Business Suite / LinkedIn page / TikTok as a partner (no passwords).', kind: 'access', required: true },
      { key: 'gbp', label: 'Invite us as a manager on your Google Business Profile.', kind: 'access' },
      { key: 'analytics', label: 'Google Analytics & Search Console access.', kind: 'access' },
      { key: 'whatsapp', label: 'WhatsApp Business number and catalogue status.', kind: 'asset' },
    ],
    project: [
      m('discovery', 'audit', 'Marketing & SEO audit', 'marketing-seo-specialist', 4, { deliverable: 'Audit of channels, SEO and competitors', approval: true }),
      m('strategy', 'strategy', 'Growth strategy & content calendar', 'marketing-growth-hacker', 4, { deliverable: '90-day strategy and content calendar', approval: true }),
      m('production', 'content', 'Content production', 'marketing-content-creator', 6, { deliverable: 'First batch of posts and articles', approval: true }),
      m('launch', 'publish', 'Publish & optimise', 'marketing-social-media-strategist', 3),
      ...projectClose(),
    ],
    setup: [
      m('setup', 'audit', 'Marketing, SEO & AI-search audit', 'marketing-seo-specialist', 4, { deliverable: 'Audit and quick wins', approval: true }),
      m('setup', 'calendar', 'Strategy & content calendar', 'marketing-social-media-strategist', 3, { deliverable: 'Content calendar for month 1', approval: true }),
      m('setup', 'gbp', 'Google Business Profile & tracking setup', 'paid-media-tracking-specialist', 2, { tiers: 'gx' }),
    ],
    cycle: monthlyCycle([
      m('cycle', 'content', 'Content creation & approval', 'marketing-content-creator', 6, { deliverable: 'Posts, articles and creatives for the month', approval: true }),
      m('cycle', 'publish', 'Publishing, community & WhatsApp campaigns', 'marketing-social-media-strategist', 12),
      m('cycle', 'seo', 'SEO & AI-search optimisation', 'marketing-ai-citation-strategist', 6, { tiers: 'gx' }),
      m('cycle', 'experiments', 'Growth experiments', 'marketing-growth-hacker', 6, { tiers: 'x' }),
    ]),
  },

  'paid-media': {
    summary: 'Account & tracking audit → campaign build → launch → weekly optimisation & monthly reports.',
    intake: [
      { key: 'ads_platforms', label: 'Which ad platforms (Google, Meta, TikTok, LinkedIn) and monthly ad budget in rand?', type: 'textarea', required: true },
      { key: 'ads_goal', label: 'Primary goal: leads, sales, WhatsApp chats, app installs or awareness? Target cost per result?', type: 'textarea', required: true },
      { key: 'ads_history', label: 'What has worked or failed before?', type: 'textarea' },
    ],
    checklist: [
      { key: 'ad_accounts', label: 'Grant agency access to your ad accounts (Business Manager / Google Ads manager link).', kind: 'access', required: true },
      { key: 'pixel', label: 'Website access for tracking (Google Tag Manager or developer contact).', kind: 'access' },
      { key: 'billing', label: 'Confirm the ad account has a valid payment method (ad spend is billed to you directly).', kind: 'legal', required: true },
    ],
    project: [],
    setup: [
      m('setup', 'audit', 'Account & tracking audit', 'paid-media-auditor', 3, { deliverable: 'Audit with wasted-spend findings', approval: true }),
      m('setup', 'tracking', 'Conversion tracking setup', 'paid-media-tracking-specialist', 3, { deliverable: 'Verified conversions and WhatsApp-click tracking' }),
      m('setup', 'build', 'Campaign & creative build', 'paid-media-ppc-strategist', 4, { deliverable: 'Campaigns and ads ready to launch', approval: true }),
    ],
    cycle: monthlyCycle([
      m('cycle', 'optimise', 'Weekly optimisation & search-term mining', 'paid-media-search-query-analyst', 18),
      m('cycle', 'creative', 'Creative testing', 'paid-media-creative-strategist', 6, { tiers: 'gx', deliverable: 'New ad variations', approval: true }),
      m('cycle', 'programmatic', 'Programmatic & paid social expansion', 'paid-media-programmatic-buyer', 6, { tiers: 'x' }),
    ], 'paid-media-auditor'),
  },

  sales: {
    summary: 'Discovery → ICP & playbook → outbound & proposals → coaching and pipeline reviews.',
    intake: [
      { key: 'sales_process', label: 'Describe your current sales process and team size.', type: 'textarea', required: true },
      { key: 'sales_customers', label: 'Your best customers and average deal size (in rand).', type: 'textarea', required: true },
      { key: 'sales_tenders', label: 'Do you bid on tenders (government/private)? Are you registered on the CSD?', type: 'text' },
    ],
    checklist: [
      { key: 'crm', label: 'CRM access (invite us as a user) or tell us what you use today.', kind: 'access' },
      { key: 'collateral', label: 'Existing proposals, pricing sheets and company profile (shared folder link).', kind: 'asset' },
    ],
    project: [
      m('discovery', 'discovery', 'Sales discovery interviews', 'sales-discovery-coach', 3, { deliverable: 'Findings from team & customer interviews' }),
      m('strategy', 'icp', 'Ideal customer profile & personas', 'sales-account-strategist', 3, { deliverable: 'ICP and buyer personas', approval: true }),
      m('production', 'playbook', 'Sales playbook & outbound sequence', 'sales-outbound-strategist', 5, { deliverable: 'Playbook, call script and email/LinkedIn sequence', approval: true }),
      m('review', 'pipeline', 'Pipeline audit', 'sales-pipeline-analyst', 2, { deliverable: 'Pipeline health report' }),
      ...projectClose(),
    ],
    setup: [
      m('setup', 'icp', 'ICP, personas & messaging', 'sales-account-strategist', 4, { deliverable: 'ICP and messaging', approval: true }),
      m('setup', 'crm', 'CRM setup & forecasting', 'sales-pipeline-analyst', 3),
    ],
    cycle: monthlyCycle([
      m('cycle', 'outbound', 'Outbound programme', 'sales-outbound-strategist', 14),
      m('cycle', 'proposals', 'Proposals & tender responses', 'sales-proposal-strategist', 8, { deliverable: 'Submitted proposals', approval: true }),
      m('cycle', 'coaching', 'Rep coaching sessions', 'sales-coach', 4),
      m('cycle', 'deals', 'Deal strategy reviews', 'sales-deal-strategist', 4, { tiers: 'x' }),
    ], 'sales-pipeline-analyst'),
  },

  product: {
    summary: 'Research → synthesis → prioritised roadmap → specs and handover.',
    intake: [
      { key: 'prod_product', label: 'Describe the product and its current stage (idea, MVP, scaling).', type: 'textarea', required: true },
      { key: 'prod_question', label: 'What decision do you need to make with this work?', type: 'textarea', required: true },
      { key: 'prod_users', label: 'Who are your users and how can we reach them for interviews?', type: 'textarea' },
    ],
    checklist: [
      { key: 'analytics', label: 'Product analytics access and any customer feedback exports.', kind: 'access' },
      { key: 'interviewees', label: 'Introduce 5–8 customers or prospects we can interview.', kind: 'asset' },
    ],
    project: [
      m('discovery', 'interviews', 'Stakeholder & customer interviews', 'product-manager', 5, { deliverable: 'Interview notes' }),
      m('discovery', 'trends', 'Market & trend research', 'product-trend-researcher', 4, { tiers: 'gx', deliverable: 'Market and competitor analysis' }),
      m('strategy', 'synthesis', 'Feedback synthesis', 'product-feedback-synthesizer', 3, { deliverable: 'Opportunity map', approval: true }),
      m('production', 'roadmap', 'Prioritised roadmap', 'product-sprint-prioritizer', 4, { deliverable: 'Scored roadmap', approval: true }),
      m('production', 'specs', 'Specs for top initiatives', 'product-manager', 5, { tiers: 'gx', deliverable: 'Specs and success metrics', approval: true }),
      ...projectClose(),
    ],
    setup: [m('setup', 'baseline', 'Product baseline & OKRs', 'product-manager', 5, { deliverable: 'Product OKRs', approval: true })],
    cycle: monthlyCycle([
      m('cycle', 'prioritise', 'Sprint planning & prioritisation', 'product-sprint-prioritizer', 10),
      m('cycle', 'nudges', 'Behavioural nudge experiments', 'product-behavioral-nudge-engine', 8),
      m('cycle', 'feedback', 'Customer feedback synthesis', 'product-feedback-synthesizer', 6),
    ], 'product-feedback-synthesizer'),
  },

  'project-management': {
    summary: 'Charter → plan & tooling → delivery cadence → reporting.',
    intake: [
      { key: 'pm_project', label: 'Which project(s) need managing? Scope, team and suppliers involved.', type: 'textarea', required: true },
      { key: 'pm_tools', label: 'Tools you use today (Jira, Trello, Asana, spreadsheets…).', type: 'text' },
    ],
    checklist: [{ key: 'tools_access', label: 'Invite us to your project tools and team chat.', kind: 'access' }],
    project: [
      m('discovery', 'charter', 'Project charter & stakeholder map', 'project-manager-senior', 3, { deliverable: 'Charter and RACI', approval: true }),
      m('strategy', 'plan', 'Plan, risk register & comms plan', 'project-management-project-shepherd', 4, { deliverable: 'Plan with milestones and risks', approval: true }),
      m('production', 'tooling', 'Board & workflow configuration', 'project-management-jira-workflow-steward', 3, { deliverable: 'Configured board and workflows' }),
      ...projectClose(),
    ],
    setup: [
      m('setup', 'charter', 'Charter, plan & risk register', 'project-manager-senior', 4, { deliverable: 'Charter and plan', approval: true }),
      m('setup', 'tooling', 'Workflow & tooling setup', 'project-management-jira-workflow-steward', 3),
    ],
    cycle: monthlyCycle([
      m('cycle', 'ceremonies', 'Sprint ceremonies & supplier coordination', 'project-management-studio-producer', 16),
      m('cycle', 'status', 'Weekly status reports', 'project-management-project-shepherd', 4),
      m('cycle', 'portfolio', 'Portfolio & capacity planning', 'project-management-studio-operations', 4, { tiers: 'x' }),
    ], 'project-management-project-shepherd'),
  },

  testing: {
    summary: 'Test plan → execution & automation → evidence report → fixes verified.',
    intake: [
      { key: 'qa_target', label: 'What should we test (URL, app, API) and what are the critical user journeys?', type: 'textarea', required: true },
      { key: 'qa_devices', label: 'Devices and browsers your customers use.', type: 'text' },
    ],
    checklist: [
      { key: 'test_env', label: 'Staging/test environment access and test accounts (via invite or password manager share).', kind: 'access', required: true },
      { key: 'repo', label: 'Code repository access (for automation & CI).', kind: 'access' },
    ],
    project: [
      m('discovery', 'plan', 'Test strategy & plan', 'testing-workflow-optimizer', 2, { deliverable: 'Test plan with critical journeys', approval: true }),
      m('production', 'functional', 'Functional & cross-device testing', 'testing-evidence-collector', 4, { deliverable: 'Bug list with screenshots/video' }),
      m('production', 'automation', 'API & end-to-end automation', 'testing-api-tester', 6, { tiers: 'gx', deliverable: 'Automated suites in CI' }),
      m('production', 'performance', 'Performance & load testing', 'testing-performance-benchmarker', 3, { tiers: 'gx', deliverable: 'Performance baseline' }),
      m('review', 'accessibility', 'Accessibility audit', 'testing-accessibility-auditor', 3, { deliverable: 'Accessibility findings' }),
      m('review', 'report', 'Evidence report & sign-off', 'testing-reality-checker', 2, { deliverable: 'Release-readiness report', approval: true }),
      ...projectClose(),
    ],
    setup: [m('setup', 'plan', 'Quality strategy & tooling', 'testing-tool-evaluator', 4, { deliverable: 'Quality strategy', approval: true })],
    cycle: monthlyCycle([
      m('cycle', 'regression', 'Continuous regression testing', 'testing-api-tester', 16),
      m('cycle', 'release', 'Release sign-off gates', 'testing-reality-checker', 6),
    ], 'testing-test-results-analyzer'),
  },

  support: {
    summary: 'Process & tools setup → knowledge base → daily operations → monthly reporting.',
    intake: [
      { key: 'ops_scope', label: 'Which operations do you need (support desk, bookkeeping admin, compliance, IT)?', type: 'textarea', required: true },
      { key: 'ops_volume', label: 'Current monthly volumes (tickets, invoices, WhatsApp chats) and hours to cover.', type: 'textarea', required: true },
    ],
    checklist: [
      { key: 'helpdesk', label: 'Helpdesk/shared inbox and WhatsApp Business access (invite us).', kind: 'access', required: true },
      { key: 'finance', label: 'Accounting software access (e.g. Xero/Sage/QuickBooks) if finance admin is included.', kind: 'access' },
      { key: 'sops', label: 'Existing FAQs, policies and price lists (shared folder link).', kind: 'asset' },
    ],
    project: [],
    setup: [
      m('setup', 'processes', 'Process mapping & SLAs', 'support-support-responder', 3, { deliverable: 'Support processes and SLAs', approval: true }),
      m('setup', 'kb', 'Knowledge base & macros', 'engineering-technical-writer', 4, { deliverable: 'Knowledge base articles and reply templates' }),
      m('setup', 'compliance', 'POPIA & compliance check-up', 'support-legal-compliance-checker', 3, { tiers: 'gx', deliverable: 'Compliance findings' }),
    ],
    cycle: monthlyCycle([
      m('cycle', 'desk', 'Support desk operations', 'support-support-responder', 22),
      m('cycle', 'finance', 'Bookkeeping & finance admin', 'support-finance-tracker', 6, { tiers: 'gx' }),
      m('cycle', 'infra', 'Infrastructure maintenance & on-call', 'support-infrastructure-maintainer', 6, { tiers: 'x' }),
    ], 'support-executive-summary-generator'),
  },

  'game-development': {
    summary: 'Game design → prototype → production milestones → playtests → release build.',
    intake: [
      { key: 'game_concept', label: 'Describe the game concept, genre and target platforms.', type: 'textarea', required: true },
      { key: 'game_engine', label: 'Preferred engine (Unity, Unreal, Godot, Roblox) and why.', type: 'text' },
      { key: 'game_refs', label: 'Reference games and art style (links).', type: 'textarea' },
    ],
    checklist: [
      { key: 'game_assets', label: 'Existing GDD, art and audio (shared folder link).', kind: 'asset' },
      { key: 'store', label: 'Store/developer accounts (Steam, App Store, Play, Roblox) — invite us.', kind: 'access' },
    ],
    project: [
      m('discovery', 'gdd', 'Game design document', 'game-designer', 4, { deliverable: 'GDD / one-pager', approval: true }),
      m('production', 'prototype', 'Core-loop prototype', 'unity-architect', 8, { deliverable: 'Playable prototype build', approval: true }),
      m('production', 'levels', 'Level & narrative design', 'level-designer', 8, { tiers: 'gx', deliverable: 'Designed levels and story beats' }),
      m('production', 'art', 'Technical art & audio', 'technical-artist', 10, { tiers: 'gx', deliverable: 'Art pipeline, assets and audio' }),
      m('review', 'playtest', 'Playtesting & balancing', 'game-designer', 4, { deliverable: 'Playtest report', approval: true }),
      m('launch', 'build', 'Release build', 'unity-editor-tool-developer', 3, { deliverable: 'Vertical slice / release build', approval: true }),
      ...projectClose(),
    ],
    setup: [m('setup', 'pipeline', 'Co-dev onboarding & production pipeline', 'technical-artist', 5)],
    cycle: monthlyCycle([
      m('cycle', 'production', 'Feature & content production', 'unreal-systems-engineer', 18, { deliverable: 'Milestone build', approval: true }),
      m('cycle', 'liveops', 'Live-ops & updates', 'game-designer', 6),
    ], 'project-management-studio-producer'),
  },

  'spatial-computing': {
    summary: 'Concept & storyboard → spatial UX → prototype → production app → store submission.',
    intake: [
      { key: 'xr_goal', label: 'What experience do you want and for whom (customers, staff training, showroom)?', type: 'textarea', required: true },
      { key: 'xr_devices', label: 'Target devices (Apple Vision Pro, Quest, WebXR on phones).', type: 'text', required: true },
    ],
    checklist: [
      { key: 'xr_assets', label: '3D models, CAD files, product photos (shared folder link).', kind: 'asset' },
      { key: 'xr_accounts', label: 'Developer accounts (Apple, Meta) — invite us.', kind: 'access' },
    ],
    project: [
      m('discovery', 'concept', 'Concept & storyboard', 'xr-interface-architect', 4, { deliverable: 'Storyboard and interaction concept', approval: true }),
      m('strategy', 'ux', 'Spatial UX design', 'xr-cockpit-interaction-specialist', 5, { tiers: 'gx', deliverable: 'Spatial UX spec', approval: true }),
      m('production', 'prototype', 'Interactive prototype', 'xr-immersive-developer', 8, { deliverable: 'Prototype on device', approval: true }),
      m('production', 'app', 'Production app build', 'visionos-spatial-engineer', 20, { tiers: 'gx', deliverable: 'Production build' }),
      m('review', 'perf', 'Performance tuning & device testing', 'macos-spatial-metal-engineer', 4, { deliverable: 'Performance report' }),
      m('launch', 'submit', 'Store submission / deployment', 'xr-immersive-developer', 3, { tiers: 'gx', approval: true }),
      ...projectClose(),
    ],
    setup: [m('setup', 'lab', 'Lab setup & R&D roadmap', 'xr-interface-architect', 5, { deliverable: 'R&D roadmap', approval: true })],
    cycle: monthlyCycle([m('cycle', 'rnd', 'R&D sprints & prototypes', 'xr-immersive-developer', 22, { deliverable: 'Prototypes and builds', approval: true })]),
  },

  academic: {
    summary: 'Research question → design → fieldwork/desk research → analysis → report & workshop.',
    intake: [
      { key: 'res_question', label: 'What question should the research answer, and what decision will it inform?', type: 'textarea', required: true },
      { key: 'res_audience', label: 'Which people, markets or communities should we study?', type: 'textarea', required: true },
    ],
    checklist: [{ key: 'res_data', label: 'Existing research, surveys or customer data (shared folder link).', kind: 'asset' }],
    project: [
      m('discovery', 'design', 'Research design', 'academic-anthropologist', 3, { deliverable: 'Research plan and methods', approval: true }),
      m('production', 'desk', 'Desk research & literature review', 'academic-historian', 4, { deliverable: 'Literature and data review' }),
      m('production', 'fieldwork', 'Interviews or surveys', 'academic-psychologist', 8, { tiers: 'gx', deliverable: 'Fieldwork data' }),
      m('review', 'analysis', 'Analysis & insights', 'academic-geographer', 4, { deliverable: 'Insight report', approval: true }),
      m('launch', 'workshop', 'Read-out workshop', 'academic-narratologist', 1, { tiers: 'gx' }),
      ...projectClose(),
    ],
    setup: [m('setup', 'panel', 'Research panel & programme design', 'academic-anthropologist', 5, { approval: true })],
    cycle: monthlyCycle([m('cycle', 'insights', 'Continuous insight programme', 'academic-psychologist', 18, { deliverable: 'Monthly insights', approval: true })], 'academic-narratologist'),
  },

  specialized: {
    summary: 'Assessment → solution design → implementation → compliance review → handover.',
    intake: [
      { key: 'spec_problem', label: 'Describe the problem to solve (e.g. POPIA compliance, automation, AI/CRM integration).', type: 'textarea', required: true },
      { key: 'spec_systems', label: 'Systems and tools involved.', type: 'textarea', required: true },
      { key: 'spec_constraints', label: 'Regulatory, budget or timing constraints.', type: 'textarea' },
    ],
    checklist: [
      { key: 'systems_access', label: 'Access to the relevant systems (invites or sandbox accounts).', kind: 'access' },
      { key: 'policies', label: 'Existing policies, contracts or process documents (shared folder link).', kind: 'asset' },
    ],
    project: [
      m('discovery', 'assessment', 'Current-state assessment', 'compliance-auditor', 4, { deliverable: 'Assessment & risk findings', approval: true }),
      m('strategy', 'design', 'Solution design', 'specialized-workflow-architect', 4, { tiers: 'gx', deliverable: 'Solution design', approval: true }),
      m('production', 'implement', 'Implementation', 'automation-governance-architect', 12, { tiers: 'gx', deliverable: 'Implemented solution' }),
      m('production', 'actionplan', 'Action plan', 'specialized-document-generator', 2, { tiers: 'e', deliverable: 'Prioritised action plan', approval: true }),
      m('review', 'compliance', 'Security & compliance review', 'compliance-auditor', 3, { tiers: 'gx', deliverable: 'Compliance sign-off' }),
      m('launch', 'docs', 'Documentation', 'specialized-document-generator', 2, { tiers: 'gx', deliverable: 'Runbooks and documentation', approval: true }),
      ...projectClose(),
    ],
    setup: [m('setup', 'governance', 'Governance & audit programme design', 'automation-governance-architect', 5, { approval: true })],
    cycle: monthlyCycle([
      m('cycle', 'bench', 'Specialist requests', 'agents-orchestrator', 18),
      m('cycle', 'audit', 'Governance & compliance audits', 'compliance-auditor', 6),
    ]),
  },

  strategy: {
    summary: 'NEXUS: discover → strategise → orchestrate delivery across divisions → measure.',
    intake: [
      { key: 'str_vision', label: 'Where should the business be in 12 months? Revenue, customers, team.', type: 'textarea', required: true },
      { key: 'str_challenges', label: 'Biggest obstacles today.', type: 'textarea', required: true },
      { key: 'str_ai', label: 'How are you using AI and automation today?', type: 'textarea' },
    ],
    checklist: [
      { key: 'financials', label: 'Recent management accounts or revenue overview (shared securely).', kind: 'asset' },
      { key: 'leadership', label: 'Leadership team availability for the workshop.', kind: 'meeting', required: true },
    ],
    project: [
      m('discovery', 'workshop', 'Founder / leadership workshop', 'agents-orchestrator', 3, { deliverable: 'Workshop outcomes' }),
      m('discovery', 'readiness', 'Opportunity & AI-readiness assessment', 'automation-governance-architect', 3, { deliverable: 'Assessment', approval: true }),
      m('strategy', 'roadmap', 'Growth roadmap & KPIs', 'agents-orchestrator', 4, { deliverable: '90-day roadmap and KPI framework', approval: true }),
      m('production', 'playbooks', 'Playbooks & runbooks', 'specialized-workflow-architect', 10, { tiers: 'gx', deliverable: 'Playbooks and runbooks', approval: true }),
      m('production', 'orchestration', 'Cross-division execution', 'project-manager-senior', 14, { tiers: 'gx' }),
      ...projectClose(),
    ],
    setup: [m('setup', 'office', 'Transformation office setup', 'agents-orchestrator', 5, { deliverable: 'Operating rhythm and governance', approval: true })],
    cycle: monthlyCycle([
      m('cycle', 'orchestration', 'Multi-unit orchestration', 'agents-orchestrator', 18),
      m('cycle', 'board', 'Board-level reporting', 'support-executive-summary-generator', 4, { deliverable: 'Board pack', approval: true }),
    ], 'support-executive-summary-generator'),
  },
};

// Services with only a retainer flow still need a project flow if a tier is ever made once-off.
for (const pb of Object.values(PLAYBOOKS)) {
  if (!pb.project.length) {
    pb.project = [...pb.setup.map((s) => ({ ...s, stage: 'strategy' })), ...pb.cycle.filter((c) => !['plan', 'review'].includes(c.key)).map((c) => ({ ...c, stage: 'production' })), ...projectClose()];
  }
}

// ---------------------------------------------------------------- care plans (aftercare)
/** The specialist who looks after a service's deliverables: its first build/production owner. */
function careAgent(serviceSlug) {
  const pb = PLAYBOOKS[serviceSlug] || PLAYBOOKS.strategy;
  return [...pb.project, ...pb.cycle].find((x) => ['production', 'cycle'].includes(x.stage) && x.agent && x.agent !== 'project-manager-senior')?.agent || 'support-support-responder';
}
function careCycle(serviceSlug, tier, n) {
  const tk = TIER_KEY[tier] || 'g';
  const agent = careAgent(serviceSlug);
  const tasks = (CARE[serviceSlug]?.tasks || [['Monthly care tasks', '']]).filter(([, tiers]) => !tiers || tiers.includes(tk));
  return [
    ...tasks.map(([title], i) => m('cycle', `care${i + 1}`, title, agent, i === 0 ? 20 : 4)),
    m('cycle', 'care_report', 'Monthly care report', 'support-analytics-reporter', 2, { deliverable: 'What we did, time used and recommendations' }),
  ].map((x) => ({ ...x, key: `${x.key}_c${n}`, title: `${x.title} (month ${n})`, cycle: n }));
}
function buildCarePlan(serviceSlug, tier) {
  const milestones = [
    m('onboarding', 'intake', 'Complete the care onboarding form', null, 2, { client: true }),
    m('setup', 'care_handover', 'Access handover & baseline health check', careAgent(serviceSlug), 3, { deliverable: 'Baseline health report and care checklist' }),
    ...careCycle(serviceSlug, tier, 1),
  ];
  return {
    kind: 'retainer',
    milestones: milestones.map((x, i) => ({ ...x, cycle: x.stage === 'cycle' ? x.cycle ?? 1 : 0, position: i })),
    intake: [
      { key: 'care_scope', label: 'What should we look after? Add links (website, app store page, shared folder, ad account name).', type: 'textarea', required: true },
      { key: 'care_priorities', label: 'What matters most to keep working (e.g. checkout, booking form, Google listing)?', type: 'textarea', required: true },
      { key: 'care_contact', label: 'Who should we call for urgent issues? (name, WhatsApp number)', type: 'text', required: true },
    ],
    checklist: [
      { key: 'care_access', label: 'Invite us to the hosting, domain, accounts or tools we will maintain (never send passwords — use invites).', kind: 'access', required: true },
    ],
    revisions: null,
    summary: 'Onboarding → access handover & health check → monthly care cycle (maintenance, changes, report).',
  };
}

const includes = (ms, tierKey) => !ms.tiers || ms.tiers.includes(tierKey);

/**
 * Build the concrete milestone plan for a service tier.
 * @returns {{ kind: 'project'|'retainer', milestones: object[], intake: object[], checklist: object[], revisions: number|null }}
 */
export function buildPlan(serviceSlug, tier, billing, deliveryDays, plan = 'core') {
  if (plan === 'care') return buildCarePlan(serviceSlug, tier);
  const pb = PLAYBOOKS[serviceSlug] || PLAYBOOKS.strategy;
  const tk = TIER_KEY[tier] || 'g';
  let milestones;
  if (billing === 'monthly') {
    milestones = [...onboarding(), ...pb.setup.filter((x) => includes(x, tk)), ...cyclePlan(serviceSlug, tier, 1)];
  } else {
    milestones = [...onboarding(), ...pb.project.filter((x) => includes(x, tk))]
      .map((x) => (x.days === 'support' ? { ...x, days: SUPPORT_DAYS[tier] || 14 } : x));
    // Scale build stages so the plan matches the package's published delivery time.
    const scalable = milestones.filter((x) => !['onboarding', 'handover'].includes(x.stage));
    const planned = scalable.reduce((a, x) => a + x.days, 0);
    const target = Math.max(scalable.length, (deliveryDays || planned) - milestones.filter((x) => x.stage === 'onboarding').reduce((a, x) => a + x.days, 0));
    if (planned > 0) {
      const f = target / planned;
      milestones = milestones.map((x) => (scalable.includes(x) ? { ...x, days: Math.max(1, Math.round(x.days * f)) } : x));
    }
  }
  return {
    kind: billing === 'monthly' ? 'retainer' : 'project',
    milestones: milestones.map((x, i) => ({ ...x, cycle: x.stage === 'cycle' ? x.cycle ?? 1 : 0, position: i })),
    intake: [...COMMON_INTAKE, ...pb.intake],
    checklist: [...COMMON_CHECKLIST, ...pb.checklist],
    revisions: tier in REVISIONS ? REVISIONS[tier] : 3,   // null = unlimited
    summary: pb.summary,
  };
}

/** Milestones for monthly cycle number `n` of a retainer. */
export function cyclePlan(serviceSlug, tier, n, plan = 'core') {
  if (plan === 'care') return careCycle(serviceSlug, tier, n);
  const pb = PLAYBOOKS[serviceSlug] || PLAYBOOKS.strategy;
  const tk = TIER_KEY[tier] || 'g';
  return pb.cycle.filter((x) => includes(x, tk)).map((x) => ({ ...x, key: `${x.key}_c${n}`, title: `${x.title} (month ${n})`, cycle: n }));
}

/** Public summary of a service's delivery journey for each tier (used on service pages). */
export function journey(serviceSlug, tiers) {
  return tiers.map((t) => {
    const plan = buildPlan(serviceSlug, t.tier, t.billing, t.delivery_days);
    const stages = [];
    for (const ms of plan.milestones) {
      let s = stages.find((x) => x.stage === ms.stage);
      if (!s) stages.push((s = { stage: ms.stage, label: STAGES[ms.stage]?.label || ms.stage, days: 0, steps: [] }));
      s.days += ms.days;
      s.steps.push({ title: ms.title.replace(/ \(month 1\)$/, ''), approval: !!ms.approval, client: !!ms.client, deliverable: ms.deliverable || null, agent: ms.agent });
    }
    return {
      tier: t.tier, name: t.name, kind: plan.kind, revisions: plan.revisions,
      // Days from order to launch (the post-launch support window follows).
      launch_days: plan.kind === 'project' ? plan.milestones.filter((x) => x.stage !== 'handover').reduce((a, x) => a + x.days, 0) : null,
      support_days: plan.kind === 'project' ? SUPPORT_DAYS[t.tier] || 14 : null,
      stages,
    };
  });
}
