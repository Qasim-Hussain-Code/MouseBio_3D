import * as THREE from 'three';
import { validateCameraPose, type CameraPose } from '../domain/camera-pose';

export { validateCameraPose } from '../domain/camera-pose';
export type { CameraPose, Vector3Tuple } from '../domain/camera-pose';
export type DisplayAxis = 'x' | 'y' | 'z';

/** Presentation rotation only. These display axes have no verified anatomical direction. */
export const DISPLAY_ROTATION_Z = Math.PI / 2;

function finiteVector(vector: THREE.Vector3, label: string): void {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) throw new Error(`${label} must contain three finite coordinates.`);
}

/**
 * Put a geometry's bounding-box centre at its local origin without moving its
 * resting world-space vertices. The clone protects other meshes sharing the
 * source geometry. The caller owns disposal of previousGeometry if appropriate.
 * Both ordinary TRS meshes and explicitly maintained local matrices are supported.
 */
export function recenterMeshGeometry(mesh: THREE.Mesh<THREE.BufferGeometry>): {
  center: THREE.Vector3;
  previousGeometry: THREE.BufferGeometry;
} {
  const previousGeometry = mesh.geometry;
  if (mesh instanceof THREE.SkinnedMesh || (previousGeometry.morphAttributes.position?.length ?? 0) > 0) {
    throw new Error('Recentering requires a static surface mesh without skinning or position morph targets.');
  }
  if (!mesh.matrixWorldAutoUpdate) throw new Error('Recentering requires an automatically maintained world matrix.');
  const attribute = previousGeometry.getAttribute('position');
  if (!attribute || attribute.count === 0) throw new Error('A nonempty position attribute is required.');
  for (let index = 0; index < attribute.count; index++) {
    if (![attribute.getX(index), attribute.getY(index), attribute.getZ(index)].every(Number.isFinite)) {
      throw new Error('Geometry positions must be finite.');
    }
  }
  previousGeometry.computeBoundingBox();
  const center = previousGeometry.boundingBox!.getCenter(new THREE.Vector3());
  finiteVector(center, 'Geometry centre');
  if (mesh.matrixAutoUpdate) mesh.updateMatrix();
  if (!mesh.matrix.elements.every(Number.isFinite) || mesh.matrix.determinant() === 0) throw new Error('Mesh local transformation must be finite and nonsingular.');
  const translatedMatrix = mesh.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z));
  mesh.geometry = previousGeometry.clone();
  mesh.geometry.translate(-center.x, -center.y, -center.z);
  mesh.matrix.copy(translatedMatrix);
  if (mesh.matrixAutoUpdate) mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.updateWorldMatrix(true, false);
  return { center, previousGeometry };
}

/** Camera and target use the viewer's common world frame; camera has no transformed parent. */
export function captureCameraPose(camera: THREE.Camera, target: THREE.Vector3): CameraPose {
  const pose: CameraPose = {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z],
    up: [camera.up.x, camera.up.y, camera.up.z],
  };
  validateCameraPose(pose);
  return pose;
}

/** Apply all orientation inputs. OrbitControls callers should then call controls.update(). */
export function applyCameraPose(camera: THREE.Camera, target: THREE.Vector3, pose: CameraPose): void {
  validateCameraPose(pose);
  camera.position.fromArray(pose.position);
  camera.up.fromArray(pose.up);
  target.fromArray(pose.target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

/**
 * Fit a finite world-space box using the existing viewing direction and up.
 * Symmetric, automatically maintained perspective cameras in the common world
 * frame are supported. All validation precedes mutation; unsuitable inputs are
 * a no-op. Padding is a display margin, not an anatomical measurement.
 */
export function fitCameraToBounds(
  camera: THREE.PerspectiveCamera, target: THREE.Vector3, bounds: THREE.Box3, margin = 1.15,
): boolean {
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every((value) =>
    Number.isFinite(value) && Number.isFinite(Math.fround(value)))
      || !Number.isFinite(margin) || margin < 1 || !Number.isFinite(camera.fov) || camera.fov <= 0 || camera.fov >= 180
      || !Number.isFinite(camera.aspect) || camera.aspect <= 0 || !Number.isFinite(camera.zoom) || camera.zoom <= 0
      || !Number.isFinite(camera.near) || camera.near <= 0 || !Number.isFinite(camera.far) || camera.far <= camera.near
      || camera.parent !== null || !camera.matrixAutoUpdate || !camera.matrixWorldAutoUpdate
      || camera.filmOffset !== 0 || camera.view?.enabled) return false;
  let previous: CameraPose;
  try { previous = captureCameraPose(camera, target); }
  catch { return false; }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.lengthSq()) || size.lengthSq() === 0) return false;
  const direction = camera.position.clone().sub(target).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const vertical = new THREE.Vector3().crossVectors(direction, right);
  const tangentY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom;
  const tangentX = tangentY * camera.aspect;
  if (![tangentX, tangentY].every((value) => Number.isFinite(value) && value > 0)) return false;
  let distance = 0;
  let minimumZ = Infinity;
  let maximumZ = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const relative = new THREE.Vector3(x, y, z).sub(center);
    const depthOffset = relative.dot(direction);
    minimumZ = Math.min(minimumZ, depthOffset);
    maximumZ = Math.max(maximumZ, depthOffset);
    distance = Math.max(distance, depthOffset + margin * Math.abs(relative.dot(right)) / tangentX,
      depthOffset + margin * Math.abs(relative.dot(vertical)) / tangentY, depthOffset + camera.near * Math.max(margin, 1.01));
  }
  distance += Math.max(size.length() * 1e-9, camera.near * 1e-3);
  const far = Math.max(camera.far, (distance - minimumZ) * Math.max(margin, 1.01));
  if (!Number.isFinite(distance) || distance <= maximumZ || !Number.isFinite(far)) return false;
  const position = center.clone().addScaledVector(direction, distance);
  const pose: CameraPose = { position: [position.x, position.y, position.z],
    target: [center.x, center.y, center.z], up: [...previous.up] };
  try { validateCameraPose(pose); }
  catch { return false; }
  const projection = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, far);
  projection.zoom = camera.zoom;
  projection.updateProjectionMatrix();
  const floatProjection = new Float32Array(projection.projectionMatrix.elements);
  if (!floatProjection.every(Number.isFinite)
      || !Number.isFinite(new THREE.Matrix4().fromArray(floatProjection).determinant())
      || new THREE.Matrix4().fromArray(floatProjection).determinant() === 0) return false;
  applyCameraPose(camera, target, pose);
  camera.far = far;
  camera.updateProjectionMatrix();
  return true;
}

/** Focus existing source regions, including hidden regions explicitly requested. */
export function focusCameraOnRegions(
  camera: THREE.PerspectiveCamera, target: THREE.Vector3,
  regions: ReadonlyMap<string, THREE.Object3D>, ids: readonly string[], margin = 1.15,
): boolean {
  const bounds = new THREE.Box3();
  let found = false;
  for (const id of new Set(ids)) {
    const region = regions.get(id);
    if (!region) continue;
    region.updateWorldMatrix(true, false);
    const regionBounds = new THREE.Box3().setFromObject(region);
    if (regionBounds.isEmpty() || ![...regionBounds.min.toArray(), ...regionBounds.max.toArray()].every(Number.isFinite)) return false;
    bounds.union(regionBounds);
    found = true;
  }
  return found && fitCameraToBounds(camera, target, bounds, margin);
}

/** Preserve asset numerical units while centering and applying the display rotation. */
export function createDisplayTransform(assetCenter: THREE.Vector3): THREE.Matrix4 {
  finiteVector(assetCenter, 'Asset centre');
  return new THREE.Matrix4().makeRotationZ(DISPLAY_ROTATION_Z)
    .multiply(new THREE.Matrix4().makeTranslation(-assetCenter.x, -assetCenter.y, -assetCenter.z));
}

export function assetToDisplayPoint(point: THREE.Vector3, assetCenter: THREE.Vector3): THREE.Vector3 {
  finiteVector(point, 'Asset point');
  return point.clone().applyMatrix4(createDisplayTransform(assetCenter));
}

export function displayToAssetPoint(point: THREE.Vector3, assetCenter: THREE.Vector3): THREE.Vector3 {
  finiteVector(point, 'Display point');
  return point.clone().applyMatrix4(createDisplayTransform(assetCenter).invert());
}

/** Negative signed distances are clipped, matching Three.js material clipping. */
export function createDisplayClipPlane(axis: DisplayAxis, positionPercent: number, radius: number): THREE.Plane {
  if (!(['x', 'y', 'z'] as string[]).includes(axis)) throw new Error('Clip axis must be x, y or z.');
  if (!Number.isFinite(positionPercent) || positionPercent < 0 || positionPercent > 100) throw new Error('Clip position must be between 0 and 100 percent.');
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Display radius must be finite and positive.');
  const normal = new THREE.Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
  return new THREE.Plane(normal, (positionPercent / 100 * 2 - 1) * radius);
}

/** Ray picking can use the same retained half-space as surface rendering. */
export function isPointRetainedByClipPlane(point: THREE.Vector3, plane: THREE.Plane): boolean {
  finiteVector(point, 'Display point');
  finiteVector(plane.normal, 'Clip normal');
  if (!Number.isFinite(plane.constant) || plane.normal.lengthSq() === 0) throw new Error('Clip plane must be finite and nondegenerate.');
  return plane.distanceToPoint(point) >= 0;
}
