import React from 'react';
import Icon from '../../Icon';
import { AppIcon } from '../DesktopApps';

/**
 * iOS app-switcher: a horizontal strip of cards for the running windows.
 * Tapping a card brings it to the foreground; the close button force-quits it.
 * The same grid doubles as macOS Mission Control (`mac`), so the wording follows
 * the pointing device.
 */
export default function MobileAppSwitcher({ windows, getApp, onOpen, onClose, onDismiss, mac = false }) {
  const cards = windows.filter(win => win.tabs && win.tabs.length);

  return (
    <div className="mx-switcher" onClick={onDismiss}>
      {cards.length === 0 ? (
        <div className="mx-switcher-hint">No open apps</div>
      ) : (
        <div className="mx-switcher-track" onClick={event => event.stopPropagation()}>
          {cards.map(win => {
            const tab = win.tabs.find(t => t.key === win.activeTab) || win.tabs[0];
            const app = (getApp && getApp(tab.appId)) || {};
            const accent = app.color || '#22d3ee';
            return (
              <div
                key={win.id}
                className="mx-card"
                onClick={() => onOpen(win.id)}
                style={{ background: `linear-gradient(160deg, ${accent}22, var(--ui-card, rgba(30,33,40,0.9)))` }}
              >
                <button
                  type="button"
                  className="mx-card-close"
                  title="Close app"
                  aria-label="Close app"
                  onClick={event => { event.stopPropagation(); onClose(win.id); }}
                >
                  <Icon name="X" size={14} />
                </button>
                {app.icon
                  ? <AppIcon icon={app.icon} iconFile={app.iconFile} color={accent} size={40} box={72} />
                  : tab.icon}
                <span className="mx-card-title">{win.title || tab.title}</span>
              </div>
            );
          })}
        </div>
      )}
      {cards.length > 0 && (
        <div className="mx-switcher-hint">
          {mac ? 'Click a window to bring it forward' : 'Tap an app to reopen'} · × to close
        </div>
      )}
    </div>
  );
}
