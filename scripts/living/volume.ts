/** Dense scalar volumes on a regular grid, with the few operations the living mouse build needs. */

export interface Grid { readonly nx: number; readonly ny: number; readonly nz: number }

export const voxelCount = (grid: Grid) => grid.nx * grid.ny * grid.nz;
export const voxelIndex = (grid: Grid, x: number, y: number, z: number) => (z * grid.ny + y) * grid.nx + x;

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** One pass of a running-mean box filter along one axis, with reflected ends. */
function boxAxis(source: Float32Array, target: Float32Array, grid: Grid, axis: 0 | 1 | 2, radius: number): void {
  const { nx, ny, nz } = grid;
  const stride = axis === 0 ? 1 : axis === 1 ? nx : nx * ny;
  const length = axis === 0 ? nx : axis === 1 ? ny : nz;
  const lines = nx * ny * nz / length;
  const width = 2 * radius + 1;
  // Reflection repeats when the filter is wider than a short axis.
  const pick = (start: number, i: number) => {
    let k = i;
    while (k < 0 || k >= length) k = k < 0 ? -k - 1 : 2 * length - k - 1;
    return source[start + stride * k];
  };
  for (let line = 0; line < lines; line++) {
    let start: number;
    if (axis === 0) start = line * nx;
    else if (axis === 1) start = Math.floor(line / nx) * nx * ny + (line % nx);
    else start = line;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += pick(start, i);
    for (let i = 0; i < length; i++) {
      target[start + stride * i] = sum / width;
      sum += pick(start, i + radius + 1) - pick(start, i - radius);
    }
  }
}

/** Three box passes per axis approximate a Gaussian whose sigma is sqrt((width^2 - 1) / 4) voxels. */
export function smoothField(field: Float32Array, grid: Grid, radius: number): Float32Array {
  if (radius < 1) return field.slice();
  let a = field.slice(), b = new Float32Array(field.length);
  for (let pass = 0; pass < 3; pass++) {
    for (const axis of [0, 1, 2] as const) { boxAxis(a, b, grid, axis, radius); [a, b] = [b, a]; }
  }
  return a;
}

/** Keep only voxels whose full box of the given radius is inside, or add those touching: erosion and dilation by a box. */
export function dilate(mask: Uint8Array, grid: Grid, radius: number, within?: Uint8Array): Uint8Array {
  let current = mask;
  const { nx, ny, nz } = grid;
  for (let pass = 0; pass < radius; pass++) {
    const next = current.slice();
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const at = voxelIndex(grid, x, y, z);
      if (!current[at]) continue;
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const xx = x + dx, yy = y + dy, zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        const other = voxelIndex(grid, xx, yy, zz);
        if (!current[other] && (!within || within[other])) next[other] = 1;
      }
    }
    current = next;
  }
  return current;
}

export function erode(mask: Uint8Array, grid: Grid, radius: number): Uint8Array {
  let current = mask;
  const { nx, ny, nz } = grid;
  for (let pass = 0; pass < radius; pass++) {
    const next = current.slice();
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const at = voxelIndex(grid, x, y, z);
      if (!current[at]) continue;
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const xx = x + dx, yy = y + dy, zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz || !current[voxelIndex(grid, xx, yy, zz)]) { next[at] = 0; break; }
      }
    }
    current = next;
  }
  return current;
}

export interface Component { readonly id: number; readonly size: number; readonly box: readonly [number, number, number, number, number, number]; readonly centroid: readonly [number, number, number] }

/** Six-connected components of a nonzero mask. Returns voxel ids and components sorted by decreasing size. */
export function components(mask: Uint8Array, grid: Grid): { ids: Int32Array; list: Component[] } {
  const { nx, ny, nz } = grid;
  const ids = new Int32Array(mask.length);
  const stack = new Int32Array(mask.length);
  const list: Component[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || ids[start]) continue;
    const id = list.length + 1;
    let top = 0, size = 0, sx = 0, sy = 0, sz = 0;
    const box: [number, number, number, number, number, number] = [nx, -1, ny, -1, nz, -1];
    stack[top++] = start; ids[start] = id;
    while (top) {
      const at = stack[--top];
      const z = Math.floor(at / (nx * ny)), rest = at - z * nx * ny, y = Math.floor(rest / nx), x = rest - y * nx;
      size++; sx += x; sy += y; sz += z;
      if (x < box[0]) box[0] = x; if (x > box[1]) box[1] = x;
      if (y < box[2]) box[2] = y; if (y > box[3]) box[3] = y;
      if (z < box[4]) box[4] = z; if (z > box[5]) box[5] = z;
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const xx = x + dx, yy = y + dy, zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        const other = voxelIndex(grid, xx, yy, zz);
        if (mask[other] && !ids[other]) { ids[other] = id; stack[top++] = other; }
      }
    }
    list.push({ id, size, box, centroid: [sx / size, sy / size, sz / size] });
  }
  list.sort((a, b) => b.size - a.size);
  return { ids, list };
}

/** Two-pass 3-4-5 chamfer distance, in voxels, from every voxel to the nearest zero of the mask. */
export function distanceInside(mask: Uint8Array, grid: Grid): Float32Array {
  const { nx, ny, nz } = grid;
  const distance = new Float32Array(mask.length);
  distance.fill(1e6);
  for (let i = 0; i < mask.length; i++) if (!mask[i]) distance[i] = 0;
  const forward: (readonly [number, number, number, number])[] = [];
  for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dz === 0 && (dy > 0 || (dy === 0 && dx >= 0))) continue;
    const order = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    forward.push([dx, dy, dz, order === 1 ? 3 : order === 2 ? 4 : 5]);
  }
  const sweep = (from: number, to: number, step: number, sign: number) => {
    for (let z = from === 0 ? 0 : nz - 1; z >= 0 && z < nz; z += step) for (let y = from === 0 ? 0 : ny - 1; y >= 0 && y < ny; y += step) for (let x = from === 0 ? 0 : nx - 1; x >= 0 && x < nx; x += step) {
      const at = voxelIndex(grid, x, y, z);
      let best = distance[at];
      if (best === 0) continue;
      for (const [dx, dy, dz, cost] of forward) {
        const xx = x + sign * dx, yy = y + sign * dy, zz = z + sign * dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
        const candidate = distance[voxelIndex(grid, xx, yy, zz)] + cost;
        if (candidate < best) best = candidate;
      }
      distance[at] = best;
    }
    void to;
  };
  sweep(0, 0, 1, 1);
  sweep(1, 0, -1, -1);
  for (let i = 0; i < distance.length; i++) distance[i] /= 3;
  return distance;
}

/**
 * The voxels at or above `level` that are joined to a voxel of `seed` at or above it, through voxels at or above it that touch by a face,
 * an edge or a corner.
 */
export function joinedAbove(seed: Uint8Array, values: Uint8Array, level: number, grid: Grid): Uint8Array {
  const { nx, ny, nz } = grid;
  const joined = new Uint8Array(seed.length);
  let count = 0;
  for (let i = 0; i < values.length; i++) if (values[i] >= level) count++;
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  for (let i = 0; i < seed.length; i++) if (seed[i] && values[i] >= level) { joined[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const at = queue[head++];
    const x = at % nx, rest = (at - x) / nx, y = rest % ny, z = (rest - y) / ny;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
      const other = (zz * ny + yy) * nx + xx;
      if (!joined[other] && values[other] >= level) { joined[other] = 1; queue[tail++] = other; }
    }
  }
  return joined;
}

/**
 * Where the corners of a face of the grid lie inside and outside a shape by turns, two sheets of the surface drawn from the field
 * meet along an edge there, which no closed surface has. The two inside corners are put just outside, which parts the sheets and
 * can make no tunnel. A point is inside where the field is at least `level`. Returns how many faces were changed.
 */
export function partSheets(field: Float32Array, grid: Grid, level = 0): number {
  const { nx, ny, nz } = grid, sx = 1, sy = nx, sz = nx * ny, out = level - 1e-3;
  let changed = 0, found = 0;
  // A face by its corners in turn.
  const face = (a: number, b: number, c: number, d: number) => {
    const ia = field[a] >= level, ib = field[b] >= level;
    if (ia === ib) return;
    if (ia !== (field[c] >= level) || ib !== (field[d] >= level)) return;
    if (ia) { field[a] = out; field[c] = out; } else { field[b] = out; field[d] = out; }
    found++;
  };
  for (let round = 0; round < 32; round++) {
    found = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const at = (z * ny + y) * nx + x;
      if (x + 1 < nx && y + 1 < ny) face(at, at + sx, at + sx + sy, at + sy);
      if (x + 1 < nx && z + 1 < nz) face(at, at + sx, at + sx + sz, at + sz);
      if (y + 1 < ny && z + 1 < nz) face(at, at + sy, at + sy + sz, at + sz);
    }
    changed += found;
    if (!found) return changed;
  }
  throw new Error('The sheets of a drawn surface still meet along an edge after 32 rounds');
}
