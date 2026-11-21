# 🏰 Hipcastle Agency — Web App

A full-stack web app for running a services agency, built for **South African entrepreneurs**. It is based on the agent roster in this repository: each agent division becomes a **service line**, sold in **three tiers** priced in **rand (ZAR)**. Clients pay through **PayFast** and **Ozow**, and staff manage everything from a back-office **Command Centre**.

| Layer     | Stack |
|-----------|-------|
| Frontend  | React 19, React Router 7, Vite. Plain CSS design system, responsive and accessible |
| Backend   | Node.js 22 and Express. JWT auth, bcrypt, zod validation, helmet (CSP), compression, rate limiting |
| Database  | SQLite through Node's built-in `node:sqlite`. Automatic column migrations; portable to PostgreSQL |
| Payments  | PayFast (card, instant EFT, SnapScan, Zapper) and Ozow (instant EFT), both verified server-side |
| SEO       | Server-rendered meta and JSON-LD, pre-rendered page content, sitemap, robots.txt, llms.txt, RSS |

## Features

### Public website
- **Header**: announcement bar, services mega-menu, Pricing, Specialists, Blog, About, Contact.
- **Hero**: written for the SA market, with live stats and a "from R…" price.
- **Footer**: social icons, newsletter, contact details, payment badges, legal links, CIPC and VAT numbers.
- **Ask Hipcastle assistant** on the homepage: a chat widget that answers questions about every service, package, rand price, payment method, delivery step, portal feature, support process and policy. It suggests a package, links to the right page, takes 👍/👎 feedback and hands the conversation to a person (creates a lead with the transcript). WhatsApp is offered inside the panel.
- **Care plans** (`/care`): monthly aftercare, maintenance & hosting for every service (3 tiers each), also shown on each service page and offered in the client portal when a project is delivered.
- **Help Centre** (`/help`): every article the assistant knows, searchable, with FAQPage structured data.
- **Floating WhatsApp button** on every other public page.
- **Services**: 14 lines × 3 tiers in rand. Each service page has a comparison table, specialists, client reviews and question-led FAQs ("How much does X cost in South Africa?").
- **About us**: story, operating model, values, sectors served, reviews and FAQ, with AboutPage and FAQPage structured data.
- **Contact**: WhatsApp, email, phone and hours cards. The strategy-session form captures province, budget and preferred channel, and requires POPIA consent.
- **Testimonials**: approved reviews with an average rating and service filter. Clients can submit a review, which waits for moderation.
- **Blog**: categories, search, featured article, reading time, share buttons (WhatsApp, LinkedIn, Facebook, X), related posts and RSS. It ships with 6 starter guides for SA founders.
- **Legal**: Privacy policy (POPIA) and Terms of service pages.

### Client portal
- Register, choose a tier and submit a brief. The order then gets milestones and an invoice automatically.
- **Pay invoices online** with PayFast or Ozow. The return page waits for the gateway's confirmation before showing the result.
- Track progress, see payment history and message the team.
- **Care plans**: add one to a delivered project, see this month's hours used and the work log.
- **Support desk** (`/portal/support`): open tickets by topic and priority, linked to an engagement; threaded replies with email notifications; resolve, reopen and rate the help (CSAT).
- **VAT support**: when the business is VAT registered, invoices show subtotal, VAT and total.

### Command Centre (`/admin`, for staff and admins)

| Section | What you can monitor and manage |
|---|---|
| **Growth & acquisition** | Cookie-free first-party analytics: daily visitors, top pages, and the funnel visitors → leads → sign-ups → orders → paid → revenue for each first-touch source (UTM tag, search engine, social network, AI assistant or referring site) |
| **Overview** | Live KPIs: 30-day revenue, outstanding and overdue invoices, active engagements, leads and win rate, payments, ratings. Also a revenue chart, pipeline by service and tier, a live activity feed and configuration alerts |
| **System & processes** | Uptime, memory, API request rates and p95 latency, busiest routes and recent errors. PayFast and Ozow status with notify URLs, database table sizes, config checks, and **background jobs** you can run or pause (expire abandoned payments, overdue invoice watch, daily database backup, log retention) |
| **Activity log** | Searchable audit trail: orders, payments, rejected gateway notifications, sign-ins and failed sign-ins, admin changes, exports |
| **Payments** | Every transaction, its raw gateway notification and manual reconciliation (with an audit note). CSV export |
| **Support desk** | Ticket queue with first-response targets (urgent 4 h, high 24 h, normal 48 h, low 72 h), SLA-breach flags, assignees, internal notes, response-target %, average first response and CSAT |
| **Care plans** | Care revenue per month, active plans, hours used vs included (log time here or on tickets), plans over their allowance, and delivered projects whose free support is ending |
| **Assistant chats** | Whether the assistant is in AI or FAQ mode, conversations, helpful %, unanswered questions to improve on, handoffs and AI token usage; full transcripts |
| **Engagements / Leads / Users / Invoices** | Order pipeline, CRM with WhatsApp/call/email shortcuts, role management, invoice status. CSV exports |
| **Blog** | Markdown editor with preview, Google result preview and an SEO/AEO checklist; draft or publish |
| **Testimonials** | Approve, reject, feature or delete reviews |
| **Services & pricing** | Turn service lines on or off; edit tier prices, scope and features |
| **Subscribers** | Newsletter list (remove on request for POPIA), CSV export |
| **SEO, AEO & GEO** | Readiness score, per-page title, description and schema audit, links to crawler files |
| **Settings** | Business details (kept consistent with Google Business Profile), WhatsApp, social profiles, VAT, payment gateway toggles, pause orders, announcement bar |

## Customer service: assistant, Help Centre and support desk

**One knowledge base** ([`server/src/kb.js`](server/src/kb.js)) is generated from live data: the catalog and prices, delivery playbooks, settings, FAQs, policies and published blog posts. Edit a price or publish an article and the assistant and Help Centre know about it immediately — there is nothing separate to train.

**Two answer engines** ([`server/src/chat.js`](server/src/chat.js)):

| Mode | When | How |
|---|---|---|
| **AI** | `ANTHROPIC_API_KEY` is set | Claude answers from the knowledge base only (sent as a prompt-cached system prompt), streams the reply, quotes rand prices exactly, never asks for passwords or card details and offers a person when unsure. `CHATBOT_MODEL` (default `claude-opus-5-5`) and `CHATBOT_EFFORT` (default `low`) are configurable. |
| **FAQ** | No key, or the AI call fails | Keyword retrieval over the same knowledge base. Free, instant, and the automatic fallback so visitors always get an answer. |

Conversations are logged (with tokens used), rated by visitors and deleted after 180 days by the **chat retention** job. "Talk to a person" creates a lead (`source = chatbot`) with the transcript, sends the visitor a confirmation and the team a `chat.handoff` email. `/api/chat` is rate limited to 20 messages per 5 minutes per IP and 60 messages per conversation.

**Support desk** ([`server/src/routes/support.js`](server/src/routes/support.js)): tickets get a first-response target from their priority; the first staff reply records the response time and sets *pending client*; a client reply reopens; resolved tickets ask for a 1–5 rating and close after 7 days. The **support SLA** job warns the team (once per ticket) when a target is missed. Emails: `ticket.created`, `ticket.notify`, `ticket.reply`, `ticket.resolved`, `ticket.sla`.

## Pricing

Package prices (`server/src/catalog.js`, ZAR excl. VAT) are benchmarked against what South African agencies charge:

| Service | Benchmark |
|---|---|
| Brochure websites | R5k–R16k |
| Online stores | about R19k on average (R13k–R60k) |
| Custom web apps | R38k–R88k |
| Mobile and immersive apps | R80k–R270k+ |
| SEO | R5k–R12k a month |
| Social media | R1k–R6.5k a month for small businesses |
| Ads management | R3k–R7.5k a month |
| Logo and identity | R4.5k–R22.5k |
| Bookkeeping | R2k–R4.5k a month |
| Consultants | R5k–R15k a day |

Agency hourly rates run R500–R1 500, and retainers are sized in hours at about R550–R750/hour.

When prices change in a release, `PRICE_REVISION` updates existing databases once. Only tiers still on the old default price are updated; prices an admin changed in the Command Centre are kept.

## Care plans: maintenance, hosting & aftercare

Every service has three monthly care tiers ([`server/src/care.js`](server/src/care.js)), stored as service tiers with `plan = 'care'`, so checkout, invoices, payments and pipelines work as for any retainer.

**Pricing** (ZAR, excl. VAT) is benchmarked against the South African market: basic website care plans are typically R300–R800/month and managed hosting with maintenance about R1 500+, local hosting is R99–R360/month, and small-agency rates are R500–R1 500/hour. Entry plans start at R395–R1 450 depending on the service (Website & App Care: R595 / R1 450 / R3 950). Every tier's price per included hour stays within R383–R1 190, and most tiers also include hosting, monitoring or backups. Edit prices and included hours in Command Centre → Services & pricing.

| | Essential Care | Growth Care | Enterprise Care |
|---|---|---|---|
| Hands-on time / month | 30 min – 1.5 h | 1.5 – 4 h | 4 – 10 h |
| Support tickets | normal (2 business days) | high (1 business day) | urgent (4 business hours) |

**How it runs:**

| Step | What happens |
|---|---|
| Free support | Once-off projects get 14, 30 or 60 days of free support after delivery (Essential, Growth, Enterprise). |
| Offer | The **care-offers** job emails the matching care plans 7 days before that window ends. The order page also offers them, and the Command Centre lists windows that are ending. |
| Ordering | A care order can *cover* the delivered project. Its pipeline is: care onboarding form, then access handover and baseline health check, then a monthly cycle (service-specific upkeep tasks and a care report). It is billed monthly in advance. |
| Tickets | Tickets from active care clients get the better of the priority they chose and their plan's priority. |
| Time tracking | Staff log time on the ticket, or in Care plans for proactive work. When the month's hours run out, the client and team get one email: extra work is quoted first at **R650/hour** (`CARE_EXTRA_HOUR_CENTS`). |
| New month | The hours reset each month. Unused hours don't roll over. |

## Delivery pipelines: onboarding → delivery

Every service has a **delivery playbook** for each tier, defined in [`server/src/playbooks.js`](server/src/playbooks.js). When a client orders, the engagement gets the right pipeline automatically.

**What the pipeline includes**
- **Stages:** Onboarding → Discovery → Strategy & design → Build & production → Quality review → Launch → Handover & support.
- **Retainers** have Onboarding → Setup, then a **monthly cycle** that repeats: plan → work → report → review.
- **Each milestone** has a specialist **owner** (one of this repo's agents), a planned duration and due date, the deliverable the client receives, and whether it needs **client approval**.
- **An onboarding questionnaire** (common questions plus service-specific ones) and an **access & assets checklist**. Access is granted by invitation; the form warns clients never to share passwords.
- **Revision rounds** per deliverable: Essential 2, Growth 3, Enterprise unlimited. Once the rounds are used up, the client is asked to arrange more with the team.

**Automation along the way**

| When | What happens |
|---|---|
| Order placed | Pipeline, onboarding questionnaire and due dates created from the playbook. Timelines are scaled to the package's published delivery days. |
| Deposit paid | Engagement goes active, the timeline is re-planned from today, and the client gets an "onboarding" email. |
| Client completes onboarding | Intake milestone done; the team gets the answers by email to book the kick-off. |
| Kick-off done | Timeline re-baselined from the kick-off date. |
| Deliverable submitted (approval milestones) | The client gets a "ready for review" email. They approve or request changes in the portal, and the team is notified either way. |
| Launch | The **50% balance invoice** is issued automatically, once. |
| All milestones done | Engagement completed; the client gets a feedback (NPS) request and an invitation to leave a review. Low scores trigger a "call within 24h" alert. |
| Retainer month due | The next month's milestones and invoice are created automatically (the "Retainer monthly cycles" job), or manually with **Start next month**. |
| Hourly ("Delivery pipeline watch") | Flags overdue milestones, reminds clients about approvals waiting 3+ days and unfinished onboarding, and emails the team a daily overdue digest. |

**Where to manage it**
- **Client portal:** stage tracker, health, onboarding form, timeline with owners, due dates and deliverable links, approve or request changes, and a feedback form.
- **Command Centre → Delivery pipeline:** a board of every engagement by stage, with health (on track, at risk, off track, waiting on client), the next milestone and its owner, and workload per specialist and client NPS.
- **Engagement page (staff):**
  - Start, submit, mark done, block and re-date milestones
  - Re-plan the timeline and start the next retainer month
  - Mark checklist items received
- **Command Centre → Delivery playbooks:** browse every service and tier's milestones, owners, approval gates and onboarding questions.
- **Service pages:** a public "How delivery works" section per tier, showing days to launch, support days and revision rounds.

## Domain: www.hipcastle.agency

`https://www.hipcastle.agency` is the canonical address. It's set in [`server/src/urls.js`](server/src/urls.js) and can be overridden with `SITE_URL`. It's used for:
- Canonical tags, Open Graph and Twitter URLs, and all JSON-LD `@id`/`url` values
- `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt` and the RSS feed
- Every link and image in outgoing emails, and newsletter unsubscribe links
- The website link in the footer and on the contact page, and the social sharing image

In production, `hipcastle.agency` and `http://` requests get a **301 redirect** to `https://www.hipcastle.agency`, so only one version of each page is indexed. Payment gateway callbacks are never redirected.

During development, SEO tags still point at the real domain, while payment returns use `http://localhost:4000`.

**DNS checklist**
- `www` → your server or host (A or CNAME record)
- Apex `hipcastle.agency` → same server (the app redirects it to `www`)
- A TLS certificate covering both names
- Email records (see below)

## Email

Hipcastle sends branded, mobile-friendly emails from **hello@hipcastle.agency**. Each one has both HTML and plain-text parts.

| Email | Sent to | When |
|---|---|---|
| Enquiry auto-reply · New lead alert | Lead · team inbox | Contact form submitted |
| Welcome | Client | Account created |
| Password reset (1-hour, single-use link) | Client | "Forgot password" |
| Order confirmation (with pay link) · New order alert | Client · team | Order placed |
| Engagement status (started / ready for review / completed with a review request / cancelled) | Client | Staff change the status |
| New invoice · Overdue reminder | Client (replies go to accounts@) | Invoice issued · invoice past due |
| Payment receipt · Payment alert · Payment failed | Client · team · client | PayFast or Ozow confirms or declines |
| New message | Client or team | Message posted on an engagement |
| Review awaiting moderation · Review published thank-you | Team · reviewer | Review submitted · approved |
| Newsletter welcome (with one-click unsubscribe) | Subscriber | Footer sign-up |

**How it works**
- Emails go into an **outbox queue** and are delivered over SMTP (any provider) by a background job.
- Failed sends retry with back-off: 2, 4, 8, then 16 minutes, up to 5 attempts. Permanent failures are flagged in the activity log and on the dashboard.
- Without `SMTP_HOST`, emails are rendered and **logged** (not sent), so you can preview everything safely.
- **Command Centre → Emails** shows:
  - Delivery mode and an SMTP connection check
  - A test-send button
  - Previews of all 17 templates with sample data
  - The outbox, with HTML and plain-text preview, status, retry and resend
- **Command Centre → Settings** sets the team inbox (`notify_email`) and the billing reply-to (`billing_email`, default accounts@hipcastle.agency). It also has a master switch for customer emails.
- Newsletter emails carry `List-Unsubscribe` and one-click headers (as Gmail and Yahoo require) with HMAC-signed links. All user content is HTML-escaped.

**Inbox delivery checklist for hipcastle.agency**
1. Create mailboxes, or aliases that forward to a real inbox: `hello@`, `accounts@` and `admin@hipcastle.agency`.
2. Add your provider's **SPF** record, e.g. `v=spf1 include:_spf.google.com ~all` for Google Workspace.
3. Enable **DKIM** in your provider and publish the TXT record it gives you.
4. Add **DMARC**: `_dmarc.hipcastle.agency TXT "v=DMARC1; p=quarantine; rua=mailto:hello@hipcastle.agency"`.
5. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS`. Then use **Check SMTP connection** and **Send test** in Command Centre → Emails.

## Social profiles

The default profiles are the Hipcastle Agency handles below. You can change them in Command Centre → Settings. They power the footer and contact icons, email footers and the `sameAs` entity links in structured data.

| Network | URL |
|---|---|
| Facebook | https://www.facebook.com/hipcastleagency |
| Instagram | https://www.instagram.com/hipcastleagency |
| LinkedIn | https://www.linkedin.com/company/hipcastle-agency |
| X | https://x.com/hipcastleagency |
| TikTok | https://www.tiktok.com/@hipcastleagency |
| YouTube | https://www.youtube.com/@hipcastleagency |

## Payments: PayFast & Ozow

| | PayFast | Ozow |
|---|---|---|
| Checkout | Signed form POST (MD5 signature with passphrase) | Form POST with SHA-512 `HashCheck` |
| Confirmation | ITN at `/api/payments/payfast/notify`. Checks signature, merchant ID and amount; validates remotely with PayFast; optional source-IP check | Notification at `/api/payments/ozow/notify`. Checks hash, site code and amount; rejects test transactions in live mode; optional API status double-check |
| Customer return | `/api/payments/return` redirects to `/payment/return`, which polls for the confirmed status | Same |

Invoices are marked paid **only** after a verified server-to-server notification, never because the customer was redirected back. Each step is idempotent and written to the activity log.

**Testing locally**
- With no credentials set, PayFast uses its shared public sandbox account. Checkout works (verified against the real sandbox), but that account's passphrase is not published, so its notifications cannot be verified. Create your own free sandbox account at sandbox.payfast.co.za, set `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY` and `PAYFAST_PASSPHRASE`, and point `PAYMENTS_NOTIFY_URL` at a public tunnel to test the full loop.
- Outside production there is also a **Test payment** option that simulates a gateway.
- For production, set `PAYMENTS_MODE=live` with live credentials.

## SEO, AEO & GEO

- **Server-side rendering of the head** for every public URL: title, description, canonical, hreflang `en-ZA`, Open Graph, Twitter card, geo tags and robots rules (portal, admin and checkout are `noindex`). Unknown URLs return a real 404.
- **Pre-rendered content** inside `#root`, so crawlers and AI bots that don't run JavaScript still read headings, prices, FAQs and full articles.
- **JSON-LD**:
  - Organization and ProfessionalService (address, area served: South Africa, price range in ZAR, payment methods, `sameAs` social profiles)
  - WebSite and BreadcrumbList
  - Service with ZAR Offers (monthly unit pricing)
  - FAQPage
  - Blog and BlogPosting
  - AboutPage and ContactPage
  - Review
- **AEO**: question-led FAQs with direct answers on the home page and every service page. Articles open with a "Quick answer" section.
- **GEO**:
  - `robots.txt` explicitly welcomes GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and others.
  - `/llms.txt` and `/llms-full.txt` give AI assistants a factual summary of services, prices, FAQs and articles.
- `/sitemap.xml` (about 190 URLs), `/blog/rss.xml`, a 1200×630 social image, a web manifest, and an SEO audit in the Command Centre.

## AEO & GEO for service pages

Every service page leads with an **answer-first summary**: one 40–90-word paragraph with the price range, packages and timelines, written to be quoted by Google, ChatGPT, Perplexity and voice assistants. Below it are **key facts** and a **last updated** date.

**Structured data.** One source (`server/src/service-seo.js`) is shared by the crawler-rendered page and the React app:

| Type | Contents |
|---|---|
| `WebPage` | `dateModified`, plus `speakable` pointing at the answer |
| `Service` | Areas served (South Africa and its nine provinces), business audience, `AggregateOffer`, and an offer catalogue that includes the care plans |
| `HowTo` | The delivery process |
| `FAQPage` | Ten question-led FAQs (price, inclusions, timeline, which package, aftercare, payment, contract, location, getting started, POPIA) |

**Crawler-rendered pages** also carry a package comparison table, the process steps and the aftercare options.

**Markdown for AI.** Every service has a clean Markdown version at `/services/<slug>.md`. It is linked with `rel="alternate" type="text/markdown"` and listed in `llms.txt`.

## The Operator: internal business-management agent

**Command Centre → Operator** is the agency's back-office manager for a solopreneur. Every weekday from 07:30 SAST, and whenever you press **Run now**, it:

1. Reviews the business: enquiries waiting, unpaid orders, overdue invoices, revenue and recurring income, overdue milestones, support tickets past target, client ratings, website traffic and sources, content freshness, and questions the assistant couldn't answer.
2. Prepares a short list of high-impact actions in these areas: sales, marketing, advertising, finance, delivery, support and retention. The kinds of action are:
   - emails to leads or clients
   - complete blog drafts
   - a week of social posts
   - ad campaign plans with a UTM tracking link
   - calls with talking points
   - tasks
3. Emails the team a **morning brief** (`operator.brief`).

**You stay in control.**
- Emails are only sent when a person clicks **Approve & send**. You can edit them first.
- Ad spend needs an admin. Campaigns are planned to fit **Monthly ad budget**. When you approve one, you get a tracking link, so results show under Growth.
- Blog posts are saved as drafts and are never published automatically.
- **Autonomy: Assist** auto-accepts internal work only (tasks, calls, social copy, drafts).
- Suggestions you dismiss aren't repeated for 14 days. Untouched proposals expire after 10 days.
- Secrets are stripped from proposals. Customer messages are treated as untrusted data, which protects against prompt injection.
- Manual runs are limited to 10 a day.

**Modes**

| Mode | When | What it does |
|---|---|---|
| AI | `ANTHROPIC_API_KEY` is set | Claude works through read tools (snapshot, lead detail, catalogue, recent posts, past decisions) and validated `propose_*` tools. It writes bespoke drafts and learns from what you approve or dismiss. |
| Rules | No key, or the AI call fails | Deterministic best-practice checks, with templated drafts. This is free and always available. |

**Settings**
- Command Centre: on/off, autonomy, monthly ad budget, standing focus.
- Environment: `OPERATOR_MODEL` (default `claude-opus-5-5`), `OPERATOR_EFFORT` (default `medium`), and `OPERATOR_AI=off` to force rules mode.

**Code:** `server/src/operator/` (`snapshot.js`, `actions.js`, `rules.js`, `agent.js`) and `client/src/pages/admin/Operator.jsx`.

## Communications plan

The written plan is in [`COMMUNICATIONS.md`](COMMUNICATIONS.md); the system enforces it through `server/src/communications.js`.

**Touchpoints.** Every automated message is a touchpoint with a stage, audience, trigger and timing.

**Business hours.** Nudges and digests are held for SA business hours: Mon–Fri 08:00–17:00 SAST, excluding public holidays (calculated, including Easter dates).

**Follow-ups** (the `comms-followups` job):
- one follow-up to enquiries with no order after 3 days
- payment nudges at 24 hours and 3 days (2 at most)
- a Monday progress update for active projects
- a daily team digest of enquiries waiting more than a business day

**Command Centre → Communications plan** lists every message with its 30-day volume and a preview, and switches optional ones off. Essential messages (receipts, security, replies) can't be switched off.

## Business services: billing, accounting, booking, agreements, credential safety

**Automatic monthly payments (PayFast Subscriptions).**
- **Opting in:** when a client pays a retainer or care-plan invoice with PayFast, they can tick *Pay automatically every month*. PayFast tokenises the card, and the checkout is signed with the subscription fields (monthly, until cancelled).
- **Monthly charges:** each charge arrives as an ITN carrying the subscription token. It settles that order's oldest unpaid invoice, and starts the month's cycle early if PayFast charged first.
- **Exceptions:** duplicates, mismatched amounts and charges with nothing due are logged and alerted, never silently kept.
- **Stopping:** clients or staff stop automatic payments from the order page through the PayFast API (PUT `/subscriptions/{token}/cancel`, signed headers). Cancelling or completing an engagement stops them too.
- **Setup:** recurring billing must be enabled on your PayFast merchant account. Instant EFT (Ozow) is paid manually each month.
- **Security:** the subscription token is never sent to the browser.

**Accounting.**
- **Tax invoices:** every invoice has a printable page that you can save as a PDF from the browser. When VAT-registered it is a SARS-compliant *Tax Invoice* with the supplier's and recipient's names, addresses and VAT numbers, the serial number, the date, and the VAT charged. Clients add their billing address and VAT number in Account settings.
- **Xero:** go to Command Centre → **Integrations** → *Connect Xero*. This uses OAuth 2 with Xero's granular scopes, and the tokens are stored AES-256-GCM encrypted.
  - The **accounting-sync** job then pushes contacts, invoices (`ACCREC`, authorised), payments (to your bank account code) and voids, once each. Failures retry up to 5 times and are shown on the page.
  - Account codes and the tax type are settings.
- **Exports without Xero:** a Xero import CSV and a Sage/general CSV for any date range.

**Booking.** Set a Cal.com, Calendly or Microsoft Bookings link in Integrations. It appears on the Contact page (embedded for Cal.com and Calendly) and in the enquiry auto-reply.

**Service agreements.**
- **When required:** once-off packages from R15 000, and monthly retainers. Both thresholds are configurable.
- **What the client sees:** a plain-language agreement generated from the package, the brief and the standard terms (scope, fees, approvals, IP, POPIA operator terms, cancellation and CPA, liability, ECTA). It must be signed before the first payment.
- **Audit trail:** the client signs by typing their name. The system records their account, email, time, IP address, browser, and the SHA-256 of the exact text. The client and the team get a copy by email.
- **Smaller orders:** the terms accepted at checkout are recorded as an acceptance.
- **Before launch:** have `server/src/agreements.js` reviewed by an attorney.

**Credential guard.**
- **What it removes:** passwords, card numbers (Luhn-checked), SA ID numbers (checksum and date) and API or private keys.
- **Where:** messages, tickets, onboarding answers, enquiries and chat, before anything is stored or sent to the AI.
- **What happens next:** the user sees why, together with the secure-sharing guidance (a setting), and an activity event is logged. Keep client logins in a team password manager such as Bitwarden Teams or 1Password Business.

## Launch hardening: backups, alerts, CI, analytics

**Off-site backups.** The daily backup job always writes a local snapshot (latest 7 kept). When `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY` are set, it also gzips the snapshot and uploads it to S3-compatible storage. That can be AWS S3 in Cape Town (`BACKUP_S3_REGION=af-south-1`), or Cloudflare R2 or Backblaze B2 (set `BACKUP_S3_ENDPOINT`). The latest 30 copies are kept (`BACKUP_S3_KEEP`). A failed upload alerts the team. Command Centre → System warns while off-site backups are off.

To restore, download the newest `hipcastle-*.db.gz`, `gunzip` it, stop the app, replace `/data/hipcastle.db`, then start the app.

**Alerts.** Any error-level event emails the team inbox (`system.alert`). Error-level events include server errors, crashed background jobs, failed backups, unhandled exceptions and browser crashes reported by the React error boundary. If `ALERT_WEBHOOK_URL` is set (a Slack, Discord or Google Chat incoming webhook), the alert also goes there. Each problem type alerts at most once every 15 minutes.

**Uptime.** `/api/health` checks the database and returns 503 if it can't answer. Fly uses it to restart a sick machine. Point a free external monitor at `https://www.hipcastle.agency/api/health` every 1–5 minutes so you hear about full outages too, e.g. UptimeRobot or Better Stack.

**CI.** `.github/workflows/webapp-ci.yml` runs on every pull request and push to `main`. It runs the API tests, the production build and a production dependency audit (high severity).

**Analytics and attribution (POPIA-friendly).**
- The app sends a first-party beacon on each page view. It counts views and daily-unique visitors per page and per source, without cookies.
- Visitors are counted by a hash of IP and browser plus a salt that changes daily. The salt is never stored, and the hashes are deleted after 2 days.
- Bots, Do Not Track and Global Privacy Control are respected, and staff pages aren't counted.
- The visitor's first touch (UTM tags or referring site) stays in their browser. It is sent with enquiries, chat handoffs, sign-ups and orders as `X-Attribution`, and stored on those records.
- Tag the links you share, e.g. `?utm_source=whatsapp&utm_medium=status&utm_campaign=launch`.

**Frontend.**
- An error boundary keeps a crash on one page from blanking the site, and reports the crash to the server.
- The portal, checkout and Command Centre are split into chunks that load on demand. A visitor's first load is about 20% smaller.

## Brand assets

`client/public` holds the brand assets:

| File | What it is |
|---|---|
| `brand/hipcastle-logo{,-128,-192}.{png,webp}` | The full logo, transparent, at several sizes. |
| `logo.png` | Used in emails and as the Organization logo for search engines. |
| `favicon.svg` | The icon mark: the logo's blue/gold C-ring with an "H". |
| `icons/` | Favicon, Apple touch icon and app icons (192, 512 and maskable 512). |
| `og-image.png` | The 1200×630 social sharing card. |

The logo appears in the header, the footer, emails, the Command Centre sidebar, the assistant, the hero and the client portal. The logo blue is available as `--brand-blue` (links use the AA-safe `--brand-blue-text`).

## Quick start

Requires **Node.js 22.13 or later**.

```bash
cd webapp
npm run install:all
npm run dev          # API on :4000 and web app on http://localhost:5173
```

For the full server-rendered SEO experience locally, build and serve from Express:

```bash
npm run build && SITE_URL=http://localhost:4000 npm start   # http://localhost:4000
```

| Account | Email | Password |
|---|---|---|
| Admin | `admin@hipcastle.agency` | `ChangeMe123!` (set `ADMIN_PASSWORD` to override; the Command Centre warns until it is changed) |
| Demo client | `client@example.com` | `Client123!` |

On every boot the app imports agents and inserts any missing catalog entries. Prices edited in the Command Centre are kept. To reset copy and prices from `server/src/catalog.js`, run:

```bash
npm run seed -- --sync-catalog
```

### Production

**Step-by-step deployment to www.hipcastle.agency** (Fly.io Johannesburg, Render or your own VPS with automatic HTTPS) is in [`deploy/DEPLOY.md`](deploy/DEPLOY.md).

```bash
docker build -f webapp/Dockerfile -t hipcastle .      # from the repository root
docker run -p 4000:4000 -v hipcastle-data:/data --env-file webapp/.env hipcastle
```

See [`.env.example`](.env.example) for every setting.

### Tests

```bash
npm test
```

There are 83 API integration tests, run against an in-memory database. They cover:
- 3 rand tiers per service
- FAQs and reviews on service pages
- Lead consent and testimonial moderation
- PayFast signature encoding
- A full journey with VAT, a **signed PayFast ITN** (tampered signature rejected) and a **hashed Ozow notification** (bad hash rejected)
- The simulated gateway
- Client isolation
- The Command Centre: system, events, settings, pause orders, jobs, CSV export, blog, SEO audit
- Sitemap, robots.txt, llms.txt and RSS
- Canonical `www.hipcastle.agency` URLs and social handles
- Email queueing, branding and HTML escaping
- Password reset (no account enumeration, single-use tokens)
- Signed newsletter unsubscribe
- Delivery pipelines: full project journey, revision limits, balance invoice, feedback, retainer cycles, watch job and board
- Launch hardening: health check, alerts (email + webhook, throttled), off-site backup upload and retention, price revision on existing databases, market price bands, analytics beacon (bots/DNT/staff excluded), first-touch attribution through to paid orders, browser crash reports
- Care plans: three monthly tiers per service within SA price bands, checkout covering a delivered project, care pipeline and monthly reset, ticket priority boost, time logging and allowance emails, offer job, migration-safe catalog, SEO and assistant knowledge
- Customer service: knowledge base covers every service and price, FAQ answers, a mocked Claude stream (model, prompt caching, fallbacks, refusals, error fallback), feedback, handoff, ticket lifecycle with SLA, CSAT, access control and retention jobs

## Database schema

Defined in [`server/src/schema.sql`](server/src/schema.sql):

```
users ─┬─< orders >── service_tiers >── services >─< service_agents >─< agents
       │     ├─< milestones
       │     ├─< invoices ─< payments          (PayFast / Ozow attempts)
       │     └─< messages
leads >── services     testimonials >── services     posts     settings     events (audit log)
newsletter_subscribers     emails (outbox queue)     password_resets
orders ─< onboarding_items (questionnaire & checklist)
orders ─< care_time (care plan hours)     orders.covers_order_id → the project a care plan looks after
users ─< tickets ─< ticket_messages     chat_sessions ─< chat_messages (→ leads on handoff)
```

## Before launch checklist

- [ ] Point `hipcastle.agency` and `www.hipcastle.agency` DNS at your host and enable HTTPS.
- [ ] Set `JWT_SECRET` and `ADMIN_PASSWORD`, and set `SEED_DEMO=false`. `SITE_URL` defaults to `https://www.hipcastle.agency`.
- [ ] Set up the `hello@`, `accounts@` and `admin@hipcastle.agency` mailboxes, SPF, DKIM and DMARC, and the SMTP variables. Send a test from Command Centre → Emails.
- [ ] Claim the `hipcastleagency` / `hipcastle-agency` social handles listed above, or update the URLs in Settings.
- [ ] Add live PayFast and Ozow credentials, then set `PAYMENTS_MODE=live`. Run one small live payment end to end.
- [ ] In **Command Centre → Settings**:
  - [ ] Real phone, WhatsApp, street address, CIPC and VAT numbers.
  - [ ] VAT registration status.
- [ ] Replace the four sample testimonials with real client reviews.
- [ ] Have the Privacy and Terms pages reviewed by your legal adviser. Register your Information Officer with the Information Regulator.
- [ ] Create a Google Business Profile with the same name, address and phone, and submit `/sitemap.xml` in Google Search Console.
- [ ] Review the care plan prices and included hours in Command Centre → Services & pricing, and decide who on the team owns care work.
- [ ] Enable recurring billing on your PayFast account; create a Xero Web app and connect it (Integrations); set your booking link; have the service agreement reviewed by an attorney; set up a team password manager.
- [ ] Create an S3/R2/B2 bucket and add the `BACKUP_S3_*` secrets; run Command Centre → System → Database backup once and check the file arrives.
- [ ] Set up a free uptime monitor on `/api/health` and (optionally) `ALERT_WEBHOOK_URL` for chat alerts.
- [ ] Optional: add `ANTHROPIC_API_KEY` to switch the assistant to AI answers, then check Command Centre → Assistant chats.
- [ ] Back up `data/` regularly; a daily snapshot is also written to `data/backups`.
