import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useThrottledCommit } from './use-throttled-commit';

describe('useThrottledCommit', () => {
  it('updates the displayed value instantly on setValue', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useThrottledCommit(0, commit));
    act(() => {
      result.current.setValue(5);
    });
    expect(result.current.value).toBe(5);
  });

  it('does not commit synchronously — only on the next animation frame', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useThrottledCommit(0, commit));
    act(() => {
      result.current.setValue(5);
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits nothing while the gesture continues, then only the latest value on commitNow', async () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useThrottledCommit(0, commit));
    act(() => {
      result.current.setValue(1);
      result.current.setValue(2);
      result.current.setValue(3);
    });
    await new Promise(resolve => requestAnimationFrame(resolve));
    // A frame passing is not the end of the gesture: the store is untouched.
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      result.current.commitNow();
    });
    // Every intermediate value was skipped — only the latest reaches the store.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(3);
  });

  it('commitNow flushes a pending value synchronously, for drag end', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useThrottledCommit(0, commit));
    act(() => {
      result.current.setValue(7);
      result.current.commitNow();
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(7);
  });

  it('returns the displayed value to `initial` after commitNow, so the caller follows the store again', () => {
    // A marker dragged once must not stay pinned to its last dragged
    // position — the store may move it afterwards (the keyboard does).
    const commit = vi.fn();
    const { result } = renderHook(() =>
      useThrottledCommit<number | null>(null, commit)
    );
    act(() => {
      result.current.setValue(7);
    });
    expect(result.current.value).toBe(7);
    act(() => {
      result.current.commitNow();
    });
    expect(result.current.value).toBeNull();
  });

  it('commitNow is a no-op when nothing is pending', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useThrottledCommit(0, commit));
    act(() => {
      result.current.commitNow();
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not double-commit: a frame after commitNow already flushed finds nothing pending', async () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useThrottledCommit(0, commit));
    act(() => {
      result.current.setValue(9);
      result.current.commitNow();
    });
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
