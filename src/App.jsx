import React, { Component, lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import Shell from './Components/layout/Shell';
import { SettingsProvider } from './Components/SettingsContext';
import Dashboard from './pages/Dashboard';
import { hasPin } from './lib/desktop/ui';

const LockScreen = lazy(() => import('./Components/Desktop/LockScreen'));

/* Shell routes are lazy so the idle desktop bundle stays small. */
const Music = React.lazy(() => import('./pages/Music'));
const Browser = React.lazy(() => import('./pages/Browser'));
const Calculator = React.lazy(() => import('./pages/Calculator'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const Fake404 = React.lazy(() => import('./pages/Fake404'));
const YukiStuff = React.lazy(() => import('./pages/YukiStuff'));
const YukiCustomization = React.lazy(() => import('./pages/YukiCustomization'));
const YukiSettings = React.lazy(() => import('./pages/YukiSettings'));
const YukiThemes = React.lazy(() => import('./pages/YukiThemes'));
const YukiAbout = React.lazy(() => import('./pages/YukiAbout'));

import { DesktopWindowProvider } from './Components/Desktop/DesktopWindowManager';

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lithium error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="glass max-w-md p-8 text-center">
            <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            <p className="mt-2 text-sm text-white/50">
              Lithium hit an unexpected error. Your local data is safe.
            </p>
            <button className="btn-primary mt-6" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Listens for `lithium:lock-screen` events and the Ctrl+Alt+L hotkey. */
function LockController({ locked, setLocked }) {
  useEffect(() => {
    const onLock = () => {
      // Locking is allowed even when no PIN is set — the lock screen just
      // hides content until the user clicks Unlock.
      setLocked(true);
    };
    const onKey = event => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        onLock();
      }
    };
    window.addEventListener('lithium:lock-screen', onLock);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('lithium:lock-screen', onLock);
      window.removeEventListener('keydown', onKey);
    };
  }, [setLocked]);
  return null;
}

export default function App() {
  const [locked, setLocked] = useState(() => hasPin());

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <DesktopWindowProvider>
          <LockController locked={locked} setLocked={setLocked} />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/privacy" element={<Suspense fallback={null}><Privacy /></Suspense>} />
            <Route path="/yuki" element={<Suspense fallback={null}><YukiStuff /></Suspense>} />
            <Route path="/yuki/customization" element={<Suspense fallback={null}><YukiCustomization /></Suspense>} />
            <Route path="/yuki/settings" element={<Suspense fallback={null}><YukiSettings /></Suspense>} />
            <Route path="/yuki/themes" element={<Suspense fallback={null}><YukiThemes /></Suspense>} />
            <Route path="/yuki/about" element={<Suspense fallback={null}><YukiAbout /></Suspense>} />
            <Route element={<Shell />}>
              <Route path="/music" element={<Suspense fallback={null}><Music /></Suspense>} />
              <Route path="/browser" element={<Suspense fallback={null}><Browser /></Suspense>} />
              <Route path="/calculator" element={<Suspense fallback={null}><Calculator /></Suspense>} />
              <Route path="/settings" element={<Suspense fallback={null}><Settings /></Suspense>} />
            </Route>
            <Route path="*" element={<Suspense fallback={null}><Fake404 /></Suspense>} />
          </Routes>
          {locked && (
            <Suspense fallback={null}>
              <LockScreen onUnlock={() => setLocked(false)} />
            </Suspense>
          )}
        </DesktopWindowProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
