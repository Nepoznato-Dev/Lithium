import React, { useEffect, useRef } from 'react';
import { mountApp, unmountApp } from '../../../lib/li-apps/liRuntime';

/**
 * Desktop app component that hosts a .li application inside a
 * Shadow DOM container.  Used by the window manager to render
 * any .li app as a first-class desktop window.
 */
export default function LiAppHost({ manifest }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !manifest) return;

    let cancelled = false;

    // The title-change callback dispatches a custom event that
    // DesktopWindow can pick up to update the window title bar.
    const onTitleChange = (title) => {
      window.dispatchEvent(new CustomEvent('lithium:li-app-title', {
        detail: { appId: `li-${manifest.id}`, title },
      }));
    };

    mountApp(el, manifest, onTitleChange).then(() => {
      if (cancelled) unmountApp(el);
    });

    return () => {
      cancelled = true;
      unmountApp(el);
    };
  }, [manifest]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}
