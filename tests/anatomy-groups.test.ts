import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';
import type { Atlas } from '../src/domain/types';

const tetrahedral = JSON.parse(await readFile(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8')) as Atlas;
const volume = JSON.parse(await readFile(new URL('../public/atlas-volume/atlas.json', import.meta.url), 'utf8')) as Atlas;
const selection = (atlas: Atlas, id: string) => {
  const result = buildAnatomyGroups(atlas);
  assert.equal(result.ok, true, result.errors.join(' '));
  const group = result.groups.find((candidate) => candidate.id === id);
  assert.ok(group, `Expected supported display group ${id}`);
  return group;
};

test('tetrahedral groups select only the available aggregate and unnamed source regions', () => {
  assert.equal(selection(tetrahedral, 'whole-mouse').structureIds.length, 17);
  assert.deepEqual(selection(tetrahedral, 'brain').structureIds, ['digimouse:2']);
  assert.deepEqual(selection(tetrahedral, 'skeleton').structureIds, ['digimouse:13']);
  assert.deepEqual(selection(tetrahedral, 'muscles').structureIds, ['digimouse:14', 'digimouse:15']);
  assert.match(selection(tetrahedral, 'muscles').limitations.join(' '), /Named muscle identity and laterality are unresolved/);
  assert.equal(buildAnatomyGroups(tetrahedral).groups.some((group) => group.id === 'head-organs'), false);
});

test('volume brain and head groups preserve the explicit source-label unions without a new aggregate ID', () => {
  assert.equal(selection(volume, 'whole-mouse').structureIds.length, 21);
  assert.deepEqual(selection(volume, 'brain').structureIds,
    [4, 5, 6, 7, 8, 10].map((label) => `digimouse-volume:${label}`));
  assert.deepEqual(selection(volume, 'skeleton').structureIds, ['digimouse-volume:2']);
  assert.deepEqual(selection(volume, 'muscles').structureIds, ['digimouse-volume:11']);
  assert.deepEqual(selection(volume, 'head-organs').structureIds, ['digimouse-volume:3', 'digimouse-volume:12']);
  assert.match(selection(volume, 'brain').limitations.join(' '), /does not create an additional whole-brain mesh/);
  assert.match(selection(volume, 'head-organs').limitations.join(' '), /do not establish laterality/);
});

test('internal-region selection excludes bulk body tissue and skeleton without suppressing existing source organs', () => {
  for (const [atlas, prefix, skeleton] of [[tetrahedral, 'digimouse:', 13], [volume, 'digimouse-volume:', 2]] as const) {
    const organs = selection(atlas, 'organs');
    assert.equal(organs.structureIds.length, atlas.structures.length - 2);
    assert.equal(organs.structureIds.includes(`${prefix}1`), false);
    assert.equal(organs.structureIds.includes(`${prefix}${skeleton}`), false);
    assert.ok(selection(atlas, 'muscles').structureIds.every((id) => organs.structureIds.includes(id)));
    const muscles = selection(atlas, 'muscles');
    assert.equal(muscles.structureIds.includes(`${prefix}1`), false);
  }
});

test('every supported group uses unique current-reference identifiers and never borrows IDs from another reference', () => {
  for (const atlas of [tetrahedral, volume]) {
    const result = buildAnatomyGroups(atlas);
    const known = new Set(atlas.structures.map((structure) => structure.id));
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(new Set(result.groups.map((group) => group.id)).size, result.groups.length);
    for (const group of result.groups) {
      assert.ok(group.structureIds.length > 0);
      assert.equal(new Set(group.structureIds).size, group.structureIds.length);
      assert.ok(group.structureIds.every((id) => known.has(id)));
      assert.ok(group.description.length > 0 && group.limitations.length > 0);
    }
  }
});

test('unsupported references and altered coordinate frames return explicit empty results', () => {
  const unsupported = buildAnatomyGroups({ ...volume, id: 'unreviewed-reference-v1' });
  assert.equal(unsupported.ok, false);
  assert.deepEqual(unsupported.groups, []);
  assert.match(unsupported.errors.join(' '), /No supported/);
  const wrongFrame = buildAnatomyGroups({ ...volume, coordinateFrame: { id: tetrahedral.coordinateFrame.id } });
  assert.equal(wrongFrame.ok, false);
  assert.deepEqual(wrongFrame.groups, []);
  assert.match(wrongFrame.errors.join(' '), /frame or source-region inventory/);
});

test('missing, extra, duplicate and relabelled source regions reject all groups instead of fabricating partial selections', () => {
  const missing = { ...volume, structures: volume.structures.filter((structure) => structure.id !== 'digimouse-volume:4') };
  const extra = { ...volume, structures: [...volume.structures, { ...volume.structures[0], id: 'digimouse-volume:22' }] };
  const duplicate = { ...volume, structures: volume.structures.map((structure, index) => index === 3 ? volume.structures[0] : structure) };
  const relabelled = { ...tetrahedral, structures: tetrahedral.structures.map((structure) => structure.id === 'digimouse:14'
    ? { ...structure, sourceLabel: 'masseter muscles' } : structure) };
  for (const atlas of [missing, extra, duplicate, relabelled]) {
    const result = buildAnatomyGroups(atlas);
    assert.equal(result.ok, false);
    assert.deepEqual(result.groups, []);
    assert.ok(result.errors.length > 0);
  }
});

test('group generation leaves anatomy unchanged and returns immutable display selections', () => {
  const before = JSON.stringify(volume);
  const result = buildAnatomyGroups(volume);
  assert.equal(JSON.stringify(volume), before);
  assert.equal(volume.structures.length, 21);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.groups));
  for (const group of result.groups) {
    assert.ok(Object.isFrozen(group) && Object.isFrozen(group.structureIds) && Object.isFrozen(group.limitations));
    assert.throws(() => (group.structureIds as string[]).push('invented:brain'));
  }
});
