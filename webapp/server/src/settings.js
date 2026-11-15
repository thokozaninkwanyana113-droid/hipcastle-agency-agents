// Business settings stored in the database and editable from the Command Centre.
// Secrets (gateway keys, JWT secret) stay in environment variables, never here.
import { db } from './db.js';

export const DEFAULT_SETTINGS = {
  business_name: 'Hipcastle Agency',
  legal_name: 'Hipcastle Agency (Pty) Ltd',
  tagline: 'Specialist teams for South African entrepreneurs',
  email: 'hello@hipcastle.co.za',
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
  social: {
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    linkedin: 'https://www.linkedin.com/',
    x: 'https://x.com/',
    tiktok: 'https://www.tiktok.com/',
    youtube: 'https://www.youtube.com/',
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
export function publicSettings() {
  const s = getSettings();
  const { seo_default_description, ...rest } = s;
  return { ...rest, seo_default_description };
}

/** Compute VAT on an amount in cents according to current settings. */
export function vatFor(subtotalCents, s = getSettings()) {
  return s.vat_registered ? Math.round((subtotalCents * Number(s.vat_rate || 0)) / 100) : 0;
}
