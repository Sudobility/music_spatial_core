/**
 * An `InstrumentSpatialModel` as a binary glTF, and back — losslessly.
 *
 * The instruments are line drawings, and glTF has line primitives, so a
 * model is stored as what it is rather than as a mesh: one indexed `LINES`
 * primitive whose positions are every stroke's points in order and whose
 * indices join each point to the next within its stroke. One primitive, so
 * a glTF loader makes one draw call per instrument, as `geometry.ts` does.
 * The stroke boundaries ride along as `extras.strokeLengths`, which is what
 * makes the round trip exact: positions plus lengths give back the strokes.
 *
 * **The frame is glTF's, and so is the handedness.** Models are authored in
 * the arrangement frame (y up, facing +z, +x the performer's right), which
 * is left-handed; glTF is right-handed and faces +z with the model's right
 * at −x. x is mirrored on the way in and out — the same mirror
 * `geometry.ts` applies for three.js, so a GLB here draws exactly what the
 * stage draws today.
 *
 * Positions are float32, as `geometry.ts` stores them.
 */
import fs from 'node:fs';
import type {
  InstrumentPose,
  InstrumentSpatialModel,
  SpatialStroke,
} from '@sudobility/music_types';

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const LINES = 1;

export interface LineGlbExtras {
  /** The model's `id`. */
  readonly id: string;
  /** Points per stroke, in order: how the positions split back into strokes. */
  readonly strokeLengths: readonly number[];
  /** Anything else worth carrying (the programs and kits that use it). */
  readonly [key: string]: unknown;
}

function align4(bytes: number[]): void {
  while (bytes.length % 4) bytes.push(0);
}

/** `model` as GLB bytes, posed by `pose` on its node (identity for every model today). */
export function modelToGlb(
  model: InstrumentSpatialModel,
  pose: InstrumentPose,
  extras: Record<string, unknown> = {}
): Buffer {
  const points = model.strokes.flat();
  const positions = new Float32Array(points.length * 3);
  points.forEach(([x, y, z], i) => positions.set([-x, y, z], i * 3));

  const indexList: number[] = [];
  let base = 0;
  for (const stroke of model.strokes) {
    for (let i = 0; i + 1 < stroke.length; i++) {
      indexList.push(base + i, base + i + 1);
    }
    base += stroke.length;
  }
  const wide = points.length > 0xffff;
  const indices = wide
    ? new Uint32Array(indexList)
    : new Uint16Array(indexList);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }

  const bin: number[] = [...new Uint8Array(positions.buffer)];
  align4(bin);
  const indexOffset = bin.length;
  bin.push(...new Uint8Array(indices.buffer));
  align4(bin);

  const deg = (d: number) => (d * Math.PI) / 180;
  const node: Record<string, unknown> = { mesh: 0, name: model.id };
  const [rx, ry, rz] = pose.rotationDeg;
  if (rx || ry || rz) {
    // XYZ Euler to a quaternion, mirrored as the positions are: rotations
    // about y and z change sign, about x they do not (scene.ts).
    const [hx, hy, hz] = [deg(rx) / 2, -deg(ry) / 2, -deg(rz) / 2];
    const [cx, cy, cz] = [Math.cos(hx), Math.cos(hy), Math.cos(hz)];
    const [sx, sy, sz] = [Math.sin(hx), Math.sin(hy), Math.sin(hz)];
    node.rotation = [
      sx * cy * cz + cx * sy * sz,
      cx * sy * cz - sx * cy * sz,
      cx * cy * sz + sx * sy * cz,
      cx * cy * cz - sx * sy * sz,
    ];
  }
  const [px, py, pz] = pose.position;
  if (px || py || pz) node.translation = [-px, py, pz];
  if (pose.scale !== 1) node.scale = [pose.scale, pose.scale, pose.scale];

  const gltf = {
    asset: {
      version: '2.0',
      generator: '@sudobility/music_spatial_core export-instrument-models',
    },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [node],
    meshes: [
      {
        name: model.id,
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
            mode: LINES,
          },
        ],
        extras: {
          ...extras,
          id: model.id,
          strokeLengths: model.strokes.map(s => s.length),
        },
      },
    ],
    // The track's colour is the app's to apply; this is only a default.
    materials: [
      {
        name: 'line',
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
        extensions: { KHR_materials_unlit: {} },
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
        target: ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: indexOffset,
        byteLength: indices.byteLength,
        target: ELEMENT_ARRAY_BUFFER,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: FLOAT,
        count: points.length,
        type: 'VEC3',
        min,
        max,
      },
      {
        bufferView: 1,
        componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
  };

  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPadded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
  ]);
  const binBuffer = Buffer.from(bin);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(
    12 + 8 + jsonPadded.length + 8 + binBuffer.length,
    8
  );
  const chunk = (length: number, type: string) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(length, 0);
    head.write(type, 4, 'latin1');
    return head;
  };
  return Buffer.concat([
    header,
    chunk(jsonPadded.length, 'JSON'),
    jsonPadded,
    chunk(binBuffer.length, 'BIN\0'),
    binBuffer,
  ]);
}

/** A GLB written by `modelToGlb`, read back into strokes in the arrangement frame. */
export function glbToStrokes(file: string): {
  readonly extras: LineGlbExtras;
  readonly strokes: SpatialStroke[];
  readonly segmentPairs: number;
} {
  const bytes = fs.readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8')
  );
  const bin = bytes.subarray(20 + jsonLength + 8);
  const mesh = gltf.meshes[0];
  const primitive = mesh.primitives[0];
  if (primitive.mode !== LINES) throw new Error(`${file}: not LINES`);

  const positionAccessor = gltf.accessors[primitive.attributes.POSITION];
  const view = gltf.bufferViews[positionAccessor.bufferView];
  const positions = new Float32Array(
    bin.buffer.slice(
      bin.byteOffset + view.byteOffset,
      bin.byteOffset + view.byteOffset + view.byteLength
    )
  );
  const indexAccessor = gltf.accessors[primitive.indices];
  const indexView = gltf.bufferViews[indexAccessor.bufferView];

  const extras: LineGlbExtras = mesh.extras;
  const strokes: SpatialStroke[] = [];
  let at = 0;
  for (const length of extras.strokeLengths) {
    const stroke: [number, number, number][] = [];
    for (let i = 0; i < length; i++, at++) {
      stroke.push([
        -positions[at * 3],
        positions[at * 3 + 1],
        positions[at * 3 + 2],
      ]);
    }
    strokes.push(stroke);
  }
  const indexBytes =
    indexAccessor.componentType === UNSIGNED_INT ? 4 : 2;
  return {
    extras,
    strokes,
    segmentPairs: indexView.byteLength / indexBytes / 2,
  };
}
