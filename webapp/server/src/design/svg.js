// SVG safety and colour helpers for the design studio. SVGs come from AI tools, Figma exports and
// staff uploads, so they are sanitised before storage and only ever displayed as images.

const MAX = 3 * 1024 * 1024;

/** Strip anything executable or external from an SVG. Throws if it isn't an SVG. */
export function sanitizeSvg(input) {
  let s = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  if (s.length > MAX) throw Object.assign(new Error('SVG is larger than 3 MB'), { status: 413 });
  s = s.replace(/^﻿/, '').replace(/<\?xml[^>]*\?>/i, '').replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/^\s*<svg[\s>]/i.test(s)) throw Object.assign(new Error('Not an SVG file'), { status: 400 });
  s = s.replace(/<(script|foreignObject|iframe|object|embed|audio|video|handler|listener)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|audio|video|handler|listener)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:xlink:)?href\s*=\s*("|')(?!#|data:image\/(?:png|jpe?g|webp|gif);base64,)[^"']*\1/gi, '')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/javascript:/gi, '');
  return s.trim();
}

const NAMED = { black: '#000000', white: '#ffffff' };
const norm = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h).toLowerCase();

/** The main colours used in an SVG, most frequent first. */
export function svgColors(svg, limit = 6) {
  const counts = new Map();
  const found = [...String(svg).matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,6}\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|black|white)/gi)].map((m) => m[1]);
  for (const raw of found) {
    let c = raw.toLowerCase();
    if (NAMED[c]) c = NAMED[c];
    const rgb = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgb) c = `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    if (!/^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i.test(c)) continue;
    c = norm(c);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c]) => c);
}

/** One-colour version of a logo (e.g. all black, or all white for dark backgrounds). */
export function recolorSvg(svg, color) {
  const isBackground = (attrs) => /\bwidth\s*=\s*["']100%["']/.test(attrs);
  return String(svg)
    .replace(/<rect\b([^>]*)\/?>(?:<\/rect>)?/gi, (m, attrs) => (isBackground(attrs) ? '' : m))
    .replace(/((?:fill|stroke|stop-color)\s*=\s*["'])(?!none|transparent|url)[^"']+(["'])/gi, `$1${color}$2`)
    .replace(/((?:fill|stroke|stop-color)\s*:\s*)(?!none|transparent|url)[^;"'}]+/gi, `$1${color}`);
}

export const hexToRgb = (h) => { const x = norm(h); return [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)); };
/** Approximate CMYK for print hand-off (printers should proof with the exact profile). */
export function hexToCmyk(h) {
  const [r, g, b] = hexToRgb(h).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [r, g, b].map((v) => Math.round(((1 - v - k) / (1 - k)) * 100)).concat(Math.round(k * 100));
}
/** Text colour (black/white) with the better WCAG contrast on this background. */
export function readableOn(h) {
  const lum = hexToRgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return (1.05 / (L + 0.05)) > ((L + 0.05) / 0.05) ? '#ffffff' : '#111111';
}
