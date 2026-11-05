import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { layerStops } from '../src/domain/living-layers';
import type { Atlas } from '../src/domain/types';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const stops = layerStops(atlas);
const stop = (id: string) => stops.find((value) => value.id === id)!;
const shown = (id: string) => atlas.structures.filter((structure) => !stop(id).hidden.includes(structure.id)).map((structure) => structure.id);

test('only the living mouse has a layer stack, and every step names existing structures', () => {
  assert.deepEqual(layerStops({ id: 'digimouse-volume-040-v1', structures: atlas.structures }), []);
  assert.deepEqual(stops.map((value) => value.id), ['coat', 'skin', 'flesh', 'muscles', 'organs', 'vessels', 'nerves', 'skeleton']);
  const ids = new Set(atlas.structures.map((structure) => structure.id));
  for (const value of stops) {
    for (const id of value.hidden) assert.ok(ids.has(id), id);
    assert.deepEqual(new Set(Object.keys(value.opacity)), ids);
  }
});

test('each step shows what it names and removes what lies outside it', () => {
  assert.equal(stop('coat').coat, true);
  assert.equal(stop('skin').coat, false);
  assert.deepEqual(stop('coat').hidden, []);
  for (const id of ['flesh', 'muscles', 'organs', 'vessels', 'nerves', 'skeleton']) {
    assert.ok(!shown(id).includes('living:skin'), id);
    assert.ok(!shown(id).includes('living:tail'), id);
  }
  assert.ok(shown('flesh').includes('living:fat') && shown('flesh').includes('living:muscle-gluteus'));
  assert.ok(!shown('muscles').includes('living:fat') && shown('muscles').includes('living:muscle-gluteus'));
  assert.ok(!shown('organs').includes('living:muscle-gluteus') && shown('organs').includes('living:liver-median') && shown('organs').includes('living:aorta'));
  assert.ok(shown('vessels').includes('living:heart-lv') && shown('vessels').includes('living:aorta') && !shown('vessels').includes('living:liver-median'));
  assert.ok(shown('nerves').includes('living:spinal-cord') && shown('nerves').includes('living:cerebrum') && !shown('nerves').includes('living:aorta'));
  assert.deepEqual(shown('skeleton').sort(), atlas.structures.filter((structure) => structure.systems.includes('skeletal')).map((structure) => structure.id).sort());
});

test('the skeleton is faint where it only gives context', () => {
  for (const id of ['organs', 'vessels', 'nerves']) assert.ok(stop(id).opacity['living:bone-femur-r'] < 0.3, id);
  assert.equal(stop('skeleton').opacity['living:bone-femur-r'], 1);
  assert.ok(stop('coat').opacity['living:peritoneum'] < 0.3, 'membranes stay faint');
  assert.equal(stop('coat').opacity['living:skin'], 1);
});
