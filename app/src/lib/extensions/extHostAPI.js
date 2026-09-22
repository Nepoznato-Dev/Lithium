/**
 * Extension Host API
 *
 * Builds the `li` object that is passed to each extension's `init(li)` call.
 * The API surface is gated by the extension's approved permissions: namespaces
 * the extension does not hold permission for are stripped from the returned
 * object, so extension code simply cannot call them.
 *
 * Because extensions run unsandboxed (direct JS injection), this module is the
 * *only* bridge between extension code and Lithium internals. Extensions should
 * never reach into the DOM or import host modules directly.
 */

import { storage } from '../storage';
import { loadSettings, saveSettings, applySettings, setAtPath, BUILD_VERSION } from '../settings';
import { notify, dismissNotification, clearHistory } from '../desktop/notify';
import {
  registerPage as regPage,
  unregisterPage as unregPage,
} from './extSettingsRegistry';
import {
  harden,
  assertEmittable,
  isSettingsPathAllowed,
  initSecurityGuards,
  registerProviderApi,
  unregisterProviderApi,
  unregisterAllProviderApis,
  getProviderApisForExtension,
} from './extSecurity';
import { ContextMenuRegistry } from '../desktop/contextMenuRegistry';

/* ------------------------------------------------------------------ */
/*  Permission-gated API builder                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the full (ungated) API, then strip namespaces the extension
 * does not hold approved permissions for.
 *
 * @param {object} extManifest  Validated extension manifest with _approvedPermissions.
 * @returns {object}            The `li` object to pass to the extension's init().
 */
export function buildExtensionAPI(extManifest) {
  const perms = extManifest._approvedPermissions || [];
  const extId = extManifest.id;

  // Make sure the runtime download/activation guards are active.
  initSecurityGuards();

  /* ── Always available ──────────────────────────────────────────── */

  const api = {
    platform: {
      getVersion() { return BUILD_VERSION; },
      getExtensionId() { return extId; },
      getAPIVersion() { return 1; },
    },

    /* ── events (permission: 'events') ──────────────────────────── */
    events: {
      on(event, cb) {
        if (typeof cb !== 'function') return;
        const handler = e => cb(e.detail ?? e);
        window.addEventListener(event, handler);
        // Store for cleanup
        if (!api._listeners) api._listeners = [];
        api._listeners.push({ event, handler });
      },
      off(event, cb) {
        if (!api._listeners) return;
        const idx = api._listeners.findIndex(l => l.event === event && l.handler === cb);
        if (idx >= 0) {
          window.removeEventListener(event, cb);
          api._listeners.splice(idx, 1);
        }
      },
      emit(event, data) {
        // RULE E — extensions may only fire their own namespaced events; the
        // privileged lithium:* / li:* channel is reserved for the host.
        assertEmittable(event, extId);
        window.dispatchEvent(new CustomEvent(event, { detail: data }));
      },
    },

    /* ── storage (always available, namespaced) ─────────────────── */
    storage: {
      get(key, fallback) {
        return storage.get(`ext:${extId}:${key}`, fallback);
      },
      set(key, value) {
        storage.set(`ext:${extId}:${key}`, value);
      },
      remove(key) {
        storage.remove(`ext:${extId}:${key}`);
      },
      has(key) {
        return storage.get(`ext:${extId}:${key}`, undefined) !== undefined;
      },
      keys() {
        // The storage wrapper prefixes keys with 'lithium:'
        const prefix = `lithium:ext:${extId}:`;
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefix)) result.push(k.slice(prefix.length));
        }
        return result;
      },
      clear() {
        const prefix = `lithium:ext:${extId}:`;
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefix)) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
      },
    },

    /* ── settings (permission: 'settings-page') ─────────────────── */
    settings: {
      registerPage(spec) {
        regPage(extId, spec);
      },
      unregisterPage(pageId) {
        unregPage(extId, pageId);
      },
      getSetting(path) {
        const s = loadSettings();
        return path.split('.').reduce((obj, key) => obj?.[key], s);
      },
      setSetting(path, value) {
        // RULE E — a generic settings write is confined to the extension's own
        // subtree; core settings change only via the vetted namespaced APIs.
        if (!isSettingsPathAllowed(extId, path)) {
          throw new Error(
            `setSetting blocked: extensions may only write under "extensions.${extId}.*"`,
          );
        }
        const s = loadSettings();
        const updated = setAtPath(s, path, value);
        saveSettings(updated);
        applySettings(updated);
        window.dispatchEvent(new CustomEvent('lithium:settings-changed', { detail: updated }));
      },
    },

    /* ── background (permission: 'background') ──────────────────── */
    background: {
      set(config) {
        const s = loadSettings();
        const wall = s.customization?.wallpaper || {};
        const merged = { ...wall, ...config, enabled: true };
        const updated = setAtPath(s, 'customization.wallpaper', merged);
        saveSettings(updated);
        applySettings(updated);
        window.dispatchEvent(new CustomEvent('lithium:settings-changed', { detail: updated }));
      },
      get() {
        const s = loadSettings();
        return s.customization?.wallpaper || null;
      },
      reset() {
        const s = loadSettings();
        const defaults = {
          enabled: true, type: 'color', path: null, url: null,
          backgroundColor: '#0f1117',
          gradient: 'linear-gradient(135deg, #0f1117, #1e1b4b)',
          blur: 0, brightness: 1, contrast: 1, opacity: 1,
        };
        const updated = setAtPath(s, 'customization.wallpaper', defaults);
        saveSettings(updated);
        applySettings(updated);
        window.dispatchEvent(new CustomEvent('lithium:settings-changed', { detail: updated }));
      },
    },

    /* ── theme (permission: 'theme') ────────────────────────────── */
    theme: {
      get() {
        const s = loadSettings();
        return { ...s.theme };
      },
      setAccent(color) {
        const s = loadSettings();
        const updated = setAtPath(s, 'theme.accent', color);
        saveSettings(updated);
        applySettings(updated);
        window.dispatchEvent(new CustomEvent('lithium:settings-changed', { detail: updated }));
      },
      setMode(mode) {
        const s = loadSettings();
        const updated = setAtPath(s, 'theme.mode', mode);
        saveSettings(updated);
        applySettings(updated);
        window.dispatchEvent(new CustomEvent('lithium:settings-changed', { detail: updated }));
      },
      setTransparency(bool) {
        const s = loadSettings();
        const updated = setAtPath(s, 'theme.transparency', bool);
        saveSettings(updated);
        applySettings(updated);
        window.dispatchEvent(new CustomEvent('lithium:settings-changed', { detail: updated }));
      },
    },

    /* ── apps (permission: 'apps') ──────────────────────────────── */
    apps: {
      register(manifest, html) {
        // Dispatch event for useDesktopState / liDynamicApps integration
        window.dispatchEvent(new CustomEvent('lithium:ext-register-app', {
          detail: { extId, manifest, html },
        }));
      },
      unregister(appId) {
        window.dispatchEvent(new CustomEvent('lithium:ext-unregister-app', {
          detail: { extId, appId },
        }));
      },
      list() {
        // Return registered .li app ids (static + dynamic) via custom event roundtrip
        const result = [];
        const handler = e => { if (e.detail?.extId === extId) result.push(...(e.detail.apps || [])); };
        window.addEventListener('lithium:ext-list-apps-response', handler, { once: true });
        window.dispatchEvent(new CustomEvent('lithium:ext-list-apps', { detail: { extId } }));
        return result;
      },
      open(appId) {
        window.dispatchEvent(new CustomEvent('lithium:li-open-app', { detail: { appId } }));
      },
      close(appId) {
        window.dispatchEvent(new CustomEvent('lithium:li-close-app', { detail: { appId } }));
      },
    },

    /* ── notifications (permission: 'notifications') ────────────── */
    notifications: {
      send({ title, body, tone } = {}) {
        return notify({
          title: title || 'Extension',
          body: body || '',
          tone: tone || 'info',
        });
      },
      cancel(id) { dismissNotification(id); },
      cancelAll() { clearHistory(); },
    },

    /* ── desktop (permission: 'desktop-modify') ─────────────────── */
    desktop: {
      addIcon({ appId, position } = {}) {
        window.dispatchEvent(new CustomEvent('lithium:ext-add-desktop-icon', {
          detail: { extId, appId, position },
        }));
      },
      removeIcon(appId) {
        window.dispatchEvent(new CustomEvent('lithium:ext-remove-desktop-icon', {
          detail: { extId, appId },
        }));
      },
      refreshDesktop() {
        window.dispatchEvent(new CustomEvent('lithium:ext-refresh-desktop'));
      },
    },

    /* ── css (permission: 'custom-css') ─────────────────────────── */
    css: {
      inject(id, cssString) {
        const styleId = `lithium-ext-css-${extId}-${id}`;
        let el = document.getElementById(styleId);
        if (!el) {
          el = document.createElement('style');
          el.id = styleId;
          el.dataset.lithiumExtension = extId;
          document.head.appendChild(el);
        }
        el.textContent = cssString;
      },
      remove(id) {
        const styleId = `lithium-ext-css-${extId}-${id}`;
        const el = document.getElementById(styleId);
        if (el) el.remove();
      },
      removeAll() {
        document.querySelectorAll(`style[data-lithium-extension="${extId}"]`).forEach(el => el.remove());
      },
    },

    /* ── contextMenu (permission: 'context-menu') ────────────────
       Register items into the system context menu, or override the
       default menu for a scope entirely. Items dispatched via events
       the extension can listen for. */
    contextMenu: {
      /**
       * Register a context menu entry.
       *
       * @param {object} spec
       * @param {string} spec.id          Unique entry id within this extension.
       * @param {string|string[]} spec.scope  Scope(s): 'desktop','taskbar','pinned-app','window','file-entry','file-empty','file-multi'.
       * @param {string} spec.label       Display label.
       * @param {string} [spec.icon]      Lucide icon name.
       * @param {string} [spec.iconFile]  PNG icon from /icons/.
       * @param {string} [spec.shortcut]  Keyboard shortcut hint text.
       * @param {boolean} [spec.danger]   Danger styling.
       * @param {number} [spec.order]     Sort weight (lower = earlier).
       * @param {string} [spec.group]     Group name for separator insertion.
       * @param {object[]} [spec.items]   Static submenu items.
       * @param {string} [spec.action]    Action id dispatched on click.
       */
      register(spec) {
        if (!spec || !spec.id) throw new Error('contextMenu.register() requires an id');
        const fullId = `ext:${extId}:${spec.id}`;
        ContextMenuRegistry.register({
          ...spec,
          id: fullId,
          action: spec.action || spec.id,
          source: { type: 'extension', id: extId },
        });
        return fullId;
      },

      /**
       * Register multiple entries at once.
       * @param {object[]} specs
       * @returns {string[]} Registered full ids.
       */
      registerMany(specs) {
        if (!Array.isArray(specs)) return [];
        return specs.map(spec => api.contextMenu.register(spec));
      },

      /**
       * Remove a previously registered entry.
       * @param {string} id  The short id (without ext: prefix).
       */
      unregister(id) {
        ContextMenuRegistry.unregister(`ext:${extId}:${id}`);
      },

      /**
       * Remove all entries registered by this extension.
       */
      unregisterAll() {
        ContextMenuRegistry.unregisterAll('extension', extId);
      },

      /**
       * Set a user override for a scope, completely replacing the
       * default menu with the provided items.
       *
       * @param {string} scope  Scope name.
       * @param {object[]} items  Array of MenuItem objects.
       */
      setOverride(scope, items) {
        ContextMenuRegistry.setOverride(scope, {
          id: `ext:${extId}:override:${scope}`,
          items: items || [],
          source: { type: 'extension', id: extId },
        });
      },

      /**
       * Remove the override for a scope.
       * @param {string} scope
       */
      removeOverride(scope) {
        const override = ContextMenuRegistry.getOverride(scope);
        if (override?.source?.type === 'extension' && override?.source?.id === extId) {
          ContextMenuRegistry.removeOverride(scope);
        }
      },

      /**
       * List all scopes and their current registration counts.
       * @returns {object[]}
       */
      listScopes() {
        return ContextMenuRegistry.scopes().map(scope => ({
          scope,
          entries: ContextMenuRegistry.entriesForScope(scope).length,
          hasOverride: ContextMenuRegistry.hasOverride(scope),
        }));
      },

      /**
       * Check whether a scope has an active override.
       * @param {string} scope
       * @returns {boolean}
       */
      hasOverride(scope) {
        return ContextMenuRegistry.hasOverride(scope);
      },
    },

    /* ── appApi (permission: 'provide-api') ───────────────────────
       Expose endpoints .li apps can call. Handlers are stored host-side
       only; apps reach them indirectly through extSecurity's dispatcher,
       which enforces per-app grants and data-only serialization. */
    appApi: {
      register(name, spec = {}) {
        const handler = typeof spec === 'function' ? spec : spec.handler;
        const description = typeof spec === 'function' ? '' : spec.description;
        const isPublic = typeof spec === 'function' ? true : spec.public !== false;
        registerProviderApi(extId, name, { handler, description, public: isPublic });
      },
      unregister(name) {
        unregisterProviderApi(extId, name);
      },
      list() {
        return getProviderApisForExtension(extId);
      },
    },
  };

  /* ── Permission gating ──────────────────────────────────────────── */
  const PERMISSION_NAMESPACES = {
    events: 'events',
    settings: 'settings-page',
    background: 'background',
    theme: 'theme',
    apps: 'apps',
    notifications: 'notifications',
    desktop: 'desktop-modify',
    css: 'custom-css',
    appApi: 'provide-api',
    contextMenu: 'context-menu',
  };

  for (const [ns, perm] of Object.entries(PERMISSION_NAMESPACES)) {
    if (!perms.includes(perm)) {
      delete api[ns];
    }
  }

  // Track for cleanup on unload
  api._cleanup = () => {
    // Remove event listeners
    if (api._listeners) {
      for (const { event, handler } of api._listeners) {
        window.removeEventListener(event, handler);
      }
      api._listeners = [];
    }
    // Remove injected CSS
    if (api.css) api.css.removeAll();
    // Revoke any APIs this extension exposed to apps.
    unregisterAllProviderApis(extId);
    // Unregister any context menu entries this extension registered.
    ContextMenuRegistry.unregisterAll('extension', extId);
    // Remove any overrides this extension set.
    for (const scope of ContextMenuRegistry.scopes()) {
      const override = ContextMenuRegistry.getOverride(scope);
      if (override?.source?.type === 'extension' && override?.source?.id === extId) {
        ContextMenuRegistry.removeOverride(scope);
      }
    }
    // Unregister settings pages
    unregPage(extId);  // handled via unregisterAllPages in loader
  };

  // RULE E — deep-freeze the public surface so the extension cannot override
  // or monkey-patch a host method to intercept core behavior. _cleanup stays
  // writable (the loader relies on it) because harden() skips that key.
  return harden(api);
}
