/**
 * AntiTheft — lightweight client-side deterrent.
 *
 * Two core protections (production only):
 *   1. Frame-busting — if Lithium is embedded in an iframe on another site,
 *      the page is killed immediately (clickjacking defence).
 *   2. DevTools lockdown — F12, Ctrl+Shift+I/J/C, Ctrl+U, and right-click
 *      are intercepted; F12 / detected DevTools instantly close the page.
 *
 * A second frame-bust runs from an inline <script> in index.html so it
 * fires before any ES module executes.
 *
 * NOTE: These are client-side deterrents, not bulletproof security.
 */

// ─── Internals ───────────────────────────────────────────────────────────────

let _dtInterval = null;

/** Kill the page — used when theft is detected. */
function kill() {
  try { window.close(); } catch {}
  // Fallback: blank the document so nothing is visible.
  try { document.documentElement.replaceChildren(); } catch {}
  try { location.replace('about:blank'); } catch {}
}

// ─── Exported guards ─────────────────────────────────────────────────────────

/**
 * Frame-bust: if we're inside a cross-origin iframe, kill page.
 * Also runs from an inline script in index.html for earliest possible check.
 */
export function blockIframing() {
  if (!import.meta.env.PROD) return;
  if (window.top === window) return; // not framed — nothing to do
  try {
    // If top is cross-origin this throws → another site is framing us → kill.
    if (window.top.location.hostname !== location.hostname) kill();
  } catch {
    kill();
  }
}

/**
 * Block inspection shortcuts.  F12 closes the page instantly.
 * Ctrl+Shift+I/J/C and Ctrl+U are silently swallowed.
 * Right-click is disabled.
 */
export function lockDevtools() {
  if (!import.meta.env.PROD) return;

  document.addEventListener('keydown', (e) => {
    // F12 → instant close.
    if (e.key === 'F12') {
      e.preventDefault();
      kill();
      return;
    }
    // Ctrl+Shift+I / J / C  or  Ctrl+U → swallow.
    if (
      (e.ctrlKey && e.shiftKey && /^[IJC]$/.test(e.key)) ||
      (e.ctrlKey && e.key.toLowerCase() === 'u')
    ) {
      e.preventDefault();
    }
  }, true);

  document.addEventListener('contextmenu', (e) => e.preventDefault(), true);
}

/**
 * Periodic DevTools detection via window-size differential.
 * If the gap between outer and inner dimensions exceeds a threshold,
 * DevTools are assumed open and the page is killed.
 */
export function detectDevTools() {
  if (!import.meta.env.PROD) return;
  if (_dtInterval) return;

  const THRESHOLD = 160;

  const check = () => {
    const dw = window.outerWidth - window.innerWidth > THRESHOLD;
    const dh = window.outerHeight - window.innerHeight > THRESHOLD;
    if (dw || dh) {
      clearInterval(_dtInterval);
      _dtInterval = null;
      kill();
    }
  };

  // Only poll while the tab is visible.
  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      clearInterval(_dtInterval);
      _dtInterval = null;
    } else if (!_dtInterval) {
      _dtInterval = setInterval(check, 1000);
    }
  };

  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('beforeunload', () => {
    clearInterval(_dtInterval);
    _dtInterval = null;
  }, { once: true });
  onVis();
}

/** Stamp copyright / author meta tags. */
export function stampMeta() {
  const add = (name, content) => {
    const m = document.createElement('meta');
    m.name = name;
    m.content = content;
    document.head.appendChild(m);
  };
  add('author', 'Lithium');
  add('copyright', `Copyright ${new Date().getFullYear()} Lithium. All Rights Reserved.`);
}

/** Console warning — dev-only notice for open-source developers. */
export function consoleWarning() {
  if (import.meta.env.PROD) return;
  const host = location.hostname || 'localhost';
  console.log(
    '%cDev Environment',
    'color:#22d3ee;font-size:32px;font-weight:bold'
  );
  console.log(
    `This is a dev environment (${host}).\n` +
    'This software is open-source — feel free to explore!\n' +
    'You can safely ignore any AntiTheft warnings;\n' +
    'they only apply to the mainstream production site.'
  );
}

// ─── Single entry-point ──────────────────────────────────────────────────────

/**
 * Initialise all anti-theft protections.
 * Call once from main.jsx after the app mounts.
 */
export function initializeAntiTheft() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  consoleWarning();
  stampMeta();

  if (import.meta.env.PROD) {
    blockIframing();
    lockDevtools();
    detectDevTools();
  }
}

export default initializeAntiTheft;
