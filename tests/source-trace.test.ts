import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isLocalTraceAsset, isLocalTraceAtlas } from '../src/domain/local-trace';
import { isSourceTraceAsset, isSourceTraceAtlas, parseSourceTrace } from '../src/domain/source-trace';
import type { Atlas } from '../src/domain/types';

async function fixture() {
  const atlas = JSON.parse(await readFile(new URL('../public/atlas-neuron/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const body = await readFile(new URL('../public/atlas-neuron/nmo130632-standardized.swc.txt', import.meta.url));
  return { atlas, bytes: new Uint8Array(body).buffer as ArrayBuffer };
}

test('the reviewed source bytes retain every numeric sample and parent with distinct parser-owned identity', async () => {
  const { atlas, bytes } = await fixture();
  assert.equal(isSourceTraceAtlas(atlas), true);
  assert.equal(isSourceTraceAtlas(structuredClone(atlas)), true);
  const result = await parseSourceTrace(bytes, atlas);
  assert.equal(result.ok, true, result.errors.join(' ')); assert.ok(result.asset);
  const asset = result.asset;
  assert.equal(asset.atlas, atlas);
  assert.equal(isSourceTraceAsset(asset), true); assert.equal(isSourceTraceAsset(structuredClone(asset)), false);
  assert.equal(isLocalTraceAsset(asset), false); assert.equal(isLocalTraceAtlas(atlas), false);
  const sourceRows = new TextDecoder().decode(bytes).trimEnd().split('\n').map((line) => line.split(' ').map(Number));
  assert.deepEqual(asset.nodes, sourceRows);
  assert.equal(asset.nodes.length, 11650);
  assert.equal(asset.nodes.filter((node) => node[6] !== -1).length, 11649);
  assert.ok(Object.isFrozen(asset) && Object.isFrozen(asset.nodes) && asset.nodes.every(Object.isFrozen));
  assert.ok(Object.isFrozen(atlas) && Object.isFrozen(atlas.source) && Object.isFrozen(atlas.coordinateFrame));
  assert.throws(() => { atlas.coordinateFrame.sourceUnits = 'mm'; });
  assert.equal(atlas.coordinateFrame.sourceUnits, 'unknown');
  assert.equal(atlas.coordinateFrame.assetUnits, 'unknown');
  assert.equal(atlas.coordinateFrame.registration, null);
});

test('the manifest guard rejects changed provenance, graph identity, units and unsupported geometry claims before fetching', async () => {
  const { atlas } = await fixture();
  const changes: ((candidate: Atlas) => void)[] = [
    (candidate) => { candidate.assetUrl = '/atlas-neuron/another.txt'; },
    (candidate) => { candidate.source.sourceSha256 = '0'.repeat(64); },
    (candidate) => { candidate.source.license = 'MIT'; },
    (candidate) => { candidate.source.licenseUrl = 'https://example.org'; },
    (candidate) => { candidate.source.sourceBytes = 1; },
    (candidate) => { candidate.coordinateFrame.sourceUnits = 'micrometres'; },
    (candidate) => { candidate.coordinateFrame.sourceToAssetScale = 0.001; },
    (candidate) => { candidate.coordinateFrame.physicalCalibrationVerified = true; },
    (candidate) => { candidate.coordinateFrame.registration = { target: 'digimouse' }; },
    (candidate) => { candidate.coordinateFrame.sourceToDisplay = [1, 0, 0]; },
    (candidate) => { candidate.statistics.assetSha256 = '0'.repeat(64); },
    (candidate) => { candidate.statistics.parentLinks = 11648; },
    (candidate) => { candidate.statistics.triangles = 100; },
    (candidate) => { candidate.structures[0].id = 'local-trace:record'; },
    (candidate) => { candidate.structures[0].systems = ['cardiovascular']; },
    (candidate) => { candidate.structures[0].sourceLabel = 130632; },
    (candidate) => { candidate.structures[0].ontology = [{ ontology: 'CL', identifier: 'unreviewed', relationship: 'exact', reference: 'unreviewed' }]; },
    (candidate) => { candidate.specimen = { sex: 'male', sourceReference: 'source' }; },
    (candidate) => { candidate.specimen = { sex: 'unknown', age: { value: 50, unit: 'days' }, sourceReference: 'source' }; },
  ];
  for (const change of changes) {
    const candidate = structuredClone(atlas); change(candidate);
    assert.equal(isSourceTraceAtlas(candidate), false);
    const result = await parseSourceTrace(new ArrayBuffer(424092), candidate);
    assert.equal(result.ok, false); assert.equal(result.asset, undefined);
    assert.equal(Object.isFrozen(candidate), false);
  }
  for (const value of [null, 1, {}, [], 'source']) assert.equal(isSourceTraceAtlas(value), false);
});

test('modified body, comment insertion and truncated bytes fail without freezing or echoing private input', async () => {
  const { atlas, bytes } = await fixture();
  const corrupted = bytes.slice(0); new Uint8Array(corrupted)[0] = 50;
  const comment = bytes.slice(0); new Uint8Array(comment).set(new TextEncoder().encode('# synthetic-private-marker\n'));
  for (const body of [corrupted, comment, bytes.slice(0, -1), new ArrayBuffer(0)]) {
    const candidate = structuredClone(atlas), before = JSON.stringify(candidate);
    const result = await parseSourceTrace(body, candidate);
    assert.equal(result.ok, false); assert.equal(result.asset, undefined);
    assert.equal(Object.isFrozen(candidate), false); assert.equal(JSON.stringify(candidate), before);
    assert.ok(result.errors.length && Object.isFrozen(result.errors));
    assert.equal(result.errors.join(' ').includes('synthetic-private-marker'), false);
  }
});

test('the original caller byte buffer cannot change the source being checked asynchronously', async () => {
  const { atlas, bytes } = await fixture();
  const pending = parseSourceTrace(bytes, atlas);
  new Uint8Array(bytes).fill(32);
  const result = await pending;
  assert.equal(result.ok, true, result.errors.join(' ')); assert.ok(result.asset);
  assert.equal(result.asset.nodes.length, 11650);
  assert.equal(result.asset.atlas.statistics.assetSha256, '0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5');
});

test('a concurrent manifest edit fails atomically rather than acquiring parser identity or freezing the caller', async () => {
  const { atlas, bytes } = await fixture();
  const pending = parseSourceTrace(bytes, atlas);
  atlas.title = 'Changed while checksum was pending';
  const result = await pending;
  assert.equal(result.ok, false); assert.equal(result.asset, undefined); assert.equal(Object.isFrozen(atlas), false);
  assert.equal(atlas.title, 'Changed while checksum was pending');
});

test('non-JSON accessors cannot be used as scientific metadata or frozen by a failed import', async () => {
  const { atlas, bytes } = await fixture();
  Object.defineProperty(atlas, 'extra', { enumerable: true, get() { throw new Error('synthetic-private-marker'); } });
  const result = await parseSourceTrace(bytes, atlas);
  assert.equal(result.ok, false); assert.equal(Object.isFrozen(atlas), false);
  assert.equal(result.errors.join(' ').includes('synthetic-private-marker'), false);
});
