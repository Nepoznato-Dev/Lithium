import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
let writes = 0;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); writes++; },
  removeItem: key => values.delete(key),
};
globalThis.window = new EventTarget();
window.innerWidth = 1440;
window.innerHeight = 900;
globalThis.document = new EventTarget();
document.visibilityState = 'visible';

const { storage, scheduleStorageSave, flushStorageSaves, cancelStorageSaves } = await import('../src/lib/storage/localStorage.js');
const { DESKTOP_SESSION_KEY, captureDesktopSession, normalizeDesktopSession, restoreDesktopWindows, loadDesktopSession, fitWindow } = await import('../src/lib/desktop/session.js');
values.set('lithium:browser-session:v1', JSON.stringify({
  version: 1, activeTabId: 'old-tab', tabs: [{ id: 'old-tab', title: 'History', index: 0, history: [{ url: 'lithium://history', mode: 'normal' }] }],
}));
const browser = await import('../src/pages/Browser/stores/tabStore.js');
const initialBrowserUrl = browser.currentUrl.peek();
const initialBrowserWrites = writes;

beforeEach(() => {
  cancelStorageSaves();
  values.clear();
  writes = 0;
  document.visibilityState = 'visible';
});
after(cancelStorageSaves);

const windowFixture = () => ({
  id: 'settings', x: 120, y: 80, width: 600, height: 500, zIndex: 42,
  minimized: true, maximized: true, activeTab: 'second',
  tabs: [{ key: 'first', appId: 'browser', component: () => {} }, { key: 'second', appId: 'settings', component: () => {} }],
});

test('coalesces snapshots and reads pending values without losing latest changes', () => {
  scheduleStorageSave('test-ui', { value: 1 });
  scheduleStorageSave('test-ui', { value: 2 });
  assert.equal(writes, 0);
  assert.deepEqual(storage.get('test-ui'), { value: 2 });
  flushStorageSaves();
  assert.equal(writes, 1);
  assert.equal(JSON.parse(values.get('lithium:test-ui')).value, 2);
});

test('pagehide flushes all pending changes immediately', () => {
  scheduleStorageSave('test-ui', { section: 'display' });
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(JSON.parse(values.get('lithium:test-ui')).section, 'display');
});

test('hiding a page flushes pending changes and subsequent hidden-page writes', () => {
  scheduleStorageSave('volume', 20);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(values.get('lithium:volume'), '20');
  scheduleStorageSave('volume', 30);
  assert.equal(values.get('lithium:volume'), '30');
});

test('removal and deliberate reset cannot resurrect pending snapshots', () => {
  scheduleStorageSave('test-ui', 1);
  storage.remove('test-ui');
  flushStorageSaves();
  assert.equal(storage.get('test-ui'), null);
  scheduleStorageSave('test-ui', 2);
  cancelStorageSaves();
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(storage.get('test-ui'), null);
});

test('malformed JSON and blocked/quota-limited storage fail safely', () => {
  values.set('lithium:broken', '{');
  assert.deepEqual(storage.get('broken', {}), {});
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('blocked'); },
    };
    assert.equal(storage.get('missing', 42), 42);
    assert.doesNotThrow(() => { scheduleStorageSave('test', {}); flushStorageSaves(); storage.remove('test'); });
  } finally { globalThis.localStorage = original; }
});

test('desktop layout round-trip preserves geometry, tab order and window flags', () => {
  const snapshot = captureDesktopSession([windowFixture()]);
  storage.set(DESKTOP_SESSION_KEY, snapshot);
  const loaded = loadDesktopSession();
  assert.deepEqual(loaded, snapshot);
  assert.equal(loaded.windows[0].activeTab, 'second');
  assert.equal(loaded.windows[0].minimized, true);
  assert.equal(loaded.windows[0].maximized, true);
  assert.equal(loaded.windows[0].width, 600);
  assert.equal(JSON.stringify(loaded).includes('component'), false);
});

test('restoration resolves current app components, drops removed apps and repairs selection', () => {
  const snapshot = captureDesktopSession([windowFixture()]);
  const component = {};
  const restored = restoreDesktopWindows(snapshot, [{ id: 'browser', title: 'Browser', icon: 'icon', component }]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].tabs.length, 1);
  assert.equal(restored[0].tabs[0].component, component);
  assert.equal(restored[0].activeTab, 'first');
  assert.equal(restored[0].zIndex, 11);
  assert.deepEqual(restoreDesktopWindows(snapshot, []), []);
});

test('closed apps stay closed while their last placement remains available', () => {
  const placement = fitWindow(windowFixture());
  const snapshot = captureDesktopSession([], { settings: placement });
  assert.deepEqual(snapshot.windows, []);
  assert.deepEqual(snapshot.placements.settings, placement);
});

test('unknown schemas, malformed entries and duplicate IDs are safe', () => {
  assert.deepEqual(normalizeDesktopSession({ version: 9, windows: [] }).windows, []);
  const win = windowFixture();
  const result = normalizeDesktopSession({ version: 1, windows: [null, {}, win, win, { ...win, id: 'empty', tabs: null }] });
  assert.equal(result.windows.length, 1);
  assert.equal(normalizeDesktopSession(null).version, 1);
});

test('restored geometry remains reachable after switching to a smaller display', () => {
  const bounds = fitWindow({ x: 9000, y: -20, width: 3000, height: 2000 }, { width: 375, height: 600 });
  assert.deepEqual(bounds, { x: 0, y: 0, width: 375, height: 552, maximized: false });
  const invalid = fitWindow({ x: NaN, width: Infinity });
  assert.equal(Number.isFinite(invalid.x) && Number.isFinite(invalid.width), true);
});

test('browser loads saved tabs before creating its persistence subscription', () => {
  assert.equal(initialBrowserUrl, 'lithium://history');
  assert.equal(initialBrowserWrites, 0);
});

test('browser restores active tab, back/forward history, pins and container', () => {
  const first = { ...browser.createTab('https://example.com/'), isPinned: true, containerId: 'work' };
  const second = { ...browser.createTab('lithium://bookmarks'), history: [{ url: 'lithium://bookmarks' }, { url: 'lithium://history' }], index: 1 };
  const snapshot = browser.captureTabSession([first, second], second.id);
  const restored = browser.restoreTabSession(snapshot);
  assert.equal(restored.tabs[0].isPinned, true);
  assert.equal(restored.tabs[0].containerId, 'work');
  assert.equal(restored.activeTabId, restored.tabs[1].id);
  assert.equal(restored.tabs[1].history[1].url, 'lithium://history');
  assert.equal(restored.tabs[1].index, 1);
  assert.notEqual(restored.tabs[1].id, second.id);
});

test('browser excludes private tabs, fetched HTML and non-restorable URLs', () => {
  const privateTab = { ...browser.createTab('https://example.com/private'), isPrivate: true };
  const tab = { ...browser.createTab('javascript:alert(1)'), searchData: { html: '<html>private</html>' }, isLoading: true, mode: 'reader' };
  const snapshot = browser.captureTabSession([privateTab, tab], privateTab.id);
  assert.equal(snapshot.tabs.length, 1);
  assert.equal(snapshot.tabs[0].history[0].url, 'lithium://newtab');
  assert.equal(snapshot.tabs[0].mode, 'normal');
  assert.equal('searchData' in snapshot.tabs[0], false);
  assert.equal('isLoading' in snapshot.tabs[0], false);
  assert.equal(snapshot.activeTabId, tab.id);
});

test('browser corrupt snapshots fall back to one safe new tab', () => {
  for (const value of [null, {}, { version: 1, tabs: [null, {}, { history: null }] }]) {
    const restored = browser.restoreTabSession(value);
    assert.equal(restored.tabs.length, 1);
    assert.equal(restored.tabs[0].history[0].url, 'lithium://newtab');
  }
});

test('browser navigation after going back discards forward history', () => {
  const id = browser.addTab('https://example.com/a');
  browser.navigateTab(id, 'https://example.com/b');
  browser.navigateTab(id, 'https://example.com/c');
  browser.goBack(id);
  browser.navigateTab(id, 'https://example.com/d');
  assert.deepEqual(browser.tabs.peek().find(tab => tab.id === id).history.map(entry => entry.url), [
    'https://example.com/a', 'https://example.com/b', 'https://example.com/d',
  ]);
});

test('browser tab changes flush on reload and clearing browsing data removes session', () => {
  const id = browser.addTab('lithium://bookmarks');
  browser.pinTab(id);
  window.dispatchEvent(new Event('pagehide'));
  const saved = JSON.parse(values.get('lithium:browser-session:v1'));
  assert.equal(saved.activeTabId, id);
  assert.equal(saved.tabs.find(tab => tab.id === id).isPinned, true);
  browser.clearTabSession();
  window.dispatchEvent(new Event('pagehide'));
  assert.equal(values.has('lithium:browser-session:v1'), false);
});
