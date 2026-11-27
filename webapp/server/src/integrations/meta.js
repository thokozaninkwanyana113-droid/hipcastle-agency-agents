// Meta: ad performance for Paid Advertising clients (Marketing API insights, read-only) and
// WhatsApp Business Cloud API messages for clients who opt in.
import { getJson } from './http.js';

const V = () => process.env.META_GRAPH_VERSION || 'v25.0';
const GRAPH = () => `https://graph.facebook.com/${V()}`;

// ---------------------------------------------------------------- Ads insights
export const metaAdsConfigured = () => Boolean(process.env.META_ACCESS_TOKEN);
export const adAccountOk = (v) => /^\d{5,20}$/.test(String(v || '').replace(/^act_/, ''));
const LEADS = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'contact_total', 'onsite_conversion.messaging_conversation_started_7d'];

export async function metaAdsInsights(account) {
  if (!metaAdsConfigured()) throw Object.assign(new Error('Add META_ACCESS_TOKEN (a system user token with ads_read) to read ad accounts.'), { status: 400 });
  const id = String(account).replace(/^act_/, '');
  if (!adAccountOk(id)) throw Object.assign(new Error('Use the numeric ad account ID'), { status: 400 });
  const auth = { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` };
  const q = new URLSearchParams({ fields: 'spend,impressions,reach,clicks,ctr,cpc,actions,account_currency', date_preset: 'last_30d' });
  const [tot, camps] = await Promise.all([
    getJson(`${GRAPH()}/act_${id}/insights?${q}`, { headers: auth, label: 'Meta Ads' }),
    getJson(`${GRAPH()}/act_${id}/insights?${new URLSearchParams({ fields: 'campaign_name,spend,clicks,ctr,actions', date_preset: 'last_30d', level: 'campaign', limit: '10' })}`, { headers: auth, label: 'Meta Ads' }),
  ]);
  const leadsOf = (r) => (r?.actions || []).filter((a) => LEADS.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
  const t = tot.data?.[0] || {};
  const spend = Number(t.spend || 0); const leads = leadsOf(t);
  return {
    account: id, period: 'last 30 days', currency: t.account_currency || 'ZAR',
    totals: { spend, impressions: Number(t.impressions || 0), reach: Number(t.reach || 0), clicks: Number(t.clicks || 0), ctr: Math.round(Number(t.ctr || 0) * 100) / 100, cpc: Math.round(Number(t.cpc || 0) * 100) / 100, leads, cost_per_lead: leads ? Math.round((spend / leads) * 100) / 100 : null },
    campaigns: (camps.data || []).map((c) => ({ name: c.campaign_name, spend: Number(c.spend || 0), clicks: Number(c.clicks || 0), ctr: Math.round(Number(c.ctr || 0) * 100) / 100, leads: leadsOf(c) })).sort((a, b) => b.spend - a.spend),
  };
}

// ---------------------------------------------------------------- WhatsApp Cloud API
export const whatsappConfigured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
/** SA numbers to E.164 digits: 082 123 4567 → 27821234567. Returns null if it isn't a mobile number. */
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 10) d = `27${d.slice(1)}`;
  return /^\d{10,15}$/.test(d) ? d : null;
}
export async function sendWhatsappTemplate(to, template, params, lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en') {
  if (!whatsappConfigured()) throw Object.assign(new Error('WhatsApp is not configured'), { status: 400 });
  const d = await getJson(`${GRAPH()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', label: 'WhatsApp', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
      template: { name: template, language: { code: lang }, components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 900) })) }] : [] } },
  });
  return d.messages?.[0]?.id || null;
}
