import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import type { Atlas } from '../src/domain/types';
import { parseSourcePolyline, type SourcePolylineAsset } from '../src/domain/source-polyline';
import { buildSourcePolylineScene } from '../src/viewer/source-polyline-scene';
import { recenterRegionGeometry } from '../src/viewer/scene-utils';
import { buildLocalTraceScene } from '../src/viewer/local-trace-scene';

async function fixture(): Promise<SourcePolylineAsset> {
  const atlas = JSON.parse(await readFile(new URL('../public/atlas-nerve/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const body = await readFile(new URL('../public/atlas-nerve/mousemapper-patch0-lines.json', import.meta.url));
  const result = await parseSourcePolyline(new Uint8Array(body).buffer as ArrayBuffer, atlas);
  assert.ok(result.ok && result.asset, result.errors.join(' ')); return result.asset;
}

test('every source polyline becomes consecutive indexed segments while original point and path indices remain identifiable', async () => {
  const asset = await fixture(), before = JSON.stringify(asset);
  const scene = buildSourcePolylineScene(asset.atlas, asset); assert.equal(scene.children.length, 1);
  const line = scene.children[0]; assert.ok(line instanceof THREE.LineSegments && line.material instanceof THREE.LineBasicMaterial);
  try {
    const positions = line.geometry.getAttribute('position'), indices = line.geometry.index!;
    assert.equal(positions.count, 1940); assert.equal(indices.count, 1876 * 2);
    assert.equal(line.material.linewidth, 1); assert.equal(line.name, 'region_mousemapper_patch0');
    assert.equal(line.userData.structureId, 'mousemapper-nerve:patch0');
    assert.equal(line.userData.sourceSampleCount, 1940); assert.equal(line.userData.sourceSegmentCount, 1876);
    assert.equal(line.userData.sourcePolylineCount, 84); assert.equal(line.userData.isolatedSourceSamples, 0);
    assert.equal(line.userData.sourceParentLinks, undefined); assert.equal(line.userData.vertexSourceIds, undefined);
    assert.deepEqual(line.userData.vertexSourcePointIndices, asset.points.map((_, index) => index));
    assert.deepEqual(line.userData.sourcePolylineIndices, asset.paths.map((_, index) => index));
    assert.ok(Object.isFrozen(line.userData.vertexSourcePointIndices) && Object.isFrozen(line.userData.sourcePolylineSegmentStarts));
    let segment = 0;
    for (const [pathId, path] of asset.paths.entries()) {
      assert.equal(line.userData.sourcePolylineSegmentStarts[pathId], segment);
      for (let offset = 1; offset < path.length; offset++) {
        assert.equal(indices.getX(segment * 2), path[offset - 1]); assert.equal(indices.getX(segment * 2 + 1), path[offset]); segment++;
      }
      assert.equal(line.userData.sourcePolylineSegmentStarts[pathId + 1], segment);
    }
    for (const [index, point] of asset.points.entries()) for (let axis = 0; axis < 3; axis++) assert.equal(positions.array[index * 3 + axis], Math.fround(point[axis]));
    let meshes = 0; scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes++; }); assert.equal(meshes, 0);
    assert.equal(line.geometry.getAttribute('normal'), undefined); assert.equal(JSON.stringify(asset), before);
    assert.deepEqual(line.geometry.boundingBox!.min.toArray(), [1, 1, 101]); assert.deepEqual(line.geometry.boundingBox!.max.toArray(), [298, 298, 298]);
  } finally { line.geometry.dispose(); line.material.dispose(); }
});

test('polyline scenes reject unowned assets and a matching clone of the original atlas instead of guessing identities', async () => {
  const asset = await fixture();
  assert.throws(() => buildSourcePolylineScene(structuredClone(asset.atlas), asset), /exact source atlas/);
  assert.throws(() => buildSourcePolylineScene(asset.atlas, structuredClone(asset)), /parser-produced/);
  assert.throws(() => buildSourcePolylineScene(asset.atlas, { atlas: asset.atlas, points: asset.points, paths: asset.paths }), /parser-produced/);
  assert.throws(() => buildLocalTraceScene(asset.atlas, asset as never), /parser-produced local trace/);
});

test('display recentering preserves zero-based path identity and original source coordinates without generating surfaces', async () => {
  const asset = await fixture(), before = JSON.stringify(asset);
  const scene = buildSourcePolylineScene(asset.atlas, asset), line = scene.children[0]; assert.ok(line instanceof THREE.LineSegments);
  const material = line.material; assert.ok(material instanceof THREE.LineBasicMaterial);
  try {
    scene.position.set(-100, -100, -100); scene.rotation.z = Math.PI / 2; scene.updateMatrixWorld(true);
    const ids = line.userData.vertexSourcePointIndices, paths = line.userData.sourcePolylineSegmentStarts;
    const positions = line.geometry.getAttribute('position');
    const prior = Array.from({ length: positions.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(line.matrixWorld));
    const { previousGeometry } = recenterRegionGeometry(line); previousGeometry.dispose(); line.updateWorldMatrix(true, false);
    const centered = line.geometry.getAttribute('position');
    for (let index = 0; index < centered.count; index++) assert.ok(new THREE.Vector3().fromBufferAttribute(centered, index).applyMatrix4(line.matrixWorld).distanceTo(prior[index]) < 0.0001);
    assert.equal(line.userData.vertexSourcePointIndices, ids); assert.equal(line.userData.sourcePolylineSegmentStarts, paths);
    assert.equal(JSON.stringify(asset), before); assert.equal(line.geometry.index!.count, 3752);
  } finally { line.geometry.dispose(); material.dispose(); }
});
