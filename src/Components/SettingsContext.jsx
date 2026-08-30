import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applySettings, loadSettings, saveSettings, setAtPath } from '../lib/settings';
import { registerHandler } from '../lib/ai/apiManager';

const SettingsContext = createContext(null);

/** App-wide settings provider: persists to localStorage and applies to the DOM. */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const initial = loadSettings();
    applySettings(initial);
    return initial;
  });

  const updateSetting = useCallback((path, value) => {
    setSettings(prev => {
      const updated = setAtPath(prev, path, value);
      saveSettings(updated);
      applySettings(updated);
      return updated;
    });
  }, []);

  const replaceSettings = useCallback(next => {
    setSettings(next);
    saveSettings(next);
    applySettings(next);
  }, []);

  // Expose settings to the API Manager (models, widgets, other apps).
  useEffect(() => {
    registerHandler('settings.get', ({ path }) => {
      if (!path) return settings;
      return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), settings);
    });
    registerHandler('settings.set', ({ path, value }) => {
      updateSetting(path, value);
      return value;
    });
  }, [settings, updateSetting]);

  const value = useMemo(() => ({ settings, updateSetting, replaceSettings }), [settings, updateSetting, replaceSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
}
