// Shared HTTP helper for third-party APIs: timeouts, JSON errors, and a swappable fetch for tests.
let fetcher = (...a) => fetch(...a);
export function setIntegrationFetch(f) { fetcher = f || ((...a) => fetch(...a)); }
export const rawFetch = (...a) => fetcher(...a);

export async function getJson(url, { method = 'GET', headers = {}, body, timeout = 30_000, label = 'API' } = {}) {
  const res = await fetcher(url, {
    method, signal: AbortSignal.timeout(timeout),
    headers: { Accept: 'application/json', ...(body && typeof body !== 'string' && !(body instanceof URLSearchParams) && { 'Content-Type': 'application/json' }), ...headers },
    body: body && typeof body !== 'string' && !(body instanceof URLSearchParams) ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error_description || data?.message || (typeof data?.error === 'string' ? data.error : '') || res.statusText || `HTTP ${res.status}`;
    throw Object.assign(new Error(`${label}: ${msg}`.slice(0, 300)), { status: res.status >= 500 ? 502 : 400, upstream: res.status });
  }
  return data;
}
