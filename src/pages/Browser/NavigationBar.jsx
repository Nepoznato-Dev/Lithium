/**
 * NavigationBar — Brave-style toolbar.
 * Layout: [back] [fwd] [reload] [shields] [──── omnibox ────] [star]
 * Clean, compact buttons with the omnibox as the visual centerpiece.
 * Secondary actions (Reader, External Link) moved to the menu.
 */
import { activeTab, currentUrl, goBack, goForward, reloadTab, navigateTab } from './stores/tabStore';
import { isBookmarked, toggleBookmark } from './stores/bookmarksStore';
import { addHistoryEntry } from './stores/historyStore';
import { simulateBlocking } from './stores/shieldsStore';
import Omnibox from './Omnibox';
import ShieldsButton from './ShieldsButton';
import Icon from '../../Components/Icon';
import * as core from '../../lib/core';

function hostname(url) {
  const result = core.browserHostnameSync(url);
  if (result) return result;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function NavigationBar({ omniboxRef }) {
  const tab = activeTab.value;
  const url = currentUrl.value;
  const bookmarked = url ? isBookmarked(url) : false;

  const handleNavigate = (newUrl) => {
    navigateTab(tab.id, newUrl);
    addHistoryEntry(hostname(newUrl), newUrl);
    simulateBlocking();
  };

  const handleReload = () => reloadTab(tab.id);
  const handleBack = () => goBack(tab.id);
  const handleForward = () => goForward(tab.id);

  const handleBookmarkToggle = () => {
    if (url) toggleBookmark(hostname(url), url);
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      {/* Nav cluster */}
      <button className="browser-nav-btn" onClick={handleBack} disabled={tab.index <= 0} aria-label="Back" title="Back (Alt+←)">
        <Icon name="ArrowLeft" className="h-4 w-4" />
      </button>
      <button className="browser-nav-btn" onClick={handleForward} disabled={tab.index >= tab.history.length - 1} aria-label="Forward" title="Forward (Alt+→)">
        <Icon name="ArrowRight" className="h-4 w-4" />
      </button>
      <button className="browser-nav-btn" onClick={handleReload} disabled={!url} aria-label="Reload" title="Reload (Ctrl+R)">
        <Icon name="RotateCw" className="h-3.5 w-3.5" />
      </button>

      {/* Shields — left of omnibox like Brave */}
      <ShieldsButton />

      {/* Omnibox */}
      <Omnibox inputRef={omniboxRef} onNavigate={handleNavigate} />

      {/* Right-side actions */}
      <button
        className={`browser-nav-btn ${bookmarked ? 'text-yellow-400' : ''}`}
        onClick={handleBookmarkToggle}
        disabled={!url}
        aria-label="Bookmark this page"
        title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
      >
        <Icon name="Star" className={`h-4 w-4 ${bookmarked ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}
