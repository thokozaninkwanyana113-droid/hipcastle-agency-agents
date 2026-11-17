// Credential guard: keep passwords, card numbers, ID numbers and API keys out of stored messages.
// POPIA expects personal and security data to be minimised and protected; chat logs, tickets and
// onboarding answers are the wrong place for them. Matches are replaced with a notice.
const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};
const validSaId = (id) => {
  if (!/^\d{13}$/.test(id) || !luhn(id)) return false;
  const mm = Number(id.slice(2, 4)), dd = Number(id.slice(4, 6));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
};

const RULES = [
  { kind: 'password', re: /\b(pass(?:word|wd|code)?|pwd|pin|wagwoord)\b\s*(?:is|:|=|-)\s*["']?([^\s"',;]{4,})/gi, keep: 1 },
  { kind: 'secret key', re: /\b(sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[bpas]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/g },
  { kind: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: 'card number', re: /\b\d(?:[ -]?\d){12,18}\b/g, test: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) && !validSaId(d); } },
  { kind: 'ID number', re: /\b\d{13}\b/g, test: (m) => validSaId(m) },
];

/** Returns { text, found: [kinds] } with sensitive values replaced. */
export function redactSecrets(input) {
  if (typeof input !== 'string' || !input) return { text: input, found: [] };
  let text = input;
  const found = new Set();
  for (const r of RULES) {
    text = text.replace(r.re, (m, label) => {
      if (r.test && !r.test(m)) return m;
      found.add(r.kind);
      return r.keep ? `${label}: [removed for your security]` : `[${r.kind} removed for your security]`;
    });
  }
  return { text, found: [...found] };
}

/**
 * Express middleware: redact sensitive values in the given body fields (after validation).
 * `responses.*` redacts every string value of an object field. Tells the browser what was removed
 * via the X-Content-Redacted header so it can explain why.
 */
export const guardFields = (...fields) => async (req, res, next) => {
  const found = new Set();
  const clean = (v) => { const r = redactSecrets(v); r.found.forEach((k) => found.add(k)); return r.text; };
  for (const f of fields) {
    const arr = f.match(/^(\w+)\[\]\.(\w+)$/); // e.g. responses[].response
    if (arr) {
      for (const item of Array.isArray(req.body?.[arr[1]]) ? req.body[arr[1]] : []) if (typeof item?.[arr[2]] === 'string') item[arr[2]] = clean(item[arr[2]]);
    } else if (f.endsWith('.*')) {
      const obj = req.body?.[f.slice(0, -2)];
      if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) if (typeof obj[k] === 'string') obj[k] = clean(obj[k]);
    } else if (typeof req.body?.[f] === 'string') req.body[f] = clean(req.body[f]);
  }
  if (found.size) {
    res.set('X-Content-Redacted', [...found].join(','));
    res.set('Access-Control-Expose-Headers', 'X-Content-Redacted');
    const { logEvent } = await import('./events.js');
    logEvent('security.redacted', `Removed ${[...found].join(', ')} from a submission to ${req.baseUrl}${req.route?.path || ''}`, { actor: req.user?.id ?? null, level: 'warn' });
  }
  next();
};
