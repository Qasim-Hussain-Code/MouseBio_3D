/** Display colour selection. Colours are presentation conventions, not measurements. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { Atlas, Structure } from '../src/domain/types';
import { displayColour, hasSourceDeclaredColour, SYSTEM_COLOURS, tissueColour } from '../src/domain/tissue-palette';
import { SYSTEMS } from '../src/domain/types';

const load = async (path: string) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')) as Atlas;
const HEX = /^#[0-9a-f]{6}$/;

test('every system category has a fallback colour', () => {
  for (const system of SYSTEMS) assert.match(SYSTEM_COLOURS[system.id], HEX, system.id);
});

test('every Digimouse region receives a recognised tissue colour that differs from its manifest colour', async () => {
  for (const path of ['../public/atlas/atlas.json', '../public/atlas-volume/atlas.json']) {
    const atlas = await load(path);
    for (const structure of atlas.structures) {
      const tissue = tissueColour(structure);
      assert.ok(tissue && HEX.test(tissue), `${structure.id} (${structure.name}) has no tissue colour`);
      assert.equal(displayColour(structure, 'tissue'), tissue);
      assert.equal(displayColour(structure, 'source'), structure.color);
      assert.equal(hasSourceDeclaredColour(structure), false);
    }
    const colours = (ids: string[]) => ids.map((id) => displayColour(atlas.structures.find((structure) => structure.id === id)!));
    if (path.includes('volume')) {
      // Paired organs share a colour; the brain subdivisions stay distinguishable.
      assert.equal(new Set(colours(['digimouse-volume:4', 'digimouse-volume:5', 'digimouse-volume:6', 'digimouse-volume:7', 'digimouse-volume:8', 'digimouse-volume:10'])).size, 6);
    } else {
      assert.equal(new Set(colours(['digimouse:7', 'digimouse:8'])).size, 1);
      assert.equal(new Set(colours(['digimouse:9', 'digimouse:10'])).size, 1);
      assert.notEqual(displayColour(atlas.structures[0]), displayColour(atlas.structures.find((structure) => structure.id === 'digimouse:12')!));
    }
  }
});

test('source-declared figure colours are kept in both schemes', async () => {
  const hindlimb = await load('../public/atlas-hindlimb/atlas.json');
  for (const structure of hindlimb.structures) {
    assert.equal(hasSourceDeclaredColour(structure), true, structure.id);
    assert.equal(displayColour(structure, 'tissue'), structure.color);
    assert.equal(displayColour(structure, 'source'), structure.color);
  }
});

test('unrecognised labels fall back to the manifest colour or the system colour', () => {
  const base = { id: 'x:1', name: 'Unlabelled region', systems: ['endocrine'], sourceLabel: 'region 42' } as unknown as Structure;
  assert.equal(tissueColour(base), undefined);
  assert.equal(displayColour(base), SYSTEM_COLOURS.endocrine);
  assert.equal(displayColour({ ...base, color: '#123456' } as Structure), '#123456');
  assert.equal(displayColour({ ...base, color: 'red' } as Structure), SYSTEM_COLOURS.endocrine, 'malformed colours are ignored');
  assert.equal(displayColour({ ...base, systems: [] } as unknown as Structure), '#9ba5a1');
  assert.equal(tissueColour({ name: 'Adrenal glands', sourceLabel: 'adrenal glands' }), '#e0b86d', 'specific labels match before generic gland');
  assert.equal(tissueColour({ name: 'Trigeminal V ganglion', sourceLabel: 'EMAPA:1' }), '#e2d58a');
});
