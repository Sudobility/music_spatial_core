import { describe, expect, it } from 'vitest';
import { spatialModel } from '@sudobility/music_types';
import { buildInstrumentGeometry } from './geometry';

describe('buildInstrumentGeometry', () => {
  it('produces one BufferGeometry per stroke', () => {
    const model = spatialModel('test', [
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
      [
        [0, 0, 0],
        [0, 1, 0],
      ],
      [
        [0, 0, 0],
        [0, 0, 1],
      ],
    ]);
    expect(buildInstrumentGeometry(model)).toHaveLength(3);
  });

  it('turns an N-point stroke into N-1 line segments, with x mirrored into the right-handed frame', () => {
    const model = spatialModel('test', [
      [
        [2, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
    ]);
    const [geometry] = buildInstrumentGeometry(model);
    const position = geometry.getAttribute('position');
    // Two segments (4 points), 3 floats each; x negated (see scene.ts).
    expect(position.count).toBe(4);
    expect(Array.from(position.array)).toEqual([
      -2,
      0,
      0,
      -1,
      0,
      0, // segment 1: point 0 -> point 1
      -1,
      0,
      0,
      -1,
      1,
      0, // segment 2: point 1 -> point 2
    ]);
  });

  it('returns the same geometries for the same model — they are cached by identity', () => {
    const model = spatialModel('cached', [
      [
        [1, 0, 0],
        [2, 0, 0],
      ],
    ]);
    expect(buildInstrumentGeometry(model)).toBe(buildInstrumentGeometry(model));
  });

  it('produces an empty geometry for a degenerate single-point stroke, rather than throwing', () => {
    const model = spatialModel('degenerate', [[[0, 0, 0]]]);
    const [geometry] = buildInstrumentGeometry(model);
    expect(geometry.getAttribute('position').count).toBe(0);
  });
});
