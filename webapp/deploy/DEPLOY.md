# Deploying Hipcastle Agency to www.hipcastle.agency

This guide takes the app from this repository to a live site at **https://www.hipcastle.agency**.

There are three ready-to-use hosting options. Pick one:

| | Option | Best for | Region | Approx. cost* | Files |
|---|---|---|---|---|---|
| **A** | **Fly.io** (recommended) | Lowest latency for SA visitors, push-to-deploy | Johannesburg (`jnb`) | a few US$/month | [`fly.toml`](fly.toml), [`.github/workflows/deploy-fly.yml`](../../.github/workflows/deploy-fly.yml) |
| **B** | **Render** | Click-through setup, auto-deploys from GitHub | Frankfurt | Starter instance + disk | [`/render.yaml`](../../render.yaml) |
| **C** | **Your own VPS** | Full control (Hetzner, DigitalOcean, Afrihost, AWS Cape Town…) | Your choice | VPS price | [`vps/`](vps/) |

\*Check each provider's current pricing. The app needs **one always-on instance with a persistent disk**, because it uses a SQLite database plus background jobs for email, payments and backups. Don't scale it to more than one instance.

---

## Step 0 — Before any option

1. **Register the domain.** `hipcastle.agency` was **not registered** when these files were written. Buy it from any registrar that sells `.agency`, for example Domains.co.za, Namecheap, Cloudflare or GoDaddy.
2. **Generate secrets** and keep them in a password manager:
   ```bash
   openssl rand -hex 32        # JWT_SECRET
   ```
   Also choose a strong `ADMIN_PASSWORD` for `admin@hipcastle.agency`.
3. **Create mailboxes** `hello@`, `accounts@` and `admin@hipcastle.agency` with your email provider, and note its SMTP settings. See *Email* in [`../README.md`](../README.md).

### Environment variables

[`../.env.example`](../.env.example) documents every variable. The minimum for launch:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (already set in every option) |
| `SITE_URL` | `https://www.hipcastle.agency` (already set) |
| `DATABASE_PATH` | `/data/hipcastle.db` (already set) |
| `JWT_SECRET` | **required**, a long random string |
| `ADMIN_PASSWORD` | **required**, password for `admin@hipcastle.agency` on first boot |
| `SEED_DEMO` | `false` (already set; no demo client in production) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | your mailbox's SMTP details. Without them, emails are only logged |
| `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` | from PayFast → Settings → Integration |
| `OZOW_SITE_CODE`, `OZOW_PRIVATE_KEY`, `OZOW_API_KEY` | from the Ozow merchant dashboard |
| `PAYMENTS_MODE` | start with `sandbox`; switch to `live` after a successful test payment |

---

## Option A — Fly.io (Johannesburg)

### A1. One-click deploy from GitHub (recommended)

The workflow [`.github/workflows/deploy-fly.yml`](../../.github/workflows/deploy-fly.yml) does everything on its first run:
- creates the app and the 1 GB database volume in `jnb`
- generates `JWT_SECRET` and copies your secrets to Fly
- builds and deploys a single machine
- requests HTTPS certificates for `www.hipcastle.agency` and `hipcastle.agency`
- runs a health check and prints the exact GoDaddy DNS records in the run summary

1. Create a Fly.io account at <https://fly.io> and add a payment method (Fly requires one for apps with volumes).
2. Create an **org token**: either run `fly tokens create org personal`, or go to the Fly dashboard → **Tokens** → create an organisation token. A deploy token isn't enough for the first run, because the app has to be created.
3. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `FLY_API_TOKEN`: the org token
   - `ADMIN_PASSWORD`: the password for `admin@hipcastle.agency`, at least 10 characters (the server refuses to start in production without it)
   - optional: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to turn on Cloudflare Turnstile bot protection
   - optional: `ANTHROPIC_API_KEY` to switch the homepage assistant from FAQ mode to AI answers (repository *variables* `CHATBOT_MODEL` and `CHATBOT_EFFORT` tune it)
   - optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, PayFast and Ozow keys (they can be added later; just re-run the workflow)
4. Go to **Actions → Deploy Hipcastle to Fly.io → Run workflow**.
5. Open the finished run's **Summary** and add the DNS records it lists in GoDaddy. HTTPS starts working once DNS has propagated.
6. Optional: set the repository variable `FLY_DEPLOY=true` to redeploy automatically on every push to `main` that changes `webapp/`.

Optional repository **variables**:
- `FLY_APP`, if the name `hipcastle` is taken on Fly
- `FLY_ORG`
- `FLY_REGION`, default `jnb`
- `PAYMENTS_MODE`, default `sandbox`; set to `live` with live keys

### A2. Manual deploy from your computer

1. Install the CLI and sign in: <https://fly.io/docs/flyctl/install/>, then run `fly auth login`.
2. From the **repository root**, create the app and its storage volume:
   ```bash
   fly apps create hipcastle
   fly volumes create hipcastle_data --region jnb --size 1 --config webapp/deploy/fly.toml
   ```
   If the name `hipcastle` is taken, choose another and update `app =` in `fly.toml`.
3. Set the secrets (repeat for SMTP, PayFast and Ozow when you have them):
   ```bash
   fly secrets set --config webapp/deploy/fly.toml \
     JWT_SECRET="$(openssl rand -hex 32)" ADMIN_PASSWORD='your-strong-password' \
     SMTP_HOST=smtp.example.com SMTP_PORT=587 SMTP_USER=hello@hipcastle.agency SMTP_PASS='…'
   ```
4. Deploy:
   ```bash
   fly deploy . --config webapp/deploy/fly.toml --dockerfile webapp/Dockerfile
   ```
5. Add the domain and certificates:
   ```bash
   fly certs add www.hipcastle.agency --config webapp/deploy/fly.toml
   fly certs add hipcastle.agency --config webapp/deploy/fly.toml
   fly ips list --config webapp/deploy/fly.toml
   ```
6. **DNS** at your registrar:
   - `www` → `CNAME` → `hipcastle.fly.dev`
   - `@` (apex) → `A` → the IPv4 from `fly ips list`, and `AAAA` → the IPv6
   - Check progress with `fly certs show www.hipcastle.agency --config webapp/deploy/fly.toml`.
7. **Optional: auto-deploy on every push to `main`.**
   - Create a deploy token: `fly tokens create deploy --config webapp/deploy/fly.toml`.
   - In GitHub, go to **Settings → Secrets and variables → Actions**. Add the secret `FLY_API_TOKEN` and the variable `FLY_DEPLOY=true`.
   - The workflow runs the tests and builds the client first, and only deploys if they pass.

Useful commands:
- Logs: `fly logs --config webapp/deploy/fly.toml`
- Shell on the server: `fly ssh console --config webapp/deploy/fly.toml`

## Option B — Render

1. In Render, choose **New → Blueprint**, connect GitHub, and select this repository. Render reads [`/render.yaml`](../../render.yaml).
2. Fill in the values marked **sync: false**: `ADMIN_PASSWORD`, SMTP, PayFast and Ozow. `JWT_SECRET` is generated automatically.
3. Apply the Blueprint. Render builds `webapp/Dockerfile`, attaches a 1 GB disk at `/data`, and auto-deploys on every push to `main`.
4. In the service's **Settings → Custom Domains**, `www.hipcastle.agency` and `hipcastle.agency` are listed. Add the DNS records Render shows (usually a `CNAME` for `www` and an `A` record for the apex). Certificates are issued automatically.
5. In Render, make `www.hipcastle.agency` the primary domain, so the apex redirects to it. The app also redirects apex to www itself.

## Option C — Your own VPS (Docker + Caddy)

Requirements: Ubuntu 22.04 or 24.04 (or similar) with at least 1 GB RAM, Docker Engine with the compose plugin, and ports 80 and 443 open.

1. **DNS first**, so Caddy can get certificates:
   - `@` (apex) → `A` → your server's IPv4
   - `www` → `A` → the same IPv4. Add `AAAA` records too if the server has IPv6.
2. On the server:
   ```bash
   git clone https://github.com/thokozaninkwanyana113-droid/hipcastle-agency-agents.git
   cd hipcastle-agency-agents
   cp webapp/.env.example webapp/.env && nano webapp/.env   # set JWT_SECRET, ADMIN_PASSWORD, SMTP, gateways
   ./webapp/deploy/vps/deploy.sh
   ```
   Caddy obtains Let's Encrypt certificates for both names and redirects `hipcastle.agency` to `https://www.hipcastle.agency`.
3. **Update later** by running `./webapp/deploy/vps/deploy.sh` again. It pulls `main`, backs up the database to `backups/`, rebuilds, restarts and waits for the health check.
4. **Logs**: `docker compose -f webapp/deploy/vps/docker-compose.yml logs -f app`.

---

## After the first deploy — launch checklist

1. **Health:** `curl https://www.hipcastle.agency/api/health` should return `{"ok":true}`.
2. **Redirects:** `curl -I http://hipcastle.agency` should return `301 → https://www.hipcastle.agency/`.
3. **Sign in** at `https://www.hipcastle.agency/login` as `admin@hipcastle.agency` with your `ADMIN_PASSWORD`. Open **Command Centre → System & processes** and clear every ⛔ and ⚠️ warning.
4. **Settings:** enter the real phone and WhatsApp numbers, street address, CIPC and VAT numbers, VAT status and social URLs.
5. **Email:** in **Command Centre → Emails**, click **Check SMTP connection**, then **Send test**. Confirm the test lands in an inbox, not spam (SPF, DKIM and DMARC).
6. **Payment notification URLs** are sent with each checkout, so no dashboard setup is needed for them:
   - PayFast ITN: `https://www.hipcastle.agency/api/payments/payfast/notify`
   - Ozow: `https://www.hipcastle.agency/api/payments/ozow/notify`
   - In the Ozow dashboard, allow the domain if your account requires it.
7. **Test payment** with sandbox credentials. When a test payment completes, set `PAYMENTS_MODE=live` with live credentials and make one small real payment.
8. **SEO:**
   - Add the site in Google Search Console and Bing Webmaster Tools, and submit `https://www.hipcastle.agency/sitemap.xml`.
   - Create a Google Business Profile with the same name, phone and address as in Settings.
9. **Content:** replace the sample testimonials, and review the Privacy and Terms pages with a legal adviser.

## Backups & restore

- The app writes a consistent snapshot to `/data/backups` every 24 hours and keeps the last 7. The VPS `deploy.sh` also saves a backup to `backups/` before each deploy.
- **Off-site copies.** Disk failure or account loss can take out the snapshots along with the database, so copy them elsewhere regularly:
  - Fly: `fly ssh sftp get /data/backups/<file> --config webapp/deploy/fly.toml`
  - Render: use the Shell tab
  - VPS: copy the `backups/` folder
- **Restore:** stop the app, replace `/data/hipcastle.db` with a backup (and delete any `hipcastle.db-wal` / `-shm` files), then start the app.

## What was verified before shipping these files

- The production build steps (`npm ci` for client and server, client build, runtime start with the container's command and environment) were run on a clean copy of the repository:
  - Health check, home page and canonical `https://www.hipcastle.agency` tags all worked.
  - `hipcastle.agency` gave a 301 redirect; HSTS and CSP headers were present.
  - The admin login used `ADMIN_PASSWORD`, no demo account was created, and the app shut down cleanly on SIGTERM.
- `fly.toml`, `render.yaml`, the GitHub workflow and `docker-compose.yml` parse correctly, and `docker compose config` resolves the build context.
- **Not verified:**
  - An actual `docker build`. Docker wasn't available in the environment where these files were written.
  - The Caddyfile against Caddy itself.
  - Deploys to Fly or Render, which need your accounts.

  Run `docker build -f webapp/Dockerfile -t hipcastle .` locally once to confirm the image builds.
