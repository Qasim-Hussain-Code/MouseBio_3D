import * as THREE from 'three';

export type RenderLine = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
export type RenderRegion = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | RenderLine;
type SourceRegion = THREE.Mesh<THREE.BufferGeometry> | THREE.LineSegments<THREE.BufferGeometry>;

function disposeMaterials(material: THREE.Material | THREE.Material[]): void {
  for (const value of new Set([material].flat())) value.dispose();
}

/** Replace display materials only. Line width is a presentation setting, not a source radius. */
export function prepareRegionMaterial(region: SourceRegion): RenderRegion {
  const previous = region.material;
  if (region instanceof THREE.LineSegments) {
    region.material = new THREE.LineBasicMaterial({ linewidth: 1 });
  } else {
    region.material = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.02, side: THREE.DoubleSide });
  }
  disposeMaterials(previous);
  return region as RenderRegion;
}

/** The caller owns these resources and must not dispose another shared instance's geometry. */
export function disposeRegion(region: SourceRegion): void {
  region.geometry.dispose();
  disposeMaterials(region.material);
}

function finiteVector(value: THREE.Vector3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

/** A world-bounds label anchor, not an anatomical centroid, soma or source measurement. */
export function regionLabelCenter(region: RenderRegion): THREE.Vector3 | null {
  region.updateWorldMatrix(true, true);
  if (!region.matrixWorld.elements.every(Number.isFinite)) return null;
  const bounds = new THREE.Box3().setFromObject(region);
  if (bounds.isEmpty() || !finiteVector(bounds.min) || !finiteVector(bounds.max)) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  return finiteVector(center) ? center : null;
}

/** Approximate a CSS-pixel picking allowance at the camera target's depth. No physical radius is assigned. */
export function linePickingThreshold(camera: THREE.PerspectiveCamera, target: THREE.Vector3,
  viewportHeight: number, pixels = 5): number | null {
  if (!finiteVector(target) || !Number.isFinite(viewportHeight) || viewportHeight <= 0
      || !Number.isFinite(pixels) || pixels <= 0 || !Number.isFinite(camera.fov) || camera.fov <= 0 || camera.fov >= 180
      || !Number.isFinite(camera.zoom) || camera.zoom <= 0 || !Number.isFinite(camera.aspect) || camera.aspect <= 0
      || !Number.isFinite(camera.near) || camera.near <= 0 || !Number.isFinite(camera.far) || camera.far <= camera.near
      || camera.parent !== null || camera.view?.enabled || camera.filmOffset !== 0
      || camera.scale.x !== 1 || camera.scale.y !== 1 || camera.scale.z !== 1) return null;
  camera.updateWorldMatrix(true, false);
  if (!camera.matrixWorld.elements.every(Number.isFinite) || !camera.matrixWorldInverse.elements.every(Number.isFinite)) return null;
  const depth = -target.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const threshold = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom * pixels / viewportHeight;
  return Number.isFinite(threshold) && threshold > 0 ? threshold : null;
}

function natural(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }

/**
 * Pick indexed endpoint pairs using the current matrixWorld. Inputs are not
 * mutated. The returned index is the original pair's index-buffer offset,
 * matching Three.js line intersections, even when that segment was clipped.
 * Visibility/opacity policy belongs to the caller. Coincident endpoints remain
 * source data but have no rendered segment and are not picked as point glyphs.
 */
export function nearestClippedLineIntersection(line: RenderLine, raycaster: THREE.Raycaster,
  clipPlane: THREE.Plane | null = null): THREE.Intersection<RenderLine> | null {
  const threshold = raycaster.params.Line.threshold;
  const ray = raycaster.ray;
  if (!Number.isFinite(threshold) || threshold < 0 || !Number.isFinite(threshold * threshold)
      || !finiteVector(ray.origin) || !finiteVector(ray.direction) || Math.abs(ray.direction.lengthSq() - 1) > 1e-10
      || !Number.isFinite(raycaster.near) || raycaster.near < 0
      || !(Number.isFinite(raycaster.far) || raycaster.far === Infinity) || raycaster.far < raycaster.near
      || !line.matrixWorld.elements.every(Number.isFinite)
      || line.matrixWorld.elements[3] !== 0 || line.matrixWorld.elements[7] !== 0
      || line.matrixWorld.elements[11] !== 0 || line.matrixWorld.elements[15] !== 1) return null;
  if (clipPlane && (!finiteVector(clipPlane.normal) || !Number.isFinite(clipPlane.constant)
      || !Number.isFinite(clipPlane.normal.lengthSq()) || clipPlane.normal.lengthSq() === 0)) return null;

  const positions = line.geometry.getAttribute('position'), indices = line.geometry.index;
  const { start, count } = line.geometry.drawRange;
  if (!positions || positions.itemSize !== 3 || !natural(positions.count) || positions.count === 0
      || !indices || indices.itemSize !== 1 || indices.normalized || !natural(indices.count) || indices.count % 2 !== 0
      || !natural(start) || start % 2 !== 0 || start > indices.count
      || !(count === Infinity || (natural(count) && count % 2 === 0))) return null;
  for (let index = 0; index < positions.count; index++) {
    if (![positions.getX(index), positions.getY(index), positions.getZ(index)].every(Number.isFinite)) return null;
  }
  for (let index = 0; index < indices.count; index++) {
    const vertex = indices.getX(index);
    if (!natural(vertex) || vertex >= positions.count) return null;
  }

  const first = new THREE.Vector3(), second = new THREE.Vector3();
  const intersection = new THREE.Vector3(), pointOnRay = new THREE.Vector3(), pointOnSegment = new THREE.Vector3();
  const end = Math.min(indices.count, start + count);
  let nearest: THREE.Intersection<RenderLine> | null = null;
  for (let offset = start; offset < end; offset += 2) {
    first.fromBufferAttribute(positions, indices.getX(offset)).applyMatrix4(line.matrixWorld);
    second.fromBufferAttribute(positions, indices.getX(offset + 1)).applyMatrix4(line.matrixWorld);
    if (!finiteVector(first) || !finiteVector(second)) return null;
    if (clipPlane) {
      const firstDistance = clipPlane.distanceToPoint(first), secondDistance = clipPlane.distanceToPoint(second);
      if (!Number.isFinite(firstDistance) || !Number.isFinite(secondDistance)) return null;
      if (firstDistance < 0 && secondDistance < 0) continue;
      if ((firstDistance < 0) !== (secondDistance < 0)) {
        const amount = firstDistance / (firstDistance - secondDistance);
        intersection.copy(first).lerp(second, amount);
        if (!finiteVector(intersection)) return null;
        if (firstDistance < 0) first.copy(intersection); else second.copy(intersection);
      }
    }
    const lengthSq = first.distanceToSquared(second);
    if (!Number.isFinite(lengthSq)) return null;
    if (lengthSq === 0) continue;
    ray.distanceSqToSegment(first, second, pointOnRay, pointOnSegment);
    if (!finiteVector(pointOnRay) || !finiteVector(pointOnSegment)) return null;
    // Recompute from the returned points to avoid cancellation in the analytic
    // squared-distance expression for long segments close to the ray.
    const distanceSq = pointOnRay.distanceToSquared(pointOnSegment);
    const distance = ray.origin.distanceTo(pointOnRay);
    if (!Number.isFinite(distanceSq) || !Number.isFinite(distance)) return null;
    if (distanceSq > threshold * threshold || distance < raycaster.near || distance > raycaster.far
        || (nearest && distance >= nearest.distance)) continue;
    nearest = { distance, point: pointOnSegment.clone(), index: offset, face: null, faceIndex: null, object: line };
  }
  return nearest;
}
