import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import type { Atlas } from '../src/domain/types';
import { atlasAssetBytes, atlasAssetFormat, atlasAssetSha256 } from '../src/domain/atlas-asset';
import { parseNativePly } from '../src/viewer/native-ply';
import { loadAtlasScene } from '../src/viewer/atlas-loader';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-ema147/atlas.json', import.meta.url), 'utf8')) as Atlas;
const data = await readFile(new URL('../public/atlas-ema147/ema147-native.ply', import.meta.url));
const bytes = () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
const headerBytes = data.indexOf('end_header\n') + 'end_header\n'.length;
function dispose(group: THREE.Group) {
  group.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of [object.material].flat()) material.dispose(); } });
}

test('the actual PLY loads all 77 source surfaces without a metric scale or source-frame transform', () => {
  assert.equal(createHash('sha256').update(data).digest('hex'), atlasAssetSha256(atlas));
  assert.equal(atlasAssetBytes(atlas), data.length);
  assert.equal(atlasAssetFormat(atlas), 'ply-native-v1');
  const scene = parseNativePly(bytes(), atlas);
  try {
    scene.updateWorldMatrix(true, true);
    assert.equal(scene.children.length, 77);
    let vertices = 0, triangles = 0;
    for (const [index, object] of scene.children.entries()) {
      assert.ok(object instanceof THREE.Mesh);
      const mesh = object as THREE.Mesh;
      assert.equal(mesh.userData.structureId, atlas.structures[index].id);
      assert.equal(mesh.userData.sourceRegionIndex, index);
      assert.equal(mesh.userData.sourceFile, (atlas.structures[index] as unknown as { sourceFile: string }).sourceFile);
      assert.ok(mesh.matrixWorld.equals(new THREE.Matrix4()));
      assert.ok(mesh.geometry.boundingBox && mesh.geometry.boundingSphere);
      vertices += mesh.geometry.getAttribute('position').count;
      triangles += mesh.geometry.index!.count / 3;
    }
    assert.equal(vertices, 185779); assert.equal(triangles, 374725);
    assert.equal(atlas.coordinateFrame.sourceToAssetScale, 1);
    assert.equal(atlas.coordinateFrame.sourceUnits, 'unknown');
  } finally { dispose(scene); }
});

test('PLY rejects header changes, cross-region vertices and faces, and invalid normals before displaying geometry', () => {
  const layout = bytes();
  const layoutRaw = new Uint8Array(layout);
  const property = data.indexOf('property float nx');
  layoutRaw[property + 'property float '.length] = 'q'.charCodeAt(0);
  assert.throws(() => parseNativePly(layout, atlas), /property layout/);
  const count = bytes();
  const countOffset = data.indexOf('element vertex 185779') + 'element vertex '.length;
  new Uint8Array(count).set(new TextEncoder().encode('999999'), countOffset);
  assert.throws(() => parseNativePly(count, atlas), /binary size/);
  for (const modify of [
    (view: DataView) => view.setUint32(headerBytes + 24, 76, true),
    (view: DataView) => view.setUint32(headerBytes + 185779 * 28 + 1, 185778, true),
    (view: DataView) => view.setFloat32(headerBytes + 12, NaN, true),
    (view: DataView) => { view.setFloat32(headerBytes + 12, 0, true); view.setFloat32(headerBytes + 16, 0, true); view.setFloat32(headerBytes + 20, 0, true); },
  ]) {
    const malformed = bytes(); modify(new DataView(malformed));
    assert.throws(() => parseNativePly(malformed, atlas));
  }
  assert.throws(() => parseNativePly(bytes().slice(0, -1), atlas), /source, unknown units|binary size/);
});

test('native-unit identity, source labels and generic asset binding cannot be replaced by an assumed scale or GLB hash', () => {
  for (const alter of [
    (value: Atlas) => { value.coordinateFrame.sourceToAssetScale = 0.00008; },
    (value: Atlas) => { value.coordinateFrame.unitsVerified = true; },
    (value: Atlas) => { value.source.archiveSha256 = '0'.repeat(64); },
    (value: Atlas) => { value.structures[0].id = 'ema147:EMAPA:1'; },
    (value: Atlas) => { (value.structures[0] as unknown as { sourceFile: string }).sourceFile = 'Surfaces/reference.stl'; },
  ]) {
    const changed = structuredClone(atlas); alter(changed);
    assert.throws(() => parseNativePly(bytes(), changed));
  }
  const ambiguous = structuredClone(atlas); ambiguous.statistics.glbSha256 = atlas.statistics.assetSha256;
  assert.equal(atlasAssetSha256(ambiguous), null);
  assert.equal(atlasAssetFormat({ ...atlas, assetFormat: 'unknown' }), null);
});

test('the registered PLY request stays local, bounded and checksum-verified', async () => {
  let requests = 0;
  const fetcher = (async (input: RequestInfo | URL, options?: RequestInit) => {
    requests++; assert.equal(input, '/atlas-ema147/ema147-native.ply');
    assert.equal(options?.redirect, 'error'); assert.equal(options?.credentials, 'same-origin');
    return new Response(new Uint8Array(data));
  }) as typeof fetch;
  const scene = await loadAtlasScene(atlas, new AbortController().signal, fetcher);
  dispose(scene); assert.equal(requests, 1);
  const wrong = structuredClone(atlas); wrong.statistics.assetSha256 = '0'.repeat(64);
  await assert.rejects(loadAtlasScene(wrong, new AbortController().signal, fetcher), /checksum/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(loadAtlasScene(atlas, abort.signal, fetcher), /Aborted/);
  assert.equal(requests, 2);
});

test('the common scene loader retains the existing GLB reference inventory', async () => {
  const legacy = JSON.parse(await readFile(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const raw = await readFile(new URL('../public/atlas/digimouse.glb', import.meta.url));
  const scene = await loadAtlasScene(legacy, new AbortController().signal, (async () => new Response(new Uint8Array(raw))) as typeof fetch);
  try {
    let meshes = 0;
    scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes++; });
    assert.equal(meshes, 17);
  } finally { dispose(scene); }
});
