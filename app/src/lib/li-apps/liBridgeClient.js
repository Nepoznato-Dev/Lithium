/**
 * Bridge client script injected into .li app iframes.
 *
 * This is a *string* of JavaScript (not a module) that gets embedded
 * into the iframe srcdoc so the app code can call `window.li.*`
 * methods.  Communication with the host uses postMessage + a
 * promise-based response map keyed by unique message IDs.
 *
 * The host can also push events via the `li:event` message type,
 * which are dispatched to callbacks registered through
 * `li.events.on()` or the convenience lifecycle/theme helpers.
 */
export const LI_BRIDGE_CLIENT = `
(function () {
  if (window.__liBridge) return;
  window.__liBridge = true;

  var pending = {};
  var seq = 0;
  var readyCbs = [];
  var bridgeReady = false;
  var listeners = {};

  function request(type, payload) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({
        source: 'li-app',
        id: id,
        type: type,
        payload: payload || {},
      }, '*');
      setTimeout(function () {
        if (pending[id]) {
          pending[id].reject(new Error('li bridge timeout: ' + type));
          delete pending[id];
        }
      }, 10000);
    });
  }

  function dispatch(name, data) {
    var cbs = listeners[name];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](data); } catch (e) { console.error('[li] event handler error:', e); }
    }
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.source !== 'li-host') return;

    if (d.type === 'li:ready') {
      bridgeReady = true;
      for (var i = 0; i < readyCbs.length; i++) readyCbs[i]();
      readyCbs.length = 0;
      return;
    }

    if (d.type === 'li:event') {
      dispatch(d.event, d.data);
      return;
    }

    if (d.type === 'li:response') {
      var cb = pending[d.id];
      if (!cb) return;
      delete pending[d.id];
      if (d.error) cb.reject(new Error(d.error));
      else cb.resolve(d.result);
    }
  });

  window.li = {
    /* ---- Events ---- */
    events: {
      on: function (e, cb) {
        (listeners[e] = listeners[e] || []).push(cb);
        return request('li:events-subscribe', { event: e });
      },
      once: function (e, cb) {
        function wrapped(d) { cb(d); window.li.events.off(e, wrapped); }
        return window.li.events.on(e, wrapped);
      },
      off: function (e, cb) {
        var a = listeners[e];
        if (!a) return;
        listeners[e] = cb ? a.filter(function (f) { return f !== cb; }) : [];
      },
    },

    /* ---- Storage ---- */
    storage: {
      get: function (k) { return request('li:storage-get', { key: k }); },
      set: function (k, v) { return request('li:storage-set', { key: k, value: v }); },
      remove: function (k) { return request('li:storage-remove', { key: k }); },
      has: function (k) { return request('li:storage-has', { key: k }); },
      clear: function () { return request('li:storage-clear'); },
      keys: function () { return request('li:storage-keys'); },
      size: function () { return request('li:storage-size'); },
      getAll: function () { return request('li:storage-get-all'); },
      setAll: function (v) { return request('li:storage-set-all', { values: v }); },
      namespace: function (n) {
        var p = n + ':';
        return {
          get: function (k) { return window.li.storage.get(p + k); },
          set: function (k, v) { return window.li.storage.set(p + k, v); },
          remove: function (k) { return window.li.storage.remove(p + k); },
          has: function (k) { return window.li.storage.has(p + k); },
          clear: function () { return window.li.storage.clear(); },
          keys: function () { return window.li.storage.keys(); },
          size: function () { return window.li.storage.size(); },
        };
      },
    },

    /* ---- App information ---- */
    app: {
      getInfo: function () { return request('li:app-info'); },
      getId: function () { return request('li:app-id'); },
      getName: function () { return request('li:app-name'); },
      getVersion: function () { return request('li:app-version'); },
      getManifest: function () { return request('li:app-manifest'); },
      setTitle: function (t) { return request('li:app-set-title', { title: t }); },
      setIcon: function (i) { return request('li:app-set-icon', { icon: i }); },
      setBadge: function (c) { return request('li:app-set-badge', { count: c }); },
      clearBadge: function () { return request('li:app-clear-badge'); },
    },

    /* ---- Lifecycle ---- */
    lifecycle: {
      onReady: function (cb) { if (bridgeReady) cb(); else readyCbs.push(cb); },
      onFocus: function (cb) { return window.li.events.on('lifecycle.focus', cb); },
      onBlur: function (cb) { return window.li.events.on('lifecycle.blur', cb); },
      onClose: function (cb) { return window.li.events.on('lifecycle.close', cb); },
      onVisibilityChange: function (cb) { return window.li.events.on('lifecycle.visibility', cb); },
      isActive: function () { return document.hasFocus(); },
      isVisible: function () { return document.visibilityState === 'visible'; },
      close: function () { return request('li:lifecycle-close'); },
      reload: function () { return request('li:lifecycle-reload'); },
    },

    /* ---- Theme ---- */
    theme: {
      get: function () { return request('li:theme-get'); },
      set: function (t) { return request('li:theme-set', { theme: t }); },
      getMode: function () { return request('li:theme-get-mode'); },
      setMode: function (m) { return request('li:theme-set-mode', { mode: m }); },
      getColors: function () { return request('li:theme-get-colors'); },
      onChange: function (cb) { return window.li.events.on('theme.changed', cb); },
    },

    /* ---- Device ---- */
    device: {
      getInfo: function () { return request('li:device-info'); },
      getBattery: function () { return request('li:device-battery'); },
      getNetwork: function () { return request('li:device-network'); },
      getScreen: function () { return request('li:device-screen'); },
      getLocale: function () { return request('li:device-locale'); },
      getTimezone: function () { return request('li:device-timezone'); },
      getPlatform: function () { return request('li:device-platform'); },
      isMobile: function () { return request('li:device-is-mobile'); },
      isDesktop: function () { return request('li:device-is-desktop'); },
    },

    /* ---- Platform ---- */
    platform: {
      getInfo: function () { return request('li:platform-info'); },
      getVersion: function () { return request('li:platform-version'); },
      getAPIVersion: function () { return request('li:platform-api-version'); },
    },

    /* ---- Clipboard ---- */
    clipboard: {
      readText: function () { return request('li:clipboard-read'); },
      writeText: function (t) { return request('li:clipboard-write', { text: t }); },
      clear: function () { return request('li:clipboard-write', { text: '' }); },
    },

    /* ---- UI Dialogs ---- */
    ui: {
      alert: function (o) { return request('li:ui-alert', o || {}); },
      confirm: function (o) { return request('li:ui-confirm', o || {}); },
      prompt: function (o) { return request('li:ui-prompt', o || {}); },
      toast: function (o) { return request('li:ui-toast', o || {}); },
    },

    /* ---- Network ---- */
    network: {
      fetch: function (u, o) { return request('li:network-fetch', { url: u, options: o }); },
      isOnline: function () { return request('li:network-online'); },
      getStatus: function () { return request('li:network-status'); },
      onChange: function (cb) { return window.li.events.on('network.changed', cb); },
    },

    /* ---- Capabilities ---- */
    capabilities: {
      get: function () { return request('li:capabilities-get'); },
      has: function (n) { return request('li:capabilities-has', { name: n }); },
    },

    /* ---- Permissions ---- */
    permissions: {
      get: function (n) { return request('li:permissions-get', { name: n }); },
      request: function (n) { return request('li:permissions-request', { name: n }); },
      getAll: function () { return request('li:permissions-get-all'); },
    },

    /* ---- Notifications (extended) ---- */
    notifications: {
      send: function (o) { return request('li:notify-send', o || {}); },
      cancel: function (id) { return request('li:notify-cancel', { id: id }); },
      cancelAll: function () { return request('li:notify-cancel-all'); },
      getAll: function () { return request('li:notify-get-all'); },
      onClick: function (cb) { return window.li.events.on('notification.click', cb); },
    },

    /* ---- Filesystem ---- */
    files: {
      read: function (p) { return request('li:files-read', { path: p }); },
      write: function (p, d, t) { return request('li:files-write', { path: p, data: d, type: t }); },
      exists: function (p) { return request('li:files-exists', { path: p }); },
      stat: function (p) { return request('li:files-stat', { path: p }); },
      list: function (p) { return request('li:files-list', { path: p }); },
      delete: function (p) { return request('li:files-delete', { path: p }); },
      mkdir: function (p) { return request('li:files-mkdir', { path: p }); },
      copy: function (s, d) { return request('li:files-copy', { source: s, destination: d }); },
      move: function (s, d) { return request('li:files-move', { source: s, destination: d }); },
      pick: function (o) { return request('li:files-pick', o || {}); },
      save: function (o) { return request('li:files-save', o || {}); },
      watch: function (p, cb) { return window.li.events.on('file.changed', cb); },
    },

    /* ---- Inter-app communication ---- */
    apps: {
      list: function () { return request('li:apps-list'); },
      get: function (id) { return request('li:apps-get', { appId: id }); },
      open: function (id, o) { return request('li:apps-open', { appId: id, options: o }); },
      close: function (id) { return request('li:apps-close', { appId: id }); },
      send: function (id, msg) { return request('li:apps-send', { appId: id, message: msg }); },
      broadcast: function (msg) { return request('li:apps-broadcast', { message: msg }); },
      onMessage: function (cb) { return window.li.events.on('app.message', cb); },
      onLaunch: function (cb) { return window.li.events.on('app.launch', cb); },
      onClose: function (cb) { return window.li.events.on('app.close', cb); },
    },

    /* ---- Navigation ---- */
    navigation: {
      openURL: function (u) { return request('li:navigation-open-url', { url: u }); },
      openApp: function (id) { return request('li:navigation-open-app', { appId: id }); },
      reload: function () { return request('li:navigation-reload'); },
    },

    /* ---- Sharing ---- */
    share: {
      open: function (o) { return request('li:share-open', o || {}); },
      canShare: function () { return request('li:share-can-share'); },
    },

    /* ---- Backward-compatible top-level aliases ---- */
    notify: function (title, body) {
      return request('li:notify', { title: title, body: body });
    },
    getSettings: function () {
      return request('li:get-settings');
    },
    getTheme: function () {
      return request('li:theme-get');
    },
    setTitle: function (title) {
      return request('li:set-title', { title: title });
    },
    savePhoto: function (filename, dataUrl) {
      return request('li:save-photo', { filename: filename, dataUrl: dataUrl });
    },
    onReady: function (cb) {
      if (bridgeReady) cb();
      else readyCbs.push(cb);
    },
  };
})();
`;
