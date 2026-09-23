/**
 * adBlocker.js — Real ad and tracker blocking engine for Lithium Browser.
 *
 * Provides URL classification, domain matching, and HTML element filtering
 * based on built-in filter lists inspired by EasyList, EasyPrivacy, and Fanboy.
 *
 * Categories:
 *   - ad:        Advertising scripts, iframes, and resources
 *   - tracker:   Analytics and tracking pixels/beacons
 *   - social:    Social media widgets and share buttons
 *   - mining:    Cryptocurrency miners
 *   - clean:     Not matched by any filter
 *
 * Filter lists:
 *   - easylist:        Ad domain patterns and URL rules
 *   - easyprivacy:     Tracker/analytics domain patterns
 *   - fanboy-annoyance: Newsletter popups, cookie banners, social widgets
 *   - fanboy-social:   Social media share buttons and embeds
 */

// ── Filter list definitions ──────────────────────────────────────────────────

/** Known ad-serving domains (subset of EasyList ad servers). */
const EASYLIST_DOMAINS = new Set([
  // Major ad networks
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adservice.google.com', 'pagead2.googlesyndication.com',
  // Facebook/Meta ads
  'facebook.net', 'connect.facebook.net', 'pixel.facebook.com',
  'an.facebook.com',
  // Amazon ads
  'assoc-amazon.com', 'aax.amazon-adsystem.com', 'z-na.amazon-adsystem.com',
  // Microsoft/Bing ads
  'bat.bing.com', 'ads.yahoo.com', 'analytics.yahoo.com',
  // Programmatic / SSP
  'adsrvr.org', 'adnxs.com', 'adsystem.com', 'advertising.com',
  'adform.net', 'adroll.com', 'adsafeprotected.com', 'adskeeper.com',
  'adsonar.com', 'adtechus.com', 'adtilt.com', 'adverline.com',
  'advertserve.com', 'adwiki.com',
  'bidswitch.net', 'bluekai.com', 'bounceexchange.com',
  'casalemedia.com', 'chartbeat.com', 'cloudflareinsights.com',
  'connatix.com', 'criteo.com', 'criteo.net',
  'demdex.net', 'dotomi.com',
  'exelator.com', 'eyeota.net',
  'fastclick.net', 'flashtalking.com',
  'hotjar.com', 'hybrid.ai',
  'intentiq.com', 'indexexchange.com', 'innovid.com',
  'krxd.net',
  'liveramp.com', 'mathtag.com', 'media.net', 'mediavine.com',
  'moatads.com', 'mookie1.com',
  'nativo.com', 'newrelic.com', 'nr-data.net',
  'omtrdc.net', 'openx.net', 'outbrain.com',
  'pardot.com', 'pippio.com', 'pubmatic.com',
  'quantcast.com', 'quantserve.com',
  'revcontent.com', 'rfihub.com', 'rlcdn.com', 'rubiconproject.com',
  'samba.tv', 'sascdn.com', 'scorecardresearch.com', 'serving-sys.com',
  'sharethrough.com', 'simpli.fi', 'sitescout.com', 'smartadserver.com',
  'spotxchange.com', 'stickyadstv.com',
  'taboola.com', 'tapad.com', 'teads.tv', 'tidaltv.com',
  'trafficjunky.com', 'tribalfusion.com',
  'undertone.com',
  'videoamp.com',
  'yieldmanager.com', 'yieldmo.com',
  'zedo.com', 'zemanta.com', 'zergnet.com',
  // Popups / push notifications
  'onesignal.com', 'sendpulse.com', 'cleverpush.com',
  // Affiliate tracking
  'clickbank.net', 'cj.com', 'shareasale.com', 'impact.com',
  'partnerize.com', 'rakutenadvertising.com',
]);

/** Known tracker/analytics domains (subset of EasyPrivacy). */
const EASYPRIVACY_DOMAINS = new Set([
  'google-analytics.com', 'googletagmanager.com', 'analytics.google.com',
  'ssl.google-analytics.com', 'www.google-analytics.com',
  'hotjar.com', 'static.hotjar.com', 'script.hotjar.com',
  'mixpanel.com', 'api.mixpanel.com',
  'segment.com', 'cdn.segment.com', 'api.segment.io',
  'amplitude.com', 'api.amplitude.com',
  'newrelic.com', 'bam.nr-data.net', 'js-agent.newrelic.com',
  'nr-data.net',
  'fullstory.com', 'rs.fullstory.com',
  'mouseflow.com', 'cdn.mouseflow.com',
  'luckyorange.com', 'cdn.luckyorange.com',
  'optimizely.com', 'cdn.optimizely.com',
  'pingdom.net', 'rum-static.pingdom.net',
  'sentry.io', 'browser.sentry-cdn.com',
  'bugsnag.com', 'd2wy8f7a9ursnm.cloudfront.net',
  'clicky.com', 'static.getclicky.com',
  'counter.dev',
  'fathom.statusgator.com',
  'goatcounter.com',
  'matomo.cloud', 'cdn.matomo.cloud',
  'parsely.com', 'cdn.parsely.com',
  'plausible.io',
  'posthog.com', 'app.posthog.com',
  'simpleanalytics.com',
  'umami.is',
  'woopra.com',
  'hubspot.com', 'js.hs-analytics.net', 'js.hs-banner.com',
  'hs-scripts.com', 'js.hscollectedforms.net',
  'marketo.com', 'munchkin.marketo.net',
  'drift.com', 'js.driftt.com',
  'intercom.io', 'widget.intercom.io',
  'zendesk.com', 'static.zdassets.com',
  'scorecardresearch.com', 'sb.scorecardresearch.com',
  'quantserve.com', 'pixel.quantserve.com',
  'bluekai.com', 'stags.bluekai.com',
  'demdex.net', 'dpm.demdex.net',
  'exelator.com', 'loadus.exelator.com',
  'krxd.net', 'consumer.krxd.net',
  'liveramp.com', 'id.rlcdn.com',
  'mathtag.com', 'sync.mathtag.com',
  'mookie1.com', 'ib.adnxs.com',
  'pardot.com', 'go.pardot.com',
  'tapad.com', 'pixel.tapad.com',
  'adnxs.com', 'ib.adnxs.com',
  'criteo.com', 'static.criteo.net',
  'eyeota.net', 'bidder.eyeota.net',
  'pubmatic.com', 'ads.pubmatic.com',
  'openx.net', 'rtb.openx.net',
  'rubiconproject.com', 'pixel.rubiconproject.com',
  'smartadserver.com', 'rtb.smartadserver.com',
  'teads.tv', 'sync.teads.tv',
  'outbrain.com', 'amplify.outbrain.com',
  'taboola.com', 'cdn.taboola.com',
]);

/** Social media tracking/widget domains (Fanboy-Social). */
const FANBOY_SOCIAL_DOMAINS = new Set([
  'facebook.net', 'connect.facebook.net', 'platform.facebook.com',
  'platform.instagram.com',
  'platform.twitter.com', 'syndication.twitter.com', 'cdn.syndication.twimg.com',
  'platform.linkedin.com', 'snap.licdn.com',
  'pinterest.com', 'assets.pinterest.com', 'ct.pinterest.com',
  'platform.tumblr.com',
  'vk.com', 'vkuservideo.net',
  'tiktok.com', 'analytics.tiktok.com',
  'snapchat.com', 'tr.snapchat.com',
  'addthis.com', 's7.addthis.com',
  'sharethis.com', 'ws.sharethis.com',
  'addtoany.com', 'static.addtoany.com',
  'po.st',
  'stumbleupon.com', 'widgets.stumbleupon.com',
  'reddit.com', 'www.redditstatic.com',
  'digg.com',
]);

/** Cryptocurrency miner domains. */
const MINING_DOMAINS = new Set([
  'coinhive.com', 'coin-hive.com', 'authedmine.com',
  'crypto-loot.com', 'cryptoloot.me',
  'jsecoin.com', 'load.jsecoin.com',
  'coinimp.com', 'www.coinimp.com',
  'webminepool.com', 'webminepool.tk',
  'minero.cc', 'minero.pw',
  'gridcash.net',
  'ppoi.org',
  'projectpoi.com',
  'ad-miner.com',
]);

// ── URL pattern rules ────────────────────────────────────────────────────────

/**
 * URL path patterns that indicate ad/tracker resources.
 * These match against the full URL path (case-insensitive).
 */
const AD_URL_PATTERNS = [
  /\/ads?\//i,
  /\/adserver\//i,
  /\/adframe/i,
  /\/ad[_-]?banner/i,
  /\/ad[_-]?script/i,
  /\/adsbygoogle/i,
  /\/doubleclick/i,
  /\/pagead/i,
  /\/gadgets\/ads/i,
  /\/sponsored-content/i,
  /\/nativead/i,
  /\/banner\.ad/i,
  /\/popunder/i,
  /\/interstitial/i,
  /\/videoad/i,
  /\/prebid/i,
  /\/adunit/i,
  /\/advertorial/i,
];

const TRACKER_URL_PATTERNS = [
  /\/collect\b/i,
  /\/analytics\//i,
  /\/tracking\//i,
  /\/pixel\b/i,
  /\/beacon\b/i,
  /\/telemetry\//i,
  /\/metrics\b/i,
  /\/track\?/i,
  /\/event\b.*\?/i,
  /\/pageview/i,
  /\/visitor\b/i,
  /\/fingerprint/i,
  /\/utm\.gif/i,
  /\/__utm/i,
  /\/ga\.js/i,
  /\/gtag/i,
  /\/gtm\.js/i,
  /\/analytics\.js/i,
  /\/mixpanel/i,
  /\/segment/i,
  /\/amplitude/i,
  /\/sentry/i,
  /\/bugsnag/i,
];

const MINING_URL_PATTERNS = [
  /\/coinhive/i,
  /\/crypto-?loot/i,
  /\/webmine/i,
  /\/minero/i,
  /\/jsecoin/i,
  /\.wasm.*miner/i,
  /\/cryptonight/i,
];

// ── Filter list registry ─────────────────────────────────────────────────────

export const FILTER_LISTS = {
  easylist: {
    name: 'EasyList',
    description: 'Blocks advertising domains and URL patterns',
    domains: EASYLIST_DOMAINS,
    patterns: AD_URL_PATTERNS,
    enabled: true,
  },
  easyprivacy: {
    name: 'EasyPrivacy',
    description: 'Blocks tracking, analytics, and fingerprinting',
    domains: EASYPRIVACY_DOMAINS,
    patterns: TRACKER_URL_PATTERNS,
    enabled: true,
  },
  'fanboy-social': {
    name: 'Fanboy-Social',
    description: 'Blocks social media widgets and tracking',
    domains: FANBOY_SOCIAL_DOMAINS,
    patterns: [],
    enabled: false,
  },
  'fanboy-annoyance': {
    name: 'Fanboy-Annoyance',
    description: 'Blocks cookie banners, newsletter popups, in-page popups',
    domains: new Set(),
    patterns: [],
    enabled: true,
  },
};

const FILTER_KEY = 'lithium:filter-lists';

/** Load filter list enabled states from localStorage. */
export function loadFilterListStates() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY));
    if (saved && typeof saved === 'object') {
      for (const [key, val] of Object.entries(saved)) {
        if (FILTER_LISTS[key] && typeof val === 'boolean') {
          FILTER_LISTS[key].enabled = val;
        }
      }
    }
  } catch { /* use defaults */ }
}

/** Persist filter list enabled states. */
export function saveFilterListStates() {
  const states = {};
  for (const [key, list] of Object.entries(FILTER_LISTS)) {
    states[key] = list.enabled;
  }
  localStorage.setItem(FILTER_KEY, JSON.stringify(states));
}

/** Toggle a filter list on/off. */
export function toggleFilterList(listId) {
  if (FILTER_LISTS[listId]) {
    FILTER_LISTS[listId].enabled = !FILTER_LISTS[listId].enabled;
    saveFilterListStates();
  }
}

// ── Classification engine ────────────────────────────────────────────────────

/**
 * Classify a URL into a category.
 * @param {string} urlString
 * @returns {{ category: 'ad'|'tracker'|'social'|'mining'|'clean', list: string|null, domain: string }}
 */
export function classifyUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { category: 'clean', list: null, domain: '' };
  }

  let host = '';
  try {
    const u = new URL(urlString);
    host = u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // Try to extract domain from a relative URL
    const match = urlString.match(/^(?:https?:\/\/)?([^/?#]+)/i);
    if (match) host = match[1].toLowerCase().replace(/^www\./, '');
  }

  // Check mining first (highest priority)
  if (MINING_DOMAINS.has(host)) {
    return { category: 'mining', list: 'easylist', domain: host };
  }
  for (const pat of MINING_URL_PATTERNS) {
    if (pat.test(urlString)) {
      return { category: 'mining', list: 'easylist', domain: host };
    }
  }

  // Check each enabled filter list
  for (const [listId, list] of Object.entries(FILTER_LISTS)) {
    if (!list.enabled) continue;

    // Domain match — check if host ends with a blocked domain
    for (const blockedDomain of list.domains) {
      if (host === blockedDomain || host.endsWith('.' + blockedDomain)) {
        const cat = listId === 'easyprivacy' ? 'tracker'
          : listId === 'fanboy-social' ? 'social'
          : 'ad';
        return { category: cat, list: listId, domain: host };
      }
    }

    // Pattern match against URL path
    for (const pat of list.patterns) {
      if (pat.test(urlString)) {
        const cat = listId === 'easyprivacy' ? 'tracker'
          : listId === 'fanboy-social' ? 'social'
          : 'ad';
        return { category: cat, list: listId, domain: host };
      }
    }
  }

  return { category: 'clean', list: null, domain: host };
}

/**
 * Quick check: should this URL be blocked?
 * @param {string} urlString
 * @returns {boolean}
 */
export function shouldBlock(urlString) {
  return classifyUrl(urlString).category !== 'clean';
}

/**
 * Check if a domain is a known tracker.
 * @param {string} domain
 * @returns {boolean}
 */
export function isTrackerDomain(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase().replace(/^www\./, '');
  return EASYPRIVACY_DOMAINS.has(d) ||
    Array.from(EASYPRIVACY_DOMAINS).some(bd => d.endsWith('.' + bd));
}

// ── HTML document scanner ────────────────────────────────────────────────────

/**
 * Scan a DOM document and classify its external resources.
 * Returns arrays of elements to block/strip.
 *
 * @param {Document} doc — a parsed DOMParser document
 * @param {string} pageUrl — the page's own URL (to skip same-origin)
 * @returns {{
 *   ads: Element[],
 *   trackers: Element[],
 *   social: Element[],
 *   mining: Element[],
 *   totalBlocked: number,
 *   dataSaved: number,
 * }}
 */
export function scanDocument(doc, pageUrl) {
  const result = { ads: [], trackers: [], social: [], mining: [], totalBlocked: 0, dataSaved: 0 };

  let pageHost = '';
  try { pageHost = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { /* invalid URL */ }

  // Elements that load external resources
  const selectors = [
    'script[src]', 'iframe[src]', 'img[src]',
    'link[href]', 'embed[src]', 'object[data]',
    'source[src]', 'video[src]', 'audio[src]',
  ];

  for (const sel of selectors) {
    doc.querySelectorAll(sel).forEach(el => {
      const attr = el.hasAttribute('src') ? 'src'
        : el.hasAttribute('href') ? 'href'
        : el.hasAttribute('data') ? 'data'
        : null;
      if (!attr) return;

      const url = el.getAttribute(attr);
      if (!url) return;

      // Skip data URIs, blob URIs, javascript:, and same-origin
      if (/^(data:|blob:|javascript:|#)/i.test(url)) return;

      let resourceHost = '';
      try { resourceHost = new URL(url, pageUrl).hostname.replace(/^www\./, ''); } catch { return; }

      // Skip same-origin resources
      if (resourceHost === pageHost) return;

      const classification = classifyUrl(url);
      if (classification.category === 'clean') return;

      result[classification.category === 'tracker' ? 'trackers'
        : classification.category === 'social' ? 'social'
        : classification.category === 'mining' ? 'mining'
        : 'ads'
      ].push(el);

      result.totalBlocked++;
      // Estimate ~50KB per blocked resource for stats
      result.dataSaved += 51200;
    });
  }

  // Also detect inline tracker scripts (e.g., GA inline snippets)
  doc.querySelectorAll('script:not([src])').forEach(el => {
    const text = el.textContent || '';
    if (
      /google-analytics\.com\/analytics\.js/i.test(text) ||
      /googletagmanager\.com\/gtag/i.test(text) ||
      /ga\(['"]create['"]/i.test(text) ||
      /gtag\(['"]config['"]/i.test(text) ||
      /_gaq\.push/i.test(text) ||
      /fbq\(['"]track/i.test(text) ||
      /hotjar\.com/i.test(text) ||
      /mixpanel\.com/i.test(text) ||
      /newrelic\.com/i.test(text)
    ) {
      result.trackers.push(el);
      result.totalBlocked++;
    }
  });

  return result;
}

/**
 * Remove classified elements from a document.
 * Replaces ad iframes/scripts with empty placeholders to prevent layout shift.
 *
 * @param {Document} doc
 * @param {{ ads: Element[], trackers: Element[], social: Element[], mining: Element[] }} scan
 */
export function applyBlocking(doc, scan) {
  const replaceWithPlaceholder = (el) => {
    // For iframes and embeds, replace with a small placeholder to avoid layout shift
    if (el.tagName === 'IFRAME' || el.tagName === 'EMBED' || el.tagName === 'OBJECT') {
      const placeholder = doc.createElement('div');
      placeholder.setAttribute('data-lithium-blocked', 'true');
      placeholder.style.cssText = 'display:none !important;';
      el.parentNode?.insertBefore(placeholder, el);
    }
    el.remove();
  };

  // Mining is always fully removed
  scan.mining.forEach(el => el.remove());

  // Ads: remove scripts and ad iframes
  scan.ads.forEach(el => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'IFRAME' || el.tagName === 'IMG') {
      replaceWithPlaceholder(el);
    } else {
      el.remove();
    }
  });

  // Trackers: remove all
  scan.trackers.forEach(el => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'IFRAME') {
      replaceWithPlaceholder(el);
    } else {
      el.remove();
    }
  });

  // Social widgets: remove (only if fanboy-social is enabled, which is handled by classifyUrl)
  scan.social.forEach(el => replaceWithPlaceholder(el));
}

// ── Cosmetic CSS injection ───────────────────────────────────────────────────

/**
 * Build a CSS string that hides common ad remnants, cookie banners,
 * and newsletter popups. Used in fullRenderer to inject into the srcdoc.
 *
 * @param {boolean} includeAnnoyance — include Fanboy-Annoyance rules
 * @returns {string}
 */
export function buildCosmeticCss(includeAnnoyance = true) {
  const rules = [
    // Cookie consent banners
    '#cookie-consent', '#cookie-banner', '#cookie-notice', '#cookieNotice',
    '#cookieConsent', '.cookie-consent', '.cookie-banner', '.cookie-notice',
    '.cookie-overlay', '.cookie-wall', '#onetrust-consent-sdk',
    '.optanon-wrapper', '#CybotCookiebotDialog', '.cc-banner', '.cc-window',
    '#gdpr-consent',
    // Newsletter popups
    '.newsletter-popup', '.newsletter-modal', '.subscribe-popup',
    '.subscribe-modal', '.email-subscription', '#newsletter-signup',
    // Ad containers
    '.ad-container', '.ad-wrapper', '.adsbygoogle', '[id^="google_ads_iframe"]',
    '.dfp-ad', '.ad-slot', '.ad-unit', '.advertisement', '[id^="div-gpt-ad"]',
    // Lithium-blocked placeholders
    '[data-lithium-blocked]',
  ];

  if (includeAnnoyance) {
    rules.push(
      // Social share popups
      '.social-share-popup', '.share-modal',
      // Push notification prompts
      '.push-notification-prompt', '#push-notification-prompt',
      // App install banners
      '.app-install-banner', '.smart-banner', '#smart-banner',
      // Survey/feedback overlays
      '.survey-overlay', '.feedback-popup', '.user-feedback-widget',
    );
  }

  return rules.map(sel => `${sel} { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; overflow: hidden !important; }`).join('\n');
}

// ── Remote filter list updates ───────────────────────────────────────────────

/** Remote URLs for each filter list (EasyList format). */
const REMOTE_URLS = {
  easylist: 'https://easylist-downloads.adblockplus.org/easylist.txt',
  easyprivacy: 'https://easylist-downloads.adblockplus.org/easyprivacy.txt',
  'fanboy-social': 'https://easylist-downloads.adblockplus.org/fanboy-social.txt',
  'fanboy-annoyance': 'https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt',
};

const CUSTOM_DOMAINS_KEY = 'lithium:filter-custom-domains';
const FILTER_UPDATE_KEY = 'lithium:filter-list-updates';

/**
 * Parse an Easylist-format text file and extract domain rules.
 * Lines like `||domain.com^` are domain blocks.
 * Lines starting with `!` or `[` are comments/metadata.
 * Lines starting with `@@` are exceptions (skipped).
 *
 * @param {string} text — raw filter list text
 * @returns {Set<string>} extracted domains
 */
export function parseFilterList(text) {
  const domains = new Set();
  if (!text || typeof text !== 'string') return domains;

  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    // Skip comments, metadata, empty lines, and exceptions
    if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('@@')) continue;

    // Match ||domain^ patterns
    const domainMatch = line.match(/^\|\|([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\^?/i);
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase().replace(/^www\./, '');
      // Only add if it looks like a valid domain (has at least one dot)
      if (domain.includes('.')) {
        domains.add(domain);
      }
    }
  }
  return domains;
}

/**
 * Fetch and merge a remote filter list into the local domain set.
 * Returns the number of new domains added.
 *
 * @param {string} listId — one of 'easylist', 'easyprivacy', 'fanboy-social', 'fanboy-annoyance'
 * @param {object} [options]
 * @param {string} [options.url] — override the default remote URL
 * @param {number} [options.timeout] — fetch timeout in ms (default 10000)
 * @returns {Promise<{ added: number, total: number, domains: Set<string> }>}
 */
export async function updateFilterList(listId, options = {}) {
  const list = FILTER_LISTS[listId];
  if (!list) throw new Error(`Unknown filter list: ${listId}`);

  const url = options.url || REMOTE_URLS[listId];
  if (!url) throw new Error(`No remote URL for filter list: ${listId}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const remoteDomains = parseFilterList(text);

    // Merge: add domains not already in the local set
    let added = 0;
    for (const domain of remoteDomains) {
      if (!list.domains.has(domain)) {
        list.domains.add(domain);
        added++;
      }
    }

    // Persist custom domains (domains fetched from remote that weren't in built-in set)
    persistCustomDomains(listId, remoteDomains);

    // Record update time
    recordUpdateTime(listId);

    return { added, total: list.domains.size, domains: remoteDomains };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Update all filter lists from their remote sources.
 * Returns a summary object with per-list results.
 */
export async function updateAllFilterLists() {
  const results = {};
  const promises = Object.keys(REMOTE_URLS).map(async (listId) => {
    try {
      results[listId] = await updateFilterList(listId);
    } catch (err) {
      results[listId] = { added: 0, total: FILTER_LISTS[listId]?.domains.size || 0, error: err.message };
    }
  });
  await Promise.all(promises);
  window.dispatchEvent(new CustomEvent('lithium:filter-lists-updated', { detail: results }));
  return results;
}

/** Persist fetched domains to localStorage so they survive reloads. */
function persistCustomDomains(listId, domains) {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_DOMAINS_KEY) || '{}');
    all[listId] = [...domains];
    localStorage.setItem(CUSTOM_DOMAINS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** Load previously fetched custom domains into the filter lists. */
function loadCustomDomains() {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_DOMAINS_KEY) || '{}');
    for (const [listId, domains] of Object.entries(all)) {
      if (FILTER_LISTS[listId] && Array.isArray(domains)) {
        for (const d of domains) FILTER_LISTS[listId].domains.add(d);
      }
    }
  } catch { /* ignore */ }
}

/** Record the timestamp of a filter list update. */
function recordUpdateTime(listId) {
  try {
    const times = JSON.parse(localStorage.getItem(FILTER_UPDATE_KEY) || '{}');
    times[listId] = Date.now();
    localStorage.setItem(FILTER_UPDATE_KEY, JSON.stringify(times));
  } catch { /* ignore */ }
}

/** Get the last update time for a filter list (or all lists). */
export function getLastUpdateTime(listId) {
  try {
    const times = JSON.parse(localStorage.getItem(FILTER_UPDATE_KEY) || '{}');
    if (listId) return times[listId] || 0;
    return times;
  } catch { return {}; }
}

/** Get the remote URL for a filter list. */
export function getRemoteUrl(listId) {
  return REMOTE_URLS[listId] || null;
}

// ── Init ─────────────────────────────────────────────────────────────────────

let _initialized = false;

/** Initialize the ad blocker engine. Called once on boot. */
export function initAdBlocker() {
  if (_initialized) return;
  _initialized = true;
  loadFilterListStates();
  loadCustomDomains();
}
