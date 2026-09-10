/**
 * NtpSettingsModal — Brave-style NTP customization dialog.
 * Left sidebar with panels: Background, Clock, Top Sites, Widgets.
 * Each panel has toggles and controls for that NTP section.
 */
import { useState } from 'preact/hooks';
import {
  showTopSites, showClock, showStatsWidget, showNewsWidget,
  clock24Hour, showBackgroundImages,
  currentBackground, nextBackground, prevBackground, randomBackground,
} from './stores/newTabStore';

const PANELS = [
  { id: 'background', label: 'Background', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'clock', label: 'Clock', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'topsites', label: 'Top Sites', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { id: 'widgets', label: 'Widgets', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
];

export default function NtpSettingsModal({ isOpen, onClose }) {
  const [panel, setPanel] = useState('background');
  const bg = currentBackground.value;

  if (!isOpen) return null;

  return (
    <div className="ntp-modal-backdrop" onClick={onClose}>
      <div className="ntp-settings-modal" onClick={e => e.stopPropagation()}>
        {/* Sidebar */}
        <nav className="ntp-settings-sidebar">
          <h4 className="ntp-settings-title">Customize</h4>
          {PANELS.map(p => (
            <button
              key={p.id}
              className={`ntp-settings-nav${panel === p.id ? ' ntp-settings-nav--active' : ''}`}
              onClick={() => setPanel(p.id)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d={p.icon} />
              </svg>
              <span>{p.label}</span>
            </button>
          ))}
        </nav>

        {/* Panel content */}
        <div className="ntp-settings-panel">
          <div className="ntp-settings-header">
            <h3>{PANELS.find(p => p.id === panel)?.label}</h3>
            <button className="ntp-settings-close" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {panel === 'background' && (
            <div className="ntp-settings-body">
              <ToggleRow label="Show background images" checked={showBackgroundImages.value} onChange={v => { showBackgroundImages.value = v; }} />
              <div className="ntp-settings-bg-preview">
                <div className="ntp-bg-thumb" style={{ background: bg?.color || '#333' }}>
                  {bg?.title && <span className="ntp-bg-thumb-label">{bg.title}</span>}
                </div>
                <div className="ntp-bg-nav-btns">
                  <button className="ntp-bg-nav-btn" onClick={prevBackground} title="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button className="ntp-bg-nav-btn" onClick={randomBackground} title="Random">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                  </button>
                  <button className="ntp-bg-nav-btn" onClick={nextBackground} title="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {panel === 'clock' && (
            <div className="ntp-settings-body">
              <ToggleRow label="Show clock" checked={showClock.value} onChange={v => { showClock.value = v; }} />
              <ToggleRow label="24-hour format" checked={clock24Hour.value} onChange={v => { clock24Hour.value = v; }} />
            </div>
          )}

          {panel === 'topsites' && (
            <div className="ntp-settings-body">
              <ToggleRow label="Show top sites" checked={showTopSites.value} onChange={v => { showTopSites.value = v; }} />
            </div>
          )}

          {panel === 'widgets' && (
            <div className="ntp-settings-body">
              <ToggleRow label="Show stats widget" checked={showStatsWidget.value} onChange={v => { showStatsWidget.value = v; }} />
              <ToggleRow label="Show news widget" checked={showNewsWidget.value} onChange={v => { showNewsWidget.value = v; }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="ntp-settings-row">
      <span className="ntp-settings-row-label">{label}</span>
      <button
        className={`ntp-toggle${checked ? ' ntp-toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ntp-toggle-knob" />
      </button>
    </div>
  );
}
