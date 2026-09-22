import { useEffect, useState } from 'react';

/**
 * macOS-layout flag.
 *
 * The touch shell (MobileShell) owns this one question: is there enough room to
 * behave like a desktop OS? When iOS mode is on but the screen is desktop-wide,
 * the same shell re-presents itself macOS-style — menu bar, floating draggable
 * windows and a Dock — instead of stretching a phone layout across a 27" panel.
 *
 * 900px is deliberate: large phones and portrait tablets stay in the phone
 * layout, where full-screen apps and swipe gestures are the better fit.
 */
const MAC_QUERY = '(min-width: 900px)';

export default function useMacShell() {
  const [mac, setMac] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MAC_QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(MAC_QUERY);
    const sync = () => setMac(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return mac;
}
