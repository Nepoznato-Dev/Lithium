import React, { Component, lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from './lib/router';
import Shell from './Components/layout/Shell';
import { SettingsProvider } from './Components/SettingsContext';
import Dashboard from './pages/Dashboard';
import WelcomeScreen from './pages/WelcomeScreen';
import { hasPin } from './lib/desktop/ui';
import { initExtensions } from './lib/extensions/extManager';
import PwaInstallBanner from './Components/PwaInstallBanner';
import { initSyncBridge } from './lib/fs/localSyncBridge';

const WELCOME_KEY = 'lithium:welcome-done';

const LockScreen = lazy(() => import('./Components/Desktop/LockScreen'));
const BootAnimation = lazy(() => import('./Components/Desktop/BootAnimation'));

/* Shell routes are lazy so the idle desktop bundle stays small. */
const Games = React.lazy(() => import('./pages/Games'));
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
const ShareTarget = React.lazy(() => import('./pages/ShareTarget'));

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
function LockController({ locked: _locked, setLocked }) {
  useEffect(() => {
    const onLock = () => {
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
  const [welcomed, setWelcomed] = useState(() => localStorage.getItem(WELCOME_KEY) === '1');
  const [booted, setBooted] = useState(() => localStorage.getItem('lithium:boot-seen') === '1' || localStorage.getItem('lithium:boot-disabled') === '1');

  useEffect(() => {
    initExtensions();
  }, []);

  useEffect(() => {
    initSyncBridge();
  }, []);

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_KEY, '1');
    setWelcomed(true);
  };

  if (!welcomed) {
    return (
      <ErrorBoundary>
        <WelcomeScreen onDone={dismissWelcome} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {!booted && (
        <Suspense fallback={null}>
          <BootAnimation onComplete={() => setBooted(true)} />
        </Suspense>
      )}
      <SettingsProvider>
        <DesktopWindowProvider>
          <LockController locked={locked} setLocked={setLocked} />
          <Routes>
            <Route path="/share-target" element={<Suspense fallback={null}><ShareTarget /></Suspense>} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/privacy" element={<Suspense fallback={null}><Privacy /></Suspense>} />
            <Route path="/yuki" element={<Suspense fallback={null}><YukiStuff /></Suspense>} />
            <Route path="/yuki/customization" element={<Suspense fallback={null}><YukiCustomization /></Suspense>} />
            <Route path="/yuki/settings" element={<Suspense fallback={null}><YukiSettings /></Suspense>} />
            <Route path="/yuki/themes" element={<Suspense fallback={null}><YukiThemes /></Suspense>} />
            <Route path="/yuki/about" element={<Suspense fallback={null}><YukiAbout /></Suspense>} />
            <Route element={<Shell />}>
              <Route path="/games" element={<Suspense fallback={null}><Games /></Suspense>} />
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
          <PwaInstallBanner />
        </DesktopWindowProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
