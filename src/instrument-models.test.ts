/**
 * The GLBs in `assets/instruments/` are the music_types models exactly —
 * regenerate them (`bun run export:instruments`) when a model changes, and
 * this says when that was forgotten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineSegments } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  GM_KITS,
  gmKitSpatialModel,
  gmSpatialModelFor,
} from '@sudobility/music_types';
import type { PlayedInstrumentModel } from '@sudobility/music_types';
import { buildInstrumentGeometry } from './geometry';
import { glbToStrokes } from '../scripts/glb-lines';

const DIR = path.resolve(__dirname, '../assets/instruments');
const index: {
  programs: Record<string, string>;
  kits: Record<string, string>;
} = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

const cases: [string, string, PlayedInstrumentModel][] = [
  ...Array.from(
    { length: 128 },
    (_, p): [string, string, PlayedInstrumentModel] => [
      `program ${p}`,
      index.programs[p],
      gmSpatialModelFor(p),
    ]
  ),
  ...GM_KITS.map((kit): [string, string, PlayedInstrumentModel] => [
    `kit ${kit.program}`,
    index.kits[kit.program],
    gmKitSpatialModel(kit.program),
  ]),
];

async function loadWithThree(file: string): Promise<LineSegments> {
  const bytes = fs.readFileSync(file);
  // A fresh ArrayBuffer: under jsdom a Node Buffer's backing store fails
  // the loader's `instanceof ArrayBuffer`, and it then parses it as JSON.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const lines: LineSegments[] = [];
  gltf.scene.traverse(object => {
    if (object instanceof LineSegments) lines.push(object);
  });
  expect(lines).toHaveLength(1);
  return lines[0];
}

describe.each(cases)('%s', (_, file, played) => {
  it('is in the index, named after its model', () => {
    expect(file).toBe(`${played.model.id}.glb`);
  });

  it('holds the model’s strokes exactly', () => {
    const { extras, strokes } = glbToStrokes(path.join(DIR, file));
    expect(extras.id).toBe(played.model.id);
    const expected = played.model.strokes.map(stroke =>
      stroke.map(point => point.map(c => Math.fround(c)))
    );
    // Negating a float32 is exact, so the mirror round-trips bit for bit.
    expect(strokes.map(s => s.map(p => p.map(c => Math.fround(c))))).toEqual(
      expected
    );
  });

  it('loads in three.js as the line segments the stage draws', async () => {
    const line = await loadWithThree(path.join(DIR, file));
    const fromGlb = line.geometry.toNonIndexed().getAttribute('position');
    const drawn = buildInstrumentGeometry(played.model).getAttribute(
      'position'
    );
    expect(Array.from(fromGlb.array as Float32Array)).toEqual(
      Array.from(drawn.array as Float32Array)
    );
    expect(line.position.toArray()).toEqual([0, 0, 0]);
    expect(line.scale.toArray()).toEqual([1, 1, 1]);
  });
});

it('ships no file the index does not name', () => {
  const named = new Set([
    ...Object.values(index.programs),
    ...Object.values(index.kits),
  ]);
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.glb'));
  expect(new Set(files)).toEqual(named);
});
