import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyCameraPose, assetToDisplayPoint, captureCameraPose, createDisplayClipPlane,
  displayToAssetPoint, isPointRetainedByClipPlane, recenterMeshGeometry, validateCameraPose,
  type CameraPose,
} from '../src/viewer/scene-utils';

function closeVector(actual: THREE.Vector3, expected: THREE.Vector3, tolerance = 1e-7) {
  assert.ok(actual.distanceTo(expected) <= tolerance, `${actual.toArray()} differs from ${expected.toArray()}`);
}

function worldVertices(mesh: THREE.Mesh<THREE.BufferGeometry>): THREE.Vector3[] {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute('position');
  return Array.from({ length: positions.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
}

test('recentering preserves every resting vertex under translated, rotated and nonuniformly scaled parents', () => {
  const geometry = new THREE.BoxGeometry(0.011, 0.009, 0.015);
  geometry.translate(0.017, 0.025, -0.009);
  const parent = new THREE.Group();
  parent.position.set(0.1, -0.2, 0.05);
  parent.rotation.set(0.3, -0.4, 0.1);
  parent.scale.set(1.5, 0.8, 1.2);
  const mesh = new THREE.Mesh(geometry);
  mesh.position.set(-0.03, 0.01, 0.02);
  mesh.rotation.set(-0.5, 0.6, 0.2);
  mesh.scale.set(0.6, 1.7, 0.9);
  parent.add(mesh);
  const before = worldVertices(mesh);
  const scaleBefore = mesh.scale.clone();
  const { previousGeometry, center } = recenterMeshGeometry(mesh);
  const after = worldVertices(mesh);
  assert.equal(previousGeometry, geometry);
  assert.notEqual(mesh.geometry, geometry);
  closeVector(center, new THREE.Vector3(0.017, 0.025, -0.009));
  closeVector(mesh.scale, scaleBefore);
  before.forEach((point, index) => closeVector(after[index], point));
  mesh.geometry.computeBoundingBox();
  closeVector(mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()), new THREE.Vector3());
});

test('recentering protects a second instance sharing the original geometry', () => {
  const geometry = new THREE.BoxGeometry(2, 3, 4).translate(10, 20, 30);
  const first = new THREE.Mesh(geometry);
  const second = new THREE.Mesh(geometry);
  second.position.set(1, 2, 3);
  const before = worldVertices(second);
  recenterMeshGeometry(first);
  worldVertices(second).forEach((point, index) => closeVector(point, before[index]));
  assert.equal(second.geometry, geometry);
  assert.notEqual(first.geometry, second.geometry);
});

test('recentering preserves geometry with a manually maintained sheared matrix', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(2, 3, 4));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.set(1, 0.2, 0, 4, 0, 2, 0.1, 5, 0.3, 0, 1, 6, 0, 0, 0, 1);
  mesh.matrixWorldNeedsUpdate = true;
  const before = worldVertices(mesh);
  recenterMeshGeometry(mesh);
  worldVertices(mesh).forEach((point, index) => closeVector(point, before[index]));
});

test('unsupported deformations and invalid mesh coordinates fail before replacing geometry', () => {
  const nonfinite = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, NaN, 0], 3)));
  const empty = new THREE.Mesh(new THREE.BufferGeometry());
  const singular = new THREE.Mesh(new THREE.BoxGeometry());
  singular.scale.x = 0;
  const manualWorld = new THREE.Mesh(new THREE.BoxGeometry());
  manualWorld.matrixWorldAutoUpdate = false;
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry());
  for (const mesh of [nonfinite, empty, singular, manualWorld, skinned]) {
    const geometry = mesh.geometry;
    assert.throws(() => recenterMeshGeometry(mesh));
    assert.equal(mesh.geometry, geometry);
  }
});

test('camera synchronization preserves the Y-view up vector and projected locations', () => {
  const first = new THREE.PerspectiveCamera(36, 1.5, 0.00001, 10);
  first.position.set(0, 0.15, 0);
  first.up.set(0, 0, -1);
  const target = new THREE.Vector3();
  first.lookAt(target);
  first.updateMatrixWorld();
  const pose = captureCameraPose(first, target);
  assert.deepEqual(pose.up, [0, 0, -1]);
  const second = new THREE.PerspectiveCamera(36, 1.5, 0.00001, 10);
  const secondTarget = new THREE.Vector3(2, 3, 4);
  applyCameraPose(second, secondTarget, pose);
  closeVector(secondTarget, target);
  closeVector(second.up, first.up);
  for (const point of [new THREE.Vector3(0.01, 0, 0.02), new THREE.Vector3(-0.02, 0.01, -0.01)]) {
    closeVector(point.clone().project(second), point.clone().project(first));
  }
});

test('invalid camera vectors are rejected before changing camera or target', () => {
  const valid: CameraPose = { position: [0, 0, 2], target: [0, 0, 0], up: [0, 1, 0] };
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3();
  applyCameraPose(camera, target, valid);
  const before = captureCameraPose(camera, target);
  const invalid = [
    null, {}, { ...valid, up: undefined }, { ...valid, position: [0, 1] },
    { ...valid, target: [0, NaN, 0] }, { ...valid, up: [0, Infinity, 0] },
    { ...valid, position: [0, 0, 0] }, { ...valid, up: [0, 0, 0] },
    { ...valid, up: [0, 0, 1] }, { ...valid, target: ['0', 0, 0] },
    { ...valid, position: [-1e308, 0, 0], target: [1e308, 0, 0] },
  ];
  for (const pose of invalid) {
    assert.throws(() => validateCameraPose(pose));
    assert.throws(() => applyCameraPose(camera, target, pose as CameraPose));
    assert.deepEqual(captureCameraPose(camera, target), before);
  }
});

test('display transformation centres the asset and rotates its numerical basis without anatomical claims', () => {
  const center = new THREE.Vector3(0.02, 0.05, 0.01);
  closeVector(assetToDisplayPoint(center, center), new THREE.Vector3());
  closeVector(assetToDisplayPoint(center.clone().add(new THREE.Vector3(1, 0, 0)), center), new THREE.Vector3(0, 1, 0));
  closeVector(assetToDisplayPoint(center.clone().add(new THREE.Vector3(0, 1, 0)), center), new THREE.Vector3(-1, 0, 0));
  closeVector(assetToDisplayPoint(center.clone().add(new THREE.Vector3(0, 0, 1)), center), new THREE.Vector3(0, 0, 1));
  const point = new THREE.Vector3(0.015, 0.032, 0.006);
  closeVector(displayToAssetPoint(assetToDisplayPoint(point, center), center), point, 1e-14);
  assert.equal(assetToDisplayPoint(point, center).distanceTo(assetToDisplayPoint(center, center)).toFixed(12), point.distanceTo(center).toFixed(12));
});

test('display clipping retains exactly the same signed half-space for rendering and picking', () => {
  for (const axis of ['x', 'y', 'z'] as const) {
    const axisIndex = { x: 0, y: 1, z: 2 }[axis];
    const plane = createDisplayClipPlane(axis, 50, 0.05);
    const retained = new THREE.Vector3().setComponent(axisIndex, -0.01);
    const removed = new THREE.Vector3().setComponent(axisIndex, 0.01);
    assert.equal(isPointRetainedByClipPlane(retained, plane), true);
    assert.equal(isPointRetainedByClipPlane(removed, plane), false);
    assert.equal(isPointRetainedByClipPlane(new THREE.Vector3(), plane), true);
    const empty = createDisplayClipPlane(axis, 0, 0.05);
    const full = createDisplayClipPlane(axis, 100, 0.05);
    assert.equal(isPointRetainedByClipPlane(new THREE.Vector3(), empty), false);
    assert.equal(isPointRetainedByClipPlane(new THREE.Vector3(), full), true);
  }
  assert.throws(() => createDisplayClipPlane('x', NaN, 1));
  assert.throws(() => createDisplayClipPlane('x', 101, 1));
  assert.throws(() => createDisplayClipPlane('x', 50, 0));
});
