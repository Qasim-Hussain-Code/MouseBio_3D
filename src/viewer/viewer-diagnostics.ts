import * as THREE from 'three';
import type { RenderRegion } from './region-objects';

export interface ViewerDiagnostics {
  meshes: number; triangles: number; traces: number; samples: number; segments: number; isolatedSamples: number;
}
export function renderDiagnostics(regions: readonly RenderRegion[]): ViewerDiagnostics {
  const result: ViewerDiagnostics = { meshes: 0, triangles: 0, traces: 0, samples: 0, segments: 0, isolatedSamples: 0 };
  for (const region of regions) {
    if (region instanceof THREE.Mesh) {
      result.meshes++; result.triangles += (region.geometry.index?.count ?? region.geometry.getAttribute('position').count) / 3;
    } else {
      result.traces++; result.segments += (region.geometry.index?.count ?? 0) / 2;
      result.samples += region.userData.sourceSampleCount ?? 0;
      result.isolatedSamples += region.userData.isolatedSourceSamples ?? 0;
    }
  }
  return result;
}
