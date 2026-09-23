import { useEffect, useRef } from 'react';

/**
 * iOS-style system gestures bound to the bottom "home indicator" strip.
 *
 * The strip is a dedicated flex row that always sits below the app viewport, so
 * these gestures never fight with an app's own scrolling or taps — a pointer
 * that starts here belongs to the shell.
 *
 *   swipe up     → onHome()          (return to the springboard)
 *   swipe left   → onCycle('next')   (move to the next running app)
 *   swipe right  → onCycle('prev')   (move to the previous running app)
 *
 * A tap (movement under `tapSlop`) is deliberately ignored so the element's own
 * click handlers (home pill, overview button) keep working.
 *
 * Pointer Events are used so the same code drives touch, pen and mouse. Move/up
 * are tracked on `window` (not the element) so the gesture completes even after
 * the finger leaves the thin strip, and pointer capture is avoided so child
 * buttons still receive their click.
 */
export default function useMobileGestures(ref, { onHome, onCycle, threshold = 46, tapSlop = 10 } = {}) {
  // Keep the latest callbacks without re-subscribing the listeners each render.
  const handlers = useRef({ onHome, onCycle });
  useEffect(() => { handlers.current = { onHome, onCycle }; });

  useEffect(() => {
    const el = ref && ref.current;
    if (!el) return undefined;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
    };

    const onMove = (event) => {
      if (!tracking) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      // Once it's clearly a drag, stop the page from panning under the finger.
      if (Math.abs(dx) > tapSlop || Math.abs(dy) > tapSlop) tracking = true;
    };

    const onUp = (event) => {
      if (!tracking) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < threshold && ady < threshold) return; // a tap, not a swipe

      if (ady >= adx) {
        if (dy < 0) handlers.current.onHome?.();
      } else if (dx < 0) {
        handlers.current.onCycle?.('next');
      } else {
        handlers.current.onCycle?.('prev');
      }
    };

    const onCancel = () => { tracking = false; };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [ref, threshold, tapSlop]);
}
