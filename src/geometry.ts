/**
 * Turns an authored `InstrumentSpatialModel`'s strokes into drawable
 * `three` geometry — the one mechanical, non-authored step in the pipeline.
 *
 * Deliberately does NOT take a pose. A model's pose (offset/rotation/scale
 * from `spatialModelForTrack`) becomes an *object* transform — applied by
 * `buildScene` as the `position`/`rotation`/`scale` a platform package
 * hands to `<lineSegments>` — rather than baked into vertex coordinates
 * here. `three`'s own transform pipeline already does this correctly;
 * re-deriving rotation matrices by hand in this file would only be a
 * second, riskier way to compute the same thing.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { InstrumentSpatialModel } from '@sudobility/music_types';

/**
 * ONE `THREE.BufferGeometry` per model, holding every stroke, laid out for
 * `THREE.LineSegments` (consecutive vertex pairs, not a line strip) — a
 * platform package wraps it in a single `<lineSegments geometry={g} />`.
 *
 * It used to be one geometry per stroke, and the platform packages drew one
 * `<lineSegments>` + one material for each. Measured on a four-track band
 * (piano, bass, string ensemble, drum kit): ~645 draw calls for 6,850
 * vertices, because 58% of the strokes across all GM models are a single
 * two-vertex segment. Every stroke of a model is drawn in the same colour
 * (`InstrumentSpatialModel` carries no per-stroke colour or width — see
 * music_types' `spatial-art.ts`), so nothing distinguished those draw calls
 * but the buffer they read from. Merged: one draw call per instrument.
 */
export function buildInstrumentGeometry(
  model: InstrumentSpatialModel
): BufferGeometry {
  const cached = GEOMETRY_CACHE.get(model);
  if (cached) return cached;
  const built = buildUncached(model);
  GEOMETRY_CACHE.set(model, built);
  return built;
}

/**
 * How many line segments `model` draws: the sum over its strokes of
 * (points - 1). The merged geometry holds exactly twice this many vertices.
 * This was the per-model draw-call count before merging, and is what a
 * test compares the merged vertex count against.
 */
export function instrumentSegmentCount(model: InstrumentSpatialModel): number {
  let count = 0;
  for (const stroke of model.strokes) count += Math.max(0, stroke.length - 1);
  return count;
}

/**
 * Keyed by model identity: the models are module-level singletons in
 * music_types (a violin is one object for the life of the process), and
 * `buildScene` runs on every sounding-state change — many times a second
 * while playing — so without this every note-on rebuilt a few hundred
 * segments per instrument (measured: 3.0ms cold, 0.44ms warm). Geometries
 * are never mutated after creation, so sharing one across instances and
 * frames is safe.
 */
const GEOMETRY_CACHE = new WeakMap<InstrumentSpatialModel, BufferGeometry>();

function buildUncached(model: InstrumentSpatialModel): BufferGeometry {
  const positions = new Float32Array(instrumentSegmentCount(model) * 6);
  let at = 0;
  for (const stroke of model.strokes) {
    for (let i = 0; i < stroke.length - 1; i++) {
      const [ax, ay, az] = stroke[i];
      const [bx, by, bz] = stroke[i + 1];
      // x mirrored: the models are authored in the left-handed arrangement
      // frame (+x = the player's right facing +z); three.js is
      // right-handed. See scene.ts, which mirrors positions and rotations
      // to match.
      positions[at++] = -ax;
      positions[at++] = ay;
      positions[at++] = az;
      positions[at++] = -bx;
      positions[at++] = by;
      positions[at++] = bz;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}
