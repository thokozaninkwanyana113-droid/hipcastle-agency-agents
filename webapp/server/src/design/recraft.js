// Recraft: AI logo concepts as editable vector SVG (https://www.recraft.ai/docs).
// Result URLs last about 24 hours, so files are downloaded and stored straight away.
import { hexToRgb, sanitizeSvg } from './svg.js';

const BASE = 'https://external.api.recraft.ai/v1';
export const RECRAFT_MODEL = process.env.RECRAFT_MODEL || 'recraftv4_1_vector';
export const recraftConfigured = () => Boolean(process.env.RECRAFT_API_TOKEN);
let fetcher = (...a) => fetch(...a);
export function setRecraftFetch(f) { fetcher = f; }

/** Generate n (1–6) vector concepts. Returns [{ svg, image_id }]. */
export async function generateConcepts({ prompt, palette = [], n = 4 }) {
  if (!recraftConfigured()) throw Object.assign(new Error('Add RECRAFT_API_TOKEN to generate AI concepts (or upload designs instead).'), { status: 400 });
  const controls = palette.length ? { colors: palette.slice(0, 5).map((h) => ({ rgb: hexToRgb(h) })), background_color: { rgb: [255, 255, 255] } } : undefined;
  const res = await fetcher(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RECRAFT_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.slice(0, 9000), model: RECRAFT_MODEL, n: Math.min(6, Math.max(1, n)), size: '1:1', response_format: 'url', ...(controls && { controls }) }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Recraft: ${data.message || data.error?.message || data.code || res.status}`), { status: 502 });
  const out = [];
  for (const img of data.data || []) {
    const file = await fetcher(img.url, { signal: AbortSignal.timeout(60_000) });
    if (!file.ok) continue;
    out.push({ svg: sanitizeSvg(Buffer.from(await file.arrayBuffer())), image_id: img.image_id });
  }
  if (!out.length) throw Object.assign(new Error('Recraft returned no images'), { status: 502 });
  return { images: out, credits: data.credits ?? null };
}
