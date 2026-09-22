/**
 * App Settings Page Registry
 *
 * Parallel to extSettingsRegistry.js but for .li apps.  Apps call
 * `li.settings.registerPage(spec)` through the bridge; the runtime
 * invokes registerAppPage() here.  The Settings UI reads from
 * getAppPages() to build the "App Settings" section automatically.
 *
 * Pages are cleaned up when the owning app is closed / unmounted.
 */

/** @type {Map<string, { id: string, appId: string, title: string, icon: string, keywords: string[], render: Function|null, html: string, url: string, order: number }>} */
const pages = new Map();

/**
 * Register a settings page for a .li app.
 *
 * @param {string} appId   The app id that owns this page.
 * @param {object} spec    { id, title, icon, keywords, render, order }
 *   - `render(container, ctx)` is called with a DOM container and
 *     ctx = { settings, update } so the app can build its UI.
 */
export function registerAppPage(appId, spec) {
  if (!spec || typeof spec.id !== 'string' || typeof spec.render !== 'function') {
    throw new Error('appSettings.registerPage requires { id, render(container, ctx) }');
  }
  const key = `app:${appId}:${spec.id}`;
  pages.set(key, {
    id: spec.id,
    appId,
    title: typeof spec.title === 'string' ? spec.title : appId,
    icon: typeof spec.icon === 'string' ? spec.icon : 'Settings',
    keywords: Array.isArray(spec.keywords) ? spec.keywords : [],
    render: typeof spec.render === 'function' ? spec.render : null,
    html: typeof spec.html === 'string' ? spec.html : '',
    url: typeof spec.url === 'string' ? spec.url : '',
    order: typeof spec.order === 'number' ? spec.order : 100,
  });
  window.dispatchEvent(new CustomEvent('lithium:app-settings-pages-changed'));
}

/**
 * Unregister a single page by app id + page id.
 */
export function unregisterAppPage(appId, pageId) {
  const key = `app:${appId}:${pageId}`;
  if (pages.delete(key)) {
    window.dispatchEvent(new CustomEvent('lithium:app-settings-pages-changed'));
  }
}

/**
 * Remove all pages belonging to an app (called on close / unload).
 */
export function unregisterAllAppPages(appId) {
  let removed = false;
  for (const key of [...pages.keys()]) {
    if (pages.get(key)?.appId === appId) {
      pages.delete(key);
      removed = true;
    }
  }
  if (removed) {
    window.dispatchEvent(new CustomEvent('lithium:app-settings-pages-changed'));
  }
}

/**
 * Get all registered app settings pages, sorted by order then title.
 * @returns {Array<object>}
 */
export function getAppPages() {
  return [...pages.values()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Check whether a page key exists.
 */
export function hasAppPage(appId, pageId) {
  return pages.has(`app:${appId}:${pageId}`);
}
