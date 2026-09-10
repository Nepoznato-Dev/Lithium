/**
 * Browser persistence — save/load bookmarks, history, downloads, settings,
 * top sites, and shields stats to localStorage.
 */
import { storage } from '../../../lib/storage/localStorage';
import { loadBookmarks } from '../stores/bookmarksStore';
import { loadHistory } from '../stores/historyStore';
import { loadDownloads } from '../stores/downloadsStore';
import { loadBrowserSettings } from '../stores/settingsStore';
import { loadTopSites } from '../stores/newTabStore';
import { loadReadingList } from '../stores/readingListStore';
import { globalStats } from '../stores/shieldsStore';

const KEYS = {
  bookmarks: 'browser-bookmarks',
  history: 'browser-history',
  downloads: 'browser-downloads',
  settings: 'browser-settings',
  topSites: 'browser-top-sites',
  readingList: 'browser-reading-list',
  shieldsStats: 'browser-shields-stats',
};

/** Load all persisted browser data into stores. */
export function loadAll() {
  loadBookmarks(storage.get(KEYS.bookmarks, []));
  loadHistory(storage.get(KEYS.history, []));
  loadDownloads(storage.get(KEYS.downloads, []));
  loadBrowserSettings(storage.get(KEYS.settings, null));
  loadTopSites(storage.get(KEYS.topSites, null));
  loadReadingList(storage.get(KEYS.readingList, []));
  const stats = storage.get(KEYS.shieldsStats, null);
  if (stats) globalStats.value = stats;
}

/** Persist a single store to localStorage. */
export function saveBookmarksToDisk(bookmarks) {
  storage.set(KEYS.bookmarks, bookmarks);
}

export function saveHistoryToDisk(entries) {
  storage.set(KEYS.history, entries);
}

export function saveDownloadsToDisk(downloads) {
  storage.set(KEYS.downloads, downloads);
}

export function saveSettingsToDisk(settings) {
  storage.set(KEYS.settings, settings);
}

export function saveTopSitesToDisk(sites) {
  storage.set(KEYS.topSites, sites);
}

export function saveShieldsStatsToDisk(stats) {
  storage.set(KEYS.shieldsStats, stats);
}

export function saveReadingListToDisk(list) {
  storage.set(KEYS.readingList, list);
}

/** Clear all browser persisted data. */
export function clearAllBrowserData() {
  Object.values(KEYS).forEach(key => storage.set(key, null));
}
