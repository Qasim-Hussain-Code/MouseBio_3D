import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import type { Atlas } from '../src/domain/types';
import { buildRegionDetailAssets } from '../src/viewer/region-detail-registry';
import { fetchBoundGlb, inspectInternalGlb, loadRegionDetailGeometry, RegionDetailController } from '../src/viewer/region-detail';
import { recenterMeshGeometry } from '../src/viewer/scene-utils';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-volume/atlas.json', import.meta.url), 'utf8')) as Atlas;
const index = JSON.parse(await readFile(new URL('../public/atlas-volume/detail-index.json', import.meta.url), 'utf8'));
const details = buildRegionDetailAssets(index, atlas);
const heart = details.assets.find((asset) => asset.structureId === 'digimouse-volume:9')!;
const lungs = details.assets.find((asset) => asset.structureId === 'digimouse-volume:21')!;
const heartBytes = await readFile(new URL(`../public${heart.assetUrl}`, import.meta.url));
const localFetcher = (async () => new Response(Uint8Array.from(heartBytes))) as typeof fetch;

test('detail registry preserves all explicit source bindings and unavailable regions', () => {
  assert.equal(details.ok, true, details.errors.join(' '));
  assert.equal(details.assets.length, 19);
  assert.ok(details.assets.every((asset) => asset.atlasId === atlas.id && asset.coordinateFrameId === atlas.coordinateFrame.id
    && asset.atlasAssetSha256 === atlas.statistics.glbSha256));
  assert.equal(details.assets.some((asset) => ['digimouse-volume:1', 'digimouse-volume:2'].includes(asset.structureId)), false);
  for (const change of [
    (value: typeof index) => { value.coordinateFrame.id = 'wrong-frame'; },
    (value: typeof index) => { value.assets[0].assetUrl = 'https://example.org/region.glb'; },
    (value: typeof index) => { value.assets.push(value.assets[0]); },
    (value: typeof index) => { value.unavailable.pop(); },
  ]) {
    const invalid = structuredClone(index); change(invalid);
    assert.equal(buildRegionDetailAssets(invalid, atlas).ok, false);
  }
});

test('runtime loader verifies actual detail bytes, metadata and native geometry', async () => {
  const geometry = await loadRegionDetailGeometry(heart, atlas, new AbortController().signal, localFetcher);
  assert.equal(geometry.getAttribute('position').count, heart.geometry.vertices);
  assert.equal(geometry.index?.count, heart.geometry.triangles * 3);
  assert.ok(inspectInternalGlb(Uint8Array.from(heartBytes).buffer));
  geometry.dispose();
  await assert.rejects(fetchBoundGlb(heart.assetUrl, heart.glbBytes - 1, heart.glbSha256,
    new AbortController().signal, localFetcher), /exceeds/);
  await assert.rejects(fetchBoundGlb(heart.assetUrl, heart.glbBytes + 1, heart.glbSha256,
    new AbortController().signal, localFetcher), /byte count/);
  await assert.rejects(fetchBoundGlb(heart.assetUrl, heart.glbBytes, '0'.repeat(64),
    new AbortController().signal, localFetcher), /checksum/);
  await assert.rejects(loadRegionDetailGeometry({ ...heart, coordinateFrameId: 'wrong-frame' }, atlas,
    new AbortController().signal, localFetcher), /not bound/);
});

test('GLB external resources are rejected before a loader can request them', async () => {
  const bytes = Uint8Array.from(heartBytes);
  const view = new DataView(bytes.buffer);
  const length = view.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  document.buffers[0].uri = 'https://example.org/external.bin';
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const binary = bytes.slice(20 + length);
  const changed = new Uint8Array(20 + padded + binary.length);
  changed.set(bytes.subarray(0, 20)); changed.fill(32, 20, 20 + padded);
  changed.set(encoded, 20); changed.set(binary, 20 + padded);
  const header = new DataView(changed.buffer);
  header.setUint32(8, changed.length, true); header.setUint32(12, padded, true);
  assert.throws(() => inspectInternalGlb(changed.buffer), /external/);
  const hash = createHash('sha256').update(changed).digest('hex');
  await assert.rejects(fetchBoundGlb(heart.assetUrl, changed.length, hash, new AbortController().signal,
    (async () => new Response(changed)) as typeof fetch), /external/);
});

test('replacement preserves source registration, rest pivot and material, then restores base geometry', async () => {
  const display = new THREE.Group(); display.rotation.z = Math.PI / 2;
  const centered = new THREE.Group(); centered.position.set(-1, -2, -3); display.add(centered);
  const coarse = new THREE.BoxGeometry().translate(3, 4, 5);
  const mesh = new THREE.Mesh(coarse, new THREE.MeshStandardMaterial()); centered.add(mesh);
  recenterMeshGeometry(mesh); display.updateMatrixWorld(true);
  const preparedCoarse = mesh.geometry;
  const material = mesh.material;
  const position = mesh.position.clone();
  const sourceToLocal = mesh.matrixWorld.clone().invert().multiply(centered.matrixWorld);
  const rawFine = new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(3, 4, 5);
  const expected = new THREE.Vector3().fromBufferAttribute(rawFine.getAttribute('position'), 0).applyMatrix4(centered.matrixWorld);
  let fineDisposals = 0; rawFine.addEventListener('dispose', () => fineDisposals++);
  const controller = new RegionDetailController(atlas, () => ({ mesh, sourceToLocal }), () => {}, () => {}, async () => rawFine);
  await controller.request(heart, heart.structureId);
  const actual = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), 0).applyMatrix4(mesh.matrixWorld);
  assert.ok(actual.distanceTo(expected) < 1e-6);
  assert.deepEqual(mesh.position, position); assert.equal(mesh.material, material);
  await controller.request(undefined, heart.structureId);
  assert.equal(mesh.geometry, preparedCoarse); assert.equal(fineDisposals, 1);
  controller.dispose(); preparedCoarse.dispose(); coarse.dispose(); material.dispose();
});

test('latest request wins and stale or disposed fine geometry cannot replace the base', async () => {
  const meshes = new Map([heart, lungs].map((asset) => [asset.structureId, new THREE.Mesh(new THREE.BoxGeometry())]));
  const pending: { resolve: (geometry: THREE.BufferGeometry) => void; signal: AbortSignal }[] = [];
  const states: string[] = [];
  const controller = new RegionDetailController(atlas, (id) => ({ mesh: meshes.get(id)!, sourceToLocal: new THREE.Matrix4() }),
    () => {}, (state) => states.push(`${state.status}:${state.structureId}`), (_asset, _atlas, signal) => new Promise((resolve) => pending.push({ resolve, signal })));
  const first = controller.request(heart, heart.structureId);
  const second = controller.request(lungs, lungs.structureId);
  assert.equal(pending[0].signal.aborted, true);
  const latest = new THREE.BoxGeometry(); pending[1].resolve(latest); await second;
  assert.equal(meshes.get(lungs.structureId)!.geometry, latest);
  const stale = new THREE.BoxGeometry(); let disposed = 0; stale.addEventListener('dispose', () => disposed++);
  pending[0].resolve(stale); await first;
  assert.equal(disposed, 1); assert.equal(states.includes(`ready:${heart.structureId}`), false);
  controller.dispose();
  assert.notEqual(meshes.get(lungs.structureId)!.geometry, latest);
  for (const mesh of meshes.values()) { mesh.geometry.dispose(); [mesh.material].flat().forEach((material) => material.dispose()); }
});

test('a failed finer request retains the base and permits an explicit retry', async () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry()); const coarse = mesh.geometry;
  let attempts = 0;
  const controller = new RegionDetailController(atlas, () => ({ mesh, sourceToLocal: new THREE.Matrix4() }), () => {}, () => {}, async () => {
    if (++attempts === 1) throw new Error('Synthetic loading failure.');
    return new THREE.BoxGeometry();
  });
  await controller.request(heart, heart.structureId); assert.equal(mesh.geometry, coarse);
  await controller.request(heart, heart.structureId); assert.equal(attempts, 2); assert.notEqual(mesh.geometry, coarse);
  controller.dispose(); assert.equal(mesh.geometry, coarse); coarse.dispose(); [mesh.material].flat().forEach((material) => material.dispose());
});
