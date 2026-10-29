import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';
import type { Atlas } from '../src/domain/types';
import { loadAtlasScene } from '../src/viewer/atlas-loader';
import { renderDiagnostics } from '../src/viewer/viewer-diagnostics';
import { disposeRegion } from '../src/viewer/region-objects';
import { isSourcePolylineAtlas, parseSourcePolyline } from '../src/domain/source-polyline';

for (const [folder, filename, points, paths, segments] of [
  ['atlas-nerve', 'mousemapper-patch0-lines.json', 1940, 84, 1876],
  ['atlas-vascular', 'schmid2021-mvn1-lines.json', 575722, 12071, 563651],
] as const) {
  test(`${folder} loader retains exact ordered source lines, original topology and bounded local reads`, async () => {
    const atlas = JSON.parse(await readFile(new URL(`../public/${folder}/atlas.json`, import.meta.url), 'utf8')) as Atlas;
    const bytes = await readFile(new URL(`../public/${folder}/${filename}`, import.meta.url));
    const original = JSON.parse(bytes.toString()); const requests: string[] = [];
    const fetcher = (async (input, options) => {
      requests.push(String(input)); assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.redirect, 'error');
      return new Response(bytes);
    }) as typeof fetch;
    const scene = await loadAtlasScene(atlas, new AbortController().signal, fetcher);
    const line = scene.children[0]; assert.ok(line instanceof THREE.LineSegments);
    try {
      assert.deepEqual(requests, [atlas.assetUrl]);
      assert.deepEqual(renderDiagnostics([line]), { meshes: 0, triangles: 0, traces: 1, samples: points, segments, isolatedSamples: 0 });
      const material = line.material; assert.ok(material instanceof THREE.LineBasicMaterial); assert.equal(material.linewidth, 1);
      assert.equal(line.geometry.getAttribute('position').count, points); assert.equal(line.geometry.index!.count, segments * 2);
      assert.equal(line.userData.sourcePolylineIndices.length, paths);
      assert.equal(line.userData.sourceParentLinks, undefined); assert.equal(line.userData.vertexSourceIds, undefined);
      let segment = 0;
      for (const [pathId, path] of original.paths.entries() as ArrayIterator<[number, number[]]>) {
        assert.equal(line.userData.sourcePolylineSegmentStarts[pathId], segment);
        for (let row = 1; row < path.length; row++, segment++) {
          assert.equal(line.geometry.index!.getX(segment * 2), path[row - 1]);
          assert.equal(line.geometry.index!.getX(segment * 2 + 1), path[row]);
        }
      }
      assert.equal(segment, segments);
      if (folder === 'atlas-vascular') {
        const parsed = await parseSourcePolyline(new Uint8Array(bytes).buffer, structuredClone(atlas));
        assert.ok(parsed.ok && parsed.asset && parsed.asset.sourceGraph);
        assert.deepEqual(parsed.asset.sourceGraph, original.sourceGraph);
        assert.ok(Object.isFrozen(parsed.asset.sourceGraph.connectivity[0]));
        assert.equal(atlas.statistics.sourceGraphComponents, 1); assert.equal(atlas.statistics.sourceGraphCycleRank, 2904);
        assert.equal(atlas.statistics.components, 12071); assert.equal(atlas.statistics.zeroLengthSegments, 62);
        assert.equal(atlas.statistics.sourceEndpointMismatchPaths, 1261);
        assert.equal(atlas.coordinateFrame.sourceUnits, 'micrometres'); assert.equal(atlas.coordinateFrame.physicalCalibrationVerified, false);
      }
    } finally { disposeRegion(line); }
  });

  test(`${folder} rejects forged scientific claims before fetching, cancellation and body changes`, async () => {
    const original = JSON.parse(await readFile(new URL(`../public/${folder}/atlas.json`, import.meta.url), 'utf8')) as Atlas;
    for (const change of [(atlas: Atlas) => { atlas.coordinateFrame.physicalCalibrationVerified = true; },
      (atlas: Atlas) => { atlas.source.license = 'MIT'; }, (atlas: Atlas) => { atlas.statistics.assetBytes = 1; },
      (atlas: Atlas) => { atlas.source.sourceSha256 = 'a'.repeat(64); },
      (atlas: Atlas) => { atlas.structures[0].id = 'digimouse:1'; }]) {
      const altered = structuredClone(original); change(altered); assert.equal(isSourcePolylineAtlas(altered), false);
      await assert.rejects(loadAtlasScene(altered, new AbortController().signal, (async () => assert.fail('An unreviewed source must not fetch.')) as typeof fetch));
    }
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadAtlasScene(structuredClone(original), controller.signal, (async () => assert.fail('Cancelled source must not fetch.')) as typeof fetch), { name: 'AbortError' });
    const changed = await readFile(new URL(`../public/${folder}/${filename}`, import.meta.url)); changed[100] ^= 1;
    await assert.rejects(loadAtlasScene(structuredClone(original), new AbortController().signal, (async () => new Response(changed)) as typeof fetch), /checksum/);
  });
}
