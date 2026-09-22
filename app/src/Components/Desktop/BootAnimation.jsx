import React, { useCallback, useEffect, useRef, useState } from 'react';
import './BootAnimation.css';

const FIRST_BOOT_KEY = 'lithium:boot-seen';
const DISABLE_KEY = 'lithium:boot-disabled';

/* localStorage throws in private mode / sandboxed iframes — never let that
   break the boot sequence. */
const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* noop */
    }
  },
};

const MESSAGES = [
  'Initializing kernel',
  'Mounting workspace',
  'Restoring session',
  'Preparing desktop',
];

/* All timings in ms. `fade` must match the CSS `bootFadeOut` duration. */
const TIMELINE = {
  full:  { total: 4000, exitAt: 3550, fade: 450, barStart: 900, barDuration: 2500 },
  quick: { total: 1150, exitAt: 800,  fade: 350, barStart: 100, barDuration: 650  },
};

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Boot animation overlay.
 *
 * - First visit: ~4s sequence — logo, progress bar, rotating status text, fade out.
 * - Repeat visits: ~1.2s sequence — logo + a short progress line.
 * - Skippable with the button or the Escape key.
 * - Fully bypassed when `prefers-reduced-motion` is set or the user has disabled it.
 *
 * Calls `onComplete` once the overlay has fully left the screen so the parent
 * can mount the real desktop.
 */
export default function BootAnimation({ onComplete }) {
  const [quick] = useState(() => storage.get(FIRST_BOOT_KEY) === '1');
  const [disabled] = useState(() => storage.get(DISABLE_KEY) === '1');
  const [reducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  const [phase, setPhase] = useState('enter'); // 'enter' | 'exit' | 'done'
  const [messageIndex, setMessageIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);

  /* Progress is written straight to the DOM each frame — no 240 re-renders. */
  const barRef = useRef(null);
  const percentRef = useRef(null);

  const rafRef = useRef(0);
  const exitTimerRef = useRef(0);
  const doneTimerRef = useRef(0);
  const exitingRef = useRef(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const skipEverything = disabled || reducedMotion;

  /* ---------------------------------------------------------------- timeline */
  useEffect(() => {
    if (skipEverything) {
      setPhase('done');
      return undefined;
    }

    const t = quick ? TIMELINE.quick : TIMELINE.full;
    const startedAt = performance.now();
    let lastIndex = -1;

    const paint = (raw) => {
      const eased = easeOutCubic(clamp01(raw)) * 100;
      if (barRef.current) barRef.current.style.width = `${eased}%`;
      if (percentRef.current) percentRef.current.textContent = `${Math.round(eased)}%`;

      const idx = Math.min(MESSAGES.length - 1, Math.floor(clamp01(raw) * MESSAGES.length));
      if (idx !== lastIndex) {
        lastIndex = idx;
        setMessageIndex(idx);
      }
    };

    const tick = (now) => {
      const elapsed = now - startedAt;
      paint((elapsed - t.barStart) / t.barDuration);
      if (elapsed < t.total) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    exitTimerRef.current = window.setTimeout(() => setPhase('exit'), t.exitAt);
    doneTimerRef.current = window.setTimeout(() => {
      storage.set(FIRST_BOOT_KEY, '1');
      setPhase('done');
    }, t.total);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(exitTimerRef.current);
      clearTimeout(doneTimerRef.current);
    };
  }, [quick, skipEverything]);

  /* -------------------------------------------------------------- skip logic */
  const handleSkip = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    cancelAnimationFrame(rafRef.current);
    clearTimeout(exitTimerRef.current);
    clearTimeout(doneTimerRef.current);

    if (barRef.current) barRef.current.style.width = '100%';
    if (percentRef.current) percentRef.current.textContent = '100%';

    setPhase('exit');

    const fade = (quick ? TIMELINE.quick : TIMELINE.full).fade;
    doneTimerRef.current = window.setTimeout(() => {
      storage.set(FIRST_BOOT_KEY, '1');
      setPhase('done');
    }, fade + 20);
  }, [quick]);

  useEffect(() => {
    if (skipEverything) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleSkip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSkip, skipEverything]);

  /* --------------------------------------------------------------- page lock */
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  /* ------------------------------------------------------------------ finish */
  useEffect(() => {
    if (phase === 'done') onCompleteRef.current?.();
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={['boot-overlay', quick && 'quick', phase === 'exit' && 'exit']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="boot-stage">
        <div className={`boot-logo${quick ? '' : ' pulse'}`}>
          {logoFailed ? (
            <span className="boot-logo-fallback" aria-hidden="true">
              Li
            </span>
          ) : (
            <img
              src="/Li-Logo.svg"
              alt=""
              draggable="false"
              onError={() => setLogoFailed(true)}
            />
          )}
        </div>

        <div className="boot-progress-track" aria-hidden="true">
          <div className="boot-progress-bar" ref={barRef} />
        </div>

        {!quick && (
          <div className="boot-meta" role="status" aria-live="polite">
            <span className="boot-message" key={messageIndex}>
              {MESSAGES[messageIndex]}
            </span>
            <span className="boot-percent" ref={percentRef} aria-hidden="true">
              0%
            </span>
          </div>
        )}
      </div>

      {!quick && (
        <button type="button" className="boot-skip" onClick={handleSkip}>
          Skip
        </button>
      )}
    </div>
  );
}