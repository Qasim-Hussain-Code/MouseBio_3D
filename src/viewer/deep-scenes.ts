import * as THREE from 'three';
import { instances, material, merged, random, shade, solid, sphere, tubeGeometry, uniform, V, type JourneyLabel, type JourneyScene, type NucleosomeData, type Placement, type TissueMotion } from './scale-journey-scenes';
import { carried, finish, withMotion } from './tissue-scenes';

/**
 * Where the zoom goes when it follows blood or the bacteria of the gut instead of a cell nucleus. Only the two levels built from the
 * coordinates of Protein Data Bank entry 3HRW show measured positions. The others are generated with a fixed seed, and none is a measurement.
 */
export interface HemoglobinData extends NucleosomeData { readonly heme: readonly number[] }

export function isHemoglobinData(value: unknown): value is HemoglobinData {
  const data = value as HemoglobinData | null;
  if (!data || typeof data !== 'object' || data.source?.entry !== '3HRW') return false;
  const count = data.x?.length;
  return Number.isInteger(count) && count > 0 && [data.y, data.z, data.element, data.chain, data.residue, data.name, data.heme].every((column) => column?.length === count)
    && Number.isInteger(data.focusAtom) && data.focusAtom >= 0 && data.focusAtom < count && data.elements[data.element[data.focusAtom]].toUpperCase() === 'FE';
}

const ELEMENT_COLOUR: Readonly<Record<string, string>> = Object.freeze({ C: '#6e6e6e', N: '#3a55d9', O: '#d9382e', S: '#dcb82d', FE: '#d9731f' });
const VAN_DER_WAALS: Readonly<Record<string, number>> = Object.freeze({ C: 1.7, N: 1.55, O: 1.52, S: 1.8, FE: 1.5 });
const CHAIN_COLOUR: Readonly<Record<string, string>> = Object.freeze({ 'Hemoglobin alpha': '#d97f7f', 'Hemoglobin beta': '#8fb2dc' });

/** A red cell, 5 micrometres to the unit, cut open: a disc thinner at its middle, with its neighbours beside it. */
export function buildRedCell(): JourneyScene {
  const group = new THREE.Group();
  const profile: THREE.Vector2[] = [];
  const R = 0.58;
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, r = R * Math.sin(t * Math.PI / 2);
    // A disc thinner at its middle than at its rim. The curve is a choice and is not a measured shape.
    const half = 0.09 * Math.sqrt(Math.max(0, 1 - (r / R) ** 2)) * (0.45 + 1.5 * (r / R) ** 2);
    profile.push(new THREE.Vector2(r, half));
  }
  for (let i = 27; i >= 0; i--) profile.push(new THREE.Vector2(profile[i].x, -profile[i].y));
  const disc = new THREE.LatheGeometry(profile, 72);
  const cell = new THREE.Mesh(disc, solid('#c9313a', '#8f1c26'));
  cell.rotation.x = Math.PI / 2;
  const motion = cell;
  group.add(cell);
  const others: Placement[] = [];
  const rng = random(20150403);
  const placed = [V(-1.25, 0.55, -0.45), V(1.2, 0.5, -0.5), V(0.9, -0.85, -0.3), V(-0.95, -0.9, -0.6), V(0.1, 1.25, -0.7), V(-1.75, -0.2, -0.8), V(1.8, -0.2, -0.75)];
  for (const position of placed) others.push({ position, scale: V(0.58, 0.58, 0.12), rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() - 0.5, rng() - 0.5, 0)), color: shade('#c52d36', 0.9 + rng() * 0.15) });
  group.add(instances(sphere(3), material('#ffffff'), others));
  const plasma = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), material('#f6e0bd'));
  plasma.position.z = -1.2;
  group.add(plasma);
  const beat = ({ seconds }: TissueMotion) => { motion.rotation.y = 0.28 * Math.sin(seconds * 0.5); motion.rotation.x = Math.PI / 2 + 0.2 * Math.sin(seconds * 0.37 + 1); };
  return withMotion(finish(group, V(0, 0, 0), V(0.3, 0, 0.09), [
    { text: 'A red cell, with no nucleus', at: V(0.3, 0, 0.1) },
    { text: 'Its thin middle', at: V(0, 0, 0.05) },
    { text: 'Neighbouring red cells', at: placed[0] },
    { text: 'Plasma', at: V(-1.3, 1.25, -1.1) },
  ]), beat);
}

/** Inside a red cell, 300 nanometres to the unit: molecules of hemoglobin packed closely under a membrane with its skeleton. */
export function buildHemoglobinCrowd(): JourneyScene {
  const rng = random(20150404), group = new THREE.Group();
  const SIZE = 0.011, GAP = 0.024;
  const molecules: Placement[] = [];
  for (let z = 0; z < 3; z++) for (let row = -46; row <= 46; row++) for (let column = -46; column <= 46; column++) {
    const x = column * GAP + (rng() - 0.5) * 0.008, y = row * GAP + (rng() - 0.5) * 0.008;
    if (y > 0.74) continue;
    molecules.push({ position: V(x, y, 0.02 - z * GAP + (rng() - 0.5) * 0.006), scale: uniform(SIZE), color: shade(rng() < 0.5 ? '#c64a4e' : '#b53a44', 0.86 + rng() * 0.3) });
  }
  const crowd = instances(sphere(0), material('#ffffff'), molecules);
  group.add(crowd);
  const behind = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), material('#7c1a22'));
  behind.position.set(0, -0.04, -0.06);
  group.add(behind);
  const membrane = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.03, 0.4), material('#e8d8b4'));
  membrane.position.set(0, 0.79, -0.05);
  group.add(membrane);
  const skeleton: THREE.Vector3[][] = [];
  for (let i = 0; i < 18; i++) { const x = -1.1 + i * 0.13; skeleton.push([V(x, 0.77, 0.04), V(x + 0.06, 0.72, 0.042), V(x + 0.13, 0.77, 0.04)]); }
  group.add(new THREE.Mesh(merged(skeleton.map((line) => tubeGeometry(line, 0.0045, 4, 2))), material('#8f7ea8')));
  const centre = molecules.reduce((best, item) => item.position.lengthSq() < best.position.lengthSq() ? item : best, molecules[0]);
  const base = molecules.map((item) => item.position);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), identity = new THREE.Quaternion(), size = uniform(SIZE);
  // A small jostling, as a sign that these molecules are in constant motion. Its size and rate are chosen for viewing.
  const jostle = ({ seconds }: TissueMotion) => {
    base.forEach((rest, index) => {
      place.set(rest.x + 0.0016 * Math.sin(seconds * 3 + index), rest.y + 0.0016 * Math.cos(seconds * 2.4 + index * 1.7), rest.z);
      matrix.compose(place, identity, size);
      crowd.setMatrixAt(index, matrix);
    });
    crowd.instanceMatrix.needsUpdate = true;
  };
  return withMotion(finish(group, V(0, 0.1, 0.1), centre.position, [
    { text: 'Molecules of hemoglobin', at: centre.position },
    { text: 'Cell membrane', at: V(-0.5, 0.79, 0.15) },
    { text: 'Skeleton under the membrane', at: skeleton[8][1] },
  ]), jostle);
}

/** Every atom of one molecule of mouse hemoglobin at its measured position, 12 nanometres to the unit. */
export function buildHemoglobin(data: HemoglobinData): JourneyScene {
  const group = new THREE.Group();
  const toUnit = 1 / 120;
  const centre = V(0, 0, 0);
  for (let i = 0; i < data.x.length; i++) centre.add(V(data.x[i], data.y[i], data.z[i]));
  centre.multiplyScalar(1 / data.x.length);
  const placements: Placement[] = [];
  for (let i = 0; i < data.x.length; i++) {
    const chain = data.chains[data.chain[i]], element = data.elements[data.element[i]];
    const position = V(data.x[i], data.y[i], data.z[i]).sub(centre).multiplyScalar(toUnit);
    const colour = element === 'FE' ? '#f28a2c' : data.heme[i] ? '#7e1f25' : CHAIN_COLOUR[chain.name] ?? '#999999';
    placements.push({ position, scale: uniform((VAN_DER_WAALS[element] ?? 1.7) * toUnit), color: shade(colour, 1) });
  }
  group.add(instances(sphere(1), material('#ffffff', { roughness: 0.5 }), placements));
  const outermost = (test: (index: number) => boolean): THREE.Vector3 => {
    let best = V(0, 0, 0), score = -Infinity;
    for (let i = 0; i < data.x.length; i++) {
      if (!test(i)) continue;
      const value = placements[i].position.z - 0.25 * Math.abs(placements[i].position.y);
      if (value > score) { score = value; best = placements[i].position; }
    }
    return best;
  };
  const labels: JourneyLabel[] = [
    { text: 'Alpha chain', at: outermost((i) => data.chains[data.chain[i]].name === 'Hemoglobin alpha' && !data.heme[i]) },
    { text: 'Beta chain', at: outermost((i) => data.chains[data.chain[i]].name === 'Hemoglobin beta' && !data.heme[i]) },
    { text: 'A heme, with its iron', at: placements[data.focusAtom].position },
  ];
  return { group, start: V(0, 0, 0), focus: placements[data.focusAtom].position.clone(), labels };
}

/** The atoms round the iron of one heme, 3 nanometres to the unit, as balls and sticks. Bonds are inferred from distances between measured atoms. */
export function buildHeme(data: HemoglobinData): JourneyScene {
  const group = new THREE.Group();
  const toUnit = 1 / 30;
  const origin = V(data.x[data.focusAtom], data.y[data.focusAtom], data.z[data.focusAtom]);
  const key = (i: number) => `${data.chain[i]}:${data.residue[i]}`;
  const chosen = new Set<string>();
  for (let i = 0; i < data.x.length; i++) if (V(data.x[i], data.y[i], data.z[i]).distanceTo(origin) <= 5.2) chosen.add(key(i));
  const near: { index: number; at: THREE.Vector3; element: string }[] = [];
  for (let i = 0; i < data.x.length; i++) {
    const at = V(data.x[i], data.y[i], data.z[i]);
    if (chosen.has(key(i)) && at.distanceTo(origin) <= 12) near.push({ index: i, at: at.sub(origin), element: data.elements[data.element[i]] });
  }
  // The centre of the view moves on to the carbon nearest the iron, which the next level enlarges.
  const carbon = near.filter((atom) => atom.element === 'C' && data.heme[atom.index]).sort((left, right) => left.at.length() - right.at.length())[0];
  const shift = carbon ? carbon.at.clone() : V(0, 0, 0);
  const atoms: Placement[] = near.map((atom) => ({
    position: atom.at.clone().sub(shift).multiplyScalar(toUnit),
    scale: uniform((atom.element === 'FE' ? 0.78 : 0.46) * toUnit),
    color: new THREE.Color(ELEMENT_COLOUR[atom.element] ?? '#999999'),
  }));
  group.add(instances(sphere(2), material('#ffffff', { roughness: 0.35 }), atoms));
  const bonds: Placement[] = [];
  const up = V(0, 1, 0);
  for (let a = 0; a < near.length; a++) for (let b = a + 1; b < near.length; b++) {
    const between = near[b].at.clone().sub(near[a].at), length = between.length();
    const iron = near[a].element === 'FE' || near[b].element === 'FE';
    if (length < 0.8 || length > (iron ? 2.5 : 1.9)) continue;
    bonds.push({ position: near[a].at.clone().add(near[b].at).sub(shift).sub(shift).multiplyScalar(0.5 * toUnit), scale: V(0.14 * toUnit, length * toUnit, 0.14 * toUnit), rotation: new THREE.Quaternion().setFromUnitVectors(up, between.normalize()) });
  }
  group.add(instances(new THREE.CylinderGeometry(1, 1, 1, 8), material('#b9b9b9'), bonds));
  const example = (element: string, text: string): JourneyLabel | null => {
    const found = near.filter((atom) => atom.element === element && data.heme[atom.index]).sort((left, right) => left.at.length() - right.at.length())[0];
    return found ? { text, at: found.at.clone().sub(shift).multiplyScalar(toUnit) } : null;
  };
  return {
    group, start: origin.clone().sub(origin).sub(shift).multiplyScalar(toUnit), focus: V(0, 0, 0),
    labels: [{ text: 'Iron', at: shift.clone().negate().multiplyScalar(toUnit) }, { text: 'This carbon atom', at: V(0, 0, 0) }, example('N', 'Nitrogen'), example('O', 'Oxygen of the heme')].filter((label): label is JourneyLabel => !!label),
  };
}

const rodPlacement = (x: number, y: number, z: number, length: number, width: number, turn: number, colour: THREE.Color): Placement => ({
  position: V(x, y, z), scale: V(width, length, width), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), turn), color: colour,
});

/** A capsule of unit half length, for a rod-shaped bacterium. */
const capsule = () => new THREE.CapsuleGeometry(1, 2, 6, 12);

/** Bacteria in the outer mucus of the gut, 5 micrometres to the unit. Numbers and shapes are chosen for viewing, and which bacteria these are is not stated. */
export function buildMicrobes(): JourneyScene {
  const rng = random(20151101), group = new THREE.Group();
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), material('#e4edf0'));
  backdrop.position.z = -0.9;
  group.add(backdrop);
  const strands: THREE.Vector3[][] = [];
  for (let i = 0; i < 70; i++) {
    const x = (rng() - 0.5) * 3.6, y = (rng() - 0.5) * 3.6, z = -0.75 + rng() * 0.8, a = rng() * 6.28;
    strands.push(Array.from({ length: 7 }, (_, k) => V(x + Math.cos(a + k * 0.4) * k * 0.22, y + Math.sin(a + k * 0.4) * k * 0.22, z + Math.sin(k + i) * 0.05)));
  }
  group.add(new THREE.Mesh(merged(strands.map((line) => tubeGeometry(line, 0.006, 4, 1))), material('#bfd2dd')));
  const rods: Placement[] = [], round: Placement[] = [];
  for (let i = 0; i < 64; i++) {
    const x = (rng() - 0.5) * 3.4, y = (rng() - 0.5) * 3.4, z = -0.6 + rng() * 0.7;
    rods.push(rodPlacement(x, y, z, 0.1 + rng() * 0.1, 0.075 + rng() * 0.025, rng() * 6.28, shade('#6f5c8a', 0.9 + rng() * 0.3)));
  }
  for (let i = 0; i < 30; i++) round.push({ position: V((rng() - 0.5) * 3.4, (rng() - 0.5) * 3.4, -0.5 + rng() * 0.6), scale: uniform(0.09 + rng() * 0.03), color: shade('#a0784a', 0.9 + rng() * 0.3) });
  // The one the zoom goes into lies in front, near the middle.
  const chosen = rodPlacement(0.06, 0.04, 0.12, 0.2, 0.1, 0.5, shade('#7a6596', 1));
  rods.push(chosen);
  const rodMesh = instances(capsule(), material('#ffffff'), rods);
  group.add(rodMesh);
  const roundMesh = instances(sphere(2), material('#ffffff'), round);
  group.add(roundMesh);
  const base = rods.map((item) => ({ position: item.position, scale: item.scale, rotation: item.rotation! }));
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), wobble = new THREE.Quaternion(), axis = V(0, 0, 1);
  const drift = ({ seconds }: TissueMotion) => {
    base.forEach((rest, index) => {
      if (index === base.length - 1) return;
      place.copy(rest.position);
      place.x += 0.035 * Math.sin(seconds * 0.5 + index);
      place.y += 0.035 * Math.cos(seconds * 0.42 + index * 2);
      wobble.setFromAxisAngle(axis, 0.14 * Math.sin(seconds * 0.6 + index * 1.3));
      turn.copy(rest.rotation).multiply(wobble);
      matrix.compose(place, turn, rest.scale);
      rodMesh.setMatrixAt(index, matrix);
    });
    rodMesh.instanceMatrix.needsUpdate = true;
  };
  return withMotion(finish(group, V(0, 0, 0), V(0.06, 0.04, 0.2), [
    { text: 'A rod-shaped bacterium', at: V(0.06, 0.04, 0.24) },
    { text: 'Round bacterium', at: round[3].position },
    { text: 'Strands of mucus', at: strands[6][3] },
  ]), drift, carried(roundMesh, 0, -1.8, 1.8, 0.01));
}

/** Inside a bacterium, 300 nanometres to the unit, cut open: two membranes with a thin wall between them, ribosomes, and a tangle of DNA. */
export function buildBacterium(): JourneyScene {
  const rng = random(20151102), group = new THREE.Group();
  const shell = (radius: number, colour: string, inner: string) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 2.2, 12, 48), solid(colour, inner));
    mesh.rotation.z = Math.PI / 2;
    group.add(mesh);
    return mesh;
  };
  const cut = new THREE.Plane(V(0, 0, -1), 0.02);
  const shells = [shell(0.62, '#d9cda2', '#c9bb88'), shell(0.585, '#c9b28e', '#b6a079'), shell(0.56, '#ddc9a2', '#e8ddc4')];
  for (const mesh of shells) (mesh.material as THREE.Material).clippingPlanes = [cut];
  const ribosomes: Placement[] = [];
  for (let i = 0; i < 420; i++) {
    const x = (rng() - 0.5) * 2.7, a = rng() * 6.28, r = 0.25 + rng() * 0.28, z = -Math.abs(Math.sin(a)) * r;
    ribosomes.push({ position: V(x, Math.cos(a) * r, z), scale: uniform(0.033), color: shade('#8a7ca8', 0.9 + rng() * 0.25) });
  }
  group.add(instances(sphere(1), material('#ffffff'), ribosomes));
  const path: THREE.Vector3[] = [];
  for (let k = 0; k < 90; k++) path.push(V(-1 + k * 0.0225 + 0.12 * Math.sin(k * 0.8), 0.22 * Math.sin(k * 1.3), -0.2 + 0.18 * Math.cos(k * 0.9)));
  const dna = new THREE.Mesh(tubeGeometry(path, 0.012, 6, 4), material('#3f6fb5'));
  group.add(dna);
  const focus = path[45].clone();
  return finish(group, V(0, 0, 0), focus, [
    { text: 'DNA, with no nucleus round it', at: focus },
    { text: 'Ribosomes', at: ribosomes[8].position },
    { text: 'Outer membrane, wall and inner membrane', at: V(0.5, 0.56, -0.02) },
  ], cut);
}

/** A stretch of the double helix of a bacterium, 12 nanometres to the unit. The shape is a sketch and follows no sequence. */
export function buildBacterialDna(): JourneyScene {
  const group = new THREE.Group();
  const RISE = 0.285, RADIUS = 0.083;
  const strand = (phase: number) => Array.from({ length: 121 }, (_, k) => {
    const y = -2 + k / 30, a = y / RISE * 2 * Math.PI + phase;
    return V(Math.cos(a) * RADIUS, y, Math.sin(a) * RADIUS);
  });
  const one = strand(0), other = strand(2.4);
  group.add(new THREE.Mesh(tubeGeometry(one, 0.017, 8, 3), material('#3f6fb5')));
  group.add(new THREE.Mesh(tubeGeometry(other, 0.017, 8, 3), material('#7ea4d9')));
  const up = V(0, 1, 0);
  const rungs: Placement[] = [];
  for (let k = 0; k < 120; k += 1) {
    const from = one[k], to = other[k], between = to.clone().sub(from);
    rungs.push({ position: from.clone().add(to).multiplyScalar(0.5), scale: V(0.007, between.length(), 0.007), rotation: new THREE.Quaternion().setFromUnitVectors(up, between.normalize()), color: shade(k % 3 === 0 ? '#d9a44a' : k % 3 === 1 ? '#c86a5c' : '#6aa66f', 1) });
  }
  group.add(instances(new THREE.CylinderGeometry(1, 1, 1, 6), material('#ffffff'), rungs));
  const focus = one[60].clone();
  return finish(group, V(0, 0, 0), focus, [
    { text: 'Double helix', at: focus },
    { text: 'Pairs of bases', at: rungs[42].position },
    { text: 'Sugar and phosphate backbone', at: other[78] },
  ]);
}

export const DEEP_BUILDERS: Readonly<Record<string, () => JourneyScene>> = Object.freeze({
  'red-cell': buildRedCell, 'hemoglobin-crowd': buildHemoglobinCrowd,
  microbes: buildMicrobes, bacterium: buildBacterium, 'bacterial-dna': buildBacterialDna,
});

export const HEMOGLOBIN_BUILDERS: Readonly<Record<string, (data: HemoglobinData) => JourneyScene>> = Object.freeze({
  hemoglobin: buildHemoglobin, heme: buildHeme,
});
