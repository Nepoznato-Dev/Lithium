import React from 'react';
import Icon from '../../Icon';
import { AppTile } from './MobileHome';

/**
 * The macOS Dock — always visible while the touch shell runs on a desktop-sized
 * screen, because it is how you restore a minimized window or reach an app that
 * is already running. Mirrors macOS with a separator and two system buttons:
 * Launchpad (the springboard grid) and Mission Control (the app switcher).
 */
export default function MobileDock({
  apps, runningIds, onLaunch, onLaunchpad, launchpadOpen, onOverview, hasWindows,
}) {
  return (
    <div className="mx-macdock">
      <div className="mx-macdock-inner">
        {apps.map(app => (
          <AppTile
            key={`macdock-${app.id}`}
            app={app}
            compact
            running={runningIds.has(app.id)}
            onLaunch={onLaunch}
          />
        ))}

        <span className="mx-macdock-sep" aria-hidden />

        <button
          type="button"
          className={`mx-macdock-btn${launchpadOpen ? ' active' : ''}`}
          onClick={onLaunchpad}
          aria-label="Launchpad"
          title="Launchpad"
        >
          <Icon name="LayoutGrid" size={17} />
        </button>
        <button
          type="button"
          className="mx-macdock-btn"
          onClick={onOverview}
          disabled={!hasWindows}
          aria-label="Mission Control"
          title="Mission Control"
        >
          <Icon name="AppWindow" size={17} />
        </button>
      </div>
    </div>
  );
}
