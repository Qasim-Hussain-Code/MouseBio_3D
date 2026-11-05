import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { Atlas } from '../src/domain/types';
import { buildReferenceCatalog, validateReferenceAtlas } from '../src/domain/atlas-catalog';
import { defaultStructureOpacity, initialReferenceSelection, referenceOpacity, seeThroughSkinOpacity, SKIN_OPACITY } from '../src/domain/reference-display';
import { bodySurfaceIdFor, displayPostureFor } from '../src/domain/display-pose';
import { physiologyProcessesForAtlas } from '../src/domain/physiology';

test('shipped reference declarations bind each actual manifest without merging inventories', async () => {
  const catalog = buildReferenceCatalog(JSON.parse(await readFile(new URL('../data/anatomy-references.json', import.meta.url), 'utf8')));
  assert.equal(catalog.ok, true, catalog.errors.join(' '));
  assert.equal(catalog.catalog.length, 7);
  for (const entry of catalog.catalog) {
    const atlas = JSON.parse(await readFile(new URL(`../public${entry.manifestUrl}`, import.meta.url), 'utf8')) as Atlas;
    assert.deepEqual(validateReferenceAtlas(entry, atlas), { ok: true, errors: [] });
    const opacity = referenceOpacity(atlas);
    assert.equal(Object.keys(opacity).length, atlas.structures.length);
    const skin = bodySurfaceIdFor(atlas);
    assert.ok(atlas.structures.every((region) => opacity[region.id] === (region.id === skin ? SKIN_OPACITY : defaultStructureOpacity(region))));
    assert.equal(seeThroughSkinOpacity(atlas), skin ? defaultStructureOpacity(atlas.structures.find((region) => region.id === skin)!) : null);
    assert.equal(!!displayPostureFor(atlas), !!skin);
    assert.ok(atlas.structures.some((region) => region.id === initialReferenceSelection(atlas)));
    for (const process of physiologyProcessesForAtlas(atlas.id)) {
      assert.equal(process.classification, 'illustrative');
      assert.ok(process.requiredStructures.every((id) => atlas.structures.some((region) => region.id === id)));
    }
    const organs = referenceOpacity(atlas, true);
    for (const region of atlas.structures.filter((region) => region.systems.includes('skeletal'))) assert.equal(organs[region.id], 0.14);
  }
  assert.deepEqual(physiologyProcessesForAtlas('unknown'), []);
  assert.deepEqual(physiologyProcessesForAtlas('charles2016-hindlimb-v1'), []);
});
