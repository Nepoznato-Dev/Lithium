/**
 * BackgroundImage — full-viewport background with image + color fallback.
 *
 * Follows Brave's NTP pattern:
 *   1. Show the solid `color` immediately (no blank flash).
 *   2. Preload the remote image via JS Image object.
 *   3. Fade the image in once loaded; stay on color if load fails.
 *   4. Show attribution overlay in the bottom-left corner.
 */
import { useState, useEffect } from 'preact/hooks';
import { currentBackground, currentBgIndex } from './stores/newTabStore';

export default function BackgroundImage() {
  const bg = currentBackground.value;
  const idx = currentBgIndex.value;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reset load/failed state when the background index changes
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    if (!bg?.src) { setFailed(true); return; }

    const img = new Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setFailed(true);
    img.src = bg.src;
  }, [idx]);

  const fallbackColor = bg?.color || '#1a1a2e';

  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      {/* Solid color layer — always visible as base / fallback */}
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{ backgroundColor: fallbackColor }}
      />

      {/* Dark gradient overlay for text readability — matches Brave's getBackground() */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0) 35%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      {/* Image layer — only rendered once loaded, fades in via key remount */}
      {!failed && bg?.src && (
        <div
          key={idx}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${bg.src})`,
            opacity: loaded ? 1 : 0,
            willChange: 'opacity',
          }}
        />
      )}

      {/* Attribution text — bottom-left */}
      {loaded && bg?.author && (
        <div className="absolute bottom-4 left-4 text-xs text-white/40 select-none">
          <span>{bg.title}</span>
          {bg.author && <span> by {bg.author}</span>}
          {bg.attribution && <span> / {bg.attribution}</span>}
        </div>
      )}
    </div>
  );
}
