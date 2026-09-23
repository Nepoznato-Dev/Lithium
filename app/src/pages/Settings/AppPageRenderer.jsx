import { useMemo } from 'react';

/**
 * Renders an app-registered settings page.
 *
 * Apps provide either an `html` string or a `url`.  We render the
 * content in a sandboxed iframe so the app's settings UI is isolated
 * from the host.  The iframe gets a minimal inline script that lets
 * it read/write settings via postMessage back to the host (handled
 * by liRuntime's li:settings-get / li:settings-set handlers).
 */
export default function AppPageRenderer({ page }) {
  const srcDoc = useMemo(() => {
    if (page?.html) {
      return wrapHtml(page.html, page.appId);
    }
    if (page?.url) {
      // For URL-based pages we use an iframe src — but since the
      // Settings app is itself in a sandboxed context we inline a
      // redirect so the iframe loads the URL.
      return wrapHtml(
        `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><iframe src="${escapeAttr(page.url)}" style="width:100%;height:100%;border:none"></iframe></body></html>`,
        page.appId,
      );
    }
    return emptyPage(page?.title || 'Settings');
  }, [page]);

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-same-origin"
      title={`${page?.title || 'App'} settings`}
      style={{
        width: '100%',
        minHeight: 300,
        border: 'none',
        borderRadius: 8,
        background: 'transparent',
      }}
    />
  );
}

/* ---- helpers ---- */

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emptyPage(title) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: system-ui, sans-serif; color: #ccc; background: transparent; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .empty { text-align: center; opacity: 0.5; }
  </style></head><body><div class="empty"><p>${escapeAttr(title)} has no settings to configure.</p></div></body></html>`;
}

/**
 * Inject a tiny bridge script into the app's settings iframe so it
 * can call `parent.li.settings.get(key)` / `set(key, value)` to
 * read and write the host's settings.
 */
function wrapHtml(html, appId) {
  const bridge = `<script>
(function(){
  var pending = {}, seq = 0;
  window.addEventListener('message', function(ev) {
    var d = ev.data;
    if (!d || d.source !== 'li-settings-host') return;
    if (d.type === 'li:settings-response' && pending[d.id]) {
      pending[d.id](d.value);
      delete pending[d.id];
    }
  });
  function req(type, payload) {
    return new Promise(function(resolve) {
      var id = ++seq;
      pending[id] = resolve;
      parent.postMessage({ source: 'li-settings-app', appId: ${JSON.stringify(appId)}, id: id, type: type, payload: payload }, '*');
      setTimeout(function(){ if(pending[id]){pending[id](undefined);delete pending[id];} }, 5000);
    });
  }
  window.li = window.li || {};
  window.li.settings = {
    get: function(k) { return req('li:settings-get', { key: k }); },
    set: function(k, v) { return req('li:settings-set', { key: k, value: v }); },
  };
})();
</script>`;

  // Inject the bridge script before </head> or prepend to body.
  if (html.includes('</head>')) {
    return html.replace('</head>', bridge + '</head>');
  }
  return bridge + html;
}
