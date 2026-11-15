// Payment gateway configuration. Secrets come from environment variables only.
import { getSettings } from '../settings.js';

export const MODE = process.env.PAYMENTS_MODE === 'live' ? 'live' : 'sandbox';
export const isLive = MODE === 'live';

/** Public base URL of the site (used for return URLs). */
export const siteUrl = () => (process.env.SITE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
/** Public base URL the gateways can reach for notifications (defaults to SITE_URL). */
export const notifyBase = () => (process.env.PAYMENTS_NOTIFY_URL || siteUrl()).replace(/\/$/, '');

// PayFast's shared public sandbox merchant. Its passphrase is not published (and can be changed by
// anyone), so requests to it are sent unsigned and its ITNs cannot be verified. Create your own free
// sandbox account at sandbox.payfast.co.za and set PAYFAST_MERCHANT_ID/KEY/PASSPHRASE for full testing.
const PF_SANDBOX = { merchant_id: '10000100', merchant_key: '46f0cd694581a', passphrase: '' };

export function payfastConfig() {
  const env = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID,
    merchant_key: process.env.PAYFAST_MERCHANT_KEY,
    passphrase: process.env.PAYFAST_PASSPHRASE,
  };
  const useSandboxDefaults = !isLive && !env.merchant_id;
  const c = useSandboxDefaults ? PF_SANDBOX : { ...env, passphrase: env.passphrase || '' };
  return {
    ...c,
    configured: Boolean(c.merchant_id && c.merchant_key),
    sandboxDefaults: useSandboxDefaults,
    host: isLive ? 'www.payfast.co.za' : 'sandbox.payfast.co.za',
    validateRemote: process.env.PAYFAST_VALIDATE_REMOTE !== 'false',
    checkIp: process.env.PAYFAST_CHECK_IP ? process.env.PAYFAST_CHECK_IP === 'true' : isLive,
  };
}

export function ozowConfig() {
  const c = {
    site_code: process.env.OZOW_SITE_CODE || '',
    private_key: process.env.OZOW_PRIVATE_KEY || '',
    api_key: process.env.OZOW_API_KEY || '',
  };
  return { ...c, configured: Boolean(c.site_code && c.private_key), isTest: !isLive };
}

export const simulatedAllowed = () =>
  process.env.NODE_ENV !== 'production' && process.env.PAYMENTS_ALLOW_SIMULATED !== 'false';

/** Gateways a customer can currently pay with. */
export function availableGateways(settings = getSettings()) {
  const out = [];
  if (settings.payfast_enabled && payfastConfig().configured) {
    out.push({ id: 'payfast', name: 'PayFast', methods: 'Card, Instant EFT, SnapScan, Zapper & more', test: !isLive });
  }
  if (settings.ozow_enabled && ozowConfig().configured) {
    out.push({ id: 'ozow', name: 'Ozow', methods: 'Instant EFT from all major SA banks', test: !isLive });
  }
  if (simulatedAllowed()) out.push({ id: 'simulated', name: 'Test payment', methods: 'Development only — no real money', test: true });
  return out;
}
