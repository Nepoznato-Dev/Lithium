/**
 * Device context: geolocation + open-meteo weather (free, keyless, CORS-open)
 * used by the AI Hub to build full environment reports.
 */

import { storage } from './storage/localStorage';

/** Ask for the device's general location. Resolves null when denied/unavailable. */
export function requestLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      position => {
        const loc = {
          lat: Number(position.coords.latitude.toFixed(3)),
          lon: Number(position.coords.longitude.toFixed(3)),
          label: 'your device location',
        };
        saveLastLocation(loc);
        resolve(loc);
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 }
    );
  });
}

/* ---------- Location & weather caching (silent refresh on login) ---------- */

export function saveLastLocation(loc) {
  storage.set('last-location', loc);
}

export function loadLastLocation() {
  return storage.get('last-location', null);
}

export function saveWeatherCache(payload) {
  storage.set('weather-cache', payload);
}

export function loadWeatherCache() {
  return storage.get('weather-cache', null);
}

/** Current geolocation permission state without triggering a prompt. */
export async function locationPermission() {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state || 'prompt';
  } catch {
    return 'prompt';
  }
}

/** Current conditions + today's forecast from open-meteo. */
export async function fetchWeather(lat, lon, temperatureUnit = 'celsius') {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '1',
    temperature_unit: temperatureUnit,
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}

const _WMO_DESC = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'depositing rime fog', 51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
  61: 'slight rain', 63: 'moderate rain', 65: 'heavy rain', 71: 'slight snow', 73: 'moderate snow',
  75: 'heavy snow', 77: 'snow grains', 80: 'slight rain showers', 81: 'moderate rain showers',
  82: 'violent rain showers', 85: 'slight snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with slight hail', 99: 'thunderstorm with heavy hail',
};
function _wDesc(code) { return _WMO_DESC[code] || 'changing conditions'; }
function _wEmoji(code, isDay) {
  if (code === 0 || code === 1) return isDay ? '☀️' : '🌙';
  if (code === 2) return isDay ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '🌨️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code === 85 || code === 86) return '❄️';
  if (code >= 95 && code <= 99) return '⛈️';
  return '🌥️';
}
function _compass(deg) {
  const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return d[Math.round(deg / 22.5) % 16];
}
function _uvLabel(uv) {
  if (uv < 3) return 'low'; if (uv < 6) return 'moderate'; if (uv < 8) return 'high'; if (uv < 11) return 'very high'; return 'extreme';
}

export const weatherDescription = code => _wDesc(code ?? -1);

/** Windows-style widget emoji for a WMO code. */
export function weatherEmoji(code, isDay = true) {
  return _wEmoji(code ?? -1, isDay !== false) || '🌥️';
}

/** PNG icon name for a WMO weather code (for taskbar widget). */
export function weatherPng(code, isDay = true) {
  const c = code ?? -1;
  if (c === 0 || c === 1) return isDay ? 'weather-sunny' : 'weather-night';
  if (c === 2) return isDay ? 'weather-partly-cloudy' : 'weather-night';
  if (c === 3) return 'weather-cloudy';
  if (c === 45 || c === 48) return 'weather-fog';
  if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'weather-rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'weather-snow';
  if (c >= 95 && c <= 99) return 'weather-thunder';
  return 'weather-partly-cloudy';
}

/** °F for US locales, °C everywhere else. */
export const preferredUnit = () =>
  (navigator.language || '').toLowerCase().endsWith('-us') ? 'fahrenheit' : 'celsius';
export const unitSymbol = unit => (unit === 'fahrenheit' ? '°F' : '°C');

/** Compose the full markdown environment report. */
export function buildWeatherReport(data, locationLabel = 'your device location') {
  if (!data) return '';
  const lat = data.latitude || 0, lon = data.longitude || 0, tz = data.timezone || 'local';
  const cur = data.current || {}, daily = data.daily || {}, units = data.current_units || {};
  const wCode = cur.weather_code || 0, isDay = (cur.is_day || 0) !== 0;
  const temp = cur.temperature_2m || 0, apparent = cur.apparent_temperature || 0;
  const humidity = cur.relative_humidity_2m || 0, windSpeed = cur.wind_speed_10m || 0;
  const windDir = cur.wind_direction_10m || 0, pressure = cur.pressure_msl || 0;
  const cloudCover = cur.cloud_cover || 0, precip = cur.precipitation || 0;
  const tempUnit = units.temperature_2m || '°C', windUnit = units.wind_speed_10m || 'km/h', precipUnit = units.precipitation || 'mm';
  const tempMax = daily.temperature_2m_max?.[0] || 0, tempMin = daily.temperature_2m_min?.[0] || 0;
  const rainChance = daily.precipitation_probability_max?.[0] || 0;
  const uvIndex = daily.uv_index_max?.[0] || 0;
  const sunrise = (daily.sunrise?.[0] || '').split('T')[1]?.slice(0, 5) || '';
  const sunset = (daily.sunset?.[0] || '').split('T')[1]?.slice(0, 5) || '';
  const desc = _wDesc(wCode);
  const dayNight = isDay ? 'day' : 'night';
  const parts = [`${desc} right now`];
  if (humidity >= 75) parts.push(`humid at ${Math.round(humidity)}%`);
  else if (humidity <= 30) parts.push(`dry air at ${Math.round(humidity)}%`);
  if (windSpeed >= 20) parts.push(`windy (${Math.round(windSpeed)} km/h)`);
  if (uvIndex >= 6) parts.push('strong UV today — shade or sunscreen advised');
  if (rainChance >= 50) parts.push('rain likely later');
  const summary = parts.join(', ') + '.';
  return `# Device & Environment Report\n\n**Generated:** now · **Location:** ${locationLabel} (${lat}°, ${lon}°) · **Timezone:** ${tz}\n\n## Current conditions\n- **Weather:** ${desc} (${dayNight})\n- **Temperature:** ${temp}${tempUnit} (feels like ${apparent}${tempUnit})\n- **Humidity:** ${Math.round(humidity)}%\n- **Wind:** ${windSpeed} ${windUnit} from ${_compass(windDir)} (${Math.round(windDir)}°)\n- **Pressure:** ${Math.round(pressure)} hPa\n- **Cloud cover:** ${Math.round(cloudCover)}%\n- **Precipitation:** ${precip} ${precipUnit}\n\n## Today\n- **High / Low:** ${Math.round(tempMax)}° / ${Math.round(tempMin)}°\n- **Rain chance:** ${rainChance > 0 ? Math.round(rainChance) : '—'}%\n- **UV index:** ${uvIndex > 0 ? Math.round(uvIndex) : '—'} (${_uvLabel(uvIndex)})\n- **Sunrise / Sunset:** ${sunrise} / ${sunset}\n\n> Summary: ${summary}`;
}

export function summaryLine(current, daily) {
  const weatherCode = current.weather_code;
  const humidity = current.relative_humidity_2m;
  const windSpeed = current.wind_speed_10m;
  const uvIndex = daily.uv_index_max?.[0] ?? 0;
  const rainChance = daily.precipitation_probability_max?.[0] ?? 0;
  const parts = [`${_wDesc(weatherCode ?? -1)} right now`];
  if ((humidity || 0) >= 75) parts.push(`humid at ${Math.round(humidity)}%`);
  else if ((humidity || 0) <= 30) parts.push(`dry air at ${Math.round(humidity)}%`);
  if ((windSpeed || 0) >= 20) parts.push(`windy (${Math.round(windSpeed)} km/h)`);
  if ((uvIndex || 0) >= 6) parts.push('strong UV today — shade or sunscreen advised');
  if ((rainChance || 0) >= 50) parts.push('rain likely later');
  return parts.join(', ') + '.';
}

/** Reverse geocode lat/lon to city name using Nominatim (OpenStreetMap). */
export async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
    if (!response.ok) return null;
    const data = await response.json();
    const address = data.address || {};
    const city = address.city || address.town || address.village || address.county || '';
    const state = address.state || '';
    const country = address.country || '';
    return {
      city: city || data.display_name?.split(',')[0] || 'Unknown',
      state,
      country,
      displayName: data.display_name || '',
    };
  } catch {
    return null;
  }
}

/** Build MSN Weather URL for a given city. */
export function buildMsnWeatherUrl(cityName) {
  const encoded = encodeURIComponent(cityName);
  return `https://www.msn.com/en-us/weather/forecast/${encoded}`;
}
