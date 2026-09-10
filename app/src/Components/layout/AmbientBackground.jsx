import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '../SettingsContext';

/**
 * Lightweight ambient background: three slow-drifting blurred gradient orbs.
 * Pure CSS animation — no canvas, no JS per frame. Intensity and visibility
 * are driven by Settings → Background. Pauses CSS animations when not visible
 * using IntersectionObserver to save GPU cycles.
 */
export default function AmbientBackground() {
  const { settings } = useSettings();
  const { enabled, intensity } = settings.background;
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

  if (!enabled || settings.performance.lowEndMode) return null;

  return (
    <div ref={containerRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ opacity: intensity }}>
      <div
        className="animate-drift absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full blur-[140px]"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)', animationPlayState: visible ? 'running' : 'paused' }}
      />
      <div className="animate-drift-slow absolute -bottom-52 -right-40 h-[38rem] w-[38rem] rounded-full bg-indigo-500/[0.04] blur-[140px]" style={{ animationPlayState: visible ? 'running' : 'paused' }} />
      <div
        className="animate-drift-ultra absolute left-1/3 top-1/2 h-[28rem] w-[28rem] rounded-full blur-[150px]"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 3%, transparent)', opacity: 0.6, animationPlayState: visible ? 'running' : 'paused' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#0a0a0f_75%)]" />
    </div>
  );
}
