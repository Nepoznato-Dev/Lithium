/**
 * PrivacyService — Lithium OS system-level privacy daemon.
 *
 * Responsibilities:
 *   1. Strip tracking parameters from URLs (utm_*, fbclid, gclid, etc.)
 *   2. Inject Global Privacy Control (GPC) headers on outbound requests
 *   3. Maintain cumulative privacy stats (ads blocked, trackers prevented,
 *      HTTPS upgrades, scripts blocked, data saved)
 *   4. Evaluate per-domain privacy rules (allow/block lists, shield level)
 *   5. Provide cosmetic CSS filter rules to hide ad remnants and cookie banners
 *
 * All data is persisted in localStorage under the `lithium:privacy:*` namespace
 * and mirrored to kvTier for overflow.  The service emits events on the
 * `lithium:privacy` channel so the UI (ShieldsPanel, PrivacyDashboard, NTP
 * widgets, system tray) can react in real time.
 */

import { storage } from '../storage/localStorage';
import { DEFAULT_TRACKING_PARAMS, DEFAULT_COSMETIC_RULES, DEFAULT_SHIELD_LEVEL } from './privacyRules';

// ── Event channel ────────────────────────────────────────────────────────────
const EVENT = 'lithium:privacy';
const STATS_KEY = 'lithium:privacy:stats';
const RULES_KEY = 'lithium:privacy:rules';
const DOMAINS_KEY = 'lithium:privacy:domains';

function emit(type, detail) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, ...detail, ts: Date.now() } }));
}

export function subscribePrivacy(handler) {
  const listener = e => handler(e.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// ── Stats ────────────────────────────────────────────────────────────────────
function emptyStats() {
  return {
    adsBlocked: 0,
    trackersPrevented: 0,
    httpsUpgrades: 0,
    scriptsBlocked: 0,
    dataSavedBytes: 0,
    pagesProcessed: 0,
    paramsStripped: 0,
    sessionStarted: Date.now(),
  };
}

function loadStats() {
  try {
    const raw = storage.get(STATS_KEY, null);
    if (raw && typeof raw === 'object') return { ...emptyStats(), ...raw };
  } catch { /* fall through */ }
  return emptyStats();
}

function persistStats(stats) {
  storage.set(STATS_KEY, stats);
}

/** Increment a stat counter and emit a change event. */
function bump(key, amount = 1) {
  const stats = loadStats();
  stats[key] = (stats[key] || 0) + amount;
  persistStats(stats);
  emit('stats', { key, value: stats[key], total: stats });
  return stats;
}

/** Return a snapshot of the current cumulative stats. */
export function getStats() {
  return loadStats();
}

/** Reset all cumulative stats (user-initiated from Privacy Dashboard). */
export function resetStats() {
  persistStats(emptyStats());
  emit('stats-reset');
}

// ── Per-domain rules ─────────────────────────────────────────────────────────
function loadDomainRules() {
  try { return storage.get(DOMAINS_KEY, {}); } catch { return {}; }
}

function persistDomainRules(rules) {
  storage.set(DOMAINS_KEY, rules);
}

/** Get the shield level for a specific domain.  Returns 'standard' | 'aggressive' | 'off'. */
export function getDomainShield(hostname) {
  const rules = loadDomainRules();
  return rules[hostname]?.shield || DEFAULT_SHIELD_LEVEL;
}

/** Set the shield level for a domain. */
export function setDomainShield(hostname, shield) {
  const rules = loadDomainRules();
  rules[hostname] = { ...(rules[hostname] || {}), shield };
  persistDomainRules(rules);
  emit('domain-rule', { hostname, shield });
}

/** Check whether a domain has shields disabled. */
export function isShieldDisabled(hostname) {
  return getDomainShield(hostname) === 'off';
}

// ── Tracking parameter stripping ─────────────────────────────────────────────
/** Build a regex that matches any known tracking parameter. */
function buildParamRegex(customParams) {
  const params = [...DEFAULT_TRACKING_PARAMS, ...(customParams || [])];
  // Matches  ?utm_source=...&  or  &fbclid=...  (any position)
  const escaped = params.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`[?&](${escaped.join('|')})=[^&#]*`, 'g');
}

/** Strip tracking parameters from a URL string.  Returns { url, stripped }
 *  where stripped is the number of parameters removed. */
export function stripTrackingParams(urlString, customParams) {
  if (!urlString || typeof urlString !== 'string') return { url: urlString, stripped: 0 };
  try {
    const url = new URL(urlString);
    let stripped = 0;
    const allParams = new Set([...DEFAULT_TRACKING_PARAMS, ...(customParams || [])]);
    for (const key of [...url.searchParams.keys()]) {
      if (allParams.has(key) || key.startsWith('utm_')) {
        url.searchParams.delete(key);
        stripped++;
      }
    }
    return { url: url.toString(), stripped };
  } catch {
    // Malformed URL — try regex fallback
    const regex = buildParamRegex(customParams);
    let stripped = 0;
    const cleaned = urlString.replace(regex, () => { stripped++; return ''; });
    // Fix leftover leading ? or & after stripping
    const fixed = cleaned.replace(/\?&/, '?').replace(/\?$/, '').replace(/&&/g, '&');
    return { url: fixed, stripped };
  }
}

// ── GPC header ───────────────────────────────────────────────────────────────
/** Return headers to inject on outbound requests when GPC is enabled. */
export function getGpcHeaders(enabled) {
  if (!enabled) return {};
  return { 'Sec-GPC': '1' };
}

// ── Cosmetic filters ─────────────────────────────────────────────────────────
/** Return the merged list of cosmetic CSS selectors (defaults + user rules). */
export function getCosmeticRules(customRules) {
  return [...DEFAULT_COSMETIC_RULES, ...(customRules || [])];
}

/** Generate a CSS stylesheet string that hides matched elements. */
export function buildCosmeticStylesheet(hostname) {
  const domainRules = loadDomainRules();
  const custom = domainRules[hostname]?.cosmeticRules || [];
  const rules = getCosmeticRules(custom);
  if (rules.length === 0) return '';
  return rules.map(sel => `${sel} { display: none !important; visibility: hidden !important; }`).join('\n');
}

// ── Stats recording API ──────────────────────────────────────────────────────
/** Record that ads were blocked on a page. */
export function recordAdsBlocked(count = 1) { return bump('adsBlocked', count); }
/** Record that trackers were prevented. */
export function recordTrackersPrevented(count = 1) { return bump('trackersPrevented', count); }
/** Record an HTTPS upgrade. */
export function recordHttpsUpgrade() { return bump('httpsUpgrades'); }
/** Record scripts blocked. */
export function recordScriptsBlocked(count = 1) { return bump('scriptsBlocked', count); }
/** Record data saved (bytes). */
export function recordDataSaved(bytes) { return bump('dataSavedBytes', bytes); }
/** Record a page was processed. */
export function recordPageProcessed() { return bump('pagesProcessed'); }
/** Record tracking params were stripped. */
export function recordParamsStripped(count = 1) { return bump('paramsStripped', count); }

// ── Boot ─────────────────────────────────────────────────────────────────────
let _initialized = false;

/** Initialize the PrivacyService.  Called once from main.jsx on boot. */
export function initPrivacyService() {
  if (_initialized) return;
  _initialized = true;
  // Ensure stats exist
  loadStats();
  emit('init', { stats: loadStats() });
}
