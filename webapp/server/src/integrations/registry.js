// Every delivery integration, what it's for, and whether it's set up — shown in Command Centre → Integrations.
import { googleConfigured, googleServiceEmail } from './google.js';
import { githubConfigured } from './github.js';
import { metaAdsConfigured, whatsappConfigured } from './meta.js';
import { m365Configured } from './m365.js';
import { recraftConfigured } from '../design/recraft.js';
import { figmaConfigured } from '../design/figma.js';

export function registry() {
  return [
    { id: 'monitor', name: 'Website monitoring (built in)', services: ['Software Engineering', 'Care plans'], configured: true, cost: 'Free',
      what: 'Checks client sites every 5 minutes, tracks uptime and response time, warns before TLS certificates expire, and alerts the team when a site goes down.', env: [],
      setup: ['Add the site URL on the engagement (Integrations panel).'] },
    { id: 'pagespeed', name: 'Google PageSpeed Insights', services: ['Software Engineering', 'Quality Assurance', 'Digital Marketing & SEO'], configured: Boolean(process.env.PAGESPEED_API_KEY), cost: 'Free (25 000 tests/day with a key)',
      what: 'Speed, accessibility, best-practice and SEO scores with what to fix first — attached to the client’s reports.', env: ['PAGESPEED_API_KEY'],
      setup: ['Google Cloud → APIs & Services → enable “PageSpeed Insights API” → Credentials → create an API key (restrict it to that API). Keyless requests share a public quota that is usually exhausted.'] },
    { id: 'google', name: 'Google Search Console & Analytics (GA4)', services: ['Digital Marketing & SEO', 'Paid Advertising'], configured: googleConfigured(), cost: 'Free',
      what: 'Monthly search clicks, impressions, top queries and pages, visitors, channels and conversions in the client’s portal.', env: ['GOOGLE_SERVICE_ACCOUNT_JSON'],
      setup: ['Google Cloud → create a project → enable “Google Search Console API” and “Google Analytics Data API”.', 'Create a service account → Keys → Add key (JSON). Store the file contents as GOOGLE_SERVICE_ACCOUNT_JSON.',
        `Ask each client to add ${googleServiceEmail() || 'the service account email'} as a user (Restricted) in Search Console and as a Viewer in GA4.`] },
    { id: 'github', name: 'GitHub', services: ['Software Engineering', 'Game Development'], configured: githubConfigured(), cost: 'Free',
      what: 'Commits, pull requests and releases from the project repository, shown to the client as live progress.', env: ['GITHUB_TOKEN'],
      setup: ['GitHub → Settings → Developer settings → Fine-grained token, read-only “Contents”, “Metadata” and “Pull requests” on client repos.'] },
    { id: 'meta_ads', name: 'Meta ads (Facebook & Instagram)', services: ['Paid Advertising'], configured: metaAdsConfigured(), cost: 'Free (ad spend is the client’s)',
      what: 'Spend, reach, clicks, CTR, cost per click and leads by campaign for the last 30 days. Read-only: nothing is changed in the ad account.', env: ['META_ACCESS_TOKEN', 'META_GRAPH_VERSION (optional)'],
      setup: ['Meta Business Suite → Business settings → System users → add a system user, assign the clients’ ad accounts (they share them with your business), generate a token with ads_read.'] },
    { id: 'whatsapp', name: 'WhatsApp Business (Cloud API)', services: ['All services'], configured: whatsappConfigured(), cost: 'Per-conversation Meta pricing (utility messages are low-cost in SA)',
      what: 'Approval requests, new invoices and support replies on WhatsApp for clients who opt in on their account page. Email still goes too.', env: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_LANG (optional, default en)'],
      setup: ['Meta Business → WhatsApp Manager → add and verify your business number.', 'Create three Utility templates (see README): hc_approval_needed, hc_invoice_issued, hc_support_reply. Wait for approval.', 'Use a system user token with whatsapp_business_messaging.'] },
    { id: 'm365', name: 'Microsoft 365 inbox', services: ['Sales', 'Business Operations'], configured: m365Configured(), cost: 'Included in Microsoft 365',
      what: 'Reads the shared inbox every 15 minutes and logs replies from leads and clients against them, so nobody’s reply is missed. Mail from strangers is ignored.', env: ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_MAILBOX'],
      setup: ['Microsoft Entra admin centre → App registrations → New registration.', 'API permissions → Microsoft Graph → Application → Mail.Read → Grant admin consent.', 'Restrict it to the one mailbox with an Exchange “application access policy”.', 'Certificates & secrets → new client secret.'] },
    { id: 'etenders', name: 'National Treasury eTenders', services: ['Sales & Tenders'], configured: true, cost: 'Free (public data)',
      what: 'Collects new government tenders daily and matches them to each Sales & Tenders client’s keywords; the team gets a daily digest of matches.', env: [],
      setup: ['Add tender keywords on the client’s engagement (e.g. “security, cleaning, Gauteng”).'] },
    { id: 'recraft', name: 'Recraft (AI logo concepts)', services: ['Design & Brand'], configured: recraftConfigured(), cost: '≈ US$0.08 per vector concept', what: 'Vector logo concepts in the design studio.', env: ['RECRAFT_API_TOKEN'], setup: ['recraft.ai → API → create a token and buy units.'] },
    { id: 'figma', name: 'Figma', services: ['Design & Brand', 'Product'], configured: figmaConfigured(), cost: 'Free (your Figma plan)', what: 'Link design files to engagements and import frames into the design studio.', env: ['FIGMA_TOKEN'], setup: ['Figma → Settings → Security → Personal access tokens (File content: read-only).'] },
  ];
}
