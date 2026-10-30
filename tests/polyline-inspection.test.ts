import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Atlas } from '../src/domain/types';
import { parseLocalTrace } from '../src/domain/local-trace';
import { parseSourcePolyline, type SourcePolylineAsset } from '../src/domain/source-polyline';
import { POLYLINE_POINT_PAGE_SIZE, POLYLINE_INCIDENT_PAGE_SIZE, createPolylineInspection, inspectPolylinePath,
  inspectPolylineVertex, isPolylineInspectionIndex, type PolylineInspectionIndex } from '../src/domain/polyline-inspection';

const assets = new Map<string, Promise<SourcePolylineAsset>>();
function source(kind: 'nerve' | 'vascular'): Promise<SourcePolylineAsset> {
  let asset = assets.get(kind);
  if (!asset) {
    asset = (async () => {
      const folder = kind === 'nerve' ? 'atlas-nerve' : 'atlas-vascular';
      const name = kind === 'nerve' ? 'mousemapper-patch0-lines.json' : 'schmid2021-mvn1-lines.json';
      const atlas = JSON.parse(await readFile(new URL(`../public/${folder}/atlas.json`, import.meta.url), 'utf8')) as Atlas;
      const bytes = await readFile(new URL(`../public/${folder}/${name}`, import.meta.url));
      const result = await parseSourcePolyline(new Uint8Array(bytes).buffer as ArrayBuffer, atlas);
      assert.ok(result.ok && result.asset, result.errors.join(' ')); return result.asset;
    })();
    assets.set(kind, asset);
  }
  return asset;
}
function index(asset: SourcePolylineAsset): PolylineInspectionIndex {
  const result = createPolylineInspection(asset); assert.ok(result.ok && result.index, result.errors.join(' ')); return result.index;
}

test('inspection capabilities preserve exact source binding and distinguish original edge IDs from nerve serialization indices', async () => {
  const nerve = await source('nerve'), vascular = await source('vascular');
  const nerveIndex = index(nerve), vascularIndex = index(vascular);
  for (const [asset, capability] of [[nerve, nerveIndex], [vascular, vascularIndex]] as const) {
    assert.equal(isPolylineInspectionIndex(capability), true); assert.equal(Object.isFrozen(capability), true);
    assert.equal(capability.atlasId, asset.atlas.id); assert.equal(capability.assetSha256, asset.atlas.statistics.assetSha256);
    assert.equal(capability.coordinateFrameId, asset.atlas.coordinateFrame.id); assert.equal(capability.structureId, asset.atlas.structures[0].id);
    assert.equal(capability.pathCount, asset.paths.length); assert.equal(capability.pointCount, asset.points.length);
    assert.equal(capability.firstPathId, 0); assert.equal(index(asset), capability);
    for (const name of ['points', 'paths', 'sourceGraph', 'connectivity', 'vertexCoordinates']) assert.equal(Object.hasOwn(capability, name), false);
    assert.equal(isPolylineInspectionIndex(structuredClone(capability)), false);
  }
  assert.equal(nerveIndex.pathIdBasis, 'zero-based-path-index'); assert.equal(nerveIndex.hasOriginalTopology, false); assert.equal(nerveIndex.firstVertexId, null);
  assert.equal(vascularIndex.pathIdBasis, 'source-edge-id'); assert.equal(vascularIndex.hasOriginalTopology, true); assert.equal(vascularIndex.firstVertexId, 0);
  assert.notEqual(nerveIndex.assetSha256, vascularIndex.assetSha256);
});

test('nerve paths retain every source point and original row navigation through bounded immutable pages', async () => {
  const asset = await source('nerve'), capability = index(asset);
  assert.equal(POLYLINE_POINT_PAGE_SIZE, 20);
  for (const [pathId, path] of asset.paths.entries()) {
    const reconstructed: number[] = [];
    for (let offset = 0; offset < path.length; offset += POLYLINE_POINT_PAGE_SIZE) {
      const result = inspectPolylinePath(capability, pathId, offset); assert.ok(result.ok && result.record);
      const record = result.record;
      assert.equal(record.pathId, pathId); assert.equal(record.pathRowIndex, pathId);
      assert.equal(record.previousPathId, pathId ? pathId - 1 : null); assert.equal(record.nextPathId, pathId + 1 < asset.paths.length ? pathId + 1 : null);
      assert.equal(record.pointCount, path.length); assert.equal(record.segmentCount, path.length - 1);
      assert.equal(record.pointOffset, offset); assert.equal(record.hasPreviousPointPage, offset > 0);
      assert.equal(record.hasNextPointPage, offset + record.points.length < path.length);
      assert.equal(Object.hasOwn(record, 'originalTopology'), false);
      assert.ok(record.points.length <= 20 && Object.isFrozen(record) && Object.isFrozen(record.points));
      for (const [pageRow, point] of record.points.entries()) {
        assert.equal(point.sourcePointIndex, path[offset + pageRow]); assert.deepEqual(point.coordinates, asset.points[point.sourcePointIndex]);
        assert.notEqual(point.coordinates, asset.points[point.sourcePointIndex]); assert.ok(Object.isFrozen(point) && Object.isFrozen(point.coordinates));
        reconstructed.push(point.sourcePointIndex);
      }
    }
    assert.deepEqual(reconstructed, path);
  }
  assert.equal(inspectPolylineVertex(capability, 0).ok, false, 'Polyline point positions do not create an unprovided source vertex graph.');
});

test('vascular paths retain explicit edge IDs and source endpoint order without reorienting sampled geometry', async () => {
  const asset = await source('vascular'), capability = index(asset), graph = asset.sourceGraph!;
  const byVertex = new Map(graph.vertexIds.map((id, row) => [id, row]));
  let mismatchRow = -1;
  for (const [row, path] of asset.paths.entries()) {
    const result = inspectPolylinePath(capability, graph.edgeIds[row]); assert.ok(result.ok && result.record?.originalTopology);
    const record = result.record, pair = graph.connectivity[row], topology = record.originalTopology;
    assert.ok(topology);
    assert.equal(record.pathRowIndex, row); assert.equal(record.pathId, graph.edgeIds[row]);
    assert.equal(record.previousPathId, graph.edgeIds[row - 1] ?? null); assert.equal(record.nextPathId, graph.edgeIds[row + 1] ?? null);
    assert.deepEqual(topology.endpoints.map((endpoint) => endpoint.vertexId), pair);
    for (let side = 0; side < 2; side++) {
      assert.deepEqual(topology.endpoints[side].coordinates, graph.vertexCoordinates[byVertex.get(pair[side])!]);
      assert.ok(Object.isFrozen(topology.endpoints[side]));
    }
    if (mismatchRow === -1 && (!asset.points[path[0]].every((coordinate, axis) => coordinate === graph.vertexCoordinates[byVertex.get(pair[0])!][axis])
      || !asset.points[path[path.length - 1]].every((coordinate, axis) => coordinate === graph.vertexCoordinates[byVertex.get(pair[1])!][axis]))) mismatchRow = row;
  }
  assert.ok(mismatchRow >= 0, 'The actual source retains ordered endpoint discrepancies.');
  const retained = inspectPolylinePath(capability, graph.edgeIds[mismatchRow]); assert.ok(retained.ok && retained.record?.originalTopology);
  assert.equal(retained.record.points[0].sourcePointIndex, asset.paths[mismatchRow][0]);
  assert.deepEqual(retained.record.originalTopology.endpoints.map((endpoint) => endpoint.vertexId), graph.connectivity[mismatchRow]);
  assert.equal(Object.hasOwn(retained.record, 'flowDirection'), false); assert.equal(Object.hasOwn(retained.record, 'length'), false);
});

test('original vascular vertices expose only explicitly incident paths in original edge-row order', async () => {
  const asset = await source('vascular'), capability = index(asset), graph = asset.sourceGraph!;
  assert.equal(POLYLINE_INCIDENT_PAGE_SIZE, 20);
  const expected = new Map(graph.vertexIds.map((id) => [id, [] as number[]]));
  for (const [row, pair] of graph.connectivity.entries()) for (const id of new Set(pair)) expected.get(id)!.push(graph.edgeIds[row]);
  for (const [row, vertexId] of graph.vertexIds.entries()) {
    const ids = expected.get(vertexId)!;
    const result = inspectPolylineVertex(capability, vertexId); assert.ok(result.ok && result.record);
    const record = result.record;
    assert.equal(record.vertexId, vertexId); assert.equal(record.vertexRowIndex, row); assert.deepEqual(record.coordinates, graph.vertexCoordinates[row]);
    assert.notEqual(record.coordinates, graph.vertexCoordinates[row]); assert.equal(record.incidentPathCount, ids.length);
    assert.deepEqual(record.incidentPathIds, ids.slice(0, 20)); assert.ok(record.incidentPathIds.length <= 20);
    assert.equal(record.previousVertexId, graph.vertexIds[row - 1] ?? null); assert.equal(record.nextVertexId, graph.vertexIds[row + 1] ?? null);
    assert.equal(record.hasPreviousPathPage, false); assert.equal(record.hasNextPathPage, ids.length > 20);
    assert.ok(Object.isFrozen(record) && Object.isFrozen(record.coordinates) && Object.isFrozen(record.incidentPathIds));
    for (const pathId of record.incidentPathIds) {
      const path = inspectPolylinePath(capability, pathId); assert.ok(path.ok && path.record?.originalTopology);
      const endpoint = path.record.originalTopology.endpoints.find((point) => point.vertexId === vertexId)!;
      assert.equal(endpoint.incidentPathCount, ids.length);
    }
  }
  const multi = [...expected].find(([, ids]) => ids.length > 1)!;
  const offset = inspectPolylineVertex(capability, multi[0], 1); assert.ok(offset.ok && offset.record);
  assert.equal(offset.record.pathOffset, 1); assert.equal(offset.record.hasPreviousPathPage, true);
  assert.deepEqual(offset.record.incidentPathIds, multi[1].slice(1, 21));
});

test('returned coordinates and topology are immutable defensive values, while overlapping path IDs remain source-specific', async () => {
  const nerve = await source('nerve'), vascular = await source('vascular');
  const nerveRecord = inspectPolylinePath(index(nerve), 0), vascularRecord = inspectPolylinePath(index(vascular), 0);
  assert.ok(nerveRecord.record && vascularRecord.record?.originalTopology);
  assert.notDeepEqual(nerveRecord.record.points[0].coordinates, vascularRecord.record.points[0].coordinates);
  assert.throws(() => (nerveRecord.record!.points as unknown[]).push({ sourcePointIndex: 1 }), TypeError);
  assert.throws(() => { (vascularRecord.record!.originalTopology!.endpoints[0].coordinates as unknown as number[])[0] = -999; }, TypeError);
  assert.deepEqual(inspectPolylinePath(index(vascular), 0).record, vascularRecord.record);
  assert.deepEqual(nerve.points[nerveRecord.record.points[0].sourcePointIndex], nerveRecord.record.points[0].coordinates);
});

test('forged or cloned source assets and capabilities cannot grant polyline inspection identity', async () => {
  const nerve = await source('nerve'), capability = index(nerve);
  const clone = structuredClone(capability);
  const smallGeneric = { atlas: nerve.atlas, points: [[0, 0, 0], [1, 0, 0]], paths: [[0, 1]] };
  for (const value of [null, {}, [], smallGeneric, structuredClone(nerve), { atlas: nerve.atlas, points: nerve.points, paths: nerve.paths }]) {
    const result = createPolylineInspection(value); assert.equal(result.ok, false); assert.equal(result.index, undefined); assert.ok(Object.isFrozen(result.errors));
  }
  const local = await parseLocalTrace(new TextEncoder().encode('1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n').buffer); assert.ok(local.asset);
  assert.equal(createPolylineInspection(local.asset).ok, false);
  for (const value of [null, {}, clone, { ...capability }]) {
    assert.equal(isPolylineInspectionIndex(value), false); assert.equal(inspectPolylinePath(value, 0).ok, false); assert.equal(inspectPolylineVertex(value, 0).ok, false);
  }
});

test('invalid source identifiers and point pages reject with fixed errors while zero-based IDs remain valid', async () => {
  const capability = index(await source('nerve'));
  assert.equal(inspectPolylinePath(capability, 0).ok, true);
  for (const id of [-1, 0.5, NaN, Infinity, '0', 1e20, {}, 84, 'PRIVATE_SYNTHETIC_MARKER']) {
    const result = inspectPolylinePath(capability, id); assert.equal(result.ok, false); assert.equal(result.record, undefined);
    assert.equal(result.errors.join(' ').includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
  const record = inspectPolylinePath(capability, 0).record!;
  for (const offset of [-1, 0.5, NaN, Infinity, record.pointCount, record.pointCount + 20]) {
    const result = inspectPolylinePath(capability, 0, offset); assert.equal(result.ok, false); assert.equal(result.record, undefined);
  }
  const tail = inspectPolylinePath(capability, 0, record.pointCount - 1); assert.ok(tail.record);
  assert.equal(tail.record.points.length, 1); assert.equal(tail.record.hasNextPointPage, false);
  assert.deepEqual(inspectPolylinePath(capability, 0).record, record);
});

test('invalid vertex and incident-path pages cannot guess a source graph junction or echo arbitrary values', async () => {
  const capability = index(await source('vascular'));
  assert.equal(inspectPolylineVertex(capability, 0).ok, true);
  for (const id of [-1, 0.5, NaN, Infinity, '0', 9168, {}, 'PRIVATE_SYNTHETIC_MARKER']) {
    const result = inspectPolylineVertex(capability, id); assert.equal(result.ok, false); assert.equal(result.record, undefined);
    assert.equal(result.errors.join(' ').includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
  const record = inspectPolylineVertex(capability, 0).record!;
  for (const offset of [-1, 0.5, NaN, Infinity, record.incidentPathCount, record.incidentPathCount + 20]) {
    const result = inspectPolylineVertex(capability, 0, offset); assert.equal(result.ok, false); assert.equal(result.record, undefined);
  }
  assert.deepEqual(inspectPolylineVertex(capability, 0).record, record);
});
