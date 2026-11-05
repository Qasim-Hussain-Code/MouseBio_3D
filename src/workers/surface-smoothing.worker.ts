/// <reference lib="webworker" />
import { displayVertexNormals, normalPassesFor, smoothSurfacePositions, type SmoothingOptions } from '../domain/display-smoothing';

interface SmoothRequest {
  type: 'smooth';
  options: SmoothingOptions;
  surfaces: { positions: Float32Array; index: Uint16Array | Uint32Array; vertexCount: number; fullNormalPasses?: boolean }[];
}

self.onmessage = (event: MessageEvent<SmoothRequest>) => {
  const request = event.data;
  if (request?.type !== 'smooth' || !Array.isArray(request.surfaces)) return;
  try {
    const positions = request.surfaces.map((surface) => smoothSurfacePositions(surface.positions, surface.index, surface.vertexCount, request.options));
    const limit = request.options.normalIterations ?? 0;
    const normals = request.surfaces.map((surface, slot) => displayVertexNormals(positions[slot], surface.index, surface.vertexCount,
      surface.fullNormalPasses ? limit : normalPassesFor(positions[slot], surface.index, limit)));
    self.postMessage({ type: 'result', positions, normals }, [...positions, ...normals].map((result) => result.buffer as ArrayBuffer));
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Display smoothing failed.' });
  }
};
