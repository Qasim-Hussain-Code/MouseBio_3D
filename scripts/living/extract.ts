/** Surfaces from masks or image values, cropped to their extent and sampled on a coarser grid. */
import { surfaceNets, type Surface, type SurfaceLine } from './surface-nets';
import { smoothField, voxelIndex, type Grid } from './volume';

export interface ExtractOptions {
  /** Cell size in source voxels. */
  readonly step: number;
  /** Radius of the three-pass box smoothing, in cells. Zero keeps the averaged cells. */
  readonly radius: number;
  readonly isovalue?: number;
}

/** `value` returns a scalar for a source voxel; cells hold its mean. Output coordinates are source voxel centres. */
export function extractSurface(grid: Grid, value: (index: number) => number, box: readonly [number, number, number, number, number, number], options: ExtractOptions): Surface {
  const { step, radius, isovalue = 0.5 } = options;
  const margin = (radius * 3 + 2) * step;
  const x0 = Math.max(0, box[0] - margin), y0 = Math.max(0, box[2] - margin), z0 = Math.max(0, box[4] - margin);
  const x1 = Math.min(grid.nx - 1, box[1] + margin), y1 = Math.min(grid.ny - 1, box[3] + margin), z1 = Math.min(grid.nz - 1, box[5] + margin);
  const cells: Grid = { nx: Math.floor((x1 - x0) / step) + 3, ny: Math.floor((y1 - y0) / step) + 3, nz: Math.floor((z1 - z0) / step) + 3 };
  const field = new Float32Array(cells.nx * cells.ny * cells.nz);
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
    const row = (z * grid.ny + y) * grid.nx;
    const cz = Math.floor((z - z0) / step) + 1, cy = Math.floor((y - y0) / step) + 1;
    for (let x = x0; x <= x1; x++) {
      const v = value(row + x);
      if (v) field[voxelIndex(cells, Math.floor((x - x0) / step) + 1, cy, cz)] += v;
    }
  }
  const norm = 1 / step ** 3;
  for (let i = 0; i < field.length; i++) field[i] *= norm;
  const smooth = radius ? smoothField(field, cells, radius) : field;
  // Cell i holds the mean of voxels x0 + (i - 1) * step to x0 + i * step - 1, so its centre lies half a cell minus half a voxel on.
  const shift = (step - 1) / 2;
  return surfaceNets(smooth, cells, isovalue, [x0 - step + shift, y0 - step + shift, z0 - step + shift], step);
}

/** Merge vertices that share a cell of the given size, keeping their mean position, and drop collapsed triangles. */
export function clusterSurface(surface: Surface, cell: number): Surface {
  const { positions, indices } = surface;
  const count = positions.length / 3;
  const cells = new Map<string, number>();
  const remap = new Int32Array(count);
  const sums: number[] = [];
  const members: number[] = [];
  for (let i = 0; i < count; i++) {
    const key = `${Math.floor(positions[3 * i] / cell)},${Math.floor(positions[3 * i + 1] / cell)},${Math.floor(positions[3 * i + 2] / cell)}`;
    let target = cells.get(key);
    if (target === undefined) { target = members.length; cells.set(key, target); members.push(0); sums.push(0, 0, 0); }
    remap[i] = target;
    members[target]++;
    sums[3 * target] += positions[3 * i]; sums[3 * target + 1] += positions[3 * i + 1]; sums[3 * target + 2] += positions[3 * i + 2];
  }
  const merged = new Float32Array(3 * members.length);
  for (let i = 0; i < members.length; i++) { merged[3 * i] = sums[3 * i] / members[i]; merged[3 * i + 1] = sums[3 * i + 1] / members[i]; merged[3 * i + 2] = sums[3 * i + 2] / members[i]; }
  const kept: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  const out = Uint32Array.from(kept);
  // Normals are recomputed from the merged triangles, and tiny flipped pieces average away.
  const normals = new Float32Array(merged.length);
  for (let t = 0; t < out.length; t += 3) {
    const a = 3 * out[t], b = 3 * out[t + 1], c = 3 * out[t + 2];
    const ux = merged[b] - merged[a], uy = merged[b + 1] - merged[a + 1], uz = merged[b + 2] - merged[a + 2];
    const vx = merged[c] - merged[a], vy = merged[c + 1] - merged[a + 1], vz = merged[c + 2] - merged[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= n; normals[i + 1] /= n; normals[i + 2] /= n;
  }
  return { positions: merged, normals, indices: out };
}

export function maskBox(grid: Grid, inside: (index: number) => boolean): [number, number, number, number, number, number] {
  const box: [number, number, number, number, number, number] = [grid.nx, -1, grid.ny, -1, grid.nz, -1];
  for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
    if (!inside(voxelIndex(grid, x, y, z))) continue;
    if (x < box[0]) box[0] = x; if (x > box[1]) box[1] = x;
    if (y < box[2]) box[2] = y; if (y > box[3]) box[3] = y;
    if (z < box[4]) box[4] = z; if (z > box[5]) box[5] = z;
  }
  return box;
}

export function mergeSurfaces(surfaces: readonly Surface[]): Surface {
  const vertices = surfaces.reduce((sum, s) => sum + s.positions.length, 0);
  const triangles = surfaces.reduce((sum, s) => sum + s.indices.length, 0);
  const positions = new Float32Array(vertices), normals = new Float32Array(vertices), indices = new Uint32Array(triangles);
  const colors = surfaces.some((s) => s.colors) ? new Float32Array(vertices).fill(1) : undefined;
  let v = 0, t = 0;
  const lines: SurfaceLine[] = [];
  for (const s of surfaces) {
    positions.set(s.positions, v); normals.set(s.normals, v);
    if (colors && s.colors) colors.set(s.colors, v);
    const base = v / 3;
    for (let i = 0; i < s.indices.length; i++) indices[t + i] = s.indices[i] + base;
    for (const line of s.lines ?? []) lines.push({ ...line, start: line.start + base });
    v += s.positions.length; t += s.indices.length;
  }
  return { positions, normals, indices, colors, lines };
}

/** A tube along a polyline, with a tapering radius, closed at both ends by a small cap. */
export function tube(points: readonly (readonly [number, number, number])[], radii: readonly number[], sides: number): Surface {
  const rings = points.length;
  const positions = new Float32Array(3 * (rings * sides + 2));
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  let reference: [number, number, number] = [0.31, 0.57, 0.76];
  for (let i = 0; i < rings; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(rings - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const len = Math.hypot(tx, ty, tz) || 1;
    tx /= len; ty /= len; tz /= len;
    // Transported frame: remove the tangent from the previous reference.
    const d = reference[0] * tx + reference[1] * ty + reference[2] * tz;
    let ux = reference[0] - d * tx, uy = reference[1] - d * ty, uz = reference[2] - d * tz;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    reference = [ux, uy, uz];
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    for (let s = 0; s < sides; s++) {
      const angle = 2 * Math.PI * s / sides, c = Math.cos(angle), n = Math.sin(angle);
      const nx = c * ux + n * vx, ny = c * uy + n * vy, nz = c * uz + n * vz;
      const at = 3 * (i * sides + s);
      positions[at] = points[i][0] + radii[i] * nx; positions[at + 1] = points[i][1] + radii[i] * ny; positions[at + 2] = points[i][2] + radii[i] * nz;
      normals[at] = nx; normals[at + 1] = ny; normals[at + 2] = nz;
      if (i + 1 < rings) {
        const next = (s + 1) % sides;
        const p = i * sides + s, q = i * sides + next, r = (i + 1) * sides + s, w = (i + 1) * sides + next;
        indices.push(p, q, r, q, w, r);
      }
    }
  }
  const startCap = rings * sides, endCap = startCap + 1;
  const first = points[0], last = points[rings - 1], second = points[1], before = points[rings - 2];
  positions.set(first, 3 * startCap); positions.set(last, 3 * endCap);
  const startLength = Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]) || 1;
  const endLength = Math.hypot(last[0] - before[0], last[1] - before[1], last[2] - before[2]) || 1;
  normals.set([(first[0] - second[0]) / startLength, (first[1] - second[1]) / startLength, (first[2] - second[2]) / startLength], 3 * startCap);
  normals.set([(last[0] - before[0]) / endLength, (last[1] - before[1]) / endLength, (last[2] - before[2]) / endLength], 3 * endCap);
  for (let s = 0; s < sides; s++) {
    const next = (s + 1) % sides;
    indices.push(startCap, next, s, endCap, (rings - 1) * sides + s, (rings - 1) * sides + next);
  }
  return { positions, normals, indices: Uint32Array.from(indices), lines: [{ start: 0, rings, sides }] };
}
