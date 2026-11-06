import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { JOURNEY_LEVELS, journeyLevels, journeyTissueOf, levelAim, levelAt, levelFade, levelHome, playStep, type JourneyTail, type JourneyTissue } from '../src/domain/scale-journey';
import type { Atlas } from '../src/domain/types';
import { JOURNEY_BUILDERS } from '../src/viewer/scale-journey-scenes';
import { TISSUE_BUILDERS as FIRST_BUILDERS } from '../src/viewer/tissue-scenes';
import { MORE_TISSUE_BUILDERS } from '../src/viewer/more-tissue-scenes';
import { DEEP_BUILDERS, HEMOGLOBIN_BUILDERS, isHemoglobinData } from '../src/viewer/deep-scenes';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const TISSUE_BUILDERS = { ...FIRST_BUILDERS, ...MORE_TISSUE_BUILDERS, ...DEEP_BUILDERS };
const hemoglobin = JSON.parse(await readFile(new URL('../public/scale-journey/hemoglobin-3hrw.json', import.meta.url), 'utf8'));
const TISSUES: readonly JourneyTissue[] = ['muscle', 'nerve', 'artery', 'vein', 'bone', 'fat', 'liver', 'kidney', 'lung', 'gut', 'heart', 'brain', 'cartilage', 'tendon', 'membrane', 'gland', 'endocrine', 'thyroid', 'lymphoid', 'colon', 'stomach', 'urothelium', 'airway', 'retina', 'cornea', 'lens', 'tooth', 'testis', 'blood'];
const TAILS: readonly JourneyTail[] = ['nucleus', 'blood', 'microbiota'];

test('the zoom from skin is unchanged, and every other route joins it at the cell nucleus', () => {
  assert.equal(journeyLevels('skin'), JOURNEY_LEVELS);
  const shared = JOURNEY_LEVELS.slice(JOURNEY_LEVELS.findIndex((level) => level.id === 'nucleus'));
  for (const tissue of TISSUES) {
    const levels = journeyLevels(tissue);
    assert.equal(levels.length, shared.length + 2, tissue);
    assert.deepEqual(levels.slice(2), shared, tissue);
    assert.equal(new Set(levels.map((level) => level.id)).size, levels.length, tissue);
  }
});

test('each route, by each way on, covers every view height, with each level whole at its best view and its neighbours gone', () => {
  for (const tissue of TISSUES) for (const tail of TAILS) {
    const levels = journeyLevels(tissue, tail);
    const wide = levels[0].startMetres, narrow = levels[levels.length - 1].endMetres;
    for (let i = 0; i <= 900; i++) {
      const view = wide * (narrow / wide) ** (i / 900);
      assert.ok(levels.some((level) => levelFade(level, view, levels) > 0.2), `${tissue} at ${view}`);
    }
    for (const [index, level] of levels.entries()) {
      const home = levelHome(level, levels);
      assert.equal(levelFade(level, home, levels), 1, `${tissue} ${level.id}`);
      assert.equal(levelAt(home, levels), level, `${tissue} ${level.id}`);
      for (const neighbour of [levels[index - 1], levels[index + 1]]) if (neighbour) assert.equal(levelFade(neighbour, home, levels), 0, `${tissue} ${level.id} beside ${neighbour.id}`);
      if (levels[index + 1]) assert.ok(levelAim(level, levels[index + 1].startMetres, levels) > 0.99, `${tissue} ${level.id} reaches the part that comes next`);
    }
  }
});

test('the new levels are marked as simulated, say that their sizes are estimates, and name sources', () => {
  for (const tissue of TISSUES) for (const level of journeyLevels(tissue).slice(0, 2)) {
    assert.equal(level.evidence, 'simulated', level.id);
    assert.match(level.caption, /estimates/, level.id);
    assert.ok(level.basis.length > 0, level.id);
    for (const source of level.basis) assert.match(source, /doi:10\.\d+\/|PMID \d+|^Hummel KP/, source);
  }
});

test('claims that rest on a particular source say what that source says', () => {
  const caption = (tissue: JourneyTissue, index: number) => journeyLevels(tissue)[index].caption;
  assert.match(caption('bone', 0), /lacks the osteonal remodelling/);
  assert.match(caption('bone', 1), /90 to 95 percent/);
  assert.match(caption('lung', 0), /2\.31 million alveoli/);
  assert.match(caption('lung', 1), /1\.13 km/);
  assert.match(caption('liver', 1), /5,100 cubic micrometres and 4\.8 micrometres/);
  assert.match(caption('brain', 0), /wide disagreement between sources/);
  assert.ok(journeyLevels('nerve')[0].basis.some((source) => /This review describes the human nerve/.test(source)));
});

test('every level has a scene, built the same every time, with its labels and its way on inside it', () => {
  const signature = (build: () => { group: THREE.Group }) => {
    const parts: string[] = [];
    build().group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) parts.push(`i${object.count}:${Array.from(object.instanceMatrix.array).reduce((sum, value, index) => sum + value * (index % 13 + 1), 0).toFixed(5)}`);
      else if (object instanceof THREE.Mesh) parts.push(`g${(object.geometry as THREE.BufferGeometry).getAttribute('position').count}`);
    });
    return parts.join(' ');
  };
  for (const tissue of TISSUES) for (const tail of TAILS) for (const level of journeyLevels(tissue, tail)) {
    const build = TISSUE_BUILDERS[level.id];
    if (!build) { assert.ok(JOURNEY_BUILDERS[level.id] || HEMOGLOBIN_BUILDERS[level.id], level.id); continue; }
    assert.equal(signature(build), signature(build), `${level.id} is repeatable`);
    const scene = build();
    assert.ok(scene.labels.length >= 3, `${level.id} names what it shows`);
    scene.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene.group);
    assert.ok(!bounds.isEmpty(), level.id);
    const margin = bounds.getSize(new THREE.Vector3()).length() * 0.05;
    const room = bounds.clone().expandByScalar(margin);
    assert.ok(room.containsPoint(scene.focus), `${level.id} leads on from a point in the scene`);
    for (const label of scene.labels) assert.ok(room.containsPoint(label.at), `${level.id} ${label.text}`);
  }
});

test('the ways on from a level lie in its scene, and each one leads to atoms', () => {
  const ways = new Set<string>();
  for (const [id, build] of Object.entries(TISSUE_BUILDERS)) {
    const scene = build();
    for (const branch of scene.branches ?? []) {
      ways.add(`${id}:${branch.tail}`);
      scene.group.updateMatrixWorld(true);
      const room = new THREE.Box3().setFromObject(scene.group);
      room.expandByScalar(room.getSize(new THREE.Vector3()).length() * 0.05);
      assert.ok(room.containsPoint(branch.at), `${id} ${branch.text}`);
    }
  }
  for (const way of ['muscle-fibres:blood', 'artery-wall:blood', 'vein-wall:blood', 'liver-cells:blood', 'lung-cells:blood', 'lymphoid-cells:blood', 'blood-cells:blood', 'gut-cells:microbiota', 'colon-block:microbiota', 'colon-cells:microbiota']) assert.ok(ways.has(way), way);
  const names = (tissue: JourneyTissue, tail: JourneyTail) => journeyLevels(tissue, tail).map((level) => level.id);
  assert.deepEqual(names('blood', 'blood').slice(2), ['red-cell', 'hemoglobin-crowd', 'hemoglobin', 'heme', 'atom', 'empty', 'atomic-nucleus', 'proton']);
  assert.deepEqual(names('colon', 'microbiota').slice(2), ['microbes', 'bacterium', 'bacterial-dna', 'dna', 'atom', 'empty', 'atomic-nucleus', 'proton']);
  assert.ok(!names('colon', 'microbiota').includes('nucleus'), 'a bacterium has no nucleus');
  assert.ok(!names('colon', 'microbiota').includes('nucleosome'), 'and no nucleosomes');
  assert.ok(!names('blood', 'blood').includes('nucleus'), 'and a red cell has none');
});

test('measured atoms of mouse hemoglobin keep their source, and a damaged file is refused', () => {
  assert.equal(isHemoglobinData(hemoglobin), true);
  assert.equal(hemoglobin.source.entry, '3HRW');
  assert.match(hemoglobin.source.citation, /doi:10\.1107\/S2053230X2100306X/);
  assert.equal(hemoglobin.source.organisms.hemoglobin, 'Mus musculus');
  assert.match(hemoglobin.source.note, /not from the Digimouse specimen/);
  assert.equal(hemoglobin.elements[hemoglobin.element[hemoglobin.focusAtom]].toUpperCase(), 'FE');
  assert.equal(hemoglobin.x.length, 4502);
  assert.equal(hemoglobin.element.filter((value: number) => hemoglobin.elements[value].toUpperCase() === 'FE').length, 4, 'four irons in one molecule');
  assert.equal(isHemoglobinData({ ...hemoglobin, source: { entry: '5B1M' } }), false);
  assert.equal(isHemoglobinData({ ...hemoglobin, heme: [] }), false);
  assert.equal(isHemoglobinData(null), false);
  const whole = HEMOGLOBIN_BUILDERS.hemoglobin(hemoglobin), atoms = HEMOGLOBIN_BUILDERS.heme(hemoglobin);
  assert.equal(whole.animate, undefined, 'measured atoms keep still');
  assert.equal(atoms.animate, undefined);
  assert.equal((whole.group.children[0] as THREE.InstancedMesh).count, 4502);
  assert.ok(atoms.labels.some((label) => label.text === 'Iron'));
  assert.ok(atoms.labels.some((label) => label.text === 'This carbon atom'));
});

test('sources that a level rests on say what the level says', () => {
  const caption = (tissue: JourneyTissue, index: number, tail: JourneyTail = 'nucleus') => journeyLevels(tissue, tail)[index].caption;
  assert.match(caption('colon', 0), /150 micrometres/);
  assert.match(caption('colon', 0), /inner layer is free of bacteria/);
  assert.match(caption('colon', 2, 'microbiota'), /Bacteroidetes and Firmicutes/);
  assert.match(caption('retina', 1), /about 3 percent/);
  assert.match(caption('cornea', 1), /about 13 layers/);
  assert.match(caption('cartilage', 1), /neither vessels nor nerves/);
  assert.match(caption('blood', 2, 'blood'), /smaller than those of humans/);
  assert.match(caption('blood', 4, 'blood'), /3HRW/);
  assert.match(caption('blood', 4, 'blood'), /carry no oxygen/);
  assert.match(caption('colon', 5, 'microbiota'), /not from a bacterium/);
});

test('a route that says the mouse has no osteons draws none, and a white fat cell has one droplet', () => {
  const labels = (id: string) => TISSUE_BUILDERS[id]().labels.map((label) => label.text).join(' | ');
  assert.doesNotMatch(labels('bone-block'), /[Oo]steon|Haversian/);
  assert.match(labels('fat-cells'), /One droplet of fat/);
  assert.match(labels('nerve-fibres'), /Schwann/);
  assert.match(labels('artery-wall'), /Elastic lamina/);
  assert.doesNotMatch(labels('vein-wall'), /Elastic lamina/);
});

test('a structure goes on to the tissue it is mostly made of', () => {
  const of = (id: string) => journeyTissueOf(atlas.structures.find((structure) => structure.id === `living:${id}`)!);
  const expected: Readonly<Record<string, JourneyTissue | null>> = {
    skin: 'skin', 'muscle-biceps-femoris': 'muscle', masseter: 'muscle', 'bone-femur-r': 'bone', 'sciatic-nerves': 'nerve', 'brachial-plexus': 'nerve', 'femoral-arteries': 'artery', aorta: 'artery',
    'femoral-veins': 'vein', 'superior-venae-cavae': 'vein', 'portal-vein': 'vein', fat: 'fat', 'brown-fat': 'fat', 'liver-median': 'liver', 'kidney-right': 'kidney', 'lung-left': 'lung',
    'small-intestine': 'gut', 'heart-lv': 'heart', cerebrum: 'brain', cerebellum: 'brain',
    colon: 'colon', caecum: 'colon', spleen: 'lymphoid', thymus: 'lymphoid', bladder: 'urothelium', 'heart-valves': 'heart', 'brain-ventricles': 'brain', trachea: 'airway', 'tracheal-rings': 'cartilage',
    'calcaneal-tendons': 'tendon', peritoneum: 'membrane', pancreas: 'gland', thyroid: 'thyroid', adrenals: 'endocrine', retinas: 'retina', corneas: 'cornea', lenses: 'lens', incisors: 'tooth', 'testis-left': 'testis', veins: 'blood', 'stomach-pyloric': 'stomach', diaphragm: 'muscle', 'spinal-cord': 'brain',
  };
  for (const [id, tissue] of Object.entries(expected)) assert.equal(of(id), tissue, id);
  const unrouted = atlas.structures.filter((structure) => !journeyTissueOf(structure)).map((structure) => structure.id);
  assert.deepEqual(unrouted, [], 'every structure of the mouse goes on down to atoms');
});

test('playing goes all the way down every route and every way, at any frame rate, and back up', () => {
  for (const tissue of ['skin', ...TISSUES] as JourneyTissue[]) {
    for (const tail of TAILS) {
      const route = journeyLevels(tissue, tail);
      for (const fps of [5, 30, 144]) {
        let view = route[0].startMetres, seconds = 0, ended = false;
        // A first step of no time, or a clock a little behind, must not end it at the top.
        for (const odd of [0, -0.01]) { const step = playStep(view, 'in', odd, route); assert.equal(step.ended, false, tissue + ' ' + tail); view = step.view; }
        while (!ended && seconds < 120) { const step = playStep(view, 'in', 1 / fps, route); view = step.view; ended = step.ended; seconds += 1 / fps; }
        assert.ok(ended, tissue + ' ' + tail + ' did not end');
        assert.equal(view, route[route.length - 1].endMetres);
        assert.equal(route[route.length - 1].id, 'proton', tissue + ' ' + tail);
        assert.ok(seconds < 90, tissue + ' ' + tail + ' took ' + seconds);
        ended = false;
        while (!ended && seconds < 400) { const step = playStep(view, 'out', 1 / fps, route); view = step.view; ended = step.ended; seconds += 1 / fps; }
        assert.ok(ended && view === route[0].startMetres);
      }
    }
  }
});
