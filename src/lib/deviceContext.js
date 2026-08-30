/**
 * Device context: geolocation + open-meteo weather (free, keyless, CORS-open)
 * used by the AI Hub to build full environment reports.
 */

import * as core from './core';

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

import { storage } from './storage/localStorage';

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

export const weatherDescription = code => core.weatherDescriptionSync(code) || 'changing conditions';

/** Windows-style widget emoji for a WMO code. */
export function weatherEmoji(code, isDay = true) {
  return core.weatherEmojiSync(code, isDay) || '🌥️';
}

/** °F for US locales, °C everywhere else. */
export const preferredUnit = () =>
  (navigator.language || '').toLowerCase().endsWith('-us') ? 'fahrenheit' : 'celsius';
export const unitSymbol = unit => (unit === 'fahrenheit' ? '°F' : '°C');

/** Compose the full markdown environment report. */
export function buildWeatherReport(data, locationLabel = 'your device location') {
  return core.weatherReportSync({ ...data, locationLabel }) || '';
}

export function summaryLine(current, daily) {
  return core.weatherSummaryLineSync({
    weatherCode: current.weather_code,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    uvIndex: daily.uv_index_max?.[0] ?? 0,
    rainChance: daily.precipitation_probability_max?.[0] ?? 0,
  }) || '';
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
