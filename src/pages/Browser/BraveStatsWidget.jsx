/**
 * BraveStatsWidget — matches Brave's NTP stats pattern:
 * Horizontal list of stat items, each with a large counter,
 * optional unit text, and a description label below.
 * Reads from PrivacyService for real stats (C8: NTP unification).
 */
import { globalStats, totalBlocked } from './stores/shieldsStore';
import { getStats as getPrivacyStats } from '../../lib/services/privacyService';

function getStats() {
  // Prefer PrivacyService stats if available
  try {
    const ps = getPrivacyStats();
    if (ps && (ps.trackersBlocked > 0 || ps.adsBlocked > 0)) {
      return {
        adsBlocked: (ps.trackersBlocked || 0) + (ps.adsBlocked || 0),
        trackersBlocked: ps.trackersBlocked || 0,
        httpsUpgrades: ps.httpsUpgrades || 0,
        dataSaved: ps.dataSaved || 0,
        timeSaved: ps.timeSaved || 0,
      };
    }
  } catch {
    // Fall back to the in-memory shields stats if the privacy service is unavailable.
  }
  // Fallback to shieldsStore stats
  const s = globalStats.value;
  return {
    adsBlocked: s.adsBlocked + s.trackersBlocked,
    trackersBlocked: s.trackersBlocked,
    httpsUpgrades: s.httpsUpgrades,
    dataSaved: s.dataSaved,
    timeSaved: s.timeSaved,
  };
}

function formatNumber(n) {
  if (n < 1000) return String(Math.floor(n));
  if (n < 1000000) { const k = n / 1000; return k % 1 < 0.05 || k % 1 > 0.95 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`; }
  const m = n / 1000000; return m % 1 < 0.05 || m % 1 > 0.95 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function formatData(bytes) {
  if (bytes >= 1_073_741_824) return { counter: (bytes / 1_073_741_824).toFixed(2), unit: 'GB' };
  if (bytes >= 1_048_576) return { counter: (bytes / 1_048_576).toFixed(1), unit: 'MB' };
  if (bytes >= 1024) return { counter: (bytes / 1024).toFixed(0), unit: 'KB' };
  return { counter: bytes, unit: 'B' };
}

export default function BraveStatsWidget() {
  const stats = getStats();
  const adblockCount = stats.adsBlocked || 0;
  const timeSaved = formatTime(stats.timeSaved);
  const bandwidthSaved = formatData(stats.dataSaved);

  return (
    <ul className="ntp-stats-list">
      {/* Ads & trackers blocked — Brave blue accent */}
      <li className="ntp-stats-item" style={{ color: '#4F86E2' }}>
        <span className="ntp-stats-counter">{formatNumber(adblockCount)}</span>
        <span className="ntp-stats-desc">Ads & Trackers Blocked</span>
      </li>

      {/* Bandwidth saved — Brave orange accent */}
      <li className="ntp-stats-item" style={{ color: '#F28A29' }}>
        <span className="ntp-stats-counter">{bandwidthSaved.counter}</span>
        <span className="ntp-stats-unit">{bandwidthSaved.unit}</span>
        <span className="ntp-stats-desc">Bandwidth Saved</span>
      </li>

      {/* Time saved — white */}
      <li className="ntp-stats-item" style={{ color: '#fff' }}>
        <span className="ntp-stats-counter">{timeSaved.counter}</span>
        <span className="ntp-stats-unit">{timeSaved.unit}</span>
        <span className="ntp-stats-desc">Time Saved</span>
      </li>
    </ul>
  );
}
