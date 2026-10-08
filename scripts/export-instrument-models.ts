/**
 * Every instrument model in music_types as a GLB, in `assets/instruments/`.
 *
 *   bun run export:instruments
 *
 * One file per distinct model, not per program: General MIDI programs that
 * are physically one instrument share a model on purpose (the two acoustic
 * grands; the eight synth leads), and a file per program would be copies.
 * `index.json` says which file each program 0–127 and each drum kit uses —
 * the same lookup `gmSpatialModelFor` / `gmKitSpatialModel` answer, with the
 * same pose. The geometry is `glb-lines.ts`'s: the strokes exactly.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  GM_KITS,
  gmKitSpatialModel,
  gmSpatialModelFor,
  type PlayedInstrumentModel,
} from '@sudobility/music_types';
import { modelToGlb } from './glb-lines';

const OUT = path.resolve(import.meta.dir, '../assets/instruments');

type Entry = {
  played: PlayedInstrumentModel;
  programs: number[];
  kits: number[];
};

const byModel = new Map<string, Entry>();
const entryFor = (played: PlayedInstrumentModel): Entry => {
  const existing = byModel.get(played.model.id);
  if (existing) {
    if (existing.played.model !== played.model) {
      throw new Error(`two different models share the id ${played.model.id}`);
    }
    if (JSON.stringify(existing.played.pose) !== JSON.stringify(played.pose)) {
      throw new Error(`${played.model.id} is used at two poses`);
    }
    return existing;
  }
  const entry: Entry = { played, programs: [], kits: [] };
  byModel.set(played.model.id, entry);
  return entry;
};

const programs: Record<number, string> = {};
for (let program = 0; program < 128; program++) {
  const entry = entryFor(gmSpatialModelFor(program));
  entry.programs.push(program);
  programs[program] = `${entry.played.model.id}.glb`;
}
const kits: Record<number, string> = {};
for (const kit of GM_KITS) {
  const entry = entryFor(gmKitSpatialModel(kit.program));
  entry.kits.push(kit.program);
  kits[kit.program] = `${entry.played.model.id}.glb`;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [id, { played, programs: usedBy, kits: kitsUsing }] of byModel) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`unsafe file name: ${id}`);
  const glb = modelToGlb(played.model, played.pose, {
    programs: usedBy,
    kits: kitsUsing,
  });
  fs.writeFileSync(path.join(OUT, `${id}.glb`), glb);
  bytes += glb.length;
}
fs.writeFileSync(
  path.join(OUT, 'index.json'),
  JSON.stringify({ programs, kits }, null, 2) + '\n'
);
console.log(
  `${byModel.size} models for 128 programs and ${GM_KITS.length} kits, ` +
    `${(bytes / 1024).toFixed(0)} KB, in ${path.relative(process.cwd(), OUT)}`
);
