import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildSystemLayers } from '../src/domain/system-layers';
import { SYSTEMS, type Atlas } from '../src/domain/types';

const folders = ['atlas', 'atlas-volume', 'atlas-hindlimb', 'atlas-ema147', 'atlas-neuron', 'atlas-nerve', 'atlas-vascular'];
const sources = await Promise.all(folders.map(async (folder) => JSON.parse(await readFile(new URL(`../public/${folder}/atlas.json`, import.meta.url), 'utf8')) as Atlas));
const [tetrahedral, volume, hindlimb, embryo, neuron, nerve, vascular] = sources;

test('actual sources retain existing system assignments, namespaces and source record order', () => {
  const expectedCounts: readonly (readonly [number, number, number])[] = [[17, 12, 0], [21, 13, 0], [44, 2, 0], [77, 0, 77], [1, 1, 0], [1, 1, 0], [1, 1, 0]];
  sources.forEach((source, index) => {
    const result = buildSystemLayers(source);
    assert.ok(result.ok, result.errors.join(' '));
    assert.deepEqual([result.totalCount, result.represented.length, result.unclassifiedCount], expectedCounts[index]);
    assert.equal(result.visibleCount, source.structures.length);
    assert.deepEqual(result.represented.map((row) => row.id), SYSTEMS.filter((system) => source.structures.some((structure) => structure.systems.includes(system.id))).map((system) => system.id));
    for (const row of result.represented) {
      assert.deepEqual(row.structureIds, source.structures.filter((structure) => structure.systems.includes(row.id)).map((structure) => structure.id));
      assert.equal(row.visibleCount, row.memberCount); assert.equal(row.state, 'visible');
      assert.ok(row.structureIds.every((id) => source.structures.some((structure) => structure.id === id)));
    }
  });
  assert.equal(buildSystemLayers(hindlimb).represented.find((row) => row.id === 'muscular')!.memberCount, 38, 'Existing metadata includes the tendon; this is not relabelled as 38 muscles.');
  assert.deepEqual(buildSystemLayers(neuron).represented[0].structureIds, ['neuromorpho:130632']);
  assert.deepEqual(buildSystemLayers(nerve).represented[0].structureIds, ['mousemapper-nerve:patch0']);
  assert.deepEqual(buildSystemLayers(vascular).represented[0].structureIds, ['schmid2021-mvn1:network']);
});

test('hidden flags, explicit zero opacity and source defaults determine mixed visibility without counting transparency as invisibility', () => {
  const hidden = Object.freeze(['digimouse-volume:4']);
  const opacity = Object.freeze({ 'digimouse-volume:5': 0, 'digimouse-volume:6': 0.03 });
  const result = buildSystemLayers(volume, hidden, opacity);
  assert.ok(result.ok);
  const brain = result.represented.find((row) => row.id === 'nervous')!;
  assert.equal(brain.memberCount, 6); assert.equal(brain.visibleCount, 4); assert.equal(brain.state, 'partial');
  assert.equal(result.visibleCount, 19);
  const allBrainHidden = buildSystemLayers(volume, brain.structureIds);
  assert.equal(allBrainHidden.represented.find((row) => row.id === 'nervous')!.state, 'hidden');
  const defaults = structuredClone(tetrahedral);
  defaults.structures.find((structure) => structure.id === 'digimouse:3')!.defaultOpacity = 0;
  assert.equal(buildSystemLayers(defaults).represented.find((row) => row.id === 'cardiovascular')!.state, 'hidden');
  assert.equal(buildSystemLayers(defaults, [], { 'digimouse:3': 0.1 }).represented.find((row) => row.id === 'cardiovascular')!.state, 'visible');
  defaults.structures.find((structure) => structure.id === 'digimouse:3')!.defaultOpacity = Number.NaN;
  assert.equal(buildSystemLayers(defaults).represented.find((row) => row.id === 'cardiovascular')!.state, 'visible', 'Invalid source-default opacity follows the existing defaultStructureOpacity fallback.');
});

test('overlapping source systems retain the same source ID rather than forming a hierarchy or double-counted total', () => {
  const result = buildSystemLayers(tetrahedral, ['digimouse:1', 'digimouse:1']);
  const muscular = result.represented.find((row) => row.id === 'muscular')!;
  const envelope = result.represented.find((row) => row.id === 'integumentary')!;
  assert.equal(muscular.memberCount, 3); assert.equal(muscular.visibleCount, 2); assert.equal(muscular.state, 'partial');
  assert.deepEqual(envelope.structureIds, ['digimouse:1']); assert.equal(envelope.state, 'hidden');
  assert.ok(muscular.structureIds.includes(envelope.structureIds[0]));
  assert.equal(result.totalCount, 17); assert.equal(result.visibleCount, 16);
  assert.ok(result.represented.reduce((sum, row) => sum + row.memberCount, 0) > result.totalCount);
  assert.ok(result.represented.every((row) => !('parentId' in row)));
});

test('all EMA147 records remain unclassified even when their names mention vessels, nerves or layers', () => {
  const result = buildSystemLayers(embryo, ['ema147:EMAPA:17307'], { 'ema147:EMAPA:17576': 0 });
  assert.ok(result.ok); assert.equal(result.represented.length, 0);
  assert.equal(result.missing.length, 14); assert.equal(result.unclassifiedCount, 77); assert.equal(result.unclassifiedVisibleCount, 75);
  assert.deepEqual(result.unclassifiedStructureIds, embryo.structures.map((structure) => structure.id));
  assert.ok(result.unclassifiedStructureIds.includes('ema147:reference'));
});

test('outputs are deeply immutable and preserve frozen input metadata and settings', () => {
  const source = structuredClone(volume);
  for (const structure of source.structures) { Object.freeze(structure.systems); Object.freeze(structure); }
  Object.freeze(source.structures); Object.freeze(source);
  const hidden = Object.freeze(['digimouse-volume:9']), opacity = Object.freeze({ 'digimouse-volume:19': 0 });
  const before = JSON.stringify({ source, hidden, opacity });
  const result = buildSystemLayers(source, hidden, opacity);
  assert.ok(result.ok); assert.ok(Object.isFrozen(result) && Object.isFrozen(result.represented) && Object.isFrozen(result.missing));
  assert.ok(Object.isFrozen(result.unclassifiedStructureIds) && Object.isFrozen(result.errors));
  for (const row of result.represented) assert.ok(Object.isFrozen(row) && Object.isFrozen(row.structureIds));
  for (const row of result.missing) assert.ok(Object.isFrozen(row));
  assert.throws(() => (result.represented[0].structureIds as string[]).push('invented:1'), TypeError);
  assert.equal(JSON.stringify({ source, hidden, opacity }), before);
});

test('empty source inventories are explicit and contain no inferred anatomy', () => {
  const result = buildSystemLayers({ id: 'empty-source', structures: [] });
  assert.ok(result.ok); assert.equal(result.totalCount, 0); assert.equal(result.visibleCount, 0); assert.equal(result.represented.length, 0);
  assert.equal(result.unclassifiedCount, 0); assert.equal(result.missing.length, 14);
});

test('malformed source classifications and settings reject atomically with fixed value-free errors', () => {
  const invalidSources: unknown[] = [null, [], {}, { id: '', structures: [] }, { id: 'PRIVATE_SYNTHETIC_MARKER', structures: [null] }];
  const duplicate = structuredClone(volume); duplicate.structures[1] = structuredClone(duplicate.structures[0]); invalidSources.push(duplicate);
  const unknown = structuredClone(volume); unknown.structures[0].systems = ['PRIVATE_SYNTHETIC_MARKER']; invalidSources.push(unknown);
  const repeated = structuredClone(volume); repeated.structures[0].systems = ['muscular', 'muscular']; invalidSources.push(repeated);
  const sparse = structuredClone(volume); delete sparse.structures[0]; invalidSources.push(sparse);
  for (const source of invalidSources) {
    const result = buildSystemLayers(source); assert.equal(result.ok, false); assert.equal(result.represented.length, 0);
    assert.equal(result.missing.length, 0); assert.equal(result.totalCount, 0);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
  for (const hidden of [null, {}, [null], ['PRIVATE_SYNTHETIC_MARKER']]) assert.equal(buildSystemLayers(volume, hidden).ok, false);
  for (const opacity of [null, [], { 'PRIVATE_SYNTHETIC_MARKER': 1 }, { 'digimouse-volume:9': NaN },
    { 'digimouse-volume:9': -0.01 }, { 'digimouse-volume:9': 1.01 }, { 'digimouse-volume:9': undefined }]) {
    const result = buildSystemLayers(volume, [], opacity); assert.equal(result.ok, false); assert.equal(result.visibleCount, 0);
    assert.deepEqual(result.errors, ['System layers require valid source classifications and display settings.']);
  }
});

test('metadata accessors are not executed and no network reads occur', () => {
  let reads = 0;
  const source = { get id() { reads++; throw new Error('PRIVATE_SYNTHETIC_MARKER'); }, structures: [] };
  assert.equal(buildSystemLayers(source).ok, false);
  const opacity = Object.defineProperty({}, 'digimouse-volume:9', { get() { reads++; return 0; }, enumerable: true });
  assert.equal(buildSystemLayers(volume, [], opacity).ok, false);
  assert.equal(reads, 0);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('Unexpected network request'); }) as typeof fetch;
  try { assert.equal(buildSystemLayers(volume).ok, true); } finally { globalThis.fetch = originalFetch; }
});
