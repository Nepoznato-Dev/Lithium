import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon';
import { getDynamicApps, addDynamicApp, removeDynamicApp } from '../../../lib/li-apps/liDynamicApps';
import { LI_BRIDGE_CLIENT } from '../../../lib/li-apps/liBridgeClient';

const DEFAULT_MANIFEST = {
  id: '',
  name: 'My App',
  entry: 'index.html',
  icon: 'Sparkles',
  color: '#8b5cf6',
  category: 'tools',
  description: '',
  permissions: ['storage'],
};

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #1e1b4b, #312e81);
      color: #e0e7ff;
    }
    .card {
      text-align: center; padding: 2rem;
      background: rgba(255,255,255,0.08);
      border-radius: 16px; backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.12);
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { opacity: 0.7; font-size: 0.9rem; }
    button {
      margin-top: 1rem; padding: 0.5rem 1.2rem;
      background: #8b5cf6; color: white; border: none;
      border-radius: 8px; cursor: pointer; font-size: 0.9rem;
    }
    button:hover { background: #7c3aed; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello!</h1>
    <p>This is my custom Lithium app.</p>
    <button onclick="li.notify('Hi!', 'Bridge is working.')">Test Notification</button>
  </div>
</body>
</html>`;

const ICON_OPTIONS = [
  'Sparkles', 'Palette', 'Music', 'Gamepad2', 'Code', 'Terminal',
  'Globe', 'Calculator', 'Camera', 'Heart', 'Star', 'Zap',
  'Clock', 'FileText', 'PenTool', 'Wrench', 'Shield', 'Rocket',
];

const CATEGORY_OPTIONS = ['tools', 'productivity', 'media', 'system'];
const PERMISSION_OPTIONS = ['storage', 'notifications', 'photos'];

export default function AppStudioApp() {
  const [apps, setApps] = useState(() => getDynamicApps());
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('html'); // 'manifest' | 'html'
  const [manifestText, setManifestText] = useState(() => JSON.stringify(DEFAULT_MANIFEST, null, 2));
  const [htmlText, setHtmlText] = useState(() => DEFAULT_HTML);
  const [previewKey, setPreviewKey] = useState(0);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState('info'); // 'info' | 'error' | 'success'
  const previewRef = useRef(null);

  const refreshApps = useCallback(() => {
    setApps(getDynamicApps());
  }, []);

  // Load selected app into editors.
  const selectApp = useCallback((id) => {
    setSelectedId(id);
    if (!id) {
      setManifestText(JSON.stringify(DEFAULT_MANIFEST, null, 2));
      setHtmlText(DEFAULT_HTML);
      return;
    }
    const entry = getDynamicApps().find(a => a.manifest.id === id);
    if (entry) {
      setManifestText(JSON.stringify(entry.manifest, null, 2));
      setHtmlText(entry.html);
    }
  }, []);

  const showStatus = useCallback((msg, tone = 'info') => {
    setStatus(msg);
    setStatusTone(tone);
    setTimeout(() => setStatus(''), 4000);
  }, []);

  const handleNew = useCallback(() => {
    setSelectedId(null);
    setManifestText(JSON.stringify({ ...DEFAULT_MANIFEST, id: '' }, null, 2));
    setHtmlText(DEFAULT_HTML);
    setTab('manifest');
  }, []);

  const handleSave = useCallback(() => {
    try {
      const manifest = JSON.parse(manifestText);
      if (!manifest.id || !manifest.id.trim()) {
        showStatus('Manifest must have an "id" field', 'error');
        return;
      }
      addDynamicApp(manifest, htmlText);
      refreshApps();
      setSelectedId(manifest.id);
      showStatus(`App "${manifest.name}" saved`, 'success');
    } catch (err) {
      showStatus(`Save failed: ${err.message}`, 'error');
    }
  }, [manifestText, htmlText, refreshApps, showStatus]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    const entry = apps.find(a => a.manifest.id === selectedId);
    if (!entry) return;
    if (!confirm(`Delete "${entry.manifest.name}"?`)) return;
    removeDynamicApp(selectedId);
    refreshApps();
    setSelectedId(null);
    showStatus(`App deleted`, 'success');
  }, [selectedId, apps, refreshApps, showStatus]);

  const handleRun = useCallback(() => {
    setPreviewKey(k => k + 1);
  }, []);

  // Build preview srcdoc with bridge injected.
  const previewSrcdoc = useMemo(() => {
    let html = htmlText;
    const bridgeScript = `<script>${LI_BRIDGE_CLIENT}</script>`;
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${bridgeScript}\n</body>`);
    } else {
      html += `\n${bridgeScript}`;
    }
    return html;
  }, [htmlText, previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send li:ready to preview iframe when it loads.
  useEffect(() => {
    const iframe = previewRef.current;
    if (!iframe) return;
    const onLoad = () => {
      iframe.contentWindow.postMessage({ source: 'li-host', type: 'li:ready' }, '*');
    };
    iframe.addEventListener('load', onLoad, { once: true });
    return () => iframe.removeEventListener('load', onLoad);
  }, [previewSrcdoc]);

  // Handle bridge messages from preview iframe.
  useEffect(() => {
    const handler = (event) => {
      const iframe = previewRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const d = event.data;
      if (!d || d.source !== 'li-app') return;
      // Respond to preview bridge messages with stubs.
      if (d.type === 'li:notify') {
        // Actually show the notification.
        import('../../../lib/desktop/notify').then(m => m.notify({ title: d.payload.title, body: d.payload.body }));
      }
      iframe.contentWindow.postMessage(
        { source: 'li-host', type: 'li:response', id: d.id, result: null },
        '*',
      );
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Keyboard shortcut: Ctrl+S to save.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const selectedEntry = selectedId ? apps.find(a => a.manifest.id === selectedId) : null;

  return (
    <div className="as-root">
      {/* Sidebar */}
      <div className="as-sidebar">
        <div className="as-sidebar-header">
          <span className="as-sidebar-title">App Studio</span>
          <button className="as-btn as-btn-primary" onClick={handleNew} title="New app">
            <Icon name="Plus" size={14} /> New
          </button>
        </div>
        <div className="as-app-list">
          {apps.length === 0 && (
            <div className="as-empty">
              <Icon name="Code" size={24} />
              <p>No apps yet</p>
              <p className="as-empty-hint">Click &quot;New&quot; to create one, or ask the AI to build an app for you.</p>
            </div>
          )}
          {apps.map(entry => (
            <div
              key={entry.manifest.id}
              className={`as-app-item ${selectedId === entry.manifest.id ? 'active' : ''}`}
              onClick={() => selectApp(entry.manifest.id)}
            >
              <div className="as-app-icon" style={{ background: entry.manifest.color || '#6366f1' }}>
                <Icon name={entry.manifest.icon || 'Sparkles'} size={14} />
              </div>
              <div className="as-app-info">
                <span className="as-app-name">{entry.manifest.name}</span>
                <span className="as-app-meta">{entry.manifest.category}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor + Preview */}
      <div className="as-main">
        {/* Toolbar */}
        <div className="as-toolbar">
          <div className="as-tabs">
            <button className={`as-tab ${tab === 'manifest' ? 'active' : ''}`} onClick={() => setTab('manifest')}>
              <Icon name="Settings" size={13} /> Manifest
            </button>
            <button className={`as-tab ${tab === 'html' ? 'active' : ''}`} onClick={() => setTab('html')}>
              <Icon name="Code" size={13} /> HTML
            </button>
          </div>
          <div className="as-toolbar-actions">
            <button className="as-btn" onClick={handleRun} title="Refresh preview">
              <Icon name="Play" size={13} /> Preview
            </button>
            <button className="as-btn as-btn-primary" onClick={handleSave} title="Save (Ctrl+S)">
              <Icon name="Save" size={13} /> Save
            </button>
            {selectedEntry && (
              <button className="as-btn as-btn-danger" onClick={handleDelete} title="Delete app">
                <Icon name="Trash2" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Status bar */}
        {status && (
          <div className={`as-status as-status-${statusTone}`}>{status}</div>
        )}

        <div className="as-editor-preview">
          {/* Editor */}
          <div className="as-editor">
            {tab === 'manifest' ? (
              <textarea
                className="as-code"
                value={manifestText}
                onChange={e => setManifestText(e.target.value)}
                spellCheck={false}
                placeholder="Manifest JSON..."
              />
            ) : (
              <textarea
                className="as-code"
                value={htmlText}
                onChange={e => setHtmlText(e.target.value)}
                spellCheck={false}
                placeholder="HTML source..."
              />
            )}
          </div>

          {/* Preview */}
          <div className="as-preview">
            <div className="as-preview-label">Preview</div>
            <iframe
              ref={previewRef}
              key={previewKey}
              className="as-preview-frame"
              srcDoc={previewSrcdoc}
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="App preview"
            />
          </div>
        </div>
      </div>

      <style>{`
        .as-root {
          display: flex; height: 100%; background: #0f0f14; color: #e2e8f0;
          font-family: system-ui, -apple-system, sans-serif; font-size: 13px;
        }
        .as-sidebar {
          width: 200px; min-width: 200px; background: #16161e;
          border-right: 1px solid #1e1e2e; display: flex; flex-direction: column;
        }
        .as-sidebar-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px; border-bottom: 1px solid #1e1e2e;
        }
        .as-sidebar-title { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; }
        .as-app-list { flex: 1; overflow-y: auto; padding: 4px; }
        .as-app-item {
          display: flex; align-items: center; gap: 8px;
          padding: 8px; border-radius: 6px; cursor: pointer;
          transition: background 0.15s;
        }
        .as-app-item:hover { background: #1e1e2e; }
        .as-app-item.active { background: #1e293b; }
        .as-app-icon {
          width: 28px; height: 28px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; color: white;
        }
        .as-app-info { display: flex; flex-direction: column; min-width: 0; }
        .as-app-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .as-app-meta { font-size: 10px; color: #64748b; }
        .as-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 24px; color: #475569; text-align: center; gap: 6px;
        }
        .as-empty-hint { font-size: 11px; max-width: 150px; line-height: 1.4; }
        .as-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .as-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 8px; height: 38px; border-bottom: 1px solid #1e1e2e;
          background: #16161e;
        }
        .as-tabs { display: flex; gap: 2px; }
        .as-tab {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 10px; border: none; background: transparent;
          color: #94a3b8; cursor: pointer; border-radius: 4px; font-size: 12px;
          transition: all 0.15s;
        }
        .as-tab:hover { background: #1e1e2e; color: #e2e8f0; }
        .as-tab.active { background: #1e293b; color: #e2e8f0; }
        .as-toolbar-actions { display: flex; gap: 4px; }
        .as-btn {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 10px; border: 1px solid #2d2d3d; background: #1e1e2e;
          color: #94a3b8; cursor: pointer; border-radius: 5px; font-size: 11px;
          transition: all 0.15s;
        }
        .as-btn:hover { background: #2d2d3d; color: #e2e8f0; }
        .as-btn-primary { background: #4f46e5; border-color: #4f46e5; color: white; }
        .as-btn-primary:hover { background: #4338ca; }
        .as-btn-danger { background: transparent; border-color: #7f1d1d; color: #f87171; }
        .as-btn-danger:hover { background: #7f1d1d33; }
        .as-status {
          padding: 4px 12px; font-size: 11px; border-bottom: 1px solid #1e1e2e;
        }
        .as-status-info { background: #1e293b; color: #94a3b8; }
        .as-status-success { background: #14532d33; color: #4ade80; }
        .as-status-error { background: #7f1d1d33; color: #f87171; }
        .as-editor-preview { flex: 1; display: flex; min-height: 0; }
        .as-editor { flex: 1; display: flex; min-width: 0; }
        .as-code {
          width: 100%; height: 100%; resize: none;
          background: #0f0f14; color: #c4c4c4; border: none;
          padding: 12px; font-family: 'Cascadia Code', 'Fira Code', monospace;
          font-size: 12px; line-height: 1.5; tab-size: 2;
          outline: none;
        }
        .as-preview {
          width: 320px; min-width: 240px; display: flex; flex-direction: column;
          border-left: 1px solid #1e1e2e; background: #16161e;
        }
        .as-preview-label {
          padding: 4px 10px; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #1e1e2e;
        }
        .as-preview-frame { flex: 1; border: none; background: white; }
      `}</style>
    </div>
  );
}
