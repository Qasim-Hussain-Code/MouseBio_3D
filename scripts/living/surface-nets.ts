/**
 * Naive surface nets over a scalar field, with normals from the field gradient.
 *
 * One vertex is placed in each cell crossed by the isovalue, at the mean of the
 * cell's edge crossings, and one quad is emitted for each grid edge that crosses
 * it. Quads are split along their shorter diagonal. Because the input is a
 * smoothed field and not a binary mask, the result carries no voxel terraces.
 */
import type { Grid } from './volume';

export interface Surface {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Optional per-vertex tint, multiplied with the display colour. */
  colors?: Float32Array;
  /** Where the rings of a tube lie among the vertices, so that its centre line can be found again after it has been moved. */
  lines?: readonly SurfaceLine[];
}

export interface SurfaceLine { readonly start: number; readonly rings: number; readonly sides: number }

const CORNERS: readonly (readonly [number, number, number])[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES: readonly (readonly [number, number])[] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** A point of the field grid is mapped to output coordinates by origin + index * spacing. */
export function surfaceNets(field: Float32Array, grid: Grid, isovalue: number, origin: readonly [number, number, number], spacing: number): Surface {
  const { nx, ny, nz } = grid;
  const cellIndex = new Int32Array(field.length).fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const stride = [1, nx, nx * ny];
  const offsets = CORNERS.map(([x, y, z]) => x * stride[0] + y * stride[1] + z * stride[2]);
  const at = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const clampAt = (x: number, y: number, z: number) => field[at(Math.min(nx - 1, Math.max(0, x)), Math.min(ny - 1, Math.max(0, y)), Math.min(nz - 1, Math.max(0, z)))];

  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const base = at(x, y, z);
    let mask = 0;
    for (let c = 0; c < 8; c++) if (field[base + offsets[c]] >= isovalue) mask |= 1 << c;
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, count = 0;
    for (const [a, b] of EDGES) {
      const inA = (mask >> a) & 1, inB = (mask >> b) & 1;
      if (inA === inB) continue;
      const va = field[base + offsets[a]], vb = field[base + offsets[b]];
      const t = (isovalue - va) / (vb - va);
      px += CORNERS[a][0] + t * (CORNERS[b][0] - CORNERS[a][0]);
      py += CORNERS[a][1] + t * (CORNERS[b][1] - CORNERS[a][1]);
      pz += CORNERS[a][2] + t * (CORNERS[b][2] - CORNERS[a][2]);
      count++;
    }
    px = x + px / count; py = y + py / count; pz = z + pz / count;
    cellIndex[base] = positions.length / 3;
    positions.push(origin[0] + px * spacing, origin[1] + py * spacing, origin[2] + pz * spacing);
    // The field falls outwards, so the outward normal is minus its gradient, sampled at the nearest grid point.
    const ix = Math.round(px), iy = Math.round(py), iz = Math.round(pz);
    let gx = clampAt(ix - 1, iy, iz) - clampAt(ix + 1, iy, iz);
    let gy = clampAt(ix, iy - 1, iz) - clampAt(ix, iy + 1, iz);
    let gz = clampAt(ix, iy, iz - 1) - clampAt(ix, iy, iz + 1);
    const length = Math.hypot(gx, gy, gz) || 1;
    gx /= length; gy /= length; gz /= length;
    normals.push(gx, gy, gz);
  }

  const quad = (a: number, b: number, c: number, d: number) => {
    const ac = (positions[3 * a] - positions[3 * c]) ** 2 + (positions[3 * a + 1] - positions[3 * c + 1]) ** 2 + (positions[3 * a + 2] - positions[3 * c + 2]) ** 2;
    const bd = (positions[3 * b] - positions[3 * d]) ** 2 + (positions[3 * b + 1] - positions[3 * d + 1]) ** 2 + (positions[3 * b + 2] - positions[3 * d + 2]) ** 2;
    if (ac <= bd) indices.push(a, b, c, a, c, d);
    else indices.push(a, b, d, b, c, d);
  };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const here = at(x, y, z);
    const inside = field[here] >= isovalue;
    // x edge, shared by the four cells around it in y and z.
    if (inside !== (field[here + 1] >= isovalue)) {
      const a = cellIndex[at(x, y - 1, z - 1)], b = cellIndex[at(x, y, z - 1)], c = cellIndex[at(x, y, z)], d = cellIndex[at(x, y - 1, z)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (inside) quad(a, b, c, d); else quad(d, c, b, a); }
    }
    if (inside !== (field[here + nx] >= isovalue)) {
      const a = cellIndex[at(x - 1, y, z - 1)], b = cellIndex[at(x - 1, y, z)], c = cellIndex[at(x, y, z)], d = cellIndex[at(x, y, z - 1)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (inside) quad(a, b, c, d); else quad(d, c, b, a); }
    }
    if (inside !== (field[here + nx * ny] >= isovalue)) {
      const a = cellIndex[at(x - 1, y - 1, z)], b = cellIndex[at(x, y - 1, z)], c = cellIndex[at(x, y, z)], d = cellIndex[at(x - 1, y, z)];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (inside) quad(a, b, c, d); else quad(d, c, b, a); }
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}

/** Signed volume and area of a closed triangle mesh, in cubic and square output units. */
export function surfaceMeasures(surface: Surface): { volume: number; area: number } {
  const { positions: p, indices: t } = surface;
  let volume = 0, area = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = 3 * t[i], b = 3 * t[i + 1], c = 3 * t[i + 2];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area += Math.hypot(nx, ny, nz) / 2;
    volume += (p[a] * nx + p[a + 1] * ny + p[a + 2] * nz) / 6;
  }
  return { volume, area };
}
