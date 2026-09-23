import React, { useEffect, useRef, useState } from 'react';
import useLowEnd from './useLowEnd.js';

/**
 * Mounts a Solid island in place of a Preact subtree.
 *
 * Two rules keep the two runtimes from leaking into each other:
 *
 *  1. Data goes *in* as Preact signals or plain values, never as Preact
 *     elements. The island reads signals through `src/islands/bridge.js` and
 *     owns every node it renders.
 *  2. Interaction goes *out* as plain callbacks. The island never calls back
 *     into a Preact component, so unmounting the shell can't strand a Solid
 *     effect (or the reverse).
 *
 * The island module is imported dynamically, so `solid-js` stays out of the
 * start bundle entirely on a machine that never turns low-end mode on.
 */

const cache = new Map();

function loadOnce(load) {
  let hit = cache.get(load);
  if (!hit) {
    hit = load().then(mod => mod.default);
    cache.set(load, hit);
  }
  return hit;
}

/**
 * `load` is a zero-arg dynamic import (`() => import('…')`); keep it module
 * scope so the identity is stable and the island isn't remounted per render.
 *
 * `state` is handed to the island once and then pushed on change. The island
 * decides what to recompute — a new `state` object with an unchanged `items`
 * array costs it nothing, because its memos compare by reference.
 *
 * `children` is the Preact implementation, shown only while the island chunk is
 * still in flight: the swap is then invisible instead of blank.
 */
export default function Island({ load, state, className, children }) {
  const hostRef = useRef(null);
  const instRef = useRef(null);
  const latest = useRef(state);
  latest.current = state;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let alive = true;
    loadOnce(load).then(mount => {
      if (!alive || !hostRef.current) return;
      instRef.current = mount(hostRef.current, () => latest.current);
      setMounted(true);
    });
    return () => {
      alive = false;
      const inst = instRef.current;
      instRef.current = null;
      inst?.dispose();
    };
  }, [load]);

  // Pushed after mount as well, so props that changed while the chunk was
  // loading aren't lost — the island read them from `latest` at mount time.
  useEffect(() => { instRef.current?.update(); }, [mounted, state]);

  return (
    <>
      {/* display:contents removes the wrapper's box, so the island's own root
          keeps participating in the parent's flex layout. */}
      <div ref={hostRef} className={className} style={{ display: mounted ? 'contents' : 'none' }} />
      {!mounted && children}
    </>
  );
}

export { useLowEnd };
