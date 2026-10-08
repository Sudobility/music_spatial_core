/**
 * A triangle mesh, read from a binary glTF, as the polylines the Spatial
 * stage draws. The stage has no GL (see `project.ts`): every model is
 * strokes, so a mesh has to become line work before it can stand on it.
 *
 * Three steps, all mechanical, and nothing dropped but the triangulation:
 *
 * 1. **Read** each primitive's positions and triangles, through the mesh
 *    node's rotation, into the arrangement frame (y up, facing +z, +x the
 *    performer's right — `scene.ts` explains why that frame is left-handed).
 * 2. **Keep the grid, not the triangles.** Duplicated vertices are welded,
 *    and an edge that is the longest side of both triangles it borders is
 *    the diagonal that split a quad, and is dropped unless it is a crease.
 *    What is left is a lofted mesh's rings and meridians — the line
 *    language the hand-drawn models used. Pure crease edges were tried
 *    first and lose every smooth surface: a head or a skirt has none.
 * 3. **Chain** the edges into long strokes, continuing through a vertex
 *    along whichever edge turns least, so a ring is one stroke.
 */
import fs from 'node:fs';

export type V3 = [number, number, number];

interface Accessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const BYTES: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
const TRIANGLES = 4;

function readGlb(file: string) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString('latin1', 0, 4) !== 'glTF') throw new Error(`${file}: not a binary glTF`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = bytes.subarray(20 + jsonLength + 8);
  const read = (index: number): number[][] => {
    const a: Accessor = json.accessors[index];
    const view = json.bufferViews[a.bufferView];
    const comps = COMPONENTS[a.type];
    const size = BYTES[a.componentType];
    const stride = view.byteStride ?? comps * size;
    const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const rows: number[][] = [];
    for (let k = 0; k < a.count; k++) {
      const row: number[] = [];
      for (let c = 0; c < comps; c++) {
        const at = base + k * stride + c * size;
        row.push(
          a.componentType === 5126
            ? bin.readFloatLE(at)
            : a.componentType === 5125
              ? bin.readUInt32LE(at)
              : a.componentType === 5123
                ? bin.readUInt16LE(at)
                : bin.readUInt8(at)
        );
      }
      rows.push(row);
    }
    return rows;
  };
  return { json, read };
}

function rotate([x, y, z, w]: readonly number[], [vx, vy, vz]: readonly number[]): V3 {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

function distance(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** One primitive's welded vertices and triangles, in the arrangement frame. */
export interface MeshPart {
  readonly verts: readonly V3[];
  /** Vertex indices, three per triangle; collapsed triangles removed. */
  readonly triangles: readonly number[];
}

/** Every triangle primitive of the file's first mesh node. */
export function readMesh(file: string): MeshPart[] {
  const { json, read } = readGlb(file);
  const node = json.nodes.find((n: { mesh?: number }) => n.mesh !== undefined);
  if (!node) throw new Error(`${file}: no mesh node`);
  if (node.matrix || node.translation || node.scale) {
    throw new Error(`${file}: only a rotation is supported on the mesh node`);
  }
  const rotation: number[] = node.rotation ?? [0, 0, 0, 1];
  return json.meshes[node.mesh].primitives.map(
    (primitive: { mode?: number; attributes: { POSITION: number }; indices: number }) => {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) {
        throw new Error(`${file}: only triangle primitives are supported`);
      }
      // glTF's frame (y up, facing −z) to the arrangement frame (facing +z).
      const positions = read(primitive.attributes.POSITION).map(p => {
        const [x, y, z] = rotate(rotation, p);
        return [x, y, -z] as V3;
      });
      const welded = new Map<string, number>();
      const verts: V3[] = [];
      const remap = positions.map(p => {
        const key = p.map(c => Math.round(c * 1e4)).join(',');
        let index = welded.get(key);
        if (index === undefined) {
          index = verts.length;
          verts.push(p);
          welded.set(key, index);
        }
        return index;
      });
      const indices = read(primitive.indices).map(([i]) => remap[i]);
      if (indices.length % 3 !== 0) {
        throw new Error(`${file}: ${indices.length} indices is not a triangle list`);
      }
      const triangles: number[] = [];
      for (let t = 0; t < indices.length; t += 3) {
        const [i, j, k] = [indices[t], indices[t + 1], indices[t + 2]];
        if (i !== j && j !== k && i !== k) triangles.push(i, j, k);
      }
      return { verts, triangles };
    }
  );
}

/** Every primitive of the file's first mesh node, as chained grid strokes. */
export function meshStrokes(parts: readonly MeshPart[], creaseDeg = 20): V3[][] {
  const creaseCos = Math.cos((creaseDeg * Math.PI) / 180);
  const strokes: V3[][] = [];

  for (const { verts, triangles } of parts) {
    const edges = new Map<string, { a: number; b: number; normals: V3[]; diagonal: boolean[] }>();
    for (let t = 0; t < triangles.length; t += 3) {
      const tri = [triangles[t], triangles[t + 1], triangles[t + 2]];
      const [a, b, c] = tri.map(i => verts[i]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const area = Math.hypot(...n);
      if (area < 1e-10) continue; // a pole's collapsed quad
      const normal: V3 = [n[0] / area, n[1] / area, n[2] / area];
      const sides = [0, 1, 2].map(s => [tri[s], tri[(s + 1) % 3]] as const);
      const longest = Math.max(...sides.map(([p, q]) => distance(verts[p], verts[q])));
      for (const [p, q] of sides) {
        const key = p < q ? `${p}_${q}` : `${q}_${p}`;
        let edge = edges.get(key);
        if (!edge) edges.set(key, (edge = { a: p, b: q, normals: [], diagonal: [] }));
        edge.normals.push(normal);
        edge.diagonal.push(distance(verts[p], verts[q]) >= longest - 1e-9);
      }
    }

    const kept: [number, number][] = [];
    for (const { a, b, normals, diagonal } of edges.values()) {
      if (normals.length === 2 && diagonal[0] && diagonal[1]) {
        // Double-sided materials: a flipped winding is the same plane.
        const [m, n] = normals;
        if (Math.abs(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]) >= creaseCos) continue;
      }
      kept.push([a, b]);
    }
    strokes.push(...chain(kept, verts));
  }
  return strokes;
}

function chain(edges: readonly (readonly [number, number])[], verts: readonly V3[]): V3[][] {
  const neighbours = new Map<number, number[]>();
  for (const [a, b] of edges) {
    for (const [p, q] of [[a, b], [b, a]]) {
      let list = neighbours.get(p);
      if (!list) neighbours.set(p, (list = []));
      list.push(q);
    }
  }
  const used = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const direction = (a: number, b: number): V3 => {
    const length = distance(verts[a], verts[b]) || 1;
    return [
      (verts[b][0] - verts[a][0]) / length,
      (verts[b][1] - verts[a][1]) / length,
      (verts[b][2] - verts[a][2]) / length,
    ];
  };
  const MAX_TURN_COS = Math.cos((50 * Math.PI) / 180);
  const straightest = (from: number, at: number): number | undefined => {
    const incoming = direction(from, at);
    let best: number | undefined;
    let bestCos = MAX_TURN_COS;
    for (const next of neighbours.get(at) ?? []) {
      if (used.has(key(at, next))) continue;
      const out = direction(at, next);
      const cos = incoming[0] * out[0] + incoming[1] * out[1] + incoming[2] * out[2];
      if (cos > bestCos) {
        bestCos = cos;
        best = next;
      }
    }
    return best;
  };
  const extend = (from: number, at: number): number[] => {
    const run: number[] = [];
    for (let next = straightest(from, at); next !== undefined; next = straightest(from, at)) {
      used.add(key(at, next));
      run.push(next);
      from = at;
      at = next;
    }
    return run;
  };

  const strokes: V3[][] = [];
  for (const [a, b] of edges) {
    if (used.has(key(a, b))) continue;
    used.add(key(a, b));
    const forward = extend(a, b);
    const backward = extend(b, a);
    strokes.push([...backward.reverse(), a, b, ...forward].map(i => verts[i]));
  }
  return strokes;
}
