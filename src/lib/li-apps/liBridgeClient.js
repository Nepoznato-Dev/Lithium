/**
 * Bridge client script injected into .li app iframes.
 *
 * This is a *string* of JavaScript (not a module) that gets embedded
 * into the iframe srcdoc so the app code can call `window.li.*`
 * methods.  Communication with the host uses postMessage + a
 * promise-based response map keyed by unique message IDs.
 */
export const LI_BRIDGE_CLIENT = `
(function () {
  if (window.__liBridge) return;
  window.__liBridge = true;

  var pending = {};
  var seq = 0;
  var readyCbs = [];
  var bridgeReady = false;

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
      // Timeout after 10 s to avoid dangling promises.
      setTimeout(function () {
        if (pending[id]) {
          pending[id].reject(new Error('li bridge timeout: ' + type));
          delete pending[id];
        }
      }, 10000);
    });
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
    if (d.type === 'li:response') {
      var cb = pending[d.id];
      if (!cb) return;
      delete pending[d.id];
      if (d.error) cb.reject(new Error(d.error));
      else cb.resolve(d.result);
    }
  });

  window.li = {
    storage: {
      get: function (key) { return request('li:storage-get', { key: key }); },
      set: function (key, value) { return request('li:storage-set', { key: key, value: value }); },
    },
    notify: function (title, body) { return request('li:notify', { title: title, body: body }); },
    getSettings: function () { return request('li:get-settings'); },
    getTheme: function () { return request('li:get-theme'); },
    setTitle: function (title) { return request('li:set-title', { title: title }); },
    savePhoto: function (filename, dataUrl) { return request('li:save-photo', { filename: filename, dataUrl: dataUrl }); },
    onReady: function (cb) {
      if (bridgeReady) cb();
      else readyCbs.push(cb);
    },
  };
})();
`;
