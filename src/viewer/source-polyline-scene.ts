import * as THREE from 'three';
import type { Atlas } from '../domain/types';
import { isSourcePolylineAsset, isSourcePolylineAtlas, type SourcePolylineAsset } from '../domain/source-polyline';

function requireCondition(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function sameBounds(value: unknown, bounds: THREE.Box3): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((point, side) => Array.isArray(point) && point.length === 3
    && point.every((coordinate, axis) => coordinate === (side === 0 ? bounds.min : bounds.max).getComponent(axis)));
}

/** Render each consecutive source path pair once, without parent-tree assumptions or radius-derived geometry. */
export function buildSourcePolylineScene(atlas: Atlas, asset: SourcePolylineAsset): THREE.Group {
  requireCondition(isSourcePolylineAsset(asset) && atlas === asset.atlas && isSourcePolylineAtlas(atlas),
    'A parser-produced polyline asset and its exact source atlas are required.');
  const statistics = atlas.statistics;
  const referenced = new Uint8Array(asset.points.length);
  for (const path of asset.paths) for (const point of path) referenced[point] = 1;
  const displayedPoints = referenced.reduce((sum, present) => sum + present, 0);
  requireCondition(statistics.points === asset.points.length && statistics.polylines === asset.paths.length
    && statistics.isolatedPoints === asset.points.length - displayedPoints, 'The polyline point inventory is inconsistent.');
  const positions = new Float32Array(displayedPoints * 3), sourceToVertex = new Uint32Array(asset.points.length);
  const sourceIndices: number[] = [], sourceBounds = new THREE.Box3(), displayedBounds = new THREE.Box3();
  const point = new THREE.Vector3();
  let maximumError = 0;
  for (const [sourceIndex, coordinates] of asset.points.entries()) {
    sourceBounds.expandByPoint(point.set(...coordinates));
    for (let axis = 0; axis < 3; axis++) maximumError = Math.max(maximumError, Math.abs(Math.fround(coordinates[axis]) - coordinates[axis]));
    if (!referenced[sourceIndex]) continue;
    const vertex = sourceIndices.length;
    sourceToVertex[sourceIndex] = vertex; positions.set(coordinates, vertex * 3); sourceIndices.push(sourceIndex);
    displayedBounds.expandByPoint(point.fromArray(positions, vertex * 3));
  }
  requireCondition(sameBounds(statistics.boundsSourceUnits, sourceBounds) && sameBounds(statistics.displayBoundsSourceUnits, displayedBounds)
    && statistics.maxFloat32PositionError === maximumError, 'The polyline coordinate diagnostics are inconsistent.');
  const indices = new Uint32Array(Number(statistics.segments) * 2), pathIndices: number[] = [], pathSegmentStarts: number[] = [0];
  let segment = 0;
  for (const [pathIndex, path] of asset.paths.entries()) {
    pathIndices.push(pathIndex);
    for (let offset = 1; offset < path.length; offset++) {
      requireCondition(segment * 2 + 1 < indices.length, 'The polyline segment inventory is inconsistent.');
      indices[segment * 2] = sourceToVertex[path[offset - 1]];
      indices[segment * 2 + 1] = sourceToVertex[path[offset]];
      segment++;
    }
    pathSegmentStarts.push(segment);
  }
  requireCondition(segment === statistics.segments, 'The polyline segment inventory is inconsistent.');
  const center = displayedBounds.getCenter(new THREE.Vector3());
  let radiusSquared = 0;
  for (let vertex = 0; vertex < displayedPoints; vertex++) radiusSquared = Math.max(radiusSquared, point.fromArray(positions, vertex * 3).distanceToSquared(center));
  const radius = Math.sqrt(radiusSquared);
  requireCondition(Number.isFinite(radius) && radius > 0, 'The source polylines have no drawable extent.');
  const geometry = new THREE.BufferGeometry();
  let material: THREE.LineBasicMaterial | undefined;
  try {
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.boundingBox = displayedBounds; geometry.boundingSphere = new THREE.Sphere(center, radius);
    material = new THREE.LineBasicMaterial();
    const line = new THREE.LineSegments(geometry, material), structure = atlas.structures[0];
    line.name = structure.meshNode;
    line.userData = { structureId: structure.id, sourceSampleCount: asset.points.length, sourceSegmentCount: segment,
      sourcePolylineCount: asset.paths.length, isolatedSourceSamples: asset.points.length - displayedPoints,
      vertexSourcePointIndices: Object.freeze(sourceIndices), sourcePolylineIndices: Object.freeze(pathIndices),
      sourcePolylineSegmentStarts: Object.freeze(pathSegmentStarts) };
    // The segment-start table preserves original zero-based path identities and
    // segment offsets without allocating two additional arrays per segment.
    const scene = new THREE.Group(); scene.add(line); return scene;
  } catch (error) { geometry.dispose(); material?.dispose(); throw error; }
}
