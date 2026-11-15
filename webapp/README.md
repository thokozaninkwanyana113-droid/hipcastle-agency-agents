# 🏰 Hipcastle Agency — Web App

A full-stack web app for running a services agency. It is built on the agent roster in this repository: each agent division becomes a **service line**, and each service line is sold in **three tiers**.

| Layer     | Stack |
|-----------|-------|
| Frontend  | React 19, React Router 7, Vite. Plain CSS design system, responsive, accessible |
| Backend   | Node.js 22 and Express REST API, JWT auth, bcrypt, zod validation, helmet, rate limiting |
| Database  | SQLite through Node's built-in `node:sqlite` (no native builds). The schema works on PostgreSQL too |

## What's inside

**Public site**
- **Header**: announcement bar, logo, Services mega-menu (all 14 services), Pricing, Specialists, About, Contact, sign-in and CTA buttons, mobile menu.
- **Hero**: headline, two CTAs, live stats from the API (services, tiers, specialists) and an animated "NEXUS" orbit of agents.
- **Footer**: CTA band, newsletter sign-up (saved to the database), service and company links, contact details, legal links.
- **Home page**: services grid, three-tier explainer, process steps, featured specialists, testimonials, FAQ.
- **Service pages**: description, outcomes, the **3 tier cards**, a feature comparison table, and the specialists who staff the service.
- **Pricing**: all 42 packages, filterable by service.
- **Specialists**: searchable directory of the 162 agents, imported from the markdown files in this repo. Each has a full profile page.
- **Contact / consultation form**: creates a lead in the CRM.

**Client portal** (`/portal`)
- Register or sign in, choose a tier, submit a brief, and the order is placed.
- Placing an order creates milestones and an invoice automatically: a 50% deposit for projects, or the first month for retainers.
- Pay invoices (simulated checkout), follow progress and milestones, and message the agency team.

**Admin and operations dashboard** (`/admin`, for staff and admins)
- **Overview**: revenue collected, amount outstanding, overdue invoices, active engagements, new leads, pipeline value by service and by tier.
- **Engagements**: filter by status. Each engagement has staff controls to change status and due date, tick off milestones (progress updates automatically) and issue invoices.
- **Leads**: a small CRM pipeline (new → contacted → qualified → won/lost).
- **Users**: clients with their lifetime value. Admins can change roles (client, staff, admin).
- **Invoices**: mark invoices paid, unpaid or void, and see which are overdue.
- **Catalog**: edit tier name, price, delivery time, features and the "most popular" flag.

## Services and tiers

Every service has **Essential**, **Growth** (marked most popular) and **Enterprise** tiers. They are defined in [`server/src/catalog.js`](server/src/catalog.js) and can be edited from the admin catalog.

| Service | Agent division | Essential | Growth | Enterprise |
|---|---|---|---|---|
| ⚙️ Software Engineering | engineering | $2,500 | $8,500 | $24,000/mo |
| 🎨 Design & Brand | design | $1,500 | $4,800 | $12,000/mo |
| 📣 Growth Marketing | marketing | $1,200/mo | $3,900/mo | $9,500/mo |
| 💰 Paid Media | paid-media | $900/mo | $2,800/mo | $7,500/mo |
| 🤝 Sales Enablement | sales | $1,800 | $4,500/mo | $11,000/mo |
| 📊 Product Management | product | $2,000 | $5,200 | $10,500/mo |
| 🎬 Project Management | project-management | $1,400 | $3,600/mo | $8,800/mo |
| 🧪 Quality Assurance | testing | $1,100 | $3,400 | $7,800/mo |
| 🛟 Business Operations | support | $800/mo | $2,600/mo | $6,900/mo |
| 🎮 Game Development | game-development | $3,000 | $12,000 | $28,000/mo |
| 🥽 Spatial Computing & XR | spatial-computing | $3,500 | $14,000 | $30,000/mo |
| 📚 Research & Insights | academic | $1,000 | $3,200 | $7,000/mo |
| 🎯 Specialist Solutions | specialized | $2,200 | $7,500 | $16,000/mo |
| 🧭 Strategy & Orchestration | strategy (NEXUS) | $2,800 | $9,000 | $22,000/mo |

## Quick start

Requires **Node.js 22.13 or later**.

```bash
cd webapp
npm run install:all
npm run dev          # API on :4000 and web app on http://localhost:5173
```

On first start the database is created and seeded. It loads the service catalog and imports every agent in the repo.

| Account | Email | Password |
|---|---|---|
| Admin | `admin@hipcastle.agency` | `ChangeMe123!` (set `ADMIN_PASSWORD` to override) |
| Demo client | `client@example.com` | `Client123!` |

### Production

```bash
npm run build        # builds the client into client/dist
JWT_SECRET=... ADMIN_PASSWORD=... SEED_DEMO=false npm start   # Express serves both the API and the SPA on :4000
```

Or use Docker. Build from the repository root so the agent files are included:

```bash
docker build -f webapp/Dockerfile -t hipcastle .
docker run -p 4000:4000 -v hipcastle-data:/data -e JWT_SECRET=... -e ADMIN_PASSWORD=... hipcastle
```

See [`.env.example`](.env.example) for all settings. `npm run seed` re-syncs the catalog and agents at any time. It is safe to run more than once.

### Tests

```bash
npm test
```

API integration tests use an in-memory database. They cover the catalog (3 tiers per service), agent import, lead capture, the full client journey (register → order → pay → message), access control between clients and staff, and staff operations.

## Database schema

Defined in [`server/src/schema.sql`](server/src/schema.sql):

```
users ─┬─< orders >── service_tiers >── services >─< service_agents >─< agents
       │     ├─< milestones
       │     ├─< invoices
       │     └─< messages >── users
leads >── services     testimonials     newsletter_subscribers
```

## API overview

| Method | Path | Access |
|---|---|---|
| GET | `/api/services[?include=tiers]`, `/api/services/:slug` | public |
| GET | `/api/agents[?q=&service=]`, `/api/agents/:slug` | public |
| GET | `/api/stats`, `/api/testimonials` | public |
| POST | `/api/leads`, `/api/newsletter` | public |
| POST | `/api/auth/register`, `/api/auth/login` · GET/PATCH `/api/auth/me` | public / user |
| GET/POST | `/api/orders` · GET `/api/orders/:id` | owner or staff |
| POST | `/api/orders/:id/messages`, `/cancel`, `/invoices/:invId/pay` | owner or staff |
| PATCH | `/api/orders/:id`, `/api/orders/:id/milestones/:mid` · POST `/api/orders/:id/invoices` | staff |
| GET/PATCH | `/api/admin/overview`, `/leads`, `/users`, `/invoices`, `/tiers/:id`, `/staff` | staff (role and tier edits: admin only) |

## Going live checklist

- Set a strong `JWT_SECRET` and `ADMIN_PASSWORD`, and set `SEED_DEMO=false`.
- Replace the simulated payment in `routes/orders.js` (`/invoices/:id/pay`) with Stripe, PayFast or Paystack checkout plus a webhook.
- Add transactional email (order confirmation, new-lead alerts), for example Resend or SendGrid.
- To change currency, set `VITE_CURRENCY` (for example `ZAR`) and adjust the prices in `catalog.js`.
- For multi-instance hosting, move to PostgreSQL. The schema only needs `AUTOINCREMENT` changed to `GENERATED ALWAYS AS IDENTITY` and `datetime('now')` changed to `now()`.
