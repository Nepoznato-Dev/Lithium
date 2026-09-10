import { storage } from '../storage/localStorage';
import { wasmHash } from '../core';

const SNAP_EDGE = 14;

/* ================================================================
 *  Window snapping — snap zones, bounds, and preview styles.
 * ================================================================ */

/** How close to a screen edge the pointer must be to trigger a snap zone. */
export const SNAP_EDGE_SIZE = SNAP_EDGE;

/**
 * Work area = viewport minus the taskbar (mirrors the --tb-left/right/bottom
 * CSS variables that `.nx-window` maximized layout uses).
 */
export function workArea() {
  const prefs = storage.get('taskbar-prefs', { position: 'bottom' });
  const left = prefs.position === 'left' ? 58 : 0;
  const right = prefs.position === 'right' ? 58 : 0;
  const bottom = prefs.position === 'bottom' ? 48 : 0;
  return {
    left,
    right,
    bottom,
    width: window.innerWidth - left - right,
    height: window.innerHeight - bottom,
  };
}

/** Which snap zone the pointer is in (if any): left half / right half / maximize / quarters. */
export function detectSnapZone(clientX, clientY) {
  const basic = (clientY <= SNAP_EDGE) ? 'maximize' : (clientX <= SNAP_EDGE) ? 'left' : (clientX >= window.innerWidth - SNAP_EDGE) ? 'right' : null;
  if (basic) return basic;
  // Check quarter zones when dragging to corners (not at the very top edge)
  if (clientY > 60) {
    const area = workArea();
    const midX = area.left + area.width / 2;
    const midY = area.height / 2;
    const cornerThreshold = Math.min(area.width, area.height) * 0.2;
    if (clientX < area.left + cornerThreshold && clientY > midY - cornerThreshold) return 'quarter-top-left';
    if (clientX > area.left + area.width - cornerThreshold && clientY > midY - cornerThreshold) return 'quarter-top-right';
    if (clientX < area.left + cornerThreshold && clientY > area.height - cornerThreshold) return 'quarter-bottom-left';
    if (clientX > area.left + area.width - cornerThreshold && clientY > area.height - cornerThreshold) return 'quarter-bottom-right';
  }
  return null;
}

/** Window bounds for a snap side, or null for maximize (caller sets maximized: true). */
export function snapBounds(side) {
  const prefs = storage.get('taskbar-prefs', { position: 'bottom' }).position;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const area = workArea();
  const halfW = Math.round(area.width / 2);
  const halfH = Math.round(area.height / 2);
  const tp = storage.get('taskbar-prefs', { position: 'bottom' }).position || 'bottom';
  const left = tp === 'left' ? 58 : 0;
  const right = tp === 'right' ? 58 : 0;
  const bottom = tp === 'bottom' ? 48 : 0;
  const areaW = w - left - right;
  const areaH = h - bottom;
  const half = Math.floor(areaW / 2);
  if (side === 'left' || side === 'right') {
    const x = side === 'left' ? left : left + areaW - half;
    return { x, y: 0, width: half, height: areaH, maximized: false };
  }
  if (side === 'quarter-top-left') return { x: area.left, y: 0, width: halfW, height: halfH };
  if (side === 'quarter-top-right') return { x: area.left + halfW, y: 0, width: halfW, height: halfH };
  if (side === 'quarter-bottom-left') return { x: area.left, y: halfH, width: halfW, height: halfH };
  if (side === 'quarter-bottom-right') return { x: area.left + halfW, y: halfH, width: halfW, height: halfH };
  return null;
}

/** Inline style for the translucent drop-preview rectangle of a snap zone. */
export function snapPreviewStyle(side) {
  const tp = storage.get('taskbar-prefs', { position: 'bottom' }).position || 'bottom';
  const left = tp === 'left' ? 58 : 0;
  const right = tp === 'right' ? 58 : 0;
  const bottom = tp === 'bottom' ? 48 : 0;
  const areaW = window.innerWidth - left - right;
  const areaH = window.innerHeight - bottom;
  const half = Math.floor(areaW / 2);
  const pad = 8;
  let posLeft, width, height;
  if (side === 'left') { posLeft = left + pad; width = half - pad * 1.5; height = areaH - pad * 2; }
  else if (side === 'right') { posLeft = left + areaW - half + pad / 2; width = half - pad * 1.5; height = areaH - pad * 2; }
  else { posLeft = left + pad; width = areaW - pad * 2; height = areaH - pad * 2; }
  return {
    position: 'fixed', top: pad, left: Math.round(posLeft), width: Math.round(width), height: Math.round(height),
    borderRadius: 12, background: 'rgba(34,211,238,0.14)', border: '1.5px solid rgba(34,211,238,0.55)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)', pointerEvents: 'none', zIndex: 99990, transition: 'all 120ms ease-out',
  };
}

/* ================================================================
 *  Lock-screen PIN — salted xxh3 hash via Rust, stored in localStorage.
 * ================================================================ */

const PIN_STORAGE_KEY = 'lithium:lock-pin-hash';
const PIN_SALT = 'lithium-desktop:lock-pin:v1';
const FAILED_KEY = 'lithium:lock-fail-state';

async function pinHash(pin) {
  const payload = new TextEncoder().encode(`${PIN_SALT}|${pin}`);
  return wasmHash(payload);
}

export function hasPin() {
  return Boolean(storage.get(PIN_STORAGE_KEY, null));
}

export function getLockFailState() {
  return storage.get(FAILED_KEY, { count: 0, lockedUntil: 0 });
}

function setLockFailState(state) {
  storage.set(FAILED_KEY, state);
}

/** Set or replace the PIN. Returns true on success. */
export async function setPin(pin) {
  if (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)) return false;
  const hash = await pinHash(pin);
  if (!hash) return false;
  storage.set(PIN_STORAGE_KEY, { hash, setAt: Date.now() });
  return true;
}

export function clearPin() {
  storage.remove(PIN_STORAGE_KEY);
  storage.remove(FAILED_KEY);
}

/** Verify a PIN. Returns { ok, reason?, retryIn? }. */
export async function verifyPin(pin) {
  const stored = storage.get(PIN_STORAGE_KEY, null);
  if (!stored?.hash) return { ok: false, reason: 'wrong' };

  const failState = getLockFailState();
  const now = Date.now();

  if ((failState.lockedUntil || 0) > now) {
    return { ok: false, reason: 'locked', retryIn: Math.ceil(((failState.lockedUntil || 0) - now) / 1000) };
  }
  if (typeof pin !== 'string' || pin.length < 4 || pin.length > 12 || !/^\d+$/.test(pin)) {
    return { ok: false, reason: 'invalid' };
  }
  const hash = await pinHash(pin);
  if (hash === stored.hash) {
    setLockFailState({ count: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const newCount = (failState.count || 0) + 1;
  const lockFor = newCount >= 5 ? 30000 : 0;
  const lockedUntil = lockFor > 0 ? now + lockFor : 0;
  setLockFailState({ count: newCount, lockedUntil });
  return { ok: false, reason: 'wrong', retryIn: lockFor > 0 ? Math.ceil(lockFor / 1000) : 0 };
}
