// South African rand formatting, e.g. "R 12 500" (en-ZA uses spaces for thousands).
const whole = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 });

export const money = (cents) => whole.format((cents || 0) / 100);
export const moneyExact = (cents) => exact.format((cents || 0) / 100);
export const billingLabel = (b) => (b === 'monthly' ? '/ month' : 'once-off');
const parse = (s) => new Date(s.replace(' ', 'T') + (s.length > 10 && !s.endsWith('Z') ? 'Z' : ''));
export const date = (s) => (s ? parse(s).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (s) => (s ? parse(s).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const timeAgo = (s) => {
  if (!s) return '—';
  const sec = Math.round((Date.now() - parse(s).getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};
export const statusLabel = (s) => String(s).replace(/_/g, ' ');
export const waLink = (number, text = '') => `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
/** 90 → "1.5 hours", 30 → "30 min". */
export const hoursLabel = (minutes = 0) => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 30) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  const h = minutes / 60;
  return `${h} hour${h === 1 ? '' : 's'}`;
};
