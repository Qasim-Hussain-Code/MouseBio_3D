import * as THREE from 'three';
import type { RenderLine } from './region-objects';

const MAX_SAMPLES = 100000;
function natural(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function finiteVector(value: THREE.Vector3): boolean { return value.toArray().every(Number.isFinite); }

/**
 * Bounds of the retained portions of existing links incident to one source ID.
 * Reads current Float32 display positions and matrixWorld; caller updates that
 * matrix first. No point glyph, radius, coordinate conversion or source repair
 * is introduced. Bounds are display framing, not calibrated measurements.
 */
export function traceSampleFocusBounds(line: RenderLine, sampleId: number, clipPlane: THREE.Plane | null = null): THREE.Box3 | null {
  if (!(line instanceof THREE.LineSegments) || !Number.isSafeInteger(sampleId) || sampleId <= 0
      || !line.visible || !(line.material instanceof THREE.LineBasicMaterial) || !line.material.visible
      || !Number.isFinite(line.material.opacity) || line.material.opacity <= 0) return null;
  let ancestors = 0;
  for (let parent = line.parent; parent; parent = parent.parent) if (!parent.visible || ++ancestors > 1024) return null;
  const world = line.matrixWorld;
  if (!world.elements.every(Number.isFinite) || world.elements[3] !== 0 || world.elements[7] !== 0
      || world.elements[11] !== 0 || world.elements[15] !== 1
      || !Number.isFinite(world.determinant()) || world.determinant() === 0) return null;
  if (clipPlane && (!finiteVector(clipPlane.normal) || !Number.isFinite(clipPlane.constant)
      || !Number.isFinite(clipPlane.normal.lengthSq()) || clipPlane.normal.lengthSq() === 0)) return null;
  const positions = line.geometry.getAttribute('position'), pairs = line.geometry.index;
  const ids: unknown = line.userData.vertexSourceIds;
  const total: unknown = line.userData.sourceSampleCount, links: unknown = line.userData.sourceParentLinks;
  const isolated: unknown = line.userData.isolatedSourceSamples;
  const { start, count } = line.geometry.drawRange;
  if (!(positions instanceof THREE.BufferAttribute) || !(positions.array instanceof Float32Array)
      || positions.normalized || positions.itemSize !== 3 || !natural(positions.count)
      || positions.count === 0 || positions.count > MAX_SAMPLES || !Array.isArray(ids)
      || ids.length !== positions.count || !Object.isFrozen(ids) || !natural(total) || total > MAX_SAMPLES
      || !natural(isolated) || total - isolated !== ids.length || !natural(links) || links === 0 || links >= total
      || !pairs || pairs.normalized || pairs.itemSize !== 1 || pairs.count !== links * 2
      || !natural(start) || start % 2 !== 0 || start > pairs.count
      || !(count === Infinity || natural(count) && count % 2 === 0)) return null;
  const seen = new Set<number>();
  let vertex = -1;
  for (let index = 0; index < ids.length; index++) {
    const id: unknown = ids[index];
    if (!natural(id) || id === 0 || seen.has(id)
        || ![positions.getX(index), positions.getY(index), positions.getZ(index)].every(Number.isFinite)) return null;
    seen.add(id);
    if (id === sampleId) vertex = index;
  }
  if (vertex === -1) return null;
  // Validate the complete source-child -> parent pair inventory before framing
  // a drawRange subset. Each source child has at most one parent and the
  // undirected edge forest must remain acyclic without repairing its indices.
  const representatives = Uint32Array.from({ length: ids.length }, (_, index) => index);
  const rank = new Uint8Array(ids.length), parented = new Uint8Array(ids.length), referenced = new Uint8Array(ids.length);
  const representative = (index: number): number => {
    let value = index;
    while (representatives[value] !== value) value = representatives[value];
    while (representatives[index] !== index) { const next = representatives[index]; representatives[index] = value; index = next; }
    return value;
  };
  for (let offset = 0; offset < pairs.count; offset += 2) {
    const child = pairs.getX(offset), parent = pairs.getX(offset + 1);
    if (!natural(child) || !natural(parent) || child >= ids.length || parent >= ids.length
        || child === parent || parented[child]) return null;
    const firstRoot = representative(child), secondRoot = representative(parent);
    if (firstRoot === secondRoot) return null;
    if (rank[firstRoot] < rank[secondRoot]) representatives[firstRoot] = secondRoot;
    else { representatives[secondRoot] = firstRoot; if (rank[firstRoot] === rank[secondRoot]) rank[firstRoot]++; }
    parented[child] = 1; referenced[child] = 1; referenced[parent] = 1;
  }
  if (referenced.some((value) => value === 0)) return null;
  const first = new THREE.Vector3(), second = new THREE.Vector3(), intersection = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const end = Math.min(pairs.count, start + count);
  for (let offset = start; offset < end; offset += 2) {
    const child = pairs.getX(offset), parent = pairs.getX(offset + 1);
    if (child !== vertex && parent !== vertex) continue;
    first.fromBufferAttribute(positions, child).applyMatrix4(world);
    second.fromBufferAttribute(positions, parent).applyMatrix4(world);
    if (!finiteVector(first) || !finiteVector(second)) return null;
    if (clipPlane) {
      const firstDistance = clipPlane.distanceToPoint(first), secondDistance = clipPlane.distanceToPoint(second);
      if (!Number.isFinite(firstDistance) || !Number.isFinite(secondDistance)) return null;
      if (firstDistance < 0 && secondDistance < 0) continue;
      if ((firstDistance < 0) !== (secondDistance < 0)) {
        const denominator = firstDistance - secondDistance;
        if (!Number.isFinite(denominator) || denominator === 0) return null;
        intersection.copy(first).lerp(second, firstDistance / denominator);
        if (!finiteVector(intersection)) return null;
        if (firstDistance < 0) first.copy(intersection); else second.copy(intersection);
      }
    }
    const lengthSquared = first.distanceToSquared(second);
    if (!Number.isFinite(lengthSquared)) return null;
    if (lengthSquared === 0) continue;
    bounds.expandByPoint(first).expandByPoint(second);
  }
  return bounds.isEmpty() ? null : bounds;
}
