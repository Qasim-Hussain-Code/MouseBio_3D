import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ANATOMY_REFERENCES, buildReferenceCatalog, getReference, validateReferenceAtlas,
  createExperimentalBank, storeAtlasExperimentalData, readAtlasExperimentalData,
  switchAtlasExperimentalData, cachedAtlasIds, type AnatomyReference, type AtlasExperimentalBank,
  type AtlasExperimentalData,
} from '../src/domain/atlas-catalog';
import { exportViewState } from '../src/domain/view-state';
import type { Atlas, SystemId } from '../src/domain/types';

function atlas(id: string, letter: string, extraId: string, extraSystem: SystemId): Atlas {
  return { id, title: `Synthetic reference ${id}`, assetUrl: `/atlas-${id}/model.glb`,
    coordinateFrame: { id: `frame-${id}` }, source: { license: 'CC-BY-SA-4.0' },
    structures: [
      { id: 'shared:1', name: 'Synthetic shared label', systems: ['cardiovascular'], sourceLabel: 'one', meshNode: 'one' },
      { id: extraId, name: 'Synthetic separate label', systems: [extraSystem], sourceLabel: 'two', meshNode: 'two' },
    ], statistics: { glbSha256: letter.repeat(64) }, limitations: ['Synthetic software fixture only.'] };
}
const first = atlas('reference-a', 'a', 'only-a:2', 'urinary');
const second = atlas('reference-b', 'b', 'only-b:3', 'nervous');
function reference(source: Atlas): AnatomyReference {
  return { id: source.id, title: source.title, manifestUrl: `/atlas-${source.id}/atlas.json`,
    coordinateFrameId: source.coordinateFrame.id!, assetSha256: source.statistics.glbSha256 as string,
    coverage: { regionCount: source.structures.length,
      systems: [...new Set(source.structures.flatMap((structure) => structure.systems))] as SystemId[],
      description: 'Two synthetic source regions; no anatomical completeness claim.' },
    processingResolution: { sourceVoxelSpacingMm: [0.1, 0.1, 0.1], processingVoxelSpacingMm: [0.4, 0.4, 0.4],
      method: 'Synthetic metadata for software validation.', limitations: ['Source orientation is not validated by this fixture.'] },
    licenses: [{ identifier: 'CC-BY-SA-4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }] };
}
function dataset(value: number, note: string): AtlasExperimentalData {
  return { rows: [{ structureId: 'shared:1', measurement: 'synthetic signal', value, unit: 'AU',
    replicate: 'synthetic-subject', condition: 'synthetic-condition', timePoint: 'baseline' }],
    metadata: { title: 'Synthetic cache fixture', notes: note, sourceReference: 'Software acceptance only', origin: 'synthetic-example' } };
}
const empty: AtlasExperimentalData = { rows: [], metadata: { origin: 'user-data' } };
const clone = (value: unknown) => JSON.parse(JSON.stringify(value));

test('catalog validates explicit source identity, coverage, spacings and licenses without mutating entries', () => {
  const entries = [reference(first), reference(second)];
  const before = structuredClone(entries);
  const result = buildReferenceCatalog(entries);
  assert.equal(result.ok, true);
  assert.deepEqual(entries, before);
  assert.equal(result.catalog.length, 2);
  assert.equal(getReference(result.catalog, second.id)?.coordinateFrameId, second.coordinateFrame.id);
  assert.equal(getReference(result.catalog, 'absent'), undefined);
  assert.ok(Object.isFrozen(result.catalog));
  assert.ok(Object.isFrozen(result.catalog[0].coverage.systems));
  assert.ok(Object.isFrozen(result.catalog[0].processingResolution.sourceVoxelSpacingMm));
  assert.ok(Object.isFrozen(result.catalog[0].licenses[0]));
  assert.deepEqual(validateReferenceAtlas(result.catalog[0], first), { ok: true, errors: [] });
});

test('catalog rejects duplicates, unrecognized fields and research records atomically', () => {
  assert.equal(buildReferenceCatalog([]).ok, false);
  assert.equal(buildReferenceCatalog(Array(MAX_ANATOMY_REFERENCES + 1).fill(reference(first))).ok, false);
  for (const entries of [
    [reference(first), reference(first)],
    [reference(first), { ...reference(second), manifestUrl: reference(first).manifestUrl }],
    [reference(first), { ...reference(second), rows: dataset(3, 'not catalog content').rows }],
    [{ ...reference(first), dataset: { measurement: 3 } }],
  ]) {
    const result = buildReferenceCatalog(entries);
    assert.equal(result.ok, false);
    assert.deepEqual(result.catalog, []);
  }
  const dangerous = clone(reference(first));
  Object.defineProperty(dangerous, '__proto__', { value: {}, enumerable: true });
  assert.equal(buildReferenceCatalog([dangerous]).ok, false);
});

test('manifest routing is local and license links cannot carry credentials or executable schemes', () => {
  for (const manifestUrl of ['https://example.org/atlas.json', '//example.org/atlas.json', '/atlas/../atlas.json',
    '/atlas/%2e%2e/atlas.json', '/atlas/atlas.json?token=fixture', '/atlas\\atlas.json', '/atlas/a.json#fragment']) {
    assert.equal(buildReferenceCatalog([{ ...reference(first), manifestUrl }]).ok, false, manifestUrl);
  }
  for (const url of ['javascript:fixture', 'http://example.org/license', 'https://fixture:fixture@example.org/license']) {
    assert.equal(buildReferenceCatalog([{ ...reference(first), licenses: [{ identifier: 'MIT', url }] }]).ok, false);
  }
});

test('processing and coverage declarations require finite spacings and supported actual categories', () => {
  for (const component of [0, -1, NaN, Infinity, '0.1']) {
    const value = clone(reference(first));
    value.processingResolution.processingVoxelSpacingMm = [component, 0.1, 0.1];
    assert.equal(buildReferenceCatalog([value]).ok, false);
  }
  const unknownResolution = clone(reference(first));
  unknownResolution.processingResolution.sourceVoxelSpacingMm = null;
  unknownResolution.processingResolution.processingVoxelSpacingMm = null;
  assert.equal(buildReferenceCatalog([unknownResolution]).ok, true);
  for (const coverage of [{ regionCount: 0, systems: [], description: 'Fixture' },
    { regionCount: 2, systems: ['invented-system'], description: 'Fixture' },
    { regionCount: 2, systems: ['skeletal', 'skeletal'], description: 'Fixture' }]) {
    assert.equal(buildReferenceCatalog([{ ...reference(first), coverage }]).ok, false);
  }
});

test('loaded atlas must match reference ID, hash, frame, inventory and declared source license', () => {
  for (const altered of [
    { ...first, id: second.id }, { ...first, coordinateFrame: second.coordinateFrame },
    { ...first, statistics: second.statistics }, { ...first, structures: first.structures.slice(0, 1) },
    { ...first, source: { license: 'other-license' } },
    { ...first, structures: first.structures.map((structure) => ({ ...structure, systems: ['skeletal'] })) },
  ]) assert.equal(validateReferenceAtlas(reference(first), altered).ok, false);
  const malformed = { ...first, structures: [null] } as unknown as Atlas;
  assert.equal(validateReferenceAtlas(reference(first), malformed).ok, false);
  assert.equal(readAtlasExperimentalData(createExperimentalBank(), malformed).ok, false);
});

test('switching references preserves independent observations even when local structure IDs overlap', () => {
  const initial = createExperimentalBank();
  const dataA = dataset(3, 'Synthetic reference A notes');
  const away = switchAtlasExperimentalData(initial, first, dataA, second);
  assert.equal(away.ok, true);
  assert.equal(away.restored, false);
  assert.deepEqual(away.data, empty);
  assert.deepEqual(readAtlasExperimentalData(initial, first).data, empty);
  const dataB = dataset(19, 'Synthetic reference B notes');
  const back = switchAtlasExperimentalData(away.bank, second, dataB, first);
  assert.equal(back.ok, true);
  assert.equal(back.restored, true);
  assert.deepEqual(back.data, dataA);
  assert.deepEqual(readAtlasExperimentalData(back.bank, second).data, dataB);
  assert.deepEqual(cachedAtlasIds(back.bank), [first.id, second.id]);
});

test('the bank is not serializable research content and returns defensive copies', () => {
  const data = dataset(12345, 'Private synthetic note marker');
  const saved = storeAtlasExperimentalData(createExperimentalBank(), first, data);
  assert.equal(saved.ok, true);
  const serialized = JSON.stringify(saved.bank);
  for (const value of ['12345', 'Private synthetic note marker', 'synthetic-subject', 'rows', 'metadata']) {
    assert.equal(serialized.includes(value), false);
  }
  data.rows[0].value = 99;
  data.metadata.notes = 'changed caller state';
  const loaded = readAtlasExperimentalData(saved.bank, first).data!;
  assert.equal(loaded.rows[0].value, 12345);
  loaded.rows[0].value = 101;
  loaded.metadata.notes = 'changed result state';
  assert.equal(readAtlasExperimentalData(saved.bank, first).data!.rows[0].value, 12345);
  assert.equal(readAtlasExperimentalData(saved.bank, first).data!.metadata.notes, 'Private synthetic note marker');
});

test('wrong anatomical IDs, invalid metadata and unsupported row fields cannot replace cached data', () => {
  const baseline = storeAtlasExperimentalData(createExperimentalBank(), first, dataset(4, 'retained'));
  const wrong = dataset(5, 'wrong source');
  wrong.rows[0].structureId = 'only-b:3';
  for (const data of [wrong, { rows: dataset(6, 'extra field').rows.map((row) => ({ ...row, extra: 'not silently dropped' })), metadata: {} },
    { rows: [], metadata: { unknown: 'unsupported metadata' } } as unknown as AtlasExperimentalData]) {
    const rejected = storeAtlasExperimentalData(baseline.bank, first, data);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.bank, baseline.bank);
    assert.equal(readAtlasExperimentalData(rejected.bank, first).data!.rows[0].value, 4);
  }
});

test('same atlas ID cannot silently reuse observations for another asset, frame or region inventory', () => {
  const cached = storeAtlasExperimentalData(createExperimentalBank(), first, dataset(8, 'retained')).bank;
  for (const changed of [{ ...first, statistics: second.statistics }, { ...first, coordinateFrame: second.coordinateFrame },
    { ...first, structures: [first.structures[0], second.structures[1]] }]) {
    assert.equal(readAtlasExperimentalData(cached, changed).ok, false);
    const attempt = storeAtlasExperimentalData(cached, changed, empty);
    assert.equal(attempt.ok, false);
    assert.equal(attempt.bank, cached);
  }
  assert.equal(readAtlasExperimentalData(cached, first).data!.rows[0].value, 8);
});

test('a rejected switch returns the original bank without partially replacing any cached dataset', () => {
  const withA = storeAtlasExperimentalData(createExperimentalBank(), first, dataset(1, 'A')).bank;
  const withBoth = storeAtlasExperimentalData(withA, second, dataset(2, 'B')).bank;
  const incompatibleB = { ...second, coordinateFrame: { id: 'another-frame' } };
  const switched = switchAtlasExperimentalData(withBoth, first, dataset(10, 'new A'), incompatibleB);
  assert.equal(switched.ok, false);
  assert.equal(switched.bank, withBoth);
  assert.equal(switched.data, undefined);
  assert.equal(readAtlasExperimentalData(withBoth, first).data!.rows[0].value, 1);
  assert.equal(readAtlasExperimentalData(withBoth, second).data!.rows[0].value, 2);
});

test('explicitly empty current observations stay empty without clearing another reference', () => {
  const withA = storeAtlasExperimentalData(createExperimentalBank(), first, dataset(1, 'A')).bank;
  const withBoth = storeAtlasExperimentalData(withA, second, dataset(2, 'B')).bank;
  const cleared = switchAtlasExperimentalData(withBoth, first, empty, second);
  assert.equal(cleared.ok, true);
  assert.equal(readAtlasExperimentalData(cleared.bank, first).data!.rows.length, 0);
  assert.equal(cleared.data!.rows[0].value, 2);
  const uninitialized = { kind: 'mousebio.private-experimental-bank.v1' } as AtlasExperimentalBank;
  assert.equal(readAtlasExperimentalData(uninitialized, first).ok, false);
});

test('capacity exhaustion fails without eviction or discarding existing reference data', () => {
  let bank = createExperimentalBank();
  for (let index = 0; index < MAX_ANATOMY_REFERENCES; index++) {
    const source = { ...first, id: `synthetic-reference-${index}` };
    const stored = storeAtlasExperimentalData(bank, source, empty);
    assert.equal(stored.ok, true);
    bank = stored.bank;
  }
  const overflow = storeAtlasExperimentalData(bank, { ...first, id: 'synthetic-reference-extra' }, empty);
  assert.equal(overflow.ok, false);
  assert.equal(overflow.bank, bank);
  assert.equal(cachedAtlasIds(bank).length, MAX_ANATOMY_REFERENCES);
});

test('catalogs and view exports cannot gain experimental rows through reference switching', () => {
  const bank = storeAtlasExperimentalData(createExperimentalBank(), first, dataset(41, 'not view content')).bank;
  const exported = exportViewState({ mode: 'experimental', selected: 'shared:1', hidden: [], opacity: {},
    clipAxis: 'off', clipPosition: 50, labels: true, background: 'white',
    living: { playing: false, speed: 1, cardiac: true, respiratory: true } }, first);
  assert.equal(exported.includes('not view content'), false);
  assert.equal(exported.includes('synthetic signal'), false);
  const catalog = buildReferenceCatalog([reference(first)]);
  assert.equal(catalog.ok, true);
  assert.equal(JSON.stringify(catalog.catalog).includes('synthetic-subject'), false);
  assert.equal(JSON.stringify(bank).includes('not view content'), false);
});
