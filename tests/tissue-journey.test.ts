import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { JOURNEY_LEVELS, JOURNEY_TAILS, journeyLevels, journeyTissueOf, levelAim, levelAt, levelFade, levelHome, ownWayOf, playStep, type JourneyTail, type JourneyTissue } from '../src/domain/scale-journey';
import type { Atlas } from '../src/domain/types';
import { JOURNEY_BUILDERS } from '../src/viewer/scale-journey-scenes';
import { TISSUE_BUILDERS as FIRST_BUILDERS } from '../src/viewer/tissue-scenes';
import { MORE_TISSUE_BUILDERS } from '../src/viewer/more-tissue-scenes';
import { DEEP_BUILDERS, HEMOGLOBIN_BUILDERS, isHemoglobinData } from '../src/viewer/deep-scenes';
import { buildMoleculeAtoms, buildMoleculeWhole, isMoleculeData, type MoleculeData } from '../src/viewer/molecule-scenes';
import { ORGANELLE_BUILDERS, withWays } from '../src/viewer/organelle-scenes';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const TISSUE_BUILDERS = { ...FIRST_BUILDERS, ...MORE_TISSUE_BUILDERS, ...DEEP_BUILDERS, ...ORGANELLE_BUILDERS };
const hemoglobin = JSON.parse(await readFile(new URL('../public/scale-journey/hemoglobin-3hrw.json', import.meta.url), 'utf8'));
const TISSUES: readonly JourneyTissue[] = ['cochlea', 'whisker', 'pancreas', 'muscle', 'nerve', 'artery', 'vein', 'bone', 'fat', 'liver', 'kidney', 'lung', 'gut', 'heart', 'brain', 'cartilage', 'tendon', 'membrane', 'gland', 'endocrine', 'thyroid', 'lymphoid', 'colon', 'stomach', 'urothelium', 'airway', 'retina', 'cornea', 'lens', 'tooth', 'testis', 'blood'];
const TAILS = JOURNEY_TAILS;
const moleculeFile = async (key: string) => JSON.parse(await readFile(new URL(`../public/scale-journey/molecule-${key}.json`, import.meta.url), 'utf8')) as MoleculeData;

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
    if (level.molecule) continue;
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
    'inner-ears': 'cochlea', 'middle-ears': 'bone', 'whisker-follicles': 'whisker', vibrissae: 'whisker', 'dural-venous-sinuses': 'vein', 'meningeal-lymphatics': 'vein', 'bone-vomer': 'bone',
    'calcaneal-tendons': 'tendon', peritoneum: 'membrane', pancreas: 'pancreas', 'pancreatic-ducts': 'gland', thyroid: 'thyroid', adrenals: 'endocrine', retinas: 'retina', corneas: 'cornea', lenses: 'lens', incisors: 'tooth', 'testis-left': 'testis', veins: 'blood', 'stomach-pyloric': 'stomach', diaphragm: 'muscle', 'spinal-cord': 'brain',
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

test('from the cells of each tissue there is a way to a molecule of its own, and playing takes it', () => {
  for (const tissue of ['skin', ...TISSUES] as JourneyTissue[]) {
    const own = ownWayOf(tissue);
    const levels = journeyLevels(tissue, own);
    assert.equal(levels[levels.length - 1].id, 'proton', tissue);
    assert.equal(new Set(levels.map((level) => level.id)).size, levels.length, tissue);
    if (own === 'nucleus') continue;
    const route = journeyLevels(tissue, 'nucleus'), id = route[route.findIndex((level) => level.id === 'nucleus') - 1].id;
    const build = TISSUE_BUILDERS[id] ?? (JOURNEY_BUILDERS[id] as () => ReturnType<typeof withWays>);
    const scene = withWays(id, build());
    assert.ok(scene.branches?.some((branch) => branch.tail === own), `${tissue}: ${id} has the way to ${own}`);
  }
  for (const [tissue, way] of [['pancreas', 'insulin'], ['whisker', 'touch'], ['cochlea', 'tiplink'], ['thyroid', 'thyroglobulin'], ['testis', 'ribosome'], ['gland', 'ribosome'], ['urothelium', 'junction'], ['membrane', 'junction'], ['tooth', 'collagen'], ['muscle', 'sarcomere'], ['heart', 'sarcomere'], ['nerve', 'axon'], ['artery', 'blood'], ['bone', 'collagen'], ['tendon', 'collagen'], ['brain', 'synapse'], ['retina', 'disc'], ['lens', 'crystallin'], ['kidney', 'water'], ['lung', 'surfactant'], ['stomach', 'pump'], ['airway', 'cilium'], ['fat', 'droplet'], ['lymphoid', 'antibody'], ['liver', 'secretion'], ['colon', 'microbiota'], ['skin', 'keratin']] as const) assert.equal(ownWayOf(tissue), way, tissue);
});

test('every way on that is added lies in its scene', () => {
  for (const id of [...new Set((['skin', ...TISSUES] as JourneyTissue[]).flatMap((tissue) => TAILS.flatMap((tail) => journeyLevels(tissue, tail).map((level) => level))).filter((level) => !level.molecule).map((level) => level.id))]) {
    const build = TISSUE_BUILDERS[id] ?? (id === 'cell' ? JOURNEY_BUILDERS.cell : undefined);
    if (!build) continue;
    const scene = withWays(id, (build as () => ReturnType<typeof withWays>)());
    if (!scene.branches?.length) continue;
    scene.group.updateMatrixWorld(true);
    const room = new THREE.Box3().setFromObject(scene.group);
    room.expandByScalar(room.getSize(new THREE.Vector3()).length() * 0.05);
    for (const branch of scene.branches) {
      assert.ok(room.containsPoint(branch.at), id + ' ' + branch.text);
      assert.ok(TAILS.includes(branch.tail), branch.tail);
    }
  }
});

test('a bacterium goes on to its own molecule by way of the outer membrane and to its DNA otherwise', () => {
  const scene = withWays('bacterium', TISSUE_BUILDERS.bacterium());
  assert.equal(scene.homeTail, 'microbiota');
  assert.deepEqual(scene.branches?.map((branch) => branch.tail), ['importer']);
  assert.ok(journeyLevels('colon', 'importer').some((level) => level.id === 'nutrient-importer-whole'));
  assert.ok(!journeyLevels('colon', 'importer').some((level) => level.id === 'nucleus'));
});

test('each level of measured atoms has a valid file with a checked source, and says what the sample was', async () => {
  const seen = new Set<string>();
  for (const tail of TAILS) for (const level of journeyLevels('muscle', tail)) {
    if (!level.molecule) continue;
    assert.equal(level.evidence, 'measured-elsewhere', level.id);
    const data = await moleculeFile(level.molecule);
    const valid = isMoleculeData(data as unknown, level.molecule), refused = !isMoleculeData(data as unknown, 'another');
    assert.ok(valid, level.id);
    assert.ok(refused, 'a file for another molecule is refused');
    assert.match(data.source.citation, /doi:10\.\d+\/|PMID \d+/, level.id);
    assert.ok(level.basis.some((source) => source.split(/doi:|PMID /)[1] === data.source.citation.split(/doi:|PMID /)[1]), level.id + ' names the paper of its entry');
    if (level.moleculeView === 'whole') assert.match(level.caption, new RegExp(data.source.entry), level.id + ' names its entry');
    seen.add(level.molecule);
    const scene = level.moleculeView === 'atoms' ? buildMoleculeAtoms(data) : buildMoleculeWhole(data);
    assert.equal(scene.animate, undefined, level.id + ' has no motion, since it is a measured structure');
    assert.ok(scene.labels.length >= 2, level.id);
    scene.group.updateMatrixWorld(true);
    const room = new THREE.Box3().setFromObject(scene.group);
    room.expandByScalar(room.getSize(new THREE.Vector3()).length() * 0.05);
    assert.ok(room.containsPoint(scene.focus), level.id);
    for (const label of scene.labels) assert.ok(room.containsPoint(label.at), level.id + ' ' + label.text);
  }
  assert.equal(seen.size, 24);
  // A molecule that is not of the mouse says so where it is shown.
  const caption = (tail: JourneyTail) => journeyLevels('muscle', tail).find((level) => level.moleculeView === 'whole')!.caption;
  assert.match(caption('sarcomere'), /rabbit/);
  assert.match(caption('collagen'), /synthetic/);
  assert.match(caption('axon'), /of the rat and not of the mouse/);
  assert.match(caption('disc'), /of the cow and not of the mouse/);
  assert.match(caption('water'), /of the cow and not of the mouse/);
  assert.match(caption('cilium'), /of the cow and not of the mouse/);
  assert.match(caption('pump'), /of the pig and not of the mouse/);
  assert.match(caption('keratin'), /of humans and not of the mouse/);
  assert.match(caption('thyroglobulin'), /of the cow and not of the mouse/);
  assert.match(caption('insulin'), /of the pig and not of the mouse/);
  assert.match(caption('importer'), /no claim is made that this species is in this mouse/);
  for (const tail of ['mitochondrion', 'synapse', 'antibody', 'droplet', 'crystallin', 'secretion', 'surfactant', 'ribosome', 'junction', 'proteasome', 'tiplink', 'touch', 'mhc'] as const) assert.match(caption(tail), /mouse/, tail);
});

test('every atom of a molecule file is from its source, and a damaged file is refused', async () => {
  const data = await moleculeFile('rhodopsin');
  assert.equal(data.source.entry, '1F88');
  assert.equal(data.source.organisms, 'Bos taurus');
  const refused = (value: unknown) => !isMoleculeData(value, 'rhodopsin');
  assert.ok(refused({ ...data, x: data.x.slice(1) }));
  assert.ok(refused({ ...data, focusAtom: data.x.length }));
  assert.ok(refused({ ...data, group: data.group.map(() => 99) }));
  assert.ok(refused(null));
  // Retinal is what the zoom into rhodopsin ends on.
  assert.equal(data.groups[data.group[data.focusAtom]].name, 'Retinal');
  const channel = await moleculeFile('potassium-channel');
  assert.equal(channel.elements[channel.element[channel.focusAtom]], 'K');
  const place = (index: number) => [channel.x[index], channel.y[index], channel.z[index], channel.element[index]].join();
  const ions = channel.x.map((_, index) => index).filter((index) => channel.elements[channel.element[index]] === 'K');
  assert.equal(new Set(ions.map(place)).size, ions.length, 'an ion on the axis is kept once');
});
