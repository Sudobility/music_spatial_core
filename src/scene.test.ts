import { describe, expect, it } from 'vitest';
import { BufferGeometry } from 'three';
import { effectiveUnpluggedArrangement } from '@sudobility/music_types';
import type { Score } from '@sudobility/music_types';
import { twoTrackScore } from '@sudobility/music_types/test';
import { buildInstruments, buildScene, cameraFor } from './scene';

/** The four-track band the draw-call audit was measured on: piano, bass,
 *  string ensemble, drum kit. */
function bandScore(): Score {
  const base = twoTrackScore();
  const [template] = base.tracks;
  const band = [
    { id: 'piano', name: 'Piano', clef: 'treble', midiProgram: 0 },
    { id: 'bass', name: 'Bass', clef: 'bass', midiProgram: 33 },
    { id: 'strings', name: 'Strings', clef: 'treble', midiProgram: 48 },
    { id: 'kit', name: 'Drums', clef: 'percussion', midiProgram: 0 },
  ] as const;
  return {
    ...base,
    tracks: band.map(t => ({ ...template, ...t })),
  };
}

describe('buildInstruments / cameraFor', () => {
  it('gives a four-track band exactly four geometries — one per track, not one per stroke', () => {
    const score = bandScore();
    const instruments = buildInstruments(
      score.tracks,
      effectiveUnpluggedArrangement(score).tracks,
      new Set()
    );
    expect(instruments).toHaveLength(4);
    for (const instrument of instruments) {
      expect(instrument.geometry).toBeInstanceOf(BufferGeometry);
      expect(
        instrument.geometry.getAttribute('position').count
      ).toBeGreaterThan(0);
    }
  });

  it('does not read the listener: the same instruments come back wherever the listener stands', () => {
    const score = bandScore();
    const tracks = effectiveUnpluggedArrangement(score).tracks;
    const here = buildInstruments(score.tracks, tracks, new Set(['bass']));
    const there = buildInstruments(score.tracks, tracks, new Set(['bass']));
    expect(there).toEqual(here);
    // And the geometry is shared by identity, not rebuilt.
    here.forEach((instrument, i) => {
      expect(there[i].geometry).toBe(instrument.geometry);
    });
  });

  it('composes into exactly what buildScene returns', () => {
    const score = {
      ...bandScore(),
      unplugged: {
        listener: { x: 1.5, z: -2, facingDeg: 30 },
        tracks: { piano: { x: 2, z: 3 } },
      },
    };
    const sounding = new Set(['kit']);
    const arrangement = effectiveUnpluggedArrangement(score);
    const scene = buildScene(score, sounding);
    expect(scene.instruments).toEqual(
      buildInstruments(score.tracks, arrangement.tracks, sounding)
    );
    expect(scene.camera).toEqual(cameraFor(arrangement.listener));
  });
});

describe('buildScene', () => {
  it('produces one instrument per track', () => {
    const score = twoTrackScore();
    const scene = buildScene(score, new Set());
    expect(scene.instruments.map(i => i.trackId).sort()).toEqual(
      score.tracks.map(t => t.id).sort()
    );
  });

  it('marks only the sounding track lit, with a different color from the rest', () => {
    const score = twoTrackScore();
    const [trebleId, bassId] = score.tracks.map(t => t.id);
    const scene = buildScene(score, new Set([trebleId]));

    const treble = scene.instruments.find(i => i.trackId === trebleId)!;
    const bass = scene.instruments.find(i => i.trackId === bassId)!;
    expect(treble.lit).toBe(true);
    expect(bass.lit).toBe(false);
    expect(treble.litColor).not.toBe(bass.litColor);
  });

  it('gives each instrument one drawable geometry', () => {
    const scene = buildScene(twoTrackScore(), new Set());
    for (const instrument of scene.instruments) {
      expect(
        instrument.geometry.getAttribute('position').count
      ).toBeGreaterThan(0);
    }
  });

  it("places an untouched score's listener at the origin, camera at ear height", () => {
    const scene = buildScene(twoTrackScore(), new Set());
    expect(scene.camera.position[0]).toBeCloseTo(0);
    expect(scene.camera.position[2]).toBeCloseTo(0);
    expect(scene.camera.position[1]).toBeGreaterThan(0);
  });

  it('yaws the camera by PI at facingDeg 0, so it looks toward +z', () => {
    const scene = buildScene(twoTrackScore(), new Set());
    expect(scene.camera.rotation[1]).toBeCloseTo(Math.PI);
  });

  it('turns the camera toward its own left when the listener turns left', () => {
    // Facing -90 is "turned left" in arrangement space (bearings are
    // clockwise-positive from +z). With x mirrored for three.js, that is a
    // camera yaw of PI - (-PI/2) = 3PI/2, whose forward is world +x — the
    // camera's own left, since three.js is right-handed.
    const score = {
      ...twoTrackScore(),
      unplugged: { listener: { x: 0, z: 0, facingDeg: -90 }, tracks: {} },
    };
    const scene = buildScene(score, new Set());
    const yaw = scene.camera.rotation[1];
    expect(yaw).toBeCloseTo((3 * Math.PI) / 2);
    // A camera with rotation.y = yaw looks along (-sin yaw, 0, -cos yaw).
    expect(-Math.sin(yaw)).toBeCloseTo(1);
    expect(-Math.cos(yaw)).toBeCloseTo(0);
  });

  it("mirrors x so an instrument on the listener's right lands on the camera's right", () => {
    const score = twoTrackScore();
    const [trackId] = score.tracks.map(t => t.id);
    const scene = buildScene(
      {
        ...score,
        unplugged: {
          listener: { x: 0, z: 0, facingDeg: 0 },
          tracks: { [trackId]: { x: 2, z: 3 } },
        },
      },
      new Set()
    );
    const instrument = scene.instruments.find(i => i.trackId === trackId)!;
    // three.js: facing +z, the right-hand side is -x.
    expect(instrument.position[0]).toBeCloseTo(-2);
    expect(instrument.position[2]).toBeCloseTo(3);
    // And the listener's own position mirrors the same way.
    const moved = buildScene(
      {
        ...score,
        unplugged: { listener: { x: 1, z: 0, facingDeg: 0 }, tracks: {} },
      },
      new Set()
    );
    expect(moved.camera.position[0]).toBeCloseTo(-1);
  });

  it('gives the two default-arranged tracks different stage positions', () => {
    const scene = buildScene(twoTrackScore(), new Set());
    const [a, b] = scene.instruments;
    expect(a.position).not.toEqual(b.position);
  });
});
