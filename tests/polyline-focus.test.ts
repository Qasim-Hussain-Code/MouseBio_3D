/** Numerical path framing only; these cases do not establish browser rendering or anatomical accuracy. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import type { Atlas } from '../src/domain/types';
import { parseSourcePolyline } from '../src/domain/source-polyline';
import { buildSourcePolylineScene } from '../src/viewer/source-polyline-scene';
import { sourcePolylinePathBounds } from '../src/viewer/polyline-focus';
import { recenterRegionGeometry, applyCameraPose, fitCameraToBounds } from '../src/viewer/scene-utils';
import { disposeRegion, type RenderLine } from '../src/viewer/region-objects';

function fixture(points: readonly (readonly number[])[], paths: readonly (readonly number[])[]): RenderLine {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3));
  const indices: number[] = [], starts = [0];
  for (const path of paths) {
    for (let offset = 1; offset < path.length; offset++) indices.push(path[offset - 1], path[offset]);
    starts.push(indices.length / 2);
  }
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
  line.userData = { sourceSampleCount: points.length, sourceSegmentCount: indices.length / 2,
    sourcePolylineCount: paths.length, isolatedSourceSamples: 0,
    vertexSourcePointIndices: Object.freeze(points.map((_, index) => index)),
    sourcePolylineIndices: Object.freeze(paths.map((_, index) => index)), sourcePolylineSegmentStarts: Object.freeze(starts) };
  line.updateWorldMatrix(true, false); return line;
}
const POINTS = [[-3, 0, 0], [0, 2, 0], [4, 0, 0], [100, 50, 5], [110, 70, 5]];
const PATHS = [[0, 1, 2], [3, 4]];
function bounds(min: number[], max: number[]): THREE.Box3 { return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)); }
function close(actual: THREE.Box3 | null, expected: THREE.Box3) {
  assert.ok(actual); assert.ok(actual.min.distanceTo(expected.min) < 1e-7); assert.ok(actual.max.distanceTo(expected.max) < 1e-7);
}

test('path focus follows the original zero-based row and excludes unrelated paths without altering data', () => {
  const line = fixture(POINTS, PATHS), before = Array.from(line.geometry.getAttribute('position').array);
  const indices = Array.from(line.geometry.index!.array), metadata = JSON.stringify(line.userData);
  close(sourcePolylinePathBounds(line, 0), bounds([-3, 0, 0], [4, 2, 0]));
  close(sourcePolylinePathBounds(line, 1), bounds([100, 50, 5], [110, 70, 5]));
  for (const row of [-1, 0.1, NaN, Infinity, 2, Number.MAX_SAFE_INTEGER + 1]) assert.equal(sourcePolylinePathBounds(line, row), null);
  assert.deepEqual(Array.from(line.geometry.getAttribute('position').array), before);
  assert.deepEqual(Array.from(line.geometry.index!.array), indices); assert.equal(JSON.stringify(line.userData), metadata);
  disposeRegion(line);
});

test('path framing uses current recentered positions and world transforms and works with the existing rolled camera fitter', () => {
  const line = fixture(POINTS, PATHS), parent = new THREE.Group(); parent.add(line);
  const { previousGeometry } = recenterRegionGeometry(line); previousGeometry.dispose();
  parent.position.set(13, -7, 2); parent.rotation.set(0.4, -0.2, 1.1); parent.scale.set(2, 0.75, 1.3);
  line.rotation.y = 0.2; parent.updateWorldMatrix(true, true);
  const positions = line.geometry.getAttribute('position'), expected = new THREE.Box3();
  for (const vertex of PATHS[0]) expected.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(line.matrixWorld));
  const before = Array.from(positions.array), transform = line.matrixWorld.toArray();
  const actual = sourcePolylinePathBounds(line, 0); close(actual, expected);
  const camera = new THREE.PerspectiveCamera(36, 0.65, 0.001, 1000), target = new THREE.Vector3();
  applyCameraPose(camera, target, { position: [30, 20, 40], target: [1, 2, 3], up: [1, 2, -0.5] });
  const direction = camera.position.clone().sub(target).normalize(), up = camera.up.toArray();
  assert.equal(fitCameraToBounds(camera, target, actual!), true);
  assert.ok(camera.position.clone().sub(target).normalize().distanceTo(direction) < 1e-10);
  assert.deepEqual(camera.up.toArray(), up);
  assert.deepEqual(Array.from(positions.array), before); assert.deepEqual(line.matrixWorld.toArray(), transform);
  disposeRegion(line);
});

test('all active clipping planes retain only the existing portions of the selected path without changing planes or endpoints', () => {
  const line = fixture([[-3, 0, 0], [3, 0, 0], [3, 4, 0]], [[0, 1, 2]]);
  const planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), 2)];
  const originalPlanes = planes.map((plane) => [...plane.normal.toArray(), plane.constant]);
  const originalPositions = Array.from(line.geometry.getAttribute('position').array);
  close(sourcePolylinePathBounds(line, 0, planes), bounds([0, 0, 0], [3, 2, 0]));
  close(sourcePolylinePathBounds(line, 0, [...planes].reverse()), bounds([0, 0, 0], [3, 2, 0]));
  assert.equal(sourcePolylinePathBounds(line, 0, [new THREE.Plane(new THREE.Vector3(1, 0, 0), -4)]), null);
  assert.equal(sourcePolylinePathBounds(line, 0, [new THREE.Plane(new THREE.Vector3(0, 1, 0), -5), planes[1]]), null);
  for (const invalid of [new THREE.Plane(new THREE.Vector3(), 0), new THREE.Plane(new THREE.Vector3(1, 0, 0), NaN)]) assert.equal(sourcePolylinePathBounds(line, 0, [invalid]), null);
  assert.equal(sourcePolylinePathBounds(line, 0, Array(9).fill(planes[0])), null);
  assert.deepEqual(planes.map((plane) => [...plane.normal.toArray(), plane.constant]), originalPlanes);
  assert.deepEqual(Array.from(line.geometry.getAttribute('position').array), originalPositions); disposeRegion(line);
});

test('hidden, coincident and draw-range-omitted paths have no focusable glyph or extent', () => {
  const line = fixture([[0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]], [[0, 1], [2, 3, 4]]);
  assert.equal(sourcePolylinePathBounds(line, 0), null);
  close(sourcePolylinePathBounds(line, 1), bounds([1, 0, 0], [3, 0, 0]));
  line.geometry.setDrawRange(4, 2); close(sourcePolylinePathBounds(line, 1), bounds([2, 0, 0], [3, 0, 0]));
  line.geometry.setDrawRange(0, 2); assert.equal(sourcePolylinePathBounds(line, 1), null);
  line.geometry.setDrawRange(0, Infinity);
  line.visible = false; assert.equal(sourcePolylinePathBounds(line, 1), null); line.visible = true;
  line.material.opacity = 0; assert.equal(sourcePolylinePathBounds(line, 1), null); line.material.opacity = 1;
  line.material.visible = false; assert.equal(sourcePolylinePathBounds(line, 1), null); line.material.visible = true;
  const parent = new THREE.Group(); parent.add(line); parent.visible = false;
  assert.equal(sourcePolylinePathBounds(line, 1), null); disposeRegion(line);
});

test('malformed source tables, selected mappings, truncated indices and unsafe transforms reject focus without repair', () => {
  const mutations: ((line: RenderLine) => void)[] = [
    (line) => { line.userData.sourcePolylineIndices = [0, 1]; },
    (line) => { line.userData.sourcePolylineIndices = Object.freeze([1, 0]); },
    (line) => { line.userData.sourcePolylineSegmentStarts = Object.freeze([0, 3]); },
    (line) => { line.userData.sourcePolylineSegmentStarts = Object.freeze([1, 2, 3]); },
    (line) => { line.userData.sourcePolylineSegmentStarts = Object.freeze([0, 0, 3]); },
    (line) => { line.userData.sourceSegmentCount = 2; },
    (line) => { line.userData.sourcePolylineCount = 3; },
    (line) => { line.userData.sourceSampleCount = 6; },
    (line) => { line.userData.vertexSourcePointIndices = [0, 1, 2, 3, 4]; },
    (line) => { line.userData.vertexSourcePointIndices = Object.freeze([0, 0, 2, 3, 4]); },
    (line) => { line.userData.vertexSourcePointIndices = Object.freeze([0, 1, 99, 3, 4]); },
    (line) => { line.geometry.setIndex([0, 1]); },
    (line) => { line.geometry.index!.array = line.geometry.index!.array.slice(0, 4); },
    (line) => { const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute; positions.array = positions.array.slice(0, 9); },
    (line) => { line.geometry.setIndex([0, 1, 1, 99, 3, 4]); },
    (line) => { line.geometry.setIndex([0, 1, 2, 3, 3, 4]); },
    (line) => { line.geometry.getAttribute('position').setX(1, NaN); },
    (line) => { line.geometry.getAttribute('position').normalized = true; },
    (line) => { line.geometry.setDrawRange(1, 2); },
    (line) => { line.geometry.setDrawRange(0, 7); },
    (line) => { line.matrixWorld.elements[3] = 1; },
    (line) => { line.matrixWorld.makeScale(0, 1, 1); },
  ];
  for (const mutate of mutations) {
    const line = fixture(POINTS, PATHS); mutate(line);
    const before = Array.from(line.geometry.index!.array);
    assert.equal(sourcePolylinePathBounds(line, 0), null);
    assert.deepEqual(Array.from(line.geometry.index!.array), before); disposeRegion(line);
  }
});

test('focusing one path does not scan the coordinates of unrelated source paths', () => {
  const points = Array.from({ length: 10000 }, (_, index) => [index, index % 5, 0]);
  const paths = Array.from({ length: 5000 }, (_, index) => [index * 2, index * 2 + 1]);
  const line = fixture(points, paths), position = line.geometry.getAttribute('position');
  const read = position.getX.bind(position); let xReads = 0;
  position.getX = (index: number) => { xReads++; return read(index); };
  close(sourcePolylinePathBounds(line, 4999), bounds([9998, 3, 0], [9999, 4, 0]));
  assert.equal(xReads, 2); disposeRegion(line);
});

test('actual nerve paths retain original source identity and values after recentering and transformed focus', async () => {
  const atlas = JSON.parse(await readFile(new URL('../public/atlas-nerve/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const bytes = await readFile(new URL('../public/atlas-nerve/mousemapper-patch0-lines.json', import.meta.url));
  const parsed = await parseSourcePolyline(new Uint8Array(bytes).buffer as ArrayBuffer, atlas);
  assert.ok(parsed.ok && parsed.asset, parsed.errors.join(' ')); const asset = parsed.asset;
  const original = JSON.stringify(asset), scene = buildSourcePolylineScene(atlas, asset);
  const line = scene.children[0]; assert.ok(line instanceof THREE.LineSegments && line.material instanceof THREE.LineBasicMaterial);
  const { previousGeometry } = recenterRegionGeometry(line); previousGeometry.dispose();
  scene.rotation.z = Math.PI / 2; scene.position.set(2, 3, 4); scene.updateWorldMatrix(true, true);
  const position = line.geometry.getAttribute('position'), before = Array.from(position.array);
  const vertexBySource = new Map<number, number>((line.userData.vertexSourcePointIndices as number[]).map((id, row) => [id, row]));
  for (const row of [0, 17, asset.paths.length - 1]) {
    const expected = new THREE.Box3();
    for (const sourceIndex of asset.paths[row]) expected.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, vertexBySource.get(sourceIndex)!).applyMatrix4(line.matrixWorld));
    close(sourcePolylinePathBounds(line, row), expected);
  }
  assert.equal(JSON.stringify(asset), original); assert.deepEqual(Array.from(position.array), before);
  disposeRegion(line);
});
