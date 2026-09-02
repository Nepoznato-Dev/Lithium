/**
 * ShieldsPanel — Brave-style shields dropdown.
 * Slide-down panel with master toggle, stats ring, and per-site controls.
 */
import { useEffect, useRef } from 'preact/hooks';
import { shieldsPanelOpen } from './stores/browserStore';
import {
  globalStats, totalBlocked, shieldsEnabled as shieldsGlobal,
  toggleShields, getSiteOverride, setSiteOverride
} from './stores/shieldsStore';
import { currentUrl } from './stores/tabStore';
import * as core from '../../lib/core';
import Icon from '../../Components/Icon';

function hostname(url) {
  const result = core.browserHostnameSync(url);
  if (result) return result;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function ShieldsPanel() {
  const panelRef = useRef(null);
  const open = shieldsPanelOpen.value;
  const url = currentUrl.value;
  const site = url ? hostname(url) : '';
  const override = site ? getSiteOverride(site) : null;
  const stats = globalStats.value;
  const total = totalBlocked.value;
  const enabled = shieldsGlobal.value;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        shieldsPanelOpen.value = false;
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!open) return null;

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(total / 50, 1);
  const dashOffset = circumference * (1 - progress);

  const toggleSiteSetting = (key) => {
    if (!site || !override) return;
    setSiteOverride(site, { ...override, [key]: !override[key] });
  };

  return (
    <div
      ref={panelRef}
      className="browser-dropdown absolute right-12 top-full z-50 mt-1 w-80"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FB542B]/15">
            <Icon name="Shield" className="h-4 w-4 text-[#FB542B]" />
          </div>
          <div>
            <span className="text-sm font-semibold text-white">Shields</span>
            <span className="ml-2 text-[10px] text-white/30">{enabled ? 'UP' : 'DOWN'}</span>
          </div>
        </div>
        <button
          className={`browser-toggle ${enabled ? 'browser-toggle--on' : 'browser-toggle--off'}`}
          onClick={toggleShields}
          aria-label="Toggle shields"
        >
          <span className="browser-toggle__knob" />
        </button>
      </div>

      {/* Stats ring */}
      <div className="flex items-center gap-4 border-b border-white/[0.06] px-4 py-4">
        <div className="relative">
          <svg width="68" height="68" viewBox="0 0 68 68">
            <circle cx="34" cy="34" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5" />
            <circle
              cx="34" cy="34" r={radius} fill="none"
              stroke="#FB542B" stroke-width="5"
              stroke-linecap="round"
              stroke-dasharray={circumference}
              stroke-dashoffset={dashOffset}
              transform="rotate(-90 34 34)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold text-white">{total}</span>
            <span className="text-[8px] text-white/35">blocked</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-[11px]">
          <div className="flex items-center gap-2 text-white/45">
            <span className="h-2 w-2 rounded-full bg-[#FB542B]" />
            {stats.adsBlocked} ads blocked
          </div>
          <div className="flex items-center gap-2 text-white/45">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            {stats.trackersBlocked} trackers blocked
          </div>
          <div className="flex items-center gap-2 text-white/45">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            {stats.httpsUpgrades} HTTPS upgrades
          </div>
          <div className="flex items-center gap-2 text-white/45">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            {stats.scriptsBlocked} scripts blocked
          </div>
        </div>
      </div>

      {/* Per-site controls */}
      {site && override && (
        <div className="px-4 py-3">
          <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-white/25">
            Controls for {site}
          </p>
          <div className="flex flex-col gap-2.5">
            <ToggleRow label="Trackers & Ads" checked={override.blockAds} onChange={() => toggleSiteSetting('blockAds')} />
            <ToggleRow label="Fingerprinting protection" checked={override.blockFingerprinting} onChange={() => toggleSiteSetting('blockFingerprinting')} />
            <ToggleRow label="HTTPS upgrade" checked={override.upgradeHttps} onChange={() => toggleSiteSetting('upgradeHttps')} />
            <ToggleRow label="Block scripts" checked={override.blockScripts} onChange={() => toggleSiteSetting('blockScripts')} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-4 py-2.5">
        <p className="text-[10px] text-white/20">
          {enabled ? 'Shields are protecting you on this site' : 'Shields are down — no protection active'}
        </p>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/55">{label}</span>
      <button
        className={`browser-toggle ${checked ? 'browser-toggle--on' : 'browser-toggle--off'}`}
        onClick={onChange}
        style={{ width: '32px', height: '18px' }}
      >
        <span
          className="browser-toggle__knob"
          style={{ width: '14px', height: '14px', top: '2px', ...(checked ? { left: '16px' } : { left: '2px' }) }}
        />
      </button>
    </div>
  );
}
