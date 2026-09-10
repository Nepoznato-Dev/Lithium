/**
 * Per-tab back/forward navigation stack.
 */
import { useCallback, useRef } from 'react';
import { nav, clearSelection } from '../state/signals.jsx';

export function useHistory() {
  const backStack = useRef([]);
  const forwardStack = useRef([]);

  const push = useCallback(() => {
    backStack.current.push([...nav.value.stack]);
    forwardStack.current = [];
  }, []);

  const back = useCallback(() => {
    if (backStack.current.length === 0) return;
    forwardStack.current.push([...nav.value.stack]);
    const prev = backStack.current.pop();
    clearSelection();
    nav.value = { ...nav.value, stack: prev };
  }, []);

  const forward = useCallback(() => {
    if (forwardStack.current.length === 0) return;
    backStack.current.push([...nav.value.stack]);
    const next = forwardStack.current.pop();
    clearSelection();
    nav.value = { ...nav.value, stack: next };
  }, []);

  const up = useCallback(() => {
    if (nav.value.stack.length <= 1) return;
    push();
    clearSelection();
    nav.value = { ...nav.value, stack: nav.value.stack.slice(0, -1) };
  }, [push]);

  const canBack = backStack.current.length > 0;
  const canForward = forwardStack.current.length > 0;

  return { back, forward, up, canBack, canForward, push };
}
