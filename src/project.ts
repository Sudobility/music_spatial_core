/**
 * The 3D stage as 2D line segments: `SpatialScene` projected through its own
 * camera onto a viewport, for a platform that draws lines rather than
 * running a GL rasteriser.
 *
 * ## Why this exists
 *
 * Every instrument model is polylines (`InstrumentSpatialModel.strokes`),
 * the floor is a grid of lines and the stage ring is a polyline, so the web
 * view's three.js scene is, in the end, a few thousand line segments with a
 * camera in front of them. React Native has no GL context of its own —
 * `music_app_rn` is a bare app with macOS and Windows targets, where the
 * one GL provider that exists (`expo-gl`) does not run — but it does have a
 * 2D canvas on every platform. Projecting here, once, in pure math, and
 * handing each platform "these segments, in this colour, this faded" gives
 * every platform the same picture from the same scene, and leaves nothing
 * platform-specific to get the camera wrong in.
 *
 * ## What it mirrors
 *
 * `buildScene` already speaks three.js: right-handed, x mirrored, camera
 * looking down its local -z, `rotation` as an XYZ Euler. This module uses
 * three's own `Matrix4`/`Euler` to compose the transforms so the projection
 * agrees with the GL view to the last sign — re-deriving rotation matrices
 * by hand would be a second, riskier way to compute the same thing (the
 * same reasoning `geometry.ts` gives for not baking poses). The fog is the
 * web canvas's linear fog, applied as a per-segment fade for the floor
 * (whose lines run the whole depth of the stage) and per instrument
 * (small enough that one distance describes it).
 *
 * ## Two halves, so the camera can move on another thread
 *
 * `worldStage` does everything that does not depend on the camera — every
 * instrument's strokes through its own transform into world space, with
 * three — and changes only when the score or the arrangement does.
 * `projectWorld` takes that and a camera to pixels in plain arithmetic, and
 * is a worklet: it calls nothing but other worklets, so a React Native host
 * can run it on the UI thread for every frame of a drag without the
 * JavaScript thread taking part. `projectScene` is the two together, so
 * there is one projector, not a three one and a fast one to drift apart.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type {
  SpatialCamera,
  SpatialInstrument,
  SpatialScene,
  Vec3Tuple,
} from './scene';
import { UNPLUGGED_RADIUS } from '@sudobility/music_types';

export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** Vertical field of view. Default: the web canvas's 70°. */
  readonly fovDeg?: number;
}

/** Flat `[x0, y0, x1, y1, ...]` pixel coordinates, one segment per four
 *  numbers. Flat rather than objects so a platform can hand it to a
 *  points-mode draw call or build a path string without a second pass. */
export type Segments = readonly number[];

export interface ProjectedInstrument {
  readonly trackId: string;
  readonly lit: boolean;
  readonly color: string;
  readonly litColor: string;
  readonly segments: Segments;
  /** 0 = in front of the listener, 1 = fully lost in the fog. */
  readonly fade: number;
  /** View-space distance, for painter's ordering (far first). */
  readonly distance: number;
}

/** A batch of segments sharing one fade level, for the floor. */
export interface FadedSegments {
  readonly segments: Segments;
  readonly fade: number;
}

export interface ProjectedScene {
  /** The floor grid's minor lines, batched by fade. */
  readonly floor: readonly FadedSegments[];
  /** The two centre lines of the grid, batched by fade. */
  readonly floorAxes: readonly FadedSegments[];
  /** The default half-circle the instruments start on. */
  readonly ring: readonly FadedSegments[];
  /** Far to near, so drawing in order overpaints correctly. */
  readonly instruments: readonly ProjectedInstrument[];
}

/** The web canvas's stage palette, so both platforms draw the same stage. */
export const STAGE_PALETTE = {
  background: '#12161d',
  gridMajor: '#3a4452',
  gridMinor: '#232a34',
  ring: '#4c5a6b',
} as const;

/** Linear fog, as the web canvas sets it: fully clear inside `near`, gone at `far`. */
export const FOG_NEAR = 8;
export const FOG_FAR = 30;

export const DEFAULT_FOV_DEG = 70;
/** Anything nearer the eye than this is clipped, as the web camera's `near`. */
const NEAR_PLANE = 0.05;

/** The floor grid: `GRID_SIZE` metres square, one line per metre — the web's `gridHelper(40, 40)`. */
const GRID_SIZE = 40;
const GRID_DIVISIONS = 40;
/** How many fade levels the floor is batched into. */
const FADE_STEPS = 8;
const RING_SEGMENTS = 48;
const RING_Y = 0.005;

/** How faded a point at `distance` from the eye is: 0 clear, 1 gone. */
export function fogFade(distance: number): number {
  'worklet';
  const t = (distance - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export function projectScene(
  scene: SpatialScene,
  viewport: Viewport
): ProjectedScene {
  return projectWorld(
    worldStage(scene.instruments),
    scene.instruments.filter(i => i.lit).map(i => i.trackId),
    scene.camera,
    viewport
  );
}

/** Flat `[ax, ay, az, bx, by, bz, ...]` world coordinates, one segment per six numbers. */
export type WorldSegments = readonly number[];

/** One instrument's strokes in world space — everything but whether it sounds. */
export interface WorldInstrument {
  readonly trackId: string;
  readonly color: string;
  readonly litColor: string;
  /** Its origin, which the fog and the painter's order measure from. */
  readonly position: Vec3Tuple;
  readonly segments: WorldSegments;
}

/** The stage with no camera: what `projectWorld` projects. */
export interface WorldStage {
  readonly floor: WorldSegments;
  readonly floorAxes: WorldSegments;
  readonly ring: WorldSegments;
  readonly instruments: readonly WorldInstrument[];
}

/**
 * The camera-independent half: each instrument's strokes carried through its
 * own position, rotation and scale. Whether one is lit is left out on
 * purpose, so a note starting changes nothing here.
 */
export function worldStage(
  instruments: readonly SpatialInstrument[]
): WorldStage {
  return {
    floor: FLOOR_MINOR,
    floorAxes: FLOOR_AXES,
    ring: RING,
    instruments: instruments.map(worldInstrument),
  };
}

function worldInstrument(instrument: SpatialInstrument): WorldInstrument {
  const [px, py, pz] = instrument.position;
  const [rx, ry, rz] = instrument.rotation;
  const model = new Matrix4().compose(
    new Vector3(px, py, pz),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')),
    new Vector3(instrument.scale, instrument.scale, instrument.scale)
  );
  const positions = instrument.geometry.getAttribute('position');
  const segments: number[] = [];
  const v = new Vector3();
  for (let i = 0; i + 1 < positions.count; i += 2) {
    v.fromBufferAttribute(positions, i).applyMatrix4(model);
    segments.push(v.x, v.y, v.z);
    v.fromBufferAttribute(positions, i + 1).applyMatrix4(model);
    segments.push(v.x, v.y, v.z);
  }
  return {
    trackId: instrument.trackId,
    color: instrument.color,
    litColor: instrument.litColor,
    position: instrument.position,
    segments,
  };
}

/** The grid, one metre a segment so the fog can vary along a line. */
function floorSegments(axesOnly: boolean): number[] {
  const half = GRID_SIZE / 2;
  const step = GRID_SIZE / GRID_DIVISIONS;
  const out: number[] = [];
  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const k = -half + i * step;
    if ((k === 0) !== axesOnly) continue;
    for (let j = 0; j < GRID_DIVISIONS; j++) {
      const s = -half + j * step;
      // A line along z at x = k, then along x at z = k.
      out.push(k, 0, s, k, 0, s + step);
      out.push(s, 0, k, s + step, 0, k);
    }
  }
  return out;
}

function ringSegments(): number[] {
  const out: number[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a0 = (Math.PI * i) / RING_SEGMENTS;
    const a1 = (Math.PI * (i + 1)) / RING_SEGMENTS;
    out.push(
      Math.cos(a0) * UNPLUGGED_RADIUS,
      RING_Y,
      Math.sin(a0) * UNPLUGGED_RADIUS,
      Math.cos(a1) * UNPLUGGED_RADIUS,
      RING_Y,
      Math.sin(a1) * UNPLUGGED_RADIUS
    );
  }
  return out;
}

const FLOOR_MINOR: WorldSegments = floorSegments(false);
const FLOOR_AXES: WorldSegments = floorSegments(true);
const RING: WorldSegments = ringSegments();

/**
 * The view transform and the lens, as plain numbers a worklet can carry:
 * the camera's rotation as three's XYZ Euler matrix (row-major here), whose
 * transpose takes world offsets from the eye into view space.
 */
interface Lens {
  readonly ex: number;
  readonly ey: number;
  readonly ez: number;
  readonly r: readonly number[];
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly focal: number;
}

function lensFor(camera: SpatialCamera, viewport: Viewport): Lens {
  'worklet';
  const fov = ((viewport.fovDeg ?? DEFAULT_FOV_DEG) * Math.PI) / 180;
  const halfHeight = viewport.height / 2;
  const [rx, ry, rz] = camera.rotation;
  // three's Matrix4.makeRotationFromEuler, order 'XYZ'.
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return {
    ex: camera.position[0],
    ey: camera.position[1],
    ez: camera.position[2],
    // prettier-ignore
    r: [
      c * e, -c * f, d,
      af + be * d, ae - bf * d, -b * c,
      bf - ae * d, be + af * d, a * c,
    ],
    halfWidth: viewport.width / 2,
    halfHeight,
    // A vertical field of view: the top of the view is tan(fov/2) units up
    // per unit of depth, whatever the aspect, so the horizontal extent
    // follows from the pixel aspect exactly as three's PerspectiveCamera.
    focal: halfHeight / Math.tan(fov / 2),
  };
}

/**
 * Segment `i` of `world` (six numbers from `i`) to pixels, clipped to the
 * near plane: a segment crossing it is cut at the plane rather than dropped,
 * so a floor line running under the listener's feet still reaches the bottom
 * of the view, and one wholly behind the eye is not drawn at all —
 * projecting a point behind the camera flips it through the origin, which is
 * the scribble a naive projector draws when the listener stands inside the
 * stage.
 */
function projectSegment(
  out: number[],
  lens: Lens,
  world: WorldSegments,
  i: number
): void {
  'worklet';
  const r = lens.r;
  const dax = world[i] - lens.ex;
  const day = world[i + 1] - lens.ey;
  const daz = world[i + 2] - lens.ez;
  const dbx = world[i + 3] - lens.ex;
  const dby = world[i + 4] - lens.ey;
  const dbz = world[i + 5] - lens.ez;
  // View = Rᵀ · (p − eye).
  let ax = r[0] * dax + r[3] * day + r[6] * daz;
  let ay = r[1] * dax + r[4] * day + r[7] * daz;
  let az = r[2] * dax + r[5] * day + r[8] * daz;
  let bx = r[0] * dbx + r[3] * dby + r[6] * dbz;
  let by = r[1] * dbx + r[4] * dby + r[7] * dbz;
  let bz = r[2] * dbx + r[5] * dby + r[8] * dbz;
  // View space looks down -z; "in front" is z < -NEAR_PLANE.
  const aIn = az < -NEAR_PLANE;
  const bIn = bz < -NEAR_PLANE;
  if (!aIn && !bIn) return;
  if (!aIn || !bIn) {
    const t = (-NEAR_PLANE - az) / (bz - az);
    const cx = ax + (bx - ax) * t;
    const cy = ay + (by - ay) * t;
    if (aIn) {
      bx = cx;
      by = cy;
      bz = -NEAR_PLANE;
    } else {
      ax = cx;
      ay = cy;
      az = -NEAR_PLANE;
    }
  }
  out.push(
    lens.halfWidth + (ax / -az) * lens.focal,
    lens.halfHeight - (ay / -az) * lens.focal,
    lens.halfWidth + (bx / -bz) * lens.focal,
    lens.halfHeight - (by / -bz) * lens.focal
  );
}

/**
 * Lines with a fog level per segment, measured at the midpoint, grouped
 * into `FADE_STEPS` levels so a platform draws them in a handful of calls
 * rather than one per segment. Far levels first.
 */
function projectFaded(lens: Lens, world: WorldSegments): FadedSegments[] {
  'worklet';
  const buckets: number[][] = [];
  for (let level = 0; level < FADE_STEPS; level++) buckets.push([]);
  for (let i = 0; i + 5 < world.length; i += 6) {
    const mx = (world[i] + world[i + 3]) / 2 - lens.ex;
    const my = (world[i + 1] + world[i + 4]) / 2 - lens.ey;
    const mz = (world[i + 2] + world[i + 5]) / 2 - lens.ez;
    const fade = fogFade(Math.sqrt(mx * mx + my * my + mz * mz));
    if (fade >= 1) continue;
    const level = Math.min(FADE_STEPS - 1, Math.floor(fade * FADE_STEPS));
    projectSegment(buckets[level], lens, world, i);
  }
  const batches: FadedSegments[] = [];
  for (let level = FADE_STEPS - 1; level >= 0; level--) {
    if (buckets[level].length > 0) {
      batches.push({
        segments: buckets[level],
        fade: (level + 0.5) / FADE_STEPS,
      });
    }
  }
  return batches;
}

/**
 * The camera-dependent half: `stage` through `camera` onto `viewport`. A
 * worklet — see the module doc — so it may run on a UI thread.
 */
export function projectWorld(
  stage: WorldStage,
  litTrackIds: readonly string[],
  camera: SpatialCamera,
  viewport: Viewport
): ProjectedScene {
  'worklet';
  const lens = lensFor(camera, viewport);
  const instruments: ProjectedInstrument[] = [];
  for (const instrument of stage.instruments) {
    const segments: number[] = [];
    const world = instrument.segments;
    for (let i = 0; i + 5 < world.length; i += 6) {
      projectSegment(segments, lens, world, i);
    }
    const dx = instrument.position[0] - lens.ex;
    const dy = instrument.position[1] - lens.ey;
    const dz = instrument.position[2] - lens.ez;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    instruments.push({
      trackId: instrument.trackId,
      lit: litTrackIds.includes(instrument.trackId),
      color: instrument.color,
      litColor: instrument.litColor,
      segments,
      fade: fogFade(distance),
      distance,
    });
  }
  instruments.sort((a, b) => b.distance - a.distance);
  return {
    floor: projectFaded(lens, stage.floor),
    floorAxes: projectFaded(lens, stage.floorAxes),
    ring: projectFaded(lens, stage.ring),
    instruments,
  };
}
