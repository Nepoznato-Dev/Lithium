/**
 * SearchWidget — Brave-style centered search bar for the new tab page.
 * Solid container style (12px radius) with clickable provider badge
 * that opens an engine picker dropdown.
 * Supports onFocus/onBlur callbacks for the background blur effect.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';
import Icon from '../../Components/Icon';

export default function SearchWidget({ value, onInput, onSubmit, activeProvider, onProviderChange, onFocus, onBlur }) {
  const provider = SCRAPE_PROVIDERS[activeProvider]?.label || activeProvider;
  const badge = provider.split(' ').map(w => w[0]).join('').toUpperCase();

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const engineKeys = Object.keys(SCRAPE_PROVIDERS);

  return (
    <div className="ntp-search-wrap">
      <form className="ntp-search-form" onSubmit={onSubmit}>
        <div className="ntp-search-input-wrap">
          <Icon name="Search" className="ntp-search-icon-left" />
          <input
            autoFocus
            className="ntp-search-input"
            placeholder={`Search ${provider}\u2026`}
            value={value}
            onInput={e => onInput(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-label={`Search ${provider}`}
            tabIndex={1}
          />
          <div className="ntp-engine-picker-wrap" ref={pickerRef}>
            <button
              type="button"
              className="ntp-search-badge"
              title={`${provider} — click to switch`}
              onClick={() => setPickerOpen(!pickerOpen)}
            >
              {badge}
            </button>
            {pickerOpen && (
              <div className="ntp-engine-picker">
                {engineKeys.map(key => {
                  const p = SCRAPE_PROVIDERS[key];
                  const shortLabel = p.label.split(' ').map(w => w[0]).join('').toUpperCase();
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`ntp-engine-item${key === activeProvider ? ' ntp-engine-item--active' : ''}`}
                      onClick={() => {
                        onProviderChange?.(key);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="ntp-engine-badge">{shortLabel}</span>
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
