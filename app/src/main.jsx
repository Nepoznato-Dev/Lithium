import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
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
  import('./lib/services/aiService').then(m => m.initAiService());
  import('./lib/services/notificationService').then(m => m.initNotificationService());
  import('./lib/services/historyService').then(m => m.initHistoryService());
  import('./lib/services/storageService').then(m => m.initStorageService());
  import('./lib/services/updateService').then(m => m.initUpdateService());
};
if ('requestIdleCallback' in window) {
  requestIdleCallback(initServices);
} else {
  setTimeout(initServices, 100);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Whole-site offline cache (games excluded — see public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

// Anti-theft: frame-bust, devtools lockdown, inspection prevention.
initializeAntiTheft();
