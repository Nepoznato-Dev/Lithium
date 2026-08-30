import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './desktop.css';
import App from './App';
import { coreReady, wasmStatus } from './lib/core';
import { hydrateKv } from './lib/storage/kvTier';

// Warm up the Rust core wasm early so sync facades (markdown, fs ops) are
// available by the time the first window renders.
coreReady().then(() => {
  // Expose diagnostic helper on window for DevTools debugging.
  window.__lithiumWasm = wasmStatus;
});

// Hydrate the unified local tier (overflowed chats/memory/audit from IDB).
hydrateKv();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Whole-site offline cache (games excluded — see public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
