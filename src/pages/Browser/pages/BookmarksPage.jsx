/**
 * BookmarksPage — full bookmark manager with folder tree, search, import/export, and AI actions.
 */
import { useState, useCallback } from 'preact/hooks';
import { bookmarks, bookmarkTree, filteredBookmarks, bookmarkQuery, addBookmark, removeBookmark, updateBookmark } from '../stores/bookmarksStore';
import Icon from '../../../Components/Icon';

/* ── Import / Export helpers ── */
function exportBookmarksHtml(bms) {
  const items = bms.map(b => `  <dt><a href="${b.url}">${b.title || b.url}</a>`).join('\n');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<meta charset="utf-8">\n<title>Bookmarks</title>\n<dl>\n${items}\n</dl>\n`;
}
function parseBookmarksHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('a[href]')).map(a => ({ title: a.textContent.trim() || a.href, url: a.href }));
}
function exportBookmarksJson(bms) { return JSON.stringify(bms, null, 2); }
function parseBookmarksJson(json) {
  const arr = JSON.parse(json);
  return Array.isArray(arr) ? arr.filter(b => b.url).map(b => ({ title: b.title || b.url, url: b.url, folder: b.folder })) : [];
}
function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

export default function BookmarksPage() {
  const query = bookmarkQuery.value;
  const filtered = filteredBookmarks.value;
  const tree = bookmarkTree.value;
  const allBms = bookmarks.value;
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [editingUrl, setEditingUrl] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const folderBookmarks = selectedFolder
    ? filtered.filter(b => b.folder === selectedFolder)
    : filtered;

  /* ── Import ── */
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        let imported = [];
        if (file.name.endsWith('.json')) imported = parseBookmarksJson(text);
        else imported = parseBookmarksHtml(text);
        if (imported.length === 0) { setImportMsg('No bookmarks found'); setTimeout(() => setImportMsg(''), 3000); return; }
        let count = 0;
        const current = bookmarks.value;
        for (const b of imported) {
          if (!current.some(existing => existing.url === b.url)) { addBookmark(b.title, b.url, b.folder); count++; }
        }
        setImportMsg(`Imported ${count} bookmark${count !== 1 ? 's' : ''}`);
        setTimeout(() => setImportMsg(''), 3000);
      } catch { setImportMsg('Import failed'); setTimeout(() => setImportMsg(''), 3000); }
    };
    input.click();
  }, []);

  /* ── Export ── */
  const handleExport = useCallback((format) => {
    const bms = bookmarks.value;
    const data = format === 'json' ? exportBookmarksJson(bms) : exportBookmarksHtml(bms);
    const mime = format === 'json' ? 'application/json' : 'text/html';
    const ext = format === 'json' ? 'json' : 'html';
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bookmarks.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  /* ── AI: Organize bookmarks ── */
  const handleAiOrganize = useCallback(async () => {
    if (aiBusy || allBms.length === 0) return;
    setAiBusy(true);
    try {
      const { createSession, sendMessage } = await import('../../../lib/services/aiService');
      const summary = allBms.slice(0, 100).map(b => `- ${b.title} → ${b.url}${b.folder ? ` [${b.folder}]` : ''}`).join('\n');
      const sid = createSession({ title: 'Bookmark Organizer' });
      await sendMessage(sid, `I have ${allBms.length} bookmarks. Suggest how to organize them into folders by topic/domain:\n${summary}\n\nSuggest folder names and which bookmarks go in each.`);
      window.dispatchEvent(new CustomEvent('lithium:launch-app', { detail: { appId: 'ai-hub' } }));
    } catch { /* ignore */ }
    setAiBusy(false);
  }, [allBms, aiBusy]);

  /* ── AI: Analyze single bookmark ── */
  const handleAiAnalyze = useCallback(async (bm) => {
    try {
      const { createSession, sendMessage } = await import('../../../lib/services/aiService');
      const sid = createSession({ title: `Analyze: ${bm.title}` });
      await sendMessage(sid, `Analyze this bookmark — what the site is about, whether it's trustworthy, and suggest a folder:\nTitle: ${bm.title}\nURL: ${bm.url}`);
      window.dispatchEvent(new CustomEvent('lithium:launch-app', { detail: { appId: 'ai-hub' } }));
    } catch { /* ignore */ }
  }, []);

  /* ── Inline edit ── */
  const startEdit = useCallback((bm) => { setEditingUrl(bm.url); setEditTitle(bm.title); setEditUrl(bm.url); }, []);
  const saveEdit = useCallback(() => {
    if (!editTitle.trim() || !editUrl.trim()) return;
    updateBookmark(editingUrl, editTitle.trim(), editUrl.trim());
    setEditingUrl(null);
  }, [editingUrl, editTitle, editUrl]);

  return (
    <div className="flex h-full bg-[#0f0f17]">
      {/* Folder tree sidebar */}
      <div className="w-48 shrink-0 border-r border-white/[0.06] p-3">
        <h2 className="mb-3 px-2 text-sm font-semibold text-white">Bookmarks</h2>
        <button
          className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
            !selectedFolder ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
          }`}
          onClick={() => setSelectedFolder(null)}
        >
          <Icon name="Bookmark" className="h-3.5 w-3.5" />
          All Bookmarks
          <span className="ml-auto text-[10px] text-white/25">{allBms.length}</span>
        </button>
        {tree.map(folder => (
          <button
            key={folder.name}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
              selectedFolder === folder.name ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
            }`}
            onClick={() => setSelectedFolder(folder.name)}
          >
            <Icon name="Folder" className="h-3.5 w-3.5" />
            {folder.name}
            <span className="ml-auto text-[10px] text-white/25">{(folder.items || []).length}</span>
          </button>
        ))}
      </div>

      {/* Bookmark list */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="relative flex-1">
            <Icon name="Search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              className="text-input w-full rounded-lg py-1.5 pl-9 text-xs"
              placeholder="Search bookmarks…"
              value={query}
              onInput={e => { bookmarkQuery.value = e.target.value; }}
            />
          </div>
          <span className="text-[11px] text-white/30">{folderBookmarks.length} bookmarks</span>
          {importMsg && <span className="text-[11px] text-cyan-400">{importMsg}</span>}
          {/* Import */}
          <button className="btn-ghost rounded p-1.5 text-white/40 hover:text-white/70" onClick={handleImport} title="Import bookmarks">
            <Icon name="Upload" className="h-3.5 w-3.5" />
          </button>
          {/* Export */}
          <div className="relative group">
            <button className="btn-ghost rounded p-1.5 text-white/40 hover:text-white/70" title="Export bookmarks">
              <Icon name="Download" className="h-3.5 w-3.5" />
            </button>
            <div className="absolute right-0 top-full z-10 hidden min-w-[100px] rounded-lg border border-white/10 bg-[#1a1a2e] py-1 shadow-xl group-hover:block">
              <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5" onClick={() => handleExport('html')}>
                <Icon name="FileText" className="h-3 w-3" /> HTML
              </button>
              <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5" onClick={() => handleExport('json')}>
                <Icon name="FileJson" className="h-3 w-3" /> JSON
              </button>
            </div>
          </div>
          {/* AI Organize */}
          <button className="btn-ghost flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-purple-400 hover:bg-purple-500/10 disabled:opacity-40" onClick={handleAiOrganize} disabled={aiBusy || allBms.length === 0} title="AI: Organize bookmarks into folders">
            <Icon name="Sparkles" className="h-3 w-3" /> {aiBusy ? 'Thinking…' : 'AI Organize'}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {folderBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
              <Icon name="Bookmark" className="h-8 w-8" />
              <p className="text-sm">{query ? 'No matching bookmarks' : 'No bookmarks yet'}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {folderBookmarks.map((bm, i) => (
                <div
                  key={`${bm.url}-${i}`}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-black" style={{ background: `hsl(${(domainOf(bm.url).charCodeAt(0) * 37) % 360}, 60%, 65%)` }}>
                    {domainOf(bm.url).charAt(0).toUpperCase()}
                  </div>
                  {editingUrl === bm.url ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input className="text-input flex-1 rounded px-2 py-1 text-xs" value={editTitle} onInput={e => setEditTitle(e.target.value)} placeholder="Title" />
                      <input className="text-input flex-1 rounded px-2 py-1 text-xs" value={editUrl} onInput={e => setEditUrl(e.target.value)} placeholder="URL" />
                      <button className="btn-primary rounded px-2 py-1 text-xs" onClick={saveEdit}>Save</button>
                      <button className="btn-ghost rounded px-2 py-1 text-xs" onClick={() => setEditingUrl(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-white/80">{bm.title}</p>
                        <p className="truncate text-[10px] text-white/30">{domainOf(bm.url)}{bm.folder ? ` · ${bm.folder}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button className="rounded p-1 text-white/20 hover:text-white/60" onClick={() => startEdit(bm)} title="Edit">
                          <Icon name="Pencil" className="h-3 w-3" />
                        </button>
                        <button className="rounded p-1 text-white/20 hover:text-purple-400" onClick={() => handleAiAnalyze(bm)} title="AI: Analyze">
                          <Icon name="Sparkles" className="h-3 w-3" />
                        </button>
                        <a
                          href={bm.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded p-1 text-white/20 hover:text-white/60"
                          aria-label="Open bookmark"
                        >
                          <Icon name="ExternalLink" className="h-3.5 w-3.5" />
                        </a>
                        <button
                          className="rounded p-1 text-white/20 hover:text-red-400"
                          onClick={() => removeBookmark(bm.url)}
                          aria-label="Remove bookmark"
                        >
                          <Icon name="Trash2" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
