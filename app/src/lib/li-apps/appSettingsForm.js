/**
 * SettingsForm helper for .li apps.
 *
 * Apps that register settings pages can use this module to generate
 * ready-to-use HTML for common settings controls.  The generated HTML
 * includes the bridge script so `li.settings.get/set` work out of the box.
 *
 * Usage (inside an app's index.html or registration code):
 *
 *   import { buildSettingsHtml } from '/src/lib/li-apps/appSettingsForm.js';
 *
 *   li.settings.registerPage({
 *     id: 'general',
 *     title: 'My App Settings',
 *     icon: 'Settings',
 *     html: buildSettingsHtml('my-app', [
 *       { type: 'toggle', key: 'my-app.darkMode', label: 'Dark mode', description: 'Use dark theme' },
 *       { type: 'slider', key: 'my-app.volume', label: 'Volume', min: 0, max: 100 },
 *       { type: 'text', key: 'my-app.name', label: 'Display name' },
 *       { type: 'select', key: 'my-app.sortBy', label: 'Sort by', options: ['name', 'date', 'size'] },
 *     ]),
 *   });
 */

/**
 * Build a complete settings HTML page for an app.
 *
 * @param {string} appId     The app's identifier (used for namespacing).
 * @param {Array}  fields    Array of field descriptors.
 * @param {string} [title]   Optional page title.
 * @returns {string}         Complete HTML string.
 */
export function buildSettingsHtml(appId, fields, title) {
  const heading = title || `${appId} Settings`;
  const rowsHtml = fields.map(f => buildFieldHtml(f, appId)).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    color: #e2e8f0;
    background: transparent;
    padding: 16px;
    font-size: 13px;
    line-height: 1.5;
  }
  h2 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #f1f5f9;
  }
  .card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    padding: 4px 0;
    margin-bottom: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    gap: 12px;
  }
  .row + .row { border-top: 1px solid rgba(255,255,255,0.04); }
  .row-info { flex: 1; min-width: 0; }
  .row-title { font-weight: 500; font-size: 13px; }
  .row-desc { font-size: 11px; opacity: 0.5; margin-top: 2px; }
  .row-control { flex-shrink: 0; }

  /* Toggle */
  .toggle {
    width: 38px; height: 20px;
    background: rgba(255,255,255,0.1);
    border-radius: 10px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
    border: none;
    padding: 0;
  }
  .toggle::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #94a3b8;
    transition: transform 0.2s, background 0.2s;
  }
  .toggle.on { background: rgba(6,182,212,0.3); }
  .toggle.on::after { transform: translateX(18px); background: #06b6d4; }

  /* Slider */
  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.1);
    outline: none;
    width: 120px;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #06b6d4;
    cursor: pointer;
  }

  /* Text input */
  input[type=text] {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 5px 8px;
    color: #e2e8f0;
    font-size: 12px;
    width: 140px;
    outline: none;
  }
  input[type=text]:focus { border-color: rgba(6,182,212,0.4); }

  /* Select */
  select {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 5px 8px;
    color: #e2e8f0;
    font-size: 12px;
    outline: none;
    cursor: pointer;
  }
  select:focus { border-color: rgba(6,182,212,0.4); }

  .val-label {
    font-size: 11px;
    opacity: 0.5;
    min-width: 28px;
    text-align: right;
    display: inline-block;
  }
  .slider-wrap { display: flex; align-items: center; gap: 6px; }
</style>
</head>
<body>
  <h2>${escapeHtml(heading)}</h2>
  <div class="card">
    ${rowsHtml}
  </div>

  <script>
  (function(){
    // Bridge to parent Settings host
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
    var li = {
      get: function(k) { return req('li:settings-get', { key: k }); },
      set: function(k, v) { return req('li:settings-set', { key: k, value: v }); },
    };

    // Initialize all controls from stored values
    var controls = document.querySelectorAll('[data-key]');
    controls.forEach(function(el) {
      var key = el.dataset.key;
      var type = el.dataset.type;
      li.get(key).then(function(val) {
        if (val === undefined || val === null) return;
        if (type === 'toggle') {
          el.classList.toggle('on', !!val);
        } else if (type === 'slider') {
          el.value = val;
          var lbl = el.parentElement.querySelector('.val-label');
          if (lbl) lbl.textContent = val;
        } else if (type === 'text') {
          el.value = val;
        } else if (type === 'select') {
          el.value = val;
        }
      });
    });

    // Bind events
    document.querySelectorAll('.toggle[data-key]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.classList.toggle('on');
        li.set(btn.dataset.key, btn.classList.contains('on'));
      });
    });
    document.querySelectorAll('input[type=range][data-key]').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var lbl = inp.parentElement.querySelector('.val-label');
        if (lbl) lbl.textContent = inp.value;
        li.set(inp.dataset.key, Number(inp.value));
      });
    });
    document.querySelectorAll('input[type=text][data-key]').forEach(function(inp) {
      var timer;
      inp.addEventListener('input', function() {
        clearTimeout(timer);
        timer = setTimeout(function() { li.set(inp.dataset.key, inp.value); }, 400);
      });
    });
    document.querySelectorAll('select[data-key]').forEach(function(sel) {
      sel.addEventListener('change', function() { li.set(sel.dataset.key, sel.value); });
    });
  })();
  </script>
</body>
</html>`;
}

/* ---- internal helpers ---- */

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildFieldHtml(field, appId) {
  const key = field.key || `${appId}.${field.id}`;
  const label = escapeHtml(field.label || field.id || key);
  const desc = field.description ? `<div class="row-desc">${escapeHtml(field.description)}</div>` : '';

  let control = '';
  switch (field.type) {
    case 'toggle':
      control = `<button class="toggle" data-key="${key}" data-type="toggle" type="button"></button>`;
      break;
    case 'slider': {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const def = field.default ?? Math.round((min + max) / 2);
      control = `<div class="slider-wrap"><input type="range" min="${min}" max="${max}" value="${def}" data-key="${key}" data-type="slider"><span class="val-label">${def}</span></div>`;
      break;
    }
    case 'text':
      control = `<input type="text" data-key="${key}" data-type="text" placeholder="${escapeHtml(field.placeholder || '')}">`;
      break;
    case 'select': {
      const opts = (field.options || []).map(o => {
        const val = typeof o === 'string' ? o : o.value;
        const lbl = typeof o === 'string' ? o : (o.label || o.value);
        return `<option value="${escapeHtml(val)}">${escapeHtml(lbl)}</option>`;
      }).join('');
      control = `<select data-key="${key}" data-type="select">${opts}</select>`;
      break;
    }
    default:
      control = `<span style="opacity:0.3">unknown type</span>`;
  }

  return `<div class="row">
  <div class="row-info"><div class="row-title">${label}</div>${desc}</div>
  <div class="row-control">${control}</div>
</div>`;
}
