import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { Atlas } from '../src/domain/types';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-ema147/atlas.json', import.meta.url), 'utf8')) as Atlas;
test('EMA groups select exact source-labelled surfaces without inferring anatomy for the reference file', () => {
  const result = buildAnatomyGroups(atlas);
  assert.equal(result.ok, true, result.errors.join(' '));
  const group = (id: string) => result.groups.find(item => item.id === id)!;
  assert.equal(group('whole-mouse').structureIds.length, 77);
  assert.equal(group('named-surfaces').structureIds.length, 76);
  assert.deepEqual(group('vessels').structureIds, [17307, 18415, 18601].map(id => `ema147:EMAPA:${id}`));
  assert.deepEqual(group('trigeminal').structureIds, [16797, 17576].map(id => `ema147:EMAPA:${id}`));
  assert.deepEqual(group('reference').structureIds, ['ema147:reference']);
  assert.match(group('reference').limitations.join(' '), /No anatomical identity/);
  assert.ok(Object.isFrozen(result.groups) && result.groups.every(item => Object.isFrozen(item.structureIds)));
});

test('the 75-surface view excludes only source-labelled skin and the unannotated reference', () => {
  const before = JSON.stringify(atlas);
  const result = buildAnatomyGroups(atlas);
  assert.equal(result.ok, true);
  const group = result.groups.find(item => item.id === 'internal-surfaces')!;
  assert.equal(group.title, 'Named surfaces without skin');
  assert.equal(group.structureIds.length, 75);
  const excluded = atlas.structures.filter(region => !group.structureIds.includes(region.id)).map(region => region.id);
  assert.deepEqual(excluded, ['ema147:EMAPA:17525', 'ema147:reference']);
  assert.ok(group.structureIds.includes('ema147:EMAPA:16098'), 'Head mesenchyme is not silently removed.');
  assert.ok(group.structureIds.includes('ema147:EMAPA:16974'), 'Bounds do not determine membership.');
  assert.match(group.limitations.join(' '), /does not establish.*anatomically internal/);
  assert.equal(JSON.stringify(atlas), before);
});

test('narrow source-label selections have exact neural, bone-cartilage and tissue-layer memberships', () => {
  const result = buildAnatomyGroups(atlas);
  assert.equal(result.ok, true);
  const expected: Record<string, number[]> = {
    'neural-surfaces': [16668, 16678, 16797, 16896, 16974, 16979, 17533, 17535, 17544, 17550, 17563, 17576, 17577, 17787, 18590],
    'bone-cartilage': [17635, 17682, 18017, 18143, 18705, 18708],
    'tissue-layers': [16098, 16979, 17167, 17172, 17533, 17535, 17888, 28601],
  };
  for (const [id, identifiers] of Object.entries(expected)) {
    const group = result.groups.find(item => item.id === id)!;
    assert.deepEqual(group.structureIds, identifiers.map(identifier => `ema147:EMAPA:${identifier}`));
    assert.equal(new Set(group.structureIds).size, group.structureIds.length);
    assert.equal(group.structureIds.includes('ema147:reference'), false);
    assert.equal(group.structureIds.includes('ema147:EMAPA:17525'), false);
    assert.ok(Object.isFrozen(group) && Object.isFrozen(group.structureIds) && Object.isFrozen(group.limitations));
    assert.match(group.limitations.join(' '), /not partitions or formal anatomical system classifications/);
    assert.match(group.limitations.join(' '), /complete organs or systems, laterality or biological connectivity/);
  }
  const bones = result.groups.find(item => item.id === 'bone-cartilage')!;
  for (const identifier of bones.structureIds) {
    const region = atlas.structures.find(item => item.id === identifier)!;
    assert.match(String(region.sourceLabel), /_(bone|cartilage)(_|$)/);
  }
  assert.equal(bones.structureIds.includes('ema147:EMAPA:19143'), false, 'Other skeletal labels remain outside the explicit bone/cartilage filename selection.');
  assert.match(bones.limitations.join(' '), /do not establish mineralization, ossification state/);
  assert.match(result.groups.find(item => item.id === 'tissue-layers')!.limitations.join(' '), /not an exhaustive tissue inventory/);
});

test('overlapping groups remain display selections rather than anatomical partitions', () => {
  const result = buildAnatomyGroups(atlas);
  const group = (id: string) => result.groups.find(item => item.id === id)!;
  assert.deepEqual(group('neural-surfaces').structureIds.filter(id => group('tissue-layers').structureIds.includes(id)),
    [16979, 17533, 17535].map(id => `ema147:EMAPA:${id}`));
  assert.ok(group('trigeminal').structureIds.every(id => group('neural-surfaces').structureIds.includes(id)));
  for (const id of ['neural-surfaces', 'bone-cartilage', 'tissue-layers']) {
    assert.ok(group(id).structureIds.every(identifier => group('internal-surfaces').structureIds.includes(identifier)));
  }
  assert.match(group('tissue-layers').limitations.join(' '), /also occur in the neural selection/);
  assert.ok(result.groups.every(item => /may overlap/.test(item.limitations.join(' '))));
  assert.deepEqual(atlas.structures.flatMap(region => region.systems), [], 'Display groups add no formal system classifications.');
});

test('EMA groups reject substituted source labels, order, inventory, frame or assumed units', () => {
  for (const change of [
    (value: Atlas) => { value.structures.pop(); },
    (value: Atlas) => { value.structures[0].sourceLabel = 'mouse'; },
    (value: Atlas) => { Object.assign(value.structures[24], { sourceFile: 'Surfaces/EMAPA17525_envelope.stl' }); },
    (value: Atlas) => { Object.assign(value.structures[24], { sourceRegionIndex: 23 }); },
    (value: Atlas) => { value.structures[24].id = 'ema147:EMAPA:99999'; },
    (value: Atlas) => { value.structures.reverse(); },
    (value: Atlas) => { value.assetFormat = 'glb'; },
    (value: Atlas) => { value.coordinateFrame.sourceUnits = 'mm'; },
    (value: Atlas) => { value.coordinateFrame.sourceToAssetScale = 0.00008; },
    (value: Atlas) => { value.coordinateFrame.id = 'another-frame'; },
    (value: Atlas) => { value.source.archiveSha256 = '0'.repeat(64); },
    (value: Atlas) => { value.source.license = 'MIT'; },
  ]) {
    const changed = structuredClone(atlas); change(changed);
    const result = buildAnatomyGroups(changed);
    assert.equal(result.ok, false); assert.equal(result.groups.length, 0);
  }
});
