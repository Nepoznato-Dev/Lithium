import React from 'react';
import ReactDOM from 'react-dom/client';
import { Router } from './lib/router';
import './index.css';
import './desktop.css';
import App from './App';
import { coreReady, wasmStatus } from './lib/core';
import { hydrateKv } from './lib/storage/kvTier';
import { initializeAntiTheft } from './lib/stealth/antiTheft';

// Warm up the Rust core wasm after first paint so sync facades (markdown, fs ops)
// are available shortly after the UI becomes interactive.
const deferWasm = () => {
  coreReady().then(() => {
    window.__lithiumWasm = wasmStatus;
  });
};
if ('requestIdleCallback' in window) {
  requestIdleCallback(deferWasm);
} else {
  setTimeout(deferWasm, 0);
}

// Hydrate the unified local tier (overflowed chats/memory/audit from IDB).
hydrateKv();

// Defer service initialization until after first paint.
// Services are fire-and-forget daemons that aren't needed for initial render.
const initServices = () => {
  import('./lib/services/privacyService').then(m => m.initPrivacyService());
  import('./lib/services/adBlocker').then(m => m.initAdBlocker());
  import('./lib/services/aiService').then(m => m.initAiService());
  // Re-install user-added APIs (Cortex "skills") as real apiManager handlers.
  import('./lib/ai/skills').then(m => m.registerSkills());
  import('./lib/services/notificationService').then(m => m.initNotificationService());
  import('./lib/services/historyService').then(m => m.initHistoryService());
  import('./lib/services/storageService').then(m => m.initStorageService());
  import('./lib/services/updateService').then(m => m.initUpdateService());
  import('./lib/pwa/backgroundSync').then(m => m.initBackgroundSync());
  import('./lib/pwa/versionManager').then(m => m.initVersionManager());
};
if ('requestIdleCallback' in window) {
  requestIdleCallback(initServices);
} else {
  setTimeout(initServices, 100);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router basename={import.meta.env.BASE_URL}>
      <App />
    </Router>
  </React.StrictMode>
);

// Whole-site offline cache (games excluded — see public/sw.js).
// Dev only: Vite rewrites bare imports into versioned /node_modules/.vite/deps
// URLs at transform time, so caching /src modules serves the previous
// optimize hash after every re-bundle (504 Outdated Optimize Dep + failed
// lazy-route imports). Register in builds only, and drop any SW a dev session
// left behind so the dev server is never intercepted.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then(list => list.forEach(reg => reg.unregister()))
      .catch(() => {});
  }
}

// Anti-theft: frame-bust, devtools lockdown, inspection prevention.
initializeAntiTheft();
