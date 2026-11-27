// Business settings stored in the database and editable from the Command Centre.
// Secrets (gateway keys, JWT secret) stay in environment variables, never here.
import { db } from './db.js';

export const DEFAULT_SETTINGS = {
  catalog_prices_version: 1,
  // Accounting (Xero) — account codes from your chart of accounts
  xero_sales_account: '200',                 // revenue account for sales
  xero_bank_account: '090',                  // bank account that receives PayFast/Ozow payouts
  xero_tax_type: 'OUTPUT',                   // Xero tax type for standard-rated (15%) sales; NONE when not VAT registered
  accounting_sync_from: '',
  // Booking: Cal.com, Calendly or Microsoft Bookings page for the free strategy session
  booking_url: '',
  // Service agreements: signature required before paying for once-off packages from this amount, and for monthly retainers
  agreement_min_cents: 1500000,
  agreement_for_retainers: true,
  // Credential guard: what clients are told instead of sending passwords
  secure_share_hint: 'Never send passwords in messages. Invite us as a user, or share a one-time link from a password manager (Bitwarden Send or 1Password) that expires.',                  // only sync invoices issued on/after this date (YYYY-MM-DD); blank = all                 // see PRICE_REVISION in catalog.js
  business_name: 'Hipcastle Agency',
  legal_name: 'Hipcastle Agency (Pty) Ltd',
  tagline: 'Specialist teams for South African entrepreneurs',
  website: 'https://www.hipcastle.agency',
  email: 'hello@hipcastle.agency',           // public contact address & default "from"
  notify_email: 'hello@hipcastle.agency',    // team inbox for new leads, orders, payments, reviews
  billing_email: 'accounts@hipcastle.agency',// reply-to on invoices, receipts and reminders
  emails_enabled: true,                      // master switch for customer emails
  phone: '+27 10 000 0000',
  whatsapp: '27100000000',              // international format, digits only
  address_locality: 'Johannesburg',
  address_region: 'Gauteng',
  street_address: '',
  postal_code: '',
  company_reg_no: '',
  vat_no: '',
  vat_registered: false,
  vat_rate: 15,
  office_hours: 'Mon–Fri, 08:00–17:00 SAST',
  announcement: '🇿🇦 Now booking — free 30-minute strategy session for SA founders.',
  orders_enabled: true,
  payfast_enabled: true,
  ozow_enabled: true,
  jobs_disabled: [],
  comms_disabled: [],
  staff_mfa_required: true,       // admin & staff must use two-step sign-in
  // The Operator (internal business-management agent)
  operator_enabled: true,
  operator_autonomy: 'suggest',              // suggest: everything needs approval · assist: internal drafts/tasks auto-approved (never emails or ad spend)
  operator_focus: '',                        // optional standing instruction, e.g. "Prioritise web projects in Durban this quarter"
  operator_monthly_ad_budget: 0,             // rand the Operator may plan ad campaigns around (0 = ask before proposing spend)                        // optional touchpoints switched off (see communications.js)
  social: {
    facebook: 'https://www.facebook.com/hipcastleagency',
    instagram: 'https://www.instagram.com/hipcastleagency',
    linkedin: 'https://www.linkedin.com/company/hipcastle-agency',
    x: 'https://x.com/hipcastleagency',
    tiktok: 'https://www.tiktok.com/@hipcastleagency',
    youtube: 'https://www.youtube.com/@hipcastleagency',
  },
  seo_default_description:
    'South African digital agency for entrepreneurs: websites, design, SEO, marketing, ads & sales. Fixed packages in rand — pay via PayFast or Ozow.',
};

export function getSettings() {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    try { out[r.key] = JSON.parse(r.value); } catch { /* ignore corrupt value */ }
  }
  return out;
}

export function updateSettings(patch) {
  const up = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    up.run(k, JSON.stringify(v));
  }
  return getSettings();
}

/** Settings safe to expose publicly. */
/**
 * Settings safe to expose publicly — an allowlist, so new internal settings (accounting codes,
 * thresholds, job and message switches, internal inboxes) are private by default.
 */
export const PUBLIC_SETTING_KEYS = [
  'business_name', 'legal_name', 'tagline', 'website', 'email', 'phone', 'whatsapp',
  'address_locality', 'address_region', 'street_address', 'postal_code', 'company_reg_no', 'vat_no', 'vat_registered', 'vat_rate',
  'office_hours', 'announcement', 'orders_enabled', 'social', 'seo_default_description', 'booking_url', 'secure_share_hint',
];
export function publicSettings() {
  const s = getSettings();
  return Object.fromEntries(PUBLIC_SETTING_KEYS.filter((k) => k in s).map((k) => [k, s[k]]));
}

/** Compute VAT on an amount in cents according to current settings. */
export function vatFor(subtotalCents, s = getSettings()) {
  return s.vat_registered ? Math.round((subtotalCents * Number(s.vat_rate || 0)) / 100) : 0;
}
