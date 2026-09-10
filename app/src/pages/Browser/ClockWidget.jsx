/**
 * ClockWidget — Brave-style clock: large time with inline AM/PM.
 * Matches Brave's clock component (font-weight: 500, day-period as superscript).
 * Updates every 2 seconds (same as Brave).
 */
import { useState, useEffect } from 'preact/hooks';

function pad(n) { return n < 10 ? '0' + n : '' + n; }

export default function ClockWidget() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 2000);
    return () => clearInterval(timer);
  }, []);

  let hours = now.getHours();
  const minutes = pad(now.getMinutes());
  const isPM = hours >= 12;
  hours = hours % 12 || 12;

  return (
    <div className="ntp-clock">
      <span>{hours}:{minutes}</span>
      <span className="ntp-clock-day-period">{isPM ? 'PM' : 'AM'}</span>
    </div>
  );
}
