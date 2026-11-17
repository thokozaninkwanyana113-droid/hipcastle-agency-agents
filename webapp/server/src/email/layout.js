// Branded, email-client-safe layout (tables + inline styles) with a matching plain-text part.
// Content is described as blocks so HTML and text are generated from one source, and every
// dynamic value is escaped.
import { getSettings } from '../settings.js';
import { canonicalUrl, DOMAIN } from '../urls.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { navy: '#0b1530', navy2: '#142147', gold: '#f2b544', ink: '#141a2e', soft: '#4a5370', muted: '#6b7390', line: '#e4e2dc', bg: '#f3efe6' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Make a site-relative path absolute on the canonical domain. */
export const link = (path = '/') => (/^https?:|^mailto:|^tel:/.test(path) ? path : `${canonicalUrl()}${path.startsWith('/') ? '' : '/'}${path}`);

/**
 * Block types:
 *  'text'                          → paragraph
 *  { p: 'text' }                   → paragraph
 *  { list: ['a', 'b'] }            → bullet list
 *  { table: [['Label', 'Value']] } → key/value summary table
 *  { button: 'Label', href }       → call-to-action button
 *  { note: 'text' }                → highlighted note
 *  { quote: 'text' }               → quoted text (e.g. a client message)
 */
function blockHtml(b) {
  if (typeof b === 'string') b = { p: b };
  if (b.p) return `<p style="margin:0 0 16px;font:16px/1.6 ${FONT};color:${C.ink}">${esc(b.p)}</p>`;
  if (b.list) return `<ul style="margin:0 0 16px;padding-left:20px;font:16px/1.6 ${FONT};color:${C.ink}">${b.list.map((i) => `<li style="margin:0 0 6px">${esc(i)}</li>`).join('')}</ul>`;
  if (b.table) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${C.line};border-radius:8px;border-collapse:separate">${b.table
      .map(([k, v], i) => `<tr><td style="padding:10px 14px;font:14px ${FONT};color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ''}width:42%">${esc(k)}</td><td style="padding:10px 14px;font:600 14px ${FONT};color:${C.ink};${i ? `border-top:1px solid ${C.line};` : ''}">${esc(v)}</td></tr>`).join('')}</table>`;
  }
  if (b.button) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:999px;background:${C.gold}">
      <a href="${esc(link(b.href))}" style="display:inline-block;padding:14px 28px;font:700 15px ${FONT};color:${C.navy};text-decoration:none;border-radius:999px">${esc(b.button)}</a></td></tr></table>`;
  }
  if (b.note) return `<p style="margin:0 0 16px;padding:12px 16px;background:#fdf1d8;border-radius:8px;font:14px/1.5 ${FONT};color:${C.ink}">${esc(b.note)}</p>`;
  if (b.quote) return `<blockquote style="margin:0 0 16px;padding:4px 16px;border-left:3px solid ${C.gold};font:italic 15px/1.6 ${FONT};color:${C.soft};white-space:pre-wrap">${esc(b.quote)}</blockquote>`;
  return '';
}

function blockText(b) {
  if (typeof b === 'string') b = { p: b };
  if (b.p) return b.p;
  if (b.list) return b.list.map((i) => `  • ${i}`).join('\n');
  if (b.table) return b.table.map(([k, v]) => `  ${k}: ${v}`).join('\n');
  if (b.button) return `${b.button}: ${link(b.href)}`;
  if (b.note) return `NOTE: ${b.note}`;
  if (b.quote) return b.quote.split('\n').map((l) => `> ${l}`).join('\n');
  return '';
}

export function renderLayout({ preheader = '', heading, blocks = [], signoff = true, reason, unsubscribeUrl }) {
  const s = getSettings();
  const socials = Object.entries(s.social || {}).filter(([, u]) => u);
  const label = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', youtube: 'YouTube' };
  const address = [s.street_address, s.address_locality, s.address_region, 'South Africa'].filter(Boolean).join(', ');
  const sign = signoff ? [`Warm regards,`, `The ${s.business_name} team`] : [];

  const html = `<!doctype html>
<html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
  <tr><td style="background:${C.navy};border-radius:14px 14px 0 0;padding:22px 32px">
    <a href="${esc(canonicalUrl())}" style="text-decoration:none">
      <img src="${esc(link('/logo.png'))}" width="140" height="90" alt="${esc(s.business_name)}" style="display:block;border:0;width:140px;height:auto;background:#ffffff;border-radius:10px;padding:6px 10px">
    </a>
  </td></tr>
  <tr><td style="background:#ffffff;padding:36px 32px 12px">
    <h1 style="margin:0 0 20px;font:700 24px/1.3 Georgia,serif;color:${C.navy}">${esc(heading)}</h1>
    ${blocks.map(blockHtml).join('\n    ')}
    ${sign.length ? `<p style="margin:8px 0 24px;font:16px/1.6 ${FONT};color:${C.ink}">${sign.map(esc).join('<br>')}</p>` : ''}
  </td></tr>
  <tr><td style="background:${C.navy2};border-radius:0 0 14px 14px;padding:24px 32px;font:13px/1.6 ${FONT};color:#c5cbe2">
    <p style="margin:0 0 8px"><a href="${esc(canonicalUrl())}" style="color:${C.gold};font-weight:700;text-decoration:none">${DOMAIN}</a>
      &nbsp;·&nbsp; <a href="mailto:${esc(s.email)}" style="color:#c5cbe2">${esc(s.email)}</a>${s.phone ? ` &nbsp;·&nbsp; ${esc(s.phone)}` : ''}</p>
    ${socials.length ? `<p style="margin:0 0 8px">${socials.map(([k, u]) => `<a href="${esc(u)}" style="color:#c5cbe2;text-decoration:underline">${label[k]}</a>`).join(' &nbsp;·&nbsp; ')}</p>` : ''}
    <p style="margin:0 0 8px;color:#9aa3c4">${esc(s.legal_name || s.business_name)}${s.company_reg_no ? ` · Reg. ${esc(s.company_reg_no)}` : ''}${s.vat_registered && s.vat_no ? ` · VAT ${esc(s.vat_no)}` : ''} · ${esc(address)}</p>
    ${reason ? `<p style="margin:0;color:#9aa3c4">${esc(reason)}</p>` : ''}
    ${unsubscribeUrl ? `<p style="margin:8px 0 0"><a href="${esc(unsubscribeUrl)}" style="color:#9aa3c4">Unsubscribe</a></p>` : ''}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    heading, '='.repeat(Math.min(heading.length, 60)), '',
    ...blocks.map(blockText).flatMap((t) => [t, '']),
    ...(sign.length ? [...sign, ''] : []),
    '—', `${s.business_name} · ${canonicalUrl()} · ${s.email}${s.phone ? ` · ${s.phone}` : ''}`, address,
    ...(reason ? [reason] : []),
    ...(unsubscribeUrl ? [`Unsubscribe: ${unsubscribeUrl}`] : []),
  ].join('\n');

  return { html, text };
}
