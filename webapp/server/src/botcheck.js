// Bot protection for public forms.
//  1. Honeypot: a hidden "website" field real people never fill in. Bots that do are told
//     "thanks" (so they don't adapt) and nothing is stored or emailed.
//  2. Cloudflare Turnstile (optional): when TURNSTILE_SECRET_KEY is set, a valid
//     `captcha_token` is required. https://developers.cloudflare.com/turnstile/
import { logEvent } from './events.js';

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || '';
const turnstileSecret = () => process.env.TURNSTILE_SECRET_KEY || '';

async function verifyTurnstile(token, ip) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: turnstileSecret(), response: token, remoteip: ip || '' }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  return Boolean(data.success);
}

export const botCheck = (form, { captcha = true } = {}) => async (req, res, next) => {
  const b = req.body || {};
  if (typeof b.website === 'string' && b.website.trim() !== '') {
    logEvent('security.bot_blocked', `Honeypot triggered on ${form} form`, { level: 'warn', meta: { ip: req.ip } });
    return res.status(201).json({ ok: true });
  }
  if (captcha && turnstileSecret()) {
    const token = typeof b.captcha_token === 'string' ? b.captcha_token : '';
    let ok = false;
    try { ok = token !== '' && (await verifyTurnstile(token, req.ip)); } catch { ok = false; }
    if (!ok) {
      logEvent('security.captcha_failed', `Security check failed on ${form} form`, { level: 'warn', meta: { ip: req.ip } });
      return res.status(400).json({ error: 'Please complete the security check and try again.', fields: { captcha: 'Security check required' } });
    }
  }
  next();
};
