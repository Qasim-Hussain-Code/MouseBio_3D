import * as THREE from 'three';
import { cameraPoseErrors } from '../domain/camera-pose';

export const MIN_VIEWER_ZOOM_FACTOR = 0.1;
export const MAX_VIEWER_ZOOM_FACTOR = 10;

type Frame = { distance: number; back: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 };

/** Standard unparented perspective cameras, as maintained by OrbitControls. */
function navigationFrame(camera: THREE.PerspectiveCamera, target: THREE.Vector3): Frame | null {
  if (!(camera instanceof THREE.PerspectiveCamera) || !(target instanceof THREE.Vector3)
      || target === camera.position || target === camera.up || target === camera.scale
      || camera.parent !== null || !camera.matrixAutoUpdate || !camera.matrixWorldAutoUpdate
      || camera.scale.x !== 1 || camera.scale.y !== 1 || camera.scale.z !== 1
      || !Number.isFinite(camera.fov) || camera.fov <= 0 || camera.fov >= 180
      || !Number.isFinite(camera.aspect) || camera.aspect <= 0 || !Number.isFinite(camera.zoom) || camera.zoom <= 0
      || !Number.isFinite(camera.near) || camera.near <= 0 || !Number.isFinite(camera.far) || camera.far <= camera.near
      || camera.filmOffset !== 0 || camera.view?.enabled
      || camera.coordinateSystem !== THREE.WebGLCoordinateSystem) return null;
  if (cameraPoseErrors({ position: camera.position.toArray(), target: target.toArray(), up: camera.up.toArray() }).length) return null;
  if (!camera.quaternion.toArray().every(Number.isFinite) || Math.abs(camera.quaternion.lengthSq() - 1) > 1e-12) return null;
  const expected = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, target, camera.up));
  if (Math.abs(expected.dot(camera.quaternion)) < 1 - 1e-12) return null;
  const projection = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
  projection.zoom = camera.zoom; projection.updateProjectionMatrix();
  if (!camera.projectionMatrix.elements.every((value, index) => Number.isFinite(Math.fround(value))
      && value === projection.projectionMatrix.elements[index])) return null;
  const floatProjection = new THREE.Matrix4().fromArray(new Float32Array(camera.projectionMatrix.elements));
  const determinant = floatProjection.determinant();
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const back = camera.position.clone().sub(target), distance = back.length();
  back.divideScalar(distance);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  return { distance, back, right, up };
}

function commitPose(camera: THREE.PerspectiveCamera, target: THREE.Vector3, position: THREE.Vector3, nextTarget: THREE.Vector3): boolean {
  if (cameraPoseErrors({ position: position.toArray(), target: nextTarget.toArray(), up: camera.up.toArray() }).length
      || position.equals(camera.position) && nextTarget.equals(target)) return false;
  // Direction and roll already remain unchanged. Keep the original quaternion,
  // projection and up vector rather than recomputing an orientation.
  camera.position.copy(position); target.copy(nextTarget); camera.updateMatrixWorld();
  return true;
}

/** Multiply orbit distance, retaining its direction and current finite control limits. */
export function zoomViewerCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, factor: number,
  minDistance: number, maxDistance: number): boolean {
  if (!Number.isFinite(factor) || factor < MIN_VIEWER_ZOOM_FACTOR || factor > MAX_VIEWER_ZOOM_FACTOR
      || !Number.isFinite(minDistance) || minDistance < 0 || !Number.isFinite(maxDistance) || maxDistance <= 0
      || minDistance > maxDistance) return false;
  const frame = navigationFrame(camera, target); if (!frame) return false;
  const distance = Math.min(maxDistance, Math.max(minDistance, frame.distance * factor));
  if (!Number.isFinite(distance) || distance <= 0 || distance === frame.distance) return false;
  return commitPose(camera, target, target.clone().addScaledVector(frame.back, distance), target.clone());
}

/** Translate the view by fractions of its visible width/right and height/up at the target.
 * These screen-plane directions and distances have no anatomical interpretation.
 */
export function panViewerCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, dx: number, dy: number): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1 || Math.abs(dy) > 1 || dx === 0 && dy === 0) return false;
  const frame = navigationFrame(camera, target); if (!frame) return false;
  const height = 2 * frame.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom;
  const width = height * camera.aspect;
  if (![height, width].every((value) => Number.isFinite(value) && value > 0)) return false;
  const offset = frame.right.multiplyScalar(dx * width).addScaledVector(frame.up, dy * height);
  return commitPose(camera, target, camera.position.clone().add(offset), target.clone().add(offset));
}

export type ViewerNavigationKey = { kind: 'pan'; dx: number; dy: number } | { kind: 'zoom'; factor: number }
  | { kind: 'reset' } | { kind: 'focus' };

/** Canvas-local commands; browser and operating-system shortcuts retain modifiers. */
export function viewerNavigationKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>): ViewerNavigationKey | null {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  switch (event.key) {
    case 'ArrowLeft': return { kind: 'pan', dx: -0.1, dy: 0 };
    case 'ArrowRight': return { kind: 'pan', dx: 0.1, dy: 0 };
    case 'ArrowUp': return { kind: 'pan', dx: 0, dy: 0.1 };
    case 'ArrowDown': return { kind: 'pan', dx: 0, dy: -0.1 };
    case '+': case '=': return { kind: 'zoom', factor: 0.8 };
    case '-': return { kind: 'zoom', factor: 1.25 };
    case 'Home': return { kind: 'reset' };
    case 'f': case 'F': return { kind: 'focus' };
    default: return null;
  }
}
