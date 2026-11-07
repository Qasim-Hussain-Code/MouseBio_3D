import * as THREE from 'three';
import { instances, material, sphere, uniform, V, type JourneyLabel, type JourneyScene, type Placement } from './scale-journey-scenes';

/**
 * The measured molecules that the zoom reaches below the cells of each tissue. Every atom is at its position in a Protein Data Bank entry, and nothing is added or moved.
 * Bonds in the view of atoms are inferred from the distances between measured atoms. These levels have no motion, since a crystal or a frozen sample does not show one.
 */
export interface MoleculeGroup { readonly name: string; readonly colour: string; readonly palette?: boolean; readonly label?: string }

export interface MoleculeData {
  readonly molecule: string;
  readonly source: { readonly entry: string; readonly organisms: string; readonly citation: string; readonly note: string };
  readonly chains: readonly { readonly id: string }[];
  readonly elements: readonly string[];
  readonly groups: readonly MoleculeGroup[];
  readonly focusAtom: number;
  readonly x: readonly number[]; readonly y: readonly number[]; readonly z: readonly number[];
  readonly element: readonly number[];
  readonly chain: readonly number[];
  readonly residue: readonly number[];
  readonly group: readonly number[];
}

/** Valid structure of the file asked for, so that a damaged file is refused and nothing is drawn in place of the measured atoms. */
export function isMoleculeData(value: unknown, key: string): value is MoleculeData {
  const data = value as MoleculeData | null;
  if (!data || typeof data !== 'object' || data.molecule !== key || !data.source?.entry) return false;
  const count = data.x?.length;
  if (!Number.isInteger(count) || count <= 0 || ![data.y, data.z, data.element, data.chain, data.residue, data.group].every((column) => column?.length === count)) return false;
  if (!Number.isInteger(data.focusAtom) || data.focusAtom < 0 || data.focusAtom >= count) return false;
  return data.group.every((index) => index >= 0 && index < data.groups.length) && data.element.every((index) => index >= 0 && index < data.elements.length) && data.chain.every((index) => index >= 0 && index < data.chains.length);
}

const VAN_DER_WAALS: Readonly<Record<string, number>> = Object.freeze({ C: 1.7, N: 1.55, O: 1.52, S: 1.8, P: 1.8, FE: 1.5, K: 2.75, MG: 1.73, ZN: 1.39, CL: 1.75, F: 1.47, I: 1.98, SE: 1.9 });
const ELEMENT_COLOUR: Readonly<Record<string, string>> = Object.freeze({ C: '#6e6e6e', N: '#3a55d9', O: '#d9382e', S: '#dcb82d', P: '#e07f20', FE: '#d9731f', K: '#a05ad9', MG: '#6fb04c', ZN: '#8c8ca8', CL: '#3fb34f', F: '#78c8c8', I: '#7b3fb3', SE: '#d99a2e' });
const ELEMENT_NAME: Readonly<Record<string, string>> = Object.freeze({ N: 'Nitrogen', O: 'Oxygen', S: 'Sulfur', P: 'Phosphorus', FE: 'Iron', K: 'Potassium', MG: 'Magnesium', ZN: 'Zinc', CL: 'Chlorine', F: 'Fluorine', I: 'Iodine', SE: 'Selenium' });
/** Atoms that hold on to their neighbours by longer bonds than carbon does, drawn larger. */
const LONG_BONDED: ReadonlySet<string> = new Set(['FE', 'K', 'MG', 'ZN', 'I', 'SE']);

const at = (data: MoleculeData, index: number) => V(data.x[index], data.y[index], data.z[index]);

/** A ball of few faces whose normals point straight out from its centre, so that it shades as a round ball however coarse it is. */
function roundBall(detail: number, geometry: THREE.BufferGeometry = sphere(detail)): THREE.BufferGeometry {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index).normalize();
    normal.setXYZ(index, point.x, point.y, point.z);
  }
  return geometry;
}

/** A molecule whole, usually 12 nanometres to the unit, with every measured atom as a ball of its van der Waals radius. */
export function buildMoleculeWhole(data: MoleculeData, angstromsToTheUnit = 120): JourneyScene {
  const group = new THREE.Group();
  const toUnit = 1 / angstromsToTheUnit, count = data.x.length;
  const centre = V(0, 0, 0);
  for (let i = 0; i < count; i++) centre.add(at(data, i));
  centre.multiplyScalar(1 / count);
  const placements: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const kind = data.groups[data.group[i]];
    const colour = new THREE.Color(kind.colour);
    if (kind.palette) {
      // Chains of one kind are told apart by a small change of hue and lightness, and the colours carry no other meaning.
      const step = data.chain[i];
      colour.offsetHSL(((step * 0.137) % 0.2) - 0.1, 0, ((step * 0.31) % 0.16) - 0.08);
    }
    placements.push({ position: at(data, i).sub(centre).multiplyScalar(toUnit), scale: uniform((VAN_DER_WAALS[data.elements[data.element[i]]] ?? 1.7) * toUnit), color: colour });
  }
  // Very large molecules use a coarser ball, so that they can still be turned smoothly.
  const ball = count > 120000 ? roundBall(0, new THREE.OctahedronGeometry(1, 0)) : roundBall(count > 40000 ? 0 : 1);
  group.add(instances(ball, material('#ffffff', { roughness: 0.5 }), placements));
  const labels: JourneyLabel[] = [];
  data.groups.forEach((kind, index) => {
    if (!kind.label) return;
    let best: THREE.Vector3 | null = null, score = -Infinity;
    for (let i = 0; i < count; i++) {
      if (data.group[i] !== index) continue;
      const value = placements[i].position.z - 0.25 * Math.abs(placements[i].position.y);
      if (value > score) { score = value; best = placements[i].position; }
    }
    if (best) labels.push({ text: kind.label, at: best });
  });
  labels.push({ text: 'The atoms shown next', at: placements[data.focusAtom].position });
  return { group, start: V(0, 0, 0), focus: placements[data.focusAtom].position.clone(), labels };
}

/** The atoms round the chosen atom, 3 nanometres to the unit, as balls and sticks. Whole residues within reach are shown, so that nothing is cut off at a sphere. */
export function buildMoleculeAtoms(data: MoleculeData): JourneyScene {
  const group = new THREE.Group();
  const toUnit = 1 / 30, count = data.x.length;
  const origin = at(data, data.focusAtom);
  const key = (i: number) => `${data.chain[i]}:${data.residue[i]}:${data.group[i]}`;
  const chosen = new Set<string>();
  for (let i = 0; i < count; i++) if (at(data, i).distanceTo(origin) <= 5.2) chosen.add(key(i));
  const near: { index: number; at: THREE.Vector3; element: string }[] = [];
  for (let i = 0; i < count; i++) {
    const place = at(data, i);
    if (chosen.has(key(i)) && place.distanceTo(origin) <= 12) near.push({ index: i, at: place.sub(origin), element: data.elements[data.element[i]] });
  }
  // The centre of the view moves on to the carbon nearest the chosen atom, which the next level enlarges.
  const carbon = near.filter((atom) => atom.element === 'C').sort((left, right) => left.at.length() - right.at.length())[0];
  const shift = carbon ? carbon.at.clone() : V(0, 0, 0);
  const atoms: Placement[] = near.map((atom) => ({
    position: atom.at.clone().sub(shift).multiplyScalar(toUnit),
    scale: uniform((LONG_BONDED.has(atom.element) ? 0.78 : 0.46) * toUnit),
    color: new THREE.Color(ELEMENT_COLOUR[atom.element] ?? '#999999'),
  }));
  group.add(instances(roundBall(2), material('#ffffff', { roughness: 0.35 }), atoms));
  const bonds: Placement[] = [];
  const up = V(0, 1, 0);
  for (let a = 0; a < near.length; a++) for (let b = a + 1; b < near.length; b++) {
    const between = near[b].at.clone().sub(near[a].at), length = between.length();
    const long = LONG_BONDED.has(near[a].element) || LONG_BONDED.has(near[b].element);
    if (length < 0.8 || length > (long ? 2.5 : 1.9)) continue;
    bonds.push({ position: near[a].at.clone().add(near[b].at).sub(shift).sub(shift).multiplyScalar(0.5 * toUnit), scale: V(0.14 * toUnit, length * toUnit, 0.14 * toUnit), rotation: new THREE.Quaternion().setFromUnitVectors(up, between.normalize()) });
  }
  if (bonds.length) group.add(instances(new THREE.CylinderGeometry(1, 1, 1, 8), material('#b9b9b9'), bonds));
  const labels: JourneyLabel[] = [{ text: 'This carbon atom', at: V(0, 0, 0) }];
  const focusKind = data.groups[data.group[data.focusAtom]];
  labels.push({ text: focusKind.label ?? focusKind.name, at: shift.clone().negate().multiplyScalar(toUnit) });
  for (const [element, text] of Object.entries(ELEMENT_NAME)) {
    const found = near.filter((atom) => atom.element === element).sort((left, right) => right.at.clone().sub(shift).length() - left.at.clone().sub(shift).length())[0];
    if (found) labels.push({ text, at: found.at.clone().sub(shift).multiplyScalar(toUnit) });
  }
  return { group, start: shift.clone().negate().multiplyScalar(toUnit), focus: V(0, 0, 0), labels };
}
