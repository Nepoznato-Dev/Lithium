/**
 * Phone-mode detection — the single source of truth for whether Lithium should
 * render the touch shell (MobileShell) instead of the Windows-style desktop
 * shell.
 *
 * The two shells share the exact same state (`useDesktopState`) and look
 * (theme tokens, accent, glass, wallpaper, icons); only the layout differs. So
 * this module answers one question — "phone layout or desktop layout?" — and
 * lets the app swap the mount point at `/`.
 *
 * The touch shell has two faces of its own: on a phone viewport it is iOS, and
 * on a desktop-wide viewport it presents itself macOS-style (menu bar, floating
 * windows, Dock). See Mobile/useMacShell — that choice is made inside the shell,
 * not here, so forcing 'phone' on a desktop is what turns macOS on.
 *
 * Detection is deliberately width + coarse-pointer based, with an override so
 * the mobile layout can be previewed on a desktop or forced on a large phone:
 *   - `?ui=phone` / `?ui=desktop` in the URL (persisted once read)
 *   - localStorage `lithium:ui-mode` = 'phone' | 'desktop' | '' (auto)
 *   - Settings → Appearance → Shell layout
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lithium:ui-mode';
/* A tablet in portrait is still closer to a phone than a desktop. */
const PHONE_QUERY = '(max-width: 820px) and (pointer: coarse), (max-width: 700px)';

function readStoredOverride() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

/** Persisted override: 'phone' | 'desktop' | '' (empty = auto-detect). */
export function getUiModeOverride() {
  return readStoredOverride();
}

/** Lock the shell to a layout, or pass '' to return to automatic detection. */
export function setUiModeOverride(mode) {
  const next = mode === 'phone' || mode === 'desktop' ? mode : '';
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable — fall back to auto for this session */ }
  window.dispatchEvent(new CustomEvent('lithium:ui-mode-changed', { detail: { mode: next } }));
  return next;
}

/** Consume a `?ui=phone|desktop` URL flag once, then let it drop away. */
function consumeUrlFlag() {
  try {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get('ui');
    if (flag !== 'phone' && flag !== 'desktop') return;
    setUiModeOverride(flag);
    url.searchParams.delete('ui');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* malformed URL — ignore */ }
}

/** Pure check used outside React (initial render, event handlers). */
export function isPhoneViewport() {
  const override = readStoredOverride();
  if (override === 'phone') return true;
  if (override === 'desktop') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

/** Reactive phone-mode flag. */
export function usePhoneMode() {
  const [phone, setPhone] = useState(() => {
    consumeUrlFlag();
    return isPhoneViewport();
  });

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(isPhoneViewport());
    // Re-evaluate whenever the override changes (from Settings, ?ui=, etc.).
    window.addEventListener('lithium:ui-mode-changed', sync);
    mq.addEventListener('change', sync);
    return () => {
      window.removeEventListener('lithium:ui-mode-changed', sync);
      mq.removeEventListener('change', sync);
    };
  }, []);

  return phone;
}
