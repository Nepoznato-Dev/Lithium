import { useState, useEffect } from 'react';
import Icon from '../../Icon';
import {
  clearHistory,
  dismissNotification,
  markAllRead,
  markRead,
  subscribeToHistory,
} from '../../../lib/desktop/notify';
import { relativeTime, TONE_COLORS } from './wallpapers';

/** Notification center popup. Owns its own subscription so the desktop tree
 *  doesn't re-render when the history changes. */
export default function NotificationCenter({ onCtxMenu }) {
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem('lithium:notifications');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => subscribeToHistory(setHistory), []);
  const unread = history.filter(entry => !entry.read).length;
  return (
    <div className="nx-popup nx-notif-center" onClick={event => event.stopPropagation()}>
      <div className="nx-notif-header">
        <div className="nx-notif-header-left">
          <Icon name="Bell" size={14} />
          Notifications
          {unread > 0 && <span className="nx-notif-badge">{unread}</span>}
        </div>
        <div className="nx-notif-header-actions">
          <button className="nx-footer-icon" style={{ width: 24, height: 24 }} disabled={unread === 0} onClick={markAllRead} title="Mark all as read">
            <Icon name="RotateCw" size={12} />
          </button>
          <button className="nx-footer-icon" style={{ width: 24, height: 24 }} disabled={history.length === 0} onClick={clearHistory} title="Clear all">
            <Icon name="SquareX" size={12} />
          </button>
        </div>
      </div>
      <div className="nx-notif-list">
        {history.length === 0 ? (
          <div className="nx-notif-empty">You&apos;re all caught up.</div>
        ) : history.map(entry => (
          <div
            key={entry.id}
            className={`nx-notif-item${entry.read ? '' : ' unread'}`}
            onClick={() => { if (!entry.read) markRead(entry.id); }}
            onContextMenu={event => { event.stopPropagation(); onCtxMenu?.(event, [
              { id: 'title', type: 'heading', label: entry.title },
              { id: 'read', label: entry.read ? 'Mark as unread' : 'Mark as read', icon: entry.read ? 'EyeOff' : 'Eye', action: () => { if (!entry.read) markRead(entry.id); } },
              { id: 'copy', label: 'Copy notification text', icon: 'Copy', action: () => navigator.clipboard?.writeText(`${entry.title}\n${entry.body || ''}`) },
              { id: 'dismiss', label: 'Dismiss', icon: 'SquareX', action: () => dismissNotification(entry.id) },
              { id: 'dismiss-all', label: 'Dismiss all', icon: 'Trash2', danger: true, action: clearHistory },
            ]); }}
          >
            <span aria-hidden className="nx-notif-dot" style={{ background: entry.read ? 'transparent' : (TONE_COLORS[entry.tone] || TONE_COLORS.info) }} />
            <div className="nx-notif-content">
              <div className="nx-notif-title-row">
                <span className="nx-notif-title" style={{ fontWeight: entry.read ? 400 : 600 }}>{entry.title}</span>
                <span className="nx-notif-time">{relativeTime(entry.ts)}</span>
              </div>
              {entry.body && <div className="nx-notif-body">{entry.body}</div>}
            </div>
            <button
              className="nx-footer-icon"
              style={{ width: 18, height: 18, alignSelf: 'center' }}
              onClick={event => { event.stopPropagation(); dismissNotification(entry.id); }}
              title="Dismiss"
            >
              <Icon name="SquareX" size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
