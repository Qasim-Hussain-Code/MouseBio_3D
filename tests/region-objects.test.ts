import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { disposeRegion, linePickingThreshold, nearestClippedLineIntersection, prepareRegionMaterial,
  regionLabelCenter, type RenderLine } from '../src/viewer/region-objects';

function line(points: number[], pairs: number[] = [0, 1]): RenderLine {
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(pairs);
  const result = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
  result.updateWorldMatrix(true, false);
  return result;
}
function ray(x = 0, y = 0, z = 5, threshold = 0.05): THREE.Raycaster {
  const result = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, -1));
  result.params.Line.threshold = threshold;
  return result;
}
function close(actual: THREE.Vector3, expected: THREE.Vector3, tolerance = 1e-7) {
  assert.ok(actual.distanceTo(expected) <= tolerance, `${actual.toArray()} differs from ${expected.toArray()}`);
}

test('material preparation retains surface settings and gives lines a distinct display material without changing geometry', () => {
  const oldMeshMaterial = new THREE.MeshBasicMaterial();
  let oldMeshDisposals = 0;
  oldMeshMaterial.addEventListener('dispose', () => oldMeshDisposals++);
  const meshGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const mesh = new THREE.Mesh(meshGeometry, [oldMeshMaterial, oldMeshMaterial]);
  const preparedMesh = prepareRegionMaterial(mesh);
  assert.equal(preparedMesh, mesh);
  assert.ok(preparedMesh instanceof THREE.Mesh && preparedMesh.material instanceof THREE.MeshStandardMaterial);
  assert.equal(preparedMesh.material.roughness, 0.68);
  assert.equal(preparedMesh.material.metalness, 0.02);
  assert.equal(preparedMesh.material.side, THREE.DoubleSide);
  assert.equal(preparedMesh.geometry, meshGeometry);
  assert.equal(oldMeshDisposals, 1);

  const traced = line([0, 0, 0, 1, 2, 3]);
  const lineGeometry = traced.geometry, previousLineMaterial = traced.material;
  const originalPositions = [...lineGeometry.getAttribute('position').array];
  let oldLineDisposals = 0;
  previousLineMaterial.addEventListener('dispose', () => oldLineDisposals++);
  const preparedLine = prepareRegionMaterial(traced);
  assert.ok(preparedLine instanceof THREE.LineSegments && preparedLine.material instanceof THREE.LineBasicMaterial);
  assert.equal('emissive' in preparedLine.material, false);
  assert.equal(preparedLine.material.linewidth, 1);
  assert.equal(oldLineDisposals, 1);
  assert.equal(preparedLine.geometry, lineGeometry);
  assert.deepEqual([...lineGeometry.getAttribute('position').array], originalPositions);
  assert.equal(lineGeometry.getAttribute('normal'), undefined);
  disposeRegion(preparedMesh); disposeRegion(preparedLine);
});

test('disposal covers both geometry kinds and each distinct owned material once', () => {
  for (const kind of ['mesh', 'line']) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial();
    let geometries = 0, materials = 0;
    geometry.addEventListener('dispose', () => geometries++);
    material.addEventListener('dispose', () => materials++);
    const object = kind === 'mesh' ? new THREE.Mesh(geometry, [material, material])
      : new THREE.LineSegments(geometry, [material, material]);
    disposeRegion(object);
    assert.equal(geometries, 1); assert.equal(materials, 1);
  }
});

test('labels use transformed world bounds instead of the source object origin', () => {
  const traced = line([10, 20, 30, 16, 22, 30]);
  const parent = new THREE.Group();
  parent.position.set(-2, 3, 4); parent.rotation.z = 0.4; parent.scale.set(2, 3, 0.5);
  traced.position.set(1, 2, 3); traced.rotation.y = 0.3;
  parent.add(traced); parent.updateWorldMatrix(true, true);
  const positions = [...traced.geometry.getAttribute('position').array];
  const expected = new THREE.Box3().setFromObject(traced).getCenter(new THREE.Vector3());
  const anchor = regionLabelCenter(traced)!;
  close(anchor, expected);
  assert.ok(anchor.distanceTo(traced.getWorldPosition(new THREE.Vector3())) > 1);
  assert.deepEqual([...traced.geometry.getAttribute('position').array], positions);
  const surface = prepareRegionMaterial(new THREE.Mesh(traced.geometry.clone()));
  surface.position.set(4, -5, 2);
  close(regionLabelCenter(surface)!, new THREE.Box3().setFromObject(surface).getCenter(new THREE.Vector3()));
  assert.equal(regionLabelCenter(line([])), null);
  traced.position.x = NaN;
  assert.equal(regionLabelCenter(traced), null);
  disposeRegion(surface); disposeRegion(traced);
});

test('line picking allowance approximates five CSS pixels at target depth and rejects invalid presentation inputs', () => {
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0);
  const target = new THREE.Vector3();
  assert.ok(Math.abs(linePickingThreshold(camera, target, 1000)! - 0.1) < 1e-12);
  camera.zoom = 2;
  assert.ok(Math.abs(linePickingThreshold(camera, target, 1000)! - 0.05) < 1e-12);
  assert.ok(Math.abs(linePickingThreshold(camera, target, 500)! - 0.1) < 1e-12);
  assert.equal(linePickingThreshold(camera, new THREE.Vector3(0, 0, 10), 1000), null);
  assert.equal(linePickingThreshold(camera, new THREE.Vector3(0, 0, 20), 1000), null);
  for (const value of [0, -1, NaN, Infinity]) {
    assert.equal(linePickingThreshold(camera, target, value), null);
    assert.equal(linePickingThreshold(camera, target, 1000, value), null);
  }
  camera.position.set(10, 0, 0); camera.lookAt(target);
  assert.ok(Math.abs(linePickingThreshold(camera, target, 1000)! - 0.05) < 1e-12);
  for (const change of [
    (value: THREE.PerspectiveCamera) => { value.fov = 180; },
    (value: THREE.PerspectiveCamera) => { value.zoom = 0; },
    (value: THREE.PerspectiveCamera) => { value.aspect = NaN; },
    (value: THREE.PerspectiveCamera) => { value.near = 0; },
    (value: THREE.PerspectiveCamera) => { value.far = Infinity; },
    (value: THREE.PerspectiveCamera) => { value.position.x = NaN; },
  ]) {
    const changed = camera.clone(); change(changed);
    assert.equal(linePickingThreshold(changed, target, 1000), null);
  }
});

test('crossing segments are clipped before picking, including the retained part near a discarded closest point', () => {
  const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  for (const pairs of [[0, 1], [1, 0]]) {
    const traced = line([-2, 0, 0, 2, 0, 0], pairs);
    const hit = nearestClippedLineIntersection(traced, ray(-0.04, 0, 1), clip);
    assert.ok(hit);
    close(hit.point, new THREE.Vector3());
    assert.equal(hit.distance, 1); assert.equal(hit.index, 0); assert.equal(hit.object, traced);
    assert.equal(nearestClippedLineIntersection(traced, ray(-0.06, 0, 1), clip), null);
    disposeRegion(traced);
  }
  const discarded = line([-2, 0, 0, -1, 0, 0]);
  assert.equal(nearestClippedLineIntersection(discarded, ray(-1.5), clip), null);
  disposeRegion(discarded);
});

test('explicit endpoint pairs retain their original segment identity and never join adjacent rows', () => {
  const separated = line([-2, -1, 0, -1, -1, 0, 1, 1, 0, 2, 1, 0], [0, 1, 2, 3]);
  assert.equal(nearestClippedLineIntersection(separated, ray()), null);
  const depths = line([-1, 0, 2, 1, 0, 2, -1, 0, 5, 1, 0, 5], [0, 1, 2, 3]);
  const hit = nearestClippedLineIntersection(depths, ray(0, 0, 10))!;
  assert.equal(hit.index, 2); assert.equal(hit.distance, 5); close(hit.point, new THREE.Vector3(0, 0, 5));
  const clipped = nearestClippedLineIntersection(depths, ray(0, 0, 10), new THREE.Plane(new THREE.Vector3(0, 0, -1), 3))!;
  assert.equal(clipped.index, 0); assert.equal(clipped.distance, 8);
  depths.geometry.setDrawRange(2, 2);
  assert.equal(nearestClippedLineIntersection(depths, ray(0, 0, 10))!.index, 2);
  depths.geometry.setDrawRange(1, 2);
  assert.equal(nearestClippedLineIntersection(depths, ray(0, 0, 10)), null);
  disposeRegion(separated); disposeRegion(depths);
});

test('world-space clipping and picking preserve nonuniform parent and local transformations without mutating inputs', () => {
  const traced = line([-1, 0, 0, 1, 0, 0]);
  const parent = new THREE.Group();
  parent.position.set(3, 4, 5); parent.rotation.z = 0.5; parent.scale.set(2, 3, 0.5);
  traced.position.set(1, 2, -3); traced.rotation.y = 0.4; traced.scale.set(0.5, 2, 3);
  parent.add(traced); parent.updateWorldMatrix(true, true);
  const first = new THREE.Vector3(-1, 0, 0).applyMatrix4(traced.matrixWorld);
  const second = new THREE.Vector3(1, 0, 0).applyMatrix4(traced.matrixWorld);
  const center = first.clone().lerp(second, 0.5);
  const clip = new THREE.Plane().setFromNormalAndCoplanarPoint(second.clone().sub(first).normalize(), center);
  const cast = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 0, 10)), new THREE.Vector3(0, 0, -1));
  cast.params.Line.threshold = 1e-6;
  const snapshot = () => JSON.stringify({ positions: [...traced.geometry.getAttribute('position').array],
    indices: [...traced.geometry.index!.array], matrix: traced.matrixWorld.elements,
    origin: cast.ray.origin.toArray(), direction: cast.ray.direction.toArray(), normal: clip.normal.toArray(), constant: clip.constant });
  const before = snapshot();
  const hit = nearestClippedLineIntersection(traced, cast, clip);
  assert.ok(hit); close(hit.point, center); assert.ok(Math.abs(hit.distance - 10) < 1e-7);
  assert.equal(snapshot(), before);
  disposeRegion(traced);
});

test('threshold and near/far limits are explicit, and zero-length geometry never becomes a point glyph', () => {
  const traced = line([-1, 0, 0, 1, 0, 0]);
  const cast = ray(0, 0.1, 5, 0.099);
  assert.equal(nearestClippedLineIntersection(traced, cast), null);
  cast.params.Line.threshold = 0.1; cast.near = 5; cast.far = 5;
  assert.equal(nearestClippedLineIntersection(traced, cast)!.distance, 5);
  cast.near = 5.001; cast.far = Infinity;
  assert.equal(nearestClippedLineIntersection(traced, cast), null);
  cast.near = 0; cast.far = 4.999;
  assert.equal(nearestClippedLineIntersection(traced, cast), null);
  const coincident = line([0, 0, 0, 0, 0, 0]);
  assert.equal(nearestClippedLineIntersection(coincident, ray()), null);
  const clippedToPoint = line([-1, 0, 0, 0, 0, 0]);
  assert.equal(nearestClippedLineIntersection(clippedToPoint, ray(), new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)), null);
  disposeRegion(traced); disposeRegion(coincident); disposeRegion(clippedToPoint);
});

test('malformed pairs, coordinates, transforms, rays and clipping parameters fail without partial intersections', () => {
  for (const change of [
    (value: RenderLine) => { value.geometry.setIndex(null); },
    (value: RenderLine) => { value.geometry.setIndex([0, 1, 0]); },
    (value: RenderLine) => { value.geometry.setIndex([0, 5]); },
    (value: RenderLine) => { value.geometry.setIndex(new THREE.Float32BufferAttribute([0, 0.5], 1)); },
    (value: RenderLine) => { value.geometry.getAttribute('position').setX(0, NaN); },
    (value: RenderLine) => { value.matrixWorld.elements[0] = Infinity; },
  ]) {
    const changed = line([-1, 0, 0, 1, 0, 0]); change(changed);
    assert.equal(nearestClippedLineIntersection(changed, ray()), null);
    disposeRegion(changed);
  }
  const traced = line([-1, 0, 0, 1, 0, 0]);
  for (const change of [
    (value: THREE.Raycaster) => { value.params.Line.threshold = -1; },
    (value: THREE.Raycaster) => { value.params.Line.threshold = Infinity; },
    (value: THREE.Raycaster) => { value.near = -1; },
    (value: THREE.Raycaster) => { value.far = NaN; },
    (value: THREE.Raycaster) => { value.ray.origin.x = Infinity; },
    (value: THREE.Raycaster) => { value.ray.direction.z = -2; },
  ]) {
    const changed = ray(); change(changed);
    assert.equal(nearestClippedLineIntersection(traced, changed), null);
  }
  assert.equal(nearestClippedLineIntersection(traced, ray(), new THREE.Plane(new THREE.Vector3(), 0)), null);
  assert.equal(nearestClippedLineIntersection(traced, ray(), new THREE.Plane(new THREE.Vector3(1, 0, 0), NaN)), null);
  disposeRegion(traced);
});
