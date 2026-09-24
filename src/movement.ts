/**
 * Continuous, frame-rate-independent listener movement for the Spatial 3D
 * view — walking while a key is held or a joystick is pushed, as distinct
 * from the 2D map's discrete one-step-per-keypress nudge (which stays a
 * direct, simpler caller of the Unplugged commands, unchanged by this).
 *
 * Lives here, not in `@sudobility/music_lib`, because it's Spatial-view-only
 * behavior — nothing else in either app ever calls it — while `music_lib`
 * keeps only what's needed independent of whether the Spatial view exists
 * (`effectiveUnpluggedArrangement`, the audio mix formula).
 */
import type { UnpluggedListener } from '@sudobility/music_types';

export interface MovementInput {
  /** -1 (backward) .. 1 (forward), relative to the listener's current facing. */
  readonly forward: number;
  /** -1 (left) .. 1 (right), relative to the listener's current facing. */
  readonly strafe: number;
  /** -1 (turn left) .. 1 (turn right). */
  readonly turn: number;
}

export interface MovementSpeed {
  readonly metersPerSecond: number;
  readonly degreesPerSecond: number;
}

export const DEFAULT_MOVEMENT_SPEED: MovementSpeed = {
  metersPerSecond: 3,
  degreesPerSecond: 120,
};

function clampAxis(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/** Normalizes to (-180, 180], the same range a long play session's
 *  accumulated turning would otherwise drift outside of. */
function normalizeDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * One frame's movement: turn first, then move along the *new* facing — the
 * way a person actually walks while turning, and the only order that makes
 * "hold forward and turn" curve rather than move in a straight line then
 * snap direction.
 *
 * Uses the exact bearing convention `unplugged.ts` (music_lib) already
 * established: `dx = distance * sin(bearingRad)`, `dz = distance *
 * cos(bearingRad)`, `facingDeg` clockwise-positive from `+z`. Strafe moves
 * perpendicular to facing, 90° clockwise (right).
 */
export function stepListener(
  listener: UnpluggedListener,
  input: MovementInput,
  deltaSeconds: number,
  speed: MovementSpeed = DEFAULT_MOVEMENT_SPEED
): UnpluggedListener {
  const forward = clampAxis(input.forward);
  const strafe = clampAxis(input.strafe);
  const turn = clampAxis(input.turn);

  const facingDeg = normalizeDeg(
    listener.facingDeg + turn * speed.degreesPerSecond * deltaSeconds
  );
  const facingRad = (facingDeg * Math.PI) / 180;
  const strafeRad = facingRad + Math.PI / 2;

  const forwardDistance = forward * speed.metersPerSecond * deltaSeconds;
  const strafeDistance = strafe * speed.metersPerSecond * deltaSeconds;

  return {
    x:
      listener.x +
      forwardDistance * Math.sin(facingRad) +
      strafeDistance * Math.sin(strafeRad),
    z:
      listener.z +
      forwardDistance * Math.cos(facingRad) +
      strafeDistance * Math.cos(strafeRad),
    facingDeg,
  };
}
