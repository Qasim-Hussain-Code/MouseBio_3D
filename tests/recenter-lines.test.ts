import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DISPLAY_ROTATION_Z, recenterMeshGeometry, recenterRegionGeometry } from '../src/viewer/scene-utils';
import { parseLocalTrace } from '../src/domain/local-trace';
import { buildLocalTraceScene } from '../src/viewer/local-trace-scene';

function line(points = [10, 20, 30, 12, 22, 33, -2, 4, 5]) {
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(points.length === 6 ? [0, 1] : [2, 0, 0, 1]);
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
}
function worldVertices(object: THREE.Mesh<THREE.BufferGeometry> | THREE.LineSegments<THREE.BufferGeometry>) {
  object.updateWorldMatrix(true, false);
  const attribute = object.geometry.getAttribute('position');
  return Array.from({ length: attribute.count }, (_, index) => new THREE.Vector3()
    .fromBufferAttribute(attribute, index).applyMatrix4(object.matrixWorld));
}
function close(actual: THREE.Vector3, expected: THREE.Vector3, tolerance = 1e-7) {
  assert.ok(actual.distanceTo(expected) <= tolerance, `${actual.toArray()} differs from ${expected.toArray()}`);
}
function dispose(object: THREE.Mesh<THREE.BufferGeometry> | THREE.LineSegments<THREE.BufferGeometry>) {
  object.geometry.dispose(); for (const material of [object.material].flat()) material.dispose();
}

test('line recentering retains every resting world vertex and explicit index pair under transformed parents', () => {
  const parent = new THREE.Group();
  parent.position.set(1, -2, 3); parent.rotation.set(0.3, -0.4, 0.1); parent.scale.set(1.5, 0.8, 1.2);
  const object = line();
  object.position.set(-3, 1, 2); object.rotation.set(-0.5, 0.6, 0.2); object.scale.set(0.6, 1.7, 0.9);
  parent.add(object);
  const before = worldVertices(object), scale = object.scale.clone();
  const source = object.geometry, positions = [...source.getAttribute('position').array], indices = [...source.index!.array];
  const material = object.material;
  const result = recenterRegionGeometry(object);
  assert.equal(result.previousGeometry, source); assert.notEqual(object.geometry, source);
  worldVertices(object).forEach((point, index) => close(point, before[index]));
  assert.deepEqual([...object.geometry.index!.array], indices);
  assert.deepEqual([...source.getAttribute('position').array], positions);
  assert.deepEqual([...source.index!.array], indices);
  close(object.scale, scale); assert.equal(object.material, material);
  object.geometry.computeBoundingBox();
  close(object.geometry.boundingBox!.getCenter(new THREE.Vector3()), new THREE.Vector3());
  source.dispose(); dispose(object);
});

test('line recentering protects other instances sharing source geometry', () => {
  const first = line(), source = first.geometry;
  const second = new THREE.LineSegments(source, new THREE.LineBasicMaterial());
  second.position.set(1, 2, 3);
  const before = worldVertices(second), indices = [...source.index!.array];
  recenterRegionGeometry(first);
  assert.notEqual(first.geometry, source); assert.equal(second.geometry, source);
  assert.notEqual(first.geometry.getAttribute('position').array, source.getAttribute('position').array);
  assert.notEqual(first.geometry.index!.array, source.index!.array);
  worldVertices(second).forEach((point, index) => close(point, before[index]));
  assert.deepEqual([...source.index!.array], indices);
  dispose(first); dispose(second);
});

test('line recentering preserves explicitly maintained sheared local matrices', () => {
  const object = line();
  object.matrixAutoUpdate = false;
  object.matrix.set(1, 0.2, 0, 4, 0, 2, 0.1, 5, 0.3, 0, 1, 6, 0, 0, 0, 1);
  object.matrixWorldNeedsUpdate = true;
  const before = worldVertices(object), original = object.geometry;
  recenterRegionGeometry(object);
  worldVertices(object).forEach((point, index) => close(point, before[index]));
  assert.equal(object.matrixAutoUpdate, false);
  original.dispose(); dispose(object);
});

test('high-offset native lines retain their world geometry while their GPU model-view uniforms become finite', () => {
  const object = line([3e38, 3e38, 3e38, 3.000001e38, 3e38, 3e38]);
  const source = object.geometry, sourcePositions = [...source.getAttribute('position').array], sourceIndices = [...source.index!.array];
  source.computeBoundingBox();
  const center = source.boundingBox!.getCenter(new THREE.Vector3());
  const display = new THREE.Group(), centered = new THREE.Group();
  display.rotation.z = DISPLAY_ROTATION_Z; centered.position.copy(center).negate();
  centered.add(object); display.add(centered); display.updateWorldMatrix(true, true);
  const before = worldVertices(object);
  const radius = new THREE.Box3().setFromObject(display).getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.PerspectiveCamera(36, 1, radius / 2000, radius * 100);
  camera.position.copy(new THREE.Vector3(-1, 1, 1).normalize().multiplyScalar(radius * 3.1));
  camera.lookAt(0, 0, 0); camera.updateWorldMatrix(true, false);
  const modelViewBefore = camera.matrixWorldInverse.clone().multiply(object.matrixWorld);
  assert.equal(new Float32Array(modelViewBefore.elements).every(Number.isFinite), false,
    'The accepted source offset overflows the pre-recenter GPU model-view translation.');

  const result = recenterRegionGeometry(object);
  assert.equal(result.previousGeometry, source);
  // Native magnitudes are about 3e38. Allow only floating-point accumulation
  // error from the original double-precision translated/rotated world frame.
  const tolerance = Math.max(...sourcePositions.map(Math.abs)) * Number.EPSILON * 64;
  worldVertices(object).forEach((point, index) => close(point, before[index], tolerance));
  const modelViewAfter = camera.matrixWorldInverse.clone().multiply(object.matrixWorld);
  assert.ok(new Float32Array(modelViewAfter.elements).every(Number.isFinite));
  assert.ok([...object.geometry.getAttribute('position').array].every(Number.isFinite));
  assert.deepEqual([...object.geometry.index!.array], sourceIndices);
  assert.deepEqual([...source.getAttribute('position').array], sourcePositions);
  assert.deepEqual([...source.index!.array], sourceIndices);
  source.dispose(); dispose(object);
});

test('initial serialization diagnostics remain unchanged when display recentering causes an additional Float32 collapse', async () => {
  const text = ['1 1 0 0 0 1 -1', '2 3 1 0 0 1 1', '3 3 1000000000 0 0 1 1'].join('\n');
  const result = await parseLocalTrace(new TextEncoder().encode(text).buffer as ArrayBuffer);
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.ok(result.asset);
  const asset = result.asset, sourceBefore = JSON.stringify(asset);
  assert.ok(Object.isFrozen(asset) && Object.isFrozen(asset.nodes) && asset.nodes.every(Object.isFrozen));
  assert.equal(asset.atlas.statistics.maxFloat32PositionError, 0);
  assert.equal(asset.atlas.statistics.float32CollapsedEdges, 0);
  assert.equal(asset.atlas.statistics.zeroLengthEdges, 0);
  const scene = buildLocalTraceScene(asset.atlas, asset), object = scene.children[0];
  assert.ok(object instanceof THREE.LineSegments);
  const sourceGeometry = object.geometry;
  const sourcePositions = [...sourceGeometry.getAttribute('position').array];
  const sourceIndices = [...sourceGeometry.index!.array];
  try {
    scene.position.sub(new THREE.Box3().setFromObject(scene).getCenter(new THREE.Vector3()));
    const before = worldVertices(object);
    assert.equal(before[1].distanceTo(before[0]), 1);
    const prepared = recenterRegionGeometry(object);
    assert.equal(prepared.previousGeometry, sourceGeometry);
    const after = worldVertices(object);
    assert.equal(after[1].distanceTo(after[0]), 0, 'The separately rounded centered values become coincident.');
    assert.ok(after[2].distanceTo(after[0]) > 0);
    assert.deepEqual([...object.geometry.getAttribute('position').array], [-500000000, 0, 0, -500000000, 0, 0, 500000000, 0, 0]);
    assert.deepEqual([...object.geometry.index!.array], sourceIndices);
    assert.deepEqual(sourceIndices, [1, 0, 2, 0], 'Both source parent relations remain indexed.');
    assert.deepEqual([...sourceGeometry.getAttribute('position').array], sourcePositions);
    assert.equal(asset.nodes[1][2], 1);
    assert.equal(JSON.stringify(asset), sourceBefore, 'Initial diagnostics and immutable parsed source values retain their original scope.');
  } finally {
    if (object.geometry !== sourceGeometry) sourceGeometry.dispose();
    dispose(object);
  }
});

test('the Mesh wrapper remains equivalent to generic preparation including regional-detail source-to-local transforms', () => {
  function fixture() {
    const scene = new THREE.Group();
    scene.position.set(1, -2, 3); scene.rotation.set(0.2, -0.1, 0.3);
    const geometry = new THREE.BoxGeometry(2, 3, 4).translate(10, 20, 30);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.position.set(4, -5, 6); mesh.rotation.set(0.3, -0.2, 0.4); mesh.scale.set(1.2, 0.8, 1.1);
    scene.add(mesh); scene.updateWorldMatrix(true, true);
    return { scene, mesh };
  }
  const oldEntry = fixture(), generic = fixture();
  const wrapperResult = recenterMeshGeometry(oldEntry.mesh), genericResult = recenterRegionGeometry(generic.mesh);
  assert.deepEqual(wrapperResult.center.toArray(), genericResult.center.toArray());
  assert.deepEqual(oldEntry.mesh.matrix.elements, generic.mesh.matrix.elements);
  assert.deepEqual(oldEntry.mesh.matrixWorld.elements, generic.mesh.matrixWorld.elements);
  assert.deepEqual([...oldEntry.mesh.geometry.getAttribute('position').array], [...generic.mesh.geometry.getAttribute('position').array]);
  const wrapperDetailTransform = oldEntry.mesh.matrixWorld.clone().invert().multiply(oldEntry.scene.matrixWorld);
  const genericDetailTransform = generic.mesh.matrixWorld.clone().invert().multiply(generic.scene.matrixWorld);
  assert.deepEqual(wrapperDetailTransform.elements, genericDetailTransform.elements);
  wrapperResult.previousGeometry.dispose(); genericResult.previousGeometry.dispose();
  dispose(oldEntry.mesh); dispose(generic.mesh);
});

test('invalid or unsupported line geometry is rejected before its geometry is replaced', () => {
  const nonfinite = line(); nonfinite.geometry.getAttribute('position').setX(0, NaN);
  const empty = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const singular = line(); singular.scale.x = 0;
  const manualWorld = line(); manualWorld.matrixWorldAutoUpdate = false;
  const morphed = line(); morphed.geometry.morphAttributes.position = [morphed.geometry.getAttribute('position').clone()];
  for (const object of [nonfinite, empty, singular, manualWorld, morphed]) {
    const geometry = object.geometry;
    assert.throws(() => recenterRegionGeometry(object));
    assert.equal(object.geometry, geometry);
    dispose(object);
  }
});
