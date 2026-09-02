/**
 * BraveStatsWidget — matches Brave's NTP stats pattern:
 * Horizontal list of stat items, each with a large counter,
 * optional unit text, and a description label below.
 * Each stat gets a distinct accent color (like Brave's CSS).
 */
import { globalStats, totalBlocked } from './stores/shieldsStore';
import * as core from '../../lib/core';

function formatNumber(n) {
  const result = core.browserFormatStatNumberSync(n);
  if (result) return result;
  return n.toLocaleString();
}

function formatTime(ms) {
  const result = core.browserFormatTimeSavedSync(ms);
  if (result) return result;
  const estimatedMs = (globalStats.value.adsBlocked || 0) * 50;
  const hours = estimatedMs < 1000 * 60 * 60 * 24;
  const minutes = estimatedMs < 1000 * 60 * 60;
  const seconds = estimatedMs < 1000 * 60;
  let counter, unit;
  if (seconds) {
    counter = Math.ceil(estimatedMs / 1000);
    unit = counter === 1 ? 'second' : 'seconds';
  } else if (minutes) {
    counter = Math.ceil(estimatedMs / 1000 / 60);
    unit = counter === 1 ? 'minute' : 'minutes';
  } else if (hours) {
    counter = +((estimatedMs / 1000 / 60 / 60).toFixed(1));
    unit = counter === 1 ? 'hour' : 'hours';
  } else {
    counter = +((estimatedMs / 1000 / 60 / 60 / 24).toFixed(2));
    unit = counter === 1 ? 'day' : 'days';
  }
  return { counter, unit };
}

function formatData(bytes) {
  if (bytes >= 1_073_741_824) return { counter: (bytes / 1_073_741_824).toFixed(2), unit: 'GB' };
  if (bytes >= 1_048_576) return { counter: (bytes / 1_048_576).toFixed(1), unit: 'MB' };
  if (bytes >= 1024) return { counter: (bytes / 1024).toFixed(0), unit: 'KB' };
  return { counter: bytes, unit: 'B' };
}

export default function BraveStatsWidget() {
  const stats = globalStats.value;
  const adblockCount = stats.adsBlocked || 0;
  const timeSaved = formatTime(stats.timeSaved);
  const bandwidthSaved = formatData(stats.dataSaved);

  return (
    <ul className="ntp-stats-list">
      {/* Ads & trackers blocked — blue accent */}
      <li className="ntp-stats-item" style={{ color: '#4F86E2' }}>
        <span className="ntp-stats-counter">{formatNumber(adblockCount)}</span>
        <span className="ntp-stats-desc">ads & trackers blocked</span>
      </li>

      {/* Bandwidth saved — orange accent */}
      <li className="ntp-stats-item" style={{ color: '#F28A29' }}>
        <span className="ntp-stats-counter">{bandwidthSaved.counter}</span>
        <span className="ntp-stats-unit">{bandwidthSaved.unit}</span>
        <span className="ntp-stats-desc">estimated bandwidth saved</span>
      </li>

      {/* Time saved — white */}
      <li className="ntp-stats-item" style={{ color: '#fff' }}>
        <span className="ntp-stats-counter">{timeSaved.counter}</span>
        <span className="ntp-stats-unit">{timeSaved.unit}</span>
        <span className="ntp-stats-desc">estimated time saved</span>
      </li>
    </ul>
  );
}
