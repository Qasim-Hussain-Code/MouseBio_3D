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

/** Asset coordinates are the metre-valued glTF coordinates, not raw source millimetres. */
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
