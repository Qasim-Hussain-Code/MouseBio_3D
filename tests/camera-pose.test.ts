import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cameraPoseErrors, validateCameraPose, type CameraPose } from '../src/domain/camera-pose';
import { applyCameraPose, captureCameraPose, validateCameraPose as validateRenderedCameraPose } from '../src/viewer/scene-utils';

test('shared camera validation rejects vector magnitudes that cannot be normalized by the renderer', () => {
  const normal: CameraPose = { position: [0, 0, 1], target: [0, 0, 0], up: [0, 1, 0] };
  const invalid: CameraPose[] = [
    { ...normal, position: [0, 0, 1e-320] },
    { ...normal, position: [0, 0, 1e-200] },
    { ...normal, position: [0, 0, 1e308] },
    { ...normal, up: [0, 1e-320, 0] },
    { ...normal, up: [0, 1e-200, 0] },
    { ...normal, up: [0, 1e308, 0] },
    // The up vector itself has a nonzero squared length, but its side vector
    // underflows during Matrix4.lookAt's raw-up cross-product normalization.
    { ...normal, up: [1e-170, 0, 1e-160] },
  ];
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3();
  applyCameraPose(camera, target, normal);
  const before = captureCameraPose(camera, target);
  for (const pose of invalid) {
    assert.ok(cameraPoseErrors(pose).length > 0);
    assert.throws(() => validateCameraPose(pose), /numerical range/);
    assert.throws(() => validateRenderedCameraPose(pose), /numerical range/);
    assert.throws(() => applyCameraPose(camera, target, pose));
    assert.deepEqual(captureCameraPose(camera, target), before);
  }
});

test('safe small and large camera directions produce finite actual Three.js Float32 camera transforms', () => {
  for (const magnitude of [1e-150, 0.01, 1, 1e30]) {
    const pose: CameraPose = { position: [0, 0, magnitude], target: [0, 0, 0], up: [0, magnitude, 0] };
    assert.deepEqual(cameraPoseErrors(pose), []);
    validateCameraPose(pose);
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3();
    applyCameraPose(camera, target, pose);
    assert.ok(camera.quaternion.toArray().every(Number.isFinite));
    assert.ok(camera.matrixWorld.elements.every(Number.isFinite));
    assert.ok(camera.matrixWorldInverse.elements.every(Number.isFinite));
    for (const matrix of [camera.matrixWorld, camera.matrixWorldInverse, camera.projectionMatrix]) {
      assert.ok(new Float32Array(matrix.elements).every(Number.isFinite));
    }
    assert.deepEqual(captureCameraPose(camera, target), pose);
  }
});

test('camera objects reject unknown fields, unsafe prototypes and almost parallel vectors', () => {
  const normal: CameraPose = { position: [0, 0, 1], target: [0, 0, 0], up: [0, 1, 0] };
  assert.throws(() => validateCameraPose({ ...normal, metadata: {} }), /unsupported/);
  assert.throws(() => validateCameraPose(JSON.parse('{"position":[0,0,1],"target":[0,0,0],"up":[0,1,0],"__proto__":{}}')), /unsupported/);
  assert.throws(() => validateCameraPose({ ...normal, up: [0, 1e-13, 1] }), /parallel/);
  assert.deepEqual(cameraPoseErrors({ ...normal, up: [0, 1e-10, 1] }), []);
});

test('a rotated view cannot overflow GPU translation even when all input components fit Float32', () => {
  const offset = 3e38;
  const pose: CameraPose = { position: [offset, offset, offset],
    target: [offset - 1e30, offset - 1e30, offset - 1e30], up: [0, 1, 0] };
  assert.ok([...pose.position, ...pose.target, ...pose.up].every((component) => Number.isFinite(Math.fround(component))));
  // Reproduce the unsafe transform directly, without calling the guarded helper.
  const unguarded = new THREE.PerspectiveCamera();
  unguarded.position.fromArray(pose.position);
  unguarded.up.fromArray(pose.up);
  unguarded.lookAt(new THREE.Vector3().fromArray(pose.target));
  unguarded.updateMatrixWorld();
  assert.ok(unguarded.matrixWorldInverse.elements.every(Number.isFinite));
  assert.ok(new Float32Array(unguarded.matrixWorldInverse.elements).some((component) => !Number.isFinite(component)));
  assert.ok(cameraPoseErrors(pose).some((error) => error.includes('view translation')));
  assert.throws(() => validateRenderedCameraPose(pose), /Float32/);
});
