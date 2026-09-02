/**
 * BackgroundControls — floating control bar at the bottom-right.
 * Combines search provider pills (left) with background rotation controls (right).
 */
import { currentBackground, bgPaused, nextBackground, prevBackground, toggleBgPause } from './stores/newTabStore';
import { activeSearchProvider } from './stores/searchStore';
import { SCRAPE_PROVIDERS } from '../../lib/searchProxy';
import Icon from '../../Components/Icon';

export default function BackgroundControls() {
  const bg = currentBackground.value;
  const paused = bgPaused.value;
  const providerKeys = Object.keys(SCRAPE_PROVIDERS);
  const activeKey = activeSearchProvider.value;

  return (
    <div className="ntp-bottom-bar">
      {/* Provider pills — left side */}
      <div className="ntp-bottom-providers">
        {providerKeys.map(key => (
          <button
            key={key}
            className={`ntp-bottom-pill ${activeKey === key ? 'ntp-bottom-pill--active' : ''}`}
            onClick={() => { activeSearchProvider.value = key; }}
          >
            {SCRAPE_PROVIDERS[key].label}
          </button>
        ))}
      </div>

      {/* Background rotation controls — right side (only if background exists) */}
      {bg && (
        <div className="ntp-bottom-bg">
          <button
            className="ntp-bottom-icon"
            onClick={prevBackground}
            aria-label="Previous background"
          >
            <Icon name="ChevronLeft" className="h-3.5 w-3.5" />
          </button>
          <button
            className="ntp-bottom-icon"
            onClick={toggleBgPause}
            aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
          >
            <Icon name={paused ? 'Play' : 'Pause'} className="h-3 w-3" />
          </button>
          <button
            className="ntp-bottom-icon"
            onClick={nextBackground}
            aria-label="Next background"
          >
            <Icon name="ChevronRight" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
