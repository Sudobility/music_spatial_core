/**
 * Turns an authored `InstrumentSpatialModel`'s strokes into drawable
 * `three` geometry — the one mechanical, non-authored step in the pipeline.
 *
 * Deliberately does NOT take a pose. A model's pose (offset/rotation/scale
 * from `spatialModelForTrack`) becomes an *object* transform — applied by
 * `buildScene` as the `position`/`rotation`/`scale` a platform package
 * hands to `<group>`/`<lineSegments>` — rather than baked into vertex
 * coordinates here. `three`'s own transform pipeline already does this
 * correctly; re-deriving rotation matrices by hand in this file would only
 * be a second, riskier way to compute the same thing.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { InstrumentSpatialModel } from '@sudobility/music_types';

/** One `THREE.BufferGeometry` per stroke, set up for `THREE.LineSegments`
 *  (consecutive point pairs, not a single continuous line strip) — both
 *  platform packages wrap each in `<lineSegments geometry={g} />`. */
export function buildInstrumentGeometry(
  model: InstrumentSpatialModel
): readonly BufferGeometry[] {
  const cached = GEOMETRY_CACHE.get(model);
  if (cached) return cached;
  const built = buildUncached(model);
  GEOMETRY_CACHE.set(model, built);
  return built;
}

/**
 * Keyed by model identity: the models are module-level singletons in
 * music_types (a violin is one object for the life of the process), and
 * `buildScene` runs on every sounding-state change — many times a second
 * while playing — so without this every note-on rebuilt a few hundred
 * segments per instrument. Geometries are never mutated after creation,
 * so sharing one across instances and frames is safe.
 */
const GEOMETRY_CACHE = new WeakMap<
  InstrumentSpatialModel,
  readonly BufferGeometry[]
>();

function buildUncached(
  model: InstrumentSpatialModel
): readonly BufferGeometry[] {
  return model.strokes.map(stroke => {
    const positions: number[] = [];
    for (let i = 0; i < stroke.length - 1; i++) {
      const [ax, ay, az] = stroke[i];
      const [bx, by, bz] = stroke[i + 1];
      // x mirrored: the models are authored in the left-handed arrangement
      // frame (+x = the player's right facing +z); three.js is
      // right-handed. See scene.ts, which mirrors positions and rotations
      // to match.
      positions.push(-ax, ay, az, -bx, by, bz);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return geometry;
  });
}
