import { describe, expect, it } from 'vitest';
import { BufferGeometry } from 'three';
import { spatialModel, trackSpatialModel } from '@sudobility/music_types';
import { buildInstrumentGeometry, instrumentSegmentCount } from './geometry';

/** The four-track band the draw-call audit was measured on. */
const BAND = [
  { clef: 'treble', midiProgram: 0 }, // acoustic grand piano
  { clef: 'bass', midiProgram: 33 }, // electric bass (finger)
  { clef: 'treble', midiProgram: 48 }, // string ensemble
  { clef: 'percussion', midiProgram: 0 }, // standard kit
] as const;

describe('buildInstrumentGeometry', () => {
  // Used to be "one BufferGeometry per stroke". Merged on purpose: every
  // stroke of a model is drawn in the same colour, so one geometry per
  // stroke was one draw call per stroke for nothing — ~645 of them for a
  // four-track band, 58% of them a single two-vertex segment.
  it('merges every stroke of a model into ONE geometry', () => {
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
    const geometry = buildInstrumentGeometry(model);
    expect(geometry).toBeInstanceOf(BufferGeometry);
    // Three single-segment strokes: 3 segments, 6 vertices.
    expect(instrumentSegmentCount(model)).toBe(3);
    expect(geometry.getAttribute('position').count).toBe(6);
  });

  it('holds exactly the vertices the per-stroke geometries held: 2 x sum of (points - 1) over the strokes', () => {
    for (const track of BAND) {
      const { model } = trackSpatialModel(track);
      const perStroke = model.strokes.reduce(
        (sum, stroke) => sum + 2 * (stroke.length - 1),
        0
      );
      expect(perStroke).toBeGreaterThan(0);
      expect(instrumentSegmentCount(model) * 2).toBe(perStroke);
      expect(
        buildInstrumentGeometry(model).getAttribute('position').count
      ).toBe(perStroke);
    }
  });

  it('turns an N-point stroke into N-1 line segments, with x mirrored into the right-handed frame, strokes back to back', () => {
    const model = spatialModel('test', [
      [
        [2, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      [
        [0, 0, 5],
        [0, 0, 6],
      ],
    ]);
    const geometry = buildInstrumentGeometry(model);
    const position = geometry.getAttribute('position');
    // Two segments (4 points) from the first stroke, one (2 points) from
    // the second; 3 floats each; x negated (see scene.ts).
    expect(position.count).toBe(6);
    expect(Array.from(position.array)).toEqual([
      -2,
      0,
      0,
      -1,
      0,
      0, // stroke 1, segment 1: point 0 -> point 1
      -1,
      0,
      0,
      -1,
      1,
      0, // stroke 1, segment 2: point 1 -> point 2
      -0,
      0,
      5,
      -0,
      0,
      6, // stroke 2
    ]);
  });

  it('returns the same geometry for the same model — it is cached by identity', () => {
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
    const geometry = buildInstrumentGeometry(model);
    expect(instrumentSegmentCount(model)).toBe(0);
    expect(geometry.getAttribute('position').count).toBe(0);
  });
});
