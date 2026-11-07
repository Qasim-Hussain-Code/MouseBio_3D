import * as THREE from 'three';
import type { JourneyTail } from '../domain/scale-journey';
import { instances, material, merged, random, shade, sphere, tubeGeometry, uniform, V, type JourneyLabel, type JourneyScene, type Placement, type TissueMotion } from './scale-journey-scenes';
import { body, finish, packed, withMotion } from './tissue-scenes';

/**
 * The levels between the cells of a tissue and the measured molecule that belongs to it: a part of a cell about 5 micrometres to the unit, and a part of that about 300 nanometres to the unit.
 * Every position and count is generated with a fixed seed to illustrate a published description, and none is a measurement. Sizes are kept near the published ones where those are stated.
 */
const FACE = 0.505;

const box = () => new THREE.BoxGeometry(1, 1, 1);
const rect = (x: number, y: number, width: number, height: number, z = FACE, color?: THREE.Color): Placement => ({ position: V(x, y, z), scale: V(width, height, 0.002), color });
const turned = (angle: number) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), angle);
const oval = (x: number, y: number, rx: number, ry = rx, angle = 0, z = FACE, color?: THREE.Color): Placement => ({ position: V(x, y, z), scale: V(rx, ry, 0.002), rotation: turned(angle), color });
const ball = (x: number, y: number, r: number, z = FACE, color?: THREE.Color): Placement => ({ position: V(x, y, z), scale: uniform(r), color });
const flats = (group: THREE.Group, items: readonly Placement[], color: string, detail = 2) => { const mesh = instances(sphere(detail), material(color), items); group.add(mesh); return mesh; };
const bars = (group: THREE.Group, items: readonly Placement[], color: string) => { const mesh = instances(box(), material(color), items); group.add(mesh); return mesh; };
const tubes = (group: THREE.Group, items: readonly THREE.Vector3[][], radius: number, color: string, sides = 4) => {
  const mesh = new THREE.Mesh(merged(items.map((line) => tubeGeometry(line, radius, sides, 1))), material(color));
  group.add(mesh);
  return mesh;
};
const line = (x0: number, y0: number, x1: number, y1: number, z = FACE): THREE.Vector3[] => [V(x0, y0, z), V((x0 + x1) / 2, (y0 + y1) / 2, z), V(x1, y1, z)];

/** Mitochondria as they appear in a thin section, gathered so that each kind of part is drawn once. */
function mitochondria(group: THREE.Group, places: readonly { x: number; y: number; length: number; width: number; angle: number }[], z = FACE) {
  const outer: Placement[] = [], inner: Placement[] = [], folds: THREE.Vector3[][] = [];
  for (const { x, y, length, width, angle } of places) {
    outer.push(oval(x, y, length, width, angle, z));
    inner.push(oval(x, y, length * 0.93, width * 0.86, angle, z + 0.001));
    const along = V(Math.cos(angle), Math.sin(angle), 0), across = V(-Math.sin(angle), Math.cos(angle), 0);
    const count = Math.max(3, Math.round(length / (width * 0.42)));
    for (let i = 0; i < count; i++) {
      const t = -0.78 + (1.56 * (i + 0.5)) / count, reach = width * 0.8 * Math.sqrt(Math.max(0.05, 1 - t * t));
      const side = i % 2 ? 1 : -1;
      const from = V(x, y, z + 0.002).addScaledVector(along, t * length).addScaledVector(across, side * reach);
      const to = from.clone().addScaledVector(across, -side * reach * 1.45);
      folds.push([from, from.clone().lerp(to, 0.5), to]);
    }
  }
  flats(group, outer, '#a85f48', 3);
  flats(group, inner, '#e2ac90', 3);
  tubes(group, folds, Math.max(0.0035, places[0].width * 0.045), '#9c5540', 3);
}

/** Mitochondria of a cell, with the one in the middle the one that is entered. */
export function buildMitochondrion(): JourneyScene {
  const rng = random(20110811), group = new THREE.Group();
  group.add(body(3.4, '#ecdccf', 1.2));
  const places = [{ x: 0, y: 0, length: 0.28, width: 0.11, angle: 0.25 }];
  for (const point of packed(1.5, 0.62, 0.14, rng)) {
    if (Math.hypot(point.x, point.y) < 0.42) continue;
    places.push({ x: point.x, y: point.y, length: 0.14 + rng() * 0.16, width: 0.07 + rng() * 0.04, angle: rng() * Math.PI });
  }
  mitochondria(group, places);
  // Small dots of ribosomes and vesicles in the cytoplasm between.
  const dots: Placement[] = [];
  for (let i = 0; i < 420; i++) dots.push(ball((rng() - 0.5) * 3, (rng() - 0.5) * 3, 0.006 + rng() * 0.006, FACE - 0.001));
  flats(group, dots, '#cdb8a8', 0);
  return finish(group, V(0, 0, 0.2), V(0.02, 0.01, FACE), [
    { text: 'Outer membrane', at: V(-0.26, -0.07, FACE) },
    { text: 'Folds of the inner membrane', at: V(0.02, 0.01, FACE) },
    { text: 'Matrix', at: V(0.18, 0.1, FACE) },
  ]);
}

/** A fold of the inner membrane seen from the matrix: rows of ATP synthase along its curved edge, and complex I on its flat part, in the arrangement that Davies et al. report. */
export function buildCrista(): JourneyScene {
  const rng = random(20110812), group = new THREE.Group();
  group.add(body(4, '#f0dfd2', 1.2));
  bars(group, [rect(0, -0.28, 4, 1.72)], '#dfbfa9');
  tubes(group, [[V(-2, 0.58, FACE), V(0, 0.58, FACE), V(2, 0.58, FACE)]], 0.05, '#c99c82', 8);
  const heads: Placement[] = [], stalks: Placement[] = [];
  for (let side = 0; side < 2; side++) for (let i = -22; i <= 22; i++) {
    const x = i * 0.093, y = 0.58 + (side ? 0.045 : -0.045);
    heads.push(ball(x, y + (side ? 0.045 : -0.045), 0.017, FACE + 0.05, shade('#e0a03c', 0.9 + rng() * 0.2)));
    stalks.push({ position: V(x, y, FACE + 0.03), scale: V(0.006, 0.06, 0.006), rotation: turned(side ? 0 : Math.PI) });
  }
  bars(group, stalks, '#b58a4a');
  flats(group, heads, '#ffffff', 2);
  const arms: Placement[] = [], tops: Placement[] = [];
  let chosen = V(0, 0, FACE);
  const places = packed(1.8, 0.16, 0.05, rng).filter((point) => point.y < 0.44 && point.y > -1.1);
  for (const point of places) {
    if (rng() < 0.35) continue;
    const angle = rng() * Math.PI;
    arms.push(oval(point.x, point.y, 0.033, 0.009, angle, FACE + 0.006));
    tops.push(ball(point.x + 0.026 * Math.cos(angle), point.y + 0.026 * Math.sin(angle), 0.013, FACE + 0.016));
    if (Math.hypot(point.x, point.y) < chosen.length() - FACE || chosen.x === 0) chosen = V(point.x + 0.026 * Math.cos(angle), point.y + 0.026 * Math.sin(angle), FACE + 0.016);
  }
  flats(group, arms, '#7fa3c9', 2);
  flats(group, tops, '#5d86b5', 2);
  return finish(group, V(0, 0.1, 0.2), chosen, [
    { text: 'Complex I', at: chosen },
    { text: 'Rows of ATP synthase on the curved edge', at: V(0.8, 0.66, FACE + 0.05) },
    { text: 'Flat membrane of the fold', at: V(-0.9, -0.72, FACE) },
  ]);
}

/** Sarcomeres in line along myofibrils, with mitochondria between them. */
export function buildSarcomeres(): JourneyScene {
  const rng = random(20160101), group = new THREE.Group();
  group.add(body(3.4, '#e7d3c6', 1.2));
  const PITCH = 0.4, WIDTH = 0.2, GAP = 0.05;
  const light: Placement[] = [], dark: Placement[] = [], pale: Placement[] = [], lines: Placement[] = [], mBands: Placement[] = [];
  const places: { x: number; y: number; length: number; width: number; angle: number }[] = [];
  for (let row = -6; row <= 6; row++) {
    const y = row * (WIDTH + GAP), offset = row * 0.012;
    light.push(rect(0, y, 3.4, WIDTH, FACE, undefined));
    for (let i = -5; i <= 5; i++) {
      const x = i * PITCH + offset;
      dark.push(rect(x, y, 0.3, WIDTH, FACE + 0.001));
      pale.push(rect(x, y, 0.08, WIDTH, FACE + 0.002));
      mBands.push(rect(x, y, 0.012, WIDTH, FACE + 0.003));
      lines.push(rect(x + PITCH / 2, y, 0.016, WIDTH, FACE + 0.001));
      if (rng() < 0.42) places.push({ x: x + PITCH / 2, y: y + (WIDTH + GAP) / 2, length: 0.09, width: 0.022, angle: 0 });
    }
  }
  bars(group, light, '#efdcd1');
  bars(group, dark, '#b36a60');
  bars(group, pale, '#c9877c');
  bars(group, mBands, '#7e4139');
  bars(group, lines, '#5d2f2a');
  mitochondria(group, places, FACE + 0.004);
  return finish(group, V(0, 0, 0.2), V(0.14, 0, FACE), [
    { text: 'One sarcomere', at: V(0, 0.12, FACE) },
    { text: 'Z disc', at: V(0.2, -0.05, FACE) },
    { text: 'M band', at: V(-0.4, 0.04, FACE) },
    { text: 'Mitochondrion', at: V(places[2].x, places[2].y, FACE + 0.004) },
  ]);
}

/** Thick and thin filaments of half a sarcomere, running from the Z disc on the left, with heads of myosin reaching across. */
export function buildFilaments(): JourneyScene {
  const rng = random(20160102), group = new THREE.Group();
  group.add(body(4, '#f1e2d8', 1.2));
  const Z = -1.05, ROW = 0.14;
  bars(group, [rect(Z, 0, 0.1, 4)], '#5d2f2a');
  const thick: THREE.Vector3[][] = [], thin: THREE.Vector3[][] = [], heads: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let row = -14; row <= 14; row++) {
    const y = row * ROW;
    thick.push(line(-0.25, y, 2.2, y, FACE + 0.01));
    for (const side of [-1, 1]) {
      const ty = y + side * ROW / 3.2;
      thin.push(line(Z, ty, 1.9, ty, FACE + 0.008));
      for (let i = 0; i < 44; i++) {
        const x = -0.2 + i * 0.048 + (rng() - 0.5) * 0.006;
        if (rng() < 0.45) heads.push(oval(x, y + side * 0.03, 0.009, 0.016, side * 0.5, FACE + 0.012));
      }
    }
    if (row === 0) chosen = V(0.32, ROW / 3.2, FACE + 0.02);
  }
  const thickMesh = tubes(group, thick, 0.025, '#a95f55', 6);
  tubes(group, thin, 0.012, '#d8a77f', 5);
  const headMesh = flats(group, heads, '#8e4d45', 1);
  // Thick filaments slide a little with each heartbeat. The amount is chosen for viewing and is not a measurement.
  const slide = ({ beats }: TissueMotion) => { const by = 0.02 * Math.sin(beats * Math.PI * 2); thickMesh.position.x = by; headMesh.position.x = by; };
  return withMotion(finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A thin filament', at: chosen },
    { text: 'A thick filament', at: V(1.1, ROW * 2, FACE + 0.03) },
    { text: 'Heads of myosin', at: V(0.55, ROW * -3 + 0.03, FACE + 0.012) },
    { text: 'Z disc', at: V(Z, 0.5, FACE) },
  ]), slide);
}

/** Collagen fibrils lying side by side, with ground substance between them. */
export function buildCollagenFibrils(): JourneyScene {
  const rng = random(20060602), group = new THREE.Group();
  group.add(body(3.4, '#efe6d8', 1.2));
  const lines: THREE.Vector3[][] = [];
  for (let row = -38; row <= 38; row++) {
    const y = row * 0.044 + (rng() - 0.5) * 0.008, wave = rng() * 6;
    const points: THREE.Vector3[] = [];
    for (let x = -1.7; x <= 1.7; x += 0.42) points.push(V(x, y + 0.01 * Math.sin(x * 2.2 + wave), FACE + 0.006));
    lines.push(points);
  }
  tubes(group, lines, 0.016, '#d4c290', 5);
  const cell: Placement[] = [ball(-0.7, 0.6, 0.02, FACE + 0.02)];
  flats(group, [oval(-0.72, 0.58, 0.46, 0.05, 0.02, FACE + 0.024)], '#caa58f', 3);
  flats(group, cell, '#8f76ad', 2);
  return finish(group, V(0, 0, 0.2), V(0.02, lines[38][4].y, FACE + 0.02), [
    { text: 'One fibril', at: V(0.02, lines[38][4].y, FACE + 0.02) },
    { text: 'Ground substance between the fibrils', at: V(0.9, lines[50][8].y + 0.022, FACE + 0.01) },
    { text: 'A fibroblast', at: V(-0.72, 0.6, FACE + 0.03) },
  ]);
}

/** One fibril with its repeating bands, and the long molecules that give them, offset from one another along the fibril. */
export function buildCollagenBands(): JourneyScene {
  const rng = random(20060603), group = new THREE.Group();
  group.add(body(4, '#f4eee2', 1.2));
  const PERIOD = 0.226, HALF = 0.2;
  const bands: Placement[] = [], overlaps: Placement[] = [];
  for (const y of [0, -0.62, 0.62]) {
    bands.push(rect(0, y, 4, HALF * 2));
    for (let i = -9; i <= 9; i++) overlaps.push(rect(i * PERIOD, y, PERIOD * 0.46, HALF * 2, FACE + 0.001));
  }
  bars(group, bands, '#e4d3a4');
  bars(group, overlaps, '#c8ae72');
  const molecules: THREE.Vector3[][] = [];
  let chosen = V(0, 0, FACE);
  for (let row = -9; row <= 9; row++) {
    const y = row * 0.021;
    for (let i = -6; i <= 6; i++) {
      // Each molecule is about 1 unit long, about 300 nanometres, and starts about one period along from its neighbour.
      const x = i * 1.08 + ((row + 9) % 5) * PERIOD;
      molecules.push(line(x, y, x + 1, y, FACE + 0.004));
      if (row === 0 && Math.abs(x + 0.5) < 0.56) chosen = V(0.02, y, FACE + 0.006);
    }
  }
  tubes(group, molecules, 0.0035, '#a78d55', 3);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'One long molecule of collagen', at: chosen },
    { text: 'The repeat, about 67 nanometres', at: V(PERIOD * 2, HALF, FACE + 0.01) },
    { text: 'A neighbouring fibril', at: V(-0.8, 0.62, FACE + 0.01) },
  ]);
}

/** A synapse among the crowded fibres of the brain: a bouton full of vesicles, opposite the head of a dendritic spine. */
export function buildSynapse(): JourneyScene {
  const rng = random(20120501), group = new THREE.Group();
  group.add(body(3.4, '#e4dbcc', 1.2));
  const profiles: Placement[] = [], tubules: Placement[] = [];
  for (const point of packed(1.6, 0.27, 0.07, rng)) {
    if (Math.hypot(point.x, point.y + 0.04) < 0.46) continue;
    const r = 0.08 + rng() * 0.08;
    profiles.push(oval(point.x, point.y, r, r * (0.7 + rng() * 0.4), rng() * 3, FACE, shade(rng() < 0.3 ? '#d3dcc6' : '#f0e9dc', 0.96 + rng() * 0.06)));
    for (let i = 0; i < 3; i++) tubules.push(ball(point.x + (rng() - 0.5) * r, point.y + (rng() - 0.5) * r * 0.8, 0.005, FACE + 0.002));
  }
  flats(group, profiles, '#ffffff', 2);
  flats(group, tubules, '#ad9f8a', 0);
  flats(group, [oval(0, 0.16, 0.26, 0.17)], '#efe6d6', 4);
  flats(group, [oval(0, -0.2, 0.17, 0.14)], '#f4ecdf', 4);
  flats(group, [oval(0.02, -0.1, 0.075, 0.012, 0, FACE + 0.003)], '#6d5a4c', 2);
  const vesicles: Placement[] = [];
  while (vesicles.length < 170) {
    const x = (rng() - 0.5) * 0.46, y = 0.05 + rng() * 0.26;
    if (Math.hypot(x / 0.23, (y - 0.16) / 0.15) < 1 && !(x > 0.05 && y > 0.17)) vesicles.push(ball(x, y, 0.0085, FACE + 0.003));
  }
  flats(group, vesicles, '#bda98f', 1);
  mitochondria(group, [{ x: 0.12, y: 0.22, length: 0.075, width: 0.038, angle: 0.4 }], FACE + 0.003);
  return finish(group, V(0, 0, 0.2), V(0.02, -0.03, FACE + 0.003), [
    { text: 'The cleft', at: V(0.02, -0.03, FACE + 0.003) },
    { text: 'Bouton full of vesicles', at: V(-0.14, 0.18, FACE + 0.003) },
    { text: 'Head of a dendritic spine', at: V(-0.05, -0.24, FACE) },
    { text: 'Postsynaptic density', at: V(0.08, -0.1, FACE + 0.003) },
  ]);
}

/** The cleft of a synapse: vesicles at the active zone above, and receptors in the membrane opposite. */
export function buildCleft(): JourneyScene {
  const rng = random(20120502), group = new THREE.Group();
  group.add(body(4, '#f3ecdf', 1.2));
  const GAP = 0.033, WALL = 0.014;
  bars(group, [rect(0, GAP + WALL / 2, 3, WALL), rect(0, -GAP - WALL / 2, 3, WALL)], '#b49a7a');
  bars(group, [rect(0, 0, 3, GAP * 2, FACE - 0.001)], '#e8e4d9');
  bars(group, [rect(0, -GAP - WALL - 0.08, 1.7, 0.16, FACE - 0.0005)], '#b9a68f');
  const vesicles: Placement[] = [], insides: Placement[] = [];
  for (const point of packed(1.5, 0.18, 0.02, rng)) {
    const y = point.y + 0.92;
    if (y < 0.12 || y > 1.5) continue;
    vesicles.push(ball(point.x, y, 0.067, FACE - 0.03));
    insides.push(ball(point.x, y, 0.054, FACE - 0.012));
  }
  flats(group, vesicles, '#b49a7a', 2);
  flats(group, insides, '#efe3cf', 2);
  const docked = [-0.32, -0.14, 0.06, 0.26];
  flats(group, docked.map((x) => ball(x, GAP + WALL + 0.067, 0.067, FACE - 0.03)), '#b49a7a', 2);
  flats(group, docked.map((x) => ball(x, GAP + WALL + 0.067, 0.054, FACE - 0.012)), '#efe3cf', 2);
  const receptors: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let i = -8; i <= 8; i++) {
    if (rng() < 0.2) continue;
    const x = i * 0.1 + (rng() - 0.5) * 0.03;
    receptors.push({ position: V(x, -GAP + 0.012, FACE + 0.012), scale: V(0.02, 0.034, 0.02) });
    if (Math.abs(x) < Math.abs(chosen.x) || chosen.x === 0) chosen = V(x, -GAP + 0.012, FACE + 0.02);
  }
  flats(group, receptors, '#7fa3c9', 2);
  return finish(group, V(0, 0.05, 0.2), chosen, [
    { text: 'A glutamate receptor', at: chosen },
    { text: 'The cleft', at: V(0.6, 0, FACE) },
    { text: 'Vesicles at the active zone', at: V(-0.14, GAP + WALL + 0.09, FACE) },
    { text: 'Postsynaptic density', at: V(-0.5, -0.14, FACE) },
  ]);
}

/** A node of Ranvier along a myelinated axon, with the place beside it where potassium channels gather. */
export function buildNode(): JourneyScene {
  const rng = random(20010701), group = new THREE.Group();
  group.add(body(3.4, '#ece3d4', 1.2));
  const AXON = 0.2, MYELIN = 0.34, NODE = 0.12;
  bars(group, [rect(0, 0, 3.4, AXON * 2)], '#f3e6d2');
  bars(group, [rect(-(NODE + 0.85), (AXON + MYELIN) / 2, 1.7, MYELIN - AXON), rect(NODE + 0.85, (AXON + MYELIN) / 2, 1.7, MYELIN - AXON), rect(-(NODE + 0.85), -(AXON + MYELIN) / 2, 1.7, MYELIN - AXON), rect(NODE + 0.85, -(AXON + MYELIN) / 2, 1.7, MYELIN - AXON)], '#f5f1e6');
  const lamellae: THREE.Vector3[][] = [];
  for (const side of [-1, 1]) for (const sign of [-1, 1]) for (let i = 0; i < 6; i++) {
    const y = sign * (AXON + (MYELIN - AXON) * (i + 0.5) / 6), inner = NODE + i * 0.012;
    lamellae.push(line(side * inner, y, side * 1.7, y, FACE + 0.002));
  }
  tubes(group, lamellae, 0.0035, '#c9b78f', 3);
  const loops: Placement[] = [], threads: THREE.Vector3[][] = [];
  for (const side of [-1, 1]) for (const sign of [-1, 1]) for (let i = 0; i < 6; i++) {
    loops.push(ball(side * (NODE + i * 0.012), sign * (AXON + (MYELIN - AXON) * (i + 0.5) / 6), 0.011, FACE + 0.002));
  }
  flats(group, loops, '#d9c9a6', 1);
  for (let i = 0; i < 16; i++) { const y = -0.18 + i * 0.024; threads.push(line(-1.7, y + (rng() - 0.5) * 0.006, 1.7, y + (rng() - 0.5) * 0.006, FACE + 0.001)); }
  tubes(group, threads, 0.002, '#c8b796', 3);
  mitochondria(group, [{ x: -0.62, y: 0.08, length: 0.2, width: 0.036, angle: 0 }, { x: 0.7, y: -0.1, length: 0.16, width: 0.034, angle: 0 }], FACE + 0.003);
  const channels: Placement[] = [];
  for (const side of [-1, 1]) for (const sign of [-1, 1]) for (let i = 0; i < 8; i++) channels.push(ball(side * (0.26 + i * 0.026), sign * (AXON - 0.002), 0.008, FACE + 0.004));
  flats(group, channels, '#7fa3c9', 1);
  return finish(group, V(0, 0, 0.2), V(0.34, AXON - 0.002, FACE + 0.004), [
    { text: 'Beside the node, where potassium channels gather', at: V(0.34, AXON - 0.002, FACE + 0.004) },
    { text: 'Node of Ranvier', at: V(0, 0.08, FACE + 0.002) },
    { text: 'Myelin', at: V(-1, (AXON + MYELIN) / 2, FACE + 0.004) },
    { text: 'Axon', at: V(0.12, -0.12, FACE + 0.002) },
  ]);
}

/** The membrane of an axon, with myelin lying close over it and potassium channels hanging into the axon. */
export function buildAxonMembrane(): JourneyScene {
  const rng = random(20010702), group = new THREE.Group();
  group.add(body(4, '#f4eadb', 1.2));
  bars(group, [rect(0, 0, 4, 0.016)], '#b8a37f');
  const wraps: Placement[] = [];
  for (let i = 0; i < 18; i++) wraps.push(rect(0, 0.09 + i * 0.056, 4, 0.024));
  bars(group, wraps, '#e0d4b3');
  const threads: THREE.Vector3[][] = [];
  for (let i = 0; i < 7; i++) { const y = -0.32 - i * 0.2; threads.push([V(-2, y, FACE + 0.002), V(0, y + (rng() - 0.5) * 0.05, FACE + 0.002), V(2, y, FACE + 0.002)]); }
  tubes(group, threads, 0.017, '#d4c5a4', 5);
  const pores: Placement[] = [], bodies: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let i = -14; i <= 14; i++) {
    if (rng() < 0.45) continue;
    const x = i * 0.085 + (rng() - 0.5) * 0.02;
    pores.push({ position: V(x, 0, FACE + 0.008), scale: V(0.02, 0.02, 0.012) });
    bodies.push(ball(x, -0.042, 0.02, FACE + 0.006));
    if (Math.abs(x) < Math.abs(chosen.x) || chosen.x === 0) chosen = V(x, -0.012, FACE + 0.012);
  }
  flats(group, pores, '#7fa3c9', 2);
  flats(group, bodies, '#5d86b5', 2);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A potassium channel', at: chosen },
    { text: 'Membrane of the axon', at: V(0.92, 0, FACE) },
    { text: 'Layers of myelin', at: V(-0.7, 0.4, FACE) },
    { text: 'Neurofilaments', at: V(0.6, -0.72, FACE + 0.01) },
  ]);
}

/** A plasma cell cut across: the nucleus to one side and rough endoplasmic reticulum filling the rest. */
export function buildPlasmaCell(): JourneyScene {
  const rng = random(20150220), group = new THREE.Group();
  group.add(body(3.4, '#e7e2d8', 1.2));
  flats(group, [oval(0, 0, 0.92, 0.84)], '#e5d2c4', 5);
  const CENTRE = V(-0.42, -0.12, 0);
  flats(group, [oval(CENTRE.x, CENTRE.y, 0.4, 0.38, 0, FACE + 0.002)], '#8f76ad', 5);
  const spots: Placement[] = [];
  for (let i = 0; i < 26; i++) { const a = rng() * 6.28, r = 0.26 + rng() * 0.1; spots.push(oval(CENTRE.x + r * Math.cos(a), CENTRE.y + r * Math.sin(a), 0.03 + rng() * 0.02, 0.02 + rng() * 0.012, a, FACE + 0.004)); }
  flats(group, spots, '#65508a', 1);
  flats(group, [oval(-0.02, 0.1, 0.2, 0.14, 0.4, FACE + 0.002)], '#efe6da', 2);
  const sheets: THREE.Vector3[][] = [], ribosomes: Placement[] = [];
  for (let ring = 0; ring < 9; ring++) {
    const radius = 0.5 + ring * 0.042;
    const from = -1.05 + ring * 0.02, to = 1.25 - ring * 0.02;
    const points: THREE.Vector3[] = [];
    for (let a = from; a <= to; a += 0.14) {
      const here = V(CENTRE.x + radius * 1.18 * Math.cos(a), CENTRE.y + radius * 1.02 * Math.sin(a), FACE + 0.003);
      points.push(here);
      if (rng() < 0.82) ribosomes.push(ball(here.x + (rng() - 0.5) * 0.02, here.y + (rng() - 0.5) * 0.02, 0.004, FACE + 0.004));
    }
    sheets.push(points);
  }
  tubes(group, sheets, 0.008, '#c89a7f', 3);
  flats(group, ribosomes, '#7c5c49', 0);
  mitochondria(group, [{ x: 0.5, y: -0.46, length: 0.11, width: 0.05, angle: 1 }, { x: 0.14, y: 0.6, length: 0.1, width: 0.05, angle: 0.2 }], FACE + 0.003);
  const focus = sheets[4][7];
  return finish(group, V(0, 0, 0.2), V(focus.x, focus.y, FACE + 0.004), [
    { text: 'Rough endoplasmic reticulum, where antibodies are made', at: V(focus.x, focus.y, FACE + 0.004) },
    { text: 'Nucleus, to one side', at: V(CENTRE.x, CENTRE.y, FACE + 0.005) },
    { text: 'Golgi', at: V(-0.02, 0.12, FACE + 0.003) },
  ]);
}

/** One sheet of rough endoplasmic reticulum: ribosomes on its outer faces and antibodies in the space inside. */
export function buildEndoplasmic(): JourneyScene {
  const rng = random(20150221), group = new THREE.Group();
  group.add(body(4, '#ecdccd', 1.2));
  const HALF = 0.16, WALL = 0.014;
  for (const y of [0, 0.86, -0.86]) {
    bars(group, [rect(0, y, 4, HALF * 2, FACE, new THREE.Color('#f5ecdc')), rect(0, y + HALF, 4, WALL, FACE + 0.001), rect(0, y - HALF, 4, WALL, FACE + 0.001)], '#ffffff');
    const ribosomes: Placement[] = [];
    for (let i = -14; i <= 14; i++) for (const side of [-1, 1]) if (rng() < 0.8) ribosomes.push(ball(i * 0.14 + (rng() - 0.5) * 0.03, y + side * (HALF + 0.045), 0.042, FACE - 0.02, shade('#8c6a58', 0.92 + rng() * 0.16)));
    flats(group, ribosomes, '#ffffff', 1);
  }
  const arms: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let i = 0; i < 90; i++) {
    const x = (rng() - 0.5) * 3.8, y = (rng() - 0.5) * (HALF * 2 - 0.08), turn = rng() * 6.28;
    for (let arm = 0; arm < 3; arm++) { const a = turn + arm * 2.09; arms.push(oval(x + 0.016 * Math.cos(a), y + 0.016 * Math.sin(a), 0.015, 0.006, a, FACE + 0.006)); }
    if (Math.hypot(x, y) < chosen.distanceTo(V(0, 0, FACE)) || chosen.x === 0) chosen = V(x, y, FACE + 0.006);
  }
  flats(group, arms, '#7fa3c9', 1);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'An antibody', at: chosen },
    { text: 'Membrane of the sheet', at: V(0.9, HALF, FACE + 0.002) },
    { text: 'Ribosomes', at: V(-0.8, HALF + 0.05, FACE) },
  ]);
}

/** The edge of a fat cell: a large droplet, a thin rim of cytoplasm and the cell membrane. */
export function buildDropletEdge(): JourneyScene {
  const rng = random(20120413), group = new THREE.Group();
  group.add(body(3.4, '#f0e8da', 1.2));
  flats(group, [oval(0, -3.3, 3.3, 3.3)], '#f3dc8e', 7);
  bars(group, [rect(0, 0.21, 3.4, 0.016, FACE + 0.002)], '#c9a783');
  bars(group, [rect(0, 0.1, 3.4, 0.22, FACE - 0.002)], '#e9d3bd');
  bars(group, [rect(0, 0.72, 3.4, 1, FACE - 0.001)], '#f1e4cf');
  const small: Placement[] = [];
  for (let i = 0; i < 60; i++) small.push(ball((rng() - 0.5) * 3.2, 0.06 + rng() * 0.11, 0.006 + rng() * 0.012, FACE + 0.002));
  flats(group, small, '#f5e6a8', 1);
  mitochondria(group, [{ x: -0.6, y: 0.1, length: 0.14, width: 0.04, angle: 0.05 }, { x: 0.74, y: 0.09, length: 0.12, width: 0.04, angle: -0.05 }, { x: 0.3, y: 0.13, length: 0.09, width: 0.034, angle: 0.1 }], FACE + 0.002);
  return finish(group, V(0, 0, 0.2), V(0.02, 0.05, FACE + 0.002), [
    { text: 'The edge of the droplet', at: V(0.02, 0.05, FACE + 0.002) },
    { text: 'Stored fat', at: V(-0.5, -0.5, FACE + 0.002) },
    { text: 'Cell membrane', at: V(-0.1, 0.21, FACE + 0.003) },
    { text: 'Mitochondrion', at: V(-0.6, 0.1, FACE + 0.003) },
  ]);
}

/** The surface of a fat droplet, with a single layer of lipid over it and small lipid-binding proteins in the cytoplasm beside it. */
export function buildDropletSurface(): JourneyScene {
  const rng = random(20120414), group = new THREE.Group();
  group.add(body(4, '#efe4d4', 1.2));
  bars(group, [rect(0, -1.05, 4, 2, FACE)], '#f1d782');
  bars(group, [rect(0, -0.045, 4, 0.012, FACE + 0.002)], '#c49e4e');
  const lipid: THREE.Vector3[][] = [];
  for (let i = 0; i < 90; i++) { const x = (rng() - 0.5) * 3.8, y = -0.12 - rng() * 1.4; lipid.push(line(x, y, x + 0.05 * (rng() - 0.5), y - 0.05, FACE + 0.002)); }
  tubes(group, lipid, 0.002, '#d9b95c', 3);
  const proteins: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let i = 0; i < 1800; i++) {
    const x = (rng() - 0.5) * 3.8, y = -0.015 + rng() * 1.4;
    proteins.push(ball(x, y, 0.009, FACE + 0.003, shade('#c78686', 0.88 + rng() * 0.22)));
    if (Math.hypot(x, y - 0.12) < chosen.distanceTo(V(0, 0.12, FACE)) || chosen.x === 0) chosen = V(x, y, FACE + 0.003);
  }
  flats(group, proteins, '#ffffff', 1);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A lipid-binding protein', at: chosen },
    { text: 'Neutral lipid of the droplet', at: V(-0.6, -0.7, FACE + 0.003) },
    { text: 'A single layer of lipid', at: V(0.6, -0.045, FACE + 0.003) },
  ]);
}

/** Outer segments of rods: stacks of discs on a stalk above an inner segment full of mitochondria. Fewer discs are drawn than exist, so that they can be told apart. */
export function buildRodOuter(): JourneyScene {
  const group = new THREE.Group();
  group.add(body(3.4, '#ece0d4', 1.2));
  const WIDTH = 0.28, PITCH = 0.36, STEP = 0.02;
  const skins: Placement[] = [], discs: Placement[] = [], stalks: Placement[] = [], inner: Placement[] = [];
  const places: { x: number; y: number; length: number; width: number; angle: number }[] = [];
  for (let i = -5; i <= 5; i++) {
    const x = i * PITCH;
    skins.push(rect(x, 0.42, WIDTH, 2.6));
    for (let k = 0; k < 130; k++) discs.push(rect(x, -0.84 + k * STEP, WIDTH * 0.92, STEP * 0.42, FACE + 0.002));
    stalks.push(rect(x + WIDTH * 0.35, -0.96, 0.05, 0.24, FACE + 0.001));
    inner.push(rect(x, -1.42, WIDTH * 1.08, 0.72));
    places.push({ x: x + 0.03, y: -1.26, length: 0.11, width: 0.026, angle: 1.57 }, { x: x - 0.06, y: -1.42, length: 0.12, width: 0.026, angle: 1.45 });
  }
  bars(group, skins, '#e7d0c6');
  bars(group, discs, '#b98ba5');
  bars(group, stalks, '#cdb6c0');
  bars(group, inner, '#e6d4c1');
  mitochondria(group, places, FACE + 0.002);
  return finish(group, V(0, -0.1, 0.2), V(0.01, 0.1, FACE + 0.003), [
    { text: 'Stack of discs of a rod', at: V(0.01, 0.1, FACE + 0.003) },
    { text: 'The stalk, a modified cilium', at: V(PITCH + WIDTH * 0.35, -0.96, FACE + 0.002) },
    { text: 'Mitochondria of the inner segment', at: V(-PITCH + 0.03, -1.26, FACE + 0.003) },
  ]);
}

/** Discs of a rod seen from the side, with rhodopsin crowded in their membranes. Fotiadis et al. saw it as dimers in discs of the mouse. */
export function buildDiscs(): JourneyScene {
  const rng = random(20030109), group = new THREE.Group();
  group.add(body(4, '#efe5dc', 1.2));
  const STEP = 0.107, HALF = 0.024;
  const walls: Placement[] = [], insides: Placement[] = [], proteins: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let k = -16; k <= 16; k++) {
    const y = k * STEP;
    walls.push(rect(0, y, 4, HALF * 2 + 0.016));
    insides.push(rect(0, y, 4, HALF * 2 - 0.016, FACE + 0.001));
    for (const side of [-1, 1]) for (let i = -60; i <= 60; i++) {
      const x = i * 0.034 + (i % 2 ? 0.012 : 0) + (rng() - 0.5) * 0.004;
      proteins.push(ball(x, y + side * HALF, 0.0125, FACE + 0.003, shade('#b7648f', 0.86 + rng() * 0.26)));
      if (k === 0 && side === 1 && Math.abs(x) < 0.02) chosen = V(x, y + HALF, FACE + 0.003);
    }
  }
  bars(group, walls, '#d7b9c7');
  bars(group, insides, '#f1e7ea');
  flats(group, proteins, '#ffffff', 1);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A rhodopsin', at: chosen },
    { text: 'Inside of a disc', at: V(0.82, STEP * 2, FACE + 0.002) },
    { text: 'Between the discs', at: V(-0.82, STEP * 1.5, FACE) },
  ]);
}

/** Lens fibres cut across: flattened and packed, with no nucleus or other large organelle in those that have matured. */
export function buildLensFibre(): JourneyScene {
  const group = new THREE.Group();
  group.add(body(3.4, '#c7d2d8', 1.2));
  const WIDE = 0.9, THICK = 0.26;
  const fibres: Placement[] = [];
  const hexagon = new THREE.Shape();
  hexagon.moveTo(-0.5, 0); hexagon.lineTo(-0.34, 0.5); hexagon.lineTo(0.34, 0.5); hexagon.lineTo(0.5, 0); hexagon.lineTo(0.34, -0.5); hexagon.lineTo(-0.34, -0.5); hexagon.closePath();
  for (let row = -6; row <= 6; row++) for (let i = -4; i <= 4; i++) fibres.push({ position: V(i * (WIDE + 0.03) + (row % 2 ? (WIDE + 0.03) * 0.42 : 0), row * (THICK * 0.56 + 0.012), FACE), scale: V(WIDE, THICK, 1) });
  group.add(instances(new THREE.ShapeGeometry(hexagon), material('#e9f0f4'), fibres));
  return finish(group, V(0, 0, 0.2), V(0.02, 0.01, FACE + 0.001), [
    { text: 'Inside one fibre', at: V(0.02, 0.01, FACE + 0.001) },
    { text: 'Membranes of neighbouring fibres', at: V(WIDE * 0.5, THICK * 0.28, FACE + 0.001) },
    { text: 'No nucleus or other large organelle', at: V(-WIDE, THICK * 0.56, FACE + 0.001) },
  ]);
}

/** Crystallins packed closely in the cytoplasm of a lens fibre. */
export function buildCrystallinCrowd(): JourneyScene {
  const rng = random(20051031), group = new THREE.Group();
  group.add(body(4, '#d3dee4', 1.2));
  bars(group, [rect(0, 1.02, 4, 0.016)], '#a9b8c2');
  const proteins: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let row = -44; row <= 40; row++) for (let i = -70; i <= 70; i++) {
    const x = i * 0.029 + (row % 2 ? 0.0145 : 0) + (rng() - 0.5) * 0.012, y = row * 0.025 + (rng() - 0.5) * 0.01;
    proteins.push(ball(x, y, 0.009 + rng() * 0.003, FACE + 0.002, shade('#9fb9c9', 0.86 + rng() * 0.28)));
    if (Math.hypot(x, y) < chosen.length() - FACE || chosen.x === 0) chosen = V(x, y, FACE + 0.002);
  }
  const crowd = flats(group, proteins, '#ffffff', 0);
  const base = proteins.map((item) => item.position.clone()), matrix = new THREE.Matrix4(), place = new THREE.Vector3(), identity = new THREE.Quaternion();
  const jostle = ({ seconds }: TissueMotion) => {
    base.forEach((rest, index) => {
      place.set(rest.x + 0.0015 * Math.sin(seconds * 3 + index), rest.y + 0.0015 * Math.cos(seconds * 2.4 + index * 1.7), rest.z);
      matrix.compose(place, identity, proteins[index].scale);
      crowd.setMatrixAt(index, matrix);
    });
    crowd.instanceMatrix.needsUpdate = true;
  };
  return withMotion(finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A gamma-S crystallin, among others', at: chosen },
    { text: 'Membrane of the fibre', at: V(0.6, 1.02, FACE + 0.001) },
    { text: 'A crowd with little water between', at: V(-0.72, 0.62, FACE + 0.004) },
  ]), jostle);
}

/** The brush border of a kidney tubule cell: long microvilli facing the fluid of the tubule. */
export function buildBrushBorder(): JourneyScene {
  const rng = random(19930101), group = new THREE.Group();
  group.add(body(3.4, '#eee6dc', 1.2));
  bars(group, [rect(0, -1.05, 3.4, 1.4)], '#e4cfc0');
  const villi: Placement[] = [];
  for (let i = -46; i <= 46; i++) { const length = 0.56 + rng() * 0.08; villi.push(rect(i * 0.036, -0.35 + length / 2, 0.021, length)); }
  bars(group, villi, '#d3a894');
  const coats: Placement[] = [];
  for (let i = -46; i <= 46; i++) coats.push(rect(i * 0.036, -0.05, 0.007, 0.52, FACE + 0.001));
  bars(group, coats, '#a97d6a');
  const pits: Placement[] = [];
  for (let i = 0; i < 26; i++) pits.push(oval((rng() - 0.5) * 3.2, -0.46 - rng() * 0.2, 0.014 + rng() * 0.016, 0.012 + rng() * 0.012, 0, FACE + 0.001));
  flats(group, pits, '#f2e7dc', 1);
  mitochondria(group, [{ x: -0.52, y: -1, length: 0.3, width: 0.05, angle: 1.5 }, { x: -0.14, y: -1.02, length: 0.32, width: 0.05, angle: 1.56 }, { x: 0.3, y: -1, length: 0.3, width: 0.05, angle: 1.6 }, { x: 0.72, y: -1.03, length: 0.3, width: 0.05, angle: 1.52 }], FACE + 0.002);
  return finish(group, V(0, -0.1, 0.2), V(0, 0, FACE + 0.002), [
    { text: 'One microvillus', at: V(0, 0, FACE + 0.002) },
    { text: 'Fluid of the tubule', at: V(0.7, 0.5, FACE) },
    { text: 'Mitochondria', at: V(-0.14, -1.02, FACE + 0.003) },
  ]);
}

/** A microvillus with its core of actin, and water channels in its membrane. */
export function buildMicrovillus(): JourneyScene {
  const rng = random(19930102), group = new THREE.Group();
  group.add(body(4, '#ecf0f0', 1.2));
  const HALF = 0.167, SPACE = 0.6;
  const walls: Placement[] = [], insides: Placement[] = [], proteins: Placement[] = [];
  const cores: THREE.Vector3[][] = [];
  let chosen = V(0, 0, FACE);
  for (let k = -3; k <= 3; k++) {
    const x = k * SPACE;
    walls.push(rect(x, 0, HALF * 2 + 0.024, 4));
    insides.push(rect(x, 0, HALF * 2, 4, FACE + 0.001));
    for (let i = -8; i <= 8; i++) cores.push(line(x + i * 0.016, -2, x + i * 0.016, 2, FACE + 0.002));
    for (let i = 0; i < 300; i++) {
      const across = (rng() - 0.5) * (HALF * 2), y = (rng() - 0.5) * 3.9;
      proteins.push(ball(x + across, y, 0.011, FACE + 0.006, shade('#6fb0cc', 0.86 + rng() * 0.28)));
      if (k === 0 && (Math.hypot(across, y) < chosen.length() - FACE || chosen.x === 0)) chosen = V(x + across, y, FACE + 0.006);
    }
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 50; i++) proteins.push(ball(x + side * (HALF + 0.006), -2 + i * 0.08 + (rng() - 0.5) * 0.04, 0.011, FACE + 0.004, shade('#6fb0cc', 0.86 + rng() * 0.28)));
  }
  bars(group, walls, '#c5a591');
  bars(group, insides, '#ecd9cb');
  tubes(group, cores, 0.0035, '#b88d76', 3);
  flats(group, proteins, '#ffffff', 1);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'An aquaporin', at: chosen },
    { text: 'Core of actin filaments', at: V(SPACE, 0.3, FACE + 0.006) },
    { text: 'Fluid of the tubule', at: V(SPACE / 2, -0.5, FACE) },
  ]);
}

/** The way out of a liver cell for what it secretes: rough endoplasmic reticulum, a Golgi stack and vesicles, among mitochondria and glycogen. */
export function buildSecretoryRoute(): JourneyScene {
  const rng = random(20010501), group = new THREE.Group();
  group.add(body(3.4, '#e9d6c7', 1.2));
  bars(group, [rect(1.4, 0, 1, 3.4, FACE + 0.001)], '#f1e5da');
  const villi: Placement[] = [];
  for (let i = -30; i <= 30; i++) villi.push(rect(0.92 + 0.045, i * 0.05, 0.09, 0.016, FACE + 0.002));
  bars(group, villi, '#d6b39d');
  const er: THREE.Vector3[][] = [], ribosomes: Placement[] = [];
  for (let i = 0; i < 9; i++) {
    const y = 0.42 + i * 0.05, points = [V(-1.2, y, FACE + 0.002), V(-0.7, y + 0.03, FACE + 0.002), V(-0.2, y - 0.02, FACE + 0.002), V(0.22, y + 0.02, FACE + 0.002)];
    er.push(points);
    for (let k = 0; k < 42; k++) ribosomes.push(ball(-1.2 + k * 0.034, y + 0.012 * (k % 2 ? 1 : -1), 0.004, FACE + 0.003));
  }
  tubes(group, er, 0.009, '#c79a7e', 3);
  flats(group, ribosomes, '#7c5c49', 0);
  const golgi: THREE.Vector3[][] = [];
  for (let i = 0; i < 5; i++) { const y = -0.04 + i * 0.03; golgi.push([V(-0.32, y - 0.04, FACE + 0.002), V(-0.15, y + 0.01, FACE + 0.002), V(0.05, y + 0.02, FACE + 0.002), V(0.22, y - 0.03, FACE + 0.002)]); }
  tubes(group, golgi, 0.009, '#b98e8e', 3);
  const vesicles: Placement[] = [{ ...ball(0.52, 0.02, 0.036, FACE + 0.002) }];
  for (let i = 0; i < 14; i++) vesicles.push(ball(0.3 + rng() * 0.55, -0.34 + rng() * 0.68, 0.016 + rng() * 0.018, FACE + 0.002));
  flats(group, vesicles, '#ecd9b6', 2);
  const glycogen: Placement[] = [];
  for (let i = 0; i < 180; i++) glycogen.push(ball(-1.3 + rng() * 1.3, -1.3 + rng() * 0.88, 0.007, FACE + 0.002));
  flats(group, glycogen, '#a886a2', 0);
  mitochondria(group, [{ x: -0.72, y: 0.06, length: 0.16, width: 0.08, angle: 0.2 }, { x: 0.42, y: -0.7, length: 0.15, width: 0.08, angle: 1 }, { x: -0.1, y: -0.46, length: 0.15, width: 0.08, angle: -0.3 }, { x: -0.1, y: 1.1, length: 0.17, width: 0.08, angle: 0.1 }], FACE + 0.002);
  return finish(group, V(0, 0, 0.2), V(0.52, 0.02, FACE + 0.002), [
    { text: 'A vesicle on its way out', at: V(0.52, 0.02, FACE + 0.002) },
    { text: 'Rough endoplasmic reticulum', at: V(-0.7, 0.62, FACE + 0.003) },
    { text: 'Golgi', at: V(-0.05, 0.03, FACE + 0.003) },
    { text: 'Glycogen', at: V(-0.65, -0.9, FACE + 0.003) },
  ]);
}

/** A vesicle full of protein on its way out of the cell. */
export function buildVesicle(): JourneyScene {
  const rng = random(20010502), group = new THREE.Group();
  group.add(body(4, '#e9d9cb', 1.2));
  flats(group, [oval(0, 0, 0.5, 0.5)], '#b8926f', 5);
  flats(group, [oval(0, 0, 0.484, 0.484, 0, FACE + 0.001)], '#f4e7cd', 5);
  const proteins: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let row = -18; row <= 18; row++) for (let i = -18; i <= 18; i++) {
    const x = i * 0.026 + (row % 2 ? 0.013 : 0) + (rng() - 0.5) * 0.012, y = row * 0.026 + (rng() - 0.5) * 0.012;
    if (Math.hypot(x, y) > 0.46) continue;
    proteins.push(ball(x, y, 0.0095, FACE + 0.003, shade('#d0b56a', 0.86 + rng() * 0.28)));
    if (Math.hypot(x, y) < chosen.length() - FACE || chosen.x === 0) chosen = V(x, y, FACE + 0.003);
  }
  flats(group, proteins, '#ffffff', 1);
  const near: Placement[] = [];
  for (let i = 0; i < 320; i++) { const x = (rng() - 0.5) * 3.8, y = (rng() - 0.5) * 3.8; if (Math.hypot(x, y) > 0.56) near.push(ball(x, y, 0.009 + rng() * 0.012, FACE + 0.001)); }
  flats(group, near, '#cdb5a0', 0);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A protein on its way out', at: chosen },
    { text: 'Membrane of the vesicle', at: V(0.35, 0.35, FACE + 0.002) },
    { text: 'Cytoplasm', at: V(0.86, -0.72, FACE + 0.002) },
  ]);
}

/** Lamellar bodies in a type II cell of the lung, each a stack of rings of membrane. */
export function buildLamellarBody(): JourneyScene {
  const rng = random(20201125), group = new THREE.Group();
  group.add(body(3.4, '#e6d3c6', 1.2));
  bars(group, [rect(0, 1.2, 3.4, 1, FACE + 0.001)], '#f6f2ec');
  const villi: Placement[] = [];
  for (let i = -30; i <= 30; i++) villi.push(rect(i * 0.056, 0.74, 0.02, 0.1 + rng() * 0.05, FACE + 0.002));
  bars(group, villi, '#d3ae9a');
  flats(group, [oval(-0.2, -1.05, 0.55, 0.42, 0, FACE + 0.002)], '#8f76ad', 3);
  const shells: Placement[] = [], rings: THREE.Vector3[][] = [];
  const places = [{ x: 0, y: 0, r: 0.2 }, { x: -0.55, y: 0.28, r: 0.15 }, { x: 0.55, y: 0.24, r: 0.17 }, { x: -0.68, y: -0.28, r: 0.13 }, { x: 0.62, y: -0.36, r: 0.15 }, { x: 0.1, y: 0.5, r: 0.12 }, { x: 1.2, y: 0.05, r: 0.14 }, { x: -1.22, y: 0.1, r: 0.15 }];
  for (const { x, y, r } of places) {
    shells.push(oval(x, y, r, r, 0, FACE + 0.001));
    for (let k = 1; k <= 6; k++) {
      const radius = r * k / 6.6, points: THREE.Vector3[] = [];
      for (let a = 0; a <= 6.3; a += 0.21) points.push(V(x + radius * Math.cos(a), y + radius * Math.sin(a), FACE + 0.003));
      rings.push(points);
    }
  }
  flats(group, shells, '#f3ead9', 3);
  tubes(group, rings, 0.0032, '#a98a6a', 3);
  mitochondria(group, [{ x: -0.34, y: -0.34, length: 0.11, width: 0.05, angle: 0.5 }, { x: 0.34, y: -0.52, length: 0.1, width: 0.05, angle: 2 }, { x: 1.1, y: -0.62, length: 0.12, width: 0.05, angle: 1 }], FACE + 0.002);
  return finish(group, V(0, -0.05, 0.2), V(0.1, 0, FACE + 0.004), [
    { text: 'A lamellar body, a store of surfactant', at: V(0.1, 0, FACE + 0.004) },
    { text: 'Microvilli at the air space', at: V(-0.5, 0.78, FACE + 0.003) },
    { text: 'Nucleus', at: V(-0.2, -0.9, FACE + 0.003) },
  ]);
}

/** Rings of membrane inside a lamellar body, seen so closely that they look nearly straight, with protein between them. */
export function buildLamellae(): JourneyScene {
  const rng = random(20201126), group = new THREE.Group();
  group.add(body(4, '#f3ead9', 1.2));
  const RADIUS = 2.2, STEP = 0.05, sheets: THREE.Vector3[][] = [], proteins: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let k = -36; k <= 36; k++) {
    const radius = RADIUS + k * STEP, points: THREE.Vector3[] = [];
    for (let a = -1.1; a <= 1.1; a += 0.16) points.push(V(radius * Math.sin(a), radius * Math.cos(a) - RADIUS, FACE + 0.002));
    sheets.push(points);
    for (let i = 0; i < 26; i++) {
      const a = (rng() - 0.5) * 1.7, x = (radius + STEP / 2) * Math.sin(a), y = (radius + STEP / 2) * Math.cos(a) - RADIUS;
      proteins.push(oval(x, y, 0.013, 0.008, -a, FACE + 0.004));
      if (Math.hypot(x, y) < chosen.length() - FACE || chosen.x === 0) chosen = V(x, y, FACE + 0.004);
    }
  }
  tubes(group, sheets, 0.008, '#c2a071', 4);
  flats(group, proteins, '#b68fb8', 1);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A domain of the protein', at: chosen },
    { text: 'Closely packed layers of membrane', at: V(0.86, 0.34, FACE + 0.003) },
    { text: 'Space between two layers', at: V(-0.72, -0.5, FACE + 0.003) },
  ]);
}

/** Cilia standing on an airway cell. Their beating is an illustration, at a rate chosen for viewing. */
export function buildCiliaRow(): JourneyScene {
  const group = new THREE.Group();
  group.add(body(3.4, '#f0ece4', 1.2));
  bars(group, [rect(0, -1.1, 3.4, 1.2)], '#e3cfc1');
  const stems: THREE.Mesh[] = [], made = material('#c8a593'), feet: Placement[] = [];
  const LENGTH = 1.2, base = -0.5;
  const geometry = tubeGeometry([V(0, 0, 0), V(0.012, LENGTH * 0.33, 0), V(0.024, LENGTH * 0.66, 0), V(0.02, LENGTH, 0)], 0.025, 6, 2);
  for (let i = -18; i <= 18; i++) {
    const stem = new THREE.Mesh(geometry, made);
    stem.position.set(i * 0.09, base, FACE + 0.002);
    group.add(stem);
    stems.push(stem);
    feet.push(rect(i * 0.09, base - 0.03, 0.05, 0.08, FACE + 0.003));
  }
  bars(group, feet, '#7e5f50');
  mitochondria(group, [{ x: -0.6, y: -0.86, length: 0.16, width: 0.05, angle: 1.4 }, { x: -0.1, y: -0.84, length: 0.16, width: 0.05, angle: 1.6 }, { x: 0.46, y: -0.86, length: 0.16, width: 0.05, angle: 1.5 }], FACE + 0.002);
  const beat = ({ seconds }: TissueMotion) => { stems.forEach((stem, index) => { stem.rotation.z = 0.2 * Math.sin(seconds * 3 - index * 0.5) - 0.05; }); };
  return withMotion(finish(group, V(0, -0.05, 0.2), V(0.02, 0, FACE + 0.004), [
    { text: 'One cilium', at: V(0.02, 0, FACE + 0.004) },
    { text: 'Basal bodies, where they are rooted', at: V(0.54, base - 0.03, FACE + 0.004) },
    { text: 'Mitochondria', at: V(-0.1, -0.84, FACE + 0.003) },
  ]), beat);
}

/** A motile cilium cut across: nine outer doublets of microtubules and a central pair, as Satir and Christensen describe. */
export function buildAxonemeSection(): JourneyScene {
  const group = new THREE.Group();
  group.add(body(4, '#f2ece2', 1.2));
  flats(group, [oval(0, 0, 0.44, 0.44)], '#c3a68f', 5);
  flats(group, [oval(0, 0, 0.425, 0.425, 0, FACE + 0.001)], '#f1e5d5', 5);
  const RING = 0.3, A = 0.042, B = 0.04;
  const walls: Placement[] = [], insides: Placement[] = [], beads: Placement[] = [], spokes: THREE.Vector3[][] = [], arms: THREE.Vector3[][] = [];
  const tube = (x: number, y: number, r: number) => {
    walls.push(oval(x, y, r, r, 0, FACE + 0.003));
    insides.push(oval(x, y, r * 0.62, r * 0.62, 0, FACE + 0.004));
    for (let k = 0; k < 13; k++) { const a = k * 6.283 / 13; beads.push(ball(x + r * 0.82 * Math.cos(a), y + r * 0.82 * Math.sin(a), r * 0.2, FACE + 0.006)); }
  };
  let chosen = V(0, 0, FACE);
  for (let i = 0; i < 9; i++) {
    const a = i * 6.283 / 9 + 0.35, cx = Math.cos(a), cy = Math.sin(a), tx = -cy, ty = cx;
    const ax = RING * cx - 0.035 * tx, ay = RING * cy - 0.035 * ty;
    tube(ax, ay, A);
    tube(RING * cx + 0.038 * tx, RING * cy + 0.038 * ty, B);
    spokes.push(line(ax * 0.84, ay * 0.84, 0.1 * cx, 0.1 * cy, FACE + 0.002));
    arms.push([V(ax - 0.03 * tx, ay - 0.03 * ty, FACE + 0.003), V(ax - 0.07 * tx + 0.02 * cx, ay - 0.07 * ty + 0.02 * cy, FACE + 0.003), V(ax - 0.1 * tx + 0.012 * cx, ay - 0.1 * ty + 0.012 * cy, FACE + 0.003)]);
    if (i === 1) chosen = V(ax + A * 0.82 * tx, ay + A * 0.82 * ty, FACE + 0.006);
  }
  tube(-0.052, 0, A * 0.92);
  tube(0.052, 0, A * 0.92);
  flats(group, walls, '#b98f8f', 3);
  flats(group, insides, '#f1e5d5', 2);
  flats(group, beads, '#8a6464', 1);
  tubes(group, spokes, 0.006, '#c7a68d', 3);
  tubes(group, arms, 0.009, '#6f9a7a', 3);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'Tubulin in the wall of a microtubule', at: chosen },
    { text: 'Central pair', at: V(0.052, 0, FACE + 0.007) },
    { text: 'Dynein arm', at: V(RING * Math.cos(5 * 6.283 / 9 + 0.35), RING * Math.sin(5 * 6.283 / 9 + 0.35), FACE + 0.007) },
    { text: 'Membrane of the cilium', at: V(-0.31, -0.31, FACE + 0.002) },
  ]);
}

/** A parietal cell of the stomach: a secretory canaliculus among mitochondria and tubulovesicles. */
export function buildParietal(): JourneyScene {
  const rng = random(20100301), group = new THREE.Group();
  group.add(body(3.4, '#e9d5cb', 1.2));
  const lumen: THREE.Vector3[][] = [[V(-1.7, 0.92, FACE + 0.001), V(-0.8, 0.72, FACE + 0.001), V(-0.1, 0.62, FACE + 0.001), V(0.5, 0.86, FACE + 0.001), V(1.7, 0.98, FACE + 0.001)], [V(-0.1, 0.62, FACE + 0.001), V(-0.26, 0.26, FACE + 0.001), V(-0.58, -0.2, FACE + 0.001)]];
  tubes(group, lumen, 0.1, '#f3eee6', 8);
  const villi: Placement[] = [];
  const curve = new THREE.CatmullRomCurve3(lumen[0]);
  for (let i = 0; i < 90; i++) { const at = curve.getPointAt(i / 89); villi.push(rect(at.x, at.y + (i % 2 ? 0.07 : -0.07), 0.012, 0.06, FACE + 0.012)); }
  bars(group, villi, '#c79f8b');
  const places: { x: number; y: number; length: number; width: number; angle: number }[] = [];
  const small: Placement[] = [];
  for (const point of packed(1.6, 0.4, 0.1, rng)) {
    if (Math.abs(point.y - 0.78) < 0.2 || Math.hypot(point.x + 0.3, point.y - 0.2) < 0.26) continue;
    places.push({ x: point.x, y: point.y, length: 0.13 + rng() * 0.04, width: 0.07 + rng() * 0.02, angle: rng() * 3.14 });
  }
  mitochondria(group, places, FACE + 0.002);
  let vesicle = V(0, 0, FACE);
  for (let i = 0; i < 520; i++) {
    const x = (rng() - 0.5) * 3.3, y = (rng() - 0.5) * 3.3;
    if (Math.abs(y - 0.78) < 0.12) continue;
    if (places.some((place) => Math.hypot(x - place.x, y - place.y) < place.length * 0.9)) continue;
    small.push(oval(x, y, 0.012 + rng() * 0.01, 0.006 + rng() * 0.006, rng() * 3.14, FACE + 0.001));
    if (Math.hypot(x, y) < vesicle.distanceTo(V(0, 0, FACE)) || vesicle.x === 0) vesicle = V(x, y, FACE + 0.002);
  }
  flats(group, small, '#c7a2a2', 1);
  return finish(group, V(0, 0, 0.2), vesicle, [
    { text: 'A tubulovesicle, carrying pumps', at: vesicle },
    { text: 'Secretory canaliculus', at: V(0.2, 0.72, FACE + 0.002) },
    { text: 'Mitochondrion', at: V(places[4].x, places[4].y, FACE + 0.003) },
  ]);
}

/** The membrane of a tubulovesicle, thick with proton pumps. */
export function buildPumpMembrane(): JourneyScene {
  const rng = random(20100302), group = new THREE.Group();
  group.add(body(4, '#e7d5ca', 1.2));
  flats(group, [oval(0, 0, 1.8, 0.42)], '#c49a9a', 6);
  flats(group, [oval(0, 0, 1.77, 0.39, 0, FACE + 0.001)], '#f1e3df', 6);
  const pumps: Placement[] = [];
  let chosen = V(0, 0, FACE);
  for (let row = -12; row <= 12; row++) for (let i = -48; i <= 48; i++) {
    const x = i * 0.037 + (row % 2 ? 0.018 : 0) + (rng() - 0.5) * 0.008, y = row * 0.032 + (rng() - 0.5) * 0.008;
    if ((x / 1.74) ** 2 + (y / 0.37) ** 2 > 1) continue;
    pumps.push(ball(x, y, 0.016, FACE + 0.004, shade('#c58a70', 0.84 + rng() * 0.3)));
    if (Math.hypot(x, y) < chosen.length() - FACE || chosen.x === 0) chosen = V(x, y, FACE + 0.004);
  }
  flats(group, pumps, '#ffffff', 1);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A proton pump', at: chosen },
    { text: 'Membrane of the tubulovesicle', at: V(0.86, 0.39, FACE + 0.002) },
    { text: 'Cytoplasm', at: V(-0.8, 0.8, FACE + 0.002) },
  ]);
}

/** Bundles of keratin filaments in a cell of the skin, running to the desmosomes that join it to the next. */
export function buildKeratinBundle(): JourneyScene {
  const rng = random(20190429), group = new THREE.Group();
  group.add(body(3.4, '#ecd9c7', 1.2));
  bars(group, [rect(0.8, 0, 0.03, 3.4, FACE + 0.002)], '#b78f78');
  const plaques: Placement[] = [], threads: THREE.Vector3[][] = [];
  for (let k = -3; k <= 3; k++) {
    const y = k * 0.42;
    plaques.push(rect(0.76, y, 0.05, 0.13, FACE + 0.003), rect(0.84, y, 0.05, 0.13, FACE + 0.003));
    for (let i = 0; i < 20; i++) {
      const spread = (rng() - 0.5) * 0.34;
      threads.push([V(0.74, y + spread * 0.18, FACE + 0.004), V(0.2, y + spread * 0.7, FACE + 0.004), V(-0.5, y + spread + 0.1 * (rng() - 0.5), FACE + 0.004), V(-1.7, y + spread * 1.6, FACE + 0.004)]);
      threads.push([V(0.86, y + spread * 0.18, FACE + 0.004), V(1.3, y + spread * 0.9, FACE + 0.004), V(1.7, y + spread * 1.4, FACE + 0.004)]);
    }
  }
  tubes(group, threads, 0.003, '#a3825f', 3);
  bars(group, plaques, '#6d4f3a');
  return finish(group, V(0, 0, 0.2), V(threads[0][1].x, threads[0][1].y, FACE + 0.004), [
    { text: 'A bundle of keratin filaments', at: V(threads[0][1].x, threads[0][1].y, FACE + 0.004) },
    { text: 'A desmosome, joining two cells', at: V(0.8, 0.42, FACE + 0.004) },
    { text: 'Cell membranes', at: V(0.8, 0.21, FACE + 0.004) },
  ]);
}

/** Keratin filaments, each a rope of finer strands. */
export function buildKeratinFilament(): JourneyScene {
  const rng = random(20190430), group = new THREE.Group();
  group.add(body(4, '#efe0cf', 1.2));
  const ropes: THREE.Vector3[][] = [];
  for (let k = -9; k <= 9; k++) {
    const y = k * 0.19, wave = rng() * 6;
    for (let strand = 0; strand < 4; strand++) {
      const points: THREE.Vector3[] = [];
      for (let x = -2; x <= 2; x += 0.12) { const a = x * 12 + strand * 1.57; points.push(V(x, y + 0.03 * Math.sin(x * 1.4 + wave) + 0.011 * Math.sin(a), FACE + 0.006 + 0.006 * Math.cos(a))); }
      ropes.push(points);
    }
  }
  tubes(group, ropes, 0.006, '#a3825f', 4);
  const here = ropes[36][17];
  return finish(group, V(0, 0, 0.2), V(here.x, here.y, here.z + 0.002), [
    { text: 'A strand of keratin', at: V(here.x, here.y, here.z + 0.002) },
    { text: 'One filament, about 10 nanometres across', at: V(0.8, 0.19 * 3, FACE + 0.01) },
    { text: 'Cytoplasm between the filaments', at: V(-0.72, 0.095, FACE + 0.001) },
  ]);
}

/** Sheets of rough endoplasmic reticulum studded with ribosomes, and others free between them. */
export function buildRoughReticulum(): JourneyScene {
  const rng = random(19750801), group = new THREE.Group();
  group.add(body(3.4, '#ecdccd', 1.2));
  const HALF = 0.035, PITCH = 0.29, walls: Placement[] = [], insides: Placement[] = [], ribosomes: Placement[] = [];
  const dot = (x: number, y: number) => ribosomes.push(ball(x, y, 0.008, FACE + 0.002, shade('#a8796a', 0.86 + rng() * 0.28)));
  for (let k = -5; k <= 5; k++) {
    walls.push(rect(0, k * PITCH, 3.4, HALF * 2 + 0.012));
    insides.push(rect(0, k * PITCH, 3.4, HALF * 2, FACE + 0.001));
    for (let i = -85; i <= 85; i++) for (const side of [-1, 1]) if (rng() < 0.82) dot(i * 0.02 + (rng() - 0.5) * 0.005, k * PITCH + side * (HALF + 0.014));
  }
  for (let i = 0; i < 320; i++) dot((rng() - 0.5) * 3.3, (Math.floor(rng() * 10) - 4.5) * PITCH + (rng() - 0.5) * 0.11);
  const chosen = V(0, HALF + 0.014, FACE + 0.002);
  dot(chosen.x, chosen.y);
  bars(group, walls, '#b89a84');
  bars(group, insides, '#f5ecdc');
  flats(group, ribosomes, '#ffffff', 0);
  mitochondria(group, [{ x: -1.05, y: PITCH * 1.5, length: 0.24, width: 0.06, angle: 0.03 }, { x: 0.95, y: -PITCH * 2.5, length: 0.26, width: 0.06, angle: -0.04 }], FACE + 0.003);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'One ribosome', at: chosen },
    { text: 'Inside a sheet', at: V(0.8, PITCH, FACE + 0.002) },
    { text: 'Mitochondrion', at: V(-1.05, PITCH * 1.5, FACE + 0.004) },
  ]);
}

/** Ribosomes on the membrane of the reticulum, several along one messenger RNA, each passing a new protein through it. */
export function buildRibosomesOnMembrane(): JourneyScene {
  const rng = random(20221214), group = new THREE.Group();
  group.add(body(4, '#ecdccd', 1.2));
  const FLOOR = -0.42, large: Placement[] = [], small: Placement[] = [], chains: THREE.Vector3[][] = [], thread: THREE.Vector3[] = [];
  bars(group, [rect(0, FLOOR - 1, 4, 2, FACE, new THREE.Color('#f5ecdc')), rect(0, FLOOR, 4, 0.024, FACE + 0.001, new THREE.Color('#b89a84'))], '#ffffff');
  const pair = (x: number, y: number, turn: number) => {
    large.push(oval(x, y, 0.05, 0.042, turn, FACE + 0.002, shade('#a8796a', 0.88 + rng() * 0.24)));
    small.push(oval(x - 0.046 * Math.sin(turn), y + 0.046 * Math.cos(turn), 0.04, 0.024, turn, FACE + 0.003, shade('#cda696', 0.88 + rng() * 0.24)));
  };
  for (let i = -19; i <= 19; i++) {
    const x = i * 0.105 + (i ? (rng() - 0.5) * 0.012 : 0), y = FLOOR + 0.05, reach = 0.16 + rng() * 0.3, sway = (rng() - 0.5) * 0.12;
    pair(x, y, 0);
    chains.push([V(x, FLOOR + 0.01, FACE + 0.002), V(x + sway * 0.3, FLOOR - reach * 0.45, FACE + 0.002), V(x + sway * 0.7, FLOOR - reach * 0.75, FACE + 0.002), V(x + sway, FLOOR - reach, FACE + 0.002)]);
  }
  for (let t = 0; t <= 80; t++) thread.push(V(-2 + t * 0.05, FLOOR + 0.098 + 0.008 * Math.sin(t * 1.7), FACE + 0.005));
  for (let i = 0; i < 150; i++) pair((rng() - 0.5) * 3.8, FLOOR + 0.3 + rng() * 2, rng() * 6.28);
  flats(group, large, '#ffffff', 2);
  flats(group, small, '#ffffff', 2);
  tubes(group, chains, 0.005, '#7a6a9c', 3);
  tubes(group, [thread], 0.005, '#8c4a6a', 3);
  const chosen = V(0, FLOOR + 0.065, FACE + 0.004);
  return finish(group, V(0, -0.2, 0.2), chosen, [
    { text: 'One ribosome', at: chosen },
    { text: 'Messenger RNA', at: V(0.3, FLOOR + 0.098, FACE + 0.006) },
    { text: 'Membrane of the sheet', at: V(-0.3, FLOOR, FACE + 0.002) },
    { text: 'A new protein', at: V(0.21, FLOOR - 0.1, FACE + 0.003) },
  ]);
}

/** The top of a follicular cell of the thyroid, with microvilli reaching into the stored colloid. */
export function buildFollicleEdge(): JourneyScene {
  const rng = random(20211029), group = new THREE.Group();
  group.add(body(3.4, '#ecd9a8', 1.2));
  const TOP = -0.5;
  bars(group, [rect(0, TOP - 0.7, 3.4, 1.4)], '#ecdccf');
  const villi: Placement[] = [];
  for (let i = -60; i <= 60; i++) { const length = 0.1 + rng() * 0.1; villi.push(rect(i * 0.028, TOP + length / 2, 0.012, length)); }
  bars(group, villi, '#d9bfa8');
  const reticulum: THREE.Vector3[][] = [];
  for (let k = 0; k < 7; k++) { const y = TOP - 0.28 - k * 0.11, from = -1.5 + rng() * 0.8; reticulum.push(line(from, y, from + 1.1 + rng() * 1.4, y + (rng() - 0.5) * 0.05, FACE + 0.001)); }
  tubes(group, reticulum, 0.012, '#c9ab98', 3);
  mitochondria(group, [{ x: -0.8, y: TOP - 0.2, length: 0.2, width: 0.05, angle: 0.1 }, { x: 0.75, y: TOP - 0.24, length: 0.22, width: 0.05, angle: -0.08 }], FACE + 0.002);
  const chosen = V(0, 0.3, FACE + 0.001);
  return finish(group, V(0, -0.1, 0.2), chosen, [
    { text: 'Stored colloid', at: chosen },
    { text: 'Microvilli of the cell', at: V(0.9, TOP + 0.08, FACE + 0.001) },
    { text: 'Top of a follicular cell', at: V(-0.7, TOP - 0.5, FACE + 0.001) },
  ]);
}

/** Thyroglobulin crowded in the colloid, each a dimer of two parts. */
export function buildColloid(): JourneyScene {
  const rng = random(20220502), group = new THREE.Group();
  group.add(body(4, '#f1e4bd', 1.2));
  const parts: Placement[] = [], places = packed(2, 0.1, 0.03, rng);
  const nearest = places.reduce((best, place) => Math.hypot(place.x, place.y) < Math.hypot(best.x, best.y) ? place : best);
  const chosen = V(nearest.x, nearest.y, FACE + 0.003);
  for (const { x, y } of places) {
    const angle = rng() * 6.28;
    for (const side of [-1, 1]) parts.push(oval(x + side * 0.018 * Math.cos(angle), y + side * 0.018 * Math.sin(angle), 0.021, 0.016, angle, FACE + 0.002, shade('#c79a63', 0.86 + rng() * 0.28)));
  }
  flats(group, parts, '#ffffff', 2);
  // The tip of a microvillus and the top of the cell lie at one edge, over the crowd.
  bars(group, [rect(0, -0.62, 4, 0.24, FACE + 0.004), rect(-0.34, -0.42, 0.05, 0.3, FACE + 0.004), rect(0.3, -0.44, 0.05, 0.26, FACE + 0.004), rect(1.1, -0.4, 0.05, 0.32, FACE + 0.004), rect(-1.05, -0.45, 0.05, 0.28, FACE + 0.004)], '#ecdccf');
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'One thyroglobulin, among many', at: chosen },
    { text: 'A microvillus', at: V(0.3, -0.38, FACE + 0.005) },
    { text: 'Top of the cell', at: V(-0.3, -0.62, FACE + 0.005) },
  ]);
}

/** Two cells of a lining side by side, closed near their free surface by a tight junction. */
export function buildCellJunction(): JourneyScene {
  const rng = random(20140418), group = new THREE.Group();
  group.add(body(3.4, '#f3efe6', 1.2));
  const TOP = 0.62, GAP = 0.003, WIDE = 1.7 - GAP;
  bars(group, [rect(-(WIDE + GAP * 2) / 2, TOP - 1.6, WIDE, 3.2), rect((WIDE + GAP * 2) / 2, TOP - 1.6, WIDE, 3.2)], '#ecdccf');
  const villi: Placement[] = [];
  for (let i = -58; i <= 58; i++) if (i) { const length = 0.1 + rng() * 0.05; villi.push(rect(i * 0.029, TOP + length / 2, 0.012, length)); }
  bars(group, villi, '#d9bfa8');
  flats(group, [oval(-0.86, -0.95, 0.42, 0.34, 0, FACE + 0.001), oval(0.86, -0.95, 0.42, 0.34, 0, FACE + 0.001)], '#b89fb4', 4);
  mitochondria(group, [{ x: -0.26, y: 0.2, length: 0.13, width: 0.04, angle: 0.6 }, { x: 0.3, y: 0.1, length: 0.15, width: 0.04, angle: -0.5 }, { x: 0.36, y: 0.44, length: 0.11, width: 0.035, angle: 0.2 }], FACE + 0.002);
  const reticulum: THREE.Vector3[][] = [], vesicles: Placement[] = [];
  for (let k = 0; k < 16; k++) { const x = (k % 2 ? 1 : -1) * (0.08 + rng() * 0.6), y = 0.05 + rng() * 0.42; reticulum.push(line(x, y, x + (rng() - 0.5) * 0.22, y + (rng() - 0.5) * 0.1, FACE + 0.001)); }
  for (let i = 0; i < 90; i++) { const x = (rng() - 0.5) * 1.6, y = -0.05 + rng() * 0.62; if (Math.abs(x) > 0.02) vesicles.push(ball(x, y, 0.006 + rng() * 0.006, FACE + 0.001, shade('#c9ab98', 0.9 + rng() * 0.2))); }
  tubes(group, reticulum, 0.006, '#c9ab98', 3);
  flats(group, vesicles, '#ffffff', 0);
  const chosen = V(0, TOP - 0.06, FACE + 0.004);
  bars(group, [rect(0, chosen.y, 0.026, 0.07, FACE + 0.003)], '#9c5540');
  return finish(group, V(0, 0.4, 0.2), chosen, [
    { text: 'A tight junction', at: chosen },
    { text: 'Free surface of the lining', at: V(0.8, TOP + 0.22, FACE + 0.001) },
    { text: 'The next cell', at: V(0.2, 0.3, FACE + 0.001) },
    { text: 'Mitochondrion', at: V(-0.26, 0.2, FACE + 0.003) },
  ]);
}

/** The face of a membrane at a tight junction, with claudins in rows that branch and rejoin. */
export function buildJunctionStrands(): JourneyScene {
  const rng = random(20101820), group = new THREE.Group();
  group.add(body(4, '#eadfd2', 1.2));
  const claudins: Placement[] = [];
  const shape = (row: number) => { const phase = 1.3 * row; return (x: number) => row * 0.33 + 0.06 * Math.sin(x * 2.2 + phase) + 0.03 * Math.sin(x * 5.1 + phase * 2); };
  const dot = (x: number, y: number) => claudins.push(ball(x, y, 0.0085, FACE + 0.002, shade('#7fa3c9', 0.86 + rng() * 0.28)));
  for (let row = -6; row <= 6; row++) { const at = shape(row); for (let x = -2; x <= 2; x += 0.016) dot(x, at(x)); }
  for (let i = 0; i < 60; i++) {
    const row = Math.floor(rng() * 12) - 6, x0 = (rng() - 0.5) * 3.8, x1 = x0 + (rng() - 0.5) * 0.3, from = shape(row)(x0), to = shape(row + 1)(x1);
    const steps = Math.ceil(Math.hypot(x1 - x0, to - from) / 0.016);
    for (let s = 1; s < steps; s++) dot(x0 + (x1 - x0) * s / steps, from + (to - from) * s / steps);
  }
  flats(group, claudins, '#ffffff', 0);
  const chosen = V(0, shape(0)(0), FACE + 0.003);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'A claudin, in a strand', at: chosen },
    { text: 'Another strand', at: V(-0.7, shape(2)(-0.7), FACE + 0.003) },
    { text: 'Membrane of the cell', at: V(0.75, 0.165, FACE + 0.001) },
  ]);
}

/** The thin rim of cytoplasm beside the large nucleus of a lymphocyte, with proteasomes through it. */
export function buildLymphocyteRim(): JourneyScene {
  const rng = random(20120217), group = new THREE.Group();
  group.add(body(3.4, '#efe3da', 1.2));
  flats(group, [oval(0, -3.1, 3.2, 3.2, 0, FACE + 0.001)], '#a58fa9', 7);
  flats(group, [oval(0, -3.1, 3.13, 3.13, 0, FACE + 0.002)], '#b7a4ba', 7);
  bars(group, [rect(0, 1.42, 3.4, 0.56, FACE + 0.001)], '#f6f2ec');
  bars(group, [rect(0, 1.13, 3.4, 0.022, FACE + 0.002)], '#c9ab98');
  const dots: Placement[] = [];
  for (let i = 0; i < 620; i++) { const x = (rng() - 0.5) * 3.3, y = 0.16 + rng() * 0.95; if (Math.hypot(x, y + 3.1) > 3.25) dots.push(ball(x, y, 0.0065, FACE + 0.002, shade('#7fa3c9', 0.86 + rng() * 0.28))); }
  const chosen = V(0, 0.6, FACE + 0.003);
  dots.push(ball(chosen.x, chosen.y, 0.0065, chosen.z, new THREE.Color('#f28a2c')));
  flats(group, dots, '#ffffff', 0);
  mitochondria(group, [{ x: -0.9, y: 0.72, length: 0.22, width: 0.06, angle: 0.15 }, { x: 0.95, y: 0.82, length: 0.24, width: 0.06, angle: -0.2 }], FACE + 0.003);
  return finish(group, V(0, 0.2, 0.2), chosen, [
    { text: 'One proteasome, among many', at: chosen },
    { text: 'Nucleus', at: V(0.3, -0.2, FACE + 0.003) },
    { text: 'Edge of the cell', at: V(-0.6, 1.13, FACE + 0.003) },
  ]);
}

/** Proteasomes among the contents of the cytoplasm: barrels of four rings, each two outer and two inner. */
export function buildProteasomes(): JourneyScene {
  const rng = random(20120218), group = new THREE.Group();
  group.add(body(4, '#efe6dd', 1.2));
  const outer: Placement[] = [], inner: Placement[] = [], others: Placement[] = [];
  const barrel = (x: number, y: number, angle: number) => {
    const along = V(-Math.sin(angle), Math.cos(angle), 0);
    for (const [offset, into] of [[-0.006, inner], [0.006, inner], [-0.019, outer], [0.019, outer]] as const) {
      into.push(oval(x + along.x * offset, y + along.y * offset, 0.019, 0.0066, angle, FACE + 0.003, shade(into === outer ? '#7fa3c9' : '#74ab6d', 0.88 + rng() * 0.24)));
    }
  };
  barrel(0, 0, 0);
  for (const { x, y } of packed(2, 0.2, 0.09, rng)) if (Math.hypot(x, y) > 0.12) barrel(x, y, rng() * 6.28);
  for (let i = 0; i < 2400; i++) { const x = (rng() - 0.5) * 3.9, y = (rng() - 0.5) * 3.9; if (Math.hypot(x, y) > 0.05) others.push(ball(x, y, 0.012 + rng() * 0.012, FACE + 0.001, shade('#d4c6b8', 0.86 + rng() * 0.28))); }
  flats(group, others, '#ffffff', 1);
  flats(group, outer, '#ffffff', 2);
  flats(group, inner, '#ffffff', 2);
  const chosen = V(0, 0, FACE + 0.004);
  return finish(group, V(0, 0, 0.2), chosen, [
    { text: 'One immunoproteasome', at: chosen },
    { text: 'An outer ring', at: V(0, 0.019, FACE + 0.004) },
    { text: 'Other contents of the cytoplasm', at: V(0.9, 0.62, FACE + 0.002) },
  ]);
}


export const ORGANELLE_BUILDERS: Readonly<Record<string, () => JourneyScene>> = Object.freeze({
  'mitochondrion-close': buildMitochondrion, 'mitochondrion-fine': buildCrista,
  'sarcomere-close': buildSarcomeres, 'sarcomere-fine': buildFilaments,
  'collagen-close': buildCollagenFibrils, 'collagen-fine': buildCollagenBands,
  'synapse-close': buildSynapse, 'synapse-fine': buildCleft,
  'axon-close': buildNode, 'axon-fine': buildAxonMembrane,
  'antibody-close': buildPlasmaCell, 'antibody-fine': buildEndoplasmic,
  'droplet-close': buildDropletEdge, 'droplet-fine': buildDropletSurface,
  'disc-close': buildRodOuter, 'disc-fine': buildDiscs,
  'crystallin-close': buildLensFibre, 'crystallin-fine': buildCrystallinCrowd,
  'water-close': buildBrushBorder, 'water-fine': buildMicrovillus,
  'secretion-close': buildSecretoryRoute, 'secretion-fine': buildVesicle,
  'surfactant-close': buildLamellarBody, 'surfactant-fine': buildLamellae,
  'cilium-close': buildCiliaRow, 'cilium-fine': buildAxonemeSection,
  'pump-close': buildParietal, 'pump-fine': buildPumpMembrane,
  'keratin-close': buildKeratinBundle, 'keratin-fine': buildKeratinFilament,
  'ribosome-close': buildRoughReticulum, 'ribosome-fine': buildRibosomesOnMembrane,
  'thyroglobulin-close': buildFollicleEdge, 'thyroglobulin-fine': buildColloid,
  'junction-close': buildCellJunction, 'junction-fine': buildJunctionStrands,
  'proteasome-close': buildLymphocyteRim, 'proteasome-fine': buildProteasomes,
});

/** A way on from the cells of a tissue. It starts at something the scene already names, or at a small mark drawn beside the nucleus. */
interface Way { readonly tail: JourneyTail; readonly text: string; readonly label?: string; readonly keep?: boolean; readonly near?: readonly [number, number]; readonly mark?: 'mitochondrion' | 'dot' }

const MITOCHONDRION = (near: readonly [number, number]): Way => ({ tail: 'mitochondrion', text: 'A mitochondrion', near, mark: 'mitochondrion' });

const WAYS: Readonly<Record<string, readonly Way[]>> = Object.freeze({
  cell: [{ tail: 'keratin', text: 'Keratin filaments', label: 'Keratin filaments' }, { tail: 'mitochondrion', text: 'A mitochondrion', label: 'Mitochondrion' }],
  'muscle-fibres': [{ tail: 'sarcomere', text: 'A sarcomere', label: 'Bands of sarcomeres' }, MITOCHONDRION([0.09, 0.05])],
  'heart-cells': [{ tail: 'sarcomere', text: 'A sarcomere', near: [-0.14, 0.03], mark: 'dot' }, MITOCHONDRION([0.1, 0.05])],
  'nerve-fibres': [{ tail: 'axon', text: 'Along the axon', label: 'Axon' }],
  'artery-wall': [{ tail: 'collagen', text: 'Collagen', label: 'Outer coat of collagen' }],
  'vein-wall': [{ tail: 'collagen', text: 'Collagen', label: 'Outer coat of collagen' }],
  'bone-cells': [{ tail: 'collagen', text: 'Collagen of the bone', label: 'Lamellae of bone' }],
  'tendon-cells': [{ tail: 'collagen', text: 'A collagen fibre', label: 'Collagen fibre' }],
  'cartilage-cells': [{ tail: 'collagen', text: 'Collagen of the matrix', label: 'Matrix, with no vessels' }],
  'cornea-cells': [{ tail: 'collagen', text: 'Collagen of the stroma', label: 'Collagen lamellae of the stroma' }],
  'fat-cells': [{ tail: 'droplet', text: 'The edge of a droplet', label: 'Thin rim of cytoplasm' }],
  'liver-cells': [{ tail: 'secretion', text: 'What the cell secretes', near: [-0.09, -0.05], mark: 'dot' }, MITOCHONDRION([0.08, 0.06])],
  'kidney-cells': [{ tail: 'water', text: 'Water channels of the brush border', label: 'Brush border' }, MITOCHONDRION([0.07, -0.05])],
  'lung-cells': [{ tail: 'surfactant', text: 'Lamellar bodies', near: [0.08, 0.06], mark: 'dot' }],
  'gut-cells': [MITOCHONDRION([0.07, 0.05]), { tail: 'junction', text: 'A tight junction', near: [-0.08, 0.06], mark: 'dot' }],
  'colon-cells': [MITOCHONDRION([0.07, 0.05])],
  'brain-cells': [{ tail: 'synapse', text: 'A synapse', label: 'Spines on a dendrite' }, MITOCHONDRION([0.09, -0.06])],
  'lymphoid-cells': [{ tail: 'antibody', text: 'A plasma cell', near: [0.1, 0.08], mark: 'dot' }, { tail: 'proteasome', text: 'Inside a lymphocyte', near: [-0.1, -0.07], mark: 'dot' }],
  'retina-cells': [{ tail: 'disc', text: 'Discs of a rod', label: 'Stacked discs of a rod outer segment' }],
  'lens-cells': [{ tail: 'crystallin', text: 'Inside a fibre', label: 'Fibres cut across, closely packed, with no nuclei' }],
  'stomach-cells': [{ tail: 'pump', text: 'The acid pump', near: [-0.09, -0.06], mark: 'dot' }, { tail: 'mitochondrion', text: 'A mitochondrion', label: 'Mitochondria' }],
  'airway-cells': [{ tail: 'cilium', text: 'A cilium', label: 'Cilia' }, MITOCHONDRION([0.07, -0.05])],
  'gland-cells': [{ tail: 'ribosome', text: 'Ribosomes', near: [-0.08, -0.05], mark: 'dot' }, MITOCHONDRION([0.07, 0.05])],
  'endocrine-cells': [{ tail: 'ribosome', text: 'Ribosomes', near: [-0.08, -0.05], mark: 'dot' }, MITOCHONDRION([0.07, 0.05])],
  'thyroid-cells': [{ tail: 'thyroglobulin', text: 'The colloid', label: 'Stored colloid' }, MITOCHONDRION([0.07, 0.05])],
  'urothelium-cells': [{ tail: 'junction', text: 'A tight junction', near: [-0.08, 0.06], mark: 'dot' }, MITOCHONDRION([0.07, 0.05])],
  'tooth-cells': [{ tail: 'collagen', text: 'Collagen of the dentine', label: 'Dentine' }, MITOCHONDRION([0.07, 0.05])],
  'testis-cells': [{ tail: 'ribosome', text: 'Ribosomes of a forming sperm', label: 'Round spermatids', keep: true }, MITOCHONDRION([0.07, 0.05])],
  'membrane-cells': [{ tail: 'junction', text: 'A tight junction', near: [-0.08, 0.05], mark: 'dot' }, MITOCHONDRION([0.07, 0.04])],
  bacterium: [{ tail: 'importer', text: 'A nutrient importer in the outer membrane', label: 'Outer membrane, wall and inner membrane', keep: true }],
});

/** The ways on from a level, added to its scene. A mark is small and lies beside the nucleus, since the scenes of cells are drawn at far too small a scale to show a mitochondrion otherwise. */
export function withWays(levelId: string, scene: JourneyScene): JourneyScene {
  const ways = WAYS[levelId];
  if (!ways) return scene;
  let labels: readonly JourneyLabel[] = scene.labels;
  const branches = [...(scene.branches ?? [])];
  for (const way of ways) {
    const named = way.label ? labels.find((item) => item.text === way.label) : undefined;
    if (way.label && !named) throw new Error(`No label ${way.label} on ${levelId}`);
    if (named && !way.keep) labels = labels.filter((item) => item !== named);
    const offset = way.near ?? [0, 0];
    const at = named ? named.at.clone() : scene.focus.clone().add(V(offset[0], offset[1], 0.004));
    if (way.mark === 'mitochondrion') {
      mitochondria(scene.group, [{ x: at.x, y: at.y, length: 0.024, width: 0.011, angle: 0.5 }], at.z);
    } else if (way.mark === 'dot') {
      const dots: Placement[] = [];
      for (let i = 0; i < 7; i++) { const a = i * 0.9; dots.push(ball(at.x + 0.012 * i * 0.3 * Math.cos(a), at.y + 0.012 * i * 0.3 * Math.sin(a), 0.006, at.z)); }
      flats(scene.group, dots, '#b5764c', 1);
    }
    branches.push({ tail: way.tail, text: way.text, at });
  }
  return { ...scene, labels, branches, homeTail: levelId === 'bacterium' ? 'microbiota' : scene.homeTail };
}

/** The levels that have ways on, for checks. */
export const WAY_LEVELS: readonly string[] = Object.freeze(Object.keys(WAYS));
