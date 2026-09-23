/**
 * Seasonal theme detection and application.
 *
 * When the user enables seasonal mode, the current month determines which
 * colour palette is applied via a `data-season` attribute on <html>.
 * CSS rules in index.css keyed by [data-season] override the base
 * dark/light variables.
 */

const SEASONS = {
  spring: { months: [3, 4, 5], label: 'Spring' },
  summer: { months: [6, 7, 8], label: 'Summer' },
  autumn: { months: [9, 10, 11], label: 'Autumn' },
  winter: { months: [12, 1, 2], label: 'Winter' },
};

/** Return the current season key based on today's month. */
export function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  for (const [key, { months }] of Object.entries(SEASONS)) {
    if (months.includes(month)) return key;
  }
  return 'winter'; // fallback
}

/** Return human-readable label for a season key. */
export function getSeasonLabel(key) {
  return SEASONS[key]?.label ?? key;
}

/** Return all season keys. */
export function getSeasonKeys() {
  return Object.keys(SEASONS);
}

/**
 * Apply (or remove) the seasonal data-season attribute.
 *
 * @param {'off'|'auto'|'manual'} mode
 * @param {string} [manualSeason]  Required when mode === 'manual'
 */
export function applySeasonalTheme(mode, manualSeason) {
  const root = document.documentElement;
  if (mode === 'auto') {
    root.dataset.season = getCurrentSeason();
  } else if (mode === 'manual' && manualSeason) {
    root.dataset.season = manualSeason;
  } else {
    root.removeAttribute('data-season');
  }
}
