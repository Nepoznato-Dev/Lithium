import React, { lazy, Suspense } from 'react';
import { usePhoneMode } from '../lib/desktop/phoneMode';

const DesktopView = lazy(() => import('../Components/Desktop/DesktopView'));
const MobileShell = lazy(() => import('../Components/Desktop/Mobile'));

/**
 * Home route ("/") renders the OS shell. On a phone viewport this is the
 * iOS-style MobileShell, on a desktop-wide screen the Windows-style DesktopView.
 * Turning the touch shell on for a desktop (Settings → Appearance → Shell
 * layout, or `?ui=phone`) makes MobileShell present itself macOS-style instead.
 * Every variant shares the same state and look — only the layout differs.
 */
export default function Dashboard() {
  const phone = usePhoneMode();
  return (
    <Suspense fallback={null}>
      {phone ? <MobileShell /> : <DesktopView />}
    </Suspense>
  );
}
