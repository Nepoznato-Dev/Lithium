/**
 * BookmarksPage — full bookmark manager with folder tree, search, and actions.
 */
import { useState } from 'preact/hooks';
import { bookmarks, bookmarkTree, filteredBookmarks, bookmarkQuery, addBookmark, removeBookmark, updateBookmark } from '../stores/bookmarksStore';
import Icon from '../../../Components/Icon';

export default function BookmarksPage() {
  const query = bookmarkQuery.value;
  const filtered = filteredBookmarks.value;
  const tree = bookmarkTree.value;
  const [selectedFolder, setSelectedFolder] = useState(null);

  const folderBookmarks = selectedFolder
    ? filtered.filter(b => b.folder === selectedFolder)
    : filtered;

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
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
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
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {folderBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
              <Icon name="Bookmark" className="h-8 w-8" />
              <p className="text-sm">No bookmarks found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {folderBookmarks.map((bm, i) => (
                <div
                  key={`${bm.url}-${i}`}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                >
                  <Icon name="Globe" className="h-4 w-4 shrink-0 text-white/25" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-white/80">{bm.title}</p>
                    <p className="truncate text-[10px] text-white/30">{bm.url}</p>
                  </div>
                  <a
                    href={bm.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded p-1 text-white/20 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
                    aria-label="Open bookmark"
                  >
                    <Icon name="ExternalLink" className="h-3.5 w-3.5" />
                  </a>
                  <button
                    className="rounded p-1 text-white/20 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    onClick={() => removeBookmark(bm.url)}
                    aria-label="Remove bookmark"
                  >
                    <Icon name="Trash2" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
