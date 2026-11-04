import * as THREE from 'three';
import { DISPLAY_SMOOTHING, smoothSurfacePositions, validateSmoothingOptions, type SmoothingOptions } from '../domain/display-smoothing';

export { DISPLAY_SMOOTHING, DISPLAY_SMOOTHING_COARSE, DISPLAY_SMOOTHING_VOLUME, smoothingAppliesTo, smoothingOptionsFor, validateSmoothingOptions, type SmoothingOptions } from '../domain/display-smoothing';

/** Geometry-level wrapper of the display smoothing filter; see `domain/display-smoothing.ts`. */

interface SurfaceInput { positions: Float32Array; index: Uint16Array | Uint32Array; vertexCount: number }

function surfaceInput(geometry: THREE.BufferGeometry): SurfaceInput {
  const attribute = geometry.getAttribute('position'), index = geometry.index;
  if (!attribute || attribute.itemSize !== 3 || attribute.count === 0 || !index || index.count === 0 || index.count % 3 !== 0) {
    throw new Error('Display smoothing requires an indexed triangle surface with positions.');
  }
  if (Object.keys(geometry.morphAttributes).length) throw new Error('Display smoothing does not support morph targets.');
  const positions = new Float32Array(attribute.count * 3);
  for (let vertex = 0; vertex < attribute.count; vertex++) {
    positions[vertex * 3] = attribute.getX(vertex); positions[vertex * 3 + 1] = attribute.getY(vertex); positions[vertex * 3 + 2] = attribute.getZ(vertex);
  }
  const source = index.array;
  const copy = source instanceof Uint16Array ? new Uint16Array(source) : Uint32Array.from(source as ArrayLike<number>);
  return { positions, index: copy, vertexCount: attribute.count };
}

/** A new geometry with the given display positions, recomputed normals and bounds. The input is not modified. */
function withPositions(geometry: THREE.BufferGeometry, positions: Float32Array): THREE.BufferGeometry {
  const result = geometry.clone();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Smooth one surface on the calling thread. */
export function smoothSurfaceGeometry(geometry: THREE.BufferGeometry, options: SmoothingOptions = DISPLAY_SMOOTHING): THREE.BufferGeometry {
  validateSmoothingOptions(options);
  const input = surfaceInput(geometry);
  return withPositions(geometry, smoothSurfacePositions(input.positions, input.index, input.vertexCount, options));
}

function smoothInWorker(inputs: SurfaceInput[], options: SmoothingOptions, signal?: AbortSignal): Promise<Float32Array[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/surface-smoothing.worker.ts', import.meta.url), { type: 'module' });
    const finish = (settle: () => void) => { worker.terminate(); signal?.removeEventListener('abort', abort); settle(); };
    const abort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'result' && Array.isArray(message.positions)) finish(() => resolve(message.positions as Float32Array[]));
      else finish(() => reject(new Error(typeof message?.message === 'string' ? message.message : 'Display smoothing failed in its worker.')));
    };
    worker.onerror = () => finish(() => reject(new Error('The display smoothing worker could not run.')));
    worker.postMessage({ type: 'smooth', options, surfaces: inputs }, inputs.flatMap((input) => [input.positions.buffer as ArrayBuffer, input.index.buffer as ArrayBuffer]));
  });
}

/**
 * Smooth several surfaces, in a worker when the browser provides one so that
 * large references do not block the page, otherwise on the calling thread.
 * Each result geometry corresponds to the input at the same position.
 */
export async function smoothSurfaceGeometries(geometries: readonly THREE.BufferGeometry[], options: SmoothingOptions = DISPLAY_SMOOTHING,
  signal?: AbortSignal): Promise<THREE.BufferGeometry[]> {
  validateSmoothingOptions(options);
  if (!geometries.length) return [];
  const inputs = geometries.map(surfaceInput);
  let positions: Float32Array[] | null = null;
  if (typeof Worker === 'function') {
    try { positions = await smoothInWorker(inputs, options, signal); }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; positions = null; }
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!positions || positions.length !== geometries.length) {
    // The transferred buffers are detached after a worker attempt; read the surfaces again.
    positions = geometries.map((geometry) => { const input = surfaceInput(geometry); return smoothSurfacePositions(input.positions, input.index, input.vertexCount, options); });
  }
  return geometries.map((geometry, slot) => withPositions(geometry, positions![slot]));
}
