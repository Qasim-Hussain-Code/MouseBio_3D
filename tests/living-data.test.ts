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
import { declaresEvidence, evidenceGroups, evidenceMark, evidenceOf, labelWithEvidence, toggledEvidence } from '../src/domain/evidence';
import { bodySurfaceIdFor, displayPostureFor, opensAsSkin } from '../src/domain/display-pose';
import { coveredBySkin, initialReferenceSelection } from '../src/domain/reference-display';
import type { Atlas } from '../src/domain/types';
import { COATS, createFur, FUR_DISPLAY, hasFurAttribute, scatterHairs } from '../src/viewer/fur';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const glb = await readFile(new URL('../public/atlas-living/living-mouse.glb', import.meta.url));

const glbDocument = () => {
  const length = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + length).toString('utf8')) as { nodes: { mesh: number; extras: { structureId: string } }[]; meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[]; accessors: { count: number }[] };
};

/** Vertices of one structure, in millimetres, read from the binary part of the file. */
const verticesOf = (id: string): number[][] => {
  const length = glb.readUInt32LE(12);
  const document = JSON.parse(glb.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { mesh: number; extras: { structureId: string } }[]; meshes: { primitives: { attributes: Record<string, number> }[] }[];
    accessors: { bufferView: number; byteOffset?: number; count: number }[]; bufferViews: { byteOffset?: number; byteStride?: number }[];
  };
  const node = document.nodes.find((entry) => entry.extras.structureId === id);
  assert.ok(node, id);
  const accessor = document.accessors[document.meshes[node.mesh].primitives[0].attributes.POSITION];
  const view = document.bufferViews[accessor.bufferView];
  const start = 20 + length + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? 12;
  return Array.from({ length: accessor.count }, (_, i) => [0, 4, 8].map((step) => glb.readFloatLE(start + i * stride + step) * 1000));
};
const nearestTo = (point: number[], others: number[][]) => others.reduce((best, other) => Math.min(best, Math.hypot(point[0] - other[0], point[1] - other[1], point[2] - other[2])), Infinity);

test('the fibulae are traced apart from the tibiae, and each patella lies at a knee', () => {
  const named = (id: string) => atlas.structures.find((structure) => structure.id === id)!;
  for (const side of ['r', 'l']) {
    const fibula = named(`living:bone-fibula-${side}`), tibia = named(`living:bone-tibia-${side}`);
    assert.equal(fibula.evidence, 'traced');
    assert.match(fibula.description ?? '', /estimates/);
    assert.doesNotMatch(tibia.name, /fibula/);
    const away = verticesOf(fibula.id).filter((point, index) => index % 3 === 0);
    const shin = verticesOf(tibia.id);
    assert.ok(away.filter((point) => nearestTo(point, shin) > 0.8).length > away.length / 2, 'most of a fibula lies away from the tibia');
  }
  const patellae = named('living:patellae');
  assert.equal(patellae.evidence, 'simulated');
  assert.ok(patellae.basis?.length);
  const femurs = [verticesOf('living:bone-femur-r'), verticesOf('living:bone-femur-l')];
  for (const point of verticesOf(patellae.id).filter((_, index) => index % 11 === 0)) {
    assert.ok(Math.min(...femurs.map((femur) => nearestTo(point, femur))) < 2, 'a patella lies against a femur');
  }
});

test('the nose, throat and salivary glands follow their stated source, and the salivary glands are three pairs', () => {
  const hummel = /^Hummel KP/;
  for (const id of ['submandibular-glands', 'sublingual-glands', 'parotid-glands', 'nasal-cavities', 'turbinals', 'soft-palate', 'pharynx']) {
    const structure = atlas.structures.find((entry) => entry.id === `living:${id}`);
    assert.ok(structure, id);
    assert.equal(structure.evidence, 'simulated');
    assert.match(structure.description ?? '', /^Simulated\./);
    assert.ok(structure.basis?.some((reference) => hummel.test(reference)), id);
  }
  assert.equal(atlas.structures.find((entry) => entry.id === 'living:salivary-glands'), undefined);
  const centre = (id: string) => {
    const points = verticesOf(id);
    return [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
  };
  // The body lies along the second axis, with the head towards low values.
  assert.ok(centre('living:sublingual-glands')[1] < centre('living:submandibular-glands')[1], 'the sublingual glands lie in front of the submandibular glands');
  assert.ok(centre('living:nasal-cavities')[1] < centre('living:pharynx')[1], 'the nasal cavities lie in front of the pharynx');
});

test('the gut holds no piece far from the abdomen, and the muscles of the eye and calcaneal tendons name their basis', () => {
  const skin = verticesOf('living:skin');
  const middle = skin.reduce((sum, point) => sum + point[0], 0) / skin.length;
  for (const point of verticesOf('living:colon')) assert.ok(Math.abs(point[0] - middle) < 5, 'the colon stays near the midline');
  for (const point of verticesOf('living:small-intestine')) assert.ok(point[1] > 45, 'the small intestine stays behind the chest');
  for (const [id, reference] of [['extraocular-muscles', /^Marques MJ/], ['calcaneal-tendons', /^Sakabe T/]] as const) {
    const structure = atlas.structures.find((entry) => entry.id === `living:${id}`);
    assert.ok(structure, id);
    assert.equal(structure.evidence, 'simulated');
    assert.match(structure.description ?? '', /^Simulated\./);
    assert.ok(structure.basis?.some((item) => reference.test(item)), id);
  }
});

test('the new small structures are marked as simulated and name their basis', () => {
  for (const id of ['middle-ears', 'pineal', 'parathyroids', 'adrenal-medullae', 'mammary-arteries', 'mammary-veins']) {
    const structure = atlas.structures.find((entry) => entry.id === `living:${id}`);
    assert.ok(structure, id);
    assert.equal(structure.evidence, 'simulated');
    assert.match(structure.description ?? '', /^Simulated\./);
    assert.ok(structure.basis?.length);
  }
});

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
    if (structure.division) assert.match(structure.description!, /estimate/, structure.id);
    for (const reference of structure.basis!) assert.match(reference, /Cook|Hummel|Greene|Dogdas|Charles|O'Connell|Fuller|Marques|Stuelsatz|Sakabe|Kochi|Rigaud|Shields|Oliviero|Dyment|Jilka|Sauter|Furness|Kimoto|Mauris|Ebara|Louveau|Carlson|Parkinson|Machholz/, reference);
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
  assert.equal(labelWithEvidence({ name: 'Liver, left lobe', evidence: 'source', division: 'estimated' }), 'Liver, left lobe (estimated division)');
  assert.equal(evidenceMark({ evidence: 'traced', division: 'estimated' }), 'Traced, division estimated');
  assert.equal(evidenceMark({ evidence: 'simulated' }), 'Simulated');
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
  for (const id of ['living:heart-lv', 'living:aorta', 'living:bone-frontal', 'living:spinal-cord']) assert.ok(!exterior.includes(id), id);
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

test('the coat needs hair directions, scatters hairs by area, skips bare skin and repeats exactly', () => {
  const bare = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  assert.equal(hasFurAttribute(bare.geometry), false);
  assert.equal(createFur(bare), null);
  const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const vertices = geometry.getAttribute('position').count;
  const directions = new Float32Array(4 * vertices);
  for (let i = 0; i < vertices; i++) directions.set([0, 1, 0, geometry.getAttribute('position').getX(i) > 0 ? 1 : 1], 4 * i);
  geometry.setAttribute('_fur', new THREE.BufferAttribute(directions, 4));
  const skin = new THREE.Mesh(geometry);
  const fur = createFur(skin)!;
  assert.ok(fur);
  const instanced = fur.mesh.geometry as THREE.InstancedBufferGeometry;
  // Six faces of 1 cm: 600 square millimetres at the stated density.
  assert.ok(Math.abs(fur.hairs / (6e-4 * FUR_DISPLAY.density) - 1) < 0.01, String(fur.hairs));
  assert.equal(instanced.instanceCount, fur.hairs);
  assert.equal(fur.mesh.parent, skin);
  fur.setDetail(0.25);
  assert.equal(instanced.instanceCount, Math.round(fur.hairs * 0.25));
  assert.equal(fur.detail(), 0.25);
  fur.setDetail(1);
  assert.equal(instanced.instanceCount, fur.hairs);
  const first = scatterHairs(geometry), second = scatterHairs(geometry);
  // The first share of hairs reaches every face of the box, so that thinning keeps the coat over the whole body.
  const share = Math.round(first.count * 0.1);
  const faces = new Set<string>();
  for (let i = 0; i < share; i++) for (let k = 0; k < 3; k++) if (Math.abs(first.roots[3 * i + k]) > 0.00499) faces.add(`${k}${Math.sign(first.roots[3 * i + k])}`);
  assert.equal(faces.size, 6);
  assert.deepEqual([...first.roots.slice(0, 30)], [...second.roots.slice(0, 30)]);
  for (let i = 0; i < first.count; i += 97) for (let k = 0; k < 3; k++) assert.ok(Math.abs(first.roots[3 * i + k]) <= 0.00501);
  // Hair length zero everywhere means no hairs.
  const shorn = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  shorn.setAttribute('_fur', new THREE.BufferAttribute(new Float32Array(4 * vertices), 4));
  assert.equal(scatterHairs(shorn).count, 0);
  assert.deepEqual(Object.keys(COATS).sort(), ['agouti', 'albino', 'black']);
  fur.dispose();
  assert.equal(skin.children.length, 0);
  assert.ok(geometry.getAttribute('position'), 'the skin keeps its geometry');
});

test('the model opens with its body surface selected', () => {
  assert.equal(initialReferenceSelection(atlas), 'living:skin');
});

test('the joints, marrow and small parts lie where they are described, and say what they are', () => {
  const NEW = ['articular-cartilage', 'menisci', 'patellar-tendons', 'marrow', 'peyers-patches', 'enteric-plexus', 'vomeronasal-organs', 'meibomian-glands'];
  for (const name of NEW) {
    const structure = atlas.structures.find((item) => item.id === 'living:' + name)!;
    assert.ok(structure, name);
    assert.equal(structure.evidence, 'simulated', name);
    assert.match(structure.description!, /^Simulated\./, name);
    assert.match(structure.description!, /Not measured from this specimen\.$/, name);
    assert.equal(structure.exterior, false, name);
    assert.ok(structure.basis!.some((source) => /doi:10\.\d+\//.test(source)), name + ' names a source');
  }
  const near = (id: string, others: readonly string[], most: number, every = 7) => {
    const targets = others.flatMap((other) => verticesOf('living:' + other));
    const points = verticesOf('living:' + id);
    for (let index = 0; index < points.length; index += every) assert.ok(nearestTo(points[index], targets) < most, id + ' vertex ' + index + ' is ' + nearestTo(points[index], targets).toFixed(2) + ' mm from ' + others.join());
  };
  // Marrow is close inside the long bones: never further from a surface of bone than the thickness of the shaft, and inside their bounds.
  const bones = ['bone-femur-r', 'bone-femur-l', 'bone-tibia-r', 'bone-tibia-l', 'bone-humerus-r', 'bone-humerus-l'];
  near('marrow', bones, 1.2, 11);
  const boxes = bones.map((bone) => (atlas.structures.find((item) => item.id === 'living:' + bone) as unknown as { geometry: { boundsMeters: number[][] } }).geometry.boundsMeters);
  for (const point of verticesOf('living:marrow')) {
    assert.ok(boxes.some(([low, high]) => point.every((value, axis) => value >= low[axis] * 1000 - 0.15 && value <= high[axis] * 1000 + 0.15)), 'marrow at ' + point.map((value) => value.toFixed(1)));
  }
  near('peyers-patches', ['small-intestine'], 1.6, 13);
  near('enteric-plexus', ['small-intestine', 'caecum', 'colon'], 1.2, 97);
  near('menisci', ['bone-femur-r', 'bone-femur-l', 'bone-tibia-r', 'bone-tibia-l'], 2.5, 5);
  near('patellar-tendons', ['patellae', 'bone-tibia-r', 'bone-tibia-l'], 2.5, 5);
  near('meibomian-glands', ['eyes'], 0.6, 5);
  near('vomeronasal-organs', ['bone-premaxilla', 'bone-maxilla'], 1.2, 3);
  near('vomeronasal-organs', ['nasal-cavities'], 1, 3);
});

test('the follicles, sinuses, lymphatics and small bones of the head lie where they are described, and say what they are', () => {
  for (const name of ['whisker-follicles', 'dural-venous-sinuses', 'meningeal-lymphatics', 'bone-vomer', 'bone-ethmoid', 'bone-lacrimal']) {
    const structure = atlas.structures.find((item) => item.id === 'living:' + name)!;
    assert.ok(structure, name);
    assert.equal(structure.evidence, 'simulated', name);
    assert.match(structure.description!, /^Simulated\./, name);
    assert.match(structure.description!, /Not measured from this specimen\.$/, name);
    assert.equal(structure.exterior, false, name);
    assert.ok(structure.basis!.length > 0, name);
  }
  const near = (id: string, others: readonly string[], most: number, every = 7) => {
    const targets = others.flatMap((other) => verticesOf('living:' + other));
    const points = verticesOf('living:' + id);
    for (let index = 0; index < points.length; index += every) assert.ok(nearestTo(points[index], targets) < most, id + ' vertex ' + index + ' is ' + nearestTo(points[index], targets).toFixed(2) + ' mm from ' + others.join());
  };
  near('whisker-follicles', ['muscle-mystacial', 'lips', 'skin'], 1.6, 23);
  near('bone-vomer', ['nasal-cavities', 'bone-palatine', 'bone-maxilla'], 1.5, 5);
  near('bone-ethmoid', ['olfactory', 'nasal-cavities', 'olfactory-nerves'], 1.5, 5);
  near('bone-lacrimal', ['eyes', 'bone-maxilla', 'bone-frontal'], 1.5, 3);
  near('dural-venous-sinuses', ['meninges', 'internal-jugular-veins', 'bone-occipital', 'bone-squamosal', 'bone-bulla'], 2, 7);
  near('meningeal-lymphatics', ['dural-venous-sinuses', 'internal-jugular-veins'], 1.6, 11);
});
