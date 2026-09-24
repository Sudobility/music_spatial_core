import { describe, expect, it } from 'vitest';
import { stepListener, DEFAULT_MOVEMENT_SPEED } from './movement';

const AT_ORIGIN = { x: 0, z: 0, facingDeg: 0 };

describe('stepListener', () => {
  it('moves straight ahead (+z) when facing 0 and given pure forward input', () => {
    const next = stepListener(AT_ORIGIN, { forward: 1, strafe: 0, turn: 0 }, 1);
    expect(next.x).toBeCloseTo(0);
    expect(next.z).toBeCloseTo(DEFAULT_MOVEMENT_SPEED.metersPerSecond);
    expect(next.facingDeg).toBe(0);
  });

  it('moves backward (-z) on negative forward input', () => {
    const next = stepListener(
      AT_ORIGIN,
      { forward: -1, strafe: 0, turn: 0 },
      1
    );
    expect(next.z).toBeCloseTo(-DEFAULT_MOVEMENT_SPEED.metersPerSecond);
  });

  it('turns right (increasing facingDeg) on positive turn input', () => {
    const next = stepListener(AT_ORIGIN, { forward: 0, strafe: 0, turn: 1 }, 1);
    expect(next.facingDeg).toBeCloseTo(DEFAULT_MOVEMENT_SPEED.degreesPerSecond);
  });

  it('turns left (decreasing facingDeg) on negative turn input', () => {
    const next = stepListener(
      AT_ORIGIN,
      { forward: 0, strafe: 0, turn: -1 },
      1
    );
    expect(next.facingDeg).toBeCloseTo(
      -DEFAULT_MOVEMENT_SPEED.degreesPerSecond
    );
  });

  it('moves along the NEW facing when turning and moving in the same tick', () => {
    // A quarter turn right (90 deg) then full forward for the same tick
    // should move along +x, not +z, matching a person who turns then walks.
    const speed = { metersPerSecond: 1, degreesPerSecond: 90 };
    const next = stepListener(
      AT_ORIGIN,
      { forward: 1, strafe: 0, turn: 1 },
      1,
      speed
    );
    expect(next.facingDeg).toBeCloseTo(90);
    expect(next.x).toBeCloseTo(1);
    expect(next.z).toBeCloseTo(0);
  });

  it('strafes right (+x) 90 degrees clockwise from facing, at facingDeg 0', () => {
    const next = stepListener(AT_ORIGIN, { forward: 0, strafe: 1, turn: 0 }, 1);
    expect(next.x).toBeCloseTo(DEFAULT_MOVEMENT_SPEED.metersPerSecond);
    expect(next.z).toBeCloseTo(0);
  });

  it('is frame-rate independent for pure translation (no turn)', () => {
    // Splitting into substeps must match exactly when nothing turns — motion
    // is linear in time with no coupling to make it step-size dependent.
    const speed = { metersPerSecond: 2, degreesPerSecond: 60 };
    const input = { forward: 1, strafe: 0.3, turn: 0 };
    const full = stepListener(AT_ORIGIN, input, 1, speed);
    let split = AT_ORIGIN;
    split = stepListener(split, input, 0.5, speed);
    split = stepListener(split, input, 0.5, speed);
    expect(split.x).toBeCloseTo(full.x, 5);
    expect(split.z).toBeCloseTo(full.z, 5);
  });

  it('is frame-rate independent for pure rotation (no translation)', () => {
    const speed = { metersPerSecond: 2, degreesPerSecond: 60 };
    const input = { forward: 0, strafe: 0, turn: 0.5 };
    const full = stepListener(AT_ORIGIN, input, 1, speed);
    let split = AT_ORIGIN;
    split = stepListener(split, input, 0.5, speed);
    split = stepListener(split, input, 0.5, speed);
    expect(split.facingDeg).toBeCloseTo(full.facingDeg, 5);
  });

  it('curves rather than jumps when turning and moving together across substeps', () => {
    // Turning WHILE moving is inherently step-size dependent — a big single
    // step moves in a straight line at the ending angle, while finer
    // substeps curve, the same way any real-time movement integrator
    // behaves. This is the expected shape, not a bug: verified here as "not
    // equal to the single-step answer" rather than asserted equal to it.
    const speed = { metersPerSecond: 2, degreesPerSecond: 60 };
    const input = { forward: 1, strafe: 0, turn: 0.5 };
    const full = stepListener(AT_ORIGIN, input, 1, speed);
    let split = AT_ORIGIN;
    for (let i = 0; i < 10; i++) split = stepListener(split, input, 0.1, speed);
    expect(split.facingDeg).toBeCloseTo(full.facingDeg, 5); // rotation itself still matches
    expect(split.x).not.toBeCloseTo(full.x, 3); // but the path curved, so position differs
  });

  it('clamps each axis to [-1, 1] rather than letting an out-of-range input overdrive movement', () => {
    const overdriven = stepListener(
      AT_ORIGIN,
      { forward: 5, strafe: 0, turn: 0 },
      1
    );
    const clamped = stepListener(
      AT_ORIGIN,
      { forward: 1, strafe: 0, turn: 0 },
      1
    );
    expect(overdriven.z).toBeCloseTo(clamped.z);
  });

  it('normalizes facingDeg to (-180, 180] rather than drifting unbounded', () => {
    const next = stepListener(
      { x: 0, z: 0, facingDeg: 170 },
      { forward: 0, strafe: 0, turn: 1 },
      1,
      { metersPerSecond: 0, degreesPerSecond: 30 }
    );
    expect(next.facingDeg).toBeCloseTo(-160);
  });

  it('leaves position and facing untouched with zero input', () => {
    const next = stepListener(
      { x: 1.5, z: -2.5, facingDeg: 45 },
      { forward: 0, strafe: 0, turn: 0 },
      1
    );
    expect(next).toEqual({ x: 1.5, z: -2.5, facingDeg: 45 });
  });
});
