import { useEffect } from 'react';
import { storage } from '../../../lib/storage';

/* ---------- Wallpapers ---------- */

export const WALLPAPERS = {
  'nexus-default': {
    label: 'Lithium Default',
    style: {
      backgroundColor: '#1a1d2e',
      backgroundImage:
        'linear-gradient(0deg, #1a1d2e 24%, transparent 25%, transparent 75%, #1a1d2e 76%, #1a1d2e), linear-gradient(90deg, #1a1d2e 24%, transparent 25%, transparent 75%, #1a1d2e 76%, #1a1d2e)',
      backgroundSize: '40px 40px',
      backgroundPosition: '0 0, 20px 20px',
    },
  },
  'windows-7': {
    label: 'Windows 7',
    style: { background: 'radial-gradient(circle at 18% 20%, rgba(125, 202, 255, 0.55), rgba(12, 71, 145, 0.9) 55%, #031f56 100%)' },
  },
  'windows-8': {
    label: 'Windows 8',
    style: { background: 'linear-gradient(135deg, #1f6ed4 0%, #3b8ff1 35%, #6cb8ff 70%, #82d0ff 100%)' },
  },
  'windows-10': {
    label: 'Windows 10',
    style: { background: 'linear-gradient(120deg, #021f53 0%, #0a4ea6 35%, #0f7fdf 65%, #29a9ff 100%)' },
  },
  'season-halloween': {
    label: 'Halloween',
    style: { background: 'radial-gradient(circle at 20% 15%, rgba(255, 149, 0, 0.35), rgba(45, 20, 8, 0.9) 45%, #13090a 100%)' },
  },
  'season-christmas': {
    label: 'Christmas',
    style: { background: 'linear-gradient(145deg, #09291f 0%, #0f5132 35%, #7d1f1f 68%, #2f0b0b 100%)' },
  },
};

/** Debounced localStorage write — avoids thrashing storage on rapid state changes. */
export function useDebouncedSave(key, value) {
  useEffect(() => {
    const timer = setTimeout(() => storage.set(key, value), 300);
    return () => clearTimeout(timer);
  }, [key, value]);
}

/** True when an entry lives inside the Notes vault (default-notes subtree). */
export function inVault(tree, entry) {
  let current = entry;
  while (current && current.id !== 'root') {
    if (current.id === 'default-notes' || current.parentId === 'default-notes') return true;
    current = tree.find(item => item.id === current.parentId);
  }
  return false;
}

/** Human-friendly relative time, e.g. "just now", "3 min ago", "2 h ago". */
export function relativeTime(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return 'just now';
  if (sec < 90) return '1 min ago';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d ago`;
  return new Date(ts).toLocaleDateString();
}

export const TONE_COLORS = {
  info: '#22d3ee',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
};
