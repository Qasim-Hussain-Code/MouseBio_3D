/// <reference lib="webworker" />
import { smoothSurfacePositions, type SmoothingOptions } from '../domain/display-smoothing';

interface SmoothRequest {
  type: 'smooth';
  options: SmoothingOptions;
  surfaces: { positions: Float32Array; index: Uint16Array | Uint32Array; vertexCount: number }[];
}

self.onmessage = (event: MessageEvent<SmoothRequest>) => {
  const request = event.data;
  if (request?.type !== 'smooth' || !Array.isArray(request.surfaces)) return;
  try {
    const positions = request.surfaces.map((surface) => smoothSurfacePositions(surface.positions, surface.index, surface.vertexCount, request.options));
    self.postMessage({ type: 'result', positions }, positions.map((result) => result.buffer as ArrayBuffer));
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Display smoothing failed.' });
  }
};
