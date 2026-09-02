/**
 * Browser keyboard shortcuts — global event listener that dispatches
 * to the appropriate store actions.
 */
import { addTab, closeTab, activeTabId, tabs, goBack, goForward, reloadTab, setActiveTab } from '../stores/tabStore';
import { toggleFindBar, navigateInternal } from '../stores/browserStore';
import { toggleBookmark, isBookmarked } from '../stores/bookmarksStore';
import { currentUrl } from '../stores/tabStore';

/**
 * Install the global keyboard shortcut handler.
 * Returns a cleanup function to remove the listener.
 */
export function installKeyboardShortcuts(omniboxFocusRef) {
  const handler = (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const tag = e.target.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;

    // Ctrl+T — new tab
    if (ctrl && e.key === 't') {
      e.preventDefault();
      addTab();
      return;
    }

    // Ctrl+W — close active tab
    if (ctrl && e.key === 'w' && !shift) {
      e.preventDefault();
      closeTab(activeTabId.value);
      return;
    }

    // Ctrl+Tab — next tab
    if (ctrl && e.key === 'Tab' && !shift) {
      e.preventDefault();
      const idx = tabs.value.findIndex(t => t.id === activeTabId.value);
      const next = tabs.value[(idx + 1) % tabs.value.length];
      if (next) setActiveTab(next.id);
      return;
    }

    // Ctrl+Shift+Tab — previous tab
    if (ctrl && shift && e.key === 'Tab') {
      e.preventDefault();
      const idx = tabs.value.findIndex(t => t.id === activeTabId.value);
      const prev = tabs.value[(idx - 1 + tabs.value.length) % tabs.value.length];
      if (prev) setActiveTab(prev.id);
      return;
    }

    // Ctrl+L — focus omnibox
    if (ctrl && e.key === 'l') {
      e.preventDefault();
      if (omniboxFocusRef?.current) omniboxFocusRef.current.focus();
      return;
    }

    // Ctrl+D — bookmark current page
    if (ctrl && e.key === 'd') {
      e.preventDefault();
      const url = currentUrl.value;
      if (url) toggleBookmark(url, url);
      return;
    }

    // Ctrl+Shift+O — bookmarks manager
    if (ctrl && shift && e.key === 'O') {
      e.preventDefault();
      navigateInternal('#/bookmarks');
      return;
    }

    // Ctrl+H — history
    if (ctrl && e.key === 'h') {
      e.preventDefault();
      navigateInternal('#/history');
      return;
    }

    // Ctrl+J — downloads
    if (ctrl && e.key === 'j') {
      e.preventDefault();
      navigateInternal('#/downloads');
      return;
    }

    // Ctrl+F — find bar
    if (ctrl && e.key === 'f') {
      e.preventDefault();
      toggleFindBar();
      return;
    }

    // Ctrl+, — settings
    if (ctrl && e.key === ',') {
      e.preventDefault();
      navigateInternal('#/settings');
      return;
    }

    // Alt+Left — back
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack(activeTabId.value);
      return;
    }

    // Alt+Right — forward
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      goForward(activeTabId.value);
      return;
    }

    // F5 or Ctrl+R — reload
    if (e.key === 'F5' || (ctrl && e.key === 'r')) {
      e.preventDefault();
      reloadTab(activeTabId.value);
      return;
    }

    // Escape — close find bar / clear internal route
    if (e.key === 'Escape') {
      navigateInternal('');
      return;
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
