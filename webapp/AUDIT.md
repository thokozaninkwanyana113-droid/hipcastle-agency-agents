# Hipcastle Agency — System Audit (16 Nov 2026)

## ✅ Status update: before-launch fixes done (branch `launch-fixes`)

| Item | Fix | Verified by |
|---|---|---|
| F1 fake reviews | Sample testimonials are seeded **only with demo data**. Production starts with none. | `launch.test.js` F1 |
| F2/F3 claims | Copy now says "a human-led team working with 160+ specialist AI playbooks; every deliverable reviewed by a person". This covers the hero, About, FAQ, meta, `llms.txt` and the AI playbooks pages. "Provinces served: 9" and "Trusted by…" were removed, and "all nine provinces" became "anywhere in South Africa". | `launch.test.js` F2/F3 |
| S1 payment cancel hole | The return URL is now read-only. Only the signed-in owner can cancel their own unfinished checkout. References have 64 random bits. | `launch.test.js` S1 |
| S2 sessions | `token_version` is stamped into every login token. A password change, a reset or "Sign out of all other devices" invalidates every older token. | `launch.test.js` S2 |
| S3 abuse | Hidden honeypot on all public forms; optional Cloudflare Turnstile; **double opt-in** newsletter (one confirmation email per address per 24h); one auto-reply per address per day; tighter rate limits. | `launch.test.js` S3 ×2 |
| S4 invoice status | Admin-only, and a reason is required and logged. | `launch.test.js` S4 |
| S5 URLs | Links must be `http(s)://`; `javascript:` and `data:` are rejected. | `launch.test.js` S5 |
| S6 CORS | Locked to the site (plus `CORS_ORIGIN`) in production. | `launch.test.js` S6 |
| S7 default password | Production refuses to start without `ADMIN_PASSWORD` (minimum 10 characters). | `launch.test.js` S7 |
| S10 stats | The project count was removed from `/api/stats`. | `launch.test.js` S10 |
| B1 double payments | New checkouts are refused while one is in progress (30 minutes). A duplicate completed payment is flagged "Refund needed", the team gets an email, and an admin can mark it refunded. | `launch.test.js` B1 |
| B2 reminders | Onboarding reminders are timed from the deposit, not the last edit. | `launch.test.js` B2 |
| Contrast | Muted, gold and badge colours updated. **0 axe violations on 16 public pages.** | axe-core re-run |

**Still open:** F4–F7 (real business details, SMTP provider, Fly secrets and DNS, live payment test) need your accounts. The other items in sections 3 and 5–6 are the post-launch roadmap.

---


**Scope:** `webapp/` on `main` at commit `dc908ad` (≈10 300 lines), plus the deployment setup.

**How it was audited:**
- The 20 API test groups and the production build
- `npm audit`
- Pattern scans of the code
- Live probes against a production-mode server with demo data off (`SEED_DEMO=false`)
- axe-core accessibility scans (WCAG 2.1 AA) on 9 public pages
- Manual code review

**Severity:** 🔴 Critical (fix before launch) · 🟠 High · 🟡 Medium · ⚪ Low

## Summary
| Area | Result |
|---|---|
| Automated tests | ✅ 20/20 pass |
| Dependency vulnerabilities | ✅ 0 (server and client) |
| SQL injection | ✅ All queries use parameters. The two interpolated identifiers are constants. |
| XSS | ✅ No `innerHTML`; React escaping; emails escaped; strict CSP (`script-src 'self'`) |
| Security headers | ✅ CSP, HSTS, X-Frame-Options, Referrer-Policy, COOP |
| Live deployment | ❌ Not live: the Fly token isn't set, DNS isn't pointed, and the Docker image has never been built |
| Confirmed bugs / vulnerabilities | 3 🔴 · 6 🟠 · 8 🟡 · 5 ⚪ |

---

## 1. Fake, simulated or unverified parts ("fake builds")

| # | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | 🔴 | **Made-up testimonials are published in production.** The four sample reviews ("Lerato M.", "Sipho N.", …) are seeded even when demo data is off. They're shown on the home, About and service pages and marked up as `Review` structured data. That risks the Consumer Protection Act and Google's review policies. | Probe: `/api/testimonials` with `SEED_DEMO=false` returned all 4 |
| F2 | 🔴 | **The "160+ specialist AI agents" aren't used by the app.** No code calls any AI model. The agents are milestone labels and profile pages. The hero, About page, FAQ and `llms.txt` say work is "delivered by" these agents. | No AI SDK or API calls anywhere in `server/src` |
| F3 | 🟠 | **Unverifiable trust claims:** "Trusted by South African businesses" (backed only by the fake reviews), "Provinces served: 9", NPS and ratings shown before any real clients. | `About.jsx:81`, `About.jsx:134` |
| F4 | 🟠 | **Placeholder business details:** the phone `+27 10 000 0000` and WhatsApp `27100000000` are used in click-to-call, the WhatsApp button, structured data and `llms.txt`. The street address is empty. The social handles may not exist yet. | Command Centre warning; `settings.js` |
| F5 | 🟠 | **Payments haven't been proven end to end:**<br>• PayFast's shared sandbox account can't verify notifications.<br>• Ozow has never been called live.<br>• No real payment notification has reached a deployed server. | Earlier test reports |
| F6 | 🟡 | **Email is log-only:** with no SMTP, nothing is delivered. Microsoft 365 password-based SMTP is being retired, so a transactional email provider is needed. | `/admin/emails/status` → `mode: log` |
| F7 | 🟡 | **Deployment is unverified:**<br>• The Docker image has never been built.<br>• The Caddy config has never been run.<br>• The Fly workflow fails at "Check token" because the secret is missing. | Workflow run `43938299409` |
| F8 | ⚪ | Blog articles are labelled "By Hipcastle Team", but no real author or experience is shown, which weakens Google's E-E-A-T signals. | `posts-seed.js` |

## 2. Security vulnerabilities (confirmed by probes)

| # | Sev | Finding | Fix |
|---|---|---|---|
| S1 | 🔴 | **Anyone can cancel another person's payment:** `GET /api/payments/return?ref=…&status=cancelled` needs no login and changes the payment status. The reference has only 24 random bits. | Make the return link read-only and let only the gateway notification change status. Lengthen the reference. |
| S2 | 🟠 | **Old sessions survive a password change or reset.** A token issued before the change still returned 200. | Add a `token_version` to users and include it in the JWT. Add "sign out everywhere". |
| S3 | 🟠 | **Email abuse vector:** the newsletter accepts unlimited addresses and sends a welcome email to each (12 out of 12 sent). Contact form auto-replies and registration welcome emails go to any address, with no bot protection. This harms domain reputation. | Double opt-in for the newsletter; honeypot plus Cloudflare Turnstile; rate-limit `/newsletter`. |
| S4 | 🟠 | **Staff can mark invoices paid or void and edit blog posts.** Only role changes, tier prices and settings are admin-only. | Make invoice status changes admin-only, with a reason. |
| S5 | 🟡 | **`javascript:` and `data:` URLs are accepted** for deliverable links and social URLs, because zod's `.url()` allows them. React 19 blocks them in `href`, but it's still unsafe data. | Allow only `https://` (and `http://`). |
| S6 | 🟡 | **CORS reflects any origin** (`origin: true`). Bearer tokens limit the impact. | Lock to `SITE_URL` in production. |
| S7 | 🟡 | **The admin password can be the default.** A deploy without `ADMIN_PASSWORD` creates `ChangeMe123!`, which a warning flags. | Refuse to start in production without it. Force a password change on first login. |
| S8 | 🟡 | **No two-factor authentication** for admin and staff accounts. | Add TOTP 2FA for staff. |
| S9 | ⚪ | The JWT is stored in `localStorage`, so any future XSS bug could steal it. The CSP reduces the risk. | Consider httpOnly cookies with CSRF protection. |
| S10 | ⚪ | `/api/stats` publicly reveals the number of projects. | Remove `projects` from it. |

## 3. Functional bugs

| # | Sev | Finding |
|---|---|---|
| B1 | 🟠 | **Double payment isn't detected.** If two checkouts for the same invoice both complete (PayFast and Ozow, or two tabs), the second is silently recorded as complete. Nothing flags a refund or credit. |
| B2 | 🟡 | **Onboarding reminder timing is wrong.** It's measured from the order's `updated_at`, which changes on every action, so reminders are delayed or skipped. It should be measured from the activation date. |
| B3 | 🟡 | **Manual status changes skip automation.** Staff manually setting "completed" doesn't issue the balance invoice or the feedback request. Setting "active" on an unpaid order skips onboarding. Completion is allowed with unpaid invoices. |
| B4 | 🟡 | **Retainers keep billing regardless of payment.** New months and invoices are created even when earlier months are unpaid; there's no dunning or pause. Clients can't give their 30-day cancellation notice in the portal, although the Terms promise it. |
| B5 | 🟡 | **Invoice numbers are random** (`INV-7A21C0`). There's no downloadable invoice or PDF, and no "Tax Invoice" layout with both VAT numbers, as SARS requires once VAT-registered. There are no credit notes or refunds. |
| B6 | ⚪ | Engagements created before pipelines existed show a null stage label (no crash). |
| B7 | ⚪ | Request metrics and job state are in memory, so they reset on every deploy or restart. |

## 4. Accessibility (axe-core, WCAG 2.1 AA)
Every public page fails **colour contrast** (3–20 elements per page). Nothing else failed.

| Element | Ratio | Needs |
|---|---|---|
| Muted grey text `#6b7390` on cream | 4.41:1 (4.08 on beige) | 4.5:1 |
| Gold "eyebrow" labels and tags `#b7791f` | 3.17–3.64:1 | 4.5:1 |
| Gold step numbers `#f2b544` on white | 1.83:1 | 3:1 |
| Ozow / PayFast / grey payment badges | 2.37–4.21:1 | 4.5:1 |

## 5. Performance & SEO

| # | Sev | Finding |
|---|---|---|
| P1 | 🟠 | **Every visitor downloads a single 456 KB JavaScript bundle** (133 KB gzipped) that includes the whole Command Centre and portal. Split the code by route. |
| P2 | 🟡 | **Fonts load from Google Fonts**: an extra connection, render-blocking, and visitor data sent to Google. Self-host the fonts. |
| P3 | 🟡 | **162 thin agent pages are in the sitemap.** Their pre-rendered content is one line each, which dilutes crawl budget. Either render the full profile on the server, or `noindex` them and drop them from the sitemap. |
| P4 | 🟡 | **No analytics or Search Console verification**, so there's no way to measure traffic, conversion or rankings. |
| P5 | ⚪ | **Every blog post shares one sharing image.** There are no per-post images, author pages or `Person` markup. |

## 6. Missing features that would make Hipcastle hard to ignore

**Sell more**
1. **Book a call from the website** (calendar booking with Google/Microsoft calendar and WhatsApp confirmation), instead of filling in a form and waiting.
2. **Portfolio and case studies** with real results in rand, client logos and photos. This is the biggest credibility gap.
3. **Quotes and proposals:** staff turn a lead into a custom quote the client can accept and pay. Today only fixed packages can be bought.
4. **Contracts and e-signature** at checkout, for scope, IP and POPIA operator terms.
5. **Promo codes, bundles and referrals**, e.g. Engineering + Design, "refer a founder, get 10% off".
6. **Real AI agents** (closes F2): run the repo's agent prompts through an LLM to draft deliverables (copy, SEO audits, sales sequences) for a human to review. That makes the "160+ specialists" claim true.

**Deliver better**

7. **File uploads** for onboarding assets and deliverables (S3-compatible storage), instead of links only.
8. **Assigning people:** named human leads per engagement and milestone (the `assigned_to` field exists but has no UI), time tracking and profitability.
9. **Team access for clients:** invite colleagues to an engagement.
10. **In-app notifications** (and optional WhatsApp Business API messages) alongside email.

**Get paid reliably**

11. **PayFast subscriptions or debit orders for retainers**, with dunning, suspension and a 30-day cancellation flow.
12. **Sequential tax invoices as PDFs**, credit notes and refunds; export to Xero or Sage.

**Run safely**

13. **CI on every pull request** (tests, lint, build, Docker build). Today tests only run inside the deploy workflow.
14. **Error monitoring and uptime alerts** (e.g. Sentry and an external uptime check).
15. **Off-site encrypted backups** (e.g. nightly to S3 or Backblaze). Today backups sit on the same volume as the database.
16. **POPIA self-service:** clients download or delete their data. A PAIA manual page. Legal review of the Privacy and Terms pages.
17. **Front-end tests and linting**; 2FA for staff (S8).
18. **Languages:** isiZulu and Afrikaans versions of the key pages.

---

## Recommended fix order
1. **Before launch:**
   - F1 remove fake reviews
   - S1 payment-cancel hole
   - S2 session revocation
   - S3 abuse protection
   - S4 admin-only invoice status
   - S7 no default admin password
   - B1 double payments
   - colour contrast
   - correct the F2/F3 claims (or build #6)
2. **Launch week:**
   - Real business details (F4)
   - SMTP provider (F6)
   - Fly secrets and DNS (F7)
   - An end-to-end PayFast and Ozow live test (F5)
   - Analytics and Search Console (P4)
   - Off-site backups (#15)
   - CI (#13)
3. **Next 30 days:**
   - Code-splitting and self-hosted fonts (P1, P2)
   - Tax invoices (B5, #12)
   - Retainer subscriptions and dunning (B4, #11)
   - Booking (#1), case studies (#2), quotes (#3), file uploads (#7)
4. **Then:** real AI agent drafting (#6), 2FA, multilingual pages, referrals.
