/**
 * Exact-color recoloring for silhouette PNG icons (public/icons/*.png).
 *
 * CSS filter chains (invert/sepia/saturate/hue-rotate) can only approximate a
 * target color and wash out to near-white tints, so instead every opaque pixel
 * is rewritten to the target color once per (icon, color) on a canvas and the
 * resulting data URL is cached. The current global icon color lives in a
 * signal so subscribed components re-render only when the color actually
 * changes — not on every unrelated settings update.
 */
import { useEffect, useState } from 'react';
import { signal } from '@preact/signals';

/** Resolved global icon color: a hex string, or null for "leave icons as-is". */
export const iconColor = signal(null);

/** Colorful mode is on: each icon resolves its color from `iconColorMap`. */
export const colorfulMode = signal(false);

/** Per-icon colors keyed by PNG basename (iconFile) or Icon name. */
export const iconColorMap = signal({});

/** Called by applySettings with the resolved hex (or null for the default look). */
export function setIconColor(hex) {
  iconColor.value = hex || null;
}

/** Called by applySettings to toggle per-icon (colorful) mode. */
export function setColorfulMode(on) {
  colorfulMode.value = !!on;
}

/** Called by applySettings with the `{ key: hex }` map used in colorful mode. */
export function setIconColorMap(map) {
  iconColorMap.value = map && typeof map === 'object' ? map : {};
}

/** Resolve the raw `theme.iconColor` setting to a hex color (or null). */
export function resolveIconColorSetting(raw, accent) {
  if (!raw || raw === 'default' || raw === 'none') return null;
  if (raw === 'accent') return accent || null;
  // Colorful mode has no global tint — each icon resolves its own color.
  if (raw === 'colorful') return null;
  return raw;
}

/**
 * The color that should apply to a single icon, honoring the current mode:
 * in colorful mode only icons the user colored are recolored (others stay as
 * original); otherwise every icon follows the single global tint. Reading the
 * signal `.value`s here means subscribed components re-render when any of the
 * three inputs change.
 */
export function colorForKey(key) {
  if (colorfulMode.value) {
    return (key && iconColorMap.value[key]) || null;
  }
  return iconColor.value;
}

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const n = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

/* name → Map<color, Promise<dataURL|null>>; each color map is pruned so the
   cache stays bounded while the user experiments in Settings. */
const recolorCache = new Map();
const MAX_CACHED_COLORS = 4;

/** Accepts either a basename ("files") or an asset path ("/icons/files.png"). */
function pngNameOf(src) {
  if (!src) return null;
  if (src.startsWith('/icons/') && src.endsWith('.png')) return src.slice(7, -4);
  return src;
}

/**
 * Recolor every opaque pixel of /icons/{name}.png to `color` and return a PNG
 * data URL. Resolves null when no name/color is given or the asset fails.
 */
export function getRecoloredPng(name, color) {
  const key = pngNameOf(name);
  if (!key || !color) return Promise.resolve(null);
  let colorMap = recolorCache.get(key);
  if (!colorMap) {
    colorMap = new Map();
    recolorCache.set(key, colorMap);
  }
  if (colorMap.has(color)) return colorMap.get(color);
  const promise = new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || 24;
        const h = img.naturalHeight || 24;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const [tr, tg, tb] = hexToRgb(color);
        const imageData = ctx.getImageData(0, 0, w, h);
        const px = imageData.data;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] !== 0) {
            px[i] = tr;
            px[i + 1] = tg;
            px[i + 2] = tb;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `/icons/${key}.png`;
  });
  colorMap.set(color, promise);
  // Keep only the most recent colors per icon so memory stays bounded.
  if (colorMap.size > MAX_CACHED_COLORS) {
    colorMap.delete(colorMap.keys().next().value);
  }
  return promise;
}

/**
 * Preact hook: returns the recolored <img src> for a PNG icon under the
 * current global icon color, or null when the original asset should be used
 * (no color set, recolor still in flight, or asset unavailable).
 */
export function useColoredPng(name, colorOverride) {
  const color = colorOverride !== undefined ? colorOverride : colorForKey(pngNameOf(name));
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!color) {
      setUrl(null);
      return;
    }
    let active = true;
    getRecoloredPng(name, color).then(u => {
      if (active) setUrl(u);
    });
    return () => { active = false; };
  }, [name, color]);

  return url;
}
