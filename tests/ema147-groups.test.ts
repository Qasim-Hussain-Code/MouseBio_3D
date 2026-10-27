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
test('EMA groups reject substituted source labels, order, inventory, frame or assumed units', () => {
  for (const change of [
    (value: Atlas) => { value.structures.pop(); },
    (value: Atlas) => { value.structures[0].sourceLabel = 'mouse'; },
    (value: Atlas) => { value.structures.reverse(); },
    (value: Atlas) => { value.coordinateFrame.sourceToAssetScale = 0.00008; },
    (value: Atlas) => { value.coordinateFrame.id = 'another-frame'; },
    (value: Atlas) => { value.source.archiveSha256 = '0'.repeat(64); },
  ]) {
    const changed = structuredClone(atlas); change(changed);
    const result = buildAnatomyGroups(changed);
    assert.equal(result.ok, false); assert.equal(result.groups.length, 0);
  }
});
