import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';
import type { Atlas } from '../src/domain/types';

// The actual source-derived atlas, not a separately fabricated inventory.
const atlas = JSON.parse(await readFile(new URL('../public/atlas-hindlimb/atlas.json', import.meta.url), 'utf8')) as Atlas;
const prefix = 'charles2016-hindlimb:';
const group = (id: string) => {
  const result = buildAnatomyGroups(atlas);
  assert.equal(result.ok, true, result.errors.join(' '));
  const selected = result.groups.find((item) => item.id === id);
  assert.ok(selected);
  return selected;
};

test('hindlimb groups expose only existing source-named regions with their original zero-based IDs', () => {
  const whole = group('whole-mouse'), muscles = group('muscles'), bones = group('bones'), tendon = group('tendon');
  assert.equal(whole.title, 'Whole hindlimb reference');
  assert.equal(whole.structureIds.length, 44);
  assert.match(whole.limitations.join(' '), /one adult female specimen/);
  assert.equal(muscles.structureIds.length, 37);
  assert.equal(bones.structureIds.length, 6);
  assert.deepEqual(bones.structureIds, [14, 16, 17, 18, 19, 20].map((id) => `${prefix}${id}`));
  assert.deepEqual(tendon.structureIds, [`${prefix}15`]);
  const categoryIds = [...muscles.structureIds, ...bones.structureIds, ...tendon.structureIds];
  assert.equal(new Set(categoryIds).size, 44);
  assert.deepEqual(new Set(categoryIds), new Set(whole.structureIds));
  assert.deepEqual(new Set(whole.structureIds), new Set(atlas.structures.map((structure) => structure.id)));
  assert.match(muscles.limitations.join(' '), /39 muscles.*37 muscle-named surfaces/);
  assert.match(bones.limitations.join(' '), /Foot and Tibia\/Fibula remain their original aggregate labels/);
  assert.deepEqual(bones.structureIds.map((id) => atlas.structures.find((structure) => structure.id === id)?.sourceLabel),
    ['Fabellae', 'Pelvis', 'Femur', 'Patella', 'Foot', 'Tibia/Fibula']);
  assert.equal(atlas.structures.find((structure) => structure.id === tendon.structureIds[0])?.sourceLabel, 'Patellar tendon');
});

test('reference provenance, frame, and exact source IDs and labels are mandatory for hindlimb selections', () => {
  const missing = { ...atlas, structures: atlas.structures.slice(1) };
  const duplicate = { ...atlas, structures: atlas.structures.map((structure, index) => index === 5 ? atlas.structures[0] : structure) };
  const renamed = { ...atlas, structures: atlas.structures.map((structure) => structure.id === `${prefix}20`
    ? { ...structure, sourceLabel: 'Tibia' } : structure) };
  const wrongFrame = { ...atlas, coordinateFrame: { ...atlas.coordinateFrame, id: 'digimouse-registered-voxel-native-v1' } };
  const wrongSource = { ...atlas, source: { ...atlas.source, pdfSha256: '0'.repeat(64) } };
  const wrongLicense = { ...atlas, source: { ...atlas.source, license: 'CC-BY-SA-4.0' } };
  const wrongIds = { ...atlas, structures: atlas.structures.map((structure, index) => index === 0
    ? { ...structure, id: 'digimouse-volume:1' } : structure) };
  for (const altered of [missing, duplicate, renamed, wrongFrame, wrongSource, wrongLicense, wrongIds]) {
    const result = buildAnatomyGroups(altered);
    assert.equal(result.ok, false);
    assert.deepEqual(result.groups, []);
    assert.ok(result.errors.length > 0);
  }
});

test('group results are immutable and insensitive to source inventory ordering', () => {
  const before = JSON.stringify(atlas);
  const result = buildAnatomyGroups(atlas);
  const shuffled = buildAnatomyGroups({ ...atlas, structures: [...atlas.structures].reverse() });
  assert.equal(JSON.stringify(atlas), before);
  assert.deepEqual(shuffled, result);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.groups));
  for (const selected of result.groups) {
    assert.ok(Object.isFrozen(selected) && Object.isFrozen(selected.structureIds) && Object.isFrozen(selected.limitations));
    assert.throws(() => (selected.structureIds as string[]).push('invented:bone'));
  }
});
