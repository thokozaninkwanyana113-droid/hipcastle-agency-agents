const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD';
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });

export const money = (cents) => fmt.format((cents || 0) / 100);
export const billingLabel = (b) => (b === 'monthly' ? '/ month' : 'one-off');
export const date = (s) => (s ? new Date(s.replace(' ', 'T') + (s.length > 10 && !s.endsWith('Z') ? 'Z' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const statusLabel = (s) => s.replace('_', ' ');
