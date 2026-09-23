import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopWindowProvider, useDesktopWindows } from '../src/Components/Desktop/DesktopWindowManager';
import DesktopWindow from '../src/Components/Desktop/DesktopWindow';
import { SettingsProvider, useSettings } from '../src/Components/SettingsContext';
import { EnhancedSlider, ColorPickerSwatch } from '../src/pages/Settings/controls';
import { storage, cancelStorageSaves } from '../src/lib/storage/localStorage';
import * as browser from '../src/pages/Browser/stores/tabStore';

const output = document.getElementById('results');
const params = new URLSearchParams(location.search);
const backupKey = 'lithium-persistence-harness-backup';
const resultKey = 'lithium-persistence-harness-results';
const keys = ['lithium:desktop-session:v1', 'lithium:settings', 'lithium:browser-session:v1'];
const checks = [];
let api;
let prefs;

function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(`PASS: ${message}`);
  output.textContent = checks.join('\n');
}
const settle = () => new Promise(resolve => setTimeout(resolve, 120));

function TestApp() {
  const [draft, setDraft] = useState('');
  const settings = useSettings();
  prefs = settings;
  return <div>
    <input data-draft value={draft} onInput={event => setDraft(event.currentTarget.value)} />
    <output data-draft-value>{draft}</output>
    <EnhancedSlider value={settings.settings.display.fontSize} min={12} max={20} onChange={value => settings.updateSetting('display.fontSize', value)} />
    <ColorPickerSwatch value={settings.settings.theme.accent} onChange={value => settings.updateSetting('theme.accent', value)} />
  </div>;
}
const apps = [
  { id: 'test-one', title: 'Test One', component: <TestApp /> },
  { id: 'test-two', title: 'Test Two', component: <TestApp /> },
];
function Harness() {
  api = useDesktopWindows();
  useLayoutEffect(() => { api.restoreSession(apps); }, []);
  return api.windows.map(item => <DesktopWindow key={item.id} item={item} />);
}

async function run() {
  if (params.get('run') !== '1') {
    output.textContent = 'Open with ?run=1 on an isolated test origin to run. The test restores the original storage afterward.';
    return;
  }
  if (params.get('phase') !== 'restore') {
    if (!sessionStorage.getItem(backupKey)) sessionStorage.setItem(backupKey, JSON.stringify(Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]))));
    cancelStorageSaves();
    keys.forEach(key => localStorage.removeItem(key));
    browser.clearTabSession();
  }
  output.style.whiteSpace = 'pre-wrap';
  const root = createRoot(document.getElementById('root'));
  root.render(<SettingsProvider><DesktopWindowProvider><Harness /></DesktopWindowProvider></SettingsProvider>);
  await settle();
  if (params.get('phase') === 'restore') {
    checks.push(...JSON.parse(sessionStorage.getItem(resultKey) || '[]'));
    const win = api.windows.find(item => item.id === 'test-one');
    check(Boolean(win), 'open window restored after a full page reload');
    check(win.x === 155 && win.y === 95 && win.width === 500 && win.height === 350, 'saved window geometry restored');
    check(win.minimized && win.maximized, 'minimized and maximized flags restored');
    check(prefs.settings.display.fontSize === 17, 'font preference restored');
    check(prefs.settings.theme.accent === '#123456', 'custom color preference restored');
    check(browser.tabs.peek().some(tab => tab.history[tab.index].url === 'lithium://bookmarks'), 'browser bookmark tab restored');
    check(browser.currentUrl.peek() === 'lithium://history', 'browser active tab restored');
    root.unmount();
    cancelStorageSaves();
    const backup = JSON.parse(sessionStorage.getItem(backupKey));
    for (const key of keys) {
      if (backup[key] === null) localStorage.removeItem(key);
      else localStorage.setItem(key, backup[key]);
    }
    sessionStorage.removeItem(backupKey);
    sessionStorage.removeItem(resultKey);
    output.textContent = `${checks.join('\n')}\nALL ${checks.length} CHECKS PASSED. Original storage restored.`;
    document.title = 'PASS — persistence harness';
    return;
  }

  api.openWindow({ ...apps[0], newWindow: true });
  await settle();
  const draft = document.querySelector('[data-draft]');
  draft.value = 'unsaved draft';
  draft.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  const range = document.querySelector('input[type="range"]');
  range.value = '17';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  const color = document.querySelector('input[type="color"]');
  color.value = '#123456';
  color.dispatchEvent(new Event('input', { bubbles: true }));
  color.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  check(storage.get('settings').display.fontSize === 17, 'slider preference saved through the real settings provider');
  check(storage.get('settings').theme.accent === '#123456', 'color saved without waiting for blur');

  api.updateWindow('test-one', { minimized: true });
  await settle();
  check(document.querySelector('[data-draft]') === draft, 'minimize retains the mounted app DOM');
  api.focusApp('test-one');
  await settle();
  check(document.querySelector('[data-draft-value]').textContent === 'unsaved draft', 'restoring a minimized app retains component state');

  api.addTab('test-one', { appId: apps[1].id, ...apps[1] });
  await settle();
  api.setActiveTab('test-one', api.windows[0].tabs[0].key);
  await settle();
  check(document.querySelector('[data-draft]') === draft, 'desktop tab switching retains the original component');
  api.closeTab('test-one', api.windows[0].tabs[1].key);
  api.updateWindow('test-one', { x: 155, y: 95, width: 500, height: 350 });
  api.closeWindow('test-one');
  api.openWindow({ ...apps[0], newWindow: true });
  await settle();
  check(api.windows[0].x === 155 && api.windows[0].width === 500, 'closing and reopening an app restores its last geometry');
  api.updateWindow('test-one', { minimized: true, maximized: true });
  browser.addTab('lithium://bookmarks');
  browser.addTab('lithium://history');
  sessionStorage.setItem(resultKey, JSON.stringify(checks));
  // Deliberately navigate before the debounce timer; pagehide must flush it.
  location.replace(`${location.pathname}?run=1&phase=restore`);
}
run().catch(error => {
  output.textContent = `${checks.join('\n')}\nFAIL: ${error.stack}`;
  document.title = 'FAIL — persistence harness';
});
