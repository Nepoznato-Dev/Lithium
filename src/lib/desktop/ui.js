import { storage } from '../storage/localStorage';
import { wasmHash } from '../core';
import * as core from '../core';

/* ================================================================
 *  Window snapping — snap zones, bounds, and preview styles.
 * ================================================================ */

/** How close to a screen edge the pointer must be to trigger a snap zone. */
export const SNAP_EDGE = 14;

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

/** Which snap zone the pointer is in (if any): left half / right half / maximize. */
export function detectSnapZone(clientX, clientY) {
  return core.snapDetectZoneSync(clientX, clientY, window.innerWidth);
}

/** Window bounds for a snap side, or null for maximize (caller sets maximized: true). */
export function snapBounds(side) {
  return core.snapBoundsSync(side, storage.get('taskbar-prefs', { position: 'bottom' }).position, window.innerWidth, window.innerHeight);
}

/** Inline style for the translucent drop-preview rectangle of a snap zone. */
export function snapPreviewStyle(side) {
  return core.snapPreviewStyleSync(side, storage.get('taskbar-prefs', { position: 'bottom' }).position, window.innerWidth, window.innerHeight);
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

  const wasmResult = core.lockVerifySync(pin, failState.count || 0, failState.lockedUntil || 0, now);
  if (!wasmResult) return { ok: false, reason: 'wrong' };

  if (wasmResult.reason === 'locked') {
    return { ok: false, reason: 'locked', retryIn: wasmResult.retryIn };
  }
  if (wasmResult.reason === 'invalid') {
    return { ok: false, reason: 'wrong' };
  }
  const hash = await pinHash(pin);
  if (hash === stored.hash) {
    setLockFailState({ count: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const newFailState = core.lockRecordFailureSync(failState.count || 0, now);
  if (newFailState) {
    setLockFailState({ count: newFailState.failCount, lockedUntil: newFailState.lockedUntil });
    return { ok: false, reason: 'wrong', retryIn: newFailState.retryIn || 0 };
  }
  return { ok: false, reason: 'wrong' };
}
