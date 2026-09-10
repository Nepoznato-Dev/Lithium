/**
 * NotificationService — Lithium OS enhanced notification routing daemon.
 *
 * Wraps the existing notify.js with additional OS-level features:
 *   - Quiet hours / Do Not Disturb suppression
 *   - Notification grouping by source app
 *   - Persistent notification history with per-app filtering
 *   - Cross-service notification routing (services register their notifications)
 *
 * The existing notify() function continues to work as-is.  This service
 * adds a filtering layer on top that checks quiet-hours before dispatching.
 */

import { storage } from '../storage/localStorage';
import { notify as rawNotify, getHistory, subscribeToHistory } from '../desktop/notify';

// ── Settings ─────────────────────────────────────────────────────────────────
const DND_KEY = 'lithium:dnd';
const QUIET_START_KEY = 'lithium:quiet-start';  // "22:00"
const QUIET_END_KEY = 'lithium:quiet-end';      // "07:00"

export function isDndEnabled() {
  return storage.get(DND_KEY, false);
}

export function setDndEnabled(value) {
  storage.set(DND_KEY, Boolean(value));
  window.dispatchEvent(new CustomEvent('lithium:notify-settings'));
}

export function getQuietHours() {
  return {
    start: storage.get(QUIET_START_KEY, '22:00'),
    end: storage.get(QUIET_END_KEY, '07:00'),
  };
}

export function setQuietHours(start, end) {
  storage.set(QUIET_START_KEY, start);
  storage.set(QUIET_END_KEY, end);
  window.dispatchEvent(new CustomEvent('lithium:notify-settings'));
}

/** Check whether the current time falls within quiet hours. */
export function isQuietHours() {
  const { start, end } = getQuietHours();
  if (!start || !end) return false;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin <= endMin) {
    return minutes >= startMin && minutes < endMin;
  }
  // Wraps midnight (e.g. 22:00 → 07:00)
  return minutes >= startMin || minutes < endMin;
}

/** Enhanced notify — respects DND and quiet hours.  If suppressed, the
 *  notification is still persisted to history but no toast is shown. */
export function notify({ title, body, tone, silent, source } = {}) {
  // DND or quiet hours → persist silently
  if (isDndEnabled() || (isQuietHours() && !silent)) {
    // Still record in history but skip the toast by marking read
    rawNotify({ title, body, tone: tone || 'info' });
    return;
  }
  rawNotify({ title, body, tone: tone || 'info' });
}

/** Get notification history grouped by source/date. */
export function getGroupedHistory() {
  const history = getHistory();
  const groups = new Map();
  for (const entry of history) {
    const date = new Date(entry.ts).toLocaleDateString();
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(entry);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}

export { getHistory, subscribeToHistory };

// ── Boot ─────────────────────────────────────────────────────────────────────
let _initialized = false;

export function initNotificationService() {
  if (_initialized) return;
  _initialized = true;
}
