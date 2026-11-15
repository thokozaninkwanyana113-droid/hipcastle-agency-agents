// Activity log + lightweight request metrics for the Command Centre.
import { db } from './db.js';

export function logEvent(type, message, { level = 'info', actor = null, ref = null, meta = null } = {}) {
  try {
    db.prepare('INSERT INTO events (type, level, message, actor_id, ref, meta) VALUES (?, ?, ?, ?, ?, ?)')
      .run(type, level, message, actor ?? null, ref ?? null, meta ? JSON.stringify(meta) : null);
  } catch (err) {
    console.error('Failed to log event', err);
  }
  if (level === 'error') console.error(`[${type}] ${message}`);
}

const MAX_SAMPLES = 2000;
const samples = []; // { t, ms, status, route }
const recentErrors = [];
export const startedAt = Date.now();

const routeKey = (req) => {
  const p = (req.baseUrl || '') + (req.route?.path || req.path);
  return `${req.method} ${p.replace(/\/\d+(?=\/|$)/g, '/:id')}`;
};

export function metricsMiddleware(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    samples.push({ t: Date.now(), ms, status: res.statusCode, route: routeKey(req) });
    if (samples.length > MAX_SAMPLES) samples.shift();
  });
  next();
}

export function recordError(err, req) {
  recentErrors.unshift({ at: new Date().toISOString(), message: err.message, path: req?.originalUrl, method: req?.method });
  recentErrors.length = Math.min(recentErrors.length, 50);
  logEvent('system.error', `${req?.method} ${req?.originalUrl}: ${err.message}`, { level: 'error' });
}

export function metricsSnapshot() {
  const now = Date.now();
  const last = (mins) => samples.filter((s) => now - s.t <= mins * 60_000);
  const summarise = (list) => {
    const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
    const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
    return {
      requests: list.length,
      errors_5xx: list.filter((s) => s.status >= 500).length,
      errors_4xx: list.filter((s) => s.status >= 400 && s.status < 500).length,
      avg_ms: list.length ? +(sorted.reduce((a, b) => a + b, 0) / list.length).toFixed(1) : 0,
      p95_ms: +pct(0.95).toFixed(1),
    };
  };
  const byRoute = {};
  for (const s of samples) {
    const r = (byRoute[s.route] ||= { route: s.route, count: 0, total: 0, errors: 0 });
    r.count++; r.total += s.ms; if (s.status >= 500) r.errors++;
  }
  return {
    last_5m: summarise(last(5)),
    last_60m: summarise(last(60)),
    top_routes: Object.values(byRoute).sort((a, b) => b.count - a.count).slice(0, 12)
      .map((r) => ({ route: r.route, count: r.count, avg_ms: +(r.total / r.count).toFixed(1), errors: r.errors })),
    recent_errors: recentErrors.slice(0, 20),
  };
}
