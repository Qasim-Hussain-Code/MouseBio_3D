/**
 * Exact tests against closed triangle surfaces, in voxels of the source: whether a point lies inside, by the parity of the
 * triangles a ray straight up from it crosses, and how far it lies from the surface, by the nearest triangle. Used to draw the
 * skin out over measured bone and to check that nothing stands outside the surfaces that should hold it.
 */
import type { Surface } from './surface-nets';
import type { Vec3 } from './rig';

/** The point of triangle abc nearest to p (Ericson, Real-Time Collision Detection, section 5.1.5). */
function closestOnTriangle(px: number, py: number, pz: number, t: Float64Array, o: number): [number, number, number] {
  const ax = t[o], ay = t[o + 1], az = t[o + 2], bx = t[o + 3], by = t[o + 4], bz = t[o + 5], cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az];
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [ax + abx * v, ay + aby * v, az + abz * v]; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [ax + acx * w, ay + acy * w, az + acz * w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w]; }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
}

/**
 * Where a vertical line through (x, y) meets the inside of the triangle, or null. A line exactly through an edge meets neither
 * triangle beside it, which leaves the parity of a closed surface unchanged; callers set their lines a hair off any grid, so that
 * a line through a vertex, the one case that would change the parity, does not occur in practice.
 */
function crossingHeight(x: number, y: number, t: Float64Array, o: number): number | null {
  const ax = t[o], ay = t[o + 1], bx = t[o + 3], by = t[o + 4], cx = t[o + 6], cy = t[o + 7];
  const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(d) < 1e-14) return null;
  const wb = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / d;
  const wc = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / d;
  const wa = 1 - wb - wc;
  if (!(wa > 0 && wb > 0 && wc > 0)) return null;
  return wa * t[o + 2] + wb * t[o + 5] + wc * t[o + 8];
}

function triangles(surface: Surface): Float64Array {
  const { positions, indices } = surface;
  const out = new Float64Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) for (let k = 0; k < 3; k++) out[3 * i + k] = positions[3 * indices[i] + k];
  return out;
}

/** Inside and distance tests against one closed surface, with the triangles kept in columns and in cells for speed. */
export interface MeshTester {
  /** Whether p lies inside the surface. Three rays a hair apart vote, so that a ray that grazes an edge cannot decide alone. */
  inside(p: Vec3): boolean;
  /** Distance from p to the surface, exact up to `reach`, and `reach` beyond it. */
  distance(p: Vec3, reach: number): number;
  /** The nearest point of the surface within `reach`, or null. */
  nearest(p: Vec3, reach: number): Vec3 | null;
  /** Signed distance, negative inside, with the magnitude limited to `reach`. */
  signed(p: Vec3, reach: number): number;
}

export function meshTester(surface: Surface, cell = 3): MeshTester {
  const t = triangles(surface), count = t.length / 9;
  let lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) {
    lo = [Math.min(lo[0], t[i]), Math.min(lo[1], t[i + 1]), Math.min(lo[2], t[i + 2])];
    hi = [Math.max(hi[0], t[i]), Math.max(hi[1], t[i + 1]), Math.max(hi[2], t[i + 2])];
  }
  const origin: Vec3 = [lo[0] - cell, lo[1] - cell, lo[2] - cell];
  const nx = Math.ceil((hi[0] - origin[0]) / cell) + 2, ny = Math.ceil((hi[1] - origin[1]) / cell) + 2, nz = Math.ceil((hi[2] - origin[2]) / cell) + 2;
  const columns = new Map<number, number[]>(), cells = new Map<number, number[]>();
  const push = (map: Map<number, number[]>, key: number, value: number) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };
  for (let k = 0; k < count; k++) {
    const o = 9 * k;
    const x0 = Math.floor((Math.min(t[o], t[o + 3], t[o + 6]) - origin[0]) / cell), x1 = Math.floor((Math.max(t[o], t[o + 3], t[o + 6]) - origin[0]) / cell);
    const y0 = Math.floor((Math.min(t[o + 1], t[o + 4], t[o + 7]) - origin[1]) / cell), y1 = Math.floor((Math.max(t[o + 1], t[o + 4], t[o + 7]) - origin[1]) / cell);
    const z0 = Math.floor((Math.min(t[o + 2], t[o + 5], t[o + 8]) - origin[2]) / cell), z1 = Math.floor((Math.max(t[o + 2], t[o + 5], t[o + 8]) - origin[2]) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      push(columns, x * ny + y, k);
      for (let z = z0; z <= z1; z++) push(cells, (x * ny + y) * nz + z, k);
    }
  }
  const crossingsAbove = (p: Vec3) => {
    const list = columns.get(Math.floor((p[0] - origin[0]) / cell) * ny + Math.floor((p[1] - origin[1]) / cell));
    if (!list) return 0;
    let n = 0;
    for (const k of list) { const z = crossingHeight(p[0], p[1], t, 9 * k); if (z !== null && z > p[2]) n++; }
    return n;
  };
  const inside = (p: Vec3) => {
    if (p[0] < lo[0] || p[1] < lo[1] || p[2] < lo[2] || p[0] > hi[0] || p[1] > hi[1] || p[2] > hi[2]) return false;
    let votes = 0;
    for (const [dx, dy] of [[0, 0], [3.1e-5, 1.7e-5], [-1.7e-5, 3.1e-5]]) votes += crossingsAbove([p[0] + dx, p[1] + dy, p[2]]) % 2;
    return votes >= 2;
  };
  const closest = (p: Vec3, reach: number): { point: Vec3 | null; distance: number } => {
    let best = reach * reach, point: Vec3 | null = null;
    const r = Math.ceil(reach / cell);
    const cx = Math.floor((p[0] - origin[0]) / cell), cy = Math.floor((p[1] - origin[1]) / cell), cz = Math.floor((p[2] - origin[2]) / cell);
    const seen = new Set<number>();
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      const list = cells.get((x * ny + y) * nz + z);
      if (!list) continue;
      for (const k of list) {
        if (seen.has(k)) continue;
        seen.add(k);
        const q = closestOnTriangle(p[0], p[1], p[2], t, 9 * k);
        const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
        if (d < best) { best = d; point = q; }
      }
    }
    return { point, distance: Math.sqrt(best) };
  };
  const distance = (p: Vec3, reach: number) => closest(p, reach).distance;
  return { inside, distance, nearest: (p, reach) => closest(p, reach).point, signed: (p, reach) => (inside(p) ? -1 : 1) * distance(p, reach) };
}
