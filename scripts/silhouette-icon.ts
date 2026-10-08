/**
 * A performer's map icon: the outline of its mesh seen from the front.
 *
 * Every other instrument's icon is music_types' `iconFromModel`, which
 * keeps a hand-drawn model's longest strokes. A mesh's strokes are its
 * grid, dense parallel lines that merge into a solid blot at 24 units, so
 * this traces the silhouette instead: the front view's triangles are
 * filled into a raster, grown by `GROW` so a microphone stand a few
 * centimetres wide survives the scale, and the raster's edges are traced
 * (marching squares) and simplified into closed `M`/`L`/`Z` paths. Same
 * viewbox, padding and view as `iconFromModel`, so it sits among the
 * others at the same size.
 */
import { ICON_VIEWBOX, type IconShape } from '@sudobility/music_types';
import type { MeshPart } from './glb-strokes';

type P2 = [number, number];

const PADDING = 1.5;
/** Raster cells per icon unit. */
const RESOLUTION = 12;
/** Grown by this many icon units before tracing: thin parts would vanish. */
const GROW = 0.25;
/** Douglas–Peucker tolerance, in icon units. */
const EPSILON = 0.2;
/** An outline smaller than this across is a speck at glyph size. */
const MIN_EXTENT = 1.2;

export function silhouetteIcon(parts: readonly MeshPart[]): IconShape[] {
  // The front view, as music_types' `iconFromModel` projects it.
  const project = ([x, y]: readonly number[]): P2 => [x, -y];
  const all = parts.flatMap(p => p.verts.map(project));
  const minU = Math.min(...all.map(p => p[0]));
  const maxU = Math.max(...all.map(p => p[0]));
  const minV = Math.min(...all.map(p => p[1]));
  const maxV = Math.max(...all.map(p => p[1]));
  const inner = ICON_VIEWBOX - 2 * PADDING;
  const scale = inner / Math.max(maxU - minU, maxV - minV);
  const offU = PADDING + (inner - (maxU - minU) * scale) / 2;
  const offV = PADDING + (inner - (maxV - minV) * scale) / 2;
  const fit = ([u, v]: P2): P2 => [offU + (u - minU) * scale, offV + (v - minV) * scale];

  const size = ICON_VIEWBOX * RESOLUTION;
  const filled = new Uint8Array(size * size);
  for (const { verts, triangles } of parts) {
    const points = verts.map(v => fit(project(v)).map(c => c * RESOLUTION) as P2);
    for (let t = 0; t < triangles.length; t += 3) {
      fillTriangle(filled, size, points[triangles[t]], points[triangles[t + 1]], points[triangles[t + 2]]);
    }
  }
  const grown = dilate(filled, size, Math.round(GROW * RESOLUTION));

  return traceContours(grown, size)
    .map(loop => simplifyClosed(loop.map(([x, y]): P2 => [x / RESOLUTION, y / RESOLUTION]), EPSILON))
    .filter(loop => loop.length >= 3 && extent(loop) >= MIN_EXTENT)
    .map(loop => ({
      kind: 'path' as const,
      d: loop.map(([u, v], i) => `${i === 0 ? 'M' : 'L'}${u.toFixed(1)} ${v.toFixed(1)}`).join(' ') + ' Z',
    }));
}

function fillTriangle(grid: Uint8Array, size: number, a: P2, b: P2, c: P2): void {
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const side = (p: P2, q: P2, x: number, y: number) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const area = side(a, b, c[0], c[1]);
  if (area === 0) return;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      const w0 = side(b, c, px, py) * area;
      const w1 = side(c, a, px, py) * area;
      const w2 = side(a, b, px, py) * area;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) grid[y * size + x] = 1;
    }
  }
}

function dilate(grid: Uint8Array, size: number, radius: number): Uint8Array {
  const out = new Uint8Array(grid.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!grid[y * size + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const [nx, ny] = [x + dx, y + dy];
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) out[ny * size + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * The boundaries between filled and empty cells, as closed loops through
 * cell corners. Every filled cell contributes the sides it shares with an
 * empty one, directed so the filled side is on the left; each corner then
 * has as many sides leaving as arriving, and following them closes a loop.
 */
function traceContours(grid: Uint8Array, size: number): P2[][] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < size && y < size ? grid[y * size + x] : 0);
  const next = new Map<string, P2[]>();
  const add = (from: P2, to: P2) => {
    const key = from.join(',');
    let list = next.get(key);
    if (!list) next.set(key, (list = []));
    list.push(to);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) add([x + 1, y], [x, y]);
      if (!at(x, y + 1)) add([x, y + 1], [x + 1, y + 1]);
      if (!at(x - 1, y)) add([x, y], [x, y + 1]);
      if (!at(x + 1, y)) add([x + 1, y + 1], [x + 1, y]);
    }
  }
  const loops: P2[][] = [];
  for (const [startKey, outgoing] of next) {
    while (outgoing.length) {
      const start = startKey.split(',').map(Number) as P2;
      const loop: P2[] = [start];
      let point = outgoing.pop()!;
      while (point.join(',') !== startKey) {
        loop.push(point);
        const out = next.get(point.join(','));
        if (!out?.length) break;
        point = out.pop()!;
      }
      loops.push(loop);
    }
  }
  return loops;
}

function perpendicular(p: P2, a: P2, b: P2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplifyOpen(points: readonly P2[], epsilon: number): P2[] {
  if (points.length < 3) return [...points];
  const last = points.length - 1;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < last; i++) {
    const d = perpendicular(points[i], points[0], points[last]);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= epsilon) return [points[0], points[last]];
  return [...simplifyOpen(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyOpen(points.slice(index), epsilon)];
}

/** Douglas–Peucker on a closed loop: split at the point farthest from the start. */
function simplifyClosed(loop: readonly P2[], epsilon: number): P2[] {
  let far = 0;
  let farDistance = 0;
  loop.forEach((p, i) => {
    const d = Math.hypot(p[0] - loop[0][0], p[1] - loop[0][1]);
    if (d > farDistance) {
      farDistance = d;
      far = i;
    }
  });
  const first = simplifyOpen(loop.slice(0, far + 1), epsilon);
  const second = simplifyOpen([...loop.slice(far), loop[0]], epsilon);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function extent(points: readonly P2[]): number {
  const us = points.map(p => p[0]);
  const vs = points.map(p => p[1]);
  return Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs));
}
