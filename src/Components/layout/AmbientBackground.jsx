import React from 'react';
import { useSettings } from '../SettingsContext';

/**
 * Lightweight ambient background: two slow-drifting blurred gradient orbs.
 * Pure CSS animation — no canvas, no JS per frame. Intensity and visibility
 * are driven by Settings → Background.
 */
export default function AmbientBackground() {
  const { settings } = useSettings();
  const { enabled, intensity } = settings.background;

  if (!enabled || settings.performance.lowEndMode) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ opacity: intensity }}>
      <div
        className="animate-drift absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full blur-[120px]"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
      />
      <div className="animate-drift-slow absolute -bottom-52 -right-40 h-[38rem] w-[38rem] rounded-full bg-indigo-500/[0.06] blur-[130px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#0a0a0f_75%)]" />
    </div>
  );
}
