import { describe, expect, it } from 'vitest';
import { ICON_VIEWBOX, parseIconPath } from '@sudobility/music_types';
import {
  FEMALE_VOCALIST,
  MALE_VOCALIST,
  performerForTrack,
} from './voice-models';
import { instrumentSegmentCount } from './geometry';

const PERFORMERS = [
  ['male', MALE_VOCALIST],
  ['female', FEMALE_VOCALIST],
] as const;

describe('performerForTrack', () => {
  it('draws Choir Aahs as the man and Voice Oohs as the woman', () => {
    expect(performerForTrack({ clef: 'treble', midiProgram: 52 })).toBe(
      MALE_VOCALIST
    );
    expect(performerForTrack({ clef: 'treble', midiProgram: 53 })).toBe(
      FEMALE_VOCALIST
    );
  });

  it('leaves every other program, and drum kits 52 and 53, alone', () => {
    expect(performerForTrack({ clef: 'treble', midiProgram: 54 })).toBe(
      undefined
    );
    expect(performerForTrack({ clef: 'percussion', midiProgram: 52 })).toBe(
      undefined
    );
    expect(performerForTrack({ clef: 'percussion', midiProgram: 53 })).toBe(
      undefined
    );
  });
});

describe.each(PERFORMERS)('the %s singer', (_, performer) => {
  const points = performer.lineModel.strokes.flat();

  it('stands on the floor at a person’s height, facing the audience', () => {
    const ys = points.map(p => p[1]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...ys)).toBeLessThan(0.05);
    expect(Math.max(...ys)).toBeGreaterThan(1.7);
    expect(Math.max(...ys)).toBeLessThan(2.1);
    // The microphone is in front of the face (+z), not behind it.
    const head = points.filter(p => p[1] > 1.45 && p[1] < 1.6);
    expect(Math.max(...head.map(p => p[2]))).toBeGreaterThan(0.1);
  });

  it('draws every edge of the mesh, within what a frame can project', () => {
    // Every quad edge of the GLB is kept (only triangle diagonals go), and
    // every segment is projected on every frame — so a ceiling, not a target.
    const segments = instrumentSegmentCount(performer.lineModel);
    expect(segments).toBeGreaterThan(3000);
    expect(segments).toBeLessThan(8000);
  });

  it('has a map icon inside the icon viewbox, in the path subset icons allow', () => {
    expect(performer.icon.shapes.length).toBeGreaterThan(0);
    for (const shape of performer.icon.shapes) {
      expect(shape.kind).toBe('path');
      if (shape.kind !== 'path') continue;
      expect(() => parseIconPath(shape.d)).not.toThrow();
      for (const n of shape.d.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(ICON_VIEWBOX);
      }
    }
  });

  it('has bounds that cover its strokes', () => {
    expect(performer.lineModel.boundsRadius).toBeGreaterThan(0.9);
  });
});
