// Starter articles for the blog. Written for South African entrepreneurs and
// structured for SEO/AEO: question-led headings, a short direct answer up front,
// then detail. Edit or replace them in the Command Centre.

export const seedPosts = [
  {
    slug: 'how-much-does-a-website-cost-in-south-africa',
    title: 'How much does a website cost in South Africa?',
    category: 'Web Development',
    tags: ['website cost', 'small business', 'pricing'],
    cover_emoji: '💻',
    excerpt: 'A practical breakdown of what South African businesses pay for a website — from a simple brochure site to an online store with PayFast or Ozow checkout.',
    meta_description: 'What does a website cost in South Africa? A clear rand breakdown for brochure sites, online stores and web apps, plus the hidden costs to budget for.',
    body: `## Quick answer

A professional small-business website in South Africa typically costs between **R5 000 and R16 000** for a 5–10 page brochure site, while an online store with local payment gateways usually costs **R15 000–R60 000** (around R19 000–R25 000 for a standard store). Custom web apps and platforms start higher and are priced by scope.

## What drives the price?

- **Number of pages and features.** A five-page site is a very different job from a store with hundreds of products.
- **Design approach.** Template-based design is cheaper; a custom design system costs more but makes your brand distinctive.
- **Payments.** Integrating PayFast, Ozow or Yoco adds work for checkout, payment notifications and order status.
- **Content.** Copywriting, photography and product uploads are often forgotten in quotes.
- **Compliance.** If you collect personal information you need a POPIA-aware privacy notice and secure forms.

## Ongoing costs to budget for

1. **Domain** — a \`.co.za\` domain is inexpensive and renews annually.
2. **Hosting** — shared hosting is cheap; cloud hosting with backups and uptime monitoring costs more but protects revenue.
3. **Maintenance** — security updates, backups and small changes.
4. **Marketing** — a website without SEO or ads is a billboard in the desert.

## How Hipcastle prices websites

Our [Software Engineering Essential package](/services/engineering) covers a fast, mobile-first site of up to five pages with WhatsApp integration and \`.co.za\` setup. The Growth package covers full online stores and web apps with PayFast and Ozow checkout. All prices are fixed and listed in rand on our [pricing page](/pricing).

## FAQ

**Is a cheap website a false economy?** Often, yes. Slow, insecure sites lose customers and rank poorly on Google. Check that your quote includes mobile optimisation, SSL and backups.

**How long does a website take to build?** A brochure site typically takes two to three weeks; an online store four to eight weeks, depending on content readiness.`,
  },
  {
    slug: 'payfast-vs-ozow-choosing-a-payment-gateway',
    meta_title: 'PayFast vs Ozow: Best Payment Gateway for SA Businesses',
    title: 'PayFast vs Ozow: which payment gateway should your SA business use?',
    category: 'Payments',
    tags: ['payfast', 'ozow', 'instant eft', 'e-commerce'],
    cover_emoji: '💳',
    excerpt: 'PayFast and Ozow are two of South Africa’s best-known online payment providers. Here is how they differ and why many businesses offer both.',
    meta_description: 'PayFast vs Ozow for South African businesses: payment methods, customer experience and when to offer both card and instant EFT at checkout.',
    body: `## Quick answer

**PayFast** is a multi-method gateway — cards, instant EFT, and app-based options such as SnapScan and Zapper, depending on your account. **Ozow** specialises in **instant EFT**, letting customers pay straight from their bank account without a card. Many South African businesses offer both to maximise checkout conversion.

## Why offering instant EFT matters

A significant share of South African consumers prefer to pay from their bank account rather than with a credit card. Instant EFT confirms payment immediately — unlike a manual EFT where you wait for proof of payment and clearance.

## PayFast at a glance

- Accepts card payments and a range of alternative methods.
- Supports once-off payments and subscriptions.
- Sends an **Instant Transaction Notification (ITN)** to your server, so orders can be confirmed automatically.
- A sandbox lets developers test without moving real money.

## Ozow at a glance

- Bank-to-bank instant EFT across major South African banks.
- No card details required, which reduces card fraud exposure.
- Sends a secure **notification** to your server with a hash you verify before marking an order paid.

## What to check before you choose

1. **Current fees** — both providers publish pricing; compare them for your average transaction value.
2. **Settlement times** — how quickly money reaches your bank account.
3. **Your customers** — B2B buyers often prefer EFT; younger consumers may prefer cards or app payments.

## How we integrate gateways

Every online store and web app in our [Software Engineering Growth package](/services/engineering) can include PayFast and Ozow, with server-side verification of every payment notification so orders are only confirmed when the money is real. This very website takes deposits through both.`,
  },
  {
    slug: 'popia-checklist-for-small-businesses',
    title: 'POPIA compliance checklist for South African small businesses',
    category: 'Compliance',
    tags: ['popia', 'compliance', 'privacy'],
    cover_emoji: '🔐',
    excerpt: 'The Protection of Personal Information Act applies to almost every business that collects customer details. Use this practical checklist to get the basics right.',
    meta_description: 'A practical POPIA checklist for South African SMEs: information officers, privacy notices, consent, security safeguards and handling data breaches.',
    body: `## Quick answer

The **Protection of Personal Information Act 4 of 2013 (POPIA)** regulates how South African organisations collect, use, store and share personal information. Its main provisions became enforceable on **1 July 2021**. If your business collects names, phone numbers, email addresses or ID numbers — even through a website contact form — POPIA applies to you.

## The essentials checklist

1. **Register your Information Officer.** By default this is the head of the business. Registration is done with the Information Regulator.
2. **Know what you collect and why.** List each type of personal information, where it is stored and the purpose for collecting it.
3. **Publish a privacy notice.** Your website should explain what you collect, why, how long you keep it and how people can access or correct it.
4. **Collect only what you need.** If you don't need an ID number, don't ask for it.
5. **Get consent for direct marketing.** Electronic marketing to individuals generally requires opt-in consent, and every message needs an easy opt-out.
6. **Secure the data.** Use strong passwords, access control, encrypted connections (HTTPS) and regular backups.
7. **Check your suppliers.** Anyone processing data on your behalf — hosting, CRM, payroll — should have a written agreement covering security.
8. **Plan for breaches.** Know how you will notify the Information Regulator and affected people if data is compromised.

## Don't forget PAIA

The **Promotion of Access to Information Act (PAIA)** requires many private bodies to have a PAIA manual explaining how people can request records.

## How Hipcastle helps

Our [Specialist Solutions](/services/specialized) team runs POPIA assessments and builds privacy-by-design into every website and app we deliver. *This article is general guidance, not legal advice.*`,
  },
  {
    slug: 'get-your-business-found-on-ai-search',
    meta_title: 'Get Recommended by ChatGPT & AI Search: A GEO Guide',
    title: 'How to get your business recommended by ChatGPT, Gemini and other AI search tools',
    category: 'SEO',
    tags: ['geo', 'aeo', 'ai search', 'seo'],
    cover_emoji: '🤖',
    excerpt: 'Customers increasingly ask AI assistants for recommendations. Generative Engine Optimisation (GEO) helps your business become the answer.',
    meta_description: 'Generative Engine Optimisation (GEO) and Answer Engine Optimisation (AEO) for South African businesses: how to get cited by AI search tools.',
    body: `## Quick answer

**Generative Engine Optimisation (GEO)** is the practice of making your business easy for AI tools — ChatGPT, Gemini, Claude, Perplexity and Google's AI Overviews — to understand, trust and cite. **Answer Engine Optimisation (AEO)** focuses on structuring content so it directly answers the questions people ask.

## Seven practical steps

1. **State the facts clearly.** Say who you are, what you do, where you operate and what it costs, in plain sentences on your website.
2. **Answer real questions.** Use question-style headings ("How much does X cost in Johannesburg?") followed by a short, direct answer.
3. **Publish prices.** AI assistants favour sources that give concrete numbers. Transparent rand pricing is a competitive advantage.
4. **Add structured data.** Schema.org markup (Organization, Service, FAQPage, Article) helps machines understand your content.
5. **Keep your profiles consistent.** Your name, address and phone number should match on your website, Google Business Profile and directories.
6. **Earn mentions.** Reviews, local news coverage and industry listings are signals AI tools use to judge credibility.
7. **Make your site crawlable.** Allow reputable AI crawlers in robots.txt and consider an \`llms.txt\` file that summarises your business.

## Classic SEO still matters

GEO builds on good SEO: fast mobile pages, descriptive titles, helpful content and a clean site structure. Our [Digital Marketing & SEO](/services/marketing) Growth package includes AI-search optimisation as standard.`,
  },
  {
    slug: 'whatsapp-business-for-sa-entrepreneurs',
    title: 'Using WhatsApp Business to win more customers in South Africa',
    category: 'Marketing',
    tags: ['whatsapp', 'customer service', 'marketing'],
    cover_emoji: '💬',
    excerpt: 'WhatsApp is where South African customers already are. Here’s how to use WhatsApp Business professionally without burning out.',
    meta_description: 'How South African small businesses can use WhatsApp Business: catalogues, quick replies, labels, click-to-chat links and POPIA-friendly broadcasts.',
    body: `## Quick answer

WhatsApp is one of the most widely used messaging apps in South Africa, which makes **WhatsApp Business** a powerful, low-cost sales and support channel. Set up a business profile, a product catalogue, quick replies and a click-to-chat link on your website.

## Set-up essentials

- **Business profile:** add your hours, address, website and a clear description.
- **Catalogue:** list your top products or service packages with prices in rand.
- **Quick replies:** save answers to common questions such as pricing, delivery areas and operating hours.
- **Labels:** tag chats as *new lead*, *quote sent*, *paid* to track your pipeline.
- **Click-to-chat link:** \`wa.me/27XXXXXXXXX\` links on your website and social profiles start conversations in one tap.

## Stay compliant and professional

Only message people who have opted in, honour opt-out requests quickly, and don't share customers' personal information in groups. For higher volumes, the WhatsApp Business Platform (API) adds automation and team inboxes.

## How we can help

Our [Business Operations](/services/support) team can run your WhatsApp support desk, and our [Digital Marketing](/services/marketing) team can turn it into a sales channel.`,
  },
  {
    slug: 'choosing-the-right-agency-package',
    meta_title: 'Essential, Growth or Enterprise? Choosing a Package',
    title: 'Essential, Growth or Enterprise? How to choose the right agency package',
    category: 'Guides',
    tags: ['agency', 'pricing', 'planning'],
    cover_emoji: '🧭',
    excerpt: 'Every Hipcastle service comes in three tiers. Here’s a simple way to decide which one fits your business stage and budget.',
    meta_description: 'How to choose between Essential, Growth and Enterprise agency packages — a simple guide for South African founders based on stage, budget and goals.',
    body: `## Quick answer

Choose **Essential** for a fixed-scope quick win, **Growth** when you need a complete outcome delivered by a multi-specialist team, and **Enterprise** when you need a dedicated, ongoing team with service levels.

## Essential — prove it

Best for start-ups and side hustles validating an idea, or established businesses fixing one specific problem. Fixed scope, fixed price, fast delivery.

## Growth — build it

Our most popular tier. Best for businesses with traction that want a complete website, store, marketing engine or sales programme. A squad of specialists delivers end-to-end, with milestones visible in your client portal.

## Enterprise — scale it

Best for growing companies and corporates that need dedicated people, SLAs and a named lead embedded in their organisation, billed monthly.

## How payment works

Project packages take a **50% deposit** to start and the balance on delivery; retainers are billed monthly in advance. Pay securely by card or instant EFT through PayFast or Ozow, straight from your client portal.

Still unsure? [Book a free 30-minute strategy session](/contact) and we'll recommend a package — no obligation.`,
  },
];
