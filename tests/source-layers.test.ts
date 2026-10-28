import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { composeSourceLayers, type SourceLayerContext } from '../src/domain/source-layers';
import type { Atlas } from '../src/domain/types';

const load = async (directory: string) => JSON.parse(await readFile(
  new URL('../public/' + directory + '/atlas.json', import.meta.url), 'utf8')) as Atlas;
const tetrahedral = await load('atlas');
const volume = await load('atlas-volume');
const hindlimb = await load('atlas-hindlimb');
const embryo = await load('atlas-ema147');

test('overlapping volume groups form one source-ordered union rather than duplicate meshes', () => {
  const result = composeSourceLayers(volume, ['organs', 'brain'], 'hidden');
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.deepEqual(result.structureIds, Array.from({ length: 19 }, (_, index) => 'digimouse-volume:' + (index + 3)));
  assert.deepEqual(result.hidden, ['digimouse-volume:1', 'digimouse-volume:2']);
  assert.equal(result.opacity['digimouse-volume:1'], 0.06);
  assert.equal(result.opacity['digimouse-volume:2'], 0.14);
  assert.equal(result.opacity['digimouse-volume:4'], 1);
  assert.equal(result.opacity['digimouse-volume:11'], 1);
  assert.equal(new Set(result.structureIds).size, result.structureIds.length);
});

test('composition preserves the distinct source namespaces and source order of all four references', () => {
  const cases: [Atlas, string[], string[]][] = [
    [tetrahedral, ['skeleton', 'brain'], ['digimouse:2', 'digimouse:13']],
    [volume, ['muscles', 'brain'], [4, 5, 6, 7, 8, 10, 11].map((id) => 'digimouse-volume:' + id)],
    [hindlimb, ['bones', 'tendon'], [14, 15, 16, 17, 18, 19, 20].map((id) => 'charles2016-hindlimb:' + id)],
    [embryo, ['vessels', 'trigeminal'], [16797, 17307, 17576, 18415, 18601].map((id) => 'ema147:EMAPA:' + id)],
  ];
  for (const [atlas, groups, expected] of cases) {
    const result = composeSourceLayers(atlas, groups, 'hidden');
    assert.equal(result.ok, true, result.errors.join(' '));
    assert.deepEqual(result.structureIds, expected);
    assert.equal(result.hidden.length, atlas.structures.length - expected.length);
    assert.ok(expected.every((id) => result.opacity[id] === 1));
  }
});

test('faded context retains already translucent or invisible source defaults', () => {
  const modified = structuredClone(volume);
  modified.structures.find((region) => region.id === 'digimouse-volume:12')!.defaultOpacity = 0.03;
  modified.structures.find((region) => region.id === 'digimouse-volume:3')!.defaultOpacity = 0;
  const before = JSON.stringify(modified);
  const result = composeSourceLayers(modified, ['brain'], 'faded');
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.deepEqual(result.hidden, []);
  assert.equal(result.opacity['digimouse-volume:1'], 0.06);
  assert.equal(result.opacity['digimouse-volume:2'], 0.14);
  assert.equal(result.opacity['digimouse-volume:3'], 0);
  assert.equal(result.opacity['digimouse-volume:12'], 0.03);
  assert.equal(result.opacity['digimouse-volume:9'], 0.15);
  assert.equal(result.opacity['digimouse-volume:4'], 1);
  assert.equal(JSON.stringify(modified), before);
  const regional = composeSourceLayers(hindlimb, ['bones'], 'faded');
  assert.equal(regional.opacity['charles2016-hindlimb:0'], 0.15);
  assert.equal(regional.opacity['charles2016-hindlimb:17'], 1);
});

test('whole-reference composition includes each current source region exactly once in either context mode', () => {
  for (const atlas of [tetrahedral, volume, hindlimb, embryo]) {
    for (const context of ['hidden', 'faded'] as const) {
      const result = composeSourceLayers(atlas, ['whole-mouse'], context);
      assert.equal(result.ok, true, result.errors.join(' '));
      assert.deepEqual(result.structureIds, atlas.structures.map((region) => region.id));
      assert.deepEqual(result.hidden, []);
      assert.deepEqual(new Set(Object.values(result.opacity)), new Set([1]));
    }
  }
});

test('invalid group requests and malformed or substituted source inventories return no partial display state', () => {
  const sparse = ['brain']; sparse.length = 2;
  let accessorReads = 0;
  const accessor = ['brain'];
  Object.defineProperty(accessor, '0', { get() { accessorReads++; return 'brain'; } });
  const invalidGroupLists = [[], ['brain', 'brain'], ['invented-layer'], ['brain', 'charles2016-hindlimb:17'],
    [null], [1], [''], null, { 0: 'brain', length: 1 }, sparse, accessor];
  const wrongLabel = structuredClone(volume); wrongLabel.structures[3].sourceLabel = 'invented region';
  const wrongFrame = structuredClone(volume); wrongFrame.coordinateFrame.id = 'another-frame';
  const wrongSource = structuredClone(hindlimb); wrongSource.source.pdfSha256 = '0'.repeat(64);
  const missing = structuredClone(volume); missing.structures.pop();
  const malformed = [null, {}, { ...embryo, coordinateFrame: null }, { ...hindlimb, source: null },
    { ...volume, structures: null }, { ...volume, id: 'unsupported-reference' }, wrongLabel, wrongFrame, wrongSource, missing];
  const results = [
    ...invalidGroupLists.map((groups) => composeSourceLayers(volume, groups as unknown as readonly string[], 'hidden')),
    ...malformed.map((atlas) => composeSourceLayers(atlas as unknown as Atlas, ['brain'], 'hidden')),
    composeSourceLayers(volume, ['brain'], 'opaque' as SourceLayerContext),
  ];
  assert.equal(accessorReads, 0);
  for (const result of results) {
    assert.equal(result.ok, false);
    assert.deepEqual(result.structureIds, []);
    assert.deepEqual(result.hidden, []);
    assert.deepEqual(result.opacity, {});
    assert.ok(result.errors.length > 0);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.errors) && Object.isFrozen(result.opacity));
  }
});

test('composition leaves source metadata and caller choices unchanged and produces immutable independent results', () => {
  const atlas = structuredClone(tetrahedral);
  atlas.structures.reverse();
  const before = JSON.stringify(atlas);
  const choices = Object.freeze(['brain', 'skeleton']);
  const result = composeSourceLayers(atlas, choices, 'hidden');
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.deepEqual(result.structureIds, ['digimouse:13', 'digimouse:2']);
  assert.equal(JSON.stringify(atlas), before);
  assert.deepEqual(choices, ['brain', 'skeleton']);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.structureIds) && Object.isFrozen(result.hidden)
    && Object.isFrozen(result.opacity) && Object.isFrozen(result.errors));
  assert.throws(() => (result.structureIds as string[]).push('invented:region'));
  assert.throws(() => (result.hidden as string[]).pop());
  assert.throws(() => { (result.opacity as Record<string, number>)['digimouse:2'] = 0; });
  const later = composeSourceLayers(atlas, ['muscles'], 'faded');
  assert.equal(later.ok, true);
  assert.equal(result.opacity['digimouse:2'], 1);
  assert.deepEqual(result.structureIds, ['digimouse:13', 'digimouse:2']);
});
