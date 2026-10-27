import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const manifest = JSON.parse(await readFile(new URL('../public/atlas-hindlimb/atlas.json', import.meta.url), 'utf8'));

test('hindlimb provenance keeps the adult regional specimen and source frame independent', () => {
  assert.equal(manifest.id, 'charles2016-hindlimb-v1');
  assert.equal(manifest.coordinateFrame.id, 'charles2016-hindlimb-prc-native-v1');
  assert.equal(manifest.coordinateFrame.sourceToAssetScale, 0.001);
  assert.equal(manifest.coordinateFrame.physicalCalibrationVerified, false);
  assert.equal(manifest.coordinateFrame.anatomicalOrientationVerified, false);
  assert.equal(manifest.coordinateFrame.registrationToDigimouse, null);
  assert.equal(manifest.source.license, 'CC-BY-4.0');
  assert.equal(manifest.source.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(manifest.source.pdfSha256, 'aadb7a020f3f9ffc1c8b91f3d8e5f9f2a1eef95d24b0816b69ac4f878637ac47');
  assert.equal(manifest.source.decoderJsonSha256, '0eda5effc49a460fbc89de070baa5d48c940c5f5b0dab1319f5d4f1342629e8c');
  assert.equal(manifest.specimen.sex, 'female');
  assert.equal(manifest.specimen.strain, 'C57BL/6');
  assert.deepEqual(manifest.specimen.age, { value: 117, unit: 'days' });
  assert.deepEqual(manifest.specimen.mass, { value: 24.9, unit: 'g' });
  assert.equal(manifest.structures.length, 44);
  assert.deepEqual(manifest.structures.map((entry: { id: string }) => entry.id).sort(),
    Array.from({ length: 44 }, (_, index) => `charles2016-hindlimb:${index}`).sort());
  const aggregate = manifest.structures.find((entry: { id: string }) => entry.id === 'charles2016-hindlimb:20');
  assert.equal(aggregate.sourceLabel, 'Tibia/Fibula');
});

test('Three.js loads all 44 source-labelled hindlimb meshes without changing their rest transforms', async () => {
  const bytes = await readFile(new URL(`../public${manifest.assetUrl}`, import.meta.url));
  assert.equal(bytes.byteLength, manifest.statistics.glbBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.statistics.glbSha256);
  const loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const meshes: THREE.Mesh[] = [];
  loaded.scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
  assert.equal(meshes.length, 44);
  assert.deepEqual(meshes.map((mesh) => mesh.userData.structureId).sort(),
    manifest.structures.map((entry: { id: string }) => entry.id).sort());
  let totalTriangles = 0;
  for (const mesh of meshes) {
    const region = manifest.structures.find((entry: { id: string }) => entry.id === mesh.userData.structureId);
    assert.ok(region);
    assert.equal(mesh.userData.sourceName, region.sourceLabel);
    assert.equal(mesh.userData.sourceTessellationIndex, region.sourceTessellationIndex);
    mesh.updateWorldMatrix(true, false);
    assert.ok(mesh.matrixWorld.equals(new THREE.Matrix4()), region.id);
    assert.equal(mesh.geometry.getAttribute('position').count, region.geometry.vertices);
    assert.equal(mesh.geometry.index!.count / 3, region.geometry.triangles);
    assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(mesh.material.color.toArray()[channel] - region.sourceDiffuseLinear[channel]) < 1e-6, region.id);
    }
    totalTriangles += region.geometry.triangles;
    const bounds = new THREE.Box3().setFromObject(mesh);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(bounds.min.getComponent(axis) - region.geometry.boundsMeters[0][axis]) < 1e-8);
      assert.ok(Math.abs(bounds.max.getComponent(axis) - region.geometry.boundsMeters[1][axis]) < 1e-8);
    }
    const normals = mesh.geometry.getAttribute('normal');
    for (let index = 0; index < normals.count; index++) {
      const length = Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index));
      assert.ok(Number.isFinite(length) && Math.abs(length - 1) < 1e-5, region.id);
    }
    mesh.geometry.dispose();
    for (const material of [mesh.material].flat()) material.dispose();
  }
  assert.equal(totalTriangles, 664210);
});
