import * as THREE from 'three';
import type { JourneyTail } from '../domain/scale-journey';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The scenes of the scale journey, each in units of its level's reference length. Apart from the two levels that show atoms of a Protein Data Bank entry,
 * every position, count and shape here is generated with a fixed seed to illustrate a published description, and none is a measurement.
 */
export interface JourneyLabel { readonly text: string; readonly at: THREE.Vector3 }
export interface JourneyScene {
  readonly group: THREE.Group;
  /** The point held at the centre of the view when the level first appears, and when it is about to give way to the next. */
  readonly start: THREE.Vector3;
  readonly focus: THREE.Vector3;
  /** A cut through the scene, in its own units. The half with a positive distance is kept. */
  readonly cut?: THREE.Plane;
  readonly labels: readonly JourneyLabel[];
  /** Illustrative motion of this level, if it has any. Levels showing measured atoms have none. */
  readonly animate?: (motion: TissueMotion) => void;
  /** Places from which the zoom can go another way than to the focus. The one nearest the pointer is taken. */
  readonly branches?: readonly JourneyBranch[];
}

export interface JourneyBranch { readonly tail: JourneyTail; readonly text: string; readonly at: THREE.Vector3 }

/** The moment of the illustrative motion that a level is shown at. */
export interface TissueMotion {
  /** Seconds shown, adjusted for the chosen speed. */
  readonly seconds: number;
  /** Cycles of the heart so far, and the contraction of the ventricles from 0 to 1. */
  readonly beats: number;
  readonly ventricles: number;
  /** How far breathing in has gone, from 0 to 1. */
  readonly breath: number;
}

export interface NucleosomeData {
  readonly source: { readonly entry: string };
  readonly chains: readonly { readonly id: string; readonly name: string }[];
  readonly elements: readonly string[];
  readonly names: readonly string[];
  readonly focusAtom: number;
  readonly x: readonly number[]; readonly y: readonly number[]; readonly z: readonly number[];
  readonly element: readonly number[];
  readonly chain: readonly number[];
  readonly residue: readonly number[];
  readonly name: readonly number[];
}

/** Valid structure, so that a damaged file is refused and nothing is drawn in place of the measured atoms. */
export function isNucleosomeData(value: unknown): value is NucleosomeData {
  const data = value as NucleosomeData | null;
  if (!data || typeof data !== 'object' || data.source?.entry !== '5B1M') return false;
  const count = data.x?.length;
  return Number.isInteger(count) && count > 0 && [data.y, data.z, data.element, data.chain, data.residue, data.name].every((column) => column?.length === count)
    && Number.isInteger(data.focusAtom) && data.focusAtom >= 0 && data.focusAtom < count;
}

export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function material(color: string, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, transparent: true, ...options });
}

/** A surface drawn from both sides, flat in colour on its inner side, so that a closed shape reads as solid where a cut opens it. */
export function solid(color: string, inner: string = color, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const made = material(color, { side: THREE.DoubleSide, ...options });
  const fill = new THREE.Color(inner);
  made.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `if (!gl_FrontFacing) outgoingLight = vec3(${fill.r.toFixed(3)}, ${fill.g.toFixed(3)}, ${fill.b.toFixed(3)});\n#include <opaque_fragment>`);
  };
  made.customProgramCacheKey = () => `journey-solid-${inner}`;
  return made;
}

/** A curve through points, as one tube. */
export function tubeGeometry(points: readonly THREE.Vector3[], radius: number, sides = 6, density = 2.2): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([...points], false, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(points.length * density)), radius, sides, false);
}

export function merged(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geometries.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
  for (const geometry of prepared) for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
  const out = mergeGeometries(prepared, false);
  if (!out) throw new Error('Could not merge the geometry of a scene.');
  for (const geometry of [...geometries, ...prepared]) geometry.dispose();
  return out;
}

export interface Placement { readonly position: THREE.Vector3; readonly scale: THREE.Vector3; readonly rotation?: THREE.Quaternion; readonly color?: THREE.Color }

export function instances(geometry: THREE.BufferGeometry, made: THREE.Material, placements: readonly Placement[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, made, placements.length);
  const matrix = new THREE.Matrix4(), identity = new THREE.Quaternion();
  placements.forEach((placement, index) => {
    matrix.compose(placement.position, placement.rotation ?? identity, placement.scale);
    mesh.setMatrixAt(index, matrix);
    if (placement.color) mesh.setColorAt(index, placement.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export const sphere = (detail: number) => new THREE.IcosahedronGeometry(1, detail);
export const uniform = (radius: number) => V(radius, radius, radius);
export const shade = (color: string, amount: number) => new THREE.Color(color).multiplyScalar(amount);

/** A wavy line across a face, for fibres. */
function wavy(from: THREE.Vector3, to: THREE.Vector3, amplitude: number, waves: number, phase: number): THREE.Vector3[] {
  const count = Math.max(6, Math.ceil(waves * 5));
  const along = to.clone().sub(from);
  const across = V(-along.y, along.x, 0).normalize();
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    return from.clone().addScaledVector(along, t).addScaledVector(across, amplitude * Math.sin(phase + t * waves * Math.PI * 2));
  });
}

/** A block of skin, 1.6 mm across. The top surface lies at y = 0. Elements on the cut faces show the depth of each layer. */
export function buildSkinBlock(): JourneyScene {
  const rng = random(19650601);
  const group = new THREE.Group();
  const LAYERS = [
    { thickness: 0.019, color: '#ecccb9' }, { thickness: 0.19, color: '#e9b9ae' }, { thickness: 0.15, color: '#f1e1b4' }, { thickness: 0.05, color: '#b65a50' }, { thickness: 0.035, color: '#ecdcd3' },
  ];
  const depths: number[] = [];
  let top = 0;
  for (const layer of LAYERS) {
    const box = new THREE.BoxGeometry(1, layer.thickness, 1);
    const mesh = new THREE.Mesh(box, material(layer.color));
    mesh.position.y = top - layer.thickness / 2;
    group.add(mesh);
    depths.push(top);
    top -= layer.thickness;
  }
  const dermisTop = depths[1], fatTop = depths[2], muscleTop = depths[3], muscleBottom = depths[4];

  // Hairs through the surface, over all of the top. They are cut short, because a coat hair is far longer than this block.
  const hairs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 150; i++) {
    const x = -0.49 + rng() * 0.98, z = -0.49 + rng() * 0.98, lean = 0.5 + rng() * 0.4, length = 0.16 + rng() * 0.2;
    hairs.push(tubeGeometry([V(x, -0.01, z), V(x + 0.06 * lean, length * 0.5, z + 0.03 * lean), V(x + 0.2 * lean, length, z + 0.06 * lean)], 0.0044 - (i % 5) * 0.0004, 7, 4));
  }
  group.add(new THREE.Mesh(merged(hairs), material('#6d5a48')));

  // Follicles and glands, half embedded in the two cut faces. Hummel et al. give one sebaceous gland to each coat hair follicle.
  const follicles: THREE.BufferGeometry[] = [], shafts: THREE.BufferGeometry[] = [], glands: THREE.BufferGeometry[] = [];
  const onFace = (face: number, along: number, depth: number, out: number) => (face === 0 ? V(along, depth, 0.5 + out) : V(0.5 + out, depth, along));
  for (let face = 0; face < 2; face++) for (let i = 0; i < 6; i++) {
    const along = -0.42 + i * 0.16 + (rng() - 0.5) * 0.04, deep = fatTop - 0.02 - rng() * 0.09;
    const line = [onFace(face, along, dermisTop + 0.012, 0), onFace(face, along + 0.012, (dermisTop + deep) / 2, 0.001), onFace(face, along + 0.02, deep, 0)];
    follicles.push(tubeGeometry(line, 0.0135, 14, 6));
    const bulb = sphere(6); bulb.scale(0.024, 0.03, 0.024); const end = line[2]; bulb.translate(end.x, end.y, end.z); follicles.push(bulb);
    shafts.push(tubeGeometry([onFace(face, along, 0.03, 0.002), line[0].clone(), line[1], end.clone()], 0.0048, 8, 6));
    for (const side of [-1, 1]) {
      const gland = sphere(6); gland.scale(0.018, 0.024, 0.014);
      const at = onFace(face, along + side * 0.024, dermisTop - 0.04, 0);
      gland.translate(at.x, at.y, at.z); glands.push(gland);
    }
  }
  group.add(new THREE.Mesh(merged(follicles), material('#d59c8e')));
  group.add(new THREE.Mesh(merged(shafts), material('#54463a')));
  group.add(new THREE.Mesh(merged(glands), material('#f3df9f')));

  // Collagen and capillaries on the faces of the dermis, fat cells below it and fibres of the panniculus carnosus.
  const collagen: THREE.BufferGeometry[] = [], vessels: THREE.BufferGeometry[] = [], fibres: THREE.BufferGeometry[] = [];
  const onSide = (point: THREE.Vector3, face: number) => (face === 0 ? V(point.x, point.y, 0.5) : V(0.5, point.y, point.x));
  for (let face = 0; face < 2; face++) {
    for (let i = 0; i < 26; i++) {
      const y = dermisTop - 0.02 - rng() * 0.16, x = -0.5 + rng() * 0.7;
      collagen.push(tubeGeometry(wavy(V(x, y, 0), V(x + 0.22 + rng() * 0.1, y + (rng() - 0.5) * 0.03, 0), 0.006, 2 + rng() * 2, rng() * 6).map((p) => onSide(p, face)), 0.0028, 6, 5));
    }
    vessels.push(tubeGeometry(wavy(V(-0.5, dermisTop - 0.028, 0), V(0.5, dermisTop - 0.03, 0), 0.008, 6, face).map((p) => onSide(p, face)), 0.0042, 10, 6));
    vessels.push(tubeGeometry(wavy(V(-0.5, fatTop + 0.016, 0), V(0.5, fatTop + 0.012, 0), 0.006, 3, 2 + face).map((p) => onSide(p, face)), 0.0065, 10, 6));
    for (const x of [-0.31, 0.03, 0.34]) vessels.push(tubeGeometry([V(x, dermisTop - 0.028, 0), V(x + 0.01, dermisTop - 0.09, 0), V(x - 0.008, fatTop + 0.014, 0)].map((p) => onSide(p, face)), 0.003, 8, 6));
    for (let i = 0; i < 14; i++) {
      const y = muscleTop - 0.006 - i * 0.0031;
      fibres.push(tubeGeometry([V(-0.5, y, 0), V(0, y + (rng() - 0.5) * 0.002, 0), V(0.5, y, 0)].map((p) => onSide(p, face)), 0.0018, 4, 2));
    }
  }
  // A nerve in the lower dermis, with a branch to each follicle that ends in a palisade round its neck, and fine endings towards the epidermis.
  const nerves: THREE.BufferGeometry[] = [];
  const nerveDepth = fatTop + 0.032;
  for (let face = 0; face < 2; face++) {
    nerves.push(tubeGeometry(wavy(V(-0.5, nerveDepth, 0), V(0.5, nerveDepth + 0.004, 0), 0.005, 3, 1 + face).map((p) => onSide(p, face)), 0.0052, 8, 6));
    for (let i = 0; i < 6; i++) {
      const along = -0.42 + i * 0.16;
      nerves.push(tubeGeometry([V(along - 0.05, nerveDepth, 0), V(along - 0.032, (nerveDepth + dermisTop) / 2, 0), V(along - 0.018, dermisTop - 0.07, 0)].map((p) => onSide(p, face)), 0.0019, 5, 4));
      for (let k = -2; k <= 2; k++) nerves.push(tubeGeometry([V(along - 0.018, dermisTop - 0.07, 0), V(along + k * 0.008, dermisTop - 0.056, 0), V(along + k * 0.009, dermisTop - 0.03, 0)].map((p) => onSide(p, face)), 0.0011, 4, 3));
      nerves.push(tubeGeometry([V(along + 0.07, nerveDepth, 0), V(along + 0.08, dermisTop - 0.08, 0), V(along + 0.066, dermisTop - 0.006, 0)].map((p) => onSide(p, face)), 0.0012, 4, 3));
    }
  }
  group.add(new THREE.Mesh(merged(nerves), material('#e4cf74')));
  group.add(new THREE.Mesh(merged(collagen), material('#f6dbd2')));
  group.add(new THREE.Mesh(merged(vessels), material('#ad2f39')));
  group.add(new THREE.Mesh(merged(fibres), material('#8f3d38')));
  const fat: Placement[] = [];
  for (let face = 0; face < 2; face++) for (let row = 0; row < 6; row++) for (let i = 0; i < 40; i++) {
    const along = -0.5 + (i + (row % 2) * 0.5) * 0.0255, y = fatTop - 0.012 - row * 0.0245 + (rng() - 0.5) * 0.004;
    if (along > 0.5) continue;
    fat.push({ position: onSide(V(along, y, 0), face), scale: uniform(0.0128 + rng() * 0.002), color: shade('#f8edc6', 0.94 + rng() * 0.08) });
  }
  group.add(instances(sphere(3), material('#ffffff', { roughness: 0.4 }), fat));

  return {
    group, start: V(0, -0.14, 0.06), focus: V(0.05, -0.0095, 0.5),
    labels: [
      { text: 'Hair', at: V(0.42, 0.14, 0.42) }, { text: 'Epidermis', at: V(-0.46, -0.0095, 0.5) }, { text: 'Hair follicle', at: V(-0.1, dermisTop - 0.13, 0.5) },
      { text: 'Sebaceous gland', at: V(0.22, dermisTop - 0.04, 0.5) }, { text: 'Small vessels', at: V(0.42, dermisTop - 0.03, 0.5) }, { text: 'Dermis', at: V(-0.46, dermisTop - 0.1, 0.5) },
      { text: 'Nerve with endings round a follicle', at: V(-0.38, nerveDepth, 0.5) },
      { text: 'Fat cells', at: V(-0.46, fatTop - 0.08, 0.5) }, { text: 'Panniculus carnosus', at: V(-0.42, (muscleTop + muscleBottom) / 2, 0.5) },
    ],
  };
}

/** Six layers of cells opened by a cut: two flat layers of stratum corneum, one granular, two spinous and one basal, as Hummel et al. give for haired skin. */
export function buildEpidermis(): JourneyScene {
  const rng = random(19650602);
  const group = new THREE.Group();
  const cut = new THREE.Plane(V(0, 0, -1), 0);
  const cells: Placement[] = [], nuclei: Placement[] = [], grains: Placement[] = [];
  const LAYERS = [
    { y: -0.008, radii: V(0.094, 0.0095, 0.094), step: 0.17, color: '#eadcc0', nucleus: 0 },
    { y: -0.026, radii: V(0.09, 0.0105, 0.09), step: 0.165, color: '#efe0c6', nucleus: 0 },
    { y: -0.066, radii: V(0.08, 0.033, 0.08), step: 0.15, color: '#e8c0ae', nucleus: 0.018 },
    { y: -0.146, radii: V(0.064, 0.056, 0.064), step: 0.118, color: '#efc7b6', nucleus: 0.03 },
    { y: -0.25, radii: V(0.061, 0.056, 0.061), step: 0.112, color: '#ecc2b1', nucleus: 0.03 },
    { y: -0.352, radii: V(0.046, 0.06, 0.046), step: 0.086, color: '#e2aea2', nucleus: 0.027 },
  ];
  LAYERS.forEach((layer, row) => {
    const shift = (row % 2 === 0 ? 1 : 0) * layer.step * 0.5;
    for (let ix = -6; ix <= 6; ix++) for (let iz = -4; iz <= 0; iz++) {
      const x = ix * layer.step + shift + (rng() - 0.5) * layer.step * 0.08, z = iz * layer.step * 0.96 + (rng() - 0.5) * layer.step * 0.08;
      if (Math.abs(x) > 0.56) continue;
      const here = row === 3 && ix === 0 && iz === 0 ? V(0, layer.y, 0) : V(x, layer.y + (rng() - 0.5) * 0.006, z);
      const wide = 0.97 + rng() * 0.08;
      cells.push({ position: here, scale: V(layer.radii.x * wide, layer.radii.y * (0.96 + rng() * 0.08), layer.radii.z * wide), color: shade(layer.color, 0.95 + rng() * 0.07) });
      if (layer.nucleus) {
        const flat = row === 2 ? 0.55 : 1;
        nuclei.push({ position: here.clone().add(V((rng() - 0.5) * 0.008, (rng() - 0.5) * 0.006, (rng() - 0.5) * 0.008)), scale: V(layer.nucleus, layer.nucleus * flat * (row === 5 ? 1.25 : 1), layer.nucleus) });
      }
      if (row === 2) for (let k = 0; k < 14; k++) grains.push({ position: here.clone().add(V((rng() - 0.5) * 0.12, (rng() - 0.5) * 0.045, (rng() - 0.5) * 0.12)), scale: uniform(0.0035 + rng() * 0.003) });
    }
  });
  const cellMaterial = solid('#ffffff', '#f4d6c9', { clippingPlanes: [cut], roughness: 0.7 });
  group.add(instances(sphere(3), cellMaterial, cells));
  const nucleusMaterial = solid('#8f76ad', '#a791c2', { clippingPlanes: [cut] });
  group.add(instances(sphere(2), nucleusMaterial, nuclei));
  group.add(instances(sphere(1), material('#5b3f4d', { clippingPlanes: [cut] }), grains));

  // The basement membrane, and the top of the dermis with collagen and a capillary holding red cells.
  const membrane = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.008, 0.62), material('#a07a7a', { clippingPlanes: [cut] }));
  membrane.position.set(0, -0.417, -0.311);
  group.add(membrane);
  const dermis = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.3, 0.62), solid('#efcdc2', '#efcdc2', { clippingPlanes: [cut] }));
  dermis.position.set(0, -0.571, -0.311);
  group.add(dermis);
  const fibres: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 34; i++) {
    const y = -0.44 - rng() * 0.26, x = -0.57 + rng() * 0.8;
    fibres.push(tubeGeometry(wavy(V(x, y, 0.002), V(x + 0.26 + rng() * 0.16, y + (rng() - 0.5) * 0.05, 0.002), 0.012, 2 + rng() * 2, rng() * 6), 0.0045, 7, 5));
  }
  group.add(new THREE.Mesh(merged(fibres), material('#f8e4dc', { clippingPlanes: [] })));
  const wall = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 10, 28), material('#b4525b'));
  wall.position.set(0.34, -0.56, 0.002);
  group.add(wall);
  const redCells: Placement[] = [];
  for (let i = 0; i < 2; i++) redCells.push({ position: V(0.34 + (i - 0.5) * 0.034, -0.56 + (i - 0.5) * 0.016, 0.004), scale: V(0.036, 0.036, 0.012), color: shade('#b6232d', 0.95 + i * 0.05) });
  group.add(instances(sphere(2), material('#ffffff'), redCells));
  return {
    group, start: V(0, -0.21, 0), focus: V(0, -0.146, 0), cut,
    labels: [
      { text: 'Stratum corneum', at: V(0.42, -0.016, 0) }, { text: 'Granular layer', at: V(0.42, -0.066, 0) }, { text: 'Spinous layer', at: V(0.42, -0.2, 0) },
      { text: 'Basal layer', at: V(0.42, -0.352, 0) }, { text: 'Basement membrane', at: V(-0.36, -0.418, 0) }, { text: 'Capillary with red cells', at: V(0.3, -0.5, 0) }, { text: 'Dermis', at: V(-0.36, -0.6, 0) },
    ],
  };
}

function bumpy(radii: THREE.Vector3, amount: number, seed: number, detail = 12): THREE.BufferGeometry {
  const rng = random(seed);
  const phases = Array.from({ length: 9 }, () => rng() * 6.28);
  const shape = new THREE.IcosahedronGeometry(1, detail);
  shape.deleteAttribute('normal');
  shape.deleteAttribute('uv');
  const geometry = mergeVertices(shape, 1e-5);
  shape.dispose();
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const n = 1 + amount * (Math.sin(3 * x + phases[0]) * Math.cos(4 * y + phases[1]) + 0.6 * Math.sin(5 * z + phases[2]) * Math.cos(3 * x + phases[3]) + 0.4 * Math.sin(7 * y + phases[4]));
    position.setXYZ(i, x * n * radii.x, y * n * radii.y, z * n * radii.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A keratinocyte opened by a cut, 10.7 micrometres to the unit, so that it has the size of a spinous cell of the level before. Numbers and placement of organelles are illustrative. */
export function buildCell(): JourneyScene {
  const rng = random(19650603);
  const group = new THREE.Group();
  const cut = new THREE.Plane(V(0, 0, -1), 0);
  const options = { clippingPlanes: [cut] };
  const radii = V(0.42, 0.36, 0.4);
  const inCell = () => {
    for (;;) {
      const p = V(rng() * 2 - 1, rng() * 2 - 1, -rng());
      if (p.length() > 1) continue;
      const q = V(p.x * radii.x * 0.92, p.y * radii.y * 0.92, p.z * radii.z * 0.92);
      if (q.length() > 0.215) return q;
    }
  };
  group.add(new THREE.Mesh(bumpy(radii, 0.018, 3), solid('#ecc4b3', '#f6dfd4', options)));
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 12), solid('#8f76ad', '#b3a0cd', options));
  group.add(nucleus);
  const nucleolus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 8), solid('#5d4679', '#6e5689', options));
  nucleolus.position.set(0.05, 0.035, -0.02);
  group.add(nucleolus);
  // Mitochondria.
  const mitochondria: Placement[] = [];
  const up = V(0, 1, 0);
  for (let i = 0; i < 44; i++) {
    const at = inCell();
    const direction = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const length = 0.75 + rng() * 0.6;
    mitochondria.push({ position: at, scale: V(0.017, 0.038 * length, 0.017), rotation: new THREE.Quaternion().setFromUnitVectors(up, direction) });
  }
  group.add(instances(new THREE.CapsuleGeometry(1, 1.4, 6, 12), solid('#d8743c', '#e8955f', options), mitochondria));
  // Endoplasmic reticulum round the nucleus.
  const reticulum: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 44; i++) {
    const theta = rng() * 6.28, phi = -0.1 - rng() * 1.3, r = 0.215 + rng() * 0.05;
    const points = Array.from({ length: 6 }, (_, k) => {
      const a = theta + k * 0.2, b = phi + Math.sin(k + i) * 0.12, s = r + Math.sin(k * 1.7 + i) * 0.012;
      return V(s * Math.cos(a) * Math.cos(b), s * Math.sin(a) * Math.cos(b), s * Math.sin(b));
    });
    reticulum.push(tubeGeometry(points, 0.0058, 6, 3));
  }
  group.add(new THREE.Mesh(merged(reticulum), material('#7787c6', options)));
  // A Golgi stack: curved flattened cisternae.
  const golgi: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const r = 0.06 + i * 0.012;
    const points = Array.from({ length: 9 }, (_, k) => { const t = -0.9 + 1.8 * k / 8; return V(-0.2 + r * Math.cos(t + Math.PI) * 1.1, 0.15 + r * Math.sin(t + Math.PI) * 1.1, -0.04 - (i % 2) * 0.006); });
    golgi.push(tubeGeometry(points, 0.0052, 6, 2.5));
  }
  group.add(new THREE.Mesh(merged(golgi), material('#e4bc33', options)));
  // Keratin filaments run between desmosomes on the cell surface.
  const anchors = Array.from({ length: 70 }, () => {
    const t = rng() * 6.28, u = rng() * 1.5 + 0.03;
    return V(radii.x * Math.cos(t) * Math.cos(u - 0.03), radii.y * Math.sin(t) * Math.cos(u - 0.03), -radii.z * Math.sin(u));
  });
  const keratin: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const a = anchors[Math.floor(rng() * anchors.length)], b = anchors[Math.floor(rng() * anchors.length)];
    const middle = a.clone().add(b).multiplyScalar(0.5);
    if (middle.length() < 0.23) middle.setLength(0.25);
    middle.add(V((rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08, -rng() * 0.05));
    keratin.push(tubeGeometry([a.clone().multiplyScalar(0.98), a.clone().lerp(middle, 0.5).add(V(0.01, -0.01, 0)), middle, middle.clone().lerp(b, 0.5).add(V(-0.01, 0.01, 0)), b.clone().multiplyScalar(0.98)], 0.002, 5, 3));
  }
  group.add(new THREE.Mesh(merged(keratin), material('#7a5a3a', options)));
  const desmosomes: Placement[] = anchors.map((at) => ({ position: at, scale: uniform(0.0095) }));
  group.add(instances(sphere(1), material('#3f2f29', options), desmosomes));
  const lysosomes: Placement[] = Array.from({ length: 16 }, () => ({ position: inCell(), scale: uniform(0.012 + rng() * 0.01) }));
  group.add(instances(sphere(2), solid('#6d3d80', '#7d4d91', options), lysosomes));
  const specks: Placement[] = Array.from({ length: 500 }, () => ({ position: inCell(), scale: uniform(0.0026) }));
  group.add(instances(sphere(0), material('#b77b6c', options), specks));
  return {
    group, start: V(0, 0, 0), focus: V(0, 0, 0), cut,
    labels: [
      { text: 'Nucleus', at: V(-0.11, -0.1, 0) }, { text: 'Nucleolus', at: V(0.05, 0.035, 0) }, { text: 'Mitochondrion', at: mitochondria[3].position }, { text: 'Golgi stack', at: V(-0.31, 0.17, -0.04) },
      { text: 'Endoplasmic reticulum', at: V(0.22, -0.11, -0.05) }, { text: 'Keratin filaments', at: V(0.3, 0.17, -0.1) }, { text: 'Desmosomes', at: anchors.reduce((best, at) => (at.x - at.y > best.x - best.y ? at : best)) }, { text: 'Lysosome', at: lysosomes[2].position },
    ],
  };
}

/** The nucleus, opened by a cut, 4.6 micrometres to the unit. */
export function buildNucleus(): JourneyScene {
  const rng = random(19650604);
  const group = new THREE.Group();
  const cut = new THREE.Plane(V(0, 0, -1), 0.012);
  const options = { clippingPlanes: [cut] };
  const R = 0.46;
  group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R, 16), solid('#b4a0cc', '#f3eef7', options)));
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(R - 0.012, 16), solid('#d9cde6', '#f3eef7', options));
  group.add(inner);
  const nucleolus = new THREE.Mesh(bumpy(uniform(0.115), 0.06, 11, 8), solid('#74588f', '#8a6da6', options));
  nucleolus.position.set(-0.17, 0.11, -0.12);
  group.add(nucleolus);
  // Pores on the envelope.
  const pores: Placement[] = [];
  const axis = V(0, 0, 1);
  for (let i = 0; i < 320; i++) {
    const z = -rng(), t = rng() * 6.28, s = Math.sqrt(1 - z * z);
    const n = V(s * Math.cos(t), s * Math.sin(t), z);
    pores.push({ position: n.clone().multiplyScalar(R - 0.005), scale: uniform(1), rotation: new THREE.Quaternion().setFromUnitVectors(axis, n) });
  }
  group.add(instances(new THREE.TorusGeometry(0.011, 0.0042, 6, 12), material('#584773', options), pores));
  // Chromatin in territories. Each path walks within the nucleus; the first passes through the centre of the view, where the next level lies.
  const TONES = ['#7f9fd1', '#d98f7a', '#8fbf9a', '#c6a4d8', '#d9c06e', '#7fc0c4', '#d4899f', '#9aa86d', '#a3a9c9', '#c98f5f', '#88a8a0', '#c28fb5', '#7a95b8', '#b0b878', '#d0a58a', '#9d8fc2'];
  TONES.forEach((tone, index) => {
    const start = index === 0 ? V(0, 0, 0) : V(rng() - 0.5, rng() - 0.5, -rng()).normalize().multiplyScalar(0.1 + rng() * 0.3);
    const walk = (from: THREE.Vector3, count: number, bias: THREE.Vector3): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [from.clone()];
      let direction = bias.clone().normalize();
      for (let k = 0; k < count; k++) {
        direction = direction.add(V((rng() - 0.5) * 0.9, (rng() - 0.5) * 0.9, (rng() - 0.5) * 0.9)).normalize();
        const next = out[out.length - 1].clone().addScaledVector(direction, 0.03);
        if (next.length() > 0.42) next.multiplyScalar(0.94);
        if (next.distanceTo(start) > 0.17) next.lerp(start, 0.1);
        next.z = Math.min(next.z, 0.01);
        out.push(next);
      }
      return out;
    };
    const first = walk(start, 120, V(rng() - 0.5, rng() - 0.5, -0.4)), second = walk(start, 120, V(rng() - 0.5, rng() - 0.5, -0.4));
    group.add(new THREE.Mesh(tubeGeometry([...first.reverse(), ...second.slice(1)], 0.007, 5, 1.6), material(tone, options)));
  });
  return {
    group, start: V(0, 0, 0), focus: V(0, 0, 0), cut,
    labels: [{ text: 'Nuclear envelope', at: V(0.33, 0.32, -0.02) }, { text: 'Nuclear pore', at: pores[1].position }, { text: 'Nucleolus', at: V(-0.17, 0.11, 0) }, { text: 'Chromatin', at: V(0.14, -0.12, 0) }],
  };
}

/** Nucleosomes on a thread of DNA, as an irregular chain, 300 nanometres to the unit. */
export function buildChromatin(): JourneyScene {
  const rng = random(19650605);
  const group = new THREE.Group();
  const toUnit = 1 / 300; // nanometres
  const coreRadius = 4.4 * toUnit, coreHeight = 5.6 * toUnit, dnaRadius = 1 * toUnit, wrapRadius = 5.4 * toUnit;
  const walk = (count: number): THREE.Vector3[] => {
    const out = [V(0, 0, 0)];
    let direction = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    for (let i = 0; i < count; i++) {
      direction = direction.add(V((rng() - 0.5) * 1.5, (rng() - 0.5) * 1.5, (rng() - 0.5) * 1.5)).normalize();
      const next = out[out.length - 1].clone().addScaledVector(direction, (15 + rng() * 9) * toUnit);
      if (next.length() > 0.5) next.multiplyScalar(0.9);
      out.push(next);
    }
    return out;
  };
  const beads = [...walk(110).reverse(), ...walk(110).slice(1)];
  const wrapPoints = Array.from({ length: 46 }, (_, i) => { const a = (i / 45) * 1.65 * 2 * Math.PI, h = (i / 45 - 0.5) * 2.6 * 2 * toUnit; return V(wrapRadius * Math.cos(a), h, wrapRadius * Math.sin(a)); });
  const wrap = tubeGeometry(wrapPoints, dnaRadius, 6, 1.4);
  const core = new THREE.CylinderGeometry(coreRadius, coreRadius, coreHeight, 18);
  const coreMaterial = material('#cfd5e8'), dnaMaterial = material('#3f58ad');
  const places: Placement[] = beads.map(() => {
    const direction = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    return { position: V(0, 0, 0), scale: uniform(1), rotation: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), direction) };
  });
  const placed: Placement[] = places.map((place, index) => ({ ...place, position: beads[index] }));
  group.add(instances(core, coreMaterial, placed));
  group.add(instances(wrap, dnaMaterial, placed));
  group.add(new THREE.Mesh(tubeGeometry(beads, dnaRadius * 0.9, 5, 2.4), dnaMaterial));
  return {
    group, start: V(0, 0, 0), focus: V(0, 0, 0),
    labels: [{ text: 'Nucleosome', at: beads[Math.floor(beads.length / 2) + 2] }, { text: 'Linker DNA', at: beads[Math.floor(beads.length / 2) + 4].clone().lerp(beads[Math.floor(beads.length / 2) + 5], 0.5) }, { text: 'Irregular chain', at: beads[20] }],
  };
}

const VAN_DER_WAALS: Readonly<Record<string, number>> = Object.freeze({ C: 1.7, N: 1.55, O: 1.52, P: 1.8, S: 1.8 });
const ELEMENT_COLOUR: Readonly<Record<string, string>> = Object.freeze({ C: '#6e6e6e', N: '#3a55d9', O: '#d9382e', P: '#ee7f11', S: '#dcb82d' });
const CHAIN_COLOUR: Readonly<Record<string, string>> = Object.freeze({ 'Histone H3.1': '#6fa3d8', 'Histone H4': '#79b77f', 'Histone H2A type 1': '#eeae66', 'Histone H2B type 3-A': '#dc7070' });

function dataCentre(data: NucleosomeData): THREE.Vector3 {
  const centre = V(0, 0, 0);
  for (let i = 0; i < data.x.length; i++) centre.add(V(data.x[i], data.y[i], data.z[i]));
  return centre.multiplyScalar(1 / data.x.length);
}

/** Every atom of the crystal structure at its measured position, 12 nanometres to the unit. The radii of the balls are standard values and are not measured here. */
export function buildNucleosome(data: NucleosomeData): JourneyScene {
  const group = new THREE.Group();
  const toUnit = 1 / 120; // angstroms
  const centre = dataCentre(data);
  const placements: Placement[] = [];
  const dnaStrand = data.chains.filter((chain) => chain.name === 'DNA').map((chain) => chain.id);
  const sums = new Map<string, { sum: THREE.Vector3; count: number }>();
  for (let i = 0; i < data.x.length; i++) {
    const chain = data.chains[data.chain[i]], element = data.elements[data.element[i]];
    const position = V(data.x[i], data.y[i], data.z[i]).sub(centre).multiplyScalar(toUnit);
    const colour = chain.name === 'DNA' ? (chain.id === dnaStrand[0] ? '#cfd4ea' : '#9ca8d6') : CHAIN_COLOUR[chain.name] ?? '#999999';
    placements.push({ position, scale: uniform((VAN_DER_WAALS[element] ?? 1.7) * toUnit), color: shade(colour, element === 'P' ? 1.1 : 1) });
    const entry = sums.get(chain.name) ?? { sum: V(0, 0, 0), count: 0 };
    entry.sum.add(position); entry.count++;
    sums.set(chain.name, entry);
  }
  group.add(instances(sphere(1), material('#ffffff', { roughness: 0.5 }), placements));
  const focus = placements[data.focusAtom].position.clone();
  // Name each kind of chain at an atom on the outside of the particle, because the middle of a chain lies inside it.
  const label = (name: string, text: string): JourneyLabel => {
    let best = V(0, 0, 0), distance = -1;
    for (let i = 0; i < data.x.length; i += 7) {
      if (data.chains[data.chain[i]].name !== name) continue;
      const score = placements[i].position.z - 0.25 * Math.abs(placements[i].position.y);
      if (score > distance) { distance = score; best = placements[i].position; }
    }
    return { text, at: best };
  };
  return {
    group, start: V(0, 0, 0), focus,
    labels: [label('DNA', 'DNA'), label('Histone H3.1', 'Histone H3'), label('Histone H4', 'Histone H4'), label('Histone H2A type 1', 'Histone H2A'), label('Histone H2B type 3-A', 'Histone H2B')],
  };
}

/** Whole nucleotides round a base of the DNA, 3 nanometres to the unit, as balls and sticks. Bonds are inferred from distances between measured atoms. */
export function buildDnaAtoms(data: NucleosomeData): JourneyScene {
  const group = new THREE.Group();
  const toUnit = 1 / 30; // angstroms
  const origin = V(data.x[data.focusAtom], data.y[data.focusAtom], data.z[data.focusAtom]);
  const near: { index: number; at: THREE.Vector3; element: string }[] = [];
  const nucleotide = (i: number) => `${data.chain[i]}:${data.residue[i]}`;
  const chosen = new Set<string>();
  for (let i = 0; i < data.x.length; i++) {
    if (data.chains[data.chain[i]].name === 'DNA' && V(data.x[i], data.y[i], data.z[i]).distanceTo(origin) <= 8) chosen.add(nucleotide(i));
  }
  for (let i = 0; i < data.x.length; i++) {
    if (chosen.has(nucleotide(i))) near.push({ index: i, at: V(data.x[i], data.y[i], data.z[i]).sub(origin), element: data.elements[data.element[i]] });
  }
  const atoms: Placement[] = near.map((atom) => ({ position: atom.at.clone().multiplyScalar(toUnit), scale: uniform((atom.element === 'P' ? 0.62 : 0.46) * toUnit), color: new THREE.Color(ELEMENT_COLOUR[atom.element] ?? '#888888') }));
  group.add(instances(sphere(2), material('#ffffff', { roughness: 0.35 }), atoms));
  const bonds: Placement[] = [];
  const up = V(0, 1, 0);
  for (let a = 0; a < near.length; a++) for (let b = a + 1; b < near.length; b++) {
    const between = near[b].at.clone().sub(near[a].at);
    const length = between.length();
    if (length > 1.9 || length < 0.8) continue;
    bonds.push({
      position: near[a].at.clone().add(near[b].at).multiplyScalar(0.5 * toUnit),
      scale: V(0.14 * toUnit, length * toUnit, 0.14 * toUnit),
      rotation: new THREE.Quaternion().setFromUnitVectors(up, between.normalize()),
    });
  }
  group.add(instances(new THREE.CylinderGeometry(1, 1, 1, 8), material('#b9b9b9'), bonds));
  const example = (element: string, text: string, towards: THREE.Vector3): JourneyLabel | null => {
    const found = near.filter((atom) => atom.element === element && atom.index !== data.focusAtom).sort((a, b) => a.at.distanceTo(towards) - b.at.distanceTo(towards))[0];
    return found ? { text, at: found.at.clone().multiplyScalar(toUnit) } : null;
  };
  return {
    group, start: V(0, 0, 0), focus: V(0, 0, 0),
    labels: [{ text: 'This carbon atom', at: V(0, 0, 0) }, example('N', 'Nitrogen', V(-10, -3, 0)), example('O', 'Oxygen', V(10, 7, 0)), example('P', 'Phosphorus', V(-3, 11, 0)), example('C', 'Carbon', V(6, -9, 0))].filter((label): label is JourneyLabel => label !== null),
  };
}

/** Clementi and Raimondi give effective nuclear charges for carbon of 5.673 (1s), 3.217 (2s) and 3.136 (2p); a Slater orbital's exponent is the charge over the principal quantum number. */
export const CARBON_ORBITALS = Object.freeze({ s1: 5.673, s2: 3.217 / 2, p2: 3.136 / 2 });
export const BOHR_RADIUS_METRES = 5.29177e-11;

/** A distance from the nucleus in Bohr radii, drawn from the radial density of a Slater orbital r^(2n) exp(-2 zeta r), which is a gamma distribution. */
export function sampleSlaterRadius(n: number, zeta: number, next: () => number): number {
  let sum = 0;
  for (let k = 0; k < 2 * n + 1; k++) sum -= Math.log(1 - next());
  return sum / (2 * zeta);
}

function orbitalPoints(toUnit: number, count: number, n: number, zeta: number, axis: THREE.Vector3 | null, colour: string, opacity: number, size: number, rng: () => number): THREE.Points {
  const isotropic = () => { for (;;) { const p = V(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); const l = p.length(); if (l > 0 && l <= 1) return p.multiplyScalar(1 / l); } };
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let direction = isotropic();
    // In a p orbital the density goes as the square of the cosine of the angle from its axis.
    if (axis) while (rng() > direction.dot(axis) ** 2) direction = isotropic();
    const radius = sampleSlaterRadius(n, zeta, rng) * toUnit;
    positions.set([direction.x * radius, direction.y * radius, direction.z * radius], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: colour, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false }));
  points.frustumCulled = false;
  return points;
}

/** The probability density of carbon's electrons, 0.3 nanometres to the unit. */
export function buildAtom(): JourneyScene {
  const group = new THREE.Group();
  const toUnit = BOHR_RADIUS_METRES / 3e-10;
  const rng = random(19650606);
  // Two electrons each in 1s and 2s, and one each in two 2p orbitals, so that every dot stands for the same share of an electron.
  group.add(orbitalPoints(toUnit, 24000, 2, CARBON_ORBITALS.s2, null, '#a9bfe6', 0.5, 1.2, rng));
  group.add(orbitalPoints(toUnit, 12000, 2, CARBON_ORBITALS.p2, V(1, 0, 0), '#d0486f', 0.62, 1.3, rng));
  group.add(orbitalPoints(toUnit, 12000, 2, CARBON_ORBITALS.p2, V(0, 1, 0), '#9a4fc0', 0.62, 1.3, rng));
  group.add(orbitalPoints(toUnit, 24000, 1, CARBON_ORBITALS.s1, null, '#16307e', 0.75, 1.3, rng));
  return {
    group, start: V(0, 0, 0), focus: V(0, 0, 0),
    labels: [{ text: '1s electrons, close to the nucleus', at: V(0.03, -0.03, 0) }, { text: '2p orbital', at: V(0.26, 0, 0) }, { text: '2p orbital', at: V(0, 0.26, 0) }, { text: '2s electrons', at: V(-0.2, -0.22, 0) }],
  };
}

/** Far inside the atom, 3 picometres to the unit, only the inner electrons remain, and thinly. A ring of radius 60 femtometres marks the centre, because the nucleus is too small to see. */
export function buildEmpty(): JourneyScene {
  const group = new THREE.Group();
  const toUnit = BOHR_RADIUS_METRES / 3e-12;
  const rng = random(19650607);
  group.add(orbitalPoints(toUnit, 3000, 2, CARBON_ORBITALS.s2, null, '#6d8fd6', 0.8, 2, rng));
  group.add(orbitalPoints(toUnit, 40000, 1, CARBON_ORBITALS.s1, null, '#16307e', 0.8, 2, rng));
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0012, 8, 40), new THREE.MeshBasicMaterial({ color: '#28303a', transparent: true }));
  group.add(mark);
  return { group, start: V(0, 0, 0), focus: V(0, 0, 0), labels: [{ text: 'The nucleus lies at the centre of this ring', at: V(0, 0.02, 0) }] };
}

/** Twelve nucleons within the measured charge radius, 12 femtometres to the unit. Their arrangement is a sketch. */
export function buildAtomicNucleus(): JourneyScene {
  const group = new THREE.Group();
  const toUnit = 1 / 12; // femtometres
  const nucleonRadius = 0.84 * toUnit, reach = 1.62 * toUnit;
  const vertices = new THREE.IcosahedronGeometry(reach, 0).getAttribute('position');
  const unique: THREE.Vector3[] = [];
  for (let i = 0; i < vertices.count; i++) {
    const p = V(vertices.getX(i), vertices.getY(i), vertices.getZ(i));
    if (!unique.some((other) => other.distanceTo(p) < 1e-4)) unique.push(p);
  }
  // Protons and neutrons alternate over the sketch, and the first proton is the one the view moves towards.
  const proton = unique.filter((_, i) => i % 2 === 0), neutron = unique.filter((_, i) => i % 2 === 1);
  group.add(instances(sphere(8), material('#d65a50', { roughness: 0.45 }), proton.map((position) => ({ position, scale: uniform(nucleonRadius) }))));
  group.add(instances(sphere(8), material('#8290aa', { roughness: 0.45 }), neutron.map((position) => ({ position, scale: uniform(nucleonRadius) }))));
  const shell = new THREE.Mesh(sphere(12), material('#e8c6b8', { opacity: 0.12, depthWrite: false }));
  shell.scale.setScalar(2.47 * toUnit);
  group.add(shell);
  return {
    group, start: V(0, 0, 0), focus: proton[0].clone(),
    labels: [{ text: 'Proton', at: proton[1] }, { text: 'Neutron', at: neutron[1] }, { text: 'Charge radius, 2.47 fm', at: V(0, 2.47 * toUnit, 0) }],
  };
}

/** A proton, 2.4 femtometres to the unit. Quarks are drawn far larger than any measured size. */
export function buildProton(): JourneyScene {
  const rng = random(19650608);
  const group = new THREE.Group();
  const toUnit = 1 / 2.4; // femtometres
  const R = 0.84 * toUnit;
  const shell = new THREE.Mesh(sphere(14), material('#d65a50', { opacity: 0.13, depthWrite: false, roughness: 0.35 }));
  shell.scale.setScalar(R);
  group.add(shell);
  const quarks = [{ at: V(0.14, 0.08, 0.03), colour: '#c6467c' }, { at: V(-0.15, 0.06, -0.03), colour: '#c6467c' }, { at: V(0.01, -0.15, 0.05), colour: '#2f75b6' }];
  for (const quark of quarks) {
    const mesh = new THREE.Mesh(sphere(6), material(quark.colour, { roughness: 0.4 }));
    mesh.position.copy(quark.at);
    mesh.scale.setScalar(0.026);
    group.add(mesh);
  }
  const gluons: THREE.BufferGeometry[] = [];
  for (let a = 0; a < 3; a++) {
    const from = quarks[a].at, to = quarks[(a + 1) % 3].at;
    const along = to.clone().sub(from), across = V(-along.y, along.x, along.z * 0.3).normalize();
    gluons.push(tubeGeometry(Array.from({ length: 42 }, (_, i) => { const t = i / 41; return from.clone().addScaledVector(along, t).addScaledVector(across, 0.016 * Math.sin(t * 34)); }), 0.0026, 5, 2));
  }
  group.add(new THREE.Mesh(merged(gluons), material('#6da559')));
  const sea: Placement[] = [];
  while (sea.length < 260) {
    const p = V(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (p.length() <= 1) sea.push({ position: p.multiplyScalar(R * 0.96), scale: uniform(0.0034), color: rng() > 0.5 ? new THREE.Color('#6da559') : new THREE.Color('#b8a3a3') });
  }
  group.add(instances(sphere(0), material('#ffffff'), sea));
  return {
    group, start: V(0, 0, 0), focus: V(0, 0, 0),
    labels: [{ text: 'Up quark', at: quarks[0].at }, { text: 'Up quark', at: quarks[1].at }, { text: 'Down quark', at: quarks[2].at }, { text: 'Gluons', at: V(0, 0.09, 0.03) }, { text: 'Charge radius, 0.84 fm', at: V(0, R, 0) }],
  };
}

export const JOURNEY_BUILDERS: Readonly<Record<string, (data: NucleosomeData | null) => JourneyScene | null>> = Object.freeze({
  skin: () => buildSkinBlock(),
  epidermis: () => buildEpidermis(),
  cell: () => buildCell(),
  nucleus: () => buildNucleus(),
  chromatin: () => buildChromatin(),
  nucleosome: (data) => (data ? buildNucleosome(data) : null),
  dna: (data) => (data ? buildDnaAtoms(data) : null),
  atom: () => buildAtom(),
  empty: () => buildEmpty(),
  'atomic-nucleus': () => buildAtomicNucleus(),
  proton: () => buildProton(),
});

export function disposeScene(scene: JourneyScene): void {
  scene.group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      object.geometry.dispose();
      for (const made of [object.material].flat()) made.dispose();
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  });
}
