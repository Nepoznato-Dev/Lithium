/**
 * BrowserChrome — root layout shell for the browser.
 * Brave-inspired unified chrome: tab strip + toolbar share one background
 * so the active tab visually merges into the navigation bar.
 */
import { useRef, useEffect } from 'preact/hooks';
import { tabs, activeTabId, activeTab, currentUrl, navigateTab, setTabLoading } from './stores/tabStore';
import { internalRoute, findBarOpen, shieldsPanelOpen, backendUp } from './stores/browserStore';
import { bookmarks } from './stores/bookmarksStore';
import { historyEntries, clearHistory } from './stores/historyStore';
import { checkBackendHealth } from './io/network';
import { loadAll } from './io/persistence';
import { installKeyboardShortcuts } from './io/keyboard';
import TabBar from './TabBar';
import NavigationBar from './NavigationBar';
import BookmarksBar from './BookmarksBar';
import StatusBar from './StatusBar';
import FindBar from './FindBar';
import Viewport from './Viewport';
import ShieldsPanel from './ShieldsPanel';
import MenuButton from './MenuButton';
import SettingsPage from './pages/SettingsPage';
import BookmarksPage from './pages/BookmarksPage';
import HistoryPage from './pages/HistoryPage';
import DownloadsPage from './pages/DownloadsPage';
import ExtensionsPage from './pages/ExtensionsPage';
import WalletPage from './pages/WalletPage';
import HelpPage from './pages/HelpPage';
import ReadingListPage from './pages/ReadingListPage';
import WinControls from '../../Components/Desktop/WinControls';
import { useSettings } from '../../Components/SettingsContext';

const INTERNAL_PAGES = {
  '#/settings': SettingsPage,
  '#/bookmarks': BookmarksPage,
  '#/history': HistoryPage,
  '#/downloads': DownloadsPage,
  '#/extensions': ExtensionsPage,
  '#/wallet': WalletPage,
  '#/help': HelpPage,
  '#/reading-list': ReadingListPage,
};

export default function BrowserChrome({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized, initialUrl }) {
  const { settings } = useSettings();
  const omniboxRef = useRef(null);
  const route = internalRoute.value;
  const showBookmarksBar = settings.browser?.showBookmarksBar !== false;
  const showStatusBar = settings.browser?.showStatusBar !== false;
  const allBookmarks = bookmarks.value;

  // Load persisted data on mount
  useEffect(() => {
    loadAll();
  }, []);

  // Backend health check
  useEffect(() => {
    const check = async () => {
      const up = await checkBackendHealth();
      backendUp.value = up;
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    return installKeyboardShortcuts(omniboxRef);
  }, []);

  // Deep-link: navigate to initialUrl if provided
  useEffect(() => {
    if (initialUrl) {
      const tab = activeTab.value;
      navigateTab(tab.id, initialUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for browser-navigate events (from Viewport link clicks)
  useEffect(() => {
    const handler = (e) => {
      const url = e.detail?.url;
      if (url) {
        const tab = activeTab.value;
        navigateTab(tab.id, url);
      }
    };
    window.addEventListener('browser-navigate', handler);
    return () => window.removeEventListener('browser-navigate', handler);
  }, []);

  // Listen for clear-data events
  useEffect(() => {
    const handler = () => {
      clearHistory();
      bookmarks.value = [];
    };
    window.addEventListener('browser-clear-data', handler);
    return () => window.removeEventListener('browser-clear-data', handler);
  }, []);

  const InternalPage = INTERNAL_PAGES[route];

  return (
    <div className={windowed ? 'flex h-full min-h-0 min-w-0 flex-col' : 'flex h-[calc(100dvh-57px)] min-w-0 flex-col md:h-dvh'}>
      {/* Unified chrome: tab strip + window controls */}
      <div className="browser-chrome flex items-end gap-0 px-1">
        <TabBar />
        <div className="flex items-center gap-0.5 pb-0.5">
          <MenuButton />
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>
      </div>

      {/* Navigation bar — seamless with tab strip */}
      <div className="browser-chrome">
        <NavigationBar omniboxRef={omniboxRef} />
      </div>

      {/* Shields panel overlay */}
      <div className="relative browser-chrome">
        <ShieldsPanel />
      </div>

      {/* Bookmarks bar */}
      {showBookmarksBar && allBookmarks.length > 0 && <BookmarksBar />}

      {/* Find bar */}
      <FindBar />

      {/* Loading progress bar */}
      {tabs.value.some(t => t.isLoading) && (
        <div className="browser-progress" style={{ width: '60%' }} />
      )}

      {/* Main content: internal page or viewport */}
      {InternalPage ? (
        <div className="flex-1 overflow-hidden bg-[#1a1a26]">
          <InternalPage />
        </div>
      ) : (
        <Viewport />
      )}

      {/* Status bar */}
      {showStatusBar && <StatusBar />}
    </div>
  );
}
