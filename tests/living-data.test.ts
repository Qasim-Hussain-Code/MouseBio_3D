import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import sourceCatalog from '../data/anatomy-references.json';
import constructedCatalog from '../data/constructed-references.json';
import { blob, curve, route } from '../scripts/living/internal';
import { surfaceMeasures } from '../scripts/living/surface-nets';
import { classifyVoxel, TRACED } from '../scripts/living/trace';
import { declaresEvidence, evidenceGroups, evidenceOf, labelWithEvidence, toggledEvidence } from '../src/domain/evidence';
import { bodySurfaceIdFor, displayPostureFor, opensAsSkin } from '../src/domain/display-pose';
import { coveredBySkin } from '../src/domain/reference-display';
import type { Atlas } from '../src/domain/types';
import { COATS, createFur, FUR_DISPLAY, hasFurAttribute } from '../src/viewer/fur';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const glb = await readFile(new URL('../public/atlas-living/living-mouse.glb', import.meta.url));

const glbDocument = () => {
  const length = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + length).toString('utf8')) as { nodes: { mesh: number; extras: { structureId: string } }[]; meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[]; accessors: { count: number }[] };
};

test('the manifest binds the exact geometry, and the geometry holds exactly the declared structures', () => {
  assert.equal(atlas.statistics.glbBytes, glb.length);
  assert.equal(atlas.statistics.glbSha256, createHash('sha256').update(glb).digest('hex'));
  assert.equal(glb.toString('latin1', 0, 4), 'glTF');
  const document = glbDocument();
  assert.deepEqual(document.nodes.map((node) => node.extras.structureId), atlas.structures.map((structure) => structure.id));
  let triangles = 0;
  document.nodes.forEach((node, index) => {
    const count = document.accessors[document.meshes[node.mesh].primitives[0].indices].count / 3;
    const { geometry } = atlas.structures[index] as unknown as { geometry: { triangles: number } };
    assert.equal(count, geometry.triangles, atlas.structures[index].id);
    triangles += count;
  });
  assert.equal(atlas.statistics.triangles, triangles);
});

test('every structure declares its evidence, its basis and, when simulated, says so in its own description', () => {
  assert.equal(declaresEvidence(atlas), true);
  const counts = { source: 0, traced: 0, simulated: 0 };
  for (const structure of atlas.structures) {
    assert.ok(structure.evidence, structure.id);
    assert.ok(structure.basis?.length, structure.id);
    counts[structure.evidence!]++;
    if (structure.evidence === 'simulated') {
      assert.match(structure.description!, /^Simulated\./, structure.id);
      assert.match(String(structure.sourceLabel), /simulated/, structure.id);
    }
    if (structure.evidence === 'traced') assert.match(structure.description!, /[Tt]raced|isosurface|outer surface/, structure.id);
    for (const reference of structure.basis!) assert.match(reference, /Cook|Hummel|Greene|Dogdas/, reference);
  }
  assert.ok(counts.source >= 15 && counts.traced >= 5 && counts.simulated >= 30, JSON.stringify(counts));
});

test('rat anatomy is never cited without saying that it is the rat', () => {
  for (const structure of atlas.structures) for (const reference of structure.basis ?? []) {
    if (reference.includes('Greene')) assert.match(reference, /describes the rat, not the mouse/);
  }
});

test('the frame and limitations state the simulated posture and the absence of verification', () => {
  const frame = atlas.coordinateFrame;
  assert.equal(frame.posture, 'simulated');
  assert.equal(frame.physicalCalibrationVerified, false);
  assert.equal(frame.anatomicalOrientationVerified, false);
  assert.match(atlas.limitations.join(' '), /constructed model and not a measurement of a living mouse/);
  assert.match(atlas.limitations.join(' '), /posture is simulated/);
  assert.match(atlas.specimen?.description ?? '', /coat is simulated/);
});

test('the constructed reference has its own catalog and stays out of the source catalog', () => {
  assert.ok(!sourceCatalog.some((entry) => entry.id === atlas.id));
  assert.deepEqual(constructedCatalog.map((entry) => entry.id), [atlas.id]);
  assert.equal(constructedCatalog[0].assetSha256, atlas.statistics.glbSha256);
  assert.equal(constructedCatalog[0].coverage.regionCount, atlas.structures.length);
});

test('evidence labels, groups and toggling', () => {
  assert.equal(evidenceOf({}), 'source');
  assert.equal(labelWithEvidence({ name: 'Aorta', evidence: 'simulated' }), 'Aorta (simulated)');
  assert.equal(labelWithEvidence({ name: 'Veins', evidence: 'traced' }), 'Veins (traced)');
  assert.equal(labelWithEvidence({ name: 'Heart', evidence: 'source' }), 'Heart');
  assert.equal(declaresEvidence({ structures: [{ id: 'a', name: 'a', systems: [], sourceLabel: 1, meshNode: 'a' }] }), false);
  const groups = evidenceGroups(atlas, []);
  assert.deepEqual(groups.map((group) => group.evidence), ['source', 'traced', 'simulated']);
  assert.equal(groups.reduce((sum, group) => sum + group.ids.length, 0), atlas.structures.length);
  const simulated = groups[2];
  const hidden = toggledEvidence(['living:heart'], simulated);
  assert.equal(hidden.length, simulated.ids.length + 1);
  assert.deepEqual(toggledEvidence(hidden, evidenceGroups(atlas, hidden)[2]), ['living:heart']);
});

test('the living mouse opens as skin with exterior parts outside it, and inner parts covered', () => {
  assert.equal(bodySurfaceIdFor(atlas), 'living:skin');
  assert.equal(opensAsSkin(atlas), true);
  assert.equal(displayPostureFor(atlas)?.frameOnBody, true);
  const exterior = atlas.structures.filter((structure) => structure.exterior).map((structure) => structure.id);
  for (const id of ['living:eyes', 'living:pinnae', 'living:vibrissae', 'living:forepaws', 'living:hindpaws', 'living:tail', 'living:nose', 'living:claws']) assert.ok(exterior.includes(id), id);
  for (const id of ['living:heart', 'living:aorta', 'living:skeleton', 'living:spinal-cord']) assert.ok(!exterior.includes(id), id);
  assert.equal(coveredBySkin('living:aorta', 'living:skin', true, 1, 'off', false), true);
  assert.equal(coveredBySkin('living:eyes', 'living:skin', true, 1, 'off', true), false);
});

test('tissue rules separate the colours and densities seen in the source images', () => {
  // Sampled from the slices: gut contents, muscle, dark blood, fat by density, and air.
  assert.equal(classifyVoxel(96, 64, 13, 120, 30, true), TRACED.gut);
  assert.equal(classifyVoxel(84, 62, 5, 120, 30, false), TRACED.muscle, 'the same colour outside the abdominal cavity is not gut');
  assert.equal(classifyVoxel(111, 70, 50, 120, 30, false), TRACED.muscle);
  assert.equal(classifyVoxel(111, 70, 50, 120, 30, true), TRACED.connective);
  assert.equal(classifyVoxel(50, 23, 14, 120, 30, false), TRACED.blood);
  assert.equal(classifyVoxel(160, 145, 115, 60, 30, false), TRACED.fat);
  assert.equal(classifyVoxel(120, 100, 90, 8, 30, false), TRACED.airway);
  // Tan loops count as gut only inside the abdominal cavity, and the outer shell is left to the skin.
  assert.equal(classifyVoxel(150, 115, 70, 120, 30, true), TRACED.gut);
  assert.equal(classifyVoxel(150, 115, 70, 120, 30, false), TRACED.muscle);
  assert.equal(classifyVoxel(96, 64, 13, 120, 2, true), TRACED.connective);
  assert.equal(classifyVoxel(96, 64, 13, 120, 8, true), TRACED.connective, 'not within the abdominal wall');
});

test('routes pass through their control points, taper, and close; bodies have the expected volume', () => {
  const controls = [[0, 0, 0], [30, 0, 0], [30, 30, 0]] as const;
  const points = curve(controls);
  assert.deepEqual(points[0], [0, 0, 0]);
  assert.deepEqual(points.at(-1), [30, 30, 0]);
  assert.ok(points.some((p) => Math.hypot(p[0] - 30, p[1], p[2]) < 1e-9));
  const straight = route([[0, 0, 0], [50, 0, 0], [100, 0, 0]], 5, 5, 16);
  const { volume } = surfaceMeasures(straight);
  assert.ok(Math.abs(volume / (Math.PI * 25 * 100) - 1) < 0.03, `tube volume ${volume}`);
  const body = blob([1, 2, 3], [4, 5, 6], 40, 60);
  assert.ok(Math.abs(surfaceMeasures(body).volume / (4 / 3 * Math.PI * 120) - 1) < 0.01);
});

test('the coat needs hair directions, repeats the skin in shells, and shares its buffers', () => {
  const bare = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  assert.equal(hasFurAttribute(bare.geometry), false);
  assert.equal(createFur(bare, new THREE.Vector3(0, 0, 1)), null);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.setAttribute('_fur', new THREE.BufferAttribute(new Float32Array(4 * geometry.getAttribute('position').count), 4));
  const skin = new THREE.Mesh(geometry);
  const fur = createFur(skin, new THREE.Vector3(0, 0, 1))!;
  assert.ok(fur);
  const instanced = fur.mesh.geometry as THREE.InstancedBufferGeometry;
  assert.equal(instanced.instanceCount, FUR_DISPLAY.shells);
  assert.equal(instanced.getAttribute('position'), geometry.getAttribute('position'));
  assert.equal(fur.mesh.parent, skin);
  assert.deepEqual(Object.keys(COATS).sort(), ['agouti', 'albino', 'black']);
  fur.dispose();
  assert.equal(skin.children.length, 0);
  assert.ok(geometry.getAttribute('position'), 'the skin keeps its geometry');
});
