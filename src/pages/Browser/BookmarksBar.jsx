/**
 * BookmarksBar — Brave-style bookmark toolbar.
 * Compact horizontal bar with favicon + title items.
 */
import { bookmarks, removeBookmark } from './stores/bookmarksStore';
import { navigateTab, activeTabId } from './stores/tabStore';
import { clearAllModes } from './stores/browserStore';
import Icon from '../../Components/Icon';

export default function BookmarksBar() {
  const allBookmarks = bookmarks.value;
  if (allBookmarks.length === 0) return null;

  const handleNavigate = (url) => {
    clearAllModes();
    navigateTab(activeTabId.value, url);
  };

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-t border-white/[0.04] bg-[#1e1e30] px-2 py-1 scrollbar-none">
      {allBookmarks.map(mark => (
        <span key={mark.url} className="group flex shrink-0 items-center">
          <button
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            onClick={() => handleNavigate(mark.url)}
          >
            <Icon name="Globe" className="h-3 w-3 shrink-0 opacity-40" />
            <span className="max-w-32 truncate">{mark.title}</span>
          </button>
          <button
            className="rounded p-0.5 text-white/20 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
            onClick={() => removeBookmark(mark.url)}
            aria-label={`Remove ${mark.title}`}
          >
            <Icon name="X" className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
