import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { parseLocalTrace } from '../src/domain/local-trace';
import { loadAtlasScene } from '../src/viewer/atlas-loader';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';
import { atlasAssetBytes, atlasAssetSha256 } from '../src/domain/atlas-asset';
import { disposeRegion } from '../src/viewer/region-objects';
import { renderDiagnostics } from '../src/viewer/viewer-diagnostics';

test('local scene loading uses parser memory without fetching source bytes or inventing surface diagnostics', async () => {
  const result = await parseLocalTrace(new TextEncoder().encode('10 1 0 0 0 1 -1\n30 2 1 0 0 99 10\n20 3 1 1 0 0 30').buffer);
  assert.ok(result.ok && result.asset); const { asset } = result;
  const fetcher = (async () => { assert.fail('Local trace bytes must never be fetched or uploaded.'); }) as typeof fetch;
  const scene = await loadAtlasScene(asset.atlas, new AbortController().signal, fetcher, asset);
  assert.equal(scene.children.length, 1); const line = scene.children[0]; assert.ok(line instanceof THREE.LineSegments);
  assert.deepEqual(renderDiagnostics([line]), { meshes: 0, triangles: 0, traces: 1, samples: 3, segments: 2, isolatedSamples: 0 });
  assert.equal(atlasAssetBytes(asset.atlas), asset.atlas.statistics.assetBytes);
  assert.equal(atlasAssetSha256(asset.atlas), asset.atlas.statistics.assetSha256);
  assert.equal(buildAnatomyGroups(asset.atlas).ok, true);
  assert.equal(buildAnatomyGroups(structuredClone(asset.atlas)).ok, false);
  disposeRegion(line);
  await assert.rejects(loadAtlasScene(asset.atlas, new AbortController().signal, fetcher), /original local trace/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(loadAtlasScene(asset.atlas, aborted.signal, fetcher, asset), { name: 'AbortError' });
});
