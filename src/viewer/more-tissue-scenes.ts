import * as THREE from 'three';
import { instances, material, merged, random, shade, sphere, tubeGeometry, uniform, V, type JourneyScene, type Placement, type TissueMotion } from './scale-journey-scenes';
import { body, carried, finish, flashing, NUCLEUS_COLOUR, packed, withBranches, withMotion } from './tissue-scenes';

/**
 * The first two levels of the zoom into the remaining tissues of the mouse: a block about 1.6 mm across, and a view of its cells about 70 micrometres across.
 * As for the other tissues, every position, count and size is generated with a fixed seed to illustrate a published description, and none is a measurement.
 */
const FACE = 0.505;

const band = (group: THREE.Group, bottom: number, top: number, color: string, width = 0.99, depth = 0.99, front = 0.5) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, top - bottom, depth), material(color));
  mesh.position.set(0, (top + bottom) / 2, front - depth / 2);
  group.add(mesh);
};
/** A space that holds air, urine or clear fluid: nearly invisible, so that it does not hide the tissue that faces it. */
const space = (group: THREE.Group, bottom: number, top: number, color: string, width = 0.99, depth = 0.5, front = 0.5) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, top - bottom, depth), material(color, { opacity: 0.12 }));
  mesh.position.set(0, (top + bottom) / 2, front - depth / 2);
  group.add(mesh);
};
const disc = (x: number, y: number, rx: number, ry = rx, z = FACE, color?: THREE.Color): Placement => ({ position: V(x, y, z), scale: V(rx, ry, 0.002), color });
const discs = (group: THREE.Group, items: readonly Placement[], color: string, detail = 2) => { const mesh = instances(sphere(detail), material(color), items); group.add(mesh); return mesh; };
const lines = (group: THREE.Group, items: readonly THREE.Vector3[][], radius: number, color: string, sides = 4) => group.add(new THREE.Mesh(merged(items.map((line) => tubeGeometry(line, radius, sides, 1))), material(color)));

/** Cartilage: isolated cells in a large matrix, under a perichondrium. */
export function buildCartilageBlock(): JourneyScene {
  const rng = random(20030401), group = new THREE.Group();
  band(group, -0.495, 0.34, '#d3d9e4');
  band(group, 0.34, 0.42, '#efe5d6');
  band(group, 0.42, 0.495, '#f4e9dc');
  const lacunae: Placement[] = [], cells: Placement[] = [];
  for (let i = 0; i < 620; i++) {
    const x = (rng() - 0.5) * 0.96, y = -0.48 + rng() * 0.8, r = 0.007 + rng() * 0.005;
    lacunae.push(disc(x, y, r)); cells.push(disc(x, y, r * 0.72, r * 0.72, FACE + 0.002));
    if (rng() < 0.4) { lacunae.push(disc(x + r * 2.1, y, r)); cells.push(disc(x + r * 2.1, y, r * 0.72, r * 0.72, FACE + 0.002)); }
  }
  discs(group, lacunae, '#eef1f5', 1);
  discs(group, cells, '#c9a79a', 1);
  const focus = cells[Math.floor(cells.length * 0.55)].position;
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, 0.5), [
    { text: 'Cartilage matrix', at: V(-0.3, -0.25, 0.51) },
    { text: 'Chondrocytes in lacunae', at: V(focus.x, focus.y, 0.51) },
    { text: 'Perichondrium', at: V(0.22, 0.38, 0.51) },
  ]);
}

export function buildCartilageCells(): JourneyScene {
  const rng = random(20030402), group = new THREE.Group();
  group.add(body(2.4, '#d6dce7', 1.2));
  const lacunae: Placement[] = [], cells: Placement[] = [], nuclei: Placement[] = [], droplets: Placement[] = [];
  const centres = packed(1.1, 0.62, 0.14, rng);
  let focus = V(0, 0, 0.5), nearest = Infinity;
  for (const point of centres) {
    const r = 0.17 + rng() * 0.06;
    lacunae.push(disc(point.x, point.y, r * 1.2, r * 1.1));
    cells.push(disc(point.x, point.y, r, r * 0.92, FACE + 0.002));
    const nucleus = V(point.x + 0.02, point.y + 0.02, FACE + 0.004);
    nuclei.push(disc(nucleus.x, nucleus.y, r * 0.38, r * 0.34, nucleus.z));
    droplets.push(disc(point.x - r * 0.45, point.y - r * 0.3, r * 0.2, r * 0.2, FACE + 0.003));
    if (Math.hypot(point.x, point.y) < nearest) { nearest = Math.hypot(point.x, point.y); focus = nucleus; }
  }
  discs(group, lacunae, '#f0f2f6', 3);
  discs(group, cells, '#d9bdb0', 3);
  discs(group, droplets, '#f2e6c4', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a chondrocyte', at: focus },
    { text: 'Lacuna', at: V(lacunae[3].position.x, lacunae[3].position.y + lacunae[3].scale.y * 0.9, 0.51) },
    { text: 'Matrix, with no vessels', at: V(centres[0].x + 0.3, centres[0].y + 0.28, 0.51) },
  ]);
}

/** A tendon: bundles of bundles of collagen fibres, cut across, and its cells lengthways. */
export function buildTendonBlock(): JourneyScene {
  const rng = random(20001201), group = new THREE.Group();
  group.add(body(0.99, '#f6f0e4'));
  const bundles = [{ x: -0.2, y: 0.17, r: 0.27 }, { x: 0.25, y: 0.12, r: 0.23 }, { x: 0.02, y: -0.26, r: 0.26 }];
  const fibres: Placement[] = [], sheaths: Placement[] = [], cells: Placement[] = [];
  for (const item of bundles) {
    sheaths.push(disc(item.x, item.y, item.r + 0.014, item.r + 0.014));
    for (const point of packed(item.r, 0.031, 0.006, rng)) {
      if (Math.hypot(point.x, point.y) > item.r - 0.012) continue;
      fibres.push(disc(item.x + point.x, item.y + point.y, 0.0145, 0.0145, FACE + 0.002, shade('#efe5cf', 0.94 + rng() * 0.1)));
      if (rng() < 0.3) cells.push(disc(item.x + point.x + 0.016, item.y + point.y + 0.009, 0.0035, 0.0035, FACE + 0.004));
    }
  }
  discs(group, sheaths, '#dcc9ad', 3);
  discs(group, fibres, '#ffffff', 1);
  discs(group, cells, NUCLEUS_COLOUR, 1);
  const focus = fibres[Math.floor(fibres.length * 0.4)].position;
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, 0.5), [
    { text: 'Bundle of collagen fibres', at: V(bundles[1].x, bundles[1].y, 0.51) },
    { text: 'Endotenon', at: V(bundles[2].x + bundles[2].r, bundles[2].y, 0.51) },
    { text: 'Tenocytes', at: cells[cells.length >> 1].position },
  ]);
}

export function buildTendonCells(): JourneyScene {
  const rng = random(20001202), group = new THREE.Group();
  group.add(body(2.4, '#f1e8d6', 1.2));
  const fibres: Placement[] = [], nuclei: Placement[] = [], cells: Placement[] = [];
  const crimp: THREE.Vector3[][] = [];
  for (let y = -1.05; y <= 1.05; y += 0.3) {
    fibres.push({ position: V(0, y, FACE), scale: V(1.2, 0.125, 0.002), color: shade('#ebdfc6', 0.95 + rng() * 0.08) });
    for (let k = -2; k <= 2; k++) crimp.push(Array.from({ length: 13 }, (_, i) => V(-1.2 + i * 0.2, y + k * 0.046 + 0.008 * Math.sin(i * 1.7 + k), FACE + 0.003)));
    const x = -0.8 + rng() * 0.6;
    for (const at of [x, x + 0.75, x + 1.5]) {
      cells.push(disc(at, y + 0.15, 0.24, 0.014, FACE + 0.002));
      nuclei.push(disc(at, y + 0.15, 0.11, 0.012, FACE + 0.004));
    }
  }
  discs(group, fibres, '#ffffff', 2);
  lines(group, crimp, 0.0035, '#d8c8aa');
  discs(group, cells, '#d9c2a5', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 2);
  const focus = nuclei[Math.floor(nuclei.length * 0.5)].position;
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a tenocyte', at: focus },
    { text: 'Collagen fibre', at: V(0.42, fibres[1].position.y, 0.51) },
    { text: 'Fibrils, in a gentle crimp', at: V(-0.6, fibres[5].position.y + 0.046, 0.51) },
  ]);
}

/** A serous membrane: one layer of flat cells on connective tissue, over what it covers. */
export function buildMembraneBlock(): JourneyScene {
  const rng = random(20040101), group = new THREE.Group();
  band(group, -0.495, -0.12, '#b98071');
  band(group, -0.12, 0.08, '#efe2d0');
  band(group, 0.08, 0.098, '#f8e6da');
  space(group, 0.098, 0.495, '#dfe9ee');
  const vessels: Placement[] = [], fibres: THREE.Vector3[][] = [], cells: Placement[] = [];
  for (let i = 0; i < 12; i++) vessels.push(disc((rng() - 0.5) * 0.9, -0.1 + rng() * 0.16, 0.012, 0.012));
  for (let i = 0; i < 26; i++) { const y = -0.11 + rng() * 0.18, x = (rng() - 0.5) * 0.9; fibres.push(Array.from({ length: 8 }, (_, k) => V(x - 0.12 + k * 0.035, y + Math.sin(k + i) * 0.005, FACE - 0.002))); }
  for (let x = -0.48; x < 0.49; x += 0.03) cells.push(disc(x, 0.09, 0.0135, 0.0045, FACE + 0.002));
  lines(group, fibres, 0.0015, '#d9c4a5');
  discs(group, vessels, '#c8505a');
  discs(group, cells, NUCLEUS_COLOUR, 1);
  const focus = cells[Math.floor(cells.length / 2)].position;
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, 0.5), [
    { text: 'Mesothelium', at: V(focus.x, focus.y, 0.51) },
    { text: 'Connective tissue', at: V(-0.28, -0.03, 0.51) },
    { text: 'Capillary', at: vessels[4].position },
    { text: 'What it covers', at: V(0.3, -0.3, 0.51) },
  ]);
}

export function buildMembraneCells(): JourneyScene {
  const group = new THREE.Group(), rng = random(20040102);
  band(group, -1.2, -0.08, '#efe2d0', 2.4, 1.2);
  band(group, -0.08, -0.06, '#d7c3a2', 2.4, 1.2);
  space(group, 0.12, 1.2, '#dfe9ee', 2.4);
  const cells: Placement[] = [], nuclei: Placement[] = [], villi: THREE.Vector3[][] = [], fibres: THREE.Vector3[][] = [];
  for (let x = -1.05; x < 1.1; x += 0.7) {
    cells.push({ position: V(x, 0.02, FACE), scale: V(0.345, 0.1, 0.002) });
    nuclei.push(disc(x, 0.03, 0.15, 0.052, FACE + 0.003));
    for (let m = -8; m <= 8; m++) villi.push([V(x + m * 0.04, 0.11, FACE + 0.002), V(x + m * 0.04 + (rng() - 0.5) * 0.02, 0.19 + rng() * 0.05, FACE + 0.002)]);
  }
  for (let i = 0; i < 24; i++) { const y = -1.1 + rng() * 0.95; fibres.push(Array.from({ length: 10 }, (_, k) => V(-1.15 + k * 0.26, y + Math.sin(k * 0.9 + i) * 0.03, FACE - 0.004))); }
  discs(group, cells, '#f0d8cc', 3);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  lines(group, villi, 0.006, '#dcb6a6', 3);
  lines(group, fibres, 0.008, '#d9c4a5');
  const capillary = [V(-1.2, -0.62, FACE), V(0, -0.56, FACE), V(1.2, -0.66, FACE)];
  group.add(new THREE.Mesh(tubeGeometry(capillary, 0.07, 12), material('#c8605a')));
  const focus = nuclei[1].position;
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a flat mesothelial cell', at: focus },
    { text: 'Microvilli', at: V(0.34, 0.2, 0.51) },
    { text: 'Basement membrane', at: V(-0.7, -0.07, 0.51) },
    { text: 'Capillary', at: capillary[1] },
  ]);
}

/** A gland: lobules of secreting acini round their ducts. */
export function buildGlandBlock(): JourneyScene {
  const rng = random(19970101), group = new THREE.Group();
  group.add(body(0.99, '#efe0d0'));
  const acini: Placement[] = [], lumens: Placement[] = [], ducts: Placement[] = [], ductLumens: Placement[] = [], vessels: Placement[] = [];
  const lobules = packed(0.36, 0.37, 0.05, rng);
  for (const lobule of lobules) {
    for (const point of packed(0.155, 0.031, 0.006, rng)) {
      if (Math.hypot(point.x, point.y) > 0.155) continue;
      acini.push(disc(lobule.x + point.x, lobule.y + point.y, 0.0145, 0.0145, FACE, shade('#d79a8b', 0.9 + rng() * 0.16)));
      lumens.push(disc(lobule.x + point.x, lobule.y + point.y, 0.0028, 0.0028, FACE + 0.002));
    }
    ducts.push(disc(lobule.x, lobule.y, 0.021, 0.021, FACE + 0.003));
    ductLumens.push(disc(lobule.x, lobule.y, 0.012, 0.012, FACE + 0.004));
    vessels.push(disc(lobule.x + 0.17, lobule.y + 0.04, 0.008, 0.008, FACE + 0.002));
  }
  discs(group, acini, '#ffffff', 1);
  discs(group, lumens, '#f8efe8', 0);
  discs(group, ducts, '#eec6b4');
  discs(group, ductLumens, '#fbf4ec');
  discs(group, vessels, '#c8505a');
  const focus = acini[Math.floor(acini.length * 0.45)].position;
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, 0.5), [
    { text: 'Acini', at: V(focus.x, focus.y, 0.51) },
    { text: 'Duct', at: ducts[1].position },
    { text: 'Connective tissue between lobules', at: V(lobules[0].x + 0.185, lobules[0].y + 0.185, 0.51) },
    { text: 'Vessel', at: vessels[2].position },
  ]);
}

export function buildGlandCells(): JourneyScene {
  const rng = random(19970102), group = new THREE.Group();
  group.add(body(2.4, '#f1e4d6', 1.2));
  const cells: Placement[] = [], granules: Placement[] = [], nuclei: Placement[] = [], lumens: Placement[] = [];
  const acini = [{ x: 0, y: 0 }, { x: -1.02, y: 0.55 }, { x: 1.02, y: 0.55 }, { x: -1.02, y: -0.6 }, { x: 1.02, y: -0.6 }];
  let focus = V(0, 0, 0.5);
  acini.forEach((centre, which) => {
    for (let k = 0; k < 8; k++) {
      const angle = k / 8 * Math.PI * 2, x = centre.x + Math.cos(angle) * 0.33, y = centre.y + Math.sin(angle) * 0.33;
      const turn = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), angle);
      cells.push({ position: V(x, y, FACE), scale: V(0.25, 0.135, 0.002), rotation: turn, color: shade('#d9a091', 0.94 + rng() * 0.1) });
      const nucleus = V(centre.x + Math.cos(angle) * 0.46, centre.y + Math.sin(angle) * 0.46, FACE + 0.004);
      nuclei.push(disc(nucleus.x, nucleus.y, 0.062, 0.062, nucleus.z));
      if (which === 0 && k === 1) focus = nucleus;
      for (let g = 0; g < 8; g++) {
        const reach = 0.13 + rng() * 0.16, spread = angle + (rng() - 0.5) * 0.5;
        granules.push(disc(centre.x + Math.cos(spread) * reach, centre.y + Math.sin(spread) * reach, 0.016, 0.016, FACE + 0.003));
      }
    }
    lumens.push(disc(centre.x, centre.y, 0.09, 0.09, FACE + 0.005));
  });
  discs(group, cells, '#ffffff', 3);
  discs(group, granules, '#8c4f5e', 1);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  discs(group, lumens, '#fbf6ef');
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a secreting cell', at: focus },
    { text: 'Secretory granules', at: granules[3].position },
    { text: 'Lumen of an acinus', at: lumens[0].position },
  ]);
}

/** An endocrine gland without follicles: cords of cells among wide capillaries. */
export function buildEndocrineBlock(): JourneyScene {
  const rng = random(19660101), group = new THREE.Group();
  group.add(body(0.99, '#e3bfa8'));
  const cells: Placement[] = [], vessels: THREE.Vector3[][] = [];
  for (let row = -6; row <= 6; row++) {
    const y = row * 0.075;
    vessels.push(Array.from({ length: 7 }, (_, k) => V(-0.49 + k * 0.163, y + 0.037 + (rng() - 0.5) * 0.012, FACE + 0.002)));
    for (let x = -0.48; x < 0.49; x += 0.018) cells.push(disc(x + (rng() - 0.5) * 0.004, y + (rng() - 0.5) * 0.018, 0.0085, 0.0085, FACE, shade('#d89a84', 0.92 + rng() * 0.14)));
  }
  discs(group, cells, '#ffffff', 0);
  lines(group, vessels, 0.0065, '#b8404a');
  band(group, 0.45, 0.495, '#efe2cd');
  const focus = cells[Math.floor(cells.length * 0.5)].position;
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, 0.5), [
    { text: 'Cords of secreting cells', at: V(focus.x, focus.y, 0.51) },
    { text: 'Capillary', at: vessels[3][2] },
    { text: 'Capsule', at: V(0.2, 0.47, 0.51) },
  ]);
}

export function buildEndocrineCells(): JourneyScene {
  const rng = random(19660102), group = new THREE.Group();
  group.add(body(2.4, '#efd7c4', 1.2));
  const cells: Placement[] = [], nuclei: Placement[] = [], granules: Placement[] = [];
  let focus = V(0, 0, 0.5), nearest = Infinity;
  for (const point of packed(1.15, 0.36, 0.05, rng)) {
    if (Math.abs(point.y - 0.42) < 0.2 || Math.abs(point.y + 0.62) < 0.2) continue;
    cells.push(disc(point.x, point.y, 0.17, 0.165, FACE, shade('#dfa892', 0.93 + rng() * 0.12)));
    const nucleus = V(point.x, point.y, FACE + 0.004);
    nuclei.push(disc(point.x, point.y, 0.066, 0.066, nucleus.z));
    if (Math.hypot(point.x, point.y) < nearest) { nearest = Math.hypot(point.x, point.y); focus = nucleus; }
    for (let g = 0; g < 16; g++) { const a = rng() * 6.28, r = 0.08 + rng() * 0.07; granules.push(disc(point.x + Math.cos(a) * r, point.y + Math.sin(a) * r, 0.011, 0.011, FACE + 0.003)); }
  }
  discs(group, cells, '#ffffff', 3);
  discs(group, granules, '#94586a', 1);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  const capillaries = [[V(-1.2, 0.42, FACE), V(0, 0.45, FACE), V(1.2, 0.41, FACE)], [V(-1.2, -0.62, FACE), V(0, -0.6, FACE), V(1.2, -0.63, FACE)]];
  lines(group, capillaries, 0.1, '#c8605a', 12);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a secreting cell', at: focus },
    { text: 'Hormone granules', at: granules[5].position },
    { text: 'Capillary', at: capillaries[0][1] },
  ]);
}

/** The thyroid: follicles of cells round stored colloid. */
export function buildThyroidBlock(): JourneyScene {
  const rng = random(20170601), group = new THREE.Group();
  group.add(body(0.99, '#e7c3ac'));
  const walls: Placement[] = [], colloid: Placement[] = [], vessels: Placement[] = [];
  for (const point of packed(0.46, 0.078, 0.014, rng)) {
    const r = 0.028 + rng() * 0.012;
    walls.push(disc(point.x, point.y, r + 0.005, r + 0.005));
    colloid.push(disc(point.x, point.y, r, r, FACE + 0.002));
    if (rng() < 0.35) vessels.push(disc(point.x + r + 0.008, point.y + r * 0.6, 0.0035, 0.0035, FACE + 0.003));
  }
  discs(group, walls, '#cf8b78');
  discs(group, colloid, '#f0d29a');
  discs(group, vessels, '#b8404a', 1);
  const focus = walls[Math.floor(walls.length * 0.48)];
  return finish(group, V(0, 0, 0.2), V(focus.position.x + focus.scale.x, focus.position.y, 0.5), [
    { text: 'Follicle', at: V(focus.position.x, focus.position.y, 0.51) },
    { text: 'Stored colloid', at: colloid[6].position },
    { text: 'Capillary', at: vessels[3].position },
  ]);
}

export function buildThyroidCells(): JourneyScene {
  const rng = random(20170602), group = new THREE.Group();
  group.add(body(2.4, '#edd0ba', 1.2));
  const colloid = new THREE.Mesh(new THREE.CircleGeometry(0.72, 72), material('#f1d59f'));
  colloid.position.set(0, 0, FACE - 0.002);
  group.add(colloid);
  const cells: Placement[] = [], nuclei: Placement[] = [];
  let focus = V(0, 0, 0.5);
  for (let k = 0; k < 18; k++) {
    const angle = k / 18 * Math.PI * 2, x = Math.cos(angle) * 0.86, y = Math.sin(angle) * 0.86;
    cells.push({ position: V(x, y, FACE), scale: V(0.14, 0.146, 0.002), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), angle), color: shade('#d99b86', 0.93 + rng() * 0.12) });
    const nucleus = V(Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, FACE + 0.004);
    nuclei.push(disc(nucleus.x, nucleus.y, 0.062, 0.062, nucleus.z));
    if (k === 2) focus = nucleus;
  }
  discs(group, cells, '#ffffff', 3);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  const capillary = Array.from({ length: 12 }, (_, k) => V(Math.cos(k / 11 * 2.4 + 0.2) * 1.08, Math.sin(k / 11 * 2.4 + 0.2) * 1.08, FACE));
  group.add(new THREE.Mesh(tubeGeometry(capillary, 0.05, 10), material('#c8605a')));
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a follicular cell', at: focus },
    { text: 'Stored colloid', at: V(-0.2, 0.1, 0.51) },
    { text: 'Capillary', at: capillary[5] },
  ]);
}

/** Lymphoid tissue: dense nodules of lymphocytes round small arteries, in tissue full of blood. */
export function buildLymphoidBlock(): JourneyScene {
  const rng = random(20050801), group = new THREE.Group();
  group.add(body(0.99, '#a2464a'));
  const cells: Placement[] = [], reds: Placement[] = [], arteries: Placement[] = [];
  const nodules = [{ x: -0.24, y: 0.2, r: 0.17 }, { x: 0.26, y: 0.07, r: 0.14 }, { x: -0.08, y: -0.28, r: 0.15 }];
  for (const point of packed(0.49, 0.0095, 0.004, rng)) {
    const inNodule = nodules.some((item) => Math.hypot(point.x - item.x, point.y - item.y) < item.r);
    if (inNodule) cells.push(disc(point.x, point.y, 0.0044, 0.0044, FACE, shade('#3f3c70', 0.9 + rng() * 0.3)));
    else if (rng() < 0.42) reds.push(disc(point.x, point.y, 0.0036, 0.0036, FACE, shade('#c9303a', 0.86 + rng() * 0.3)));
  }
  for (const item of nodules) arteries.push(disc(item.x + 0.02, item.y, 0.011, 0.011, FACE + 0.003));
  discs(group, reds, '#ffffff', 0);
  discs(group, cells, '#ffffff', 0);
  discs(group, arteries, '#e7a29a');
  return finish(group, V(0, 0, 0.2), V(nodules[0].x - 0.05, nodules[0].y + 0.04, 0.5), [
    { text: 'White pulp, dense with lymphocytes', at: V(nodules[0].x - 0.05, nodules[0].y + 0.04, 0.51) },
    { text: 'Red pulp, full of blood', at: V(0.3, -0.32, 0.51) },
    { text: 'Small central artery', at: arteries[1].position },
  ]);
}

export function buildLymphoidCells(): JourneyScene {
  const rng = random(20050802), group = new THREE.Group();
  group.add(body(2.4, '#efe0dc', 1.2));
  const cytoplasm: Placement[] = [], nuclei: Placement[] = [], reds: Placement[] = [];
  let focus = V(0, 0, 0.5), nearest = Infinity;
  for (const point of packed(1.16, 0.16, 0.03, rng)) {
    if (point.x > 0.45 && point.y < 0.3) continue;
    cytoplasm.push(disc(point.x, point.y, 0.073, 0.073, FACE));
    const nucleus = V(point.x, point.y, FACE + 0.003);
    nuclei.push(disc(point.x, point.y, 0.06, 0.06, nucleus.z, shade('#5e4a8c', 0.82 + rng() * 0.3)));
    if (Math.hypot(point.x + 0.1, point.y - 0.1) < nearest) { nearest = Math.hypot(point.x + 0.1, point.y - 0.1); focus = nucleus; }
  }
  for (let i = 0; i < 26; i++) reds.push(disc(0.5 + rng() * 0.65, -1.1 + rng() * 1.35, 0.043, 0.043, FACE + 0.002, shade('#c9303a', 0.88 + rng() * 0.25)));
  discs(group, cytoplasm, '#e4d7e4', 2);
  const nucleusMesh = discs(group, nuclei, '#ffffff', 2);
  const redMesh = discs(group, reds, '#ffffff', 2);
  const macrophage = disc(-0.45, -0.5, 0.28, 0.24, FACE + 0.006);
  discs(group, [macrophage], '#d9c7ad', 3);
  discs(group, [disc(-0.55, -0.48, 0.09, 0.075, FACE + 0.008)], NUCLEUS_COLOUR, 3);
  discs(group, [disc(-0.33, -0.56, 0.043, 0.043, FACE + 0.008), disc(-0.36, -0.42, 0.043, 0.043, FACE + 0.008)], '#c9303a', 2);
  return withBranches(withMotion(finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a lymphocyte', at: focus },
    { text: 'Macrophage holding old red cells', at: macrophage.position },
    { text: 'Red cells', at: reds[5].position },
  ]), carried(redMesh, 1, -1.15, 0.3, 0.012), flashing(nucleusMesh, 0.03, 20050803)), [{ tail: 'blood', text: 'Red cell', at: reds[5].position }]);
}

/** The colon: crypts with no villi, two layers of mucus as Johansson et al. describe, with bacteria only in the outer one and beyond. */
const MUCUS = Object.freeze({ inner: 0.03, outer: 0.094 });

export function buildColonBlock(): JourneyScene {
  const rng = random(20080901), group = new THREE.Group();
  band(group, -0.495, -0.33, '#b05a50');
  band(group, -0.33, -0.28, '#ecd7c6');
  band(group, -0.28, 0, '#e9c0ae');
  band(group, 0, MUCUS.inner, '#cfe0ea');
  band(group, MUCUS.inner, MUCUS.outer, '#e3edf0');
  band(group, MUCUS.outer, 0.495, '#d9c79f');
  const crypts: Placement[] = [], lumens: Placement[] = [], bacteria: Placement[] = [];
  for (let x = -0.47; x <= 0.47; x += 0.052) {
    crypts.push({ position: V(x, -0.14, FACE), scale: V(0.019, 0.135, 0.002) });
    lumens.push({ position: V(x, -0.13, FACE + 0.002), scale: V(0.0035, 0.125, 0.002) });
  }
  for (let i = 0; i < 2600; i++) {
    const y = MUCUS.inner + 0.002 + (0.495 - MUCUS.inner - 0.002) * rng() ** 1.4;
    bacteria.push({ position: V((rng() - 0.5) * 0.98, y, FACE), scale: uniform(0.0022), color: shade(rng() < 0.5 ? '#6d5a85' : '#8a6a3d', 0.9 + rng() * 0.3) });
  }
  discs(group, crypts, '#d99a8a', 2);
  discs(group, lumens, '#f8eadf', 1);
  const microbes = discs(group, bacteria, '#ffffff', 0);
  const focus = crypts[Math.floor(crypts.length / 2)].position;
  return withBranches(withMotion(finish(group, V(0, 0, 0.2), V(focus.x, -0.02, 0.5), [
    { text: 'Crypts, with no villi', at: V(focus.x, -0.1, 0.51) },
    { text: 'Inner mucus, free of bacteria', at: V(-0.32, MUCUS.inner / 2, 0.51) },
    { text: 'Outer mucus, with bacteria', at: V(0.3, (MUCUS.inner + MUCUS.outer) / 2, 0.51) },
    { text: 'Contents of the colon', at: V(-0.1, 0.32, 0.51) },
    { text: 'Muscle', at: V(0.3, -0.42, 0.51) },
  ]), carried(microbes, 0, -0.49, 0.49, 0.003)), [{ tail: 'microbiota', text: 'Gut bacteria', at: V(0.24, 0.07, 0.51) }]);
}

export function buildColonCells(): JourneyScene {
  const rng = random(20080902), group = new THREE.Group();
  band(group, -1.2, -0.72, '#f0d9c8', 2.4, 1.2);
  band(group, -0.72, -0.22, '#e9c8b8', 2.4, 1.2);
  const INNER = 0.24, OUTER = 0.86;
  band(group, -0.22, INNER, '#d2e2ec', 2.4, 1.2);
  band(group, INNER, OUTER, '#e7f0f2', 2.4, 1.2);
  band(group, OUTER, 1.3, '#dccba5', 2.4, 1.2);
  const cells: Placement[] = [], nuclei: Placement[] = [], goblets: Placement[] = [], bacteria: Placement[] = [];
  let focus = V(0, 0, 0.5), index = 0;
  for (let x = -1.14; x < 1.18; x += 0.19) {
    const goblet = index % 3 === 1;
    cells.push({ position: V(x, -0.47, FACE), scale: V(0.092, 0.25, 0.002), color: shade(goblet ? '#ccb5c5' : '#e4b4a4', 0.94 + rng() * 0.1) });
    const nucleus = V(x, -0.62, FACE + 0.004);
    nuclei.push(disc(nucleus.x, nucleus.y, 0.05, 0.075, nucleus.z));
    if (goblet) goblets.push({ position: V(x, -0.36, FACE + 0.003), scale: V(0.07, 0.13, 0.002) });
    if (Math.abs(x) < 0.1 && !goblet) focus = nucleus;
    index++;
  }
  discs(group, cells, '#ffffff', 3);
  discs(group, goblets, '#f0e8ef', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  const up = new THREE.Quaternion();
  for (let i = 0; i < 520; i++) {
    const y = INNER + 0.02 + (1.25 - INNER) * rng() ** 1.3;
    const turn = up.clone().setFromAxisAngle(V(0, 0, 1), rng() * 6.28);
    const round = rng() < 0.3, size = round ? 0.012 : 0.009;
    bacteria.push({ position: V((rng() - 0.5) * 2.36, y, FACE + 0.002), scale: V(size, round ? size : 0.022 + rng() * 0.012, 0.002), rotation: turn, color: shade(round ? '#a0784a' : '#6f5c8a', 0.9 + rng() * 0.3) });
  }
  const microbes = discs(group, bacteria, '#ffffff', 1);
  const strands: THREE.Vector3[][] = [];
  for (let i = 0; i < 40; i++) { const x = (rng() - 0.5) * 2.2, y = -0.15 + rng() * 1.2; strands.push(Array.from({ length: 6 }, (_, k) => V(x + k * 0.05, y + Math.sin(k + i) * 0.03, FACE + 0.001))); }
  lines(group, strands, 0.003, '#b9cfdb', 3);
  const way = V(0.1, 0.33, FACE + 0.003);
  return withBranches(withMotion(finish(group, V(0, -0.1, 0.2), focus, [
    { text: 'Nucleus of a colon cell', at: focus },
    { text: 'Goblet cell, making mucus', at: goblets[1].position },
    { text: 'Inner mucus, free of bacteria', at: V(-0.6, 0.02, 0.51) },
    { text: 'Outer mucus, with bacteria', at: V(0.6, 0.5, 0.51) },
  ]), carried(microbes, 0, -1.18, 1.18, 0.01)), [{ tail: 'microbiota', text: 'Gut bacteria', at: way }]);
}

/** The glandular stomach: pits from the surface, with acid and enzyme cells down the glands below them. */
export function buildStomachBlock(): JourneyScene {
  const rng = random(20110201), group = new THREE.Group();
  band(group, -0.495, -0.36, '#ab5a4e');
  band(group, -0.36, -0.31, '#ecd7c6');
  band(group, -0.31, 0.2, '#e3b3a0');
  band(group, 0.2, 0.235, '#cfe0ea');
  space(group, 0.235, 0.495, '#e8e1cc');
  const glands: Placement[] = [], lumens: Placement[] = [], parietal: Placement[] = [], chief: Placement[] = [];
  for (let x = -0.47; x <= 0.47; x += 0.05) {
    glands.push({ position: V(x, -0.055, FACE), scale: V(0.021, 0.255, 0.002) });
    lumens.push({ position: V(x, 0.03, FACE + 0.002), scale: V(0.0035, 0.17, 0.002) });
    for (let k = 0; k < 26; k++) {
      const y = -0.3 + rng() * 0.42;
      (y < -0.17 ? chief : parietal).push(disc(x + (rng() < 0.5 ? -1 : 1) * 0.012, y, 0.0062, 0.0062, FACE + 0.003));
    }
  }
  discs(group, glands, '#e8b9a6', 2);
  discs(group, lumens, '#fbf2ea', 1);
  discs(group, parietal, '#d67964', 0);
  discs(group, chief, '#8d6a9e', 0);
  const focus = parietal[Math.floor(parietal.length / 2)].position;
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, 0.5), [
    { text: 'Gastric pit', at: lumens[6].position },
    { text: 'Acid-making parietal cells', at: V(focus.x, focus.y, 0.51) },
    { text: 'Enzyme-making chief cells', at: chief[3].position },
    { text: 'Mucus', at: V(-0.3, 0.218, 0.51) },
  ]);
}

export function buildStomachCells(): JourneyScene {
  const rng = random(20110202), group = new THREE.Group();
  group.add(body(2.4, '#efd9c9', 1.2));
  const cells: Placement[] = [], nuclei: Placement[] = [], dots: Placement[] = [];
  const lumen = { position: V(0, 0, FACE + 0.001), scale: V(0.09, 1.2, 0.002) };
  let focus = V(0, 0, 0.5);
  for (const side of [-1, 1]) for (let y = -1.05; y < 1.1; y += 0.3) {
    const parietal = y > -0.6;
    cells.push({ position: V(side * 0.33, y, FACE), scale: V(0.24, 0.145, 0.002), color: shade(parietal ? '#e39a82' : '#b793b8', 0.94 + rng() * 0.1) });
    const nucleus = V(side * 0.36, y, FACE + 0.004);
    nuclei.push(disc(nucleus.x, nucleus.y, 0.062, 0.062, nucleus.z));
    if (side === 1 && Math.abs(y - 0.15) < 0.16) focus = nucleus;
    for (let k = 0; k < (parietal ? 34 : 18); k++) dots.push(disc(side * (0.13 + rng() * 0.42), y + (rng() - 0.5) * 0.25, parietal ? 0.022 : 0.014, parietal ? 0.012 : 0.014, FACE + 0.003, shade(parietal ? '#a94f3f' : '#5f3f77', 0.9 + rng() * 0.25)));
  }
  discs(group, cells, '#ffffff', 3);
  discs(group, [lumen], '#fbf3eb', 3);
  discs(group, dots, '#ffffff', 0);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a parietal cell', at: focus },
    { text: 'Mitochondria', at: dots[6].position },
    { text: 'Chief cell, with enzyme granules', at: cells[1].position },
    { text: 'Lumen of the gland', at: V(0, 0.7, 0.51) },
  ]);
}

/** The lining of the bladder and ureters: layers of cells with large umbrella cells at the surface. */
export function buildUrotheliumBlock(): JourneyScene {
  const group = new THREE.Group(), rng = random(20090601);
  band(group, -0.495, -0.1, '#b4685c');
  band(group, -0.1, 0.05, '#efdccb');
  const surface = Array.from({ length: 36 }, (_, k) => V(-0.5 + k / 35, 0.09 + 0.022 * Math.sin(k * 0.9), FACE));
  const folds: Placement[] = surface.map((point) => ({ position: point.clone().setY(point.y - 0.025), scale: V(0.02, 0.042, 0.002) }));
  discs(group, folds, '#e7b9a9', 2);
  space(group, 0.12, 0.495, '#f3e7a6');
  const bundles: Placement[] = [];
  for (let i = 0; i < 26; i++) bundles.push(disc((rng() - 0.5) * 0.94, -0.13 - rng() * 0.33, 0.035, 0.018, FACE, shade('#a2564b', 0.9 + rng() * 0.2)));
  discs(group, bundles, '#ffffff', 2);
  const vessels = [disc(-0.2, -0.03, 0.012, 0.012), disc(0.26, -0.05, 0.015, 0.015)];
  discs(group, vessels, '#c8505a');
  const focus = folds[18].position;
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, 0.5), [
    { text: 'Urothelium', at: V(focus.x, focus.y, 0.51) },
    { text: 'Connective tissue', at: V(-0.34, 0, 0.51) },
    { text: 'Smooth muscle', at: bundles[6].position },
    { text: 'Urine', at: V(0.2, 0.3, 0.51) },
  ]);
}

export function buildUrotheliumCells(): JourneyScene {
  const group = new THREE.Group(), rng = random(20090602);
  band(group, -1.2, -0.62, '#efdccb', 2.4, 1.2);
  band(group, -0.62, 0.5, '#e9c4b4', 2.4, 1.2);
  space(group, 0.5, 1.2, '#f3e7a6', 2.4);
  const cells: Placement[] = [], nuclei: Placement[] = [], umbrellas: Placement[] = [];
  let focus = V(0, 0, 0.5);
  for (let x = -1.1; x < 1.15; x += 0.16) cells.push(disc(x, -0.52, 0.076, 0.09, FACE, shade('#dcab9b', 0.95 + rng() * 0.1))), nuclei.push(disc(x, -0.52, 0.05, 0.058, FACE + 0.003));
  for (const row of [-0.28, -0.05]) for (let x = -1.05; x < 1.1; x += 0.26) cells.push(disc(x + row * 0.1, row, 0.125, 0.11, FACE, shade('#e2b5a5', 0.95 + rng() * 0.08))), nuclei.push(disc(x + row * 0.1, row, 0.056, 0.056, FACE + 0.003));
  for (let x = -0.92; x < 1; x += 0.62) {
    umbrellas.push({ position: V(x, 0.3, FACE + 0.002), scale: V(0.305, 0.18, 0.002), color: shade('#eec8b7', 0.96 + rng() * 0.08) });
    const nucleus = V(x, 0.28, FACE + 0.005);
    nuclei.push(disc(x, 0.28, 0.072, 0.06, nucleus.z));
    if (Math.abs(x) < 0.32) focus = nucleus;
  }
  discs(group, cells, '#ffffff', 2);
  discs(group, umbrellas, '#ffffff', 3);
  discs(group, nuclei, NUCLEUS_COLOUR, 2);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of an umbrella cell', at: focus },
    { text: 'Basal cells', at: V(0.5, -0.52, 0.51) },
    { text: 'Urine', at: V(-0.4, 0.8, 0.51) },
  ]);
}

/** The airway: a lining of cells with beating cilia, secretory cells and basal cells, over cartilage. */
export function buildAirwayBlock(): JourneyScene {
  const rng = random(20100801), group = new THREE.Group();
  band(group, -0.495, -0.22, '#d3d9e4');
  band(group, -0.22, 0.06, '#efdfd0');
  band(group, 0.06, 0.095, '#e7bdae');
  band(group, 0.095, 0.11, '#d7e4ea');
  space(group, 0.11, 0.495, '#dfe9ee');
  const chondrocytes: Placement[] = [], glands: Placement[] = [];
  for (let i = 0; i < 260; i++) chondrocytes.push(disc((rng() - 0.5) * 0.96, -0.48 + rng() * 0.25, 0.008, 0.008));
  for (let i = 0; i < 22; i++) glands.push(disc((rng() - 0.5) * 0.9, -0.2 + rng() * 0.22, 0.016, 0.016, FACE, shade('#d9a091', 0.92 + rng() * 0.14)));
  discs(group, chondrocytes, '#c9a79a', 1);
  discs(group, glands, '#ffffff', 1);
  const focus = V(0.02, 0.078, 0.5);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Lining with cilia', at: V(focus.x, focus.y, 0.51) },
    { text: 'Cartilage', at: V(-0.3, -0.36, 0.51) },
    { text: 'Connective tissue with glands', at: glands[5].position },
    { text: 'Air', at: V(0.2, 0.3, 0.51) },
  ]);
}

export function buildAirwayCells(): JourneyScene {
  const rng = random(20100802), group = new THREE.Group();
  band(group, -1.2, -0.62, '#efdfd0', 2.4, 1.2);
  band(group, -0.62, 0.42, '#e6c2b2', 2.4, 1.2);
  space(group, 0.42, 1.2, '#dfe9ee', 2.4);
  const cells: Placement[] = [], nuclei: Placement[] = [], basal: Placement[] = [], goblets: Placement[] = [];
  let focus = V(0, 0, 0.5), index = 0;
  const cilia: Placement[] = [];
  for (let x = -1.1; x < 1.15; x += 0.2) {
    const secretory = index % 5 === 2;
    cells.push({ position: V(x, -0.1, FACE), scale: V(0.096, 0.5, 0.002), color: shade(secretory ? '#ccb5c5' : '#e4b8a8', 0.95 + rng() * 0.08) });
    const nucleus = V(x, -0.2 + (rng() - 0.5) * 0.1, FACE + 0.004);
    nuclei.push(disc(nucleus.x, nucleus.y, 0.05, 0.08, nucleus.z));
    if (Math.abs(x) < 0.11 && !secretory) focus = nucleus;
    if (secretory) goblets.push({ position: V(x, 0.2, FACE + 0.003), scale: V(0.066, 0.14, 0.002) });
    else for (let m = -5; m <= 5; m++) cilia.push({ position: V(x + m * 0.017, 0.4, FACE + 0.002), scale: V(0.004, 0.12, 0.004) });
    if (index % 2 === 0) basal.push(disc(x + 0.1, -0.53, 0.06, 0.05, FACE + 0.002));
    index++;
  }
  discs(group, cells, '#ffffff', 3);
  discs(group, goblets, '#f0e8ef', 2);
  discs(group, basal, '#c9a596', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  // One end of each cilium stays on the cell, and the shafts sweep together in a wave.
  const shaft = new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0);
  const ciliaMesh = instances(shaft, material('#b9806e'), cilia);
  group.add(ciliaMesh);
  const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), axis = V(0, 0, 1);
  const beat = ({ seconds }: TissueMotion) => {
    cilia.forEach((item, i) => {
      turn.setFromAxisAngle(axis, 0.55 * Math.sin(seconds * 4 - item.position.x * 7));
      matrix.compose(item.position, turn, item.scale);
      ciliaMesh.setMatrixAt(i, matrix);
    });
    ciliaMesh.instanceMatrix.needsUpdate = true;
  };
  return withMotion(finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a ciliated cell', at: focus },
    { text: 'Cilia', at: V(0.3, 0.46, 0.51) },
    { text: 'Secretory cell', at: goblets[0].position },
    { text: 'Basal cell', at: basal[2].position },
  ]), beat);
}

/** The retina: layers in true proportion to the block, with the light-sensing outer segments against the pigment layer. */
export function buildRetinaBlock(): JourneyScene {
  const rng = random(19791101), group = new THREE.Group();
  const LAYERS: readonly (readonly [number, number, string])[] = [[-0.495, -0.33, '#efe5d4'], [-0.33, -0.21, '#7c2c2c'], [-0.21, -0.2, '#43302a'], [-0.2, -0.16, '#e8c9a8'], [-0.16, -0.14, '#e2b58d'], [-0.14, -0.07, '#7a6ca6'], [-0.07, -0.058, '#ecd8bc'], [-0.058, -0.03, '#8d80b4'], [-0.03, -0.012, '#ecd8bc'], [-0.012, 0, '#a699c6']];
  for (const [bottom, top, colour] of LAYERS) band(group, bottom, top, colour);
  space(group, 0, 0.495, '#e9edd8');
  const dots: Placement[] = [];
  for (let i = 0; i < 700; i++) dots.push(disc((rng() - 0.5) * 0.98, -0.135 + rng() * 0.06, 0.0028, 0.0028, FACE, shade('#4d3f7c', 0.85 + rng() * 0.3)));
  discs(group, dots, '#ffffff', 0);
  return finish(group, V(0, 0, 0.2), V(0.04, -0.13, 0.5), [
    { text: 'Rod and cone outer segments', at: V(-0.2, -0.18, 0.51) },
    { text: 'Nuclei of rods and cones', at: V(0.04, -0.105, 0.51) },
    { text: 'Pigment layer and choroid', at: V(0.3, -0.27, 0.51) },
    { text: 'Sclera', at: V(-0.28, -0.42, 0.51) },
    { text: 'Vitreous', at: V(0.25, 0.25, 0.51) },
  ]);
}

export function buildRetinaCells(): JourneyScene {
  const rng = random(19791102), group = new THREE.Group();
  band(group, -1.2, -0.95, '#43302a', 2.4, 1.2);
  band(group, -0.95, 1.2, '#efdcc4', 2.4, 1.2);
  const outer: Placement[] = [], inner: Placement[] = [], nuclei: Placement[] = [], discsInRod: THREE.Vector3[][] = [], cones: Placement[] = [];
  let focus = V(0, 0, 0.5), nearest = Infinity, index = 0;
  for (let x = -1.14; x < 1.16; x += 0.075) {
    // Carter-Dawson and LaVail count about 3 percent of the nuclei as cones.
    const cone = index % 33 === 16;
    if (cone) cones.push({ position: V(x, -0.28, FACE + 0.002), scale: V(0.05, 0.19, 0.002) });
    else {
      outer.push({ position: V(x, -0.62, FACE), scale: V(0.024, 0.33, 0.002) });
      for (let k = 0; k < 14; k++) discsInRod.push([V(x - 0.022, -0.93 + k * 0.045, FACE + 0.002), V(x + 0.022, -0.93 + k * 0.045, FACE + 0.002)]);
      inner.push({ position: V(x, -0.17, FACE), scale: V(0.024, 0.12, 0.002), color: shade('#d9a58a', 0.95 + rng() * 0.1) });
    }
    index++;
  }
  for (const point of packed(1.15, 0.078, 0.012, rng)) {
    const y = 0.56 + point.y * 0.45;
    nuclei.push(disc(point.x, y, 0.033, 0.033, FACE + 0.002, shade('#54477f', 0.86 + rng() * 0.28)));
    if (Math.hypot(point.x, y - 0.5) < nearest) { nearest = Math.hypot(point.x, y - 0.5); focus = V(point.x, y, FACE + 0.002); }
  }
  discs(group, outer, '#e6c8a4', 2);
  lines(group, discsInRod, 0.003, '#a3825e', 3);
  discs(group, inner, '#ffffff', 2);
  discs(group, cones, '#e0a678', 3);
  const nucleusMesh = discs(group, nuclei, '#ffffff', 1);
  return withMotion(finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a rod', at: focus },
    { text: 'Stacked discs of a rod outer segment', at: V(outer[6].position.x, -0.62, 0.51) },
    { text: 'A cone', at: cones[0].position },
    { text: 'Pigment layer', at: V(-0.5, -1.05, 0.51) },
  ]), flashing(nucleusMesh, 0.05, 19791103));
}

/** The cornea: a thin outer epithelium, a thick stroma of crossed lamellae, and one layer of endothelium. */
export function buildCorneaBlock(): JourneyScene {
  const rng = random(20090801), group = new THREE.Group();
  space(group, -0.495, -0.04, '#e9edd8');
  band(group, -0.04, -0.035, '#c3d2db');
  band(group, -0.035, 0.03, '#eef2ee');
  band(group, 0.03, 0.0625, '#ead7c7');
  space(group, 0.0625, 0.495, '#dfe9ee');
  const cells: Placement[] = [];
  for (let i = 0; i < 90; i++) cells.push(disc((rng() - 0.5) * 0.97, -0.03 + rng() * 0.055, 0.008, 0.0015, FACE));
  discs(group, cells, '#c7b58f', 1);
  return finish(group, V(0, 0, 0.2), V(0.04, 0.046, 0.5), [
    { text: 'Outer epithelium', at: V(0.04, 0.046, 0.51) },
    { text: 'Stroma', at: V(-0.3, 0, 0.51) },
    { text: 'Inner chamber of the eye', at: V(0.25, -0.3, 0.51) },
    { text: 'Air', at: V(-0.25, 0.3, 0.51) },
  ]);
}

export function buildCorneaCells(): JourneyScene {
  const rng = random(20090802), group = new THREE.Group();
  band(group, -1.2, -0.25, '#eef2ee', 2.4, 1.2);
  space(group, 0.5, 1.2, '#dfe9ee', 2.4);
  const cells: Placement[] = [], nuclei: Placement[] = [];
  let focus = V(0, 0, 0.5);
  [[-0.14, 0.13, 0.15], [0.08, 0.13, 0.12], [0.3, 0.17, 0.09], [0.45, 0.24, 0.04]].forEach(([y, width, height], row) => {
    for (let x = -1.14 + row * 0.06; x < 1.18; x += width * 2 + 0.01) {
      cells.push(disc(x, y, width, height, FACE, shade('#ecd6c9', 0.96 + rng() * 0.07)));
      const nucleus = V(x, y, FACE + 0.003);
      nuclei.push(disc(x, y, width * 0.46, height * 0.5, nucleus.z));
      if (row === 1 && Math.abs(x) < width + 0.02) focus = nucleus;
    }
  });
  discs(group, cells, '#ffffff', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 2);
  const fibres: THREE.Vector3[][] = [];
  for (let y = -1.15; y < -0.28; y += 0.05) fibres.push([V(-1.2, y, FACE), V(1.2, y + 0.01 * Math.sin(y * 9), FACE)]);
  lines(group, fibres, 0.004, '#d3dcd6', 3);
  const keratocytes = [disc(-0.5, -0.6, 0.3, 0.018, FACE + 0.002), disc(0.5, -0.82, 0.26, 0.016, FACE + 0.002)];
  discs(group, keratocytes, '#c7b58f', 2);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of an epithelial cell', at: focus },
    { text: 'Collagen lamellae of the stroma', at: V(0.3, -0.5, 0.51) },
    { text: 'Keratocyte', at: keratocytes[0].position },
  ]);
}

/** The lens: long fibres in ordered rows, under a capsule and a single layer of cells at its front. */
export function buildLensBlock(): JourneyScene {
  const group = new THREE.Group();
  band(group, -0.495, 0.34, '#f3efd9');
  band(group, 0.34, 0.358, '#eadfca');
  band(group, 0.358, 0.364, '#c9d3d4');
  space(group, 0.364, 0.495, '#e9edd8');
  const arcs: THREE.Vector3[][] = [];
  for (let y = -0.48; y < 0.34; y += 0.017) arcs.push(Array.from({ length: 9 }, (_, k) => V(-0.49 + k * 0.1225, y + 0.012 * Math.cos((k - 4) * 0.4), FACE)));
  lines(group, arcs, 0.0013, '#dcd5b6', 3);
  return finish(group, V(0, 0, 0.2), V(0.03, 0.349, 0.5), [
    { text: 'Cells at the front of the lens', at: V(0.03, 0.349, 0.51) },
    { text: 'Lens fibres', at: V(-0.25, -0.05, 0.51) },
    { text: 'Capsule', at: V(0.3, 0.361, 0.51) },
    { text: 'Chamber in front', at: V(-0.25, 0.43, 0.51) },
  ]);
}

export function buildLensCells(): JourneyScene {
  const rng = random(20110401), group = new THREE.Group();
  band(group, -1.2, 0.55, '#f6f2df', 2.4, 1.2);
  band(group, 0.55, 0.72, '#ebddca', 2.4, 1.2);
  band(group, 0.72, 0.74, '#c9d3d4', 2.4, 1.2);
  space(group, 0.74, 1.2, '#e9edd8', 2.4);
  const fibres: Placement[] = [], cells: Placement[] = [], nuclei: Placement[] = [];
  const hexagon = new THREE.CylinderGeometry(1, 1, 0.01, 6).rotateX(Math.PI / 2);
  for (let row = 0; row < 14; row++) for (let x = -1.2 + (row % 2) * 0.14; x < 1.22; x += 0.28) fibres.push({ position: V(x, -1.12 + row * 0.122, FACE), scale: V(0.13, 0.062, 1), color: shade('#ece4c6', 0.96 + rng() * 0.06) });
  group.add(instances(hexagon, material('#ffffff'), fibres));
  let focus = V(0, 0, 0.5);
  for (let x = -1.1; x < 1.15; x += 0.2) {
    cells.push(disc(x, 0.635, 0.094, 0.08, FACE + 0.002));
    const nucleus = V(x, 0.635, FACE + 0.005);
    nuclei.push(disc(x, 0.635, 0.05, 0.042, nucleus.z));
    if (Math.abs(x) < 0.11) focus = nucleus;
  }
  discs(group, cells, '#eec9b4', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 2);
  return finish(group, V(0, 0.2, 0.2), focus, [
    { text: 'Nucleus of a lens cell', at: focus },
    { text: 'Fibres cut across, closely packed, with no nuclei', at: V(0.3, -0.5, 0.51) },
    { text: 'Capsule', at: V(-0.5, 0.73, 0.51) },
  ]);
}

/** A tooth: enamel, dentine with its fine tubules, and pulp with its vessels. */
export function buildToothBlock(): JourneyScene {
  const rng = random(20151001), group = new THREE.Group();
  band(group, 0.26, 0.495, '#faf6e9');
  band(group, -0.22, 0.26, '#f0e1c2');
  band(group, -0.25, -0.22, '#c98d76');
  band(group, -0.495, -0.25, '#e8b7a8');
  const tubules: THREE.Vector3[][] = [], rods: THREE.Vector3[][] = [];
  for (let x = -0.49; x < 0.495; x += 0.012) tubules.push([V(x, -0.22, FACE), V(x + 0.018 * Math.sin(x * 12), 0.02, FACE), V(x + 0.03 * Math.sin(x * 9), 0.26, FACE)]);
  for (let x = -0.49; x < 0.495; x += 0.018) rods.push([V(x, 0.26, FACE), V(x + 0.02 * Math.sin(x * 20), 0.495, FACE)]);
  lines(group, tubules, 0.0011, '#d6bf93', 3);
  lines(group, rods, 0.0016, '#e7dfc8', 3);
  const vessels: Placement[] = [];
  for (let i = 0; i < 14; i++) vessels.push(disc((rng() - 0.5) * 0.92, -0.3 - rng() * 0.18, 0.012, 0.012, FACE, shade('#c8505a', 0.9 + rng() * 0.2)));
  discs(group, vessels, '#ffffff');
  return finish(group, V(0, 0, 0.2), V(0.03, -0.235, 0.5), [
    { text: 'Enamel', at: V(-0.25, 0.38, 0.51) },
    { text: 'Dentine with tubules', at: V(0.22, 0.02, 0.51) },
    { text: 'Odontoblasts', at: V(0.03, -0.235, 0.51) },
    { text: 'Pulp with vessels', at: vessels[3].position },
  ]);
}

export function buildToothCells(): JourneyScene {
  const rng = random(20151002), group = new THREE.Group();
  band(group, 0.28, 1.2, '#f0e1c2', 2.4, 1.2);
  band(group, 0.12, 0.28, '#e7d8b2', 2.4, 1.2);
  band(group, -1.2, -0.62, '#ecc3b4', 2.4, 1.2);
  band(group, -0.62, 0.12, '#e6bda9', 2.4, 1.2);
  const cells: Placement[] = [], nuclei: Placement[] = [], processes: THREE.Vector3[][] = [];
  let focus = V(0, 0, 0.5);
  for (let x = -1.1; x < 1.15; x += 0.17) {
    cells.push({ position: V(x, -0.26, FACE), scale: V(0.08, 0.37, 0.002), color: shade('#deb3a2', 0.95 + rng() * 0.1) });
    const nucleus = V(x, -0.46, FACE + 0.004);
    nuclei.push(disc(x, -0.46, 0.056, 0.09, nucleus.z));
    if (Math.abs(x) < 0.09) focus = nucleus;
    processes.push([V(x, 0.1, FACE + 0.002), V(x + 0.012 * Math.sin(x * 7), 0.6, FACE + 0.002), V(x + 0.02 * Math.sin(x * 5), 1.15, FACE + 0.002)]);
  }
  discs(group, cells, '#ffffff', 3);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  lines(group, processes, 0.012, '#cfae8e', 5);
  const capillary = [V(-1.2, -0.86, FACE), V(0, -0.82, FACE), V(1.2, -0.9, FACE)];
  group.add(new THREE.Mesh(tubeGeometry(capillary, 0.07, 12), material('#c8605a')));
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of an odontoblast', at: focus },
    { text: 'Process in a tubule', at: V(processes[5][1].x, 0.6, 0.51) },
    { text: 'Dentine', at: V(0.6, 0.85, 0.51) },
    { text: 'Capillary of the pulp', at: capillary[1] },
  ]);
}

/** The testis: seminiferous tubules cut across, with sperm forming in layers from their edge to their middle. */
export function buildTestisBlock(): JourneyScene {
  const rng = random(20160101), group = new THREE.Group();
  group.add(body(0.99, '#ecd9c8'));
  const walls: Placement[] = [], insides: Placement[] = [], lumens: Placement[] = [], leydig: Placement[] = [];
  for (const point of packed(0.44, 0.15, 0.015, rng)) {
    walls.push(disc(point.x, point.y, 0.072, 0.072));
    insides.push(disc(point.x, point.y, 0.066, 0.066, FACE + 0.002, shade('#d7a9b6', 0.94 + rng() * 0.1)));
    lumens.push(disc(point.x, point.y, 0.02, 0.02, FACE + 0.004));
    for (let k = 0; k < 3; k++) leydig.push(disc(point.x + 0.078, point.y + 0.04 + k * 0.006, 0.004, 0.004, FACE + 0.002));
  }
  discs(group, walls, '#c49a8c', 3);
  discs(group, insides, '#ffffff', 3);
  discs(group, lumens, '#f8efe6', 2);
  discs(group, leydig, '#b27a58', 0);
  const focus = insides[Math.floor(insides.length / 2)].position;
  return finish(group, V(0, 0, 0.2), V(focus.x + 0.04, focus.y, 0.5), [
    { text: 'Seminiferous tubule', at: V(focus.x + 0.04, focus.y, 0.51) },
    { text: 'Lumen', at: lumens[3].position },
    { text: 'Leydig cells', at: leydig[6].position },
  ]);
}

export function buildTestisCells(): JourneyScene {
  const rng = random(20160102), group = new THREE.Group();
  band(group, -1.2, -0.88, '#c49a8c', 2.4, 1.2);
  band(group, -0.88, 1.2, '#efdbde', 2.4, 1.2);
  const gonia: Placement[] = [], cytes: Placement[] = [], tids: Placement[] = [], tails: THREE.Vector3[][] = [], heads: Placement[] = [];
  let focus = V(0, 0, 0.5);
  for (let x = -1.1; x < 1.15; x += 0.22) gonia.push(disc(x, -0.78, 0.088, 0.075, FACE, shade('#7a6498', 0.95 + rng() * 0.1)));
  for (let row = 0; row < 2; row++) for (let x = -1.1 + row * 0.1; x < 1.15; x += 0.27) {
    const place = V(x + (rng() - 0.5) * 0.03, -0.5 + row * 0.26, FACE + 0.002);
    cytes.push(disc(place.x, place.y, 0.105, 0.105, place.z, shade('#73609c', 0.92 + rng() * 0.15)));
    if (row === 0 && Math.abs(x) < 0.15) focus = place;
  }
  for (let row = 0; row < 2; row++) for (let x = -1.14 + row * 0.08; x < 1.15; x += 0.16) tids.push(disc(x, 0.06 + row * 0.16, 0.06, 0.06, FACE + 0.002, shade('#6d5c96', 0.9 + rng() * 0.2)));
  for (let x = -1.1; x < 1.15; x += 0.14) {
    heads.push({ position: V(x, 0.48, FACE + 0.003), scale: V(0.02, 0.05, 0.002) });
    tails.push([V(x, 0.53, FACE + 0.003), V(x + 0.04 * Math.sin(x * 11), 0.8, FACE + 0.003), V(x + 0.03 * Math.sin(x * 7), 1.15, FACE + 0.003)]);
  }
  discs(group, gonia, '#ffffff', 2);
  discs(group, cytes, '#ffffff', 2);
  discs(group, tids, '#ffffff', 1);
  discs(group, heads, '#4a3a6e', 2);
  const tailMesh = new THREE.Mesh(merged(tails.map((line) => tubeGeometry(line, 0.006, 4, 1))), material('#8b7a9f'));
  group.add(tailMesh);
  const sertoli: Placement = disc(-0.38, -0.2, 0.09, 0.55, FACE + 0.001);
  discs(group, [sertoli], '#f2e4d6', 3);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a spermatocyte', at: focus },
    { text: 'Spermatogonia at the edge', at: gonia[6].position },
    { text: 'Round spermatids', at: tids[9].position },
    { text: 'Tails of forming sperm', at: V(tails[8][1].x, 0.8, 0.51) },
    { text: 'Sertoli cell', at: sertoli.position },
  ]);
}

/** Blood filling a vessel, and its cells close up. */
export function buildBloodBlock(): JourneyScene {
  const rng = random(20150401), group = new THREE.Group();
  group.add(body(0.99, '#efe3d4'));
  const ring = (radius: number, colour: string, z: number) => { const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), material(colour)); mesh.position.set(0, 0, z); group.add(mesh); };
  ring(0.4, '#e5a59c', 0.502);
  ring(0.36, '#8a1720', 0.503);
  const cells: Placement[] = [];
  for (const point of packed(0.36, 0.0066, 0.002, rng)) {
    if (Math.hypot(point.x, point.y) < 0.355) cells.push(disc(point.x, point.y, 0.0026, 0.0026, 0.505, shade('#cf303a', 0.8 + rng() * 0.45)));
  }
  const reds = discs(group, cells, '#ffffff', 0);
  return withMotion(finish(group, V(0, 0, 0.2), V(0.08, 0.05, 0.5), [
    { text: 'Blood', at: V(0.08, 0.05, 0.51) },
    { text: 'Wall of the vessel', at: V(0, 0.38, 0.51) },
    { text: 'Connective tissue', at: V(0.4, 0.4, 0.51) },
  ]), carried(reds, 0, -0.36, 0.36, 0.002));
}

export function buildBloodCells(): JourneyScene {
  const rng = random(20150402), group = new THREE.Group();
  group.add(body(2.4, '#f3d9b8', 1.2));
  const reds: Placement[] = [], rims: Placement[] = [], platelets: Placement[] = [];
  for (const point of packed(1.16, 0.15, 0.05, rng)) {
    if (Math.hypot(point.x + 0.32, point.y - 0.05) < 0.22) continue;
    const r = 0.066 + rng() * 0.012;
    reds.push(disc(point.x, point.y, r, r * (0.72 + rng() * 0.28), 0.505, shade('#c52d36', 0.9 + rng() * 0.2)));
    rims.push(disc(point.x, point.y, r * 0.42, r * 0.34, 0.507, shade('#e36a6f', 0.95 + rng() * 0.1)));
  }
  for (let i = 0; i < 24; i++) platelets.push(disc((rng() - 0.5) * 2.2, (rng() - 0.5) * 2.2, 0.02, 0.014, 0.508));
  const redMesh = discs(group, reds, '#ffffff', 2), rimMesh = discs(group, rims, '#ffffff', 1);
  discs(group, platelets, '#c9a9d6', 1);
  const white = disc(-0.32, 0.05, 0.17, 0.17, 0.508);
  const focus = V(-0.32, 0.05, 0.51);
  discs(group, [white], '#e9e1ef', 3);
  discs(group, [disc(focus.x, focus.y, 0.128, 0.122, 0.51)], NUCLEUS_COLOUR, 3);
  const way = reds[Math.floor(reds.length * 0.6)].position;
  return withBranches(withMotion(finish(group, V(0, 0, 0.2), focus, [
    { text: 'Lymphocyte, a white cell', at: focus },
    { text: 'Red cell, with no nucleus', at: way },
    { text: 'Platelet', at: platelets[3].position },
    { text: 'Plasma', at: V(0.9, 1.0, 0.51) },
  ]), carried(redMesh, 0, -1.2, 1.2, 0.05), carried(rimMesh, 0, -1.2, 1.2, 0.05)), [{ tail: 'blood', text: 'Red cell', at: way }]);
}

/** The cochlea cut across: turns of a spiral canal round a central core, each with three chambers of fluid and the organ of Corti on a thin membrane. */
export function buildCochleaBlock(): JourneyScene {
  const rng = random(20100712), group = new THREE.Group();
  group.add(body(0.99, '#e6ddc8'));
  const canals = [{ x: 0.24, y: -0.2, r: 0.21, side: 1 }, { x: 0.22, y: 0.22, r: 0.16, side: 1 }, { x: -0.26, y: -0.14, r: 0.18, side: -1 }, { x: -0.25, y: 0.25, r: 0.13, side: -1 }];
  const fluid: Placement[] = [], middle: Placement[] = [], stria: Placement[] = [], organs: Placement[] = [], ganglion: Placement[] = [], membranes: THREE.Vector3[][] = [];
  for (const { x, y, r, side } of canals) {
    fluid.push(disc(x, y, r, r));
    middle.push(disc(x + side * r * 0.42, y + r * 0.2, r * 0.5, r * 0.3, FACE + 0.001));
    stria.push(disc(x + side * r * 0.9, y + r * 0.2, r * 0.09, r * 0.27, FACE + 0.002));
    organs.push(disc(x + side * r * 0.32, y - r * 0.05, r * 0.24, r * 0.09, FACE + 0.003));
    membranes.push([V(x - side * r * 0.3, y - r * 0.13, FACE + 0.003), V(x + side * r * 0.3, y - r * 0.15, FACE + 0.003), V(x + side * r * 0.96, y - r * 0.12, FACE + 0.003)]);
    membranes.push([V(x - side * r * 0.3, y - r * 0.05, FACE + 0.003), V(x + side * r * 0.2, y + r * 0.27, FACE + 0.003), V(x + side * r * 0.86, y + r * 0.5, FACE + 0.003)]);
    for (let k = 0; k < 26; k++) ganglion.push(disc(x - side * r * (1.08 + rng() * 0.2), y + (rng() - 0.5) * r * 1.3, 0.0065, 0.0065, FACE + 0.002, shade('#a58fa9', 0.88 + rng() * 0.24)));
  }
  discs(group, fluid, '#eef3f2', 4);
  discs(group, middle, '#d8ece6', 3);
  discs(group, stria, '#b8605a', 2);
  discs(group, organs, '#d99b86', 3);
  discs(group, ganglion, '#ffffff', 1);
  lines(group, membranes, 0.0028, '#a58f78', 3);
  const organ = organs[0].position;
  return finish(group, V(0, 0, 0.2), V(organ.x, organ.y, 0.51), [
    { text: 'Organ of Corti', at: V(organ.x, organ.y, 0.51) },
    { text: 'Middle chamber of the canal', at: middle[1].position },
    { text: 'Fluid of the outer chambers', at: V(canals[0].x, canals[0].y - canals[0].r * 0.6, 0.51) },
    { text: 'Spiral ganglion', at: ganglion[4].position },
    { text: 'Bone', at: V(0, -0.44, 0.51) },
  ]);
}

/** The organ of Corti cut across: a row of inner hair cells and three of outer hair cells, under a tectorial membrane and among supporting cells. */
export function buildCochleaCells(): JourneyScene {
  const rng = random(20100713), group = new THREE.Group();
  group.add(body(2.4, '#eef3f2', 1.2));
  band(group, -1.2, -0.45, '#e9e2d2', 2.4, 1.2, 0.5015);
  band(group, -0.45, -0.425, '#a58f78', 2.4, 1.2, 0.5025);
  const support: Placement[] = [], hairCells: Placement[] = [], nuclei: Placement[] = [], tufts: THREE.Vector3[][] = [], nerves: THREE.Vector3[][] = [], pillars: THREE.Vector3[][] = [];
  const hair = (x: number, tilt: number, count: number, height: number) => {
    for (let k = 0; k < count; k++) { const from = x + (k - (count - 1) / 2) * 0.016; tufts.push([V(from, 0.15, FACE + 0.005), V(from + tilt * height * 0.5, 0.15 + height * 0.5, FACE + 0.005), V(from + tilt * height, 0.15 + height - k * 0.002, FACE + 0.005)]); }
  };
  // Supporting cells either side of the hair cells, to the edges of the view.
  for (let x = -1.1; x < -0.42; x += 0.13) support.push(disc(x, -0.26 + rng() * 0.03, 0.075, 0.17, FACE, shade('#e8cdb8', 0.94 + rng() * 0.1)));
  for (let x = 0.58; x < 1.2; x += 0.13) support.push(disc(x, -0.18 + 0.05 * Math.sin(x * 4) + rng() * 0.02, 0.075, 0.25, FACE, shade('#ecd8c6', 0.94 + rng() * 0.1)));
  // Deiters cells carry the outer hair cells.
  const OUTER = [0.17, 0.3, 0.43];
  for (const x of OUTER) support.push(disc(x, -0.31, 0.062, 0.115, FACE, shade('#e8cdb8', 0.94 + rng() * 0.1)));
  support.push(disc(-0.34, -0.31, 0.07, 0.11, FACE, shade('#e8cdb8', 0.94 + rng() * 0.1)));
  const focus = V(-0.3, -0.05, FACE + 0.004);
  hairCells.push(disc(-0.3, -0.02, 0.078, 0.17, FACE + 0.002));
  nuclei.push(disc(focus.x, focus.y, 0.042, 0.042, focus.z));
  hair(-0.3, 0.05, 4, 0.1);
  for (const x of OUTER) {
    hairCells.push(disc(x, -0.03, 0.05, 0.17, FACE + 0.002));
    nuclei.push(disc(x, -0.13, 0.034, 0.034, FACE + 0.004));
    hair(x, 0.1, 3, 0.13);
    nerves.push([V(x, -0.2, FACE + 0.003), V(x - 0.12, -0.36, FACE + 0.003), V(-0.06, -0.41, FACE + 0.003), V(-0.5, -0.41, FACE + 0.003), V(-1.2, -0.47, FACE + 0.003)]);
  }
  for (let k = 0; k < 5; k++) nerves.push([V(-0.32 + k * 0.012, -0.19, FACE + 0.003), V(-0.36, -0.34, FACE + 0.003), V(-0.5, -0.43 - k * 0.006, FACE + 0.003), V(-1.2, -0.5 - k * 0.012, FACE + 0.003)]);
  // The pillars lean together over a tunnel between the two kinds of hair cell.
  pillars.push([V(-0.17, -0.42, FACE + 0.001), V(-0.1, -0.12, FACE + 0.001), V(-0.03, 0.15, FACE + 0.001)], [V(0.09, -0.42, FACE + 0.001), V(0.03, -0.12, FACE + 0.001), V(-0.03, 0.15, FACE + 0.001)]);
  discs(group, support, '#ffffff', 3);
  lines(group, pillars, 0.022, '#d7c0a8', 5);
  discs(group, hairCells, '#d99b86', 3);
  discs(group, nuclei, NUCLEUS_COLOUR, 3);
  lines(group, tufts, 0.0045, '#7a5a4c', 3);
  lines(group, nerves, 0.006, '#d9b13f', 4);
  discs(group, [disc(0.02, 0.35, 0.62, 0.05, FACE + 0.006)], '#c9dce4', 4);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of an inner hair cell', at: focus },
    { text: 'Outer hair cells', at: V(0.3, 0.02, FACE + 0.005) },
    { text: 'Stereocilia', at: V(0.3, 0.21, FACE + 0.006) },
    { text: 'Tectorial membrane', at: V(0.1, 0.36, FACE + 0.007) },
    { text: 'Basilar membrane', at: V(0.75, -0.435, FACE + 0.004) },
    { text: 'Nerve fibres', at: V(-0.75, -0.46, FACE + 0.005) },
  ]);
}

/** A whisker follicle cut along its length: the hair in its sheaths, a blood sinus round them, a capsule outside, and a bundle of nerve fibres entering from below. */
export function buildWhiskerBlock(): JourneyScene {
  const rng = random(20020722), group = new THREE.Group();
  group.add(body(0.99, '#e8cdbd'));
  // Others of the same kind lie to each side, and they are drawn more simply.
  const capsules: Placement[] = [], sinuses: Placement[] = [], sheaths: Placement[] = [];
  for (const x of [0, -0.34, 0.34]) {
    capsules.push(disc(x, -0.04, 0.11, 0.42));
    sinuses.push(disc(x, -0.08, 0.09, 0.33, FACE + 0.001));
    sheaths.push(disc(x, -0.05, 0.042, 0.38, FACE + 0.002));
  }
  discs(group, capsules, '#d8b49c', 4);
  discs(group, sinuses, '#a2343c', 4);
  discs(group, sheaths, '#efdcc4', 4);
  // Fine bars cross the lower part of the sinus, and a smaller open ring lies near its top.
  const bars: THREE.Vector3[][] = [];
  for (let k = 0; k < 18; k++) { const y = -0.36 + k * 0.022, side = k % 2 ? 1 : -1, x = 0.045 + rng() * 0.01; bars.push([V(side * x, y, FACE + 0.002), V(side * (x + 0.02), y + 0.005, FACE + 0.002), V(side * 0.082, y - 0.004, FACE + 0.002)]); }
  lines(group, bars, 0.0024, '#d78d86', 3);
  group.add(new THREE.Mesh(tubeGeometry([V(0, 0.5, FACE + 0.004), V(0, 0.2, FACE + 0.004), V(0, -0.15, FACE + 0.004), V(0, -0.36, FACE + 0.004)], 0.016, 10), material('#3d3028')));
  discs(group, [disc(0, -0.385, 0.028, 0.03, FACE + 0.004)], '#6d4a38', 3);
  discs(group, [disc(-0.06, 0.2, 0.028, 0.012, FACE + 0.003), disc(0.06, 0.2, 0.028, 0.012, FACE + 0.003)], '#e6d6c4', 2);
  const nerves: THREE.Vector3[][] = [];
  for (let k = 0; k < 16; k++) { const side = k % 2 ? 1 : -1, reach = 0.022 + rng() * 0.02, top = -0.2 + rng() * 0.36; nerves.push([V(-0.17 + k * 0.004, -0.5, FACE + 0.003), V(side * 0.08, -0.36, FACE + 0.003), V(side * (reach + 0.02), top - 0.1, FACE + 0.003), V(side * reach, top, FACE + 0.003)]); }
  lines(group, nerves, 0.0032, '#d9b13f', 3);
  const focus = V(0.042, 0.14, 0.51);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nerve endings on the outer sheath', at: focus },
    { text: 'Shaft of the whisker', at: V(0, 0.34, FACE + 0.005) },
    { text: 'Blood sinus', at: V(-0.066, -0.1, FACE + 0.003) },
    { text: 'Capsule', at: V(0.105, -0.2, FACE + 0.002) },
    { text: 'Bundle of nerve fibres', at: V(-0.16, -0.48, FACE + 0.004) },
    { text: 'Another follicle', at: V(0.34, 0.1, FACE + 0.003) },
  ]);
}

/** The outer sheath of a whisker follicle near its ring of sinus: rows of keratinocytes, with Merkel cells against the edge and nerve endings on them. */
export function buildWhiskerCells(): JourneyScene {
  const rng = random(20140406), group = new THREE.Group();
  group.add(body(2.4, '#efe2d1', 1.2));
  const keratinocytes: Placement[] = [], merkel: Placement[] = [], nuclei: Placement[] = [], darkNuclei: Placement[] = [], endings: THREE.Vector3[][] = [];
  const EDGE = 0.34;
  for (const point of packed(1.25, 0.13, 0.02, rng)) {
    if (point.x > EDGE) continue;
    keratinocytes.push(disc(point.x, point.y, 0.062, 0.05, FACE, shade('#e7c9ae', 0.94 + rng() * 0.1)));
    if (point.x < EDGE - 0.2 || Math.abs(point.y) > 0.6) nuclei.push(disc(point.x, point.y, 0.024, 0.02, FACE + 0.002));
  }
  discs(group, [{ position: V(EDGE + 0.8, 0, FACE + 0.001), scale: V(0.76, 1.3, 0.002) }], '#a2343c', 3);
  discs(group, [{ position: V(EDGE + 0.05, 0, FACE + 0.002), scale: V(0.03, 1.3, 0.002) }], '#c9ab98', 3);
  const focus = V(0.24, 0.02, FACE + 0.004);
  const places = [-0.48, -0.24, 0.02, 0.27, 0.52];
  for (const y of places) {
    merkel.push(disc(0.24, y, 0.058, 0.048, FACE + 0.003));
    darkNuclei.push(disc(0.24, y, 0.03, 0.026, y === focus.y ? focus.z : FACE + 0.004));
    endings.push([V(0.3, y - 0.05, FACE + 0.005), V(0.32, y, FACE + 0.005), V(0.3, y + 0.05, FACE + 0.005)]);
  }
  endings.push([V(0.33, -0.55, FACE + 0.005), V(0.34, -0.2, FACE + 0.005), V(0.33, 0.2, FACE + 0.005), V(0.34, 0.55, FACE + 0.005), V(0.42, 0.9, FACE + 0.005)]);
  discs(group, keratinocytes, '#ffffff', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 2);
  discs(group, merkel, '#d48f7c', 3);
  discs(group, darkNuclei, NUCLEUS_COLOUR, 3);
  lines(group, endings, 0.008, '#d9b13f', 4);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a Merkel cell', at: focus },
    { text: 'Merkel cell', at: V(0.24, 0.3, FACE + 0.005) },
    { text: 'Ending of a nerve fibre', at: V(0.33, 0.13, FACE + 0.006) },
    { text: 'Outer sheath', at: V(-0.25, 0.25, FACE + 0.003) },
    { text: 'Blood sinus', at: V(0.48, 0.38, FACE + 0.002) },
  ]);
}

/** The pancreas: lobules of acini that secrete into ducts, with an islet of hormone cells among them. */
export function buildPancreasBlock(): JourneyScene {
  const rng = random(19750802), group = new THREE.Group();
  group.add(body(0.99, '#e6c8a2'));
  const ISLET = { x: 0.1, y: 0.04, r: 0.13 };
  const acini: Placement[] = [], lumens: Placement[] = [], islet: Placement[] = [], vessels: THREE.Vector3[][] = [], ducts: THREE.Vector3[][] = [];
  for (const point of packed(0.49, 0.042, 0.012, rng)) {
    if (Math.hypot(point.x - ISLET.x, point.y - ISLET.y) < ISLET.r + 0.012) continue;
    acini.push(disc(point.x, point.y, 0.019, 0.019, FACE, shade('#d8a878', 0.9 + rng() * 0.2)));
    lumens.push(disc(point.x, point.y, 0.0035, 0.0035, FACE + 0.002));
  }
  for (const point of packed(ISLET.r, 0.013, 0.004, rng)) if (Math.hypot(point.x, point.y) < ISLET.r) islet.push(disc(ISLET.x + point.x, ISLET.y + point.y, 0.0058, 0.0058, FACE + 0.001, shade(Math.hypot(point.x, point.y) > ISLET.r * 0.78 ? '#c98a9a' : '#e6c15a', 0.92 + rng() * 0.16)));
  for (let k = 0; k < 5; k++) { const angle = k * 1.257 + 0.4; vessels.push([V(ISLET.x + Math.cos(angle) * 0.2, ISLET.y + Math.sin(angle) * 0.2, FACE + 0.003), V(ISLET.x + Math.cos(angle) * 0.09, ISLET.y + Math.sin(angle) * 0.09, FACE + 0.003), V(ISLET.x + Math.cos(angle + 1.2) * 0.05, ISLET.y + Math.sin(angle + 1.2) * 0.05, FACE + 0.003)]); }
  ducts.push([V(-0.5, -0.3, FACE + 0.003), V(-0.24, -0.26, FACE + 0.003), V(-0.1, -0.34, FACE + 0.003), V(0.2, -0.3, FACE + 0.003), V(0.5, -0.38, FACE + 0.003)]);
  discs(group, acini, '#ffffff', 1);
  discs(group, lumens, '#f3e4cf', 0);
  discs(group, [disc(ISLET.x, ISLET.y, ISLET.r + 0.008, ISLET.r + 0.008, FACE)], '#ecd6b4', 4);
  discs(group, islet, '#ffffff', 0);
  lines(group, vessels, 0.004, '#b8404a', 4);
  lines(group, ducts, 0.012, '#f3e4cf', 6);
  const focus = V(ISLET.x, ISLET.y, 0.51);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'An islet', at: focus },
    { text: 'Acini that secrete into ducts', at: V(-0.28, 0.2, 0.51) },
    { text: 'A duct', at: V(-0.1, -0.34, 0.51) },
    { text: 'Capillary', at: V(ISLET.x + Math.cos(0.4) * 0.17, ISLET.y + Math.sin(0.4) * 0.17, 0.51) },
  ]);
}

/** An islet: beta cells packed round capillaries, with other hormone cells at its edge. */
export function buildPancreasCells(): JourneyScene {
  const rng = random(19750803), group = new THREE.Group();
  group.add(body(2.4, '#ecdcc2', 1.2));
  const cells: Placement[] = [], nuclei: Placement[] = [], granules: Placement[] = [];
  for (const point of packed(1.25, 0.18, 0.03, rng)) {
    const edge = Math.hypot(point.x + 0.7, point.y - 0.5) < 0.42;
    cells.push(disc(point.x, point.y, 0.086, 0.078, FACE, shade(edge ? '#c98a9a' : '#e0bd7a', 0.94 + rng() * 0.1)));
    nuclei.push(disc(point.x, point.y, 0.036, 0.034, FACE + 0.002));
    for (let k = 0; k < 14; k++) { const angle = rng() * 6.28, reach = 0.046 + rng() * 0.028; granules.push({ position: V(point.x + Math.cos(angle) * reach, point.y + Math.sin(angle) * reach * 0.9, FACE + 0.002), scale: uniform(0.0052), color: shade(edge ? '#7a3f4e' : '#7a5a2a', 0.9 + rng() * 0.2) }); }
  }
  discs(group, cells, '#ffffff', 2);
  discs(group, nuclei, NUCLEUS_COLOUR, 2);
  discs(group, granules, '#ffffff', 0);
  const capillary = [V(-1.2, -0.42, FACE + 0.003), V(-0.5, -0.3, FACE + 0.003), V(0.05, -0.36, FACE + 0.003), V(0.6, -0.24, FACE + 0.003), V(1.2, -0.3, FACE + 0.003)];
  lines(group, [capillary, [V(0.05, -0.36, FACE + 0.003), V(0.3, 0.1, FACE + 0.003), V(0.26, 0.5, FACE + 0.003), V(0.42, 1.2, FACE + 0.003)]], 0.032, '#c8605a', 8);
  const nearest = nuclei.reduce((best, item) => Math.hypot(item.position.x, item.position.y) < Math.hypot(best.position.x, best.position.y) ? item : best);
  const focus = nearest.position.clone().setZ(FACE + 0.004);
  const wayAt = granules.reduce((best, item) => item.position.distanceTo(focus) < best.position.distanceTo(focus) ? item : best).position;
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a beta cell', at: focus },
    { text: 'Insulin granules', at: wayAt.clone().setZ(FACE + 0.004) },
    { text: 'Capillary', at: capillary[3] },
    { text: 'Another kind of hormone cell', at: V(-0.7, 0.5, FACE + 0.003) },
  ]);
}

export const MORE_TISSUE_BUILDERS: Readonly<Record<string, () => JourneyScene>> = Object.freeze({
  'cartilage-block': buildCartilageBlock, 'cartilage-cells': buildCartilageCells,
  'tendon-block': buildTendonBlock, 'tendon-cells': buildTendonCells,
  'membrane-block': buildMembraneBlock, 'membrane-cells': buildMembraneCells,
  'gland-block': buildGlandBlock, 'gland-cells': buildGlandCells,
  'endocrine-block': buildEndocrineBlock, 'endocrine-cells': buildEndocrineCells,
  'thyroid-block': buildThyroidBlock, 'thyroid-cells': buildThyroidCells,
  'lymphoid-block': buildLymphoidBlock, 'lymphoid-cells': buildLymphoidCells,
  'colon-block': buildColonBlock, 'colon-cells': buildColonCells,
  'stomach-block': buildStomachBlock, 'stomach-cells': buildStomachCells,
  'urothelium-block': buildUrotheliumBlock, 'urothelium-cells': buildUrotheliumCells,
  'airway-block': buildAirwayBlock, 'airway-cells': buildAirwayCells,
  'retina-block': buildRetinaBlock, 'retina-cells': buildRetinaCells,
  'cornea-block': buildCorneaBlock, 'cornea-cells': buildCorneaCells,
  'lens-block': buildLensBlock, 'lens-cells': buildLensCells,
  'tooth-block': buildToothBlock, 'tooth-cells': buildToothCells,
  'testis-block': buildTestisBlock, 'testis-cells': buildTestisCells,
  'blood-block': buildBloodBlock, 'blood-cells': buildBloodCells,
  'cochlea-block': buildCochleaBlock, 'cochlea-cells': buildCochleaCells,
  'whisker-block': buildWhiskerBlock, 'whisker-cells': buildWhiskerCells,
  'pancreas-block': buildPancreasBlock, 'pancreas-cells': buildPancreasCells,
});
