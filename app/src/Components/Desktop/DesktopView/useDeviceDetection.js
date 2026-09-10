import { useEffect, useState } from 'react';

/** Detects online/offline status, network speed, and battery level. */
export default function useDeviceDetection() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [netSpeed, setNetSpeed] = useState(null);
  const [battery, setBattery] = useState(null);

  // Online / offline
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  // Network speed via Network Information API
  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return;
    const update = () => setNetSpeed(conn.downlink ?? null);
    update();
    conn.addEventListener('change', update);
    return () => conn.removeEventListener('change', update);
  }, []);

  // Battery API
  useEffect(() => {
    if (!navigator.getBattery) return undefined;
    let manager;
    let cancelled = false;
    (async () => {
      try {
        manager = await navigator.getBattery();
        if (cancelled) return;
        const update = () => {
          const time = manager.charging ? manager.chargingTime : manager.dischargingTime;
          setBattery({ level: Math.round(manager.level * 100), charging: manager.charging, timeRemaining: isFinite(time) && time > 0 ? time : null });
        };
        update();
        manager.addEventListener('levelchange', update);
        manager.addEventListener('chargingchange', update);
        manager.addEventListener('dischargingtimechange', update);
        manager.addEventListener('chargingtimechange', update);
      } catch { /* Battery API is optional. */ }
    })();
    return () => {
      cancelled = true;
      if (manager) { manager.removeEventListener('levelchange', () => {}); manager.removeEventListener('chargingchange', () => {}); }
    };
  }, []);

  // Derived tooltips
  const formatBatteryTime = (seconds) => {
    if (seconds == null) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const batteryTooltip = battery
    ? `Battery: ${battery.level}%${battery.charging ? ' (Charging)' : battery.timeRemaining ? ` — ~${formatBatteryTime(battery.timeRemaining)} remaining` : ''}`
    : 'Desktop (No Battery)';

  const networkTooltip = online
    ? netSpeed != null ? `Network: connected \u2014 ~${netSpeed} Mbps` : 'Network: connected'
    : 'Network: offline';

  return { online, netSpeed, battery, batteryTooltip, networkTooltip };
}
