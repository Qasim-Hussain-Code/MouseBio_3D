import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import { loadAtlasScene } from '../src/viewer/atlas-loader';
import { renderDiagnostics } from '../src/viewer/viewer-diagnostics';
import { disposeRegion } from '../src/viewer/region-objects';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';
import { buildReferenceCatalog, validateReferenceAtlas } from '../src/domain/atlas-catalog';
import { atlasAssetBytes, atlasAssetFormat, atlasAssetSha256 } from '../src/domain/atlas-asset';
import type { Atlas } from '../src/domain/types';

const original = JSON.parse(await readFile(new URL('../public/atlas-neuron/atlas.json', import.meta.url), 'utf8')) as Atlas;
const bytes = await readFile(new URL('../public/atlas-neuron/nmo130632-standardized.swc.txt', import.meta.url));

test('bundled neuronal loader binds same-origin bytes and renders parent lines without triangle claims', async () => {
  const atlas = structuredClone(original); const requests: string[] = [];
  const fetcher = (async (input, options) => {
    requests.push(String(input)); assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.redirect, 'error');
    return new Response(bytes);
  }) as typeof fetch;
  assert.equal(atlasAssetFormat(atlas), 'swc-native-v1');
  assert.equal(atlasAssetBytes(atlas), bytes.length);
  assert.equal(atlasAssetSha256(atlas), original.statistics.assetSha256);
  const scene = await loadAtlasScene(atlas, new AbortController().signal, fetcher);
  assert.deepEqual(requests, [original.assetUrl]);
  const line = scene.children[0]; assert.ok(line instanceof THREE.LineSegments);
  assert.deepEqual(renderDiagnostics([line]), { meshes: 0, triangles: 0, traces: 1, samples: 11650, segments: 11649, isolatedSamples: 0 });
  assert.deepEqual(buildAnatomyGroups(atlas).groups[0].structureIds, ['neuromorpho:130632']);
  disposeRegion(line);
  const catalog = buildReferenceCatalog(JSON.parse(await readFile(new URL('../data/anatomy-references.json', import.meta.url), 'utf8')));
  assert.equal(catalog.ok, true);
  assert.equal(catalog.catalog.length, 5);
  assert.equal(validateReferenceAtlas(catalog.catalog.find((entry) => entry.id === atlas.id)!, atlas).ok, true);
});

test('invalid source bindings prevent fetching and aborted or modified bodies cannot load', async () => {
  for (const mutate of [(a: Atlas) => { a.source.sourceSha256 = 'a'.repeat(64); },
    (a: Atlas) => { a.coordinateFrame.sourceUnits = 'micrometres'; },
    (a: Atlas) => { a.assetUrl = 'https://example.org/file.txt'; },
    (a: Atlas) => { a.statistics.glbBytes = 424092; }]) {
    const atlas = structuredClone(original); mutate(atlas);
    const neverFetch = (async () => assert.fail('Invalid source must not fetch.')) as typeof fetch;
    await assert.rejects(loadAtlasScene(atlas, new AbortController().signal, neverFetch));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadAtlasScene(structuredClone(original), controller.signal), { name: 'AbortError' });
  const changed = Uint8Array.from(bytes); changed[30] ^= 1;
  const fetcher = (async () => new Response(changed)) as typeof fetch;
  await assert.rejects(loadAtlasScene(structuredClone(original), new AbortController().signal, fetcher), /checksum/);
});
