/**
 * Horizontal direct manipulation of the 3D view. A scene point grabbed at
 * startX stays under the mouse or finger at x: changing the listener's facing
 * by the difference between those screen bearings preserves that point's
 * horizontal projection. Vertical travel is deliberately ignored.
 *
 * Each result is derived from the gesture's initial listener and coordinates,
 * so there is no accumulated drift or motion after the pointer stops.
 *
 * Worklets, so a React Native host can follow a finger on the UI thread.
 */
import type { UnpluggedListener } from '@sudobility/music_types';
import { DEFAULT_FOV_DEG } from './project';

export interface DragViewport {
  readonly width: number;
  readonly height: number;
  readonly fovDeg?: number;
}

const toDeg = 180 / Math.PI;

function focalLength(viewport: DragViewport): number {
  'worklet';
  const fov = ((viewport.fovDeg ?? DEFAULT_FOV_DEG) * Math.PI) / 180;
  return viewport.height / 2 / Math.tan(fov / 2);
}

/** Pixel `px`'s bearing from the view's centre line, in degrees, positive to the right. */
function bearingInView(viewport: DragViewport, px: number): number {
  'worklet';
  return Math.atan((px - viewport.width / 2) / focalLength(viewport)) * toDeg;
}

// Defined before its callers on purpose. The worklets Babel plugin rewrites
// each of these `function` declarations into a non-hoisted
// `var f = <factory>({ ...referenced worklets... })` assignment, and those run
// in source order. A worklet that referenced a helper defined *below* it would
// capture that helper as `undefined` in its closure and fail on the UI thread
// with "normalizeDeg is not a function" the moment a drag ran. So every helper
// a worklet calls must appear above it here.
function normalizeDeg(deg: number): number {
  'worklet';
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * The listener when a horizontal drag from `startX` has reached `x`.
 */
export function listenerForStageDrag(
  start: UnpluggedListener,
  viewport: DragViewport,
  startX: number,
  x: number
): UnpluggedListener {
  'worklet';
  if (viewport.width <= 0 || viewport.height <= 0) return start;
  return {
    x: start.x,
    z: start.z,
    facingDeg: normalizeDeg(
      start.facingDeg +
        bearingInView(viewport, startX) -
        bearingInView(viewport, x)
    ),
  };
}
