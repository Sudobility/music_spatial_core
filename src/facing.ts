/**
 * Which instrument the listener is looking at — the nearest one inside the
 * field of view — so a host can follow it with its active track while the
 * Spatial view is on.
 *
 * Sticky on purpose: the current pick is kept until it leaves the field of
 * view or another instrument is clearly nearer (by `SWITCH_MARGIN`).
 * Without that, standing between two instruments at equal distance would
 * flip the selection every frame as the listener drifted.
 */
import type {
  UnpluggedListener,
  UnpluggedPoint,
} from '@sudobility/music_types';

export interface FacingCandidate {
  readonly id: string;
  readonly point: UnpluggedPoint;
}

/** Half-angle of the field of view an instrument must be within, degrees. */
export const FACING_HALF_ANGLE = 60;
/** A challenger must be this much nearer than the current pick to take over. */
const SWITCH_MARGIN = 0.85;

function normalizeDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * The id of the instrument to follow, or `currentId` when nothing has
 * changed, or null when nothing is in view.
 */
export function facingTrackId(
  listener: UnpluggedListener,
  candidates: readonly FacingCandidate[],
  currentId: string | null,
  halfAngleDeg = FACING_HALF_ANGLE
): string | null {
  let best: { id: string; distance: number } | null = null;
  let current: { id: string; distance: number } | null = null;
  for (const c of candidates) {
    const dx = c.point.x - listener.x;
    const dz = c.point.z - listener.z;
    const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
    const off = Math.abs(normalizeDeg(bearing - listener.facingDeg));
    if (off > halfAngleDeg) continue;
    // "Facing" weighs the angle as well as the range: an instrument dead
    // ahead beats a slightly nearer one at the edge of view. The effective
    // distance grows as the instrument moves off-axis — doubled at the
    // edge of a 60° half-angle — rather than a hard nearest-wins.
    const distance =
      Math.hypot(dx, dz) / Math.max(0.5, Math.cos((off * Math.PI) / 180));
    if (c.id === currentId) current = { id: c.id, distance };
    if (!best || distance < best.distance) best = { id: c.id, distance };
  }
  if (!best) return null;
  if (current && best.distance >= current.distance * SWITCH_MARGIN)
    return current.id;
  return best.id;
}
