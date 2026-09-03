import React from 'react';
import Icon from '../../Icon';
import {
  buildMsnWeatherUrl,
  unitSymbol,
  weatherDescription,
  weatherEmoji,
  summaryLine,
} from '../../../lib/deviceContext';

function WeatherStat({ label, value }) {
  return (
    <div className="nx-wx-stat">
      <span className="nx-wx-stat-label">{label}</span>
      <span className="nx-wx-stat-value">{value}</span>
    </div>
  );
}

export default function WeatherFlyout({ weather, locationInfo, aiOutlook, newsItems, refreshWeather, setWeatherOpen, getApp, openWindow, launchApp, openDynMenu }) {
  return (
    <div className="nx-weather-popup" onClick={event => event.stopPropagation()} onContextMenu={event => openDynMenu(event, [
      { id: 'refresh', label: 'Refresh weather', icon: 'RotateCw', action: () => refreshWeather(true) },
      { id: 'forecast', label: 'Open detailed forecast', icon: 'Cloud', action: () => {
        setWeatherOpen(false);
        const browser = getApp('browser');
        const msnUrl = locationInfo ? buildMsnWeatherUrl(locationInfo.city) : '';
        if (browser && msnUrl) openWindow({ id: browser.id, title: browser.name, icon: <Icon name={browser.icon} size={16} />, component: <BrowserStub initialUrl={msnUrl} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
      }},
      { id: 'ai-report', label: 'AI weather report', icon: 'BrainCircuit', action: () => {
        setWeatherOpen(false);
        launchApp('ai-hub');
        setTimeout(() => window.dispatchEvent(new Event('lithium:ai-report')), 150);
      }},
    ])}>
      <div className="nx-wx-header">
        <div className="nx-wx-title">
          {locationInfo ? `${locationInfo.city}${locationInfo.state ? `, ${locationInfo.state}` : ''}` : 'Local weather'}
        </div>
        <div className="nx-wx-actions">
          <button className="nx-footer-icon" style={{ width: 24, height: 24 }} title="Refresh" onClick={() => refreshWeather(true)}><Icon name="RotateCw" size={12} /></button>
          <button className="nx-footer-icon" style={{ width: 24, height: 24 }} title="Close" onClick={() => setWeatherOpen(false)}>×</button>
        </div>
      </div>
      {weather?.data ? (() => {
        const current = weather.data.current || {};
        const daily = weather.data.daily || {};
        const deg = unitSymbol(weather.unit);
        const msnUrl = locationInfo ? buildMsnWeatherUrl(locationInfo.city) : '';
        return (
          <>
            <div className="nx-wx-current">
              <span className="nx-wx-emoji">{weatherEmoji(current.weather_code, current.is_day)}</span>
              <div style={{ flex: 1 }}>
                <div className="nx-wx-temp">{Math.round(current.temperature_2m)}{deg}</div>
                <div className="nx-wx-desc">{weatherDescription(current.weather_code)}</div>
              </div>
              <div className="nx-wx-hl">
                <div>H: {Math.round(daily.temperature_2m_max?.[0])}{deg}</div>
                <div>L: {Math.round(daily.temperature_2m_min?.[0])}{deg}</div>
              </div>
            </div>
            <div className="nx-wx-grid">
              <WeatherStat label="Feels like" value={`${Math.round(current.apparent_temperature)}${deg}`} />
              <WeatherStat label="Humidity" value={`${current.relative_humidity_2m}%`} />
              <WeatherStat label="Wind" value={`${current.wind_speed_10m} km/h`} />
              <WeatherStat label="Pressure" value={`${Math.round(current.pressure_msl)} hPa`} />
              <WeatherStat label="Clouds" value={`${current.cloud_cover}%`} />
              <WeatherStat label="Rain chance" value={`${daily.precipitation_probability_max?.[0] ?? '—'}%`} />
              <WeatherStat label="UV index" value={`${daily.uv_index_max?.[0] ?? '—'}`} />
              <WeatherStat label="Sunrise / set" value={`${(daily.sunrise?.[0] || '').split('T')[1]?.slice(0, 5) || '—'} / ${(daily.sunset?.[0] || '').split('T')[1]?.slice(0, 5) || '—'}`} />
            </div>
            <p className="nx-wx-summary">
              {aiOutlook ? `✨ ${aiOutlook}` : summaryLine(current, daily)}
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {msnUrl && (
                <button
                  className="nx-menu-item"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 11 }}
                  onClick={() => {
                    setWeatherOpen(false);
                    const browser = getApp('browser');
                    if (browser) openWindow({ id: browser.id, title: browser.name, icon: <Icon name={browser.icon} size={16} />, component: <BrowserStub initialUrl={msnUrl} />, replaceTab: true, newWindow: false, x: 120, y: 60, width: 1000, height: 700 });
                  }}
                >
                  <Icon name="Cloud" size={12} style={{ marginRight: 4 }} /> Detailed forecast
                </button>
              )}
              <button
                className="nx-menu-item"
                style={{ flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 11 }}
                onClick={() => {
                  setWeatherOpen(false);
                  launchApp('ai-hub');
                  setTimeout(() => window.dispatchEvent(new Event('lithium:ai-report')), 150);
                }}
              >
                <Icon name="BrainCircuit" size={12} style={{ marginRight: 4 }} /> AI report
              </button>
            </div>
            {/* News section */}
            {newsItems.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top stories</div>
                {newsItems.map((item, i) => (
                  <a
                    key={i}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="nx-menu-item"
                    style={{ padding: '6px 8px', borderRadius: 4, fontSize: 11, marginBottom: 2, textDecoration: 'none', color: 'rgba(255,255,255,0.75)', display: 'block' }}
                  >
                    {item.title.slice(0, 80)}{item.title.length > 80 ? '…' : ''}
                  </a>
                ))}
              </div>
            )}
          </>
        );
      })() : (
        <div className="nx-wx-enable">
          <p>Weather needs your general location. It is fetched from open-meteo and cached on this device only.</p>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => refreshWeather(true)}>Enable location</button>
        </div>
      )}
    </div>
  );
}

// Lazy browser import helper — used in weather flyout for "detailed forecast"
const BrowserStub = React.lazy(() => import('../../../pages/Browser'));
