/**
 * Resolve the active wallpaper into an inline background style for the mobile
 * shell. Mirrors the desktop shell's priority chain (Yuki custom wallpaper →
 * background-disabled → chosen wallpaper → default) so the phone shows exactly
 * the same background, including user uploads stored as blobs in IndexedDB.
 */

import { useEffect, useState } from 'react';
import { WALLPAPERS, ART_GALLERY } from '../DesktopView/wallpapers';

async function readWallpaperBlob(wallId) {
  try {
    const req = indexedDB.open('lithium-kv');
    return await new Promise((resolve) => {
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) { resolve(null); return; }
        const tx = db.transaction('blobs', 'readonly');
        const get = tx.objectStore('blobs').get('wallpaper-blob:' + wallId);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export default function useWallpaperStyle({ wallpaper, customWallpaper, settings }) {
  const [customBlobUrl, setCustomBlobUrl] = useState(null);

  useEffect(() => {
    if (!wallpaper || wallpaper.startsWith('art-') || wallpaper === 'custom') return;
    if (!wallpaper.startsWith('custom-')) { setCustomBlobUrl(null); return; }
    let cancelled = false;
    readWallpaperBlob(wallpaper).then((blob) => {
      if (!cancelled && blob) setCustomBlobUrl(blob);
    });
    return () => { cancelled = true; };
  }, [wallpaper]);

  function resolve(wallId) {
    if (WALLPAPERS[wallId]) return WALLPAPERS[wallId].style;
    const art = ART_GALLERY.find((a) => a.id === wallId);
    if (art) return art.style;
    if (wallId === 'custom' && customWallpaper) {
      return { backgroundColor: '#0a0a0f', backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (wallId?.startsWith('custom-') && customBlobUrl) {
      return { backgroundColor: '#0a0a0f', backgroundImage: `url("${customBlobUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    return null;
  }

  const yuki = settings.customization?.wallpaper;
  const yukiImage = yuki?.path || yuki?.url;
  if (yuki && yuki.enabled !== false) {
    if (yuki.type === 'image' && typeof yukiImage === 'string' && /^(data:image\/|https?:\/\/)/i.test(yukiImage)) {
      return { backgroundImage: `url("${yukiImage.replaceAll('"', '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (yuki.type === 'gradient') return { backgroundImage: yuki.gradient || 'linear-gradient(135deg, #0f1117, #1e1b4b)' };
    return { backgroundColor: yuki.backgroundColor || '#0f1117' };
  }

  if (settings.background?.enabled === false) return { backgroundColor: '#101014' };
  return resolve(wallpaper) || WALLPAPERS['lithium-default'].style;
}
