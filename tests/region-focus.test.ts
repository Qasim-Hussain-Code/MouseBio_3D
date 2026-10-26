import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyCameraPose, fitCameraToBounds, focusCameraOnRegions } from '../src/viewer/scene-utils';

function corners(bounds: THREE.Box3): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
    for (const z of [bounds.min.z, bounds.max.z]) result.push(new THREE.Vector3(x, y, z));
  }
  return result;
}

function snapshot(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
  return { position: camera.position.toArray(), target: target.toArray(), up: camera.up.toArray(),
    quaternion: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect, zoom: camera.zoom,
    near: camera.near, far: camera.far, projection: [...camera.projectionMatrix.elements],
    world: [...camera.matrixWorld.elements], inverse: [...camera.matrixWorldInverse.elements] };
}

function assertFits(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, margin = 1.15) {
  let largestCoordinate = 0;
  for (const point of corners(bounds)) {
    const projected = point.project(camera);
    assert.ok(projected.toArray().every(Number.isFinite));
    assert.ok(Math.abs(projected.x) <= 1 / margin + 1e-8, `Horizontal crop: ${projected.x}`);
    assert.ok(Math.abs(projected.y) <= 1 / margin + 1e-8, `Vertical crop: ${projected.y}`);
    assert.ok(projected.z >= -1 - 1e-8 && projected.z <= 1 + 1e-8, `Depth clipping: ${projected.z}`);
    largestCoordinate = Math.max(largestCoordinate, Math.abs(projected.x), Math.abs(projected.y));
  }
  return largestCoordinate;
}

test('bounds fitting respects wide and tall viewports, zoom, FOV and camera roll', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-3, -3, -1), new THREE.Vector3(9, -1, 3));
  for (const aspect of [0.25, 4]) for (const fov of [25, 60]) for (const zoom of [1, 1.7]) {
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 1000);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    const target = new THREE.Vector3(1, 2, -3);
    applyCameraPose(camera, target, { position: [9, 11, 15], target: target.toArray() as [number, number, number], up: [1, 2, -0.4] });
    const direction = camera.position.clone().sub(target).normalize();
    const up = camera.up.toArray();
    assert.equal(fitCameraToBounds(camera, target, bounds), true);
    assert.ok(target.distanceTo(bounds.getCenter(new THREE.Vector3())) < 1e-12);
    assert.ok(camera.position.clone().sub(target).normalize().distanceTo(direction) < 1e-12);
    assert.deepEqual(camera.up.toArray(), up);
    assert.ok(assertFits(camera, bounds) > 0.86, 'Fit should frame the bounds rather than retreat arbitrarily far.');
    assert.equal(camera.aspect, aspect);
    assert.equal(camera.fov, fov);
    assert.equal(camera.zoom, zoom);
  }
});

test('region focus unions requested transformed meshes, ignores unknown IDs and retains hidden requested regions', () => {
  const group = new THREE.Group();
  group.position.set(1, -2, 3);
  group.rotation.set(0.2, -0.3, 0.4);
  group.scale.set(1.2, 0.8, 1.1);
  const first = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3));
  first.position.set(-3, 0, 0);
  first.visible = false;
  const second = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  second.position.set(4, 1, 0);
  group.add(first, second);
  group.updateMatrixWorld(true);
  const regions = new Map<string, THREE.Object3D>([['first', first], ['second', second]]);
  const bounds = new THREE.Box3().union(new THREE.Box3().setFromObject(first)).union(new THREE.Box3().setFromObject(second));
  const camera = new THREE.PerspectiveCamera(36, 0.6, 0.01, 1000);
  const target = new THREE.Vector3();
  applyCameraPose(camera, target, { position: [0, 0, 30], target: [0, 0, 0], up: [0, 1, 0] });
  assert.equal(focusCameraOnRegions(camera, target, regions, ['unknown', 'first', 'first', 'second']), true);
  assert.ok(target.distanceTo(bounds.getCenter(new THREE.Vector3())) < 1e-12);
  assertFits(camera, bounds);
  assert.equal(first.visible, false);
  first.geometry.dispose();
  second.geometry.dispose();
});

test('empty or entirely unknown region selections are exact camera no-ops', () => {
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  const target = new THREE.Vector3();
  applyCameraPose(camera, target, { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0] });
  const before = snapshot(camera, target);
  for (const ids of [[], ['missing'], ['missing', 'missing']]) {
    assert.equal(focusCameraOnRegions(camera, target, new Map(), ids), false);
    assert.deepEqual(snapshot(camera, target), before);
  }
});

test('single-region focus fits its actual bounds and extends a restrictive far plane', () => {
  const region = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 8));
  const camera = new THREE.PerspectiveCamera(36, 0.4, 0.1, 2);
  const target = new THREE.Vector3();
  applyCameraPose(camera, target, { position: [0, 0, 1], target: [0, 0, 0], up: [0, 1, 0] });
  assert.equal(focusCameraOnRegions(camera, target, new Map([['region', region]]), ['region']), true);
  assert.ok(camera.far > 2);
  assert.equal(camera.near, 0.1);
  assertFits(camera, new THREE.Box3().setFromObject(region));
  region.geometry.dispose();
});

test('empty, nonfinite, inverted and zero-size bounds are rejected before any camera mutation', () => {
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  const target = new THREE.Vector3();
  applyCameraPose(camera, target, { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0] });
  const before = snapshot(camera, target);
  const badBounds = [new THREE.Box3(),
    new THREE.Box3(new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(1, 1, 1)),
    new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(Infinity, 1, 1)),
    new THREE.Box3(new THREE.Vector3(2, 0, 0), new THREE.Vector3(1, 1, 1)),
    new THREE.Box3(new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)),
    new THREE.Box3(new THREE.Vector3(-1e100, -1, -1), new THREE.Vector3(1e100, 1, 1))];
  for (const bounds of badBounds) {
    assert.equal(fitCameraToBounds(camera, target, bounds), false);
    assert.deepEqual(snapshot(camera, target), before);
  }
  for (const margin of [0, 0.5, NaN, Infinity]) {
    assert.equal(fitCameraToBounds(camera, target, new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)), margin), false);
    assert.deepEqual(snapshot(camera, target), before);
  }
});

test('invalid lens and viewing parameters leave camera and target unchanged', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const cases: ((camera: THREE.PerspectiveCamera) => void)[] = [
    (camera) => { camera.fov = 0; }, (camera) => { camera.fov = 180; }, (camera) => { camera.fov = NaN; },
    (camera) => { camera.aspect = 0; }, (camera) => { camera.aspect = Infinity; }, (camera) => { camera.zoom = 0; },
    (camera) => { camera.near = 0; }, (camera) => { camera.far = camera.near; },
    (camera) => { camera.up.set(0, 0, 0); }, (camera) => { camera.position.set(0, 0, 0); },
    (camera) => { camera.filmOffset = 1; }, (camera) => { camera.matrixAutoUpdate = false; },
  ];
  for (const change of cases) {
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
    const target = new THREE.Vector3();
    applyCameraPose(camera, target, { position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0] });
    change(camera);
    const before = snapshot(camera, target);
    assert.equal(fitCameraToBounds(camera, target, bounds), false);
    assert.deepEqual(snapshot(camera, target), before);
  }
});
