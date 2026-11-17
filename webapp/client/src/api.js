const TOKEN_KEY = 'hipcastle_token';

import { attributionHeader } from './analytics.js';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(method !== 'GET' && attributionHeader() && { 'X-Attribution': attributionHeader() }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const redacted = res.headers.get('X-Content-Redacted');
  if (redacted) window.dispatchEvent(new CustomEvent('hipcastle:redacted', { detail: redacted.split(',') }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Request failed', res.status, data.fields);
  return data;
}
