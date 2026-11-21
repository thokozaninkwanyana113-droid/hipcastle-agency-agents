// Figma: link the designer's working file to an engagement and import frames as images.
// Uses a personal access token (FIGMA_TOKEN) with read access to file content.
const API = 'https://api.figma.com/v1';
export const figmaConfigured = () => Boolean(process.env.FIGMA_TOKEN);
let fetcher = (...a) => fetch(...a);
export function setFigmaFetch(f) { fetcher = f; }

/** File key from a figma.com/design|file|proto link. */
export function figmaKey(url) {
  const m = String(url).match(/^https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9]{10,64})/);
  return m ? m[1] : null;
}

async function get(path) {
  if (!figmaConfigured()) throw Object.assign(new Error('Add FIGMA_TOKEN to read Figma files (the link still works without it).'), { status: 400 });
  const res = await fetcher(`${API}${path}`, { headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN }, signal: AbortSignal.timeout(30_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Figma: ${data.err || data.message || res.status}`), { status: res.status === 404 || res.status === 403 ? 400 : 502 });
  return data;
}

/** File name, last change, thumbnail and top-level frames (for importing). */
export async function figmaFileMeta(key) {
  const f = await get(`/files/${key}?depth=2`);
  const frames = [];
  for (const page of f.document?.children || []) {
    for (const n of page.children || []) if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION'].includes(n.type)) frames.push({ id: n.id, name: n.name, page: page.name });
  }
  return { name: f.name, last_modified: f.lastModified, thumbnail: f.thumbnailUrl || null, frames: frames.slice(0, 200) };
}

/** Export frames as SVG or PNG. Returns [{ id, buffer }]. */
export async function figmaExport(key, ids, format = 'svg') {
  const r = await get(`/images/${key}?ids=${encodeURIComponent(ids.join(','))}&format=${format}${format === 'png' ? '&scale=2' : ''}`);
  if (r.err) throw Object.assign(new Error(`Figma: ${r.err}`), { status: 502 });
  const out = [];
  for (const id of ids) {
    const url = r.images?.[id];
    if (!url) continue;
    const file = await fetcher(url, { signal: AbortSignal.timeout(60_000) });
    if (file.ok) out.push({ id, buffer: Buffer.from(await file.arrayBuffer()) });
  }
  return out;
}
