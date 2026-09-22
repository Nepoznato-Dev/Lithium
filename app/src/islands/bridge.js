/**
 * Preact ⇄ Solid bridge for islands.
 *
 * Plain `.js` on purpose: vite-plugin-solid only compiles JSX inside
 * `src/islands/**`, and nothing here needs a transform. Nothing here may import
 * a Preact *component* either — islands talk to the shell through signals and
 * callbacks, never through shared UI.
 */
import { createSignal, onCleanup } from 'solid-js';
import { render } from 'solid-js/web';
import { effect as preactEffect } from '@preact/signals-core';

/**
 * Mirror an `@preact/signals` signal into a Solid accessor.
 *
 * This is the whole point of an island: one mirror, then *each Solid
 * expression* that reads it subscribes independently. A row binding that only
 * touches a class writes one attribute instead of re-running a component and
 * diffing a vnode tree.
 */
export function mirrorSignal(preactSignal) {
  const [get, set] = createSignal(preactSignal.peek());
  const stop = preactEffect(() => set(preactSignal.value));
  onCleanup(stop);
  return get;
}

/** Same, for a value the Preact side recomputes rather than stores. */
export function mirrorGet(read) {
  const [get, set] = createSignal(read());
  const stop = preactEffect(() => set(read()));
  onCleanup(stop);
  return get;
}

/**
 * Join class names, skipping falsy parts.
 * Solid writes `class` once per evaluation, so this stays allocation-light.
 */
export function cx(...parts) {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    out = out ? `${out} ${part}` : part;
  }
  return out;
}

/**
 * Turn a Solid component into the `(host, read) => instance` contract that
 * `src/lib/island.jsx` mounts.
 *
 * `read()` returns the shell's current state object. It is deliberately *not*
 * a Solid signal: the host pushes with `update()` after it re-renders, and the
 * component's own memos then re-evaluate and bail out by reference. So a shell
 * re-render that changed nothing relevant re-runs no DOM work at all — which is
 * the whole reason the island exists.
 *
 * Called as a plain function rather than as JSX so this file stays `.js` and
 * outside Solid's JSX transform.
 */
export function defineIsland(Component) {
  return function mount(host, read) {
    const [tick, setTick] = createSignal(0);
    const getState = () => {
      tick();
      return read();
    };
    const dispose = render(() => Component({ getState }), host);
    return { update: () => setTick(t => t + 1), dispose };
  };
}
