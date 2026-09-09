/**
 * SearchWidget — Brave-style centered search bar for the new tab page.
 * Clean floating container with engine icon dropdown on the left.
 * Matches Brave's search box: rounded pill shape, subtle shadow, expands on focus.
 * Supports onFocus/onBlur callbacks for the background blur effect.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';

/** Small chevron-down icon for the engine picker trigger. */
function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function SearchWidget({ value, onInput, onSubmit, activeProvider, onProviderChange, onFocus, onBlur }) {
  const provider = SCRAPE_PROVIDERS[activeProvider]?.label || activeProvider;
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
          {/* Engine picker — left side (Brave pattern: icon + dropdown) */}
          <div className="ntp-engine-picker-trigger" ref={pickerRef}>
            <button
              type="button"
              className="ntp-engine-trigger-btn"
              title={`${provider} — click to switch`}
              onClick={() => setPickerOpen(!pickerOpen)}
              aria-label={`Search engine: ${provider}`}
            >
              <span className="ntp-engine-letter">{provider[0]}</span>
              <ChevronDown />
            </button>
            {pickerOpen && (
              <div className="ntp-engine-picker">
                {engineKeys.map(key => {
                  const p = SCRAPE_PROVIDERS[key];
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
                      <span className="ntp-engine-icon-circle">{p.label[0]}</span>
                      <span className="ntp-engine-item-label">{p.label}</span>
                      {key === activeProvider && (
                        <svg className="ntp-engine-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Search input */}
          <input
            autoFocus
            className="ntp-search-input"
            placeholder={`Search ${provider}…`}
            value={value}
            onInput={e => onInput(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-label={`Search ${provider}`}
            tabIndex={1}
          />
        </div>
      </form>
    </div>
  );
}
