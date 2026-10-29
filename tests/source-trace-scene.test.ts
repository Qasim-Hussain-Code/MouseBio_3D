import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { parseSourceTrace, type SourceTraceAsset } from '../src/domain/source-trace';
import type { Atlas } from '../src/domain/types';
import { buildSourceTraceScene } from '../src/viewer/source-trace-scene';
import { buildLocalTraceScene } from '../src/viewer/local-trace-scene';

async function fixture(): Promise<SourceTraceAsset> {
  const atlas = JSON.parse(await readFile(new URL('../public/atlas-neuron/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const body = await readFile(new URL('../public/atlas-neuron/nmo130632-standardized.swc.txt', import.meta.url));
  const result = await parseSourceTrace(new Uint8Array(body).buffer as ArrayBuffer, atlas);
  assert.equal(result.ok, true, result.errors.join(' ')); assert.ok(result.asset);
  return result.asset;
}

test('the measured source graph becomes one line reference without radii, surfaces or inferred links', async () => {
  const asset = await fixture(), before = JSON.stringify(asset);
  const scene = buildSourceTraceScene(asset.atlas, asset);
  assert.equal(scene.children.length, 1);
  const object = scene.children[0];
  assert.ok(object instanceof THREE.LineSegments);
  assert.ok(object.material instanceof THREE.LineBasicMaterial);
  try {
    const positions = object.geometry.getAttribute('position'), indices = object.geometry.index!;
    assert.equal(positions.count, 11650); assert.equal(indices.count, 11649 * 2);
    assert.equal(object.material.linewidth, 1);
    assert.equal(object.name, 'region_NMO_130632'); assert.equal(object.userData.structureId, 'neuromorpho:130632');
    assert.equal(object.userData.sourceSampleCount, 11650); assert.equal(object.userData.sourceParentLinks, 11649);
    assert.equal(object.userData.isolatedSourceSamples, 0);
    assert.deepEqual(object.userData.vertexSourceIds, asset.nodes.map((node) => node[0]));
    const indexById = new Map(asset.nodes.map((node, index) => [node[0], index]));
    let edge = 0;
    for (const [index, node] of asset.nodes.entries()) {
      for (let axis = 0; axis < 3; axis++) assert.equal(positions.array[index * 3 + axis], Math.fround(node[axis + 2]));
      if (node[6] !== -1) {
        assert.equal(indices.array[edge++], index);
        assert.equal(indices.array[edge++], indexById.get(node[6]));
      }
    }
    let meshes = 0; scene.traverse((child) => { if (child instanceof THREE.Mesh) meshes++; });
    assert.equal(meshes, 0); assert.equal(JSON.stringify(asset), before);
    assert.equal(asset.atlas.coordinateFrame.unitsVerified, false);
    assert.equal(asset.atlas.coordinateFrame.registrationToDigimouse, null);
  } finally { object.geometry.dispose(); object.material.dispose(); }
});

test('scene entry points require their own parser-produced asset and exact source manifest', async () => {
  const asset = await fixture();
  assert.throws(() => buildSourceTraceScene(structuredClone(asset.atlas), asset), /exact source atlas/);
  assert.throws(() => buildSourceTraceScene(asset.atlas, structuredClone(asset)), /parser-produced/);
  assert.throws(() => buildSourceTraceScene(asset.atlas, { atlas: asset.atlas, nodes: asset.nodes }), /parser-produced/);
  assert.throws(() => buildLocalTraceScene(asset.atlas, asset), /parser-produced local trace/);
});
