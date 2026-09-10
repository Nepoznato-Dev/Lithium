/**
 * useMemoCompare — like useMemo but uses a custom content comparator
 * instead of reference equality.  Prevents cascade re-renders when the
 * producing dependencies change but the computed value is content-equivalent.
 *
 * Usage:
 *   const items = useMemoCompare(
 *     () => childrenOf(tree, folderId),
 *     [tree, folderId],
 *     (prev, next) => prev.length === next.length && prev.every((e, i) => e === next[i])
 *   );
 */
import { useRef, useMemo } from 'react';

const UNINITIALIZED = Symbol('useMemoCompare.uninitialized');

export function useMemoCompare(factory, deps, comparator) {
  const prevRef = useRef(UNINITIALIZED);
  const currentValue = useMemo(factory, deps);

  if (prevRef.current !== UNINITIALIZED && comparator(prevRef.current, currentValue)) {
    return prevRef.current; // Return cached (stable reference)
  }

  prevRef.current = currentValue;
  return currentValue;
}
