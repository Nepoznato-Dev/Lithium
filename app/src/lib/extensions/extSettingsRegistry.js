/**
 * Extension Settings Page Registry
 *
 * A shared in-memory store that extension code writes to (via
 * li.settings.registerPage) and the Settings UI reads from. When an
 * extension registers a settings page, it provides a `render(container, ctx)`
 * function that the Settings section body invokes on mount.
 *
 * Pages are automatically cleaned up when the owning extension is unloaded.
 */

/** @type {Map<string, { id: string, extId: string, title: string, icon: string, keywords: string[], render: Function }>} */
const pages = new Map();

/**
 * Register a settings page for an extension.
 *
 * @param {string} extId   The extension id that owns this page.
 * @param {object} spec    { id, title, icon, keywords, render }
 */
export function registerPage(extId, spec) {
  if (!spec || typeof spec.id !== 'string' || typeof spec.render !== 'function') {
    throw new Error('settings.registerPage requires { id, render(container, ctx) }');
  }
  const key = `${extId}:${spec.id}`;
  pages.set(key, {
    id: spec.id,
    extId,
    title: typeof spec.title === 'string' ? spec.title : 'Extension',
    icon: typeof spec.icon === 'string' ? spec.icon : 'Settings',
    keywords: Array.isArray(spec.keywords) ? spec.keywords : [],
    render: spec.render,
    order: typeof spec.order === 'number' ? spec.order : 100,
  });
  window.dispatchEvent(new CustomEvent('lithium:ext-settings-pages-changed'));
}

/**
 * Unregister a single page by extension id + page id.
 * @param {string} extId
 * @param {string} pageId
 */
export function unregisterPage(extId, pageId) {
  const key = `${extId}:${pageId}`;
  if (pages.delete(key)) {
    window.dispatchEvent(new CustomEvent('lithium:ext-settings-pages-changed'));
  }
}

/**
 * Remove all pages belonging to an extension (called on unload).
 * @param {string} extId
 */
export function unregisterAllPages(extId) {
  let removed = false;
  for (const key of [...pages.keys()]) {
    if (pages.get(key)?.extId === extId) {
      pages.delete(key);
      removed = true;
    }
  }
  if (removed) {
    window.dispatchEvent(new CustomEvent('lithium:ext-settings-pages-changed'));
  }
}

/**
 * Get all registered extension settings pages, sorted by order then title.
 * @returns {Array<object>}
 */
export function getExtensionPages() {
  return [...pages.values()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Check whether a page key exists.
 * @param {string} extId
 * @param {string} pageId
 * @returns {boolean}
 */
export function hasPage(extId, pageId) {
  return pages.has(`${extId}:${pageId}`);
}
