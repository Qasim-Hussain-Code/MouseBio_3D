/** Numerical camera operations and key mapping, without browser rendering evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { panViewerCamera, viewerNavigationKey, zoomViewerCamera } from '../src/viewer/viewer-navigation';
import { applyCameraPose, captureCameraPose } from '../src/viewer/scene-utils';

function fixture() {
  const camera = new THREE.PerspectiveCamera(60, 2, 0.01, 1000), target = new THREE.Vector3();
  applyCameraPose(camera, target, { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0] });
  return { camera, target };
}
function snapshot(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
  return { position: camera.position.toArray(), target: target.toArray(), up: camera.up.toArray(),
    quaternion: camera.quaternion.toArray(), scale: camera.scale.toArray(), matrix: camera.matrix.toArray(),
    world: camera.matrixWorld.toArray(), inverse: camera.matrixWorldInverse.toArray(),
    projection: camera.projectionMatrix.toArray(), projectionInverse: camera.projectionMatrixInverse.toArray(),
    fov: camera.fov, aspect: camera.aspect, zoom: camera.zoom, near: camera.near, far: camera.far };
}
function near(actual: number, expected: number, tolerance = 1e-11) { assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`); }

test('zoom multiplies orbit distance and clamps current limits without changing target, direction, roll or projection', () => {
  const { camera, target } = fixture(), original = snapshot(camera, target);
  assert.equal(zoomViewerCamera(camera, target, 0.8, 2, 12), true); near(camera.position.distanceTo(target), 8);
  assert.equal(zoomViewerCamera(camera, target, 10, 2, 12), true); near(camera.position.distanceTo(target), 12);
  assert.equal(zoomViewerCamera(camera, target, 0.1, 2, 12), true); near(camera.position.distanceTo(target), 2);
  const clamped = snapshot(camera, target);
  assert.equal(zoomViewerCamera(camera, target, 0.8, 2, 12), false); assert.deepEqual(snapshot(camera, target), clamped);
  assert.equal(zoomViewerCamera(camera, target, 1.25, 2, 12), true); near(camera.position.distanceTo(target), 2.5);
  assert.deepEqual(target.toArray(), original.target); assert.deepEqual(camera.up.toArray(), original.up);
  assert.deepEqual(camera.quaternion.toArray(), original.quaternion); assert.deepEqual(camera.projectionMatrix.toArray(), original.projection);
  assert.deepEqual(camera.position.clone().sub(target).normalize().toArray(), [0, 0, 1]);
});

test('pan uses the visible target plane and actual camera roll, aspect and zoom, translating target and camera equally', () => {
  const { camera, target } = fixture(); camera.zoom = 2; camera.updateProjectionMatrix();
  applyCameraPose(camera, target, { position: [11, 6, 9], target: [1, 2, 3], up: [1, 2, -0.5] });
  const oldPosition = camera.position.clone(), oldTarget = target.clone(), before = snapshot(camera, target);
  const direction = camera.position.clone().sub(target), distance = direction.length();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const height = 2 * distance * Math.tan(Math.PI / 6) / 2;
  const expected = right.multiplyScalar(0.1 * height * camera.aspect).addScaledVector(up, 0.2 * height);
  assert.equal(panViewerCamera(camera, target, 0.1, 0.2), true);
  assert.ok(camera.position.clone().sub(oldPosition).distanceTo(expected) < 1e-11);
  assert.ok(target.clone().sub(oldTarget).distanceTo(expected) < 1e-11);
  near(camera.position.distanceTo(target), distance);
  const projected = oldTarget.clone().project(camera); near(projected.x, -0.2); near(projected.y, -0.4);
  assert.deepEqual(camera.up.toArray(), before.up); assert.deepEqual(camera.quaternion.toArray(), before.quaternion);
  assert.deepEqual(camera.projectionMatrix.toArray(), before.projection);
  assert.deepEqual(captureCameraPose(camera, target).target, target.toArray());
});

test('opposite pans restore the view numerically without changing orientation or clipping distances', () => {
  const { camera, target } = fixture(), before = snapshot(camera, target);
  assert.equal(panViewerCamera(camera, target, 0.1, -0.1), true);
  assert.equal(panViewerCamera(camera, target, -0.1, 0.1), true);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(...before.position)) < 1e-12);
  assert.ok(target.distanceTo(new THREE.Vector3(...before.target)) < 1e-12);
  assert.deepEqual(camera.quaternion.toArray(), before.quaternion); assert.equal(camera.near, before.near); assert.equal(camera.far, before.far);
});

test('invalid zoom factors and distance limits reject atomically', () => {
  for (const [factor, min, max] of [[0, 2, 12], [-1, 2, 12], [0.09, 2, 12], [10.1, 2, 12], [NaN, 2, 12],
    [Infinity, 2, 12], [0.8, -1, 12], [0.8, 20, 12], [0.8, 0, 0], [0.8, 0, Infinity], [0.8, NaN, 12], [1, 2, 12]]) {
    const { camera, target } = fixture(), before = snapshot(camera, target);
    assert.equal(zoomViewerCamera(camera, target, factor, min, max), false); assert.deepEqual(snapshot(camera, target), before);
  }
});

test('malformed camera, orientation, projection and aliased targets cannot partially move a view', () => {
  const mutations: ((camera: THREE.PerspectiveCamera, target: THREE.Vector3) => void)[] = [
    (camera) => { camera.position.x = NaN; }, (camera, target) => { camera.position.copy(target); },
    (camera) => { camera.up.set(0, 0, 0); }, (camera) => { camera.up.set(0, 0, 1); },
    (camera) => { camera.fov = 0; }, (camera) => { camera.aspect = 0; }, (camera) => { camera.zoom = 0; },
    (camera) => { camera.near = -1; }, (camera) => { camera.far = camera.near; },
    (camera) => { new THREE.Group().add(camera); }, (camera) => { camera.scale.x = 2; },
    (camera) => { camera.matrixAutoUpdate = false; }, (camera) => { camera.matrixWorldAutoUpdate = false; },
    (camera) => { camera.filmOffset = 1; }, (camera) => { camera.setViewOffset(100, 100, 0, 0, 50, 50); },
    (camera) => { camera.quaternion.set(0, 0, 0, 0); }, (camera) => { camera.rotation.z = 0.5; },
    (camera) => { camera.projectionMatrix.elements[0] = NaN; },
    (camera) => { camera.zoom = 2; }, // Reject stale projection matrices.
  ];
  for (const mutate of mutations) {
    const { camera, target } = fixture(); mutate(camera, target); const before = snapshot(camera, target);
    assert.equal(panViewerCamera(camera, target, 0.1, 0), false);
    assert.equal(zoomViewerCamera(camera, target, 0.8, 2, 12), false);
    assert.deepEqual(snapshot(camera, target), before);
  }
  const { camera } = fixture(); camera.lookAt(camera.scale); camera.updateMatrixWorld();
  const before = snapshot(camera, camera.scale);
  assert.equal(panViewerCamera(camera, camera.scale, 0.1, 0), false); assert.equal(zoomViewerCamera(camera, camera.scale, 0.8, 2, 12), false);
  assert.deepEqual(snapshot(camera, camera.scale), before);
});

test('invalid pan fractions and unrepresentable translated poses are a no-op', () => {
  for (const [dx, dy] of [[0, 0], [NaN, 0], [0, Infinity], [1.1, 0], [0, -1.1]]) {
    const { camera, target } = fixture(), before = snapshot(camera, target);
    assert.equal(panViewerCamera(camera, target, dx, dy), false); assert.deepEqual(snapshot(camera, target), before);
  }
  const { camera, target } = fixture();
  applyCameraPose(camera, target, { position: [0, 0, 1e38], target: [0, 0, 0], up: [0, 1, 0] });
  camera.aspect = 10; camera.updateProjectionMatrix(); const before = snapshot(camera, target);
  assert.equal(panViewerCamera(camera, target, 1, 0), false); assert.deepEqual(snapshot(camera, target), before);
});

test('canvas key commands map display directions and preserve modified browser shortcuts', () => {
  const event = (key: string) => ({ key, ctrlKey: false, altKey: false, metaKey: false });
  for (const [key, dx, dy] of [['ArrowLeft', -0.1, 0], ['ArrowRight', 0.1, 0], ['ArrowUp', 0, 0.1], ['ArrowDown', 0, -0.1]] as const) {
    assert.deepEqual(viewerNavigationKey(event(key)), { kind: 'pan', dx, dy });
  }
  for (const key of ['+', '=']) assert.deepEqual(viewerNavigationKey(event(key)), { kind: 'zoom', factor: 0.8 });
  assert.deepEqual(viewerNavigationKey(event('-')), { kind: 'zoom', factor: 1.25 });
  assert.deepEqual(viewerNavigationKey(event('Home')), { kind: 'reset' });
  assert.deepEqual(viewerNavigationKey(event('F')), { kind: 'focus' });
  assert.equal(viewerNavigationKey(event('PageUp')), null);
  for (const key of ['ArrowLeft', 'ArrowUp', '+', '-', 'Home', 'f']) for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    assert.equal(viewerNavigationKey({ ...event(key), [modifier]: true }), null);
  }
});
