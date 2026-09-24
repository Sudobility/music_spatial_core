/**
 * Instant local feedback + rAF-throttled store commits, with a guaranteed
 * final synchronous commit — the drag-performance fix already built and
 * verified for the 2D map. Turns out to have no DOM or RN dependency at
 * all: `useState`/`useRef`/`useCallback` are core React, and
 * `requestAnimationFrame` is standard on both web and RN (RN polyfills it)
 * — so the hook itself, not just the pattern, is shared rather than
 * reimplemented per platform.
 *
 * `value` is only ever the *in-progress* drag: it returns to `initial`
 * once `commitNow` has handed the final value to the store, so a caller
 * that renders `value ?? committed` follows the store again afterwards.
 * Without that, a marker dragged once stayed pinned to its last dragged
 * position for good and ignored every later store change — which is how
 * the map overlay stopped following the keyboard after a single drag.
 */
import { useCallback, useRef, useState } from 'react';

export interface ThrottledCommit<T> {
  /** The in-progress value — updates instantly on every `setValue`, back to `initial` after `commitNow`. */
  readonly value: T;
  /** Instant local update; the store commit is scheduled for the next frame. */
  readonly setValue: (next: T) => void;
  /** Forces a pending commit through synchronously — call on drag end, so
   *  the final position is never lost to a frame that never arrives. */
  readonly commitNow: () => void;
}

export function useThrottledCommit<T>(
  initial: T,
  commit: (value: T) => void
): ThrottledCommit<T> {
  const [value, setValueState] = useState<T>(initial);
  const pendingRef = useRef<{ readonly value: T } | null>(null);
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    if (pendingRef.current) {
      commit(pendingRef.current.value);
      pendingRef.current = null;
    }
  }, [commit]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      pendingRef.current = { value: next };
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  const commitNow = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (pendingRef.current) {
      commit(pendingRef.current.value);
      pendingRef.current = null;
    }
    setValueState(initial);
  }, [commit, initial]);

  return { value, setValue, commitNow };
}
