import { useState, useEffect, useCallback } from 'react';
import { CardGroup, SettingsRow, EnhancedToggle, EnhancedSlider } from '../controls';
import { WALLPAPER_CATEGORIES, getGradientWallpapers, getArtWallpapers, getAnimatedWallpapers } from '../../../Components/Desktop/DesktopView/wallpapers';
import { storage } from '../../../lib/storage';
import Icon from '../../../Components/Icon';

const CUSTOM_WP_KEY = 'lithium:custom-wallpapers';
const CUSTOM_WP_PREFIX = 'wallpaper-blob:';

/** Load custom wallpaper list from localStorage. */
function loadCustomWallpapers() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_WP_KEY) || '[]'); } catch { return []; }
}

/** Save custom wallpaper list to localStorage. */
function saveCustomWallpapers(list) {
  localStorage.setItem(CUSTOM_WP_KEY, JSON.stringify(list));
}

/** Read a wallpaper blob from IndexedDB. */
function getWallpaperBlob(id) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('lithium-kv');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) { resolve(null); return; }
        const tx = db.transaction('blobs', 'readonly');
        const store = tx.objectStore('blobs');
        const get = store.get(CUSTOM_WP_PREFIX + id);
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Store a wallpaper blob in IndexedDB. */
function putWallpaperBlob(id, dataUrl) {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('lithium-kv');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) { resolve(); return; }
        const tx = db.transaction('blobs', 'readwrite');
        const store = tx.objectStore('blobs');
        store.put(dataUrl, CUSTOM_WP_PREFIX + id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

/** Delete a wallpaper blob from IndexedDB. */
function deleteWallpaperBlob(id) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('lithium-kv');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) { resolve(); return; }
        const tx = db.transaction('blobs', 'readwrite');
        const store = tx.objectStore('blobs');
        store.delete(CUSTOM_WP_PREFIX + id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export default function BackgroundSection({ settings, update }) {
  const [current, setCurrent] = useState(() => storage.get('desktop-wallpaper', 'lithium-default'));
  const [activeCategory, setActiveCategory] = useState('gradients');
  const [customWalls, setCustomWalls] = useState(() => loadCustomWallpapers());
  const [customUrls, setCustomUrls] = useState({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const handler = () => setCurrent(storage.get('desktop-wallpaper', 'lithium-default'));
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Load custom wallpaper blob URLs on mount
  useEffect(() => {
    (async () => {
      const urls = {};
      for (const wp of customWalls) {
        const blob = await getWallpaperBlob(wp.id);
        if (blob) urls[wp.id] = blob;
      }
      setCustomUrls(urls);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectWallpaper = useCallback(id => {
    storage.set('desktop-wallpaper', id);
    setCurrent(id);
    window.dispatchEvent(new Event('lithium:wallpaper-changed'));
  }, []);

  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      setUploading(true);
      const newWalls = [...customWalls];
      const newUrls = { ...customUrls };
      for (const file of files) {
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.readAsDataURL(file);
        });
        await putWallpaperBlob(id, dataUrl);
        const entry = { id, label: file.name.replace(/\.[^.]+$/, '').slice(0, 30), category: 'custom' };
        newWalls.push(entry);
        newUrls[id] = dataUrl;
      }
      saveCustomWallpapers(newWalls);
      setCustomWalls(newWalls);
      setCustomUrls(newUrls);
      setUploading(false);
    };
    input.click();
  }, [customWalls, customUrls]);

  const removeCustom = useCallback(async (id) => {
    const list = customWalls.filter(w => w.id !== id);
    saveCustomWallpapers(list);
    setCustomWalls(list);
    await deleteWallpaperBlob(id);
    const urls = { ...customUrls };
    delete urls[id];
    setCustomUrls(urls);
    if (current === id) selectWallpaper('lithium-default');
  }, [customWalls, customUrls, current, selectWallpaper]);

  const gradients = getGradientWallpapers();
  const art = getArtWallpapers();
  const animated = getAnimatedWallpapers();

  return (
    <div>
      <CardGroup label="Wallpaper">
        <SettingsRow title="Desktop wallpaper" description="Show the wallpaper (off = plain dark desktop)">
          <EnhancedToggle value={settings.background.enabled} onChange={v => update('background.enabled', v)} />
        </SettingsRow>
        <SettingsRow title="Wallpaper brightness" description="Dim the wallpaper for readability">
          <EnhancedSlider value={settings.background.intensity} min={0.2} max={1} step={0.1} suffix="" onChange={v => update('background.intensity', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Choose Wallpaper">
        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {WALLPAPER_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`settings-segmented-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              style={{ fontSize: 11 }}
            >
              {cat.label}
              {cat.id === 'custom' && customWalls.length > 0 && (
                <span style={{ marginLeft: 4, opacity: 0.5 }}>({customWalls.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Gradient wallpapers */}
        {activeCategory === 'gradients' && (
          <div className="settings-wallpaper-grid">
            {gradients.map(wp => (
              <button
                key={wp.id}
                className={`settings-wallpaper-thumb ${current === wp.id ? 'active' : ''}`}
                style={wp.style}
                onClick={() => selectWallpaper(wp.id)}
                title={wp.label}
              >
                <span className="settings-wallpaper-label">{wp.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Art gallery wallpapers */}
        {activeCategory === 'art' && (
          <div>
            <div className="settings-wallpaper-grid">
              {art.map(wp => (
                <button
                  key={wp.id}
                  className={`settings-wallpaper-thumb ${current === wp.id ? 'active' : ''}`}
                  style={wp.style}
                  onClick={() => selectWallpaper(wp.id)}
                  title={`${wp.label} \u2014 ${wp.medium}`}
                >
                  <span className="settings-wallpaper-label">{wp.label}</span>
                  <span className="settings-wallpaper-medium">{wp.medium}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
              Fine art from the Lithium collection. Images served from assets during development.
            </p>
          </div>
        )}

        {/* Animated wallpapers */}
        {activeCategory === 'animated' && (
          <div>
            <div className="settings-wallpaper-grid">
              {animated.map(wp => (
                <button
                  key={wp.id}
                  className={`settings-wallpaper-thumb ${current === wp.id ? 'active' : ''}`}
                  style={wp.preview}
                  onClick={() => selectWallpaper(wp.id)}
                  title={wp.label}
                >
                  <span className="settings-wallpaper-label">{wp.label}</span>
                  <span className="settings-wallpaper-animated-badge">LIVE</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
              Animated wallpapers use canvas rendering. They are automatically disabled in low-end mode.
            </p>
          </div>
        )}

        {/* Custom uploaded wallpapers */}
        {activeCategory === 'custom' && (
          <div>
            <div className="settings-wallpaper-grid">
              {/* Upload button */}
              <button
                className="settings-wallpaper-thumb settings-wallpaper-upload"
                onClick={handleUpload}
                disabled={uploading}
                title="Upload image"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '2px dashed rgba(255,255,255,0.12)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Icon name="Plus" size={18} style={{ color: 'rgba(255,255,255,0.3)' }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </span>
              </button>

              {/* Custom wallpapers */}
              {customWalls.map(wp => (
                <div key={wp.id} className="settings-wallpaper-wrapper">
                  <button
                    className={`settings-wallpaper-thumb ${current === wp.id ? 'active' : ''}`}
                    style={{
                      backgroundImage: customUrls[wp.id] ? `url("${customUrls[wp.id]}")` : 'none',
                      backgroundSize: 'cover', backgroundPosition: 'center',
                    }}
                    onClick={() => selectWallpaper(wp.id)}
                    title={wp.label}
                  >
                    <span className="settings-wallpaper-label">{wp.label}</span>
                  </button>
                  <button
                    className="settings-wallpaper-remove"
                    onClick={(e) => { e.stopPropagation(); removeCustom(wp.id); }}
                    title="Remove"
                  >
                    <Icon name="X" size={10} />
                  </button>
                </div>
              ))}
            </div>

            {customWalls.length === 0 && (
              <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
                Upload your own images to use as wallpapers. They are stored locally in IndexedDB.
              </p>
            )}
          </div>
        )}
      </CardGroup>
    </div>
  );
}
