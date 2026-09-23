/**
 * Icon name → inline SVG markup, with no framework in sight.
 *
 * `Components/Icon.jsx` renders the same registry through Preact. Islands are
 * compiled by vite-plugin-solid and may not import a Preact component to draw a
 * glyph, so every runtime needs a framework-free path to the same shapes. This
 * is it.
 *
 * Glyphs stay inline SVG rather than `<img>`. Rasterising one image per row
 * multiplies decoded bitmaps across a long list, which is the shape of the
 * memory blow-up this app has already hit twice.
 */
import { ICON_PATHS } from './iconPaths.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeAttr = value => String(value).replace(/[&<>"]/g, ch => ESCAPES[ch]);

/**
 * Serialise an icon once per (name, size, colour, weight) and hand back markup.
 *
 * A list of a thousand rows then performs one string lookup and one `innerHTML`
 * assignment each, instead of building a component instance per SVG child. The
 * cache is keyed on the drawing parameters, never on the row, so it stays small
 * no matter how many files or tabs are open.
 */
const SVG_CACHE = new Map();

export function iconSvg(name, size = 24, color = 'currentColor', strokeWidth = 2) {
  const key = `${name}|${size}|${color}|${strokeWidth}`;
  const hit = SVG_CACHE.get(key);
  if (hit !== undefined) return hit;

  const nodes = ICON_PATHS[name];
  if (!nodes) {
    if (import.meta.env.DEV) console.warn('Icon not found: ' + name);
    SVG_CACHE.set(key, '');
    return '';
  }

  let body = '';
  for (const [tag, attrs] of nodes) {
    body += `<${tag}`;
    for (const attr in attrs) {
      if (attr === 'key') continue;
      body += ` ${attr}="${escapeAttr(attrs[attr])}"`;
    }
    body += '/>';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"`
    + ` fill="none" stroke="${escapeAttr(color)}" stroke-width="${strokeWidth}"`
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + body
    + '</svg>';
  if (SVG_CACHE.size > 400) SVG_CACHE.delete(SVG_CACHE.keys().next().value);
  SVG_CACHE.set(key, svg);
  return svg;
}
