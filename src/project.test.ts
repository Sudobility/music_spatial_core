import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { twoTrackScore } from '@sudobility/music_types/test';
import { buildScene, type SpatialInstrument, type SpatialScene } from './scene';
import { FOG_FAR, FOG_NEAR, fogFade, projectScene } from './project';

const VIEW = { width: 400, height: 300 };
const EAR = 1.6;

/** A camera where `buildScene` puts an untouched listener: at the origin,
 *  ear height, facing arrangement +z (a three.js yaw of PI). */
const CAMERA = {
  position: [0, EAR, 0] as const,
  rotation: [0, Math.PI, 0] as const,
};

function segmentGeometry(
  ...points: readonly (readonly [number, number, number])[]
): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
  return g;
}

function instrumentAt(
  position: readonly [number, number, number],
  geometry: BufferGeometry,
  trackId = 't'
): SpatialInstrument {
  return {
    trackId,
    geometry: [geometry],
    position,
    rotation: [0, 0, 0],
    scale: 1,
    lit: false,
    color: 'grey',
    litColor: 'white',
  };
}

function sceneOf(...instruments: SpatialInstrument[]): SpatialScene {
  return { instruments, camera: CAMERA };
}

describe('projectScene', () => {
  it('puts a segment straight ahead at ear height in the centre of the view', () => {
    // World coordinates: the instrument sits at the origin and its one
    // segment runs from 5 to 6 metres out along +z at ear height.
    const scene = sceneOf(
      instrumentAt([0, 0, 0], segmentGeometry([0, EAR, 5], [0, EAR, 6]))
    );
    const [inst] = projectScene(scene, VIEW).instruments;
    const [x0, y0, x1, y1] = inst.segments;
    expect(x0).toBeCloseTo(VIEW.width / 2);
    expect(x1).toBeCloseTo(VIEW.width / 2);
    expect(y0).toBeCloseTo(VIEW.height / 2);
    expect(y1).toBeCloseTo(VIEW.height / 2);
  });

  it("draws the listener's right on the right and up as up", () => {
    // Arrangement +x is the listener's right; buildScene mirrors it to
    // world -x. A point at world x = -1 must land right of centre, and one
    // above ear height above centre (pixel y grows downward).
    const scene = sceneOf(
      instrumentAt([0, 0, 0], segmentGeometry([-1, EAR, 5], [-1, EAR + 1, 5]))
    );
    const [inst] = projectScene(scene, VIEW).instruments;
    const [x0, y0, , y1] = inst.segments;
    expect(x0).toBeGreaterThan(VIEW.width / 2);
    expect(y0).toBeCloseTo(VIEW.height / 2);
    expect(y1).toBeLessThan(VIEW.height / 2);
  });

  it('drops a segment wholly behind the eye rather than mirroring it through the origin', () => {
    const scene = sceneOf(
      instrumentAt([0, 0, 0], segmentGeometry([0, EAR, -5], [1, EAR, -6]))
    );
    const [inst] = projectScene(scene, VIEW).instruments;
    expect(inst.segments).toEqual([]);
  });

  it('clips a segment crossing the near plane instead of dropping it', () => {
    // From a metre behind the listener to three metres ahead, on the
    // floor: the floor under the feet must still reach the bottom edge.
    const scene = sceneOf(
      instrumentAt([0, 0, 0], segmentGeometry([0, 0, -1], [0, 0, 3]))
    );
    const [inst] = projectScene(scene, VIEW).instruments;
    expect(inst.segments).toHaveLength(4);
    for (const v of inst.segments) expect(Number.isFinite(v)).toBe(true);
    const [, yBehind, , yAhead] = inst.segments;
    // The clipped end is (almost) under the eye, so far below the view's
    // bottom; the far end is on screen below the horizon.
    expect(yBehind).toBeGreaterThan(yAhead);
    expect(yAhead).toBeGreaterThan(VIEW.height / 2);
  });

  it('applies the transform buildScene hands over: position and scale', () => {
    // The same unit segment, placed 5 m out at scale 2, spans twice the
    // pixels of the one at scale 1.
    const unit = segmentGeometry([0, EAR, 0], [0, EAR + 1, 0]);
    const one = instrumentAt([0, 0, 5], unit, 'one');
    const two = { ...instrumentAt([0, 0, 5], unit, 'two'), scale: 2 };
    const projected = projectScene(sceneOf(one, two), VIEW).instruments;
    const height = (i: (typeof projected)[number]) =>
      Math.abs(i.segments[3] - i.segments[1]);
    const a = projected.find(i => i.trackId === 'one')!;
    const b = projected.find(i => i.trackId === 'two')!;
    // Scale is about the instrument's own origin, which is on the floor, so
    // the scaled segment also starts higher; compare lengths only.
    expect(height(b)).toBeCloseTo(height(a) * 2, 3);
  });

  it('orders instruments far to near, with the fog on the far one', () => {
    const g = segmentGeometry([0, 1, 0], [0, 2, 0]);
    const near = instrumentAt([0, 0, 4], g, 'near');
    const far = instrumentAt([0, 0, 25], g, 'far');
    const { instruments } = projectScene(sceneOf(near, far), VIEW);
    expect(instruments.map(i => i.trackId)).toEqual(['far', 'near']);
    expect(instruments[0].fade).toBeGreaterThan(0.5);
    expect(instruments[1].fade).toBe(0);
  });

  it('draws a floor, its axes and the stage ring, none of it past the fog', () => {
    const projected = projectScene(sceneOf(), VIEW);
    const total = (batches: readonly { segments: readonly number[] }[]) =>
      batches.reduce((n, b) => n + b.segments.length, 0);
    expect(total(projected.floor)).toBeGreaterThan(0);
    expect(total(projected.floorAxes)).toBeGreaterThan(0);
    expect(total(projected.ring)).toBeGreaterThan(0);
    for (const batch of [
      ...projected.floor,
      ...projected.floorAxes,
      ...projected.ring,
    ]) {
      expect(batch.fade).toBeLessThan(1);
      expect(batch.segments.length % 4).toBe(0);
    }
  });

  it('projects every instrument of a real scene to at least one segment', () => {
    // The fixture's two tracks default to the ends of the half-circle, at
    // ±90° from a listener at the origin — beside the ears, outside a 70°
    // camera, which is correct and useless here. Step back until both are
    // in front.
    const score = {
      ...twoTrackScore(),
      unplugged: { listener: { x: 0, z: -8, facingDeg: 0 }, tracks: {} },
    };
    const scene = buildScene(score, new Set());
    const projected = projectScene(scene, VIEW);
    expect(projected.instruments).toHaveLength(scene.instruments.length);
    for (const inst of projected.instruments) {
      expect(inst.segments.length).toBeGreaterThan(0);
      expect(inst.segments.length % 4).toBe(0);
    }
  });
});

describe('fogFade', () => {
  it('is clear inside the near distance, gone past the far one, linear between', () => {
    expect(fogFade(0)).toBe(0);
    expect(fogFade(FOG_NEAR)).toBe(0);
    expect(fogFade(FOG_FAR)).toBe(1);
    expect(fogFade(FOG_FAR + 10)).toBe(1);
    expect(fogFade((FOG_NEAR + FOG_FAR) / 2)).toBeCloseTo(0.5);
  });
});
