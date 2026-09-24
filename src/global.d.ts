/**
 * `requestAnimationFrame`/`cancelAnimationFrame` are standard on both web
 * and React Native (RN polyfills them) but aren't declared without pulling
 * in the full DOM lib, which this package deliberately doesn't have — it
 * has to type-check for a target with no DOM (React Native) as much as one
 * with it. Declared minimally here instead.
 */
declare function requestAnimationFrame(callback: () => void): number;
declare function cancelAnimationFrame(handle: number): void;
