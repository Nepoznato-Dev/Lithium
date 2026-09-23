/**
 * Badging API — shows unread notification count on the PWA app icon.
 *
 * Supported in Chromium-based browsers when installed as a PWA.
 * Falls back silently on unsupported platforms.
 */

import { useState, useEffect } from 'react';

let _count = 0;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(_count);
}

/** True when the Badging API is available. */
export function isSupported() {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

/** Set the badge count. Pass 0 or omit to clear. */
export function setBadge(count = 0) {
  _count = Math.max(0, count);
  if (isSupported()) {
    if (_count > 0) {
      navigator.setAppBadge(_count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }
  notify();
}

/** Increment the badge by 1 and return the new count. */
export function incrementBadge() {
  _count += 1;
  if (isSupported()) {
    navigator.setAppBadge(_count).catch(() => {});
  }
  notify();
  return _count;
}

/** Clear the badge entirely. */
export function clearBadge() {
  _count = 0;
  if (isSupported()) {
    navigator.clearAppBadge().catch(() => {});
  }
  notify();
}

/** Get the current badge count without changing it. */
export function getBadgeCount() {
  return _count;
}

/** React/Preact hook — returns the current badge count. */
export function useBadge() {
  const [count, setCount] = useState(_count);
  useEffect(() => {
    listeners.add(setCount);
    setCount(_count);
    return () => { listeners.delete(setCount); };
  }, []);
  return count;
}
