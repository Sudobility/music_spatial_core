import { describe, expect, it } from 'vitest';
import { hueFromName, trackColors } from './colors';

describe('hueFromName', () => {
  it('is deterministic and in range', () => {
    expect(hueFromName('Cello')).toBe(hueFromName('Cello'));
    for (const name of ['Cello', 'Violin', 'Piano', '', 'Drums 2']) {
      const h = hueFromName(name);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('gives different names different hues', () => {
    expect(hueFromName('Violin')).not.toBeCloseTo(hueFromName('Viola'), 0);
  });
});

describe('trackColors', () => {
  it('keys a colour by track id, based on the name', () => {
    const colors = trackColors([{ id: 'a', name: 'Cello' }]);
    expect(colors.a.hue).toBeCloseTo(hueFromName('Cello'));
    expect(colors.a.base).toMatch(/^hsl\(/);
    expect(colors.a.lit).not.toBe(colors.a.base);
  });

  it('separates two tracks with the same name', () => {
    const colors = trackColors([
      { id: 'a', name: 'Violin' },
      { id: 'b', name: 'Violin' },
    ]);
    const gap = Math.abs(colors.a.hue - colors.b.hue) % 360;
    expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(27);
  });

  it('keeps every pair of a whole roster at least the minimum gap apart', () => {
    const names = [
      'Piano',
      'Bass',
      'Drums',
      'Violin',
      'Viola',
      'Cello',
      'Flute',
      'Oboe',
      'Trumpet',
      'Voice',
    ];
    const colors = trackColors(
      names.map((name, i) => ({ id: String(i), name }))
    );
    const hues = Object.values(colors).map(c => c.hue);
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) {
        const d = Math.abs(hues[i] - hues[j]) % 360;
        expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(27);
      }
  });

  it('is stable: adding a track does not recolour one that was already far from it', () => {
    const before = trackColors([{ id: 'a', name: 'Piano' }]);
    const after = trackColors([
      { id: 'a', name: 'Piano' },
      { id: 'b', name: 'Cello' },
    ]);
    // Piano's own hash hue is kept unless Cello landed within the gap of it.
    const d = Math.abs(hueFromName('Piano') - hueFromName('Cello')) % 360;
    if (Math.min(d, 360 - d) >= 28)
      expect(after.a.hue).toBeCloseTo(before.a.hue);
  });
});
