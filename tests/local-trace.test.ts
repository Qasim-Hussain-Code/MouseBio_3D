import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseLocalTrace, isLocalTraceAsset, isLocalTraceAtlas, MAX_LOCAL_TRACE_BYTES,
  MAX_LOCAL_TRACE_NODES, MAX_LOCAL_TRACE_LINE_BYTES } from '../src/domain/local-trace';

const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const valid = '1 0 0 0 0 5 -1\n2 3 1 0 0 2 1\n';
const accepted = async (text: string) => {
  const result = await parseLocalTrace(bytes(text));
  assert.equal(result.ok, true, result.errors.join(' ')); assert.ok(result.asset);
  return result.asset;
};
const rejected = async (input: ArrayBuffer) => {
  const result = await parseLocalTrace(input);
  assert.equal(result.ok, false); assert.equal(result.asset, undefined);
  assert.ok(result.errors.length > 0 && Object.isFrozen(result.errors));
  return result.errors.join(' ');
};

test('nonsequential branching forests retain source rows, numeric types and distinct source and display bounds', async () => {
  const asset = await accepted('# synthetic-private-header-marker\n20 3 .1 .2 .3 9 10\n10 0 0 0 0 5 -1\n40 9 2 0 0 1 20\n30 3 1 1 0 2 20\n99 7 50 60 70 99 -1\n');
  const atlas = asset.atlas, stats = atlas.statistics;
  assert.deepEqual(asset.nodes, [[20, 3, .1, .2, .3, 9, 10], [10, 0, 0, 0, 0, 5, -1],
    [40, 9, 2, 0, 0, 1, 20], [30, 3, 1, 1, 0, 2, 20], [99, 7, 50, 60, 70, 99, -1]]);
  assert.equal(stats.samples, 5); assert.equal(stats.parentLinks, 3);
  assert.equal(stats.roots, 2); assert.equal(stats.components, 2); assert.equal(stats.isolatedSamples, 1);
  assert.equal(stats.zeroLengthEdges, 0); assert.equal(stats.float32CollapsedEdges, 0);
  assert.deepEqual(stats.typeCounts, { '0': 1, '3': 2, '7': 1, '9': 1 });
  assert.deepEqual(stats.boundsSourceUnits, [[0, 0, 0], [50, 60, 70]]);
  assert.deepEqual(stats.displayBoundsSourceUnits, [[0, 0, 0], [2, 1, Math.fround(.3)]]);
  assert.equal(stats.maxFloat32PositionError, Math.abs(Math.fround(.3) - .3));
  assert.equal(atlas.assetFormat, 'local-trace-v1'); assert.equal(atlas.assetUrl, 'local-memory:trace');
  assert.equal(atlas.coordinateFrame.sourceUnits, 'unknown'); assert.equal(atlas.coordinateFrame.assetUnits, 'unknown');
  assert.equal(atlas.coordinateFrame.sourceToAssetScale, 1);
  assert.equal(atlas.coordinateFrame.unitsVerified, false); assert.equal(atlas.coordinateFrame.anatomicalOrientationVerified, false);
  assert.equal(atlas.coordinateFrame.physicalCalibrationVerified, false);
  assert.equal(atlas.coordinateFrame.registration, null); assert.equal(atlas.coordinateFrame.registrationToDigimouse, null);
  assert.equal(atlas.specimen, undefined);
  assert.deepEqual(atlas.source, { displayName: 'Local morphology', title: 'User-supplied morphology trace', citationLabel: 'Local file', license: 'Unknown' });
  assert.deepEqual(atlas.structures[0].systems, []); assert.equal(atlas.structures[0].scale, 'cellular');
  assert.equal(JSON.stringify(asset).includes('synthetic-private-header-marker'), false);
});

test('radii and zero-length source links remain separate from display rounding', async () => {
  const asset = await accepted('1 0 0 0 0 1000 -1\n2 3 0 0 0 0 1\n3 3 1 0 0 .3 2\n4 7 1.000000001 0 0 1e308 3\n');
  assert.equal(asset.nodes[3][2], 1.000000001);
  assert.deepEqual(asset.nodes.map((row) => row[5]), [1000, 0, .3, 1e308]);
  assert.equal(asset.atlas.statistics.parentLinks, 3);
  assert.equal(asset.atlas.statistics.zeroLengthEdges, 1); assert.equal(asset.atlas.statistics.float32CollapsedEdges, 1);
  assert.match(asset.atlas.limitations.join(' '), /Radii are retained.*not used to draw measured radii/);
});

test('exact original bytes bind local identity even when the caller mutates its buffer during digest', async () => {
  const original = bytes('# marker-one\r\n' + valid), snapshot = original.slice(0);
  const pending = parseLocalTrace(original); new Uint8Array(original).fill(32);
  const result = await pending; assert.ok(result.asset, result.errors.join(' '));
  const asset = result.asset, hash = createHash('sha256').update(new Uint8Array(snapshot)).digest('hex');
  assert.equal(asset.atlas.statistics.assetSha256, hash); assert.equal(asset.atlas.statistics.assetBytes, snapshot.byteLength);
  assert.equal(asset.atlas.id, 'local-trace-' + hash);
  assert.equal(asset.atlas.coordinateFrame.id, 'local-trace-native-' + hash);
  assert.equal(asset.atlas.structures[0].id, 'local-trace:' + hash + ':record');
  const changed = await accepted('# marker-two\n' + valid);
  assert.deepEqual(changed.nodes, asset.nodes); assert.notEqual(changed.atlas.id, asset.atlas.id);
  assert.notEqual(changed.atlas.coordinateFrame.id, asset.atlas.coordinateFrame.id);
  assert.equal(JSON.stringify(asset).includes('marker-one'), false);
});

test('only immutable parser-produced assets and atlases have local-source registration', async () => {
  const asset = await accepted(valid);
  assert.equal(isLocalTraceAsset(asset), true); assert.equal(isLocalTraceAtlas(asset.atlas), true);
  assert.equal(isLocalTraceAsset(structuredClone(asset)), false); assert.equal(isLocalTraceAtlas(structuredClone(asset.atlas)), false);
  for (const value of [null, 1, 'trace', {}, { atlas: asset.atlas, nodes: asset.nodes }]) assert.equal(isLocalTraceAsset(value), false);
  assert.ok(Object.isFrozen(asset) && Object.isFrozen(asset.nodes) && asset.nodes.every(Object.isFrozen));
  assert.ok(Object.isFrozen(asset.atlas) && Object.isFrozen(asset.atlas.coordinateFrame)
    && Object.isFrozen(asset.atlas.statistics) && Object.isFrozen(asset.atlas.source)
    && Object.isFrozen(asset.atlas.statistics.boundsSourceUnits));
  assert.throws(() => { (asset.nodes[0] as unknown as number[])[2] = 99; });
  assert.throws(() => { asset.atlas.coordinateFrame.sourceUnits = 'mm'; });
  assert.throws(() => { asset.atlas.structures[0].systems.push('nervous'); });
});

test('invalid rows, numeric fields and parent graphs fail atomically without echoing raw headers', async () => {
  const rows = [
    '2 3 1 0 0 1', '2 3 1 0 0 1 1 extra', '0 3 1 0 0 1 1', '-2 3 1 0 0 1 1',
    '2.5 3 1 0 0 1 1', '2e0 3 1 0 0 1 1', '9007199254740992 3 1 0 0 1 1',
    '2 -1 1 0 0 1 1', '2 1.5 1 0 0 1 1', '2 9007199254740992 1 0 0 1 1',
    '2 3 NaN 0 0 1 1', '2 3 Infinity 0 0 1 1', '2 3 1e309 0 0 1 1',
    '2 3 1e39 0 0 1 1', '2 3 0x10 0 0 1 1', '2 3 1 0 0 -1 1', '2 3 1 0 0 Infinity 1',
    '2 3 1 0 0 1 0', '2 3 1 0 0 1 -2', '2 3 1 0 0 1 1.5',
    '2 3 1 0 0 1 9007199254740992', '2 3 1 0 0 1 99', '2 3 1 0 0 1 2', '1 3 1 0 0 1 1',
  ];
  for (const row of rows) await rejected(bytes('1 0 0 0 0 1 -1\n' + row + '\n'));
  assert.match(await rejected(bytes('1 0 0 0 0 1 2\n2 3 1 0 0 1 3\n3 3 2 0 0 1 1\n')), /cycle/);
  assert.match(await rejected(bytes(valid + '3 3 2 0 0 1 4\n4 3 3 0 0 1 3\n')), /cycle/);
  assert.equal((await rejected(bytes('# synthetic-secret-text\n'))).includes('synthetic-secret-text'), false);
  await rejected(bytes('1 0 0 0 0 1 -1\n2 3 1 0 0 1 -1\n'));
  await rejected(bytes('1 0 0 0 0 1 -1\n2 3 0 0 0 1 1\n'));
  await rejected(bytes('1 0 0 0 0 1 -1\n2 3 1e-50 0 0 1 1\n'));
});

test('UTF-8, byte and per-line limits include ignored comments', async () => {
  await rejected(new ArrayBuffer(0)); await rejected(new ArrayBuffer(MAX_LOCAL_TRACE_BYTES + 1));
  assert.match(await rejected(new Uint8Array([0xff]).buffer), /UTF-8/);
  assert.match(await rejected(new Uint8Array([0xc0, 0xaf]).buffer), /UTF-8/);
  const exactLine = '#' + String.fromCharCode(0x3c0).repeat(2047) + 'x';
  assert.equal(bytes(exactLine).byteLength, MAX_LOCAL_TRACE_LINE_BYTES);
  await accepted(exactLine + '\n' + valid);
  assert.match(await rejected(bytes(exactLine + 'x\n' + valid)), /4096-byte/);
  let remaining = MAX_LOCAL_TRACE_BYTES - bytes(valid).byteLength;
  const padding: string[] = [];
  while (remaining > 0) {
    const chunk = Math.min(remaining, MAX_LOCAL_TRACE_LINE_BYTES + 1);
    padding.push(chunk === 1 ? '\n' : '#' + '.'.repeat(chunk - 2) + '\n'); remaining -= chunk;
  }
  const exactBytes = bytes(padding.join('') + valid);
  assert.equal(exactBytes.byteLength, MAX_LOCAL_TRACE_BYTES);
  const result = await parseLocalTrace(exactBytes); assert.equal(result.ok, true, result.errors.join(' '));
});

test('renderer numeric-range checks reject unusable extents without scaling valid coordinates', async () => {
  assert.match(await rejected(bytes('1 0 0 0 0 1 -1\n2 3 3e38 0 0 1 1\n')), /renderer numeric range/);
  assert.match(await rejected(bytes('1 0 0 0 0 1 -1\n2 3 1.4e-45 0 0 1 1\n')), /renderer numeric range/);
  const regular = await accepted('1 0 -100000 0 0 1 -1\n2 3 100000 0 0 1 1\n');
  assert.equal(regular.nodes[0][2], -100000); assert.equal(regular.nodes[1][2], 100000);
  const isolated = await accepted(valid + '999 0 3e38 0 0 1 -1\n');
  assert.equal(isolated.atlas.statistics.isolatedSamples, 1);
  assert.deepEqual(isolated.atlas.statistics.displayBoundsSourceUnits, [[0, 0, 0], [1, 0, 0]]);
});

test('sample limits and deep forward-parent chains are handled without recursive graph traversal', async () => {
  const rows = ['1 0 0 0 0 0 -1'];
  for (let id = 2; id <= MAX_LOCAL_TRACE_NODES; id++) rows.push(id + ' 0 1 0 0 0 1');
  const text = rows.join('\n') + '\n'; assert.ok(bytes(text).byteLength < MAX_LOCAL_TRACE_BYTES);
  const asset = await accepted(text);
  assert.equal(asset.nodes.length, MAX_LOCAL_TRACE_NODES); assert.equal(asset.atlas.statistics.parentLinks, MAX_LOCAL_TRACE_NODES - 1);
  assert.match(await rejected(bytes(text + '100001 0 1 0 0 0 1\n')), /100000 samples/);
  const chain: string[] = [];
  for (let id = 30000; id >= 2; id--) chain.push(id + ' 0 1 0 0 0 ' + (id - 1));
  chain.push('1 0 0 0 0 0 -1');
  const long = await accepted(chain.join('\n'));
  assert.equal(long.atlas.statistics.samples, 30000); assert.equal(long.atlas.statistics.roots, 1);
});
