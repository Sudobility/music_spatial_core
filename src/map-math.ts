/**
 * Pure geometry for the 2D map overlay: pixel position <-> arrangement
 * point, and the listener's rotation-handle bearing — extracted from the
 * existing `UnpluggedTab.tsx` (both platforms) so it's written once. Each
 * platform still owns *capturing* a pixel position (DOM pointer events vs.
 * RN `measureInWindow`/gesture-handler); everything downstream of "here is
 * a pixel position" lives here.
 */
import type { UnpluggedPoint } from '@sudobility/music_types';

export interface OverlayGeometry {
  readonly centerX: number;
  readonly centerY: number;
  /** The rendered circle's radius, in the overlay's own pixel space. */
  readonly radiusPx: number;
  /** The arrangement-space radius (e.g. `UNPLUGGED_RADIUS`) that `radiusPx`
   *  represents — together they give the pixels-per-unit scale. */
  readonly radiusUnits: number;
}

/**
 * Pixel position -> a point in arrangement space, clamped to the
 * arrangement's radius so a drag can never place an instrument or the
 * listener further out than the overlay can show.
 *
 * Screen Y increases downward; arrangement `z` increases into the
 * arrangement (away from the overlay's bottom, where the listener's default
 * position sits) — so screen-down maps to arrangement-backward, not forward.
 */
export function pointFromPixel(
  geometry: OverlayGeometry,
  pixelX: number,
  pixelY: number
): UnpluggedPoint {
  const unitsPerPixel = geometry.radiusUnits / geometry.radiusPx;
  let x = (pixelX - geometry.centerX) * unitsPerPixel;
  let z = -(pixelY - geometry.centerY) * unitsPerPixel;

  const distance = Math.hypot(x, z);
  if (distance > geometry.radiusUnits) {
    const factor = geometry.radiusUnits / distance;
    x *= factor;
    z *= factor;
  }
  return { x, z };
}

/** The reverse of `pointFromPixel`, for drawing a marker at a point's pixel
 *  position. */
export function pixelFromPoint(
  geometry: OverlayGeometry,
  point: UnpluggedPoint
): { readonly x: number; readonly y: number } {
  const pixelsPerUnit = geometry.radiusPx / geometry.radiusUnits;
  return {
    x: geometry.centerX + point.x * pixelsPerUnit,
    y: geometry.centerY - point.z * pixelsPerUnit,
  };
}

/**
 * A pixel *delta* converted to a stage-space delta — for dragging a marker
 * by accumulating movement onto its own last position, not by snapping the
 * marker to the pointer's absolute position. That distinction matters:
 * grabbing a marker somewhere other than its exact center and dragging it
 * would otherwise make the marker jump to re-center itself under the
 * pointer on the very first event. Rotation (`bearingFromCenter`) is the
 * opposite case on purpose — always absolute, never delta, so it cannot
 * drift from compounding rounding the way this function's own accumulation
 * would if used for an angle.
 */
export function stageDeltaFromPixelDelta(
  geometry: OverlayGeometry,
  dxPx: number,
  dyPx: number
): { readonly dx: number; readonly dz: number } {
  const unitsPerPixel = geometry.radiusUnits / geometry.radiusPx;
  return { dx: dxPx * unitsPerPixel, dz: -dyPx * unitsPerPixel };
}

/**
 * Bearing from the arrangement's center to a pixel position, in degrees,
 * using the exact same convention as `unpluggedMixFor` (music_lib):
 * `atan2(dx, dz)`, clockwise-positive from `+z`.
 *
 * Computed fresh from the CURRENT absolute pixel position every call, never
 * from an accumulated delta — that's the exact-rotation fix the 2D build
 * already needed (drift from compounding rounding when a bearing was
 * derived from its own previous answer) and it applies identically here.
 */
export function bearingFromCenter(
  geometry: OverlayGeometry,
  pixelX: number,
  pixelY: number
): number {
  const dx = pixelX - geometry.centerX;
  const dz = -(pixelY - geometry.centerY);
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}
