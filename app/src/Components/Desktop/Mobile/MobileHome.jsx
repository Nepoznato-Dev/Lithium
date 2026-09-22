import React, { useCallback, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon';
import { AppIcon } from '../DesktopApps';

const PER_PAGE = 20; // 4 columns × 5 rows

function chunk(list, size) {
  const pages = [];
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size));
  return pages.length ? pages : [[]];
}

/**
 * One tappable app tile with a running-app indicator dot. Shared with the macOS
 * Dock (`compact` drops the label, which the Dock shows as a magnified glyph).
 */
export function AppTile({ app, running, onLaunch, compact = false }) {
  return (
    <button
      type="button"
      className={`mx-app${compact ? ' compact' : ''}`}
      onClick={() => onLaunch(app)}
      onContextMenu={event => event.preventDefault()}
    >
      <span className="mx-app-icon">
        <AppIcon icon={app.icon} iconFile={app.iconFile} color={app.color} size={30} box={60} />
      </span>
      <span className="mx-app-label">{app.name}</span>
      <span className="mx-app-dot-slot">{running && <span className="mx-app-running" />}</span>
    </button>
  );
}

/** iOS springboard: pinnable app grid, page dots and a bottom dock. */
export default function MobileHome({ visible, apps, pinned, runningIds, onLaunch, onOpenSearch, hideDock = false }) {
  const pages = useMemo(() => chunk(apps, PER_PAGE), [apps]);
  const [page, setPage] = useState(0);
  const trackRef = useRef(null);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    setPage(Math.max(0, Math.min(pages.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  }, [pages.length]);

  const dockApps = (pinned && pinned.length ? pinned : apps).slice(0, 4);

  return (
    <div className="mx-home" hidden={!visible}>
      <button type="button" className="mx-search" onClick={onOpenSearch}>
        <Icon name="Search" size={15} />
        Search
      </button>

      <div className="mx-pages" ref={trackRef} onScroll={onScroll}>
        {pages.map((items, index) => (
          <div className="mx-page" key={index}>
            {items.map(app => (
              <AppTile key={app.id} app={app} running={runningIds.has(app.id)} onLaunch={onLaunch} />
            ))}
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="mx-dots">
          {pages.map((_, index) => (
            <span key={index} className={`mx-dot${index === page ? ' active' : ''}`} />
          ))}
        </div>
      )}

      {/* In the macOS layout the shell owns an always-visible Dock instead. */}
      {!hideDock && (
        <div className="mx-dock">
          {dockApps.map(app => (
            <AppTile key={`dock-${app.id}`} app={app} running={runningIds.has(app.id)} onLaunch={onLaunch} />
          ))}
        </div>
      )}
    </div>
  );
}
