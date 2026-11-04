import type { Atlas } from './types';

/**
 * Display-only surface smoothing for voxel-derived references. Surfaces
 * extracted from a label volume follow the staircase and terraces of the
 * processing grid. Taubin's lambda-mu filter (Taubin, 1995, "A signal
 * processing approach to fair surface design", SIGGRAPH 95) moves each vertex
 * towards the mean of its mesh neighbours by lambda and then away from it by
 * mu; with |mu| slightly above lambda the surface does not shrink the way plain
 * Laplacian smoothing does. The result is a display copy only: source assets,
 * identifiers and coordinate frames are unchanged, and no boundary becomes more
 * accurate than the processing grid and segmentation that produced it. This
 * module has no renderer dependency so the interface bundle and a worker can
 * share it.
 */
export interface SmoothingOptions {
  readonly iterations: number;
  readonly lambda: number;
  readonly mu: number;
}

export type SurfaceDisplay = 'smoothed' | 'source';

/** The coarse tetrahedral surfaces need few passes; thin regions lose volume with more. */
export const DISPLAY_SMOOTHING_COARSE: SmoothingOptions = Object.freeze({ iterations: 10, lambda: 0.5, mu: -0.53 });
/**
 * The dense 0.4 mm voxel surfaces carry terraces about ten vertices long and
 * need more and stronger passes; mu only slightly beyond -lambda keeps the
 * pass-band gain close to one so the longer run does not inflate low-frequency
 * shape.
 */
export const DISPLAY_SMOOTHING_VOLUME: SmoothingOptions = Object.freeze({ iterations: 40, lambda: 0.6, mu: -0.61 });
export const DISPLAY_SMOOTHING = DISPLAY_SMOOTHING_COARSE;

export const MAX_SMOOTHING_ITERATIONS = 200;
const MAX_VERTICES = 2 ** 26;

/** Only the two Digimouse references and their regional detail derive from a label volume. */
export function smoothingOptionsFor(atlas: Pick<Atlas, 'id'>): SmoothingOptions | null {
  if (atlas.id === 'digimouse-tessellated-v1') return DISPLAY_SMOOTHING_COARSE;
  if (atlas.id === 'digimouse-volume-040-v1') return DISPLAY_SMOOTHING_VOLUME;
  return null;
}

export function smoothingAppliesTo(atlas: Pick<Atlas, 'id'>): boolean {
  return smoothingOptionsFor(atlas) !== null;
}

export function validateSmoothingOptions(options: SmoothingOptions): void {
  if (!Number.isSafeInteger(options.iterations) || options.iterations < 0 || options.iterations > MAX_SMOOTHING_ITERATIONS) {
    throw new Error(`Smoothing iterations must be an integer between 0 and ${MAX_SMOOTHING_ITERATIONS}.`);
  }
  if (!Number.isFinite(options.lambda) || options.lambda <= 0 || options.lambda >= 1) throw new Error('Smoothing lambda must lie strictly between 0 and 1.');
  if (!Number.isFinite(options.mu) || options.mu >= -options.lambda || options.mu <= -1) throw new Error('Smoothing mu must lie strictly between -1 and -lambda.');
}

export interface SurfaceAdjacency {
  readonly offsets: Int32Array;
  readonly neighbours: Int32Array;
  readonly boundary: Uint8Array;
}

/** Undirected vertex adjacency and open-edge detection from an indexed triangle list. */
export function buildSurfaceAdjacency(index: ArrayLike<number>, vertexCount: number): SurfaceAdjacency {
  if (!Number.isSafeInteger(vertexCount) || vertexCount <= 0 || vertexCount > MAX_VERTICES) throw new Error('Display smoothing supports up to 67 million vertices.');
  if (index.length === 0 || index.length % 3 !== 0) throw new Error('Display smoothing requires an indexed triangle list.');
  const keys = new Float64Array(index.length);
  const degree = new Int32Array(vertexCount);
  for (let corner = 0; corner < index.length; corner++) {
    const a = index[corner], b = index[corner % 3 === 2 ? corner - 2 : corner + 1];
    if (!Number.isSafeInteger(a) || a < 0 || a >= vertexCount || !Number.isSafeInteger(b) || b < 0 || b >= vertexCount) throw new Error('Triangle indices exceed the vertex count.');
    if (a === b) throw new Error('Degenerate triangle edges cannot be smoothed.');
    keys[corner] = Math.min(a, b) * vertexCount + Math.max(a, b);
  }
  keys.sort();
  const boundary = new Uint8Array(vertexCount);
  let unique = 0;
  for (let position = 0; position < keys.length;) {
    let end = position + 1;
    while (end < keys.length && keys[end] === keys[position]) end++;
    const key = keys[position], a = Math.floor(key / vertexCount), b = key - a * vertexCount;
    keys[unique++] = key;
    degree[a]++; degree[b]++;
    if (end - position === 1) { boundary[a] = 1; boundary[b] = 1; }
    position = end;
  }
  const offsets = new Int32Array(vertexCount + 1);
  for (let vertex = 0; vertex < vertexCount; vertex++) offsets[vertex + 1] = offsets[vertex] + degree[vertex];
  const neighbours = new Int32Array(offsets[vertexCount]);
  const cursor = offsets.slice(0, vertexCount);
  for (let edge = 0; edge < unique; edge++) {
    const key = keys[edge], a = Math.floor(key / vertexCount), b = key - a * vertexCount;
    neighbours[cursor[a]++] = b; neighbours[cursor[b]++] = a;
  }
  return { offsets, neighbours, boundary };
}

/**
 * Smooth packed xyz positions of an indexed triangle surface and return a new
 * Float32Array. The inputs are not modified. Vertices on open boundary edges
 * and isolated vertices keep their source positions.
 */
export function smoothSurfacePositions(positions: ArrayLike<number>, index: ArrayLike<number>, vertexCount: number, options: SmoothingOptions): Float32Array {
  validateSmoothingOptions(options);
  if (!Number.isSafeInteger(vertexCount) || vertexCount <= 0 || positions.length !== vertexCount * 3) throw new Error('Surface positions must hold three coordinates per vertex.');
  const current = new Float64Array(vertexCount * 3);
  for (let slot = 0; slot < current.length; slot++) {
    const value = positions[slot];
    if (!Number.isFinite(value)) throw new Error('Surface positions must be finite.');
    current[slot] = value;
  }
  const { offsets, neighbours, boundary } = buildSurfaceAdjacency(index, vertexCount);
  const next = new Float64Array(current.length);
  const step = (factor: number) => {
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const start = offsets[vertex], end = offsets[vertex + 1], base = vertex * 3;
      if (boundary[vertex] || end === start) {
        next[base] = current[base]; next[base + 1] = current[base + 1]; next[base + 2] = current[base + 2];
        continue;
      }
      let x = 0, y = 0, z = 0;
      for (let slot = start; slot < end; slot++) {
        const other = neighbours[slot] * 3;
        x += current[other]; y += current[other + 1]; z += current[other + 2];
      }
      const count = end - start;
      next[base] = current[base] + factor * (x / count - current[base]);
      next[base + 1] = current[base + 1] + factor * (y / count - current[base + 1]);
      next[base + 2] = current[base + 2] + factor * (z / count - current[base + 2]);
    }
    current.set(next);
  };
  for (let iteration = 0; iteration < options.iterations; iteration++) { step(options.lambda); step(options.mu); }
  return Float32Array.from(current);
}
