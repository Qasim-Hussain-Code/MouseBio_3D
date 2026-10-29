import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Atlas } from '../src/domain/types';
import { isLocalTraceAsset, isLocalTraceAtlas } from '../src/domain/local-trace';
import { inspectSourcePolylineData, isSourcePolylineAsset, isSourcePolylineAtlas, parseSourcePolyline } from '../src/domain/source-polyline';

async function fixture() {
  const atlas = JSON.parse(await readFile(new URL('../public/atlas-nerve/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const body = await readFile(new URL('../public/atlas-nerve/mousemapper-patch0-lines.json', import.meta.url));
  return { atlas, bytes: new Uint8Array(body).buffer as ArrayBuffer };
}

test('approved polyline bytes preserve every zero-based source point and ordered path with parser-owned identity', async () => {
  const { atlas, bytes } = await fixture(); const original = JSON.parse(new TextDecoder().decode(bytes));
  assert.equal(isSourcePolylineAtlas(atlas), true); assert.equal(isSourcePolylineAtlas(structuredClone(atlas)), true);
  const result = await parseSourcePolyline(bytes, atlas); assert.equal(result.ok, true, result.errors.join(' ')); assert.ok(result.asset);
  const asset = result.asset;
  assert.equal(asset.atlas, atlas); assert.equal(isSourcePolylineAsset(asset), true);
  assert.equal(isSourcePolylineAsset(structuredClone(asset)), false); assert.equal(isLocalTraceAsset(asset), false); assert.equal(isLocalTraceAtlas(atlas), false);
  assert.deepEqual(asset.points, original.points); assert.deepEqual(asset.paths, original.paths);
  assert.equal(asset.points.length, 1940); assert.equal(asset.paths.length, 84);
  assert.equal(asset.paths.reduce((sum, path) => sum + path.length - 1, 0), 1876);
  assert.ok(Object.isFrozen(asset) && Object.isFrozen(asset.points) && Object.isFrozen(asset.paths));
  assert.ok(asset.points.every(Object.isFrozen) && asset.paths.every(Object.isFrozen));
  assert.ok(Object.isFrozen(atlas) && Object.isFrozen(atlas.coordinateFrame));
  assert.throws(() => { atlas.coordinateFrame.sourceUnits = 'mm'; }, TypeError);
  const inspection = inspectSourcePolylineData(original); assert.ok(inspection.ok && inspection.statistics);
  const { assetBytes: _bytes, assetSha256: _hash, ...statistics } = atlas.statistics;
  assert.deepEqual(inspection.statistics, statistics);
  assert.equal(inspection.statistics.maxFloat32PositionError, 1.5136718729991117e-05);
  assert.equal(inspection.statistics.components, 64);
});

test('manifest guard rejects altered source, frame, licensing, processing and invented radius or biological claims', async () => {
  const { atlas, bytes } = await fixture();
  const changes: ((candidate: Atlas) => void)[] = [
    (candidate) => { candidate.source.sourceSha256 = 'a'.repeat(64); },
    (candidate) => { candidate.source.sourceBytes = 1; }, (candidate) => { candidate.source.repositoryCommit = '0'.repeat(40); },
    (candidate) => { candidate.source.license = 'MIT'; }, (candidate) => { candidate.source.licenseUrl = 'https://example.org'; },
    (candidate) => { candidate.assetUrl = '/atlas-nerve/other.json'; },
    (candidate) => { candidate.coordinateFrame.sourceUnits = 'micrometres'; },
    (candidate) => { candidate.coordinateFrame.sourceToAssetScale = 0.001; },
    (candidate) => { candidate.coordinateFrame.anatomicalOrientationVerified = true; },
    (candidate) => { candidate.coordinateFrame.physicalCalibrationVerified = true; },
    (candidate) => { candidate.coordinateFrame.registrationToDigimouse = { accepted: true }; },
    (candidate) => { candidate.processing = { ...(candidate.processing as object), radiusUsed: true }; },
    (candidate) => { candidate.sourceAttributesOmitted = []; },
    (candidate) => { candidate.statistics.segments = 1875; },
    (candidate) => { candidate.statistics.triangles = 200; },
    (candidate) => { candidate.statistics.maxFloat32PositionError = 0; },
    (candidate) => { candidate.structures[0].id = 'digimouse:1'; },
    (candidate) => { candidate.structures[0].sourceLabel = 0; },
    (candidate) => { candidate.structures[0].scale = 'cellular'; },
    (candidate) => { candidate.specimen = { sex: 'male', count: 1, sourceReference: 'unreviewed' }; },
  ];
  for (const change of changes) {
    const candidate = structuredClone(atlas); change(candidate);
    assert.equal(isSourcePolylineAtlas(candidate), false);
    const result = await parseSourcePolyline(bytes, candidate);
    assert.equal(result.ok, false); assert.equal(result.asset, undefined); assert.equal(Object.isFrozen(candidate), false);
  }
  for (const value of [null, 1, {}, [], 'source']) assert.equal(isSourcePolylineAtlas(value), false);
});

test('unreviewed bytes fail without echoing source text or freezing the supplied manifest', async () => {
  const { atlas, bytes } = await fixture();
  const changed = bytes.slice(0); new Uint8Array(changed).set(new TextEncoder().encode('PRIVATE_SYNTHETIC_MARKER'));
  for (const body of [changed, bytes.slice(0, -1), new ArrayBuffer(0), new Uint8Array(bytes) as unknown as ArrayBuffer]) {
    const candidate = structuredClone(atlas), before = JSON.stringify(candidate);
    const result = await parseSourcePolyline(body, candidate);
    assert.equal(result.ok, false); assert.equal(result.asset, undefined); assert.equal(Object.isFrozen(candidate), false);
    assert.equal(JSON.stringify(candidate), before); assert.equal(result.errors.join(' ').includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
});

test('byte-copy and exact manifest identity guards reject races without partially replacing caller data', async () => {
  const first = await fixture(); const pending = parseSourcePolyline(first.bytes, first.atlas);
  new Uint8Array(first.bytes).fill(32); const accepted = await pending;
  assert.ok(accepted.ok && accepted.asset); assert.equal(accepted.asset.points.length, 1940);
  const second = await fixture(); const racing = parseSourcePolyline(second.bytes, second.atlas);
  second.atlas.title = 'Edited while checksum pending'; const rejected = await racing;
  assert.equal(rejected.ok, false); assert.equal(rejected.asset, undefined); assert.equal(Object.isFrozen(second.atlas), false);
  assert.equal(second.atlas.title, 'Edited while checksum pending');
});

test('accessors cannot provide metadata or leak arbitrary error text on a failed parse', async () => {
  const { atlas, bytes } = await fixture(); let invoked = false;
  Object.defineProperty(atlas, 'unreviewed', { enumerable: true, get() { invoked = true; throw new Error('PRIVATE_SYNTHETIC_MARKER'); } });
  const result = await parseSourcePolyline(bytes, atlas);
  assert.equal(result.ok, false); assert.equal(Object.isFrozen(atlas), false); assert.equal(invoked, false);
  assert.equal(result.errors.join(' ').includes('PRIVATE_SYNTHETIC_MARKER'), false);
});

test('numerical polyline inspection permits cycles and repeated links without tree repair or coordinate merging', () => {
  const data = { schemaVersion: 'mousebio.polyline.v1', points: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [5, 5, 5]], paths: [[0, 1, 2, 0], [0, 1]] };
  const before = structuredClone(data); const result = inspectSourcePolylineData(data); assert.ok(result.ok && result.statistics);
  assert.equal(result.statistics.points, 4); assert.equal(result.statistics.polylines, 2); assert.equal(result.statistics.segments, 4);
  assert.equal(result.statistics.components, 2); assert.equal(result.statistics.isolatedPoints, 1);
  assert.equal(result.statistics.zeroLengthSegments, 0); assert.deepEqual(data, before);
  assert.equal(isSourcePolylineAsset(data), false); assert.ok(Object.isFrozen(result.statistics) && Object.isFrozen(result.statistics.boundsSourceUnits[0]));
});

test('zero-length and Float32-collapsed segments retain distinct numerical diagnostics without physical measurements', () => {
  const data = { schemaVersion: 'mousebio.polyline.v1', points: [[1e8, 0, 0], [1e8 + 1, 0, 0], [1e8 + 1, 0, 0], [1e8 + 128, 0, 0]], paths: [[0, 1, 2, 3]] };
  const result = inspectSourcePolylineData(data); assert.ok(result.ok && result.statistics);
  assert.equal(result.statistics.zeroLengthSegments, 1); assert.equal(result.statistics.float32CollapsedSegments, 1);
  assert.equal(result.statistics.maxFloat32PositionError, 1); assert.equal(result.statistics.components, 1);
  assert.equal(Object.hasOwn(result.statistics, 'parentLinks'), false); assert.equal(Object.hasOwn(result.statistics, 'radius'), false);
  assert.deepEqual(result.statistics.boundsSourceUnits, [[1e8, 0, 0], [1e8 + 128, 0, 0]]);
});

test('invalid coordinate, schema, index and display resource cases reject without returning partial source statistics', () => {
  const base = { schemaVersion: 'mousebio.polyline.v1', points: [[0, 0, 0], [1, 0, 0]], paths: [[0, 1]] };
  const values: unknown[] = [null, {}, { ...base, radius: [1, 1] }, { ...base, schemaVersion: 'other' },
    { ...base, points: [[0, 0], [1, 0, 0]] }, { ...base, points: [[NaN, 0, 0], [1, 0, 0]] },
    { ...base, points: [[Infinity, 0, 0], [1, 0, 0]] }, { ...base, points: [[0, 0, 0], ['PRIVATE_SYNTHETIC_MARKER', 0, 0]] },
    { ...base, paths: [[]] }, { ...base, paths: [[0]] }, { ...base, paths: [[0, -1]] }, { ...base, paths: [[0, 2]] },
    { ...base, paths: [[0, 0.5]] }, { ...base, points: [[0, 0, 0], [0, 0, 0]] },
    { ...base, points: [[0, 0, 0], [1e38, 0, 0]] }, { ...base, points: Array(1000001).fill([1, 0, 0]) }];
  for (const value of values) {
    const result = inspectSourcePolylineData(value); assert.equal(result.ok, false); assert.equal(result.statistics, undefined);
    assert.equal(result.errors.join(' ').includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
});
