import React from 'react';
import Icon from '../../Icon';
import DesktopWindow from '../DesktopWindow';
import ContextMenu from '../ContextMenu';
import CommandPalette from '../CommandPalette';
import TaskView from '../TaskView';
import { AppIcon } from '../DesktopApps';
import { notify } from '../../../lib/desktop/notify';
import { purgeTrash } from '../../../lib/fileSystem';
import { weatherEmoji, unitSymbol, weatherDescription } from '../../../lib/deviceContext';
import { SEARCH_ENGINES } from '../../../lib/settings';
import { CalendarPopup, PerfFooterButton, PerfPopup, StartButton, StatusTime, TaskbarClock, useSystemMetrics } from '../DesktopTickers';
import { WALLPAPERS } from './wallpapers';
import DesktopIcons from './DesktopIcons';
import NotificationCenter from './NotificationCenter';
import QuickActionsPanel from './QuickActionsPanel';
import WeatherFlyout from './WeatherFlyout';
import useDesktopState from './useDesktopState';

// useSystemMetrics is re-exported for backward compat.
export { useSystemMetrics } from '../DesktopTickers';

export default function DesktopView() {
  const s = useDesktopState();
  const {
    windows, apps, getApp, settings, openWindow, updateWindow, focusWindow, closeWindow, focusApp,
    online, netSpeed, battery, batteryTooltip, networkTooltip,
    weather, weatherOpen, setWeatherOpen, aiOutlook, locationInfo, newsItems, refreshWeather,
    altTab, altTabRef,
    desktopContextMenu, taskbarContextMenu, pinnedAppContextMenu, windowButtonContextMenu,
    startMenuOpen, setStartMenuOpen, searchQuery, setSearchQuery,
    powerMenuOpen, setPowerMenuOpen, volumePopupOpen, setVolumePopupOpen,
    quickSettingsOpen, setQuickSettingsOpen, prevVolumeRef,
    calendarOpen, setCalendarOpen, dynMenu, openDynMenu, closeDynMenu,
    taskbarSettingsOpen, setTaskbarSettingsOpen, taskbarPrefs, setTaskbarPrefs,
    perfOpen, setPerfOpen,
    fsTree, setFsTree, fsTrashedCount,
    shutdown, setShutdown, recentApps, customGroups, pinnedTaskbar,
    soundLevel, setSoundLevel, wallpaper, customWallpaper, avatar,
    toasts, appGridView, setAppGridView, appCategory, setAppCategory,
    hoveredApp, setHoveredApp, pinnedOrder, setPinnedOrder,
    appFreq, gridFocus, setGridFocus, previewApp, sortMode,
    dragPinned, setDragPinned, NEW_APP_IDS,
    notifHistory, notifCenterOpen, setNotifCenterOpen, notifUnread,
    taskViewOpen, setTaskViewOpen,
    launchApp, closeAllWindows, handlePower, togglePin, closePopups,
    openNoteResult, openFileResult,
    startApps, query, sortedStartApps, noteResults, fileResults,
    pinnedApps, pinnedAppsOrdered, filteredApps, getAppBadge,
    APP_CATEGORIES, visibleWindows, maxZ,
    volumeIconName, volumeColor, batteryColor,
    weatherEmoji, unitSymbol, weatherDescription,
  } = s;

  if (shutdown) {
    return (
      <div className="nx-shutdown" onClick={() => setShutdown(false)} title="Click to power on">
        It&apos;s now safe to turn off your computer.
      </div>
    );
  }
  return (
    <div
      className="nx-desktop"
      data-taskbar={taskbarPrefs.position}
      style={{
        ...(settings.background.enabled === false
          ? { backgroundColor: '#101014' }
          : wallpaper === 'custom' && customWallpaper
            ? { backgroundColor: '#0a0a0f', backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : WALLPAPERS[wallpaper]?.style || WALLPAPERS['nexus-default'].style),
        '--tb-left': taskbarPrefs.position === 'left' ? '58px' : '0px',
        '--tb-right': taskbarPrefs.position === 'right' ? '58px' : '0px',
        '--tb-bottom': taskbarPrefs.position === 'bottom' ? '48px' : '0px',
      }}
      onClick={closePopups}
      onContextMenu={desktopContextMenu}
    >
      {/* Wallpaper dimmer (Settings → Backgrounds → brightness) */}
      {settings.background.enabled !== false && settings.background.intensity < 1 && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${(1 - settings.background.intensity) * 0.75})`, pointerEvents: 'none' }} />
      )}
      {/* Desktop icons */}
      <DesktopIcons
        apps={apps.filter(app => app.desktopIcon !== false)}
        onLaunch={launchApp}
        onIconContextMenu={(event, app, resetPosition) => openDynMenu(event, [
          { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
          { id: 'sep-1', type: 'separator' },
          ...(app.id !== 'task-manager' && app.id !== 'settings' ? [
            { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from taskbar' : 'Pin to taskbar', icon: 'Pin', action: () => togglePin(app.id) },
          ] : []),
          { id: 'reset', label: 'Reset icon position', icon: 'SquareX', action: resetPosition },
        ])}
      />

      {/* Windows */}
      {windows.map(item => <DesktopWindow key={item.id} item={item} apps={apps} />)}

      {/* Alt+Tab switcher */}
      {altTab && visibleWindows.length > 0 && (
        <div className="nx-alttab-backdrop">
          <div className="nx-alttab-panel">
            <div className="nx-alttab-hint">Alt + Tab to switch windows</div>
            <div className="nx-alttab-grid">
              {visibleWindows.map((item, index) => (
                <div key={item.id} className={`nx-alttab-item ${index === altTab.index % visibleWindows.length ? 'active' : ''}`}>
                  <div className="nx-alttab-icon">{item.icon}</div>
                  <div className="nx-alttab-title" style={{ fontWeight: index === altTab.index % visibleWindows.length ? 600 : 400 }}>
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Task view overlay */}
      {taskViewOpen && (
        <TaskView
          windows={windows}
          onSelect={id => { updateWindow(id, { minimized: false }); focusWindow(id); setTaskViewOpen(false); }}
          onCloseWindow={id => closeWindow(id)}
          onCloseAll={() => { closeAllWindows(); setTaskViewOpen(false); }}
          onClose={() => setTaskViewOpen(false)}
        />
      )}

      {/* Command palette (Ctrl/Cmd+K) */}
      <CommandPalette
        apps={apps}
        onLaunch={launchApp}
        onLock={() => window.dispatchEvent(new CustomEvent('lithium:lock-screen'))}
        onEmptyTrash={async () => {
          if (fsTrashedCount === 0) { notify({ title: 'Recycle Bin is already empty', tone: 'info' }); return; }
          if (!window.confirm(`Permanently delete ${fsTrashedCount} item${fsTrashedCount === 1 ? '' : 's'} from the Recycle Bin? This cannot be undone.`)) return;
          try { setFsTree(await purgeTrash(fsTree)); } catch (err) { notify({ title: 'Could not empty Recycle Bin', body: err.message, tone: 'error' }); }
        }}
        onOpenSettings={() => launchApp('settings')}
        onOpenNotifications={() => { setNotifCenterOpen(true); }}
        onShowDesktop={() => windows.forEach(item => updateWindow(item.id, { minimized: true }))}
        onTaskView={() => setTaskViewOpen(true)}
      />

      {/* Desktop notifications */}
      <div className="nx-toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className="nx-popup nx-toast">
            <div className="nx-toast-title" style={{ marginBottom: toast.body ? 4 : 0 }}>{toast.title}</div>
            {toast.body && <div className="nx-toast-body">{toast.body}</div>}
          </div>
        ))}
      </div>

      {/* Taskbar */}
      <div className="nx-taskbar" data-pos={taskbarPrefs.position} data-mode={taskbarPrefs.buttons} onClick={event => event.stopPropagation()} onContextMenu={taskbarContextMenu}>
        <div className="nx-taskbar-group">
          {/* Start button with system stats indicator */}
          <StartButton
            open={startMenuOpen}
            onClick={() => { setStartMenuOpen(value => !value); setPowerMenuOpen(false); }}
          />

          {/* Task view — bird's-eye of all open windows */}
          <button
            className={`nx-pinned-btn ${taskViewOpen ? 'open' : ''}`}
            title="Task view — see all open windows"
            style={{ opacity: windows.length ? 1 : 0.5 }}
            onClick={() => setTaskViewOpen(value => !value)}
          >
            <Icon name="LayoutGrid" size={18} />
          </button>

          {pinnedApps.length > 0 && windows.length > 0 && <div className="nx-taskbar-sep" />}

          {/* Pinned apps */}
          {pinnedApps.map(app => {
            return (
              <button key={app.id} className="nx-pinned-btn" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onContextMenu={event => pinnedAppContextMenu(event, app)} title={`${app.name} (Shift+Click opens a new window, right-click for options)`}>
                {taskbarPrefs.buttons !== 'labels' && <Icon name={app.icon} size={18} />}
                {taskbarPrefs.buttons !== 'icons' && <span className="nx-task-label">{app.name}</span>}
              </button>
            );
          })}

          {/* Open windows */}
          {windows.map(item => {
            const isTop = !item.minimized && item.zIndex === maxZ;
            return (
              <button
                key={item.id}
                className={`nx-task-window ${item.minimized ? 'minimized' : ''}`}
                data-accent={isTop ? '' : undefined}
                style={isTop ? { '--task-accent': settings.theme.accent } : undefined}
                onClick={() => {
                  if (item.minimized) updateWindow(item.id, { minimized: false });
                  else if (!isTop) focusWindow(item.id);
                  else updateWindow(item.id, { minimized: true });
                }}
                onContextMenu={event => windowButtonContextMenu(event, item)}
              >
                {taskbarPrefs.buttons !== 'labels' && item.icon}
                {taskbarPrefs.buttons !== 'icons' && <span>{item.title}</span>}
              </button>
            );
          })}
        </div>

        <div className="nx-taskbar-right">
          {/* Weather widget (Windows-style, right of the tray) */}
          <button
            className="nx-weather"
            title="Local weather"
            onClick={event => { event.stopPropagation(); setWeatherOpen(value => !value); }}
          >
            {weather?.data ? (
              <>
                <span className="nx-weather-emoji">{weatherEmoji(weather.data.current?.weather_code, weather.data.current?.is_day)}</span>
                <span className="nx-weather-text">
                  <span>{Math.round(weather.data.current.temperature_2m)}{unitSymbol(weather.unit)}</span>
                  <span className="nx-weather-cond">{weatherDescription(weather.data.current?.weather_code)}</span>
                </span>
              </>
            ) : (
              <span className="nx-weather-text">
                <span className="nx-weather-emoji">🌐</span>
                <span className="nx-weather-cond">Enable weather</span>
              </span>
            )}
          </button>

          {/* System tray — clicking any item opens Quick Settings */}
          <div className="nx-tray">
            <button className="nx-tray-item" title={networkTooltip} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); }}>
              {online ? <Icon name="Wifi" size={16} color="#10b981" strokeWidth={2} /> : <Icon name="WifiOff" size={16} color="#ef4444" strokeWidth={2} />}
            </button>

            <button className="nx-tray-item" title={`Volume: ${soundLevel}%`} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); }}>
              <Icon name={volumeIconName} size={16} strokeWidth={2} color={volumeColor} />
            </button>

            <button
              className={`nx-tray-item ${notifCenterOpen ? 'open' : ''}`}
              title={notifUnread > 0 ? `${notifUnread} unread notification${notifUnread === 1 ? '' : 's'}` : 'Notifications'}
              onClick={event => { event.stopPropagation(); setNotifCenterOpen(value => !value); setQuickSettingsOpen(false); }}
              style={{ position: 'relative' }}
            >
              <Icon name="Bell" size={15} strokeWidth={2} color={notifUnread > 0 ? '#22d3ee' : '#888'} />
              {notifUnread > 0 && (
                <span aria-label={`${notifUnread} unread`} className="nx-tray-badge">
                  {notifUnread > 9 ? '9+' : notifUnread}
                </span>
              )}
            </button>

            {/* Battery graphic — opens Quick Settings */}
            <button className="nx-tray-item" title={batteryTooltip} onClick={event => { event.stopPropagation(); setQuickSettingsOpen(v => !v); setVolumePopupOpen(false); setNotifCenterOpen(false); }}>
              <span className="nx-battery">
                <span className="nx-battery-shell" style={{ border: `1.5px solid ${batteryColor}` }}>
                  <span className="nx-battery-fill" style={{ width: battery ? `${battery.level}%` : '100%', backgroundColor: batteryColor }}>
                    {!battery && <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: 13, fontWeight: 'bold', transform: 'translateY(-1px)' }}>∞</span>}
                    {battery && battery.level > 20 && <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: 11, fontWeight: 'bold', transform: 'translateY(-1px)' }}>{battery.level}</span>}
                  </span>
                </span>
                <span className="nx-battery-tip" style={{ backgroundColor: batteryColor }} />
              </span>
            </button>
          </div>

          {/* Clock */}
          <TaskbarClock
            suppressTooltip={calendarOpen}
            onClick={event => { event.stopPropagation(); setCalendarOpen(value => !value); }}
          />
        </div>
      </div>

      {/* Taskbar settings panel */}
      {taskbarSettingsOpen && (
        <div className="nx-popup nx-taskbar-settings" onClick={event => event.stopPropagation()}>
          <div className="nx-settings-header">
            <div className="nx-settings-title">
              <Icon name="SlidersHorizontal" size={14} /> Taskbar settings
            </div>
            <button className="nx-footer-icon" style={{ width: 24, height: 24 }} onClick={() => setTaskbarSettingsOpen(false)} title="Close">×</button>
          </div>
          <div className="nx-settings-label">Pinned apps</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {apps.filter(app => app.id !== 'settings').map(app => {
              const pinned = pinnedTaskbar.includes(app.id);
              return (
                <button key={app.id} className="nx-menu-item" style={{ padding: '7px 10px', borderRadius: 6 }} onClick={() => togglePin(app.id)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon name={app.icon} size={15} color={app.color} />
                    <span style={{ fontSize: 12 }}>{app.name}</span>
                  </span>
                  <span style={{ color: pinned ? '#22d3ee' : 'rgba(255,255,255,0.25)', fontSize: 12 }}>{pinned ? '✓' : '—'}</span>
                </button>
              );
            })}
          </div>
          <div className="nx-menu-sep" style={{ margin: '10px 0' }} />
          <button
            className="nx-menu-item"
            style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}
            onClick={() => setPinnedTaskbar(['games', 'media-player', 'browser', 'calculator'])}
          >
            Restore default pins
          </button>
          <div className="nx-menu-sep" style={{ margin: '10px 0' }} />
          {[
            { key: 'buttons', label: 'Taskbar buttons', options: [['icons', 'Icons'], ['both', 'Icons + name'], ['labels', 'Name']] },
            { key: 'position', label: 'Taskbar position', options: [['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']] },
            { key: 'startAlign', label: 'Start menu opens', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
          ].map(group => (
            <div key={group.key} className="nx-settings-group">
              <div className="nx-settings-group-label">{group.label}</div>
              <div className="nx-settings-options">
                {group.options.map(([value, label]) => (
                  <button
                    key={value}
                    className="nx-menu-item"
                    style={{ flex: 1, justifyContent: 'center', padding: '6px 4px', borderRadius: 6, fontSize: 11, background: taskbarPrefs[group.key] === value ? 'rgba(255,255,255,0.14)' : 'transparent' }}
                    onClick={() => setTaskbarPrefs(prev => ({ ...prev, [group.key]: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weather flyout */}
      {weatherOpen && (
        <WeatherFlyout
          weather={weather}
          locationInfo={locationInfo}
          aiOutlook={aiOutlook}
          newsItems={newsItems}
          refreshWeather={refreshWeather}
          setWeatherOpen={setWeatherOpen}
          getApp={getApp}
          openWindow={openWindow}
          launchApp={launchApp}
          openDynMenu={openDynMenu}
        />
      )}

      {/* Slide-up performance popup */}
      {perfOpen && (
        <PerfPopup
          onClose={() => setPerfOpen(false)}
          onOpenTaskManager={() => { setPerfOpen(false); launchApp('task-manager'); }}
        />
      )}

      {/* Volume popup */}
      {volumePopupOpen && (
        <div className="nx-popup nx-volume-popup" onClick={event => event.stopPropagation()} onContextMenu={event => openDynMenu(event, [
          { id: 'mute', label: soundLevel === 0 ? 'Unmute' : 'Mute', icon: soundLevel === 0 ? 'Volume2' : 'VolumeX', action: () => setSoundLevel(soundLevel === 0 ? 50 : 0) },
          { id: 'settings', label: 'Open Settings', icon: 'Settings', action: () => { setVolumePopupOpen(false); launchApp('settings'); } },
        ])}>
          <div className="nx-volume-header">
            <Icon name={volumeIconName} size={18} color={volumeColor} />
            <span className="nx-volume-label">{soundLevel === 0 ? 'Muted' : `Volume ${soundLevel}%`}</span>
            <button className="nx-footer-icon" onClick={() => { if (soundLevel === 0) { setSoundLevel(prevVolumeRef.current || 50); } else { prevVolumeRef.current = soundLevel; setSoundLevel(0); } }} title={soundLevel === 0 ? 'Unmute' : 'Mute'} style={{ width: 24, height: 24 }}>
              <Icon name={soundLevel === 0 ? 'Volume2' : 'VolumeX'} size={14} />
            </button>
          </div>
          <input type="range" min="0" max="150" value={soundLevel} onChange={event => { const v = Number(event.target.value); setSoundLevel(v); if (v > 0) prevVolumeRef.current = v; }} className="nx-volume-slider" />
          <div className="nx-volume-range">
            <span>0%</span><span>150%</span>
          </div>
        </div>
      )}

      {/* Calendar popup */}
      {calendarOpen && <CalendarPopup />}

      {/* Notification center */}
      {notifCenterOpen && <NotificationCenter onCtxMenu={openDynMenu} />}

      {/* Quick settings panel */}
      {quickSettingsOpen && (
        <>
          <div className="nx-qs-backdrop" onClick={closePopups} />
          <QuickActionsPanel
            settings={settings}
            soundLevel={soundLevel}
            setSoundLevel={setSoundLevel}
            prevVolumeRef={prevVolumeRef}
            online={online}
            netSpeed={netSpeed}
            battery={battery}
            onClose={() => setQuickSettingsOpen(false)}
            onOpenSettings={() => launchApp('settings')}
          />
        </>
      )}

      {/* Start menu */}
      {startMenuOpen && (
        <>
          <div className="nx-start-backdrop" onClick={closePopups} />
          <div className={`nx-start-menu ${taskbarPrefs.position === 'bottom' ? `align-${taskbarPrefs.startAlign}` : ''}`} data-category={appCategory} onClick={event => event.stopPropagation()}>
            {/* Search */}
            <div style={{ padding: '24px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="nx-start-search-wrap">
                <Icon name="Search" size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                <input
                  className="nx-start-search"
                  type="text"
                  placeholder="Search apps or web\u2026"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      if (filteredApps.length > 0) {
                        launchApp(filteredApps[0]);
                      } else if (query) {
                        // No app matches \u2014 search the web instead
                        const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
                        const target = getApp('browser');
                        if (target) {
                          openWindow({ id: target.id, title: target.name, icon: <Icon name={target.icon} size={16} />, component: <Browser initialUrl={`${searchUrl}${encodeURIComponent(searchQuery)}`} /> , replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
                          setStartMenuOpen(false);
                          setSearchQuery('');
                        }
                      }
                    }
                  }}
                  autoFocus
                />
              </div>

              {/* Pinned apps grid */}
              {!query && (
                <div className="nx-pinned-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div className="nx-start-heading" style={{ margin: 0 }}>Pinned</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="nx-grid-toggle" onClick={() => setSortMode(m => m === 'alpha' ? 'freq' : 'alpha')} title={sortMode === 'alpha' ? 'Sort: A-Z' : 'Sort: Most used'}>
                        <Icon name={sortMode === 'alpha' ? 'ArrowDownAZ' : 'Flame'} size={12} />
                      </button>
                      <button className="nx-grid-toggle" onClick={() => setAppGridView(v => v === 'grid' ? 'list' : 'grid')} title={appGridView === 'grid' ? 'Switch to list view' : 'Switch to grid view'}>
                        <Icon name={appGridView === 'grid' ? 'List' : 'LayoutGrid'} size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="nx-pinned-grid">
                    {pinnedAppsOrdered.slice(0, 8).map((app, i) => (
                      <button
                        key={app.id}
                        className={`nx-pinned-tile${dragPinned === app.id ? ' dragging' : ''}${NEW_APP_IDS.has(app.id) ? ' is-new' : ''}`}
                        style={{ animationDelay: `${i * 30}ms` }}
                        onClick={event => launchApp(app, { newWindow: event.shiftKey })}
                        onMouseEnter={() => setHoveredApp(app)}
                        onMouseLeave={() => setHoveredApp(null)}
                        draggable
                        onDragStart={() => setDragPinned(app.id)}
                        onDragOver={event => event.preventDefault()}
                        onDrop={() => {
                          if (dragPinned && dragPinned !== app.id) {
                            const order = pinnedAppsOrdered.map(a => a.id);
                            const from = order.indexOf(dragPinned);
                            const to = order.indexOf(app.id);
                            order.splice(from, 1);
                            order.splice(to, 0, dragPinned);
                            setPinnedOrder(order);
                          }
                          setDragPinned(null);
                        }}
                        onDragEnd={() => setDragPinned(null)}
                        onContextMenu={event => {
                          event.stopPropagation();
                          event.preventDefault();
                          openDynMenu(event, [
                            { id: 'unpin', label: 'Unpin from Start', icon: 'Pin', action: () => togglePin(app.id) },
                          ]);
                        }}
                      >
                        {getAppBadge(app.id) != null && <span className="nx-app-badge">{getAppBadge(app.id)}</span>}
                        {NEW_APP_IDS.has(app.id) && <span className="nx-new-dot" />}
                        <AppIcon icon={app.icon} color={app.color} size={20} />
                        <span className="nx-pinned-tile-label">{app.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category tabs */}
              {!query && (
                <div className="nx-category-tabs">
                  {APP_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      className={`nx-category-tab${appCategory === cat.id ? ' active' : ''}`}
                      onClick={() => setAppCategory(cat.id)}
                    >
                      <Icon name={cat.icon} size={11} />
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Body: Apps grid/list | Recent + Groups */}
              <div className="nx-start-body">
                <div className="nx-start-col">
                  {query ? (
                    <>
                      <div className="nx-start-heading" style={{ marginTop: 6 }}>Results</div>
                      {filteredApps.map(app => (
                        <button key={app.id} className="nx-app-row" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)} onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openDynMenu(event, [
                          { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
                          { id: 'new-window', label: 'Open in new window', icon: 'ExternalLink', action: () => launchApp(app, { newWindow: true }) },
                          { id: 'sep', type: 'separator' },
                          { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from Start' : 'Pin to Start', icon: 'Pin', action: () => togglePin(app.id) },
                        ]); }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                            <Icon name={app.icon} size={18} color={app.color} />
                          </span>
                          <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                        </button>
                      ))}
                    </>
                  ) : appGridView === 'grid' ? (
                    <div className="nx-all-apps-grid">
                      {filteredApps.map((app, i) => (
                        <button
                          key={app.id}
                          className={`nx-app-grid-tile${gridFocus === i ? ' focused' : ''}${NEW_APP_IDS.has(app.id) ? ' is-new' : ''}`}
                          style={{ animationDelay: `${i * 25}ms` }}
                          onClick={event => launchApp(app, { newWindow: event.shiftKey })}
                          onMouseEnter={() => setHoveredApp(app)}
                          onMouseLeave={() => setHoveredApp(null)}
                          onContextMenu={event => {
                            event.stopPropagation();
                            event.preventDefault();
                            openDynMenu(event, [
                              { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from Start' : 'Pin to Start', icon: 'Pin', action: () => togglePin(app.id) },
                            ]);
                          }}
                        >
                          {getAppBadge(app.id) != null && <span className="nx-app-badge">{getAppBadge(app.id)}</span>}
                          {NEW_APP_IDS.has(app.id) && <span className="nx-new-dot" />}
                          <AppIcon icon={app.icon} color={app.color} size={20} />
                          <span className="nx-app-grid-name">{app.name}</span>
                        </button>
                      ))}
                      {filteredApps.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', padding: 20 }}>No apps in this category.</div>
                      )}
                    </div>
                  ) : (
                    <>
                      {filteredApps.map(app => (
                        <button key={app.id} className="nx-app-row" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)} onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openDynMenu(event, [
                          { id: 'open', label: `Open ${app.name}`, icon: app.icon, action: () => launchApp(app) },
                          { id: 'new-window', label: 'Open in new window', icon: 'ExternalLink', action: () => launchApp(app, { newWindow: true }) },
                          { id: 'sep', type: 'separator' },
                          { id: 'pin', label: pinnedTaskbar.includes(app.id) ? 'Unpin from Start' : 'Pin to Start', icon: 'Pin', action: () => togglePin(app.id) },
                        ]); }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                            <Icon name={app.icon} size={18} color={app.color} />
                          </span>
                          <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.desc}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {/* App preview card */}
                  {previewApp && !query && (
                    <div className="nx-app-preview-card">
                      <AppIcon icon={previewApp.icon} color={previewApp.color} size={24} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{previewApp.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{previewApp.desc}</div>
                      </div>
                      <button className="nx-grid-toggle" onClick={() => launchApp(previewApp)} title="Open">
                        <Icon name="ArrowRight" size={12} />
                      </button>
                    </div>
                  )}
                  {filteredApps.length === 0 && noteResults.length === 0 && fileResults.length === 0 && query && (
                    <>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>No app results for &ldquo;{searchQuery}&rdquo;</div>
                      <button className="nx-app-row" style={{ marginTop: 8 }} onClick={() => {
                        const searchUrl = SEARCH_ENGINES[settings.browser?.searchEngine]?.url || SEARCH_ENGINES.duckduckgo.url;
                        const target = getApp('browser');
                        if (target) {
                          openWindow({ id: target.id, title: target.name, icon: <Icon name={target.icon} size={16} />, component: <Browser initialUrl={`${searchUrl}${encodeURIComponent(searchQuery)}`} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
                          setStartMenuOpen(false);
                          setSearchQuery('');
                        }
                      }}>
                        <Icon name="Globe" size={16} color="#06b6d4" />
                        <span style={{ flex: 1, fontWeight: 400 }}>Search the web</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Enter \u21B5</span>
                      </button>
                    </>
                  )}
                  {noteResults.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 6 }}>Notes</div>
                      {noteResults.map(entry => (
                        <button key={entry.id} className="nx-app-row" onClick={() => openNoteResult(entry.id)}>
                          <Icon name="FileText" size={16} color="#a78bfa" />
                          <span style={{ flex: 1, fontWeight: 400 }}>{entry.name.replace(/\.(md|txt)$/i, '')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {fileResults.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 6 }}>Files</div>
                      {fileResults.map(entry => (
                        <button key={entry.id} className="nx-app-row" onClick={() => openFileResult(entry.id)}>
                          <Icon name="Image" size={16} color="#f472b6" />
                          <span style={{ flex: 1, fontWeight: 400 }}>{entry.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="nx-start-col right">
                  {/* Recently updated */}
                  <div>
                    <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 10 }}>What&apos;s new</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[{ id: 'code-studio', note: 'Code Studio now supports multi-file projects' }, { id: 'notepad', note: 'Notes got Obsidian-style wiki links' }, { id: 'games', note: 'Hydrux has 4 new HTML games' }].map(item => {
                        const app = getApp(item.id);
                        if (!app) return null;
                        return (
                          <button key={item.id} className="nx-app-row small" onClick={() => launchApp(app)} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                            <Icon name={app.icon} size={14} color={app.color} />
                            <span style={{ flex: 1, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.7)' }}>{item.note}</span>
                            <span className="nx-new-dot" style={{ position: 'static', width: 6, height: 6 }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recent */}
                  <div>
                    <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 10 }}>Recent</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {recentApps.map(getApp).filter(Boolean).map(app => {
                        return (
                          <button key={app.id} className="nx-app-row small" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                            <Icon name={app.icon} size={18} color={app.color} />
                            <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                          </button>
                        );
                      })}
                      {recentApps.length === 0 && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Launch an app and it will show up here.</div>}
                    </div>
                  </div>

                  {/* Custom groups */}
                  {customGroups.map((group, groupIndex) => (
                    <div key={group.name}>
                      <div className="nx-start-heading" style={{ fontSize: 10, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {group.name}
                        <button
                          onClick={() => setCustomGroups(prev => prev.filter((_, i) => i !== groupIndex))}
                          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 10, padding: 2 }}
                          title="Delete group"
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {group.items.map(getApp).filter(Boolean).map(app => {
                          const Icon = app.icon;
                          return (
                            <button key={app.id} className="nx-app-row small" onClick={event => launchApp(app, { newWindow: event.shiftKey })} onMouseEnter={() => setHoveredApp(app)} onMouseLeave={() => setHoveredApp(null)}>
                              <Icon size={18} color={app.color} />
                              <span style={{ flex: 1, fontWeight: 400 }}>{app.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <button
                    className="nx-new-group"
                    onClick={() => {
                      const groupName = window.prompt('Group name:');
                      if (groupName?.trim()) setCustomGroups(prev => [...prev, { name: groupName.trim(), items: [] }]);
                    }}
                  >
                    + New Group
                  </button>
                </div>
              </div>

              {/* Status bar */}
              <div className="nx-start-statusbar">
                <PerfFooterButton onClick={() => { setStartMenuOpen(false); setPerfOpen(value => !value); }} />
                {hoveredApp?.desc && <span className="nx-start-app-desc">✨ {hoveredApp.desc}</span>}
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <Icon name="Clock" size={14} />
                    <StatusTime />
                  </div>
                  {battery && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: battery.level < 20 ? '#ff6b6b' : '#fff' }}>
                      {battery.charging ? <Icon name="BatteryCharging" size={14} /> : <Icon name="Battery" size={14} />}
                      <span>{battery.level}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: profile, settings, power */}
              <div className="nx-start-footer">
                <button className="nx-profile-btn" onClick={() => launchApp('settings')} title="Open Settings to edit your profile">
                  {avatar ? (
                    <img src={avatar} alt="" className="nx-profile-avatar" style={{ objectFit: 'cover', background: 'transparent', fontSize: 0 }} />
                  ) : (
                    <span className="nx-profile-avatar">{settings.profile.username.charAt(0).toUpperCase() || 'U'}</span>
                  )}
                  <span style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{settings.profile.username}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>Local user</span>
                  </span>
                </button>
                <button className="nx-footer-icon" onClick={() => launchApp('settings')} title="Settings">
                  <Icon name="Settings" size={18} />
                </button>
                <button className="nx-footer-icon danger" onClick={event => { event.stopPropagation(); setPowerMenuOpen(value => !value); }} title="Power menu">
                  <Icon name="Power" size={18} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Power menu */}
      {powerMenuOpen && (
        <div className="nx-popup" style={{ bottom: 72, right: 20, minWidth: 200, overflow: 'hidden' }} onClick={event => event.stopPropagation()}>
          <button className="nx-menu-item" onClick={() => window.dispatchEvent(new CustomEvent('lithium:lock-screen'))}>
            <span className="flex items-center gap-2"><Icon name="Lock" size={14} /> Lock</span>
          </button>
          <button className="nx-menu-item" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} onClick={() => handlePower('logout')}>
            <span className="flex items-center gap-2"><Icon name="LogOut" size={14} /> Log out</span>
          </button>
          <button className="nx-menu-item" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} onClick={() => handlePower('shutdown')}>
            <span className="flex items-center gap-2"><Icon name="Power" size={14} /> Shutdown</span>
          </button>
          <button className="nx-menu-item" onClick={() => handlePower('restart')}>
            <span className="flex items-center gap-2"><Icon name="Activity" size={14} /> Restart</span>
          </button>
        </div>
      )}

      {/* Context menus (desktop, taskbar, windows, pinned apps) */}
      {dynMenu && <ContextMenu menu={dynMenu} onClose={closeDynMenu} />}
    </div>
  );
}
