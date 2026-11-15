// Single source of truth for the site's addresses.
//
//  canonicalUrl() — the public domain search engines, AI assistants, social shares and emails
//                   should always point to: https://www.hipcastle.agency (override with SITE_URL).
//  appUrl()       — where *this running instance* is reachable (payment return URLs). Equal to the
//                   canonical domain in production; localhost during development.
export const DOMAIN = 'www.hipcastle.agency';
export const DEFAULT_SITE_URL = `https://${DOMAIN}`;

const trim = (u) => u.replace(/\/+$/, '');
const isProd = () => process.env.NODE_ENV === 'production';

export const canonicalUrl = () => trim(process.env.SITE_URL || DEFAULT_SITE_URL);
export const appUrl = () => trim(process.env.SITE_URL || (isProd() ? DEFAULT_SITE_URL : `http://localhost:${process.env.PORT || 4000}`));
export const canonicalHost = () => new URL(canonicalUrl()).host;

/**
 * 301-redirect the bare domain (hipcastle.agency) and plain HTTP to https://www.hipcastle.agency,
 * so search engines only ever index one version of each page. Only active in production.
 */
export function canonicalHostRedirect(req, res, next) {
  if (!isProd() || process.env.DISABLE_HOST_REDIRECT === 'true') return next();
  if (req.path.startsWith('/api/payments/') && req.method === 'POST') return next(); // never redirect gateway callbacks
  const target = new URL(canonicalUrl());
  const host = (req.headers.host || '').toLowerCase();
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https:' : 'http:';
  const wrongHost = host === target.host.replace(/^www\./, '');
  const wrongProto = target.protocol === 'https:' && proto !== 'https:' && host === target.host;
  if (wrongHost || wrongProto) return res.redirect(301, `${target.origin}${req.originalUrl}`);
  next();
}
