import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { JOURNEY_LEVELS, journeyLevels, journeyTissueOf, levelAim, levelAt, levelFade, levelHome, type JourneyTissue } from '../src/domain/scale-journey';
import type { Atlas } from '../src/domain/types';
import { JOURNEY_BUILDERS } from '../src/viewer/scale-journey-scenes';
import { TISSUE_BUILDERS } from '../src/viewer/tissue-scenes';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const TISSUES: readonly JourneyTissue[] = ['muscle', 'nerve', 'artery', 'vein', 'bone', 'fat', 'liver', 'kidney', 'lung', 'gut', 'heart', 'brain'];

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

test('each route covers every view height, with each level whole at its best view and its neighbours gone', () => {
  for (const tissue of TISSUES) {
    const levels = journeyLevels(tissue);
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
    for (const source of level.basis) assert.match(source, /doi:10\.\d+\//, source);
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
  for (const tissue of TISSUES) for (const level of journeyLevels(tissue)) {
    const build = TISSUE_BUILDERS[level.id];
    if (!build) { assert.ok(JOURNEY_BUILDERS[level.id], level.id); continue; }
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

test('a route that says the mouse has no osteons draws none, and a white fat cell has one droplet', () => {
  const labels = (id: string) => TISSUE_BUILDERS[id]().labels.map((label) => label.text).join(' | ');
  assert.doesNotMatch(labels('bone-block'), /[Oo]steon|Haversian/);
  assert.match(labels('fat-cells'), /One droplet of fat/);
  assert.match(labels('nerve-fibres'), /Schwann/);
  assert.match(labels('artery-wall'), /Elastic lamina/);
  assert.doesNotMatch(labels('vein-wall'), /Elastic lamina/);
});

test('a structure goes on to the tissue it is mostly made of, and is told when there is none yet', () => {
  const of = (id: string) => journeyTissueOf(atlas.structures.find((structure) => structure.id === `living:${id}`)!);
  const expected: Readonly<Record<string, JourneyTissue | null>> = {
    skin: 'skin', 'muscle-biceps-femoris': 'muscle', masseter: 'muscle', 'bone-femur-r': 'bone', 'sciatic-nerves': 'nerve', 'brachial-plexus': 'nerve', 'femoral-arteries': 'artery', aorta: 'artery',
    'femoral-veins': 'vein', 'superior-venae-cavae': 'vein', 'portal-vein': 'vein', fat: 'fat', 'brown-fat': 'fat', 'liver-median': 'liver', 'kidney-right': 'kidney', 'lung-left': 'lung',
    'small-intestine': 'gut', 'heart-lv': 'heart', cerebrum: 'brain', cerebellum: 'brain',
    // The small intestine route has villi, so it does not stand for the colon, and no route has been made for these.
    colon: null, spleen: null, bladder: null, 'heart-valves': null, 'brain-ventricles': null,
  };
  for (const [id, tissue] of Object.entries(expected)) assert.equal(of(id), tissue, id);
  const routed = atlas.structures.filter((structure) => journeyTissueOf(structure));
  assert.ok(routed.length > atlas.structures.length * 0.7, `${routed.length} of ${atlas.structures.length}`);
});
