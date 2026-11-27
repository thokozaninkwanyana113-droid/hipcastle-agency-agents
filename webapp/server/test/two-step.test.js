// Two-step sign-in (TOTP): setup, sign-in, replay and brute-force protection, recovery codes,
// enforcement for team accounts, admin reset, and no bypass through password reset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ENFORCE_MFA_IN_TESTS = '1';
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { db } = await import('../src/db.js');
const T = await import('../src/totp.js');
const { updateSettings } = await import('../src/settings.js');
const { TEMPLATES } = await import('../src/email/templates.js');
const { TOUCHPOINTS } = await import('../src/communications.js');

let server, base;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = (email, password) => call('POST', '/auth/login', { body: { email, password } });
const ADMIN = ['admin@hipcastle.agency', 'ChangeMe123!'];
let adminSecret, adminRecovery, adminToken;
// A code for a specific window, so tests don't collide with replay protection.
const codeFor = (secret, offset = 0) => T.codeAt(secret, T.stepNow() + offset);

before(async () => {
  seed({ demo: false, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

test('TOTP matches the RFC 6238 test vectors; recovery codes are single use', () => {
  const s = T.base32(Buffer.from('12345678901234567890'));
  assert.equal(T.codeAt(s, 1), '287082');
  assert.equal(T.codeAt(s, 37037036), '081804');
  assert.equal(T.verifyCode(s, '287082', -1, 59_000), 1);
  assert.equal(T.verifyCode(s, '287082', 1, 59_000), null, 'reused code rejected');
  assert.equal(T.verifyCode(s, '000000', -1, 59_000), null);
  const { codes, hashes } = T.newRecoveryCodes();
  assert.equal(codes.length, 10);
  const left = T.useRecoveryCode(hashes, codes[3].toUpperCase());
  assert.equal(left.length, 9);
  assert.equal(T.useRecoveryCode(left, codes[3]), null);
  for (const t of ['auth.security']) { assert.ok(TEMPLATES[t]); assert.ok(TOUCHPOINTS[t]); }
});

test('team accounts without two-step can only reach the setup pages', async () => {
  const r = await login(...ADMIN);
  assert.ok(r.data.token, 'password alone still signs in…');
  adminToken = r.data.token;
  assert.equal(r.data.user.two_step_required, true);
  const blocked = await call('GET', '/admin/overview', { token: adminToken });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'mfa_setup_required', '…but the Command Centre is locked until two-step is set up');
  assert.equal((await call('GET', '/auth/me', { token: adminToken })).status, 200);
  assert.equal((await call('GET', '/auth/2fa', { token: adminToken })).data.required, true);
});

test('setup: QR + secret, confirm with a code, recovery codes, other sessions signed out', async () => {
  const s = (await call('POST', '/auth/2fa/setup', { token: adminToken })).data;
  assert.match(s.qr_svg, /^<svg/);
  assert.match(s.otpauth_url, /^otpauth:\/\/totp\/Hipcastle%20Agency%3Aadmin%40hipcastle\.agency\?secret=/);
  adminSecret = s.secret.replace(/\s/g, '');
  const stored = db.prepare("SELECT totp_pending, totp_enabled_at FROM users WHERE email = 'admin@hipcastle.agency'").get();
  assert.doesNotMatch(stored.totp_pending, new RegExp(adminSecret), 'secret stored encrypted');
  assert.equal(stored.totp_enabled_at, null, 'not active until confirmed');
  assert.equal((await call('POST', '/auth/2fa/enable', { token: adminToken, body: { code: '123456' } })).status, 400);
  const on = (await call('POST', '/auth/2fa/enable', { token: adminToken, body: { code: codeFor(adminSecret, -1) } })).data;
  assert.equal(on.recovery_codes.length, 10);
  adminRecovery = on.recovery_codes;
  assert.equal((await call('GET', '/auth/me', { token: adminToken })).status, 401, 'old session signed out');
  adminToken = on.token;
  assert.equal((await call('GET', '/admin/overview', { token: adminToken })).status, 200, 'Command Centre unlocked');
  assert.ok(db.prepare("SELECT 1 FROM emails WHERE template = 'auth.security' AND to_email = 'admin@hipcastle.agency'").get());
  assert.match(on.token.split('.')[1] && JSON.parse(Buffer.from(on.token.split('.')[1], 'base64url')).exp - Math.floor(Date.now() / 1000) <= 12 * 3600 ? 'ok' : 'long', /ok/, 'team sessions last 12 hours');
});

test('sign-in now needs the code; the half-signed-in token is useless on its own', async () => {
  const r = await login(...ADMIN);
  assert.equal(r.data.mfa_required, true);
  assert.equal(r.data.token, undefined);
  assert.equal((await call('GET', '/auth/me', { token: r.data.mfa_token })).status, 401, 'mfa token is not a session');
  assert.equal((await call('POST', '/auth/login/verify', { body: { mfa_token: 'x'.repeat(30), code: '123456' } })).status, 401);
  const ok = await call('POST', '/auth/login/verify', { body: { mfa_token: r.data.mfa_token, code: codeFor(adminSecret) } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  const again = await login(...ADMIN);
  const replay = await call('POST', '/auth/login/verify', { body: { mfa_token: again.data.mfa_token, code: codeFor(adminSecret) } });
  assert.equal(replay.status, 401, 'the same code cannot be used twice');
});

test('five wrong codes pause sign-in for 15 minutes and email a warning', async () => {
  db.prepare("UPDATE users SET mfa_failures = 0 WHERE email = 'admin@hipcastle.agency'").run(); // the replay above counted as one
  const r = await login(...ADMIN);
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/auth/login/verify', { body: { mfa_token: r.data.mfa_token, code: String(100000 + i) } })).status, 401);
  const locked = await call('POST', '/auth/login/verify', { body: { mfa_token: r.data.mfa_token, code: codeFor(adminSecret, 1) } });
  assert.equal(locked.status, 429, 'even a correct code is refused while locked');
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'auth.mfa_failed' AND message LIKE '%locked%'").get());
  db.prepare("UPDATE users SET mfa_locked_until = NULL WHERE email = 'admin@hipcastle.agency'").run();
});

test('a recovery code works once, and is reported', async () => {
  const r = await login(...ADMIN);
  const ok = await call('POST', '/auth/login/verify', { body: { mfa_token: r.data.mfa_token, code: adminRecovery[0] } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.recovery_codes_left, 9);
  adminToken = ok.data.token;
  const r2 = await login(...ADMIN);
  assert.equal((await call('POST', '/auth/login/verify', { body: { mfa_token: r2.data.mfa_token, code: adminRecovery[0] } })).status, 401);
  assert.ok(db.prepare("SELECT 1 FROM events WHERE type = 'auth.recovery_used'").get());
});

test('password reset never skips the code step', async () => {
  await call('POST', '/auth/forgot', { body: { email: 'admin@hipcastle.agency' } });
  const tokenRow = db.prepare("SELECT id FROM password_resets ORDER BY id DESC").get();
  assert.ok(tokenRow);
  // Use a known token by replacing the stored hash.
  const { createHash } = await import('node:crypto');
  const known = 'k'.repeat(40);
  db.prepare('UPDATE password_resets SET token_hash = ? WHERE id = ?').run(createHash('sha256').update(known).digest('hex'), tokenRow.id);
  const reset = await call('POST', '/auth/reset', { body: { token: known, password: 'NewPassword123!' } });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.mfa_required, true);
  assert.equal(reset.data.token, undefined);
  ADMIN[1] = 'NewPassword123!';
});

test('team members cannot switch two-step off; an admin can reset it (lost phone)', async () => {
  const r = await login(...ADMIN);
  adminToken = (await call('POST', '/auth/login/verify', { body: { mfa_token: r.data.mfa_token, code: codeFor(adminSecret, 1) } })).data.token;
  assert.equal((await call('POST', '/auth/2fa/disable', { token: adminToken, body: { password: ADMIN[1], code: adminRecovery[1] } })).status, 403);
  // A staff member enrols, loses their phone, and the admin resets them.
  const staff = (await call('POST', '/auth/register', { body: { name: 'Lerato Staff', email: 'lerato@hipcastle.agency', password: 'password123' } })).data;
  const staffId = db.prepare("SELECT id FROM users WHERE email = 'lerato@hipcastle.agency'").get().id;
  await call('PATCH', `/admin/users/${staffId}`, { token: adminToken, body: { role: 'staff' } });
  let st = (await login('lerato@hipcastle.agency', 'password123')).data.token;
  const sec = (await call('POST', '/auth/2fa/setup', { token: st })).data.secret.replace(/\s/g, '');
  st = (await call('POST', '/auth/2fa/enable', { token: st, body: { code: codeFor(sec) } })).data.token;
  assert.equal((await call('POST', `/admin/users/${staffId}/2fa/reset`, { token: st })).status, 403, 'only admins can reset');
  assert.equal((await call('POST', `/admin/users/${staffId}/2fa/reset`, { token: adminToken })).status, 200);
  assert.equal((await call('GET', '/auth/me', { token: st })).status, 401, 'their sessions are signed out');
  const again = await login('lerato@hipcastle.agency', 'password123');
  assert.ok(again.data.token, 'they sign in with a password and must set it up again');
  assert.equal((await call('GET', '/admin/overview', { token: again.data.token })).data.code, 'mfa_setup_required');
  assert.equal((await call('POST', `/admin/users/${db.prepare("SELECT id FROM users WHERE email = 'admin@hipcastle.agency'").get().id}/2fa/reset`, { token: adminToken })).status, 400, 'not your own');
  assert.ok(staff.token);
});

test('clients can opt in and out; enforcement can be switched off in Settings', async () => {
  let c = (await call('POST', '/auth/register', { body: { name: 'Thandi Client', email: 'thandi@example.com', password: 'password123' } })).data.token;
  assert.equal((await call('GET', '/orders', { token: c })).status, 200, 'clients are not forced');
  const sec = (await call('POST', '/auth/2fa/setup', { token: c })).data.secret.replace(/\s/g, '');
  const on = (await call('POST', '/auth/2fa/enable', { token: c, body: { code: codeFor(sec, -1) } })).data;
  c = on.token;
  assert.equal((await call('POST', '/auth/2fa/disable', { token: c, body: { password: 'wrong', code: codeFor(sec) } })).status, 400);
  const off = await call('POST', '/auth/2fa/disable', { token: c, body: { password: 'password123', code: codeFor(sec) } });
  assert.equal(off.status, 200);
  assert.ok((await login('thandi@example.com', 'password123')).data.token, 'password only again');
  updateSettings({ staff_mfa_required: false });
  const staff = (await login('lerato@hipcastle.agency', 'password123')).data.token;
  assert.equal((await call('GET', '/admin/overview', { token: staff })).status, 200);
  updateSettings({ staff_mfa_required: true });
});
