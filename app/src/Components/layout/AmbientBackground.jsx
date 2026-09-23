import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '../SettingsContext';
import PixelDataStream from './PixelDataStream';

/**
 * Ambient background — Watch Dogs 2 / ctOS-inspired "default background".
 *
 * Layers (back to front):
 *   1. Slow-drifting blurred neon orbs (cyan / orange / pink) — pure CSS.
 *   2. A faint perspective pixel-grid, echoing ctOS hacking-HUD overlays.
 *   3. A soft scanline sweep for a "live feed" feel.
 *   4. A lightweight canvas layer of blinking data-pixels drifting upward.
 *
 * Intensity/visibility are driven by Settings → Background. Low-end mode and
 * "reduced/none" motion settings scale everything down or disable it outright
 * so the effect never costs more than the device can afford.
 */
export default function AmbientBackground() {
  const { settings } = useSettings();
  const { enabled, intensity } = settings.background;
  const lowEndMode = settings.performance.lowEndMode;
  const motion = settings.motion?.animations ?? 'full';
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(true);

  // Pause CSS animations when component scrolls off-screen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (!enabled || lowEndMode) return null;

  const motionOff = motion === 'none';
  const motionReduced = motion === 'reduced';

  return (
    <div ref={containerRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#07070c]" style={{ opacity: intensity }}>
      {/* Neon drift orbs — cyan / orange / pink, WD2-inspired palette */}
      <div
        className="animate-drift absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full blur-[140px]"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 9%, transparent)', animationPlayState: visible ? 'running' : 'paused' }}
      />
      <div
        className="animate-drift-slow absolute -bottom-52 -right-40 h-[38rem] w-[38rem] rounded-full bg-orange-500/[0.05] blur-[140px]"
        style={{ animationPlayState: visible ? 'running' : 'paused' }}
      />
      <div
        className="animate-drift-ultra absolute left-1/3 top-1/2 h-[28rem] w-[28rem] rounded-full bg-pink-500/[0.04] blur-[150px]"
        style={{ opacity: 0.7, animationPlayState: visible ? 'running' : 'paused' }}
      />

      {/* ctOS-style pixel grid — subtle perspective floor grid */}
      <div className="wd-grid absolute inset-0" style={{ animationPlayState: !motionOff && visible ? 'running' : 'paused' }} />

      {/* Scanline sweep — evokes a live hacking-feed overlay */}
      {!motionOff && (
        <div className="wd-scanline absolute inset-x-0" style={{ animationPlayState: visible ? 'running' : 'paused' }} />
      )}

      {/* Drifting neon data-pixels (canvas, throttled + visibility-aware) */}
      {!motionOff && visible && (
        <PixelDataStream count={36} opacity={0.55} lowEndMode={lowEndMode} reducedMotion={motionReduced} />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#07070c_78%)]" />
    </div>
  );
}
