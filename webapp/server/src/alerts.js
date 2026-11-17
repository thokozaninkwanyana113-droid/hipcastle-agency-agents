// Operational alerts: tell a person when something breaks, instead of waiting for them to look.
// Sent to the team inbox (notify_email) and, if ALERT_WEBHOOK_URL is set, to a chat webhook
// (Slack, Discord, Teams/Google Chat incoming webhooks all accept this JSON).
// Each alert key is throttled so a failing dependency can't flood the inbox.
import { logEvent } from './events.js';

const THROTTLE_MS = 15 * 60 * 1000;
const last = new Map();
let sent = 0;

export const alertsSent = () => sent;
export function resetAlerts() { last.clear(); sent = 0; }

export async function alert(key, subject, details = '') {
  const now = Date.now();
  if (now - (last.get(key) || 0) < THROTTLE_MS) return false;
  last.set(key, now);
  sent++;
  logEvent('system.alert', `Alert sent: ${subject}`.slice(0, 300), { ref: key, level: 'warn' });
  const text = `🚨 Hipcastle: ${subject}${details ? `\n${details}` : ''}`;
  try {
    const { notifyTeam } = await import('./email/mailer.js');
    notifyTeam('system.alert', { subject, details, at: new Date().toISOString() }, { ref: `alert-${key}` });
  } catch (err) { console.error('alert email failed', err); }
  const hook = process.env.ALERT_WEBHOOK_URL;
  if (hook) {
    try {
      await fetch(hook, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ text, content: text.slice(0, 1900) }),
      });
    } catch (err) { console.error('alert webhook failed', err.message); }
  }
  return true;
}

/** Errors that should page someone. Email/alert failures themselves don't (they would loop). */
export function shouldAlert(type) {
  return !/^email\./.test(type) && type !== 'system.alert';
}
