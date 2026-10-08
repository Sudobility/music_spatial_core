/**
 * Local drag preview with a single commit when the pointer or touch ends.
 * The map redraws while dragging without writing positions to the document.
 */
import { useCallback, useRef, useState } from 'react';

export interface ThrottledCommit<T> {
  /** The in-progress value; reset to `initial` after `commitNow`. */
  readonly value: T;
  /** Updates the local preview without committing to the store. */
  readonly setValue: (next: T) => void;
  /** Commits the latest preview once the gesture ends. */
  readonly commitNow: () => void;
}

export function useThrottledCommit<T>(
  initial: T,
  commit: (value: T) => void
): ThrottledCommit<T> {
  const [value, setValueState] = useState<T>(initial);
  const pendingRef = useRef<{ readonly value: T } | null>(null);

  const setValue = useCallback((next: T) => {
    pendingRef.current = { value: next };
    setValueState(next);
  }, []);

  const commitNow = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) commit(pending.value);
    setValueState(initial);
  }, [commit, initial]);

  return { value, setValue, commitNow };
}
