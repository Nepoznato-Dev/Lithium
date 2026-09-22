import React, { useEffect, useState } from 'react';
import Icon from '../../Icon';

/** Ticking clock shared by the iOS status bar and the macOS menu bar. */
export function useMxClock(interval = 15000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [interval]);

  return now;
}

/** Connectivity + battery cluster, reused verbatim by the macOS menu bar. */
export function MxStatusBits({ online, battery }) {
  const level = battery?.level ?? null;
  const charging = battery?.charging;

  return (
    <span className="mx-status-right">
      {/* Cellular-style signal bars reflect the online state. */}
      <span className="mx-signal" aria-hidden>
        {[1, 2, 3, 4].map((bar) => (
          <i key={bar} className={online ? 'on' : ''} style={{ opacity: online ? 1 : 0.35 }} />
        ))}
      </span>
      {online
        ? <Icon name="Wifi" size={14} strokeWidth={2.4} />
        : <Icon name="WifiOff" size={14} strokeWidth={2.4} />}
      {level != null && (
        <span className="mx-battery" title={`${level}%${charging ? ' charging' : ''}`}>
          {charging && <Icon name="Zap" size={11} style={{ marginRight: 2 }} />}
          {level <= 20 && <span className="mx-battery-pct">{level}</span>}
          <span className="mx-battery-body">
            <span
              className="mx-battery-fill"
              style={{ width: `${Math.max(4, Math.min(100, level))}%`, background: level <= 20 ? '#ff453a' : 'currentColor' }}
            />
          </span>
          <span className="mx-battery-cap" />
        </span>
      )}
    </span>
  );
}

/** iOS-style status bar: time on the left, connectivity + battery on the right. */
export default function MobileStatusBar({ online, battery }) {
  const now = useMxClock();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="mx-statusbar">
      <span className="mx-time">{time}</span>
      <MxStatusBits online={online} battery={battery} />
    </div>
  );
}
