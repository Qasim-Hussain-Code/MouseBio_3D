/** Landmarks measured from the source labels and CT, in source voxels, that simulated structures are placed on. */
import type { Vec3 } from './rig';
import { voxelIndex, type Grid } from './volume';

export interface SpineSample { readonly y: number; readonly x: number; readonly ventralZ: number; readonly dorsalZ: number; readonly canalZ: number }

export interface Landmarks {
  readonly spine: readonly SpineSample[];
  spineAt(y: number): SpineSample;
  /** Bounding box and centroid of a source label, optionally on one side of native x. */
  label(id: number, side?: 'low' | 'high'): { centroid: Vec3; min: Vec3; max: Vec3 };
  /** Lowest body z at a point, and the body extent along z there. */
  bodyColumn(x: number, y: number): { low: number; high: number } | null;
  readonly midX: number;
}

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

/** A running median and then a running mean, because the vertebral column is interrupted between vertebrae. */
function smoothed(values: readonly number[], radius: number): number[] {
  const med = values.map((_, i) => median(values.slice(Math.max(0, i - radius), i + radius + 1) as number[]));
  return med.map((_, i) => { const part = med.slice(Math.max(0, i - radius), i + radius + 1); return part.reduce((sum, v) => sum + v, 0) / part.length; });
}

export function measureLandmarks(grid: Grid, labels: Uint8Array, ct: Uint8Array): Landmarks {
  const { nx, ny, nz } = grid;
  const BONE = 200;
  const firstY = 270, lastY = 930;
  const xs: number[] = [], dorsal: number[] = [], ventral: number[] = [], canal: number[] = [];
  // The column is followed from the neck backwards near the midline, within a gate round its last height,
  // so that neither the sternum, the ribs nor a spinous process can capture it.
  let centre = 108;
  const band = 12, middle = 181, gate = 26;
  for (let y = firstY; y <= lastY; y++) {
    const counts = new Float64Array(nz);
    let sumX = 0, weight = 0;
    const low = Math.max(0, Math.round(centre) - gate), high = Math.min(nz - 1, Math.round(centre) + gate);
    for (let z = low; z <= high; z++) for (let x = middle - band; x <= middle + band; x++) {
      if (ct[voxelIndex(grid, x, y, z)] >= BONE) { counts[z]++; sumX += x; weight++; }
    }
    let top = high, bottom = low;
    while (top > low && counts[top] < 2) top--;
    while (bottom < high && counts[bottom] < 2) bottom++;
    if (top <= bottom) { top = Math.round(centre) + 11; bottom = Math.round(centre) - 11; }
    centre = 0.92 * centre + 0.08 * (top + bottom) / 2;
    const meanX = weight ? sumX / weight : middle;
    const profile = new Float64Array(nz);
    for (let z = bottom; z <= top; z++) { let sum = 0; for (let x = Math.round(meanX) - 4; x <= Math.round(meanX) + 4; x++) sum += ct[voxelIndex(grid, x, y, z)]; profile[z] = sum / 9; }
    const height = top - bottom;
    let best = bottom + 0.55 * height, lowest = Infinity;
    for (let z = Math.round(bottom + 0.35 * height); z <= bottom + 0.8 * height; z++) if (profile[z] < lowest) { lowest = profile[z]; best = z; }
    xs.push(meanX); dorsal.push(top); ventral.push(bottom); canal.push(best);
  }
  const sx = smoothed(xs, 15), sd = smoothed(dorsal, 15), sv = smoothed(ventral, 15), sc = smoothed(canal, 15);
  const spine: SpineSample[] = sx.map((x, i) => ({ y: firstY + i, x, ventralZ: sv[i], dorsalZ: sd[i], canalZ: sc[i] }));
  const spineAt = (y: number) => spine[Math.max(0, Math.min(spine.length - 1, Math.round(y) - firstY))];

  const labelCache = new Map<string, { centroid: Vec3; min: Vec3; max: Vec3 }>();
  const middleOf = new Map<number, number>();
  const statistic = (id: number, side?: 'low' | 'high') => {
    const key = `${id}/${side ?? ''}`;
    const cached = labelCache.get(key);
    if (cached) return cached;
    let middle = middleOf.get(id);
    if (side && middle === undefined) {
      let sum = 0, count = 0;
      for (let i = 0; i < labels.length; i++) if (labels[i] === id) { sum += i % nx; count++; }
      middle = sum / count; middleOf.set(id, middle);
    }
    const min: [number, number, number] = [nx, ny, nz], max: [number, number, number] = [0, 0, 0];
    let sx2 = 0, sy2 = 0, sz2 = 0, count = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      if (labels[voxelIndex(grid, x, y, z)] !== id) continue;
      if (side === 'low' && x >= middle!) continue;
      if (side === 'high' && x < middle!) continue;
      sx2 += x; sy2 += y; sz2 += z; count++;
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
    }
    if (!count) throw new Error(`Label ${id} ${side ?? ''} is empty`);
    const value = { centroid: [sx2 / count, sy2 / count, sz2 / count] as Vec3, min: min as Vec3, max: max as Vec3 };
    labelCache.set(key, value);
    return value;
  };
  const bodyColumn = (x: number, y: number) => {
    let low = -1, high = -1;
    for (let z = 0; z < nz; z++) if (labels[voxelIndex(grid, Math.round(x), Math.round(y), z)]) { if (low < 0) low = z; high = z; }
    return low < 0 ? null : { low, high };
  };
  return { spine, spineAt, label: statistic, bodyColumn, midX: median(spine.map((sample) => sample.x)) };
}
