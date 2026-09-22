/**
 * Low-end mode — the single, framework-neutral source of truth for it.
 *
 * The setting itself lives in `settings.performance.lowEndMode` and is applied
 * to the document by `applySettings`. This module mirrors that switch so code
 * outside React/Preact (Solid islands, canvas layers, workers) can read and
 * subscribe to it without importing a UI framework.
 *
 * Keeping it dependency-free is deliberate: `src/islands/**` is compiled by
 * Solid, so anything an island imports must not pull Preact in.
 */

let enabled = false;
const listeners = new Set();

export function isLowEnd() {
  return enabled;
}

/**
 * Turn the mode on or off. Also owns the `lithium-low-end` class so the CSS
 * tiering and the JS-side island selection can never drift apart.
 */
export function setLowEndMode(next) {
  const on = Boolean(next);
  if (on === enabled) return enabled;
  enabled = on;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('lithium-low-end', on);
  }
  listeners.forEach(fn => {
    try { fn(on); } catch { /* a broken subscriber must not strand the others */ }
  });
  return on;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function onLowEndChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Device pixel ratio to render canvas layers at.
 *
 * A canvas backing store costs `w·h·dpr²·4` bytes, so clamping to 1 on a 2×
 * display drops a full-window layer from ~59 MB to ~15 MB. This is the largest
 * single memory reduction available anywhere in the shell, which is why the
 * decision lives here rather than at each call site.
 */
export function canvasDpr(max = 2) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(max, enabled ? 1 : dpr);
}

/** Fraction (0–1) of decorative work to keep. Islands use it to trim budgets. */
export function effectBudget() {
  return enabled ? 0.35 : 1;
}
