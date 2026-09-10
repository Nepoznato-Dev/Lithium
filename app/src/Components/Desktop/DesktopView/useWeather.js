import { useCallback, useEffect, useState } from 'react';
import { storage } from '../../../lib/storage';
import {
  buildWeatherReport,
  fetchWeather,
  loadLastLocation,
  loadWeatherCache,
  locationPermission,
  preferredUnit,
  requestLocation,
  reverseGeocode,
  saveWeatherCache,
} from '../../../lib/deviceContext';
import { AI_PROVIDERS, chatCompletion, loadKeys } from '../../../lib/ai/providers';

/** Weather data, AI outlook, and news headlines. */
export default function useWeather() {
  const [weather, setWeather] = useState(() => loadWeatherCache());
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [aiOutlook, setAiOutlook] = useState('');
  const [locationInfo, setLocationInfo] = useState(() => storage.get('location-info', null));
  const [newsItems, setNewsItems] = useState([]);

  const refreshWeather = useCallback(async (interactive = false) => {
    let loc = loadLastLocation();
    if (!loc) {
      if (!interactive) return;
      loc = await requestLocation();
    }
    if (!loc) return;
    try {
      const unit = preferredUnit();
      const data = await fetchWeather(loc.lat, loc.lon, unit);
      const payload = { data, unit, fetchedAt: Date.now() };
      setWeather(payload);
      saveWeatherCache(payload);
      if (!locationInfo) {
        const info = await reverseGeocode(loc.lat, loc.lon);
        if (info) {
          setLocationInfo(info);
          storage.set('location-info', info);
        }
      }
    } catch { /* offline or service hiccup */ }
  }, [locationInfo]);

  // Auto-refresh on mount + every 10 min
  useEffect(() => {
    (async () => {
      const state = await locationPermission();
      if (state === 'granted' || loadLastLocation()) refreshWeather(false);
    })();
    const timer = setInterval(() => refreshWeather(false), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshWeather]);

  // Fetch news headlines when flyout opens
  useEffect(() => {
    if (!weatherOpen || newsItems.length > 0) return;
    const fetchNews = async () => {
      try {
        const response = await fetch('https://api.duckduckgo.com/?q=top+news&format=json&no_html=1');
        if (!response.ok) return;
        const data = await response.json();
        const news = (data.RelatedTopics || [])
          .filter(t => t.Text && t.FirstURL)
          .slice(0, 5)
          .map(t => ({ title: t.Text, url: t.FirstURL }));
        setNewsItems(news);
      } catch { /* offline */ }
    };
    fetchNews();
  }, [weatherOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI-written one-line outlook when flyout opens
  useEffect(() => {
    if (!weatherOpen || !weather?.data) return undefined;
    const provider = Object.keys(loadKeys()).find(id => AI_PROVIDERS[id]);
    if (!provider) return undefined;
    let cancelled = false;
    setAiOutlook('');
    chatCompletion(provider, [
      { role: 'system', content: 'Write one friendly sentence (max 25 words) summarizing today\'s weather outlook from the data. Plain text, no markdown.' },
      { role: 'user', content: buildWeatherReport(weather.data) },
    ])
      .then(text => { if (!cancelled && text) setAiOutlook(text.trim()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [weatherOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return { weather, weatherOpen, setWeatherOpen, aiOutlook, locationInfo, newsItems, refreshWeather };
}
