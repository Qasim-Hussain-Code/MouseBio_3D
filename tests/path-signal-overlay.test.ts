/** Numerical indicator placement only; these cases do not establish browser rendering. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createPathSignalOverlay } from '../src/viewer/path-signal-overlay';

function fixture(points: readonly (readonly number[])[], paths: readonly (readonly number[])[]) {
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
  line.updateWorldMatrix(true, false);
  return line;
}
// Path 0 has segment lengths sqrt(13) and sqrt(20); path 1 lies elsewhere.
const POINTS = [[-3, 0, 0], [0, 2, 0], [4, 0, 0], [100, 50, 5], [110, 70, 5]];
const PATHS = [[0, 1, 2], [3, 4]];
const FIRST = Math.sqrt(13), SECOND = Math.sqrt(20), TOTAL = FIRST + SECOND;

function markerPositions(overlay: NonNullable<ReturnType<typeof createPathSignalOverlay>>) {
  const markers = overlay.group.children.find((child) => child instanceof THREE.Points) as THREE.Points;
  const attribute = markers.geometry.getAttribute('position');
  return Array.from({ length: markers.geometry.drawRange.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(attribute, index));
}
function onSegment(point: THREE.Vector3, a: number[], b: number[]) {
  const segment = new THREE.Line3(new THREE.Vector3(...a), new THREE.Vector3(...b));
  return segment.closestPointToPoint(point, true, new THREE.Vector3()).distanceTo(point) < 1e-5;
}

test('indicators follow only the selected source path and its source-ordered length fractions', () => {
  const line = fixture(POINTS, PATHS), before = Array.from(line.geometry.getAttribute('position').array);
  const overlay = createPathSignalOverlay(line, 0);
  assert.ok(overlay);
  assert.equal(overlay.group.parent, line);
  assert.equal(overlay.group.userData.isDisplayOverlay, true);
  assert.ok(Math.abs(overlay.sourcePathDisplayLength - TOTAL) < 1e-6);
  assert.ok(Math.abs(overlay.displayLength - TOTAL) < 1e-6);
  assert.deepEqual(overlay.fractions.map((value) => Number(value.toFixed(6))), [0, Number((FIRST / TOTAL).toFixed(6)), Number((FIRST / TOTAL).toFixed(6)), 1]);
  assert.equal(overlay.updateFlow(0, 1), true);
  const forward = markerPositions(overlay);
  assert.equal(forward.length, 12);
  assert.ok(forward[0].distanceTo(new THREE.Vector3(-3, 0, 0)) < 1e-6, 'The first marker starts at the first source point.');
  assert.ok(forward.every((point) => onSegment(point, POINTS[0], POINTS[1]) || onSegment(point, POINTS[1], POINTS[2])));
  assert.equal(overlay.updateFlow(0, -1), true);
  assert.ok(markerPositions(overlay)[0].distanceTo(new THREE.Vector3(4, 0, 0)) < 1e-6, 'Reverse flow starts at the last source point.');
  // Indicators do not intercept selection rays.
  const hits: THREE.Intersection[] = [];
  for (const child of overlay.group.children) child.raycast(new THREE.Raycaster(new THREE.Vector3(-3, 0, 5), new THREE.Vector3(0, 0, -1)), hits);
  assert.equal(hits.length, 0);
  assert.deepEqual(Array.from(line.geometry.getAttribute('position').array), before);
  overlay.dispose();
});

test('clipping retains only the existing portion of the path without moving its length fractions', () => {
  const line = fixture(POINTS, PATHS);
  // Retains points with x <= 1: all of the first segment and one quarter of the second.
  line.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1)];
  const overlay = createPathSignalOverlay(line, 0);
  assert.ok(overlay);
  assert.ok(Math.abs(overlay.displayLength - (FIRST + SECOND / 4)) < 1e-5);
  assert.ok(Math.abs(overlay.sourcePathDisplayLength - TOTAL) < 1e-6);
  assert.ok(Math.abs(overlay.fractions.at(-1)! - (FIRST + SECOND / 4) / TOTAL) < 1e-6);
  overlay.updateFlow(0, 1);
  assert.ok(markerPositions(overlay).every((point) => point.x <= 1 + 1e-6));
  overlay.dispose();
});

test('activity colours span the stated dimensionless range and reject malformed values', () => {
  const line = fixture(POINTS, PATHS), overlay = createPathSignalOverlay(line, 0)!;
  const activity = overlay.group.children.find((child) => child instanceof THREE.LineSegments) as THREE.LineSegments;
  assert.equal(overlay.updateActivity([-2, 2], -2, 2), true);
  const colors = activity.geometry.getAttribute('color');
  const first = new THREE.Color().fromBufferAttribute(colors as THREE.BufferAttribute, 0);
  const last = new THREE.Color().fromBufferAttribute(colors as THREE.BufferAttribute, colors.count - 1);
  assert.ok(first.equals(new THREE.Color(0x4b879a)) || first.clone().sub(new THREE.Color(0x4b879a)).getHex() === 0);
  assert.ok(Math.abs(last.r - new THREE.Color(0xffd65c).r) < 1e-6 && Math.abs(last.g - new THREE.Color(0xffd65c).g) < 1e-6);
  for (const values of [[1], [0, NaN], new Array(4097).fill(0)]) assert.equal(overlay.updateActivity(values), false);
  assert.equal(overlay.updateActivity([0, 1], 1, 1), false);
  assert.equal(overlay.updateFlow(NaN), false);
  overlay.dispose();
  assert.equal(overlay.group.parent, null);
  assert.equal(overlay.updateFlow(0.5), false);
  overlay.dispose();
});

test('invalid rows, hidden regions and fully clipped paths produce no overlay', () => {
  const line = fixture(POINTS, PATHS);
  for (const row of [-1, 2, 0.5, NaN]) assert.equal(createPathSignalOverlay(line, row), null);
  // Retains x <= 50, which removes every segment of path 1 but none of path 0.
  line.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 50)];
  assert.equal(createPathSignalOverlay(line, 1), null);
  const retained = createPathSignalOverlay(line, 0);
  assert.ok(retained); retained.dispose();
  line.material.clippingPlanes = [];
  line.visible = false;
  assert.equal(createPathSignalOverlay(line, 0), null);
});
