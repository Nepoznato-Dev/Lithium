/**
 * searchSuggestions.js — Fetch search suggestions from engine APIs.
 *
 * Supports Google, DuckDuckGo, Bing, Wikipedia, and Brave suggestion endpoints.
 * Returns an array of suggestion strings for the omnibox dropdown.
 *
 * All fetches use a short timeout and fail silently — suggestions are
 * a nice-to-have, never critical.
 */

/** Suggestion API endpoints by engine id. */
const SUGGESTION_APIS = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`,
  wikipedia: (q) => `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=8&format=json`,
  brave: (q) => `https://search.brave.com/api/suggest?q=${encodeURIComponent(q)}`,
  ecosia: (q) => `https://ac.ecosia.org/autocomplete?q=${encodeURIComponent(q)}`,
  yahoo: (q) => `https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=sd1&command=${encodeURIComponent(q)}`,
  yandex: (q) => `https://suggest.yandex.com/suggest-ff.cgi?part=${encodeURIComponent(q)}`,
};

/** Default engines that have suggestion support. */
const DEFAULT_SUGGEST_ENGINES = ['google', 'duckduckgo', 'brave'];

/** Parse the JSONP/JSON response from various suggestion APIs. */
function parseSuggestions(json, _engineId) {
  try {
    // Most APIs return [query, [suggestions]] format
    if (Array.isArray(json) && json.length >= 2 && Array.isArray(json[1])) {
      return json[1].filter(s => typeof s === 'string').slice(0, 8);
    }
    // DuckDuckGo returns [{ phrase: '...' }, ...]
    if (Array.isArray(json) && json.length > 0 && json[0]?.phrase) {
      return json.map(item => item.phrase).slice(0, 8);
    }
    // Ecosia returns { suggestions: [...] } or similar
    if (json?.suggestions && Array.isArray(json.suggestions)) {
      return json.suggestions.map(s => typeof s === 'string' ? s : s?.text || s?.phrase || '').filter(Boolean).slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Fetch search suggestions for a query.
 *
 * @param {string} query — the partial search query
 * @param {string} engineId — the preferred engine to use for suggestions
 * @param {number} [timeout=2500] — fetch timeout in ms
 * @returns {Promise<string[]>} — array of suggestion strings
 */
export async function fetchSuggestions(query, engineId, timeout = 2500) {
  if (!query || query.length < 2) return [];

  // Build list of engines to try: preferred engine first, then fallbacks
  const enginesToTry = [engineId, ...DEFAULT_SUGGEST_ENGINES.filter(e => e !== engineId)];

  for (const eid of enginesToTry) {
    const buildUrl = SUGGESTION_APIS[eid];
    if (!buildUrl) continue;

    try {
      const url = buildUrl(query);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const json = await res.json();
      const suggestions = parseSuggestions(json, eid);
      if (suggestions.length > 0) return suggestions;
    } catch {
      // This engine failed, try the next one
      continue;
    }
  }

  return [];
}

/**
 * Create a debounced suggestion fetcher.
 * Returns a function that takes (query, engineId) and returns a promise.
 * Cancels previous in-flight requests when a new query arrives.
 */
export function createDebouncedSuggester(delay = 200) {
  let timer = null;
  let abortCurrent = null;

  return function suggest(query, engineId) {
    // Cancel pending request
    if (timer) clearTimeout(timer);
    if (abortCurrent) abortCurrent.abort();

    if (!query || query.length < 2) {
      return Promise.resolve([]);
    }

    return new Promise((resolve) => {
      const controller = new AbortController();
      abortCurrent = controller;

      timer = setTimeout(async () => {
        const results = await fetchSuggestions(query, engineId);
        if (!controller.signal.aborted) {
          resolve(results);
        } else {
          resolve([]);
        }
      }, delay);
    });
  };
}
