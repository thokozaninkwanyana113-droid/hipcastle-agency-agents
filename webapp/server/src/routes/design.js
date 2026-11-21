// Design studio: brief → concept directions → AI/Figma/uploaded concepts → client picks → final
// files → brand kit. Staff run the studio; the client sees only what staff share with them.
import express, { Router } from 'express';
import { db, row, rows } from '../db.js';
import { body, id, webUrl, z } from '../validate.js';
import { authenticate, isStaff, requireRole } from '../auth.js';
import { logEvent } from '../events.js';
import { canonicalUrl } from '../urls.js';
import { guardFields } from '../guard.js';
import * as P from '../pipeline.js';
import { BriefSchema, briefFromOrder, DirectionsSchema, generateDirections } from '../design/brief.js';
import { generateConcepts, recraftConfigured, RECRAFT_MODEL } from '../design/recraft.js';
import { figmaConfigured, figmaExport, figmaFileMeta, figmaKey } from '../design/figma.js';
import { hexToCmyk, hexToRgb, readableOn, recolorSvg, sanitizeSvg, svgColors } from '../design/svg.js';

const r = Router();
r.use(authenticate);
export const MAX_AI_IMAGES = Number(process.env.DESIGN_MAX_AI_IMAGES || 48); // per engagement (cost control)
const staffOnly = requireRole('admin', 'staff');
const fail = (res, err) => res.status(err.status || 500).json({ error: err.message });
const J = (v, d) => { try { return JSON.parse(v); } catch { return d; } };

function loadOrder(req, res) {
  const oid = id(req.params.orderId);
  const o = oid && row(db.prepare('SELECT id, reference, user_id, status FROM orders WHERE id = ?').get(oid));
  if (!o || (!isStaff(req.user) && o.user_id !== req.user.id)) { res.status(404).json({ error: 'Engagement not found' }); return null; }
  return o;
}
function project(orderId) {
  let p = db.prepare('SELECT * FROM design_projects WHERE order_id = ?').get(orderId);
  if (!p) {
    db.prepare('INSERT INTO design_projects (order_id, brief) VALUES (?, ?)').run(orderId, JSON.stringify(briefFromOrder(orderId)));
    p = db.prepare('SELECT * FROM design_projects WHERE order_id = ?').get(orderId);
  }
  return { ...p, brief: J(p.brief, {}), directions: J(p.directions, []), figma_meta: J(p.figma_meta, null), checks: J(p.checks, {}) };
}
const touch = (orderId, fields) => {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE design_projects SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE order_id = ?`)
    .run(...keys.map((k) => (typeof fields[k] === 'object' && fields[k] !== null ? JSON.stringify(fields[k]) : fields[k])), orderId);
};
const ASSET_COLS = 'id, order_id, direction, kind, variant, title, mime, bytes, source, prompt, shared, client_pick, client_comment, created_at';
function storeAsset(orderId, { buffer, mime, title, kind = 'concept', variant = null, direction = null, source, prompt = null, actorId = null }) {
  return db.prepare(`INSERT INTO design_assets (order_id, direction, kind, variant, title, mime, data, bytes, source, prompt, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).get(orderId, direction, kind, variant, title.slice(0, 120), mime, buffer, buffer.length, source, prompt, actorId).id;
}
const sniff = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg'
  : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null);

/** The brand kit: final logo files, palette (HEX/RGB/CMYK) and fonts. */
function brandKit(p, finals) {
  const primary = finals.find((a) => a.variant === 'primary') || finals[0];
  const dir = p.directions[primary?.direction ?? -1] || p.directions[0];
  let palette = dir?.palette || [];
  if (primary?.mime === 'image/svg+xml') {
    const svg = Buffer.from(db.prepare('SELECT data FROM design_assets WHERE id = ?').get(primary.id).data).toString('utf8');
    const used = svgColors(svg, 5).filter((c) => !['#ffffff', '#fff'].includes(c));
    if (used.length >= 2) palette = used;
  }
  return {
    released_at: p.kit_released_at,
    logos: finals,
    palette: palette.map((h) => ({ hex: h, rgb: hexToRgb(h), cmyk: hexToCmyk(h), text_on: readableOn(h) })),
    fonts: dir?.fonts || null,
    usage: ['Keep clear space around the logo at least the height of its smallest letter or shape.', 'Use the one-colour versions on photos and busy backgrounds.',
      'Don’t stretch, rotate, recolour outside the palette, or add effects.', 'Minimum width: 24 mm in print, 120 px on screen (use the symbol alone below that).'],
  };
}

function view(o, req) {
  const p = project(o.id);
  const staff = isStaff(req.user);
  const assets = rows(db.prepare(`SELECT ${ASSET_COLS} FROM design_assets WHERE order_id = ? ORDER BY kind DESC, id`).all(o.id));
  const finals = assets.filter((a) => a.kind === 'final');
  if (!staff) {
    const visible = assets.filter((a) => a.kind === 'concept' && a.shared).map(({ prompt, source, ...a }) => a);
    return {
      order_id: o.id, brief: { business_name: p.brief.business_name },
      directions: p.directions.map(({ prompt, ...d }) => d), concepts: visible,
      kit: p.kit_released_at ? brandKit(p, finals.map(({ prompt, source, ...a }) => a)) : null,
      figma_url: p.figma_url,
    };
  }
  return {
    order_id: o.id, brief: p.brief, directions: p.directions, directions_by: p.directions_by, figma_url: p.figma_url, figma_meta: p.figma_meta,
    checks: p.checks, concepts: assets.filter((a) => a.kind === 'concept'), finals, kit: brandKit(p, finals), kit_released_at: p.kit_released_at,
    ai: { recraft: recraftConfigured(), model: RECRAFT_MODEL, used: p.generations, limit: MAX_AI_IMAGES }, figma: { configured: figmaConfigured() },
  };
}
const send = (req, res, o) => res.json(view(o, req));
const wrap = (fn) => async (req, res) => {
  const o = loadOrder(req, res); if (!o) return;
  try { const out = await fn(o, req, res); if (!res.headersSent) (out === undefined ? send(req, res, o) : res.json(out)); } catch (err) { fail(res, err); }
};
const milestone = (orderId, key) => row(db.prepare('SELECT * FROM milestones WHERE order_id = ? AND key = ? ORDER BY cycle DESC LIMIT 1').get(orderId, key));

r.get('/:orderId', wrap(() => undefined));

// ---------------------------------------------------------------- staff: brief & directions
r.put('/:orderId/brief', staffOnly, body(z.object({ brief: BriefSchema })), guardFields('brief.*'), wrap((o, req) => { project(o.id); touch(o.id, { brief: req.body.brief }); }));
r.post('/:orderId/brief/reset', staffOnly, wrap((o) => { project(o.id); touch(o.id, { brief: briefFromOrder(o.id) }); }));
r.post('/:orderId/directions', staffOnly, wrap(async (o, req) => {
  const p = project(o.id);
  const out = await generateDirections(p.brief);
  touch(o.id, { directions: out.directions, directions_by: out.by });
  logEvent('design.directions', `${o.reference}: ${out.directions.length} concept directions (${out.by})`, { actor: req.user.id, ref: o.reference });
  return { ...view(o, req), warning: out.warning || null };
}));
r.put('/:orderId/directions', staffOnly, body(z.object({ directions: DirectionsSchema })), wrap((o, req) => { project(o.id); touch(o.id, { directions: req.body.directions, directions_by: 'staff' }); }));

// ---------------------------------------------------------------- staff: concepts
r.post('/:orderId/generate', staffOnly, body(z.object({ direction: z.number().int().min(0).max(3), n: z.number().int().min(1).max(6).default(4) })), wrap(async (o, req) => {
  const p = project(o.id);
  const d = p.directions[req.body.direction];
  if (!d) throw Object.assign(new Error('Create concept directions first'), { status: 409 });
  const n = Math.min(req.body.n, MAX_AI_IMAGES - p.generations);
  if (n <= 0) throw Object.assign(new Error(`AI image limit for this engagement reached (${MAX_AI_IMAGES}). Upload designs instead, or raise DESIGN_MAX_AI_IMAGES.`), { status: 429 });
  const { images, credits } = await generateConcepts({ prompt: d.prompt, palette: d.palette, n });
  const existing = db.prepare('SELECT COUNT(*) n FROM design_assets WHERE order_id = ? AND direction = ?').get(o.id, req.body.direction).n;
  images.forEach((img, i) => storeAsset(o.id, { buffer: Buffer.from(img.svg), mime: 'image/svg+xml', title: `${d.name} ${existing + i + 1}`, direction: req.body.direction, source: 'recraft', prompt: d.prompt, actorId: req.user.id }));
  touch(o.id, { generations: p.generations + images.length });
  logEvent('design.generated', `${o.reference}: ${images.length} AI concept(s) for “${d.name}”${credits != null ? ` (${credits} Recraft units)` : ''}`, { actor: req.user.id, ref: o.reference });
}));

// Upload: send the file as the raw request body (SVG, PNG, JPEG or WebP, max 3 MB).
r.post('/:orderId/assets', staffOnly, express.raw({ type: ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'], limit: '3mb' }), wrap((o, req) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw Object.assign(new Error('Send an SVG, PNG, JPEG or WebP file'), { status: 400 });
  project(o.id);
  const declared = String(req.headers['content-type']).split(';')[0];
  const mime = declared === 'image/svg+xml' ? declared : sniff(req.body);
  if (!mime) throw Object.assign(new Error('That file isn’t a valid PNG, JPEG or WebP image'), { status: 400 });
  const buffer = mime === 'image/svg+xml' ? Buffer.from(sanitizeSvg(req.body)) : req.body;
  const q = z.object({ title: z.string().trim().min(1).max(120).default('Uploaded design'), kind: z.enum(['concept', 'final']).default('concept'),
    variant: z.enum(['primary', 'mono_dark', 'mono_light', 'icon', 'other']).optional(), direction: z.coerce.number().int().min(0).max(3).optional() }).parse(req.query);
  storeAsset(o.id, { buffer, mime, title: q.title, kind: q.kind, variant: q.kind === 'final' ? q.variant || 'other' : null, direction: q.direction ?? null, source: 'upload', actorId: req.user.id });
}));

const loadAsset = (o, req) => {
  const a = id(req.params.aid) && row(db.prepare(`SELECT ${ASSET_COLS} FROM design_assets WHERE id = ? AND order_id = ?`).get(id(req.params.aid), o.id));
  if (!a) throw Object.assign(new Error('Design not found'), { status: 404 });
  return a;
};
r.get('/:orderId/assets/:aid/file', wrap((o, req, res) => {
  const a = loadAsset(o, req);
  const p = project(o.id);
  const visible = isStaff(req.user) || (a.kind === 'concept' && a.shared) || (a.kind === 'final' && p.kit_released_at);
  if (!visible) throw Object.assign(new Error('Design not found'), { status: 404 });
  const { data } = db.prepare('SELECT data FROM design_assets WHERE id = ?').get(a.id);
  const ext = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[a.mime];
  const name = `${p.brief.business_name || o.reference}-${a.title}`.replace(/[^\w.-]+/g, '-').toLowerCase();
  res.set({ 'Content-Type': a.mime, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox", 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=300', 'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${name}.${ext}"` }).send(Buffer.from(data));
}));
r.patch('/:orderId/assets/:aid', staffOnly, body(z.object({
  title: z.string().trim().min(1).max(120).optional(), kind: z.enum(['concept', 'final']).optional(),
  variant: z.enum(['primary', 'mono_dark', 'mono_light', 'icon', 'other']).nullable().optional(), direction: z.number().int().min(0).max(3).nullable().optional(), shared: z.boolean().optional(),
})), wrap((o, req) => {
  const a = loadAsset(o, req);
  const b = req.body;
  const kind = b.kind ?? a.kind;
  // A logo used as the final file is copied, so the client's concept board stays as it was.
  if (b.kind === 'final' && a.kind === 'concept') {
    const { data } = db.prepare('SELECT data FROM design_assets WHERE id = ?').get(a.id);
    storeAsset(o.id, { buffer: Buffer.from(data), mime: a.mime, title: b.title || `${a.title} (final)`, kind: 'final', variant: b.variant || 'primary', direction: a.direction, source: 'derived', actorId: req.user.id });
    return;
  }
  db.prepare('UPDATE design_assets SET title = ?, kind = ?, variant = ?, direction = ?, shared = ? WHERE id = ?')
    .run(b.title ?? a.title, kind, kind === 'final' ? (b.variant !== undefined ? b.variant : a.variant) || 'other' : null, b.direction !== undefined ? b.direction : a.direction, b.shared !== undefined ? (b.shared ? 1 : 0) : a.shared, a.id);
}));
r.delete('/:orderId/assets/:aid', staffOnly, wrap((o, req) => { const a = loadAsset(o, req); db.prepare('DELETE FROM design_assets WHERE id = ?').run(a.id); }));

// One-colour versions from the final SVG logo.
r.post('/:orderId/assets/:aid/variants', staffOnly, wrap((o, req) => {
  const a = loadAsset(o, req);
  if (a.mime !== 'image/svg+xml') throw Object.assign(new Error('One-colour versions need an SVG logo'), { status: 409 });
  const svg = Buffer.from(db.prepare('SELECT data FROM design_assets WHERE id = ?').get(a.id).data).toString('utf8');
  for (const [variant, color, label] of [['mono_dark', '#111111', 'one colour (black)'], ['mono_light', '#ffffff', 'one colour (white, for dark backgrounds)']]) {
    db.prepare("DELETE FROM design_assets WHERE order_id = ? AND kind = 'final' AND variant = ? AND source = 'derived' AND title LIKE ?").run(o.id, variant, `${a.title} — %`);
    storeAsset(o.id, { buffer: Buffer.from(recolorSvg(svg, color)), mime: 'image/svg+xml', title: `${a.title} — ${label}`, kind: 'final', variant, direction: a.direction, source: 'derived', actorId: req.user.id });
  }
}));

// Share concepts with the client and ask for their pick (submits the "Design concepts" milestone).
r.post('/:orderId/share', staffOnly, body(z.object({ asset_ids: z.array(z.number().int().positive()).min(1).max(30), note: z.string().trim().max(2000).optional().default('') })), wrap((o, req) => {
  if (o.status === 'pending') throw Object.assign(new Error('Work starts once the deposit is paid'), { status: 409 });
  const ids = req.body.asset_ids.filter((x) => db.prepare("SELECT 1 FROM design_assets WHERE id = ? AND order_id = ? AND kind = 'concept'").get(x, o.id));
  if (!ids.length) throw Object.assign(new Error('Choose at least one concept'), { status: 400 });
  db.prepare(`UPDATE design_assets SET shared = 1 WHERE order_id = ? AND id IN (${ids.map(() => '?').join(',')})`).run(o.id, ...ids);
  const m = milestone(o.id, 'concepts');
  if (m && ['todo', 'in_progress', 'changes_requested'].includes(m.status)) {
    P.submitMilestone(m, { url: `${canonicalUrl()}/portal/orders/${o.id}#design`, note: req.body.note || `${ids.length} logo concepts are ready. Star your favourites and leave a comment, then approve the direction you'd like us to refine.` }, req.user);
  }
  logEvent('design.shared', `${o.reference}: ${ids.length} concept(s) shared with the client`, { actor: req.user.id, ref: o.reference });
}));

// ---------------------------------------------------------------- client: picks & comments
r.post('/:orderId/assets/:aid/pick', body(z.object({ pick: z.boolean(), comment: z.string().trim().max(1000).optional().default('') })), guardFields('comment'), wrap((o, req) => {
  if (o.user_id !== req.user.id) throw Object.assign(new Error('Only the client can pick concepts'), { status: 403 });
  const a = loadAsset(o, req);
  if (a.kind !== 'concept' || !a.shared) throw Object.assign(new Error('Design not found'), { status: 404 });
  db.prepare('UPDATE design_assets SET client_pick = ?, client_comment = ? WHERE id = ?').run(req.body.pick ? 1 : 0, req.body.comment || null, a.id);
  if (req.body.pick || req.body.comment) logEvent('design.feedback', `${o.reference}: client ${req.body.pick ? 'starred' : 'commented on'} “${a.title}”${req.body.comment ? ` — “${req.body.comment.slice(0, 80)}”` : ''}`, { actor: req.user.id, ref: o.reference });
}));

// ---------------------------------------------------------------- staff: Figma
r.post('/:orderId/figma', staffOnly, body(z.object({ url: z.union([z.literal(''), webUrl()]) })), wrap(async (o, req) => {
  project(o.id);
  if (!req.body.url) { touch(o.id, { figma_url: null, figma_meta: null }); return; }
  const key = figmaKey(req.body.url);
  if (!key) throw Object.assign(new Error('Paste a figma.com/design/… link'), { status: 400 });
  const meta = figmaConfigured() ? await figmaFileMeta(key) : null;
  touch(o.id, { figma_url: req.body.url, figma_meta: meta });
}));
r.post('/:orderId/figma/import', staffOnly, body(z.object({ ids: z.array(z.string().regex(/^[\w:;-]+$/)).min(1).max(12), format: z.enum(['svg', 'png']).default('svg'), kind: z.enum(['concept', 'final']).default('concept') })), wrap(async (o, req) => {
  const p = project(o.id);
  const key = p.figma_url && figmaKey(p.figma_url);
  if (!key) throw Object.assign(new Error('Link a Figma file first'), { status: 409 });
  const names = Object.fromEntries((p.figma_meta?.frames || []).map((f) => [f.id, f.name]));
  const files = await figmaExport(key, req.body.ids, req.body.format);
  for (const f of files) {
    const svg = req.body.format === 'svg';
    if (!svg && !sniff(f.buffer)) continue;
    storeAsset(o.id, { buffer: svg ? Buffer.from(sanitizeSvg(f.buffer)) : f.buffer, mime: svg ? 'image/svg+xml' : 'image/png', title: names[f.id] || `Figma ${f.id}`, kind: req.body.kind, variant: req.body.kind === 'final' ? 'other' : null, source: 'figma', actorId: req.user.id });
  }
  logEvent('design.figma', `${o.reference}: ${files.length} frame(s) imported from Figma`, { actor: req.user.id, ref: o.reference });
}));

// ---------------------------------------------------------------- staff: quality gate & release
r.put('/:orderId/checks', staffOnly, body(z.object({ designer_refined: z.boolean(), trademark_checked: z.boolean(), trademark_note: z.string().trim().max(500).optional().default('') })), wrap((o, req) => {
  project(o.id); touch(o.id, { checks: { ...req.body, by: req.user.name, at: new Date().toISOString() } });
}));
r.post('/:orderId/release', staffOnly, wrap((o, req) => {
  const p = project(o.id);
  if (!p.checks.designer_refined || !p.checks.trademark_checked) {
    throw Object.assign(new Error('Before release, confirm a designer refined the final logo and a CIPC trade mark search was done.'), { status: 409 });
  }
  if (!db.prepare("SELECT 1 FROM design_assets WHERE order_id = ? AND kind = 'final' AND variant = 'primary'").get(o.id)) {
    throw Object.assign(new Error('Add the final primary logo first'), { status: 409 });
  }
  touch(o.id, { kit_released_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
  const m = milestone(o.id, 'files');
  if (m && m.status !== 'done' && m.status !== 'awaiting_client' && o.status !== 'pending') {
    P.submitMilestone(m, { url: `${canonicalUrl()}/portal/orders/${o.id}#design`, note: 'Your logo files and brand kit are ready to download from your portal: SVG (any size), PNG, one-colour versions, colours (HEX, RGB, CMYK) and fonts.' }, req.user);
  }
  logEvent('design.released', `${o.reference}: brand kit released to the client`, { actor: req.user.id, ref: o.reference });
}));

export default r;
