import { describe, expect, it } from 'vitest';
import {
  pointFromPixel,
  pixelFromPoint,
  bearingFromCenter,
  stageDeltaFromPixelDelta,
  type OverlayGeometry,
} from './map-math';

const GEOMETRY: OverlayGeometry = {
  centerX: 100,
  centerY: 100,
  radiusPx: 80,
  radiusUnits: 5,
};

describe('pointFromPixel', () => {
  it('maps the center pixel to the origin point', () => {
    const point = pointFromPixel(GEOMETRY, 100, 100);
    expect(point.x).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0); // toBeCloseTo, not toEqual: -0 !== 0 under Object.is
  });

  it('maps rightward pixels to +x', () => {
    const point = pointFromPixel(GEOMETRY, 180, 100); // +80px right = +radiusUnits
    expect(point.x).toBeCloseTo(5);
    expect(point.z).toBeCloseTo(0);
  });

  it('maps upward pixels (smaller Y) to +z, forward into the arrangement', () => {
    const point = pointFromPixel(GEOMETRY, 100, 20); // -80px (up) = +radiusUnits forward
    expect(point.x).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(5);
  });

  it("maps downward pixels to -z, behind the listener's default position", () => {
    const point = pointFromPixel(GEOMETRY, 100, 180);
    expect(point.z).toBeCloseTo(-5);
  });

  it("clamps to the arrangement's radius rather than allowing an out-of-bounds drag", () => {
    const point = pointFromPixel(GEOMETRY, 260, 100); // 160px right, double the radius
    expect(Math.hypot(point.x, point.z)).toBeCloseTo(5);
    expect(point.x).toBeCloseTo(5);
  });
});

describe('pixelFromPoint', () => {
  it('round-trips with pointFromPixel for a point inside the radius', () => {
    const original = { x: 150, y: 40 };
    const point = pointFromPixel(GEOMETRY, original.x, original.y);
    const pixel = pixelFromPoint(GEOMETRY, point);
    expect(pixel.x).toBeCloseTo(original.x);
    expect(pixel.y).toBeCloseTo(original.y);
  });

  it("places the origin point at the geometry's center", () => {
    expect(pixelFromPoint(GEOMETRY, { x: 0, z: 0 })).toEqual({
      x: 100,
      y: 100,
    });
  });
});

describe('stageDeltaFromPixelDelta', () => {
  it('converts a rightward pixel delta to a +x stage delta', () => {
    const { dx, dz } = stageDeltaFromPixelDelta(GEOMETRY, 16, 0); // 16px = 1 unit at this scale
    expect(dx).toBeCloseTo(1);
    expect(dz).toBeCloseTo(0);
  });

  it('converts an upward (negative Y) pixel delta to a +z stage delta', () => {
    const { dx, dz } = stageDeltaFromPixelDelta(GEOMETRY, 0, -16);
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeCloseTo(1);
  });

  it('accumulates linearly, matching what a multi-event drag needs', () => {
    const start = stageDeltaFromPixelDelta(GEOMETRY, 8, 0);
    const rest = stageDeltaFromPixelDelta(GEOMETRY, 8, 0);
    const total = stageDeltaFromPixelDelta(GEOMETRY, 16, 0);
    expect(start.dx + rest.dx).toBeCloseTo(total.dx);
  });
});

describe('bearingFromCenter', () => {
  it('is 0 straight up from center (matching facingDeg 0 = +z ahead)', () => {
    expect(bearingFromCenter(GEOMETRY, 100, 20)).toBeCloseTo(0);
  });

  it('is 90 to the right of center', () => {
    expect(bearingFromCenter(GEOMETRY, 180, 100)).toBeCloseTo(90);
  });

  it('is -90 to the left of center', () => {
    expect(bearingFromCenter(GEOMETRY, 20, 100)).toBeCloseTo(-90);
  });

  it('is computed fresh from absolute position, so two calls at the same pixel always agree', () => {
    const a = bearingFromCenter(GEOMETRY, 140, 60);
    const b = bearingFromCenter(GEOMETRY, 140, 60);
    expect(a).toBe(b);
  });
});
