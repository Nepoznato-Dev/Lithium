import { useEffect, useState } from 'react';
import { isLowEnd, onLowEndChange } from './lowEnd.js';

/**
 * Reactive read of the low-end switch.
 *
 * Lives in its own module so both the island host and ordinary canvas layers
 * can subscribe without importing each other, and so `lowEnd.js` itself stays
 * free of any UI framework (the Solid islands import it).
 *
 * The value flips only on a user toggle, so the re-render this causes is once
 * per session — unlike the per-frame signals it sits alongside.
 */
export function useLowEnd() {
  const [on, setOn] = useState(isLowEnd);
  useEffect(() => onLowEndChange(setOn), []);
  return on;
}

export default useLowEnd;
