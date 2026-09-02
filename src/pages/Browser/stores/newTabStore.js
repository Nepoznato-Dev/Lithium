/**
 * New tab page state — top sites, background images, rotation.
 */
import { signal, computed } from '@preact/signals';

/** Default quick links (pre-populated top sites). Matches Brave's defaultTopSites pattern. */
const DEFAULT_TOP_SITES = [
  { title: 'Wikipedia', url: 'https://www.wikipedia.org', color: '#e2e8f0', background: 'rgba(255,255,255,0.08)' },
  { title: 'Internet Archive', url: 'https://archive.org', color: '#fca5a5', background: 'rgba(255,255,255,0.08)' },
  { title: 'YouTube', url: 'https://www.youtube.com', color: '#ff0000', background: 'rgba(255,255,255,0.08)' },
  { title: 'GitHub', url: 'https://github.com', color: '#c4b5fd', background: 'rgba(255,255,255,0.08)' },
  { title: 'Reddit', url: 'https://www.reddit.com', color: '#fdba74', background: 'rgba(255,255,255,0.08)' },
  { title: 'Twitch', url: 'https://www.twitch.tv', color: '#a78bfa', background: 'rgba(255,255,255,0.08)' },
  { title: 'Google', url: 'https://www.google.com/webhp?igu=1', color: '#7dd3fc', background: 'rgba(255,255,255,0.08)' },
  { title: 'OpenStreetMap', url: 'https://www.openstreetmap.org', color: '#86efac', background: 'rgba(255,255,255,0.08)' },
];

/**
 * Background images — uses Unsplash CDN URLs with author attribution.
 * Each entry has a `color` fallback (shown while image loads or on failure),
 * matching Brave's solid-color + remote-image pattern.
 */
const BACKGROUNDS = [
  {
    id: '1',
    src: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80',
    title: 'Mountain Lake', author: 'Dylan Malval',
    attribution: 'Unsplash', color: '#2a4a6b',
  },
  {
    id: '2',
    src: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80',
    title: 'Forest Valley', author: 'Luca Bravo',
    attribution: 'Unsplash', color: '#3a5a3a',
  },
  {
    id: '3',
    src: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=1920&q=80',
    title: 'City Skyline', author: 'Pedro Lastra',
    attribution: 'Unsplash', color: '#1a1a3e',
  },
  {
    id: '4',
    src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80',
    title: 'Ocean Sunset', author: 'Ryan Loughlin',
    attribution: 'Unsplash', color: '#d47a3a',
  },
  {
    id: '5',
    src: 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=1920&q=80',
    title: 'Desert Dunes', author: 'Keith Hardy',
    attribution: 'Unsplash', color: '#8a6a3a',
  },
  {
    id: '6',
    src: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80',
    title: 'Alpine Peak', author: 'Kalen Emsley',
    attribution: 'Unsplash', color: '#4a5568',
  },
  {
    id: '7',
    src: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1920&q=80',
    title: 'Waterfall Bridge', author: 'Aleksei Zaitsev',
    attribution: 'Unsplash', color: '#2d5a4a',
  },
  {
    id: '8',
    src: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=80',
    title: 'Green Forest', author: 'Luca Bravo',
    attribution: 'Unsplash', color: '#2a4a2a',
  },
];

/**
 * Solid color fallbacks (from Brave's NTP palette).
 * Used when images are disabled or fail to load.
 */
export const SOLID_COLORS = [
  '#5B5C63', '#000000', '#151E9A', '#2197F9', '#1FC3DC', '#086582',
  '#67D4B4', '#077D5A', '#3C790B', '#AFCE57', '#F0CB44', '#F28A29',
  '#FC798F', '#C1226E', '#FAB5EE', '#C0C4FF', '#9677EE', '#5433B0', '#4A000C',
];

/**
 * Gradient fallbacks (from Brave's NTP palette).
 */
export const GRADIENTS = [
  'linear-gradient(125.83deg, #392DD1 0%, #A91B78 99.09%)',
  'linear-gradient(125.83deg, #392DD1 0%, #22B8CF 99.09%)',
  'linear-gradient(90deg, #4F30AB 0.64%, #845EF7 99.36%)',
  'linear-gradient(126.47deg, #A43CE4 16.99%, #A72B6D 86.15%)',
  'radial-gradient(69.45% 69.45% at 89.46% 81.73%, #641E0C 0%, #500F39 43.54%, #060141 100%)',
  'radial-gradient(80% 80% at 101.61% 76.99%, #2D0264 0%, #030023 100%)',
  'linear-gradient(128.12deg, #43D4D4 6.66%, #1596A9 83.35%)',
  'linear-gradient(323.02deg, #DD7131 18.65%, #FBD460 82.73%)',
  'linear-gradient(128.12deg, #4F86E2 6.66%, #694CD9 83.35%)',
  'linear-gradient(127.39deg, #851B6A 6.04%, #C83553 86.97%)',
  'linear-gradient(130.39deg, #FE6F4C 9.83%, #C53646 85.25%)',
];

/** Top sites (speed dial tiles). */
export const topSites = signal(DEFAULT_TOP_SITES);

/** Last removed site (for undo). */
let _lastRemoved = null;
let _lastRemovedIndex = -1;

/** Background images array. */
export const backgrounds = signal(BACKGROUNDS);

/** Current background index. */
export const currentBgIndex = signal(0);

/** Whether background rotation is paused. */
export const bgPaused = signal(false);

/** Rotation interval in seconds (0 = disabled). */
export const rotationInterval = signal(60);

/** NTP component visibility toggles (persisted via settings modal). */
export const showTopSites = signal(true);
export const showClock = signal(true);
export const showStatsWidget = signal(true);
export const showNewsWidget = signal(true);
export const clock24Hour = signal(false);
export const showBackgroundImages = signal(true);

/** Computed: current background image. */
export const currentBackground = computed(() =>
  backgrounds.value[currentBgIndex.value] || backgrounds.value[0]
);

/* ---------- Actions ---------- */

export function addTopSite(title, url, color) {
  if (topSites.value.length >= 10) return;
  topSites.value = [...topSites.value, { title, url, color: color || '#94a3b8' }];
}

export function removeTopSite(index) {
  _lastRemoved = topSites.value[index] || null;
  _lastRemovedIndex = index;
  topSites.value = topSites.value.filter((_, i) => i !== index);
}

export function undoRemoveTopSite() {
  if (!_lastRemoved || _lastRemovedIndex < 0) return;
  const arr = [...topSites.value];
  arr.splice(Math.min(_lastRemovedIndex, arr.length), 0, _lastRemoved);
  topSites.value = arr;
  _lastRemoved = null;
  _lastRemovedIndex = -1;
}

export function updateTopSite(index, title, url) {
  if (index < 0 || index >= topSites.value.length) return;
  const arr = [...topSites.value];
  arr[index] = { ...arr[index], title, url };
  topSites.value = arr;
}

export function reorderTopSites(fromIndex, toIndex) {
  const arr = [...topSites.value];
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  topSites.value = arr;
}

export function nextBackground() {
  currentBgIndex.value = (currentBgIndex.value + 1) % backgrounds.value.length;
}

export function prevBackground() {
  currentBgIndex.value = (currentBgIndex.value - 1 + backgrounds.value.length) % backgrounds.value.length;
}

export function toggleBgPause() {
  bgPaused.value = !bgPaused.value;
}

/** Pick a random background image (Brave's randomBackgroundImage pattern). */
export function randomBackground() {
  const idx = Math.floor(Math.random() * backgrounds.value.length);
  currentBgIndex.value = idx;
}

/** Pick a random solid color fallback. */
export function randomSolidColor() {
  return SOLID_COLORS[Math.floor(Math.random() * SOLID_COLORS.length)];
}

/** Pick a random gradient fallback. */
export function randomGradient() {
  return GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
}

export function loadTopSites(data) {
  if (data && data.length > 0) topSites.value = data;
}
