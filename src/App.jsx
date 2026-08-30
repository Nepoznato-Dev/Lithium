import React, { Component, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import Shell from './Components/layout/Shell';
import { SettingsProvider } from './Components/SettingsContext';
import Dashboard from './pages/Dashboard';
import LockScreen from './Components/Desktop/LockScreen';
import { hasPin } from './lib/desktop/ui';

/* Shell routes are lazy so the idle desktop bundle stays small. */
const Games = React.lazy(() => import('./pages/Games'));
const Music = React.lazy(() => import('./pages/Music'));
const Browser = React.lazy(() => import('./pages/Browser'));
const Calculator = React.lazy(() => import('./pages/Calculator'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const Fake404 = React.lazy(() => import('./pages/Fake404'));
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
          <Route element={<Shell />}>
            <Route path="/games" element={<Suspense fallback={null}><Games /></Suspense>} />
            <Route path="/music" element={<Suspense fallback={null}><Music /></Suspense>} />
            <Route path="/browser" element={<Suspense fallback={null}><Browser /></Suspense>} />
            <Route path="/calculator" element={<Suspense fallback={null}><Calculator /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={null}><Settings /></Suspense>} />
          </Route>
          <Route path="*" element={<Suspense fallback={null}><Fake404 /></Suspense>} />
          </Routes>
          {locked && <LockScreen onUnlock={() => setLocked(false)} />}
        </DesktopWindowProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
