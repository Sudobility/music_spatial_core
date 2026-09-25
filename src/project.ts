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
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { SpatialInstrument, SpatialScene } from './scene';
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
  const t = (distance - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export function projectScene(
  scene: SpatialScene,
  viewport: Viewport
): ProjectedScene {
  const projector = new Projector(scene, viewport);
  return {
    floor: projector.floor(false),
    floorAxes: projector.floor(true),
    ring: projector.ring(),
    instruments: scene.instruments
      .map(instrument => projector.instrument(instrument))
      .sort((a, b) => b.distance - a.distance),
  };
}

class Projector {
  private readonly view = new Matrix4();
  private readonly halfWidth: number;
  private readonly halfHeight: number;
  /** Pixels per unit of x/z over -z_view, from the field of view. */
  private readonly focalY: number;
  private readonly focalX: number;
  private readonly eye: Vector3;

  constructor(scene: SpatialScene, viewport: Viewport) {
    const fov = ((viewport.fovDeg ?? DEFAULT_FOV_DEG) * Math.PI) / 180;
    this.halfWidth = viewport.width / 2;
    this.halfHeight = viewport.height / 2;
    // A vertical field of view: the top of the view is tan(fov/2) units up
    // per unit of depth, whatever the aspect, so the horizontal extent
    // follows from the pixel aspect exactly as three's PerspectiveCamera.
    this.focalY = this.halfHeight / Math.tan(fov / 2);
    this.focalX = this.focalY;

    const [cx, cy, cz] = scene.camera.position;
    const [rx, ry, rz] = scene.camera.rotation;
    this.eye = new Vector3(cx, cy, cz);
    const cameraWorld = new Matrix4().compose(
      this.eye,
      new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')),
      new Vector3(1, 1, 1)
    );
    this.view.copy(cameraWorld).invert();
  }

  instrument(instrument: SpatialInstrument): ProjectedInstrument {
    const [px, py, pz] = instrument.position;
    const [rx, ry, rz] = instrument.rotation;
    const model = new Matrix4().compose(
      new Vector3(px, py, pz),
      new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')),
      new Vector3(instrument.scale, instrument.scale, instrument.scale)
    );
    const modelView = new Matrix4().multiplyMatrices(this.view, model);

    const segments: number[] = [];
    const a = new Vector3();
    const b = new Vector3();
    for (const geometry of instrument.geometry) {
      const positions = geometry.getAttribute('position');
      for (let i = 0; i + 1 < positions.count; i += 2) {
        a.fromBufferAttribute(positions, i).applyMatrix4(modelView);
        b.fromBufferAttribute(positions, i + 1).applyMatrix4(modelView);
        this.pushSegment(segments, a, b);
      }
    }

    const distance = this.eye.distanceTo(new Vector3(px, py, pz));
    return {
      trackId: instrument.trackId,
      lit: instrument.lit,
      color: instrument.color,
      litColor: instrument.litColor,
      segments,
      fade: fogFade(distance),
      distance,
    };
  }

  /** The grid, one metre a segment so the fog can vary along a line. */
  floor(axesOnly: boolean): FadedSegments[] {
    const half = GRID_SIZE / 2;
    const step = GRID_SIZE / GRID_DIVISIONS;
    const buckets = new FadeBuckets();
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i <= GRID_DIVISIONS; i++) {
      const k = -half + i * step;
      const isAxis = k === 0;
      if (isAxis !== axesOnly) continue;
      for (let j = 0; j < GRID_DIVISIONS; j++) {
        const s = -half + j * step;
        // A line along z at x = k, then along x at z = k.
        a.set(k, 0, s);
        b.set(k, 0, s + step);
        this.pushWorldSegment(buckets, a, b);
        a.set(s, 0, k);
        b.set(s + step, 0, k);
        this.pushWorldSegment(buckets, a, b);
      }
    }
    return buckets.batches();
  }

  ring(): FadedSegments[] {
    const buckets = new FadeBuckets();
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const a0 = (Math.PI * i) / RING_SEGMENTS;
      const a1 = (Math.PI * (i + 1)) / RING_SEGMENTS;
      a.set(
        Math.cos(a0) * UNPLUGGED_RADIUS,
        RING_Y,
        Math.sin(a0) * UNPLUGGED_RADIUS
      );
      b.set(
        Math.cos(a1) * UNPLUGGED_RADIUS,
        RING_Y,
        Math.sin(a1) * UNPLUGGED_RADIUS
      );
      this.pushWorldSegment(buckets, a, b);
    }
    return buckets.batches();
  }

  private pushWorldSegment(buckets: FadeBuckets, a: Vector3, b: Vector3) {
    const fade = fogFade(
      this.eye.distanceTo(
        new Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
      )
    );
    if (fade >= 1) return;
    a.applyMatrix4(this.view);
    b.applyMatrix4(this.view);
    this.pushSegment(buckets.for(fade), a, b);
  }

  /**
   * One view-space segment to pixels, clipped to the near plane: a segment
   * crossing it is cut at the plane rather than dropped, so a floor line
   * running under the listener's feet still reaches the bottom of the view,
   * and one wholly behind the eye is not drawn at all — projecting a point
   * behind the camera flips it through the origin, which is the scribble a
   * naive projector draws when the listener stands inside the stage.
   */
  private pushSegment(out: number[], a: Vector3, b: Vector3): void {
    // View space looks down -z; "in front" is z < -NEAR_PLANE.
    const aIn = a.z < -NEAR_PLANE;
    const bIn = b.z < -NEAR_PLANE;
    if (!aIn && !bIn) return;
    if (!aIn || !bIn) {
      const t = (-NEAR_PLANE - a.z) / (b.z - a.z);
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      if (aIn) b.set(cx, cy, -NEAR_PLANE);
      else a.set(cx, cy, -NEAR_PLANE);
    }
    out.push(
      this.halfWidth + (a.x / -a.z) * this.focalX,
      this.halfHeight - (a.y / -a.z) * this.focalY,
      this.halfWidth + (b.x / -b.z) * this.focalX,
      this.halfHeight - (b.y / -b.z) * this.focalY
    );
  }
}

/** Segments grouped into `FADE_STEPS` fade levels, so a platform draws the
 *  floor in a handful of calls rather than one per segment. */
class FadeBuckets {
  private readonly buckets = new Map<number, number[]>();

  for(fade: number): number[] {
    const level = Math.min(FADE_STEPS - 1, Math.floor(fade * FADE_STEPS));
    let bucket = this.buckets.get(level);
    if (!bucket) {
      bucket = [];
      this.buckets.set(level, bucket);
    }
    return bucket;
  }

  batches(): FadedSegments[] {
    return [...this.buckets.entries()]
      .sort((x, y) => y[0] - x[0])
      .map(([level, segments]) => ({
        segments,
        fade: (level + 0.5) / FADE_STEPS,
      }));
  }
}
