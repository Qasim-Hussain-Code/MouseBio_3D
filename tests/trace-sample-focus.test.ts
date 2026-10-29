import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { parseLocalTrace } from '../src/domain/local-trace';
import { parseSourceTrace } from '../src/domain/source-trace';
import type { Atlas } from '../src/domain/types';
import { buildLocalTraceScene } from '../src/viewer/local-trace-scene';
import { buildSourceTraceScene } from '../src/viewer/source-trace-scene';
import { traceSampleFocusBounds } from '../src/viewer/trace-sample-focus';
import { applyCameraPose, fitCameraToBounds, recenterRegionGeometry } from '../src/viewer/scene-utils';
import { disposeRegion, type RenderLine } from '../src/viewer/region-objects';

async function trace(body: string) {
  const parsed = await parseLocalTrace(new TextEncoder().encode(body).buffer as ArrayBuffer);
  assert.ok(parsed.ok && parsed.asset, parsed.errors.join(' '));
  const scene = buildLocalTraceScene(parsed.asset.atlas, parsed.asset);
  const line = scene.children[0] as RenderLine;
  line.updateWorldMatrix(true, false);
  return { asset: parsed.asset, scene, line };
}
function close(actual: THREE.Box3 | null, expected: THREE.Box3) {
  assert.ok(actual); assert.ok(actual.min.distanceTo(expected.min) < 1e-7); assert.ok(actual.max.distanceTo(expected.max) < 1e-7);
}
function box(min: number[], max: number[]) { return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)); }
const BRANCH = '900 2 2 0 0 9 100\n100 1 0 0 0 9 -1\n7 3 0 9 0 9 100\n2 3 5 2 0 9 900';

test('sample focus uses explicit original IDs and all incident parent links rather than source row adjacency', async () => {
  const { asset, line } = await trace(BRANCH);
  const original = JSON.stringify(asset), positions = [...line.geometry.getAttribute('position').array];
  close(traceSampleFocusBounds(line, 900), box([0, 0, 0], [5, 2, 0]));
  close(traceSampleFocusBounds(line, 100), box([0, 0, 0], [2, 9, 0]));
  close(traceSampleFocusBounds(line, 7), box([0, 0, 0], [0, 9, 0]));
  assert.equal(traceSampleFocusBounds(line, 1), null);
  for (const id of [0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.equal(traceSampleFocusBounds(line, id), null);
  assert.deepEqual([...line.geometry.getAttribute('position').array], positions);
  assert.equal(JSON.stringify(asset), original); disposeRegion(line);
});

test('framing uses recentered Float32 geometry with current hierarchy transforms and retains camera direction and roll', async () => {
  const { scene, line } = await trace(BRANCH);
  const { previousGeometry } = recenterRegionGeometry(line); previousGeometry.dispose();
  scene.position.set(11, -4, 3); scene.rotation.set(0.2, -0.3, Math.PI / 2); scene.scale.set(2, 0.7, 1.3);
  line.rotation.y = 0.4; scene.updateWorldMatrix(true, true);
  const positions = line.geometry.getAttribute('position'), expected = new THREE.Box3();
  for (const vertex of [0, 1, 3]) expected.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(line.matrixWorld));
  const before = [...positions.array], matrix = line.matrixWorld.toArray();
  const actual = traceSampleFocusBounds(line, 900); close(actual, expected);
  const camera = new THREE.PerspectiveCamera(36, 0.5, 0.001, 1000), target = new THREE.Vector3(1, 2, 3);
  applyCameraPose(camera, target, { position: [30, 20, 40], target: [1, 2, 3], up: [1, 2, -0.5] });
  const direction = camera.position.clone().sub(target).normalize(), up = camera.up.toArray();
  assert.equal(fitCameraToBounds(camera, target, actual!), true);
  assert.ok(target.distanceTo(expected.getCenter(new THREE.Vector3())) < 1e-10);
  assert.ok(camera.position.clone().sub(target).normalize().distanceTo(direction) < 1e-10);
  assert.deepEqual(camera.up.toArray(), up);
  for (const x of [expected.min.x, expected.max.x]) for (const y of [expected.min.y, expected.max.y]) for (const z of [expected.min.z, expected.max.z]) {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1);
  }
  assert.deepEqual([...positions.array], before); assert.deepEqual(line.matrixWorld.toArray(), matrix); disposeRegion(line);
});

test('clipping bounds include only retained portions of incident links, without changing endpoints or restoring hidden geometry', async () => {
  const { line, scene } = await trace('10 1 -2 0 0 1 -1\n20 2 2 0 0 1 10\n30 2 -3 1 0 1 10\n40 1 100 0 0 1 -1\n50 2 101 0 0 1 40');
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  close(traceSampleFocusBounds(line, 10, plane), box([0, 0, 0], [2, 0, 0]));
  assert.equal(traceSampleFocusBounds(line, 30, plane), null);
  assert.equal(traceSampleFocusBounds(line, 10, new THREE.Plane(new THREE.Vector3(1, 0, 0), -3)), null);
  for (const bad of [new THREE.Plane(new THREE.Vector3(), 0), new THREE.Plane(new THREE.Vector3(1, 0, 0), NaN)]) assert.equal(traceSampleFocusBounds(line, 10, bad), null);
  line.visible = false; assert.equal(traceSampleFocusBounds(line, 10), null); line.visible = true;
  line.material.opacity = 0; assert.equal(traceSampleFocusBounds(line, 10), null); line.material.opacity = 1;
  scene.visible = false; assert.equal(traceSampleFocusBounds(line, 10), null); scene.visible = true;
  line.geometry.setDrawRange(2, 2); assert.equal(traceSampleFocusBounds(line, 20), null);
  close(traceSampleFocusBounds(line, 10), box([-3, 0, 0], [-2, 1, 0]));
  disposeRegion(line);
});

test('isolated samples, coincident links and links collapsed during recentering do not acquire focusable point glyphs', async () => {
  const { line } = await trace('10 1 0 0 0 1 -1\n20 2 1 0 0 1 10\n30 2 1 0 0 1 20\n99 1 10 0 0 1 -1');
  assert.equal(traceSampleFocusBounds(line, 99), null); assert.equal(traceSampleFocusBounds(line, 30), null);
  close(traceSampleFocusBounds(line, 20), box([0, 0, 0], [1, 0, 0])); disposeRegion(line);
  const wide = await trace('1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n3 2 1000000000 0 0 1 2');
  assert.ok(traceSampleFocusBounds(wide.line, 1));
  const { previousGeometry } = recenterRegionGeometry(wide.line); previousGeometry.dispose();
  assert.equal(traceSampleFocusBounds(wide.line, 1), null);
  assert.ok(traceSampleFocusBounds(wide.line, 2)); disposeRegion(wide.line);
});

test('malformed source ID maps, index inventories, resource counts and transforms reject focus without repairing geometry', async () => {
  const { line } = await trace(BRANCH);
  const mutations: ((value: RenderLine) => void)[] = [
    (value) => { value.userData.vertexSourceIds = Object.freeze([900, 100, 7, 900]); },
    (value) => { value.userData.vertexSourceIds = [900, 100, 7, 2]; },
    (value) => { value.userData.vertexSourceIds = Object.freeze([900, 100, 7]); },
    (value) => { value.userData.sourceSampleCount = 100001; },
    (value) => { value.userData.sourceParentLinks = 2; },
    (value) => { value.userData.isolatedSourceSamples = 1; },
    (value) => { value.geometry.setIndex([0, 1, 2, 1, 3, 99]); },
    (value) => { value.geometry.setIndex([0, 1, 2, 1, 0, 3]); },
    (value) => { value.geometry.setIndex([0, 1, 1, 2, 2, 0]); },
    (value) => { value.geometry.getAttribute('position').setX(0, NaN); },
    (value) => { value.geometry.getAttribute('position').normalized = true; },
    (value) => { value.geometry.setDrawRange(1, 2); },
    (value) => { value.matrixWorld.elements[3] = 1; },
    (value) => { value.matrixWorld.makeScale(0, 1, 1); },
  ];
  for (const mutate of mutations) {
    const changed = new THREE.LineSegments(line.geometry.clone(), line.material.clone());
    changed.userData = { ...line.userData, vertexSourceIds: Object.freeze([...line.userData.vertexSourceIds]) };
    mutate(changed); const before = [...changed.geometry.index!.array];
    assert.equal(traceSampleFocusBounds(changed, 900), null);
    assert.deepEqual([...changed.geometry.index!.array], before); disposeRegion(changed);
  }
  const missingMetadata = new THREE.LineSegments(line.geometry.clone(), line.material.clone());
  assert.equal(traceSampleFocusBounds(missingMetadata, 900), null); disposeRegion(missingMetadata); disposeRegion(line);
});

test('actual bundled source IDs focus their existing incident links after display preparation without source mutation', async () => {
  const atlas = JSON.parse(await readFile(new URL('../public/atlas-neuron/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const body = await readFile(new URL('../public/atlas-neuron/nmo130632-standardized.swc.txt', import.meta.url));
  const parsed = await parseSourceTrace(new Uint8Array(body).buffer as ArrayBuffer, atlas); assert.ok(parsed.ok && parsed.asset);
  const original = JSON.stringify(parsed.asset), scene = buildSourceTraceScene(atlas, parsed.asset), line = scene.children[0] as RenderLine;
  const { previousGeometry } = recenterRegionGeometry(line); previousGeometry.dispose();
  scene.rotation.z = Math.PI / 2; scene.position.set(2, 3, 4); scene.updateWorldMatrix(true, true);
  const positions = line.geometry.getAttribute('position'), indices = line.geometry.index!, ids: readonly number[] = line.userData.vertexSourceIds;
  for (const id of [1, 100, 11650]) {
    const vertex = ids.indexOf(id), expected = new THREE.Box3();
    for (let offset = 0; offset < indices.count; offset += 2) {
      const child = indices.getX(offset), parent = indices.getX(offset + 1); if (child !== vertex && parent !== vertex) continue;
      const first = new THREE.Vector3().fromBufferAttribute(positions, child).applyMatrix4(line.matrixWorld);
      const second = new THREE.Vector3().fromBufferAttribute(positions, parent).applyMatrix4(line.matrixWorld);
      if (!first.equals(second)) expected.expandByPoint(first).expandByPoint(second);
    }
    close(traceSampleFocusBounds(line, id), expected);
  }
  assert.equal(JSON.stringify(parsed.asset), original); disposeRegion(line);
});
