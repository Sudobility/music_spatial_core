/**
 * Random walking: the listener strolls from one *playing* instrument to
 * another on its own — picks one that is sounding (not the one it has just
 * visited, when there is a choice), walks up to it and stops a pace or two
 * in front, stands there facing it for a while, then picks another. If the
 * instrument it is heading for or standing at falls silent, it turns to
 * another that is playing; if nothing is playing, it stands where it is.
 *
 * "Playing" carries a short memory: a part rests for a beat between notes,
 * and a wanderer that gave up on every rest would never arrive anywhere.
 * An instrument counts as playing for `RECENT` seconds after it last
 * sounded.
 *
 * Never far from the group: every stop is within the instruments' own
 * spread plus a margin, and never inside one.
 *
 * Pure and frame-rate independent like `stepListener`, which it drives:
 * the platform package owns the frame loop and the random source, this
 * owns the behaviour, so it can be tested with a fixed `rng`.
 */
import type {
  UnpluggedListener,
  UnpluggedPoint,
} from '@sudobility/music_types';
import { stepListener, type MovementSpeed } from './movement';

export interface WanderInstrument {
  readonly id: string;
  readonly point: UnpluggedPoint;
  /** Has an active note right now. */
  readonly sounding: boolean;
}

export interface WanderState {
  /** Where the listener is walking to, or null while standing. */
  readonly target: UnpluggedPoint | null;
  /** The instrument being visited — faced while standing, not chosen twice running. */
  readonly anchorId: string | null;
  /** Elapsed-time value at which standing ends and a new target is picked. */
  readonly dwellUntil: number;
  /** Seconds of wandering so far — the clock `dwellUntil` is measured on. */
  readonly elapsed: number;
  /** When each instrument last sounded, on the same clock. */
  readonly heard: Readonly<Record<string, number>>;
}

export const IDLE_WANDER: WanderState = {
  target: null,
  anchorId: null,
  dwellUntil: 0,
  elapsed: 0,
  heard: {},
};

export interface WanderOptions {
  /** Walking pace. Default: a slow stroll. */
  readonly speed?: MovementSpeed;
  /** How long to stand at each instrument, seconds, [min, max]. */
  readonly dwell?: readonly [number, number];
  /** Closest the listener will stand to an instrument, meters. */
  readonly clearance?: number;
  /** How far beyond the instruments' own spread the listener may go, meters. */
  readonly margin?: number;
  /** Uniform random in [0, 1). Default `Math.random`; tests pass their own. */
  readonly rng?: () => number;
}

export const WANDER_SPEED: MovementSpeed = {
  metersPerSecond: 0.6,
  degreesPerSecond: 45,
};
/** How long after its last note an instrument still counts as playing. */
export const RECENT = 2.5;
const DEFAULT_DWELL: readonly [number, number] = [4, 9];
const DEFAULT_CLEARANCE = 0.9;
const DEFAULT_MARGIN = 1.5;
/** Considered arrived within this distance of the target, meters. */
const ARRIVE = 0.2;
/** Close enough to facing: stop turning, in degrees. */
const FACING_DEADBAND = 0.25;

function normalizeDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function centroid(points: readonly UnpluggedPoint[]): UnpluggedPoint {
  let x = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    z += p.z;
  }
  return { x: x / points.length, z: z / points.length };
}

function bearingDeg(from: UnpluggedPoint, to: UnpluggedPoint): number {
  return (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI;
}

function turnToward(
  listener: UnpluggedListener,
  point: UnpluggedPoint,
  deltaSeconds: number,
  speed: MovementSpeed
): { readonly listener: UnpluggedListener; readonly off: number } {
  const off = normalizeDeg(bearingDeg(listener, point) - listener.facingDeg);
  if (Math.abs(off) < FACING_DEADBAND) return { listener, off };
  const turned = stepListener(
    listener,
    { forward: 0, strafe: 0, turn: Math.max(-1, Math.min(1, off / 25)) },
    deltaSeconds,
    speed
  );
  return { listener: turned, off };
}

/**
 * The next instrument to visit, from `candidates`, and where to stand for
 * it: a spot a pace or two (`clearance` + 0.3–0.9 m) in front of it on the
 * side the listener is coming from, so the walk heads *toward* it. Never
 * the instrument just visited when there is a choice; never inside any
 * other instrument's clearance (`all`) or outside the group's reach —
 * after ten tries the stand-off point on the direct line is taken as is.
 */
export function pickWanderTarget(
  candidates: readonly WanderInstrument[],
  all: readonly WanderInstrument[],
  from: UnpluggedPoint,
  previousId: string | null,
  rng: () => number,
  clearance = DEFAULT_CLEARANCE,
  margin = DEFAULT_MARGIN
): { readonly target: UnpluggedPoint; readonly anchorId: string } {
  const points = all.map(i => i.point);
  const center = centroid(points);
  const reach =
    Math.max(...points.map(p => Math.hypot(p.x - center.x, p.z - center.z))) +
    margin;
  const choices =
    candidates.length > 1 && previousId
      ? candidates.filter(i => i.id !== previousId)
      : candidates;
  const anchor = choices[Math.floor(rng() * choices.length)];
  const standOff = clearance + 0.3 + rng() * 0.6;
  const direct = bearingDeg(anchor.point, from);
  let fallback: UnpluggedPoint | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    // Straight toward it first; if that spot is taken, fan out around it.
    const spreadDeg = attempt === 0 ? 0 : (rng() - 0.5) * 120;
    const a = ((direct + spreadDeg) * Math.PI) / 180;
    const candidate = {
      x: anchor.point.x + Math.sin(a) * standOff,
      z: anchor.point.z + Math.cos(a) * standOff,
    };
    fallback ??= candidate;
    const tooClose = all.some(
      i =>
        i.id !== anchor.id &&
        Math.hypot(i.point.x - candidate.x, i.point.z - candidate.z) < clearance
    );
    const tooFar =
      Math.hypot(candidate.x - center.x, candidate.z - center.z) > reach;
    if (!tooClose && !tooFar) return { target: candidate, anchorId: anchor.id };
  }
  return { target: fallback!, anchorId: anchor.id };
}

/**
 * One frame of wandering. Standing: turns to face the instrument it is
 * visiting and waits out the dwell, then picks the next playing one.
 * Walking: turns toward the target at a rate proportional to how far off
 * it is (so the turn eases out), and moves forward only once roughly
 * facing it, easing in as it lines up and easing out as it arrives.
 * Arrival starts the next dwell. Whichever it is doing, an anchor that
 * has fallen silent is dropped for a playing one at once; with nothing
 * playing it stands still.
 */
export function stepWander(
  listener: UnpluggedListener,
  state: WanderState,
  instruments: readonly WanderInstrument[],
  deltaSeconds: number,
  options: WanderOptions = {}
): { readonly listener: UnpluggedListener; readonly state: WanderState } {
  const rng = options.rng ?? Math.random;
  const speed = options.speed ?? WANDER_SPEED;
  const dwell = options.dwell ?? DEFAULT_DWELL;
  const elapsed = state.elapsed + deltaSeconds;

  // Remember what sounded, and decide what counts as playing.
  let heard = state.heard;
  for (const i of instruments) {
    if (i.sounding && heard[i.id] !== elapsed)
      heard = { ...heard, [i.id]: elapsed };
  }
  const playing = instruments.filter(
    i =>
      i.sounding ||
      (heard[i.id] !== undefined && elapsed - heard[i.id] <= RECENT)
  );
  const idle = (extra: Partial<WanderState> = {}): WanderState => ({
    ...state,
    ...extra,
    elapsed,
    heard,
  });

  if (instruments.length === 0 || playing.length === 0) {
    // Nothing to walk toward. Forget any visit so the next note starts one.
    return {
      listener,
      state: idle({ target: null, anchorId: null, dwellUntil: 0 }),
    };
  }

  const anchorPlaying =
    state.anchorId !== null && playing.some(i => i.id === state.anchorId);
  let target = anchorPlaying ? state.target : null;
  let anchorId = anchorPlaying ? state.anchorId : null;
  // A silent anchor is dropped: no dwell to wait out, pick afresh now.
  const dwellUntil = anchorPlaying ? state.dwellUntil : 0;

  if (!target) {
    if (elapsed < dwellUntil && anchorId) {
      // Standing: settle on facing the instrument being visited.
      const anchor = instruments.find(i => i.id === anchorId)!;
      const { listener: turned } = turnToward(
        listener,
        anchor.point,
        deltaSeconds,
        speed
      );
      return {
        listener: turned,
        state: idle({ target: null, anchorId, dwellUntil }),
      };
    }
    const pick = pickWanderTarget(
      playing,
      instruments,
      listener,
      state.anchorId,
      rng,
      options.clearance,
      options.margin
    );
    target = pick.target;
    anchorId = pick.anchorId;
  }

  const dx = target.x - listener.x;
  const dz = target.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (distance < ARRIVE) {
    const wait = dwell[0] + rng() * (dwell[1] - dwell[0]);
    return {
      listener,
      state: idle({ target: null, anchorId, dwellUntil: elapsed + wait }),
    };
  }

  const off = normalizeDeg(bearingDeg(listener, target) - listener.facingDeg);
  const turn = Math.max(-1, Math.min(1, off / 25));
  const facingFactor = Math.max(0, 1 - Math.abs(off) / 60);
  const forward = Math.min(1, distance / 1.2) * facingFactor;
  const next = stepListener(
    listener,
    { forward, strafe: 0, turn },
    deltaSeconds,
    speed
  );
  return { listener: next, state: idle({ target, anchorId, dwellUntil }) };
}
