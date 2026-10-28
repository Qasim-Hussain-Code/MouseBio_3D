import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { parseLocalTrace, type LocalTraceAsset } from '../src/domain/local-trace';
import type { Atlas } from '../src/domain/types';
import { buildLocalTraceScene } from '../src/viewer/local-trace-scene';

const BRANCH = [
  '900 3 2.123456789 0.25 -0.5 50 100',
  '100 1 0 0 0 99 -1',
  '7 2 0 3.234567891 1.25 0.5 100',
  '2 4 4.987654321 1.5 -0.5 0.125 900',
].join('\n');
const FOREST = [
  '42 1 0 0 0 100 -1',
  '999 1 100 200 300 1 -1',
  '7 2 1 0 0 200 42',
  '88 7 1 0 0 0.5 7',
  '8 4 1.00000001 0 0 0.001 7',
  '100 3 10 0 0 2 -1',
  '101 3 11 0 0 2 100',
].join('\n');

async function parsed(text: string): Promise<LocalTraceAsset> {
  const result = await parseLocalTrace(new TextEncoder().encode(text).buffer as ArrayBuffer);
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.ok(result.asset);
  return result.asset;
}
function onlyLine(scene: THREE.Group): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  assert.equal(scene.children.length, 1);
  const object = scene.children[0];
  assert.ok(object instanceof THREE.LineSegments && object.material instanceof THREE.LineBasicMaterial);
  return object as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}
function dispose(scene: THREE.Group) {
  const object = onlyLine(scene);
  object.geometry.dispose(); object.material.dispose();
}

test('parser-produced branching rows retain numeric source coordinates and each explicit child-parent pair in file order', async () => {
  const asset = await parsed(BRANCH);
  const before = JSON.stringify(asset);
  const scene = buildLocalTraceScene(asset.atlas, asset);
  try {
    const object = onlyLine(scene), positions = object.geometry.getAttribute('position');
    assert.equal(positions.count, 4);
    assert.ok(positions.array instanceof Float32Array);
    assert.deepEqual([...object.geometry.index!.array], [0, 1, 2, 1, 3, 0]);
    let error = 0;
    for (const [index, node] of asset.nodes.entries()) for (let axis = 0; axis < 3; axis++) {
      const actual: number = positions.array[index * 3 + axis];
      assert.equal(actual, Math.fround(node[axis + 2]));
      error = Math.max(error, Math.abs(actual - node[axis + 2]));
    }
    assert.ok(error > 0);
    assert.equal(error, asset.atlas.statistics.maxFloat32PositionError);
    assert.equal(object.name, asset.atlas.structures[0].meshNode);
    assert.deepEqual(object.userData, { structureId: asset.atlas.structures[0].id, sourceSampleCount: 4,
      sourceParentLinks: 3, isolatedSourceSamples: 0, vertexSourceIds: [900, 100, 7, 2] });
    scene.updateWorldMatrix(true, true);
    assert.ok(scene.matrixWorld.equals(new THREE.Matrix4()));
    assert.ok(object.matrixWorld.equals(new THREE.Matrix4()));
    assert.equal(asset.atlas.coordinateFrame.sourceUnits, 'unknown');
    assert.equal(asset.atlas.coordinateFrame.assetUnits, 'unknown');
    assert.equal(asset.atlas.coordinateFrame.sourceToAssetScale, 1);
    assert.equal(JSON.stringify(asset), before);
  } finally { dispose(scene); }
});

test('forest roots create no edges and isolated samples cannot distort the rendered bounds', async () => {
  const asset = await parsed(FOREST);
  const scene = buildLocalTraceScene(asset.atlas, asset);
  try {
    const object = onlyLine(scene), positions = object.geometry.getAttribute('position'), indices = object.geometry.index!;
    assert.equal(asset.nodes.length, 7);
    assert.equal(positions.count, 6);
    assert.deepEqual(object.userData.vertexSourceIds, [42, 7, 88, 8, 100, 101]);
    assert.equal(object.userData.sourceSampleCount, 7); assert.equal(object.userData.isolatedSourceSamples, 1);
    assert.equal(asset.atlas.statistics.isolatedSamples, 1);
    assert.deepEqual([...indices.array], [1, 0, 2, 1, 3, 1, 5, 4]);
    const sourcePairs = [...indices.array].map(index => object.userData.vertexSourceIds[index]);
    assert.deepEqual(sourcePairs, [7, 42, 88, 7, 8, 7, 101, 100]);
    assert.equal(indices.count / 2, asset.atlas.statistics.parentLinks);
    assert.equal(asset.atlas.statistics.roots, 3); assert.equal(asset.atlas.statistics.components, 3);
    assert.equal(asset.atlas.statistics.zeroLengthEdges, 1); assert.equal(asset.atlas.statistics.float32CollapsedEdges, 1);
    assert.notEqual(indices.getX(2), indices.getX(3), 'Coincident samples keep separate source indices.');
    assert.equal(positions.getX(indices.getX(2)), positions.getX(indices.getX(3)));
    assert.equal(positions.getX(indices.getX(4)), positions.getX(indices.getX(5)));
    assert.deepEqual(asset.atlas.statistics.boundsSourceUnits, [[0, 0, 0], [100, 200, 300]]);
    assert.deepEqual(asset.atlas.statistics.displayBoundsSourceUnits, [[0, 0, 0], [11, 0, 0]]);
    assert.ok(object.geometry.boundingBox && object.geometry.boundingSphere);
    assert.deepEqual(object.geometry.boundingBox.min.toArray(), [0, 0, 0]);
    assert.deepEqual(object.geometry.boundingBox.max.toArray(), [11, 0, 0]);
    assert.deepEqual(object.geometry.boundingSphere.center.toArray(), [5.5, 0, 0]);
    assert.equal(object.geometry.boundingSphere.radius, 5.5);
    object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere();
    assert.deepEqual(object.geometry.boundingBox.max.toArray(), [11, 0, 0]);
    assert.equal(object.geometry.boundingSphere.radius, 5.5);
    for (const index of indices.array) {
      assert.ok(object.geometry.boundingSphere.containsPoint(new THREE.Vector3().fromBufferAttribute(positions, index)));
    }
  } finally { dispose(scene); }
});

test('type codes and radii remain metadata without normals, variable widths, point glyphs or generated surfaces', async () => {
  const first = await parsed(BRANCH);
  const changedText = first.nodes.map((row, index) => [row[0], 99 + index, row[2], row[3], row[4], 100000 + index, row[6]].join(' ')).join('\n');
  const second = await parsed(changedText);
  const firstScene = buildLocalTraceScene(first.atlas, first), secondScene = buildLocalTraceScene(second.atlas, second);
  try {
    const a = onlyLine(firstScene), b = onlyLine(secondScene);
    assert.deepEqual([...a.geometry.getAttribute('position').array], [...b.geometry.getAttribute('position').array]);
    assert.deepEqual([...a.geometry.index!.array], [...b.geometry.index!.array]);
    assert.equal(a.material.linewidth, 1); assert.equal(b.material.linewidth, 1);
    assert.deepEqual(Object.keys(a.geometry.attributes), ['position']);
    assert.equal(a.geometry.getAttribute('normal'), undefined);
    const kinds: string[] = [];
    firstScene.traverse((object) => { kinds.push(object.type); assert.equal(object instanceof THREE.Mesh || object instanceof THREE.Points, false); });
    assert.deepEqual(kinds, ['Group', 'LineSegments']);
    assert.equal(first.nodes[0][1], 3); assert.equal(first.nodes[0][5], 50);
    assert.equal(second.nodes[0][1], 99); assert.equal(second.nodes[0][5], 100000);
  } finally { dispose(firstScene); dispose(secondScene); }
});

test('the culling sphere does not impose a different camera numeric-range gate from the accepted endpoint bounds', async () => {
  const asset = await parsed([
    '1 1 0 0 0 1 -1', '2 3 1e-42 0 0 1 1', '3 3 -1e-42 0 0 1 1',
    '4 3 0 1e-42 0 1 1', '5 3 0 -1e-42 0 1 1', '6 3 0 0 1e-42 1 1', '7 3 0 0 -1e-42 1 1',
  ].join('\n'));
  const scene = buildLocalTraceScene(asset.atlas, asset);
  try {
    const geometry = onlyLine(scene).geometry;
    const boxRadius = geometry.boundingBox!.getSize(new THREE.Vector3()).length() / 2;
    assert.ok(Math.fround(boxRadius / 2000) > 0);
    assert.equal(Math.fround(geometry.boundingSphere!.radius / 2000), 0);
    assert.equal(geometry.index!.count, 12);
  } finally { dispose(scene); }
});

test('forged assets and substituted atlases are rejected even when source values and hashes match', async () => {
  const asset = await parsed(BRANCH), separatelyParsed = await parsed(BRANCH);
  assert.equal(asset.atlas.id, separatelyParsed.atlas.id);
  assert.notEqual(asset.atlas, separatelyParsed.atlas);
  for (const forged of [undefined, { atlas: asset.atlas, nodes: asset.nodes }, structuredClone(asset), Object.create(asset)]) {
    assert.throws(() => buildLocalTraceScene(asset.atlas, forged as LocalTraceAsset), /parser-produced/);
  }
  for (const replacement of [structuredClone(asset.atlas), separatelyParsed.atlas,
    { ...asset.atlas, coordinateFrame: { ...asset.atlas.coordinateFrame, sourceUnits: 'mm', sourceToAssetScale: 0.001 } }]) {
    assert.throws(() => buildLocalTraceScene(replacement as Atlas, asset), /exact atlas/);
  }
  assert.throws(() => buildLocalTraceScene(asset.atlas, separatelyParsed), /exact atlas/);
});

test('scene resources are independent and disposing one preserves the asset and another scene', async () => {
  const asset = await parsed(BRANCH), before = JSON.stringify(asset);
  const firstScene = buildLocalTraceScene(asset.atlas, asset), secondScene = buildLocalTraceScene(asset.atlas, asset);
  const first = onlyLine(firstScene), second = onlyLine(secondScene);
  assert.notEqual(first.geometry, second.geometry); assert.notEqual(first.material, second.material);
  assert.notEqual(first.geometry.getAttribute('position').array, second.geometry.getAttribute('position').array);
  assert.notEqual(first.geometry.index!.array, second.geometry.index!.array);
  assert.notEqual(first.geometry.boundingBox, second.geometry.boundingBox);
  assert.notEqual(first.geometry.boundingSphere, second.geometry.boundingSphere);
  assert.notEqual(first.userData.vertexSourceIds, second.userData.vertexSourceIds);
  assert.ok(Object.isFrozen(first.userData.vertexSourceIds));
  const secondPositions = [...second.geometry.getAttribute('position').array];
  first.geometry.getAttribute('position').setX(0, -12345); first.geometry.index!.setX(0, 1);
  let firstGeometry = 0, firstMaterial = 0, secondGeometry = 0, secondMaterial = 0;
  first.geometry.addEventListener('dispose', () => firstGeometry++);
  first.material.addEventListener('dispose', () => firstMaterial++);
  second.geometry.addEventListener('dispose', () => secondGeometry++);
  second.material.addEventListener('dispose', () => secondMaterial++);
  dispose(firstScene);
  assert.deepEqual([firstGeometry, firstMaterial, secondGeometry, secondMaterial], [1, 1, 0, 0]);
  assert.deepEqual([...second.geometry.getAttribute('position').array], secondPositions);
  assert.deepEqual([...second.geometry.index!.array], [0, 1, 2, 1, 3, 0]);
  assert.equal(JSON.stringify(asset), before);
  dispose(secondScene);
  assert.deepEqual([secondGeometry, secondMaterial], [1, 1]);
});
