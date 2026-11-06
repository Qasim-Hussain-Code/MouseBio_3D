import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { layerStops, matchingStop } from '../src/domain/living-layers';
import type { Atlas } from '../src/domain/types';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const stops = layerStops(atlas);
const stop = (id: string) => stops.find((value) => value.id === id)!;
const shown = (id: string) => atlas.structures.filter((structure) => !stop(id).hidden.includes(structure.id)).map((structure) => structure.id);

test('vessels and nerves of each part have their own names, marked as simulated, with checked sources', () => {
  const named = (id: string) => atlas.structures.find((structure) => structure.id === `living:${id}`);
  for (const id of ['hindlimb-arteries', 'hindlimb-veins', 'hindlimb-nerves', 'forelimb-arteries', 'forelimb-veins', 'forelimb-nerves', 'head-arteries', 'cranial-veins', 'cranial-nerves', 'more-cranial-nerves', 'vagus-phrenic', 'spinal-nerves', 'visceral-arteries', 'portal-veins', 'lymph-nodes']) assert.equal(named(id), undefined, `${id} is no longer one group`);
  const fromKochi = ['common-iliac-arteries', 'internal-iliac-arteries', 'external-iliac-arteries', 'gluteal-arteries', 'iliacofemoral-arteries', 'pudendoepigastric-arteries', 'femoral-arteries', 'lateral-circumflex-femoral-arteries', 'caudal-femoral-arteries', 'deep-femoral-arteries', 'saphenous-arteries', 'popliteal-arteries', 'lateral-saphenous-veins', 'ischial-veins'];
  for (const id of fromKochi) assert.ok(named(id)?.basis?.some((item) => /^Kochi T.*10\.1371\/journal\.pone\.0084047/.test(item)), id);
  assert.ok(named('sciatic-nerves')?.basis?.some((item) => /^Rigaud M.*10\.1016\/j\.pain\.2008\.01\.016/.test(item)));
  for (const id of ['tibial-nerves', 'common-peroneal-nerves', 'sural-nerves']) assert.ok(named(id)?.basis?.some((item) => /^Shields SD/.test(item)), id);
  for (const id of ['saphenous-nerves', 'median-nerves', 'ulnar-nerves', 'radial-nerves', 'musculocutaneous-nerves', 'axillary-nerves', 'common-carotid-arteries', 'external-jugular-veins', 'vagus-nerves', 'phrenic-nerves', 'facial-nerves', 'maxillary-nerves', 'hypoglossal-nerves', 'thoracic-nerves', 'inguinal-lymph-nodes']) {
    const structure = named(id);
    assert.ok(structure, id);
    assert.equal(structure.evidence, 'simulated', id);
    assert.match(structure.description ?? '', /^Simulated\./, id);
    assert.ok(structure.basis?.length, id);
  }
  // A claim that rests on the rat says so, because the citation does.
  assert.ok(named('median-nerves')?.basis?.some((item) => /describes the rat, not the mouse/.test(item)));
});

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

test('the highlighted step follows what is shown', () => {
  assert.equal(matchingStop(stops, [], stop('coat').opacity, true), 'coat');
  assert.equal(matchingStop(stops, [], stop('skin').opacity, false), 'skin');
  assert.equal(matchingStop(stops, stop('skeleton').hidden, stop('skeleton').opacity, false), 'skeleton');
  assert.equal(matchingStop(stops, ['living:heart-lv'], stop('coat').opacity, true), null, 'one region hidden by hand');
  assert.equal(matchingStop(stops, [], { ...stop('coat').opacity, 'living:skin': 0.3 }, true), null, 'skin faded by hand');
  // Opacity not yet set by hand counts as the step's own.
  assert.equal(matchingStop(stops, [], {}, true), 'coat');
});

test('the skeleton is faint where it only gives context', () => {
  for (const id of ['organs', 'vessels', 'nerves']) assert.ok(stop(id).opacity['living:bone-femur-r'] < 0.3, id);
  assert.equal(stop('skeleton').opacity['living:bone-femur-r'], 1);
  assert.ok(stop('coat').opacity['living:peritoneum'] < 0.3, 'membranes stay faint');
  assert.equal(stop('coat').opacity['living:skin'], 1);
});
