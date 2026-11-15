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
- **Floating WhatsApp button** on every public page.
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
- **VAT support**: when the business is VAT registered, invoices show subtotal, VAT and total.

### Command Centre (`/admin`, for staff and admins)

| Section | What you can monitor and manage |
|---|---|
| **Overview** | Live KPIs: 30-day revenue, outstanding and overdue invoices, active engagements, leads and win rate, payments, ratings. Also a revenue chart, pipeline by service and tier, a live activity feed and configuration alerts |
| **System & processes** | Uptime, memory, API request rates and p95 latency, busiest routes and recent errors. PayFast and Ozow status with notify URLs, database table sizes, config checks, and **background jobs** you can run or pause (expire abandoned payments, overdue invoice watch, daily database backup, log retention) |
| **Activity log** | Searchable audit trail: orders, payments, rejected gateway notifications, sign-ins and failed sign-ins, admin changes, exports |
| **Payments** | Every transaction, its raw gateway notification and manual reconciliation (with an audit note). CSV export |
| **Engagements / Leads / Users / Invoices** | Order pipeline, CRM with WhatsApp/call/email shortcuts, role management, invoice status. CSV exports |
| **Blog** | Markdown editor with preview, Google result preview and an SEO/AEO checklist; draft or publish |
| **Testimonials** | Approve, reject, feature or delete reviews |
| **Services & pricing** | Turn service lines on or off; edit tier prices, scope and features |
| **Subscribers** | Newsletter list (remove on request for POPIA), CSV export |
| **SEO, AEO & GEO** | Readiness score, per-page title, description and schema audit, links to crawler files |
| **Settings** | Business details (kept consistent with Google Business Profile), WhatsApp, social profiles, VAT, payment gateway toggles, pause orders, announcement bar |

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
| Admin | `admin@hipcastle.co.za` | `ChangeMe123!` (set `ADMIN_PASSWORD` to override; the Command Centre warns until it is changed) |
| Demo client | `client@example.com` | `Client123!` |

On every boot the app imports agents and inserts any missing catalog entries. Prices edited in the Command Centre are kept. To reset copy and prices from `server/src/catalog.js`, run:

```bash
npm run seed -- --sync-catalog
```

### Production

```bash
docker build -f webapp/Dockerfile -t hipcastle .      # from the repository root
docker run -p 4000:4000 -v hipcastle-data:/data --env-file webapp/.env hipcastle
```

See [`.env.example`](.env.example) for every setting.

### Tests

```bash
npm test
```

There are 11 API integration test groups, run against an in-memory database. They cover:
- 3 rand tiers per service
- FAQs and reviews on service pages
- Lead consent and testimonial moderation
- PayFast signature encoding
- A full journey with VAT, a **signed PayFast ITN** (tampered signature rejected) and a **hashed Ozow notification** (bad hash rejected)
- The simulated gateway
- Client isolation
- The Command Centre: system, events, settings, pause orders, jobs, CSV export, blog, SEO audit
- Sitemap, robots.txt, llms.txt and RSS

## Database schema

Defined in [`server/src/schema.sql`](server/src/schema.sql):

```
users ─┬─< orders >── service_tiers >── services >─< service_agents >─< agents
       │     ├─< milestones
       │     ├─< invoices ─< payments          (PayFast / Ozow attempts)
       │     └─< messages
leads >── services     testimonials >── services     posts     settings     events (audit log)     newsletter_subscribers
```

## Before launch checklist

- [ ] Set `JWT_SECRET`, `SITE_URL` and `ADMIN_PASSWORD`, and set `SEED_DEMO=false`.
- [ ] Add live PayFast and Ozow credentials, then set `PAYMENTS_MODE=live`. Run one small live payment end to end.
- [ ] In **Command Centre → Settings**:
  - [ ] Real phone, WhatsApp, street address, CIPC and VAT numbers.
  - [ ] Social profile URLs.
  - [ ] VAT registration status.
- [ ] Replace the four sample testimonials with real client reviews.
- [ ] Have the Privacy and Terms pages reviewed by your legal adviser. Register your Information Officer with the Information Regulator.
- [ ] Create a Google Business Profile with the same name, address and phone, and submit `/sitemap.xml` in Google Search Console.
- [ ] Back up `data/` regularly; a daily snapshot is also written to `data/backups`.
