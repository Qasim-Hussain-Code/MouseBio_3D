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
  /**
   * Upper limit on passes of display normal diffusion after the position
   * filter; 0 keeps area-weighted vertex normals. Each pass replaces a normal by
   * the normalized sum of itself and its neighbours, so shading varies smoothly
   * across terraces too long for the position filter. The passes used for one
   * surface also scale with its size (see `normalPassesFor`), so small regions
   * keep normals that follow their curvature. Vertex positions are unaffected.
   */
  readonly normalIterations?: number;
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
export const DISPLAY_SMOOTHING_VOLUME: SmoothingOptions = Object.freeze({ iterations: 40, lambda: 0.6, mu: -0.61, normalIterations: 40 });
export const DISPLAY_SMOOTHING = DISPLAY_SMOOTHING_COARSE;

export const MAX_SMOOTHING_ITERATIONS = 200;
export const MAX_NORMAL_ITERATIONS = 400;
const MAX_VERTICES = 2 ** 26;

/** The two Digimouse references, their regional detail and the micro-CT scan derive from label volumes. */
export function smoothingOptionsFor(atlas: Pick<Atlas, 'id'>): SmoothingOptions | null {
  if (atlas.id === 'digimouse-tessellated-v1') return DISPLAY_SMOOTHING_COARSE;
  if (atlas.id === 'digimouse-volume-040-v1') return DISPLAY_SMOOTHING_VOLUME;
  // The micro-CT surfaces lie on their own 0.28 mm source grid and show the same terraces.
  if (atlas.id === 'rosenhain2018-m01-native-v1') return DISPLAY_SMOOTHING_VOLUME;
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
  const normals = options.normalIterations ?? 0;
  if (!Number.isSafeInteger(normals) || normals < 0 || normals > MAX_NORMAL_ITERATIONS) {
    throw new Error(`Normal smoothing passes must be an integer between 0 and ${MAX_NORMAL_ITERATIONS}.`);
  }
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

/**
 * Diffusion passes for one surface: the upper limit, reduced so that the
 * diffusion reach of about the square root of the passes in edge lengths stays
 * near a quarter of the surface's thickness, `floor((t / 4h)^2)`. The thickness
 * t = 3|V|/A equals the radius of a sphere and stays small for thin bones,
 * plates and separate small parts, whatever their extent; V is the enclosed
 * volume, A the area and h the mean edge length.
 */
export function normalPassesFor(positions: ArrayLike<number>, index: ArrayLike<number>, limit: number): number {
  if (limit <= 0 || index.length < 3) return 0;
  let area = 0, volume = 0, total = 0;
  for (let corner = 0; corner + 2 < index.length; corner += 3) {
    const a = index[corner] * 3, b = index[corner + 1] * 3, c = index[corner + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    volume += (positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) / 6;
    total += Math.hypot(ux, uy, uz) + Math.hypot(vx, vy, vz) + Math.hypot(positions[c] - positions[b], positions[c + 1] - positions[b + 1], positions[c + 2] - positions[b + 2]);
  }
  const thickness = 3 * Math.abs(volume) / area, edge = total / index.length;
  if (!(edge > 0) || !(area > 0) || !Number.isFinite(thickness)) return 0;
  return Math.max(0, Math.min(limit, Math.floor((thickness / (4 * edge)) ** 2)));
}

/**
 * Unit vertex normals for display: area-weighted face normals summed at each
 * vertex, then `passes` rounds of diffusion over mesh neighbours. A vertex
 * without a usable normal receives (0, 0, 1). Positions are not modified.
 */
export function displayVertexNormals(positions: ArrayLike<number>, index: ArrayLike<number>, vertexCount: number, passes = 0): Float32Array {
  if (!Number.isSafeInteger(passes) || passes < 0 || passes > MAX_NORMAL_ITERATIONS) throw new Error(`Normal smoothing passes must be an integer between 0 and ${MAX_NORMAL_ITERATIONS}.`);
  if (!Number.isSafeInteger(vertexCount) || vertexCount <= 0 || positions.length !== vertexCount * 3) throw new Error('Surface positions must hold three coordinates per vertex.');
  let normals = new Float64Array(vertexCount * 3);
  for (let corner = 0; corner + 2 < index.length; corner += 3) {
    const a = index[corner] * 3, b = index[corner + 1] * 3, c = index[corner + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  const normalize = (values: Float64Array) => {
    for (let base = 0; base < values.length; base += 3) {
      const length = Math.hypot(values[base], values[base + 1], values[base + 2]);
      if (length > 0 && Number.isFinite(length)) { values[base] /= length; values[base + 1] /= length; values[base + 2] /= length; }
      else { values[base] = 0; values[base + 1] = 0; values[base + 2] = 1; }
    }
  };
  normalize(normals);
  if (passes > 0) {
    const { offsets, neighbours } = buildSurfaceAdjacency(index, vertexCount);
    let next = new Float64Array(normals.length);
    for (let pass = 0; pass < passes; pass++) {
      for (let vertex = 0; vertex < vertexCount; vertex++) {
        const base = vertex * 3;
        let x = normals[base], y = normals[base + 1], z = normals[base + 2];
        for (let slot = offsets[vertex]; slot < offsets[vertex + 1]; slot++) {
          const other = neighbours[slot] * 3;
          x += normals[other]; y += normals[other + 1]; z += normals[other + 2];
        }
        next[base] = x; next[base + 1] = y; next[base + 2] = z;
      }
      normalize(next);
      [normals, next] = [next, normals];
    }
  }
  return Float32Array.from(normals);
}
