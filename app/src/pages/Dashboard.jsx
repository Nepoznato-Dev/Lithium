import React, { lazy, Suspense } from 'react';

const DesktopView = lazy(() => import('../Components/Desktop/DesktopView'));

/** Dashboard route renders the full desktop experience. */
export default function Dashboard() {
  return (
    <Suspense fallback={null}>
      <DesktopView />
    </Suspense>
  );
}
