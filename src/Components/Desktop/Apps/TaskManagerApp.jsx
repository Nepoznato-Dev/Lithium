import React, { useState } from 'react';

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
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-8 text-white/45">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: barColor(value) }} />
      </div>
      <span className="w-9 text-right tabular-nums text-white/70">{value}%</span>
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

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#14161d] text-white">
      {/* System overview */}
      <div className="space-y-1.5 border-b border-white/[0.06] px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/80">
          <Icon name="Activity" size={14} className="text-cyan-300" /> System performance
          <span className={`ml-auto flex items-center gap-1 text-[10px] font-normal ${metrics.connected ? 'text-emerald-400' : 'text-amber-400/70'}`}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: metrics.connected ? '#34d399' : '#fbbf24' }} />
            {metrics.connected ? 'Live' : 'Simulated'}
          </span>
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>
        <StatBar label="CPU" value={metrics.cpu} />
        <StatBar label="GPU" value={metrics.gpu} />
        <StatBar label="RAM" value={metrics.ram} />
      </div>

      {/* Process table */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <table className="w-full text-left text-xs text-white/80">
          <thead>
            <tr className="text-white/40">
              <th className="px-2 py-1.5 font-medium">Process</th>
              <th className="w-14 px-2 py-1.5 font-medium">CPU</th>
              <th className="w-20 px-2 py-1.5 font-medium">Memory</th>
              <th className="w-20 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/[0.04] text-white/60">
              <td className="px-2 py-2">Lithium Shell</td>
              <td className="px-2 py-2 tabular-nums">{metrics.connected ? `${Math.max(1, Math.round(metrics.cpu * 0.03))}%` : '2%'}</td>
              <td className="px-2 py-2 tabular-nums">{shellMB != null ? `${shellMB} MB` : '38 MB'}</td>
              <td className="px-2 py-2" />
            </tr>
            {windows.map(item => {
              const load = windowLoad(item.id);
              return (
                <tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]" onContextMenu={event => openMenu(event, [
                  { id: 'heading', type: 'heading', label: item.title },
                  { id: 'focus', label: 'Focus window', icon: 'Eye', action: () => { updateWindow(item.id, { minimized: false }); focusWindow(item.id); } },
                  { id: 'minimize', label: item.minimized ? 'Restore' : 'Minimize', icon: 'Minus', action: () => updateWindow(item.id, { minimized: !item.minimized }) },
                  { id: 'end', label: 'End task', icon: 'X', danger: true, action: () => closeWindow(item.id) },
                ])}>
                  <td className="px-2 py-2">
                    <button className="flex items-center gap-2 text-left hover:text-cyan-300" title="Bring to front" onClick={() => { updateWindow(item.id, { minimized: false }); focusWindow(item.id); }}>
                      <span className="flex w-4 justify-center">{item.icon}</span>
                      {item.title}
                      {item.minimized && <span className="text-[10px] text-white/35">(minimized)</span>}
                    </button>
                  </td>
                  <td className="px-2 py-2 tabular-nums">{load.cpu}%</td>
                  <td className="px-2 py-2 tabular-nums">{load.ram} MB</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/70 transition-colors hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-300"
                      onClick={() => closeWindow(item.id)}
                    >
                      <Icon name="X" size={11} /> End task
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {windows.length === 0 && (
          <p className="px-2 py-6 text-center text-white/35">No apps are running.</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[11px] text-white/40" onContextMenu={event => openMenu(event, [
        { id: 'end-all', label: 'End all tasks', icon: 'X', danger: true, disabled: windows.length === 0, action: () => windows.forEach(item => closeWindow(item.id)) },
        { id: 'refresh', label: 'Refresh', icon: 'RotateCw', action: () => {} },
      ])}>
        <span>{windows.length + 1} processes</span>
        <button
          className="rounded-md border border-white/10 px-2.5 py-1 text-white/70 transition-colors hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40"
          disabled={windows.length === 0}
          onClick={() => windows.forEach(item => closeWindow(item.id))}
        >
          End all tasks
        </button>
      </div>
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}
