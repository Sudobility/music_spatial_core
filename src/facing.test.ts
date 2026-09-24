import { describe, expect, it } from 'vitest';
import { facingTrackId } from './facing';

const LEFT = { id: 'left', point: { x: -3, z: 4 } };
const MID = { id: 'mid', point: { x: 0, z: 5 } };
const RIGHT = { id: 'right', point: { x: 3, z: 4 } };
const ALL = [LEFT, MID, RIGHT];

describe('facingTrackId', () => {
  it('picks the nearest instrument in front', () => {
    expect(facingTrackId({ x: 0, z: 0, facingDeg: 0 }, ALL, null)).toBe('mid');
    expect(facingTrackId({ x: 0, z: 3, facingDeg: 0 }, ALL, null)).toBe('mid');
  });

  it('follows the facing: turning right picks the instrument on the right', () => {
    expect(facingTrackId({ x: 0, z: 0, facingDeg: 40 }, ALL, null)).toBe(
      'right'
    );
    expect(facingTrackId({ x: 0, z: 0, facingDeg: -40 }, ALL, null)).toBe(
      'left'
    );
  });

  it('returns null when nothing is in the field of view', () => {
    expect(facingTrackId({ x: 0, z: 0, facingDeg: 180 }, ALL, null)).toBeNull();
    expect(facingTrackId({ x: 0, z: 0, facingDeg: 0 }, [], null)).toBeNull();
  });

  it('prefers the instrument straight ahead over a slightly nearer one at the edge of view', () => {
    const ahead = { id: 'ahead', point: { x: 0, z: 4 } };
    const edge = { id: 'edge', point: { x: 2.5, z: 2.6 } }; // 3.6 m away, 44° off
    expect(
      facingTrackId({ x: 0, z: 0, facingDeg: 0 }, [ahead, edge], null)
    ).toBe('ahead');
  });

  it('keeps the current pick until a challenger is clearly nearer', () => {
    // Two instruments at exactly the same range and angle either side.
    const a = { id: 'a', point: { x: -1, z: 3 } };
    const b = { id: 'b', point: { x: 1, z: 3 } };
    const listener = { x: 0, z: 0, facingDeg: 0 };
    expect(facingTrackId(listener, [a, b], 'a')).toBe('a');
    expect(facingTrackId(listener, [a, b], 'b')).toBe('b');
    // A clearly nearer one takes over regardless.
    const near = { id: 'near', point: { x: 0.2, z: 1.5 } };
    expect(facingTrackId(listener, [a, b, near], 'a')).toBe('near');
  });

  it('drops the current pick once it leaves the field of view', () => {
    expect(facingTrackId({ x: 0, z: 0, facingDeg: 60 }, ALL, 'left')).toBe(
      'right'
    );
  });
});
