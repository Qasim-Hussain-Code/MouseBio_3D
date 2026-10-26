import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const manifest = JSON.parse(await readFile(new URL('../public/atlas-volume/atlas.json', import.meta.url), 'utf8'));
const detail = JSON.parse(await readFile(new URL('../public/atlas-volume/detail-index.json', import.meta.url), 'utf8'));

async function loadAsset(assetUrl: string, checksum: string) {
  const bytes = await readFile(new URL(`../public${assetUrl}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum);
  return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
}

function regionMeshes(scene: THREE.Group) {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
  return meshes;
}

function verifyBounds(mesh: THREE.Mesh, expected: number[][]) {
  const box = new THREE.Box3().setFromObject(mesh);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(box.min.getComponent(axis) - expected[0][axis]) < 1e-8);
    assert.ok(Math.abs(box.max.getComponent(axis) - expected[1][axis]) < 1e-8);
  }
}

test('Three.js loads all21 registered-volume source regions in their separate documented frame', async () => {
  const model = await loadAsset(manifest.assetUrl, manifest.statistics.glbSha256);
  const meshes = regionMeshes(model.scene);
  assert.equal(meshes.length, 21);
  assert.deepEqual(meshes.map((mesh) => mesh.userData.structureId).sort(), manifest.structures.map((entry: { id: string }) => entry.id).sort());
  assert.equal(manifest.coordinateFrame.id, 'digimouse-registered-voxel-native-v1');
  assert.equal(manifest.coordinateFrame.voxelToTetrahedralAffine, null);
  for (const mesh of meshes) {
    const expected = manifest.structures.find((entry: { id: string }) => entry.id === mesh.userData.structureId);
    assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
    assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
    assert.equal(mesh.geometry.index!.count / 3, expected.geometry.triangles);
    verifyBounds(mesh, expected.geometry.boundsMeters);
    assert.match(expected.color, /^#[0-9a-f]{6}$/i);
    assert.equal(expected.defaultOpacity, expected.id === 'digimouse-volume:1' ? 0.06 : expected.id === 'digimouse-volume:2' ? 0.14 : 1);
    mesh.geometry.dispose();
    for (const material of [mesh.material].flat()) material.dispose();
  }
});

test('every progressive detail GLB loads one matching source region without a frame-changing transform', async () => {
  assert.equal(detail.assets.length, 19);
  assert.deepEqual(detail.unavailable.map((entry: { structureId: string }) => entry.structureId).sort(), ['digimouse-volume:1', 'digimouse-volume:2']);
  for (const asset of detail.assets) {
    assert.equal(asset.coordinateFrameId, manifest.coordinateFrame.id);
    assert.deepEqual(asset.processingVoxelSpacingMm, [0.2, 0.2, 0.2]);
    const model = await loadAsset(asset.assetUrl, asset.glbSha256);
    const meshes = regionMeshes(model.scene);
    assert.equal(meshes.length, 1);
    const mesh = meshes[0];
    assert.equal(mesh.userData.structureId, asset.structureId);
    assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
    assert.deepEqual(mesh.quaternion.toArray(), [0, 0, 0, 1]);
    assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
    assert.equal(mesh.geometry.index!.count / 3, asset.geometry.triangles);
    verifyBounds(mesh, asset.geometry.boundsMeters);
    mesh.geometry.dispose();
    for (const material of [mesh.material].flat()) material.dispose();
  }
});
