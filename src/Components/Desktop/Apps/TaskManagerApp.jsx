import React from 'react';

import { useDesktopWindows } from '../DesktopWindowManager';
import { useSystemMetrics } from '../DesktopView';
import WinControls from '../WinControls';
import Icon from '../../Icon';
import ContextMenu, { useContextMenu } from '../ContextMenu';

const barColor = value => (value >= 80 ? '#ef4444' : value >= 60 ? '#f59e0b' : '#10b981');

/** Deterministic pseudo-load per window so the table stays stable between ticks. */
function windowLoad(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  return { cpu: 1 + (hash % 14), ram: 42 + (hash % 180) };
}

function StatBar({ label, value }) {
  const color = barColor(value);
  return (
    <div className="tm-stat-row">
      <span className="tm-stat-label">{label}</span>
      <div className="tm-stat-track">
        <div
          className="tm-stat-fill"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
          }}
        />
      </div>
      <span className="tm-stat-value">{value}%</span>
    </div>
  );
}

/** Task Manager — lists every open window with system load and End task.
 *  Connects to the lithium-perfmon extension for real CPU/RAM/GPU readings. */
export default function TaskManagerApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const { windows, closeWindow, focusWindow, updateWindow } = useDesktopWindows();
  const metrics = useSystemMetrics();
  const [menu, openMenu, closeMenu] = useContextMenu();
  const shellMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;

  const totalCpu = metrics.cpu;
  const totalRam = metrics.ram;

  return (
    <div className="tm-root">
      {/* System overview header */}
      <div className="tm-header">
        <div className="tm-header-top">
          <div className="tm-header-title">
            <Icon name="Activity" size={14} className="tm-header-icon" />
            <span>System</span>
          </div>
          <div className="tm-header-meta">
            <span className={`tm-status-dot ${metrics.connected ? 'live' : 'simulated'}`} />
            <span className="tm-status-text">{metrics.connected ? 'Live' : 'Simulated'}</span>
          </div>
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>
        <div className="tm-stats">
          <StatBar label="CPU" value={totalCpu} />
          <StatBar label="GPU" value={metrics.gpu} />
          <StatBar label="RAM" value={totalRam} />
        </div>
      </div>

      {/* Process table */}
      <div className="tm-list">
        <div className="tm-list-header">
          <span className="tm-col-process">Process</span>
          <span className="tm-col-cpu">CPU</span>
          <span className="tm-col-mem">Memory</span>
          <span className="tm-col-action"></span>
        </div>
        <div className="tm-list-body">
          {/* Shell row */}
          <div className="tm-row">
            <div className="tm-cell tm-col-process">
              <span className="tm-proc-icon" style={{ color: '#22d3ee' }}>
                <Icon name="Cpu" size={13} />
              </span>
              <span className="tm-proc-name">Lithium Shell</span>
            </div>
            <div className="tm-cell tm-col-cpu tm-num">{metrics.connected ? `${Math.max(1, Math.round(totalCpu * 0.03))}%` : '2%'}</div>
            <div className="tm-cell tm-col-mem tm-num">{shellMB != null ? `${shellMB} MB` : '38 MB'}</div>
            <div className="tm-cell tm-col-action"></div>
          </div>
          {windows.map((item, idx) => {
            const load = windowLoad(item.id);
            return (
              <div
                key={item.id}
                className={`tm-row ${idx % 2 === 1 ? 'alt' : ''}`}
                onContextMenu={event => openMenu(event, [
                  { id: 'heading', type: 'heading', label: item.title },
                  { id: 'focus', label: 'Focus window', icon: 'Eye', action: () => { updateWindow(item.id, { minimized: false }); focusWindow(item.id); } },
                  { id: 'minimize', label: item.minimized ? 'Restore' : 'Minimize', icon: 'Minus', action: () => updateWindow(item.id, { minimized: !item.minimized }) },
                  { id: 'end', label: 'End task', icon: 'X', danger: true, action: () => closeWindow(item.id) },
                ])}
              >
                <div className="tm-cell tm-col-process">
                  <button className="tm-proc-btn" title="Bring to front" onClick={() => { updateWindow(item.id, { minimized: false }); focusWindow(item.id); }}>
                    <span className="tm-proc-icon">{item.icon}</span>
                    <span className="tm-proc-name">
                      {item.title}
                      {item.minimized && <span className="tm-proc-min">(minimized)</span>}
                    </span>
                  </button>
                </div>
                <div className="tm-cell tm-col-cpu tm-num">{load.cpu}%</div>
                <div className="tm-cell tm-col-mem tm-num">{load.ram} MB</div>
                <div className="tm-cell tm-col-action">
                  <button
                    className="tm-end-btn"
                    onClick={() => closeWindow(item.id)}
                    title="End task"
                  >
                    <Icon name="X" size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {windows.length === 0 && (
          <p className="tm-empty">No apps are running.</p>
        )}
      </div>

      {/* Footer */}
      <div className="tm-footer" onContextMenu={event => openMenu(event, [
        { id: 'end-all', label: 'End all tasks', icon: 'X', danger: true, disabled: windows.length === 0, action: () => windows.forEach(item => closeWindow(item.id)) },
        { id: 'refresh', label: 'Refresh', icon: 'RotateCw', action: () => {} },
      ])}>
        <span className="tm-footer-count">{windows.length + 1} processes</span>
        <button
          className="tm-end-all-btn"
          disabled={windows.length === 0}
          onClick={() => windows.forEach(item => closeWindow(item.id))}
        >
          <Icon name="X" size={11} />
          End all
        </button>
      </div>
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}
