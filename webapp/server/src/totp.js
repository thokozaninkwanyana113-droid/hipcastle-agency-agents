// Two-step sign-in: time-based one-time codes (TOTP, RFC 6238) from an authenticator app, plus
// single-use recovery codes. Secrets are stored encrypted; recovery codes only as hashes.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { open, seal } from './crypto-box.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function unbase32(str) {
  let bits = 0, value = 0; const out = [];
  for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export const STEP = 30;
export const stepNow = (t = Date.now()) => Math.floor(t / 1000 / STEP);
export function codeAt(secretB32, step) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', unbase32(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Check a 6-digit code (±1 step for clock drift). Returns the matching step, or null. Rejects reuse via lastStep. */
export function verifyCode(secretB32, code, lastStep = -1, now = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const s = stepNow(now);
  for (const st of [s, s - 1, s + 1]) if (st > lastStep && same(codeAt(secretB32, st), c)) return st;
  return null;
}

export const newSecret = () => base32(randomBytes(20));
export const sealSecret = (s) => seal({ totp: s });
export const openSecret = (sealed) => open(sealed).totp;

export function otpauthUrl(secretB32, account, issuer = 'Hipcastle Agency') {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?${new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: '6', period: String(STEP) })}`;
}
export const qrSvg = (url) => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1b3a', light: '#ffffff' } });

// ---------------------------------------------------------------- recovery codes
const hashCode = (c) => createHash('sha256').update(`recovery:${c.toLowerCase().replace(/[^a-z0-9]/g, '')}`).digest('hex');
export function newRecoveryCodes(n = 10) {
  const codes = Array.from({ length: n }, () => { const s = base32(randomBytes(6)).toLowerCase().slice(0, 8); return `${s.slice(0, 4)}-${s.slice(4)}`; });
  return { codes, hashes: codes.map(hashCode) };
}
/** Returns the remaining hashes if the code matched (it is used up), else null. */
export function useRecoveryCode(hashes, code) {
  const h = hashCode(String(code || ''));
  const i = (hashes || []).findIndex((x) => same(x, h));
  return i === -1 ? null : hashes.filter((_, j) => j !== i);
}
