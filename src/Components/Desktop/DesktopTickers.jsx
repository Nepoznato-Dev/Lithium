import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';

/* ---------- Shared 1-second clock hook ----------
 * Multiple components need the current time.  Instead of each one running its
 * own setInterval (which means N independent re-renders per second), they all
 * call this hook.  React batches the state updates into a single render pass
 * because they all fire in the same microtask. */

let _tick = 0;
let _tickSubscribers = 0;
let _tickInterval = null;
const _tickListeners = new Set();

function subscribeTick(fn) {
  _tickListeners.add(fn);
  _tickSubscribers += 1;
  if (!_tickInterval) {
    _tickInterval = setInterval(() => {
      _tick += 1;
      const now = new Date();
      for (const listener of _tickListeners) listener(now);
    }, 1000);
  }
  return () => {
    _tickListeners.delete(fn);
    _tickSubscribers -= 1;
    if (_tickSubscribers <= 0 && _tickInterval) {
      clearInterval(_tickInterval);
      _tickInterval = null;
    }
  };
}

/** Returns the current Date, updating once per second.  All subscribers share
 *  a single interval so N clock components still produce only 1 timer. */
function useSharedClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => subscribeTick(setNow), []);
  return now;
}

/* ---------- System metrics — powered by lithium-perfmon extension ----------
 * Three-tier data source (all subscribers share one poller):
 *   1. Direct fetch to perfmon.py at localhost:19757  (real metrics, fastest)
 *   2. Chrome extension bridge via window.postMessage  (real or simulated via extension)
 *   3. Built-in random-walk simulation                 (always works, no dependencies)
 * All subscribers share a single poller (same pattern as the shared clock). */

const PERFMON_URL = 'http://localhost:19757/metrics';

let _perfData = { cpu: 12, gpu: 8, ram: 34, connected: false };
let _perfSubscribers = new Set();
let _perfInterval = null;

function _drift(v) { return Math.max(3, Math.min(92, v + Math.round((Math.random() - 0.5) * 10))); }

/* --- Extension bridge (Chrome messaging protocol) --- */

const _pendingExt = new Map();

window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (event.data?.type !== 'LITHIUM_PERF_RESPONSE') return;
  const pending = _pendingExt.get(event.data.id);
  if (pending) {
    _pendingExt.delete(event.data.id);
    clearTimeout(pending.timer);
    pending.resolve(event.data.metrics);
  }
});

function _extensionBridge() {
  return new Promise(resolve => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { _pendingExt.delete(id); resolve(null); }, 2000);
    _pendingExt.set(id, { resolve, timer });
    window.postMessage({ type: 'LITHIUM_PERF_REQUEST', id }, '*');
  });
}

/* --- Direct fetch to perfmon.py --- */

async function _directFetch() {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(PERFMON_URL, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const d = await res.json();
    return {
      cpu: Math.round(d.cpu), gpu: d.gpu != null ? Math.round(d.gpu) : 0,
      ram: Math.round(d.ram), connected: true,
    };
  } catch { clearTimeout(tid); return null; }
}

/* --- Simulation fallback --- */

function _simulate() {
  const mem = performance.memory;
  return {
    cpu: _drift(_perfData.cpu), gpu: _drift(_perfData.gpu),
    ram: mem ? Math.round(mem.usedJSHeapSize / mem.jsHeapSizeLimit * 100) : _perfData.ram,
    connected: false,
  };
}

/* --- Unified poll: direct → extension → simulation --- */

async function _perfPoll() {
  let data = await _directFetch();
  if (!data) {
    const ext = await _extensionBridge();
    if (ext && ext.cpu != null) {
      data = { cpu: Math.round(ext.cpu), gpu: ext.gpu != null ? Math.round(ext.gpu) : 0,
               ram: Math.round(ext.ram ?? 0), connected: !!ext.connected };
    }
  }
  if (!data) data = _simulate();
  _perfData = data;
  for (const fn of _perfSubscribers) fn(_perfData);
}

function subscribePerf(fn) {
  _perfSubscribers.add(fn);
  if (!_perfInterval) {
    _perfPoll();
    _perfInterval = setInterval(_perfPoll, 2000);
  }
  return () => {
    _perfSubscribers.delete(fn);
    if (_perfSubscribers.size === 0 && _perfInterval) {
      clearInterval(_perfInterval);
      _perfInterval = null;
    }
  };
}

function useSystemMetricsInner() {
  const [metrics, setMetrics] = useState(() => ({ ..._perfData }));
  useEffect(() => subscribePerf(setMetrics), []);
  return metrics;
}

const statColor = value => (value >= 80 ? '#ef4444' : value >= 60 ? '#f59e0b' : '#10b981');

/* ---------- Exported for DesktopView's own consumers ---------- */

export function useSystemMetrics() {
  return useSystemMetricsInner();
}

export { statColor };

/* ---------- Isolated ticker components (React.memo'd) ----------
 * Each one owns its state and re-renders only when its own timer fires,
 * NOT when the parent DesktopView re-renders. */

export const StartButton = React.memo(function StartButton({ open, onClick }) {
  const metrics = useSystemMetrics();
  return (
    <button className={`nx-start-button ${open ? 'open' : ''}`} onClick={onClick} title="Click to open Start menu">
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }} title={`CPU ${metrics.cpu}% · GPU ${metrics.gpu}% · RAM ${metrics.ram}%`}>
        <span style={{ width: 14, height: 3, borderRadius: 1, opacity: 0.9, backgroundColor: statColor(metrics.cpu) }} />
        <span style={{ width: 14, height: 3, borderRadius: 1, opacity: 0.9, backgroundColor: statColor(metrics.gpu) }} />
        <span style={{ width: 14, height: 3, borderRadius: 1, opacity: 0.9, backgroundColor: statColor(metrics.ram) }} />
      </span>
      <span className="nx-start-label">Start</span>
    </button>
  );
});

export const PerfPopup = React.memo(function PerfPopup({ onClose, onOpenTaskManager }) {
  const metrics = useSystemMetrics();
  return (
    <div className="nx-perf-popup" onClick={event => event.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <Icon name="Activity" size={14} style={{ color: '#22d3ee' }} /> Performance
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: metrics.connected ? '#34d399' : '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: metrics.connected ? '#34d399' : '#fbbf24', display: 'inline-block' }} />
            {metrics.connected ? 'Live' : 'Simulated'}
          </span>
          <button className="nx-footer-icon" style={{ width: 24, height: 24 }} onClick={onClose} title="Close">×</button>
        </div>
      </div>
      {[
        { label: 'CPU', value: metrics.cpu },
        { label: 'GPU', value: metrics.gpu },
        { label: 'RAM', value: metrics.ram },
      ].map(row => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 34, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{row.label}</span>
          <div style={{ flex: 1, height: 6, overflow: 'hidden', borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ width: `${row.value}%`, height: '100%', borderRadius: 3, backgroundColor: statColor(row.value), transition: 'width 700ms ease' }} />
          </div>
          <span style={{ width: 36, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{row.value}%</span>
        </div>
      ))}
      <button className="nx-menu-item" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }} onClick={onOpenTaskManager}>
        Open Task Manager
      </button>
    </div>
  );
});

export const PerfFooterButton = React.memo(function PerfFooterButton({ onClick }) {
  const metrics = useSystemMetrics();
  const avg = Math.round((metrics.cpu + metrics.gpu + metrics.ram) / 3);
  return (
    <button
      className="nx-footer-icon"
      style={{ width: 'auto', height: 'auto', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}
      title={`${metrics.connected ? 'Live' : 'Simulated'} — CPU ${metrics.cpu}% · GPU ${metrics.gpu}% · RAM ${metrics.ram}%`}
      onClick={onClick}
    >
      <Icon name="Activity" size={16} />
      <span className="nx-perf-bar" style={{ width: 64 }}>
        <span style={{ width: `${avg}%`, backgroundColor: statColor(Math.max(metrics.cpu, metrics.gpu, metrics.ram)) }} />
      </span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{avg}%</span>
    </button>
  );
});

export const StatusTime = React.memo(function StatusTime() {
  const now = useSharedClock();
  return <span style={{ fontWeight: 500 }}>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>;
});

export const TaskbarClock = React.memo(function TaskbarClock({ suppressTooltip, onClick }) {
  const now = useSharedClock();
  const [hover, setHover] = useState(false);
  return (
    <>
      <button className="nx-clock" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}>
        <span className="nx-clock-time">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        <span className="nx-clock-date">{now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}</span>
      </button>
      {hover && !suppressTooltip && (
        <div className="nx-popup" style={{ right: 16, bottom: 60, padding: '8px 10px', fontSize: 12, pointerEvents: 'none' }}>
          {now.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}
    </>
  );
});

export const CalendarPopup = React.memo(function CalendarPopup() {
  const now = useSharedClock();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const calendarDays = useMemo(() => [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)], [firstDay, daysInMonth]);
  return (
    <div className="nx-calendar" onClick={event => event.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
        <Icon name="Clock" size={16} />
      </div>
      <div className="nx-calendar-grid" style={{ color: '#9aa0a6' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div key={`day-${index}`} style={{ textAlign: 'center' }}>{day}</div>)}
      </div>
      <div className="nx-calendar-grid" style={{ marginBottom: 0 }}>
        {calendarDays.map((day, index) => (
          <div key={`cell-${index}`} className={`nx-calendar-day ${day === now.getDate() ? 'today' : ''}`} style={{ color: day ? '#fff' : 'transparent' }}>
            {day || '.'}
          </div>
        ))}
      </div>
    </div>
  );
});
