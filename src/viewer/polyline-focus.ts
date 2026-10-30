import * as THREE from 'three';

const MAX_POINTS = 1_000_000, MAX_PATHS = 100_000, MAX_SEGMENTS = 1_000_000, MAX_PLANES = 8;
function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function finiteVector(value: THREE.Vector3): boolean { return value.toArray().every(Number.isFinite); }

/**
 * Bounds of retained existing segments in one original zero-based path row.
 * The source parser and scene builder validate the complete source inventory.
 * This reader checks the frozen path tables and selected path's display indices,
 * coordinates and mappings, rather than rescanning unrelated point records.
 * The caller updates matrixWorld first. No geometry or input state is changed.
 */
export function sourcePolylinePathBounds(region: THREE.LineSegments, pathRowIndex: number,
  clippingPlanes: readonly THREE.Plane[] = []): THREE.Box3 | null {
  try {
    if (!(region instanceof THREE.LineSegments) || !natural(pathRowIndex) || !region.visible
        || !(region.material instanceof THREE.LineBasicMaterial) || !region.material.visible
        || !Number.isFinite(region.material.opacity) || region.material.opacity <= 0
        || !Array.isArray(clippingPlanes) || clippingPlanes.length > MAX_PLANES) return null;
    let ancestors = 0;
    for (let parent = region.parent; parent; parent = parent.parent) {
      if (!parent.visible || ++ancestors > 1024) return null;
    }
    const world = region.matrixWorld;
    if (world.elements.length !== 16 || !world.elements.every(Number.isFinite)
        || world.elements[3] !== 0 || world.elements[7] !== 0 || world.elements[11] !== 0 || world.elements[15] !== 1
        || !Number.isFinite(world.determinant()) || world.determinant() === 0) return null;
    for (const plane of clippingPlanes) {
      if (!(plane instanceof THREE.Plane) || !finiteVector(plane.normal) || !Number.isFinite(plane.constant)
          || !Number.isFinite(plane.normal.lengthSq()) || plane.normal.lengthSq() === 0) return null;
    }
    const positions = region.geometry.getAttribute('position'), pairs = region.geometry.index;
    const pointIndices: unknown = region.userData.vertexSourcePointIndices;
    const pathIndices: unknown = region.userData.sourcePolylineIndices;
    const starts: unknown = region.userData.sourcePolylineSegmentStarts;
    const total: unknown = region.userData.sourceSampleCount, isolated: unknown = region.userData.isolatedSourceSamples;
    const segments: unknown = region.userData.sourceSegmentCount, paths: unknown = region.userData.sourcePolylineCount;
    if (!(positions instanceof THREE.BufferAttribute) || !(positions.array instanceof Float32Array)
        || positions.normalized || positions.itemSize !== 3 || !natural(positions.count) || positions.count === 0
        || positions.count > MAX_POINTS || positions.array.length !== positions.count * 3
        || !natural(total) || total === 0 || total > MAX_POINTS
        || !natural(isolated) || isolated > total || total - isolated !== positions.count
        || !natural(segments) || segments === 0 || segments > MAX_SEGMENTS
        || !natural(paths) || paths === 0 || paths > MAX_PATHS || pathRowIndex >= paths
        || !pairs || pairs.normalized || pairs.itemSize !== 1 || pairs.count !== segments * 2
        || !(pairs.array instanceof Uint32Array || pairs.array instanceof Uint16Array) || pairs.array.length !== pairs.count
        || !Array.isArray(pointIndices) || !Object.isFrozen(pointIndices) || pointIndices.length !== positions.count
        || !Array.isArray(pathIndices) || !Object.isFrozen(pathIndices) || pathIndices.length !== paths
        || !Array.isArray(starts) || !Object.isFrozen(starts) || starts.length !== paths + 1
        || starts[0] !== 0 || starts[paths] !== segments) return null;
    // The scene builder serializes every source path in original row order.
    // These tables refer to source rows, never arbitrary edge labels or IDs.
    for (let row = 0; row < paths; row++) {
      if (pathIndices[row] !== row || !natural(starts[row]) || !natural(starts[row + 1])
          || starts[row + 1] <= starts[row] || starts[row + 1] > segments) return null;
    }
    const range = region.geometry.drawRange;
    if (!natural(range.start) || range.start % 2 !== 0 || range.start > pairs.count
        || !(range.count === Infinity || natural(range.count) && range.count % 2 === 0
          && range.start + range.count <= pairs.count)) return null;
    const firstSegment = starts[pathRowIndex], lastSegment = starts[pathRowIndex + 1];
    const drawEnd = Math.min(pairs.count, range.start + range.count);
    const first = new THREE.Vector3(), second = new THREE.Vector3();
    const retainedFirst = new THREE.Vector3(), retainedSecond = new THREE.Vector3();
    const bounds = new THREE.Box3();
    let previousEnd: number | undefined;
    const sourceToVertex = new Map<number, number>();
    for (let segment = firstSegment; segment < lastSegment; segment++) {
      const offset = segment * 2, a = pairs.getX(offset), b = pairs.getX(offset + 1);
      if (!natural(a) || !natural(b) || a >= positions.count || b >= positions.count
          || previousEnd !== undefined && a !== previousEnd) return null;
      previousEnd = b;
      for (const vertex of [a, b]) {
        const sourceIndex: unknown = pointIndices[vertex];
        if (!natural(sourceIndex) || sourceIndex >= total
            || sourceToVertex.has(sourceIndex) && sourceToVertex.get(sourceIndex) !== vertex) return null;
        // Referenced source point rows retain their original increasing order.
        if (vertex > 0 && (!natural(pointIndices[vertex - 1]) || pointIndices[vertex - 1] >= sourceIndex)
            || vertex + 1 < pointIndices.length && (!natural(pointIndices[vertex + 1]) || pointIndices[vertex + 1] <= sourceIndex)) return null;
        sourceToVertex.set(sourceIndex, vertex);
      }
      first.fromBufferAttribute(positions, a).applyMatrix4(world);
      second.fromBufferAttribute(positions, b).applyMatrix4(world);
      if (!finiteVector(first) || !finiteVector(second)) return null;
      // Validate the whole requested path even where drawRange omits its pairs.
      if (offset < range.start || offset >= drawEnd) continue;
      let lower = 0, upper = 1;
      for (const plane of clippingPlanes) {
        const startDistance = plane.distanceToPoint(first), endDistance = plane.distanceToPoint(second);
        if (!Number.isFinite(startDistance) || !Number.isFinite(endDistance)) return null;
        if (startDistance < 0 && endDistance < 0) { upper = -1; break; }
        if ((startDistance < 0) !== (endDistance < 0)) {
          const denominator = startDistance - endDistance;
          if (!Number.isFinite(denominator) || denominator === 0) return null;
          const crossing = startDistance / denominator;
          if (!Number.isFinite(crossing) || crossing < 0 || crossing > 1) return null;
          if (startDistance < 0) lower = Math.max(lower, crossing);
          else upper = Math.min(upper, crossing);
        }
      }
      if (upper <= lower) continue;
      retainedFirst.copy(first).lerp(second, lower); retainedSecond.copy(first).lerp(second, upper);
      const lengthSquared = retainedFirst.distanceToSquared(retainedSecond);
      if (!finiteVector(retainedFirst) || !finiteVector(retainedSecond) || !Number.isFinite(lengthSquared)) return null;
      if (lengthSquared === 0) continue;
      bounds.expandByPoint(retainedFirst).expandByPoint(retainedSecond);
    }
    return bounds.isEmpty() ? null : bounds;
  } catch { return null; }
}
