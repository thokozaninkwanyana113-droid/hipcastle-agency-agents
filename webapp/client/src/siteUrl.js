// Canonical public address. Structured data and share links always point here, even while
// developing on localhost. The server provides it via /api/site (SITE_URL override).
let base = 'https://www.hipcastle.agency';
export const setSiteUrl = (u) => { if (u) base = u.replace(/\/+$/, ''); };
export const siteUrl = (path = '') => `${base}${path}`;
export const siteHost = () => base.replace(/^https?:\/\//, '');
