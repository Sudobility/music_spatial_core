import { describe, expect, it } from 'vitest';
import { listenerForStageDrag } from './stage-drag';
import { DEFAULT_FOV_DEG } from './project';

const VIEW = { width: 1200, height: 800 };
const AT_ORIGIN = { x: 0, z: 0, facingDeg: 0 };

describe('listenerForStageDrag', () => {
  it('keeps the grabbed point beneath the pointer horizontally', () => {
    const start = { x: 1.5, z: -2, facingDeg: 30 };
    const grabbed = 500;
    for (const x of [200, 700, 1100]) {
      const moved = listenerForStageDrag(start, VIEW, grabbed, x);
      const focal =
        VIEW.height / 2 / Math.tan((DEFAULT_FOV_DEG * Math.PI) / 360);
      const startBearing = Math.atan((grabbed - VIEW.width / 2) / focal);
      const endBearing = Math.atan((x - VIEW.width / 2) / focal);
      expect(moved.facingDeg + (endBearing * 180) / Math.PI).toBeCloseTo(
        start.facingDeg + (startBearing * 180) / Math.PI,
        9
      );
      expect(moved.x).toBe(start.x);
      expect(moved.z).toBe(start.z);
    }
  });

  it('turns left on a rightward drag and right on a leftward drag', () => {
    expect(
      listenerForStageDrag(AT_ORIGIN, VIEW, 400, 700).facingDeg
    ).toBeLessThan(0);
    expect(
      listenerForStageDrag(AT_ORIGIN, VIEW, 700, 400).facingDeg
    ).toBeGreaterThan(0);
  });

  it('returns to its initial facing when the pointer returns', () => {
    const start = { x: 2, z: 3, facingDeg: -45 };
    expect(listenerForStageDrag(start, VIEW, 500, 500)).toEqual(start);
  });

  it('ignores a view without a size', () => {
    expect(
      listenerForStageDrag(AT_ORIGIN, { width: 0, height: 800 }, 10, 100)
    ).toEqual(AT_ORIGIN);
  });
});
