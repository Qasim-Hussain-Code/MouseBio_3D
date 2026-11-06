import * as THREE from 'three';
import { instances, material, merged, random, shade, solid, sphere, tubeGeometry, uniform, V, type JourneyLabel, type JourneyScene, type Placement } from './scale-journey-scenes';

/**
 * The first two levels of the zoom into a tissue other than skin: a block about 1.6 mm across, and a view of its cells about 70 micrometres across.
 * Each scene is in units of its reference length, and leads to a cell nucleus, where every route joins the shared levels. All positions, counts and
 * sizes are generated with a fixed seed to illustrate published descriptions, and none is a measurement. Rods run along z, so the face towards the viewer is a cross section.
 */
const ALONG_Z = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2);
const NUCLEUS_COLOUR = '#8f76ad';

interface Rod { readonly x: number; readonly y: number; readonly radius: number; readonly color?: THREE.Color; readonly front?: number; readonly length?: number }

/** Cylinders along z, ending at the front face. */
function rods(items: readonly Rod[], made: THREE.Material, length = 1, front = 0.5, sides = 10): THREE.InstancedMesh {
  return instances(new THREE.CylinderGeometry(1, 1, 1, sides), made, items.map((item) => {
    const span = item.length ?? length, end = item.front ?? front;
    return { position: V(item.x, item.y, end - span / 2), scale: V(item.radius, span, item.radius), rotation: ALONG_Z, color: item.color };
  }));
}

function body(size: number, color: string, depth = size): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, depth), material(color));
  mesh.position.z = 0.5 - depth / 2;
  return mesh;
}

const finish = (group: THREE.Group, start: THREE.Vector3, focus: THREE.Vector3, labels: readonly JourneyLabel[], cut?: THREE.Plane): JourneyScene => ({ group, start, focus, labels, cut });

/** Hexagonally packed points in a square, for fibres and cells. */
function packed(half: number, pitch: number, jitter: number, rng: () => number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const rowHeight = pitch * Math.sqrt(3) / 2;
  for (let row = -Math.ceil(half / rowHeight); row <= Math.ceil(half / rowHeight); row++) {
    for (let column = -Math.ceil(half / pitch) - 1; column <= Math.ceil(half / pitch) + 1; column++) {
      const x = (column + (row % 2 ? 0.5 : 0)) * pitch + (rng() - 0.5) * jitter, y = row * rowHeight + (rng() - 0.5) * jitter;
      if (Math.abs(x) <= half && Math.abs(y) <= half) out.push({ x, y });
    }
  }
  return out;
}

/** Skeletal muscle cut across: fibres in fascicles, with capillaries between them and vessels and a nerve between the fascicles. */
export function buildMuscleBlock(): JourneyScene {
  const rng = random(19940801);
  const group = new THREE.Group();
  group.add(body(0.99, '#ead8cb'));
  const FASCICLES = 9;
  const centres = Array.from({ length: FASCICLES }, (_, i) => {
    const row = Math.floor(i / 3), column = i % 3;
    return { x: -0.33 + column * 0.33 + (rng() - 0.5) * 0.09, y: -0.33 + row * 0.33 + (rng() - 0.5) * 0.09 };
  });
  const fibres: Rod[] = [], capillaries: Rod[] = [];
  for (const point of packed(0.485, 0.026, 0.003, rng)) {
    const distances = centres.map((centre) => Math.hypot(point.x - centre.x, point.y - centre.y)).sort((a, b) => a - b);
    if (distances[1] - distances[0] < 0.03) continue;
    const tone = rng();
    // Fibres of several types: oxidative fibres are darker and smaller than glycolytic ones.
    const dark = tone < 0.35;
    fibres.push({ x: point.x, y: point.y, radius: dark ? 0.0098 : 0.0118, color: dark ? shade('#a8473f', 0.9 + rng() * 0.15) : shade('#c4655a', 0.92 + rng() * 0.14) });
    if (rng() < 0.75) capillaries.push({ x: point.x + 0.0128, y: point.y + 0.0072, radius: 0.0024 });
  }
  group.add(rods(fibres, material('#ffffff'), 0.99, 0.503));
  group.add(rods(capillaries, material('#8e1f26'), 0.99, 0.504, 6));
  // Between the fascicles.
  const gap = { x: (centres[0].x + centres[1].x) / 2, y: (centres[0].y + centres[3].y) / 2 };
  const placeArteriole = V(gap.x, gap.y, 0.5), placeVenule = V(gap.x + 0.05, gap.y - 0.01, 0.5), placeNerve = V(gap.x - 0.012, gap.y + 0.052, 0.5);
  group.add(rods([{ x: placeArteriole.x, y: placeArteriole.y, radius: 0.017 }], material('#d96a66'), 0.99, 0.503, 16));
  group.add(rods([{ x: placeArteriole.x, y: placeArteriole.y, radius: 0.008 }], material('#7c1a22'), 0.99, 0.505, 14));
  group.add(rods([{ x: placeVenule.x, y: placeVenule.y, radius: 0.023 }], material('#7d8cc0'), 0.99, 0.503, 16));
  group.add(rods([{ x: placeVenule.x, y: placeVenule.y, radius: 0.019 }], material('#3a4a86'), 0.99, 0.505, 14));
  group.add(rods([{ x: placeNerve.x, y: placeNerve.y, radius: 0.019 }], material('#e9d98f'), 0.99, 0.503, 14));
  const fibre = fibres[Math.floor(fibres.length * 0.62)];
  const focus = V(fibre.x, fibre.y, 0.5);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Muscle fibre', at: focus },
    { text: 'Arteriole', at: placeArteriole },
    { text: 'Venule', at: placeVenule },
    { text: 'Motor nerve', at: placeNerve },
    { text: 'Connective tissue between fascicles', at: V(centres[4].x + 0.17, centres[4].y + 0.17, 0.5) },
  ]);
}

/** Neighbouring muscle fibres: bands of sarcomeres on their sides, myofibrils on their cut ends, nuclei under the surface, capillaries, and a motor end plate. */
export function buildMuscleFibres(): JourneyScene {
  const rng = random(19940802);
  const group = new THREE.Group();
  const FIBRE = 0.3, SARCOMERE = 0.033;
  const between = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 1.3), material('#ead8cb'));
  between.position.set(0, 0.2, -0.17);
  group.add(between);
  const fibres = [{ x: -0.34, y: 0.2 }, { x: 0.34, y: 0.2 }, { x: 0, y: -0.38 }, { x: -0.68, y: -0.38 }, { x: 0.68, y: -0.38 }, { x: -0.68, y: 0.78 }, { x: 0.68, y: 0.78 }, { x: 0, y: 0.78 }];
  const dark: Placement[] = [], pale: Placement[] = [], dots: Placement[] = [];
  const LENGTH = 1.4;
  for (const fibre of fibres) {
    for (let z = 0.5; z > 0.5 - LENGTH; z -= SARCOMERE) {
      dark.push({ position: V(fibre.x, fibre.y, z - SARCOMERE * 0.35), scale: V(FIBRE, SARCOMERE * 0.7, FIBRE), rotation: ALONG_Z });
      pale.push({ position: V(fibre.x, fibre.y, z - SARCOMERE * 0.85), scale: V(FIBRE, SARCOMERE * 0.3, FIBRE), rotation: ALONG_Z });
    }
    // The cut end shows myofibrils, with a little sarcoplasm between them.
    for (const point of packed(FIBRE, 0.0245, 0.003, rng)) {
      if (Math.hypot(point.x, point.y) > FIBRE - 0.012) continue;
      dots.push({ position: V(fibre.x + point.x, fibre.y + point.y, 0.5015), scale: V(0.0095, 0.002, 0.0095), rotation: ALONG_Z });
    }
  }
  const cylinder = () => new THREE.CylinderGeometry(1, 1, 1, 28);
  group.add(instances(cylinder(), material('#a64a42'), dark));
  group.add(instances(cylinder(), material('#d9978a'), pale));
  group.add(instances(new THREE.CylinderGeometry(1, 1, 1, 7), material('#7e2f2b'), dots));
  // Nuclei lie just under the surface of the fibre.
  const nuclei: Placement[] = [];
  let focus = V(0, 0, 0);
  fibres.forEach((fibre, index) => {
    for (let k = 0; k < 3; k++) {
      const angle = (index === 0 && k === 0) ? 0.7 : rng() * Math.PI * 2;
      const z = (index === 0 && k === 0) ? 0.22 : 0.45 - rng() * 1.1;
      const position = V(fibre.x + Math.cos(angle) * (FIBRE - 0.006), fibre.y + Math.sin(angle) * (FIBRE - 0.006), z);
      nuclei.push({ position, scale: V(0.03, 0.03, 0.07) });
      if (index === 0 && k === 0) focus = position;
    }
  });
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  // Capillaries in the gaps, each with a line of red cells.
  const capillary = [V(0, 0.42, 0.52), V(0.01, 0.41, 0.1), V(-0.015, 0.43, -0.3), V(0.01, 0.41, -0.9)];
  const second = [V(0.34, -0.16, 0.52), V(0.33, -0.15, 0.05), V(0.35, -0.17, -0.5), V(0.33, -0.16, -0.9)];
  const capillaries = merged([tubeGeometry(capillary, 0.038, 12), tubeGeometry(second, 0.038, 12)]);
  group.add(new THREE.Mesh(capillaries, material('#d97c74')));
  const cells: Placement[] = [];
  for (const line of [capillary, second]) {
    const curve = new THREE.CatmullRomCurve3(line);
    for (let t = 0.06; t < 1; t += 0.13) cells.push({ position: curve.getPointAt(t).setZ(curve.getPointAt(t).z), scale: V(0.04, 0.04, 0.014) });
  }
  group.add(instances(sphere(2), material('#a51d24'), cells));
  // A motor end plate: the end of an axon in branches on the surface of a fibre.
  const plate = V(fibres[1].x - 0.02, fibres[1].y + FIBRE + 0.004, 0.1);
  const branches: THREE.BufferGeometry[] = [tubeGeometry([V(plate.x + 0.3, plate.y + 0.5, plate.z + 0.2), V(plate.x + 0.12, plate.y + 0.2, plate.z + 0.08), plate], 0.016, 8)];
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    branches.push(tubeGeometry([plate, V(plate.x + Math.cos(angle) * 0.05, plate.y - 0.002, plate.z + Math.sin(angle) * 0.05), V(plate.x + Math.cos(angle + 0.5) * 0.095, plate.y - 0.013, plate.z + Math.sin(angle + 0.5) * 0.095)], 0.009, 6));
  }
  group.add(new THREE.Mesh(merged(branches), material('#e9d98f')));
  return finish(group, V(0, 0.15, 0.2), focus, [
    { text: 'Nucleus under the surface of the fibre', at: focus },
    { text: 'Myofibrils', at: V(fibres[0].x - 0.08, fibres[0].y - 0.04, 0.5) },
    { text: 'Bands of sarcomeres', at: V(fibres[2].x + FIBRE, fibres[2].y, 0.02) },
    { text: 'Capillary', at: capillary[0] },
    { text: 'Motor end plate', at: plate },
  ]);
}

/** A peripheral nerve cut across: epineurium with fat and vessels, perineurium, and a fascicle packed with axons. */
export function buildNerveBlock(): JourneyScene {
  const rng = random(20080301);
  const group = new THREE.Group();
  group.add(body(0.99, '#eadfd3'));
  const OUTER = 0.3, FASCICLE = 0.215;
  group.add(rods([{ x: 0, y: 0, radius: OUTER }], material('#f1e6cf'), 0.99, 0.503, 48));
  // Fat cells in the epineurium.
  const fat: Placement[] = [];
  for (let i = 0; i < 70; i++) {
    const angle = rng() * Math.PI * 2, r = FASCICLE + 0.022 + rng() * 0.055;
    fat.push({ position: V(Math.cos(angle) * r, Math.sin(angle) * r, 0.5 + 0.004), scale: V(0.019, 0.019, 0.002) });
  }
  group.add(instances(sphere(1), material('#f4d98e'), fat));
  group.add(rods([{ x: 0, y: 0, radius: FASCICLE }], material('#94826f'), 0.99, 0.505, 48));
  group.add(rods([{ x: 0, y: 0, radius: FASCICLE - 0.007 }], material('#efe3d6'), 0.99, 0.506, 48));
  const myelin: Rod[] = [], axons: Rod[] = [];
  for (const point of packed(FASCICLE, 0.0088, 0.002, rng)) {
    if (Math.hypot(point.x, point.y) > FASCICLE - 0.012 || rng() < 0.28) continue;
    const radius = 0.0018 + rng() * 0.0022;
    myelin.push({ x: point.x, y: point.y, radius, length: 0.002 });
    axons.push({ x: point.x, y: point.y, radius: radius * 0.68, length: 0.002 });
  }
  group.add(rods(myelin, material('#3a332b'), 0.002, 0.5075, 8));
  group.add(rods(axons, material('#efe4c8'), 0.002, 0.5085, 8));
  // Vessels of the nerve.
  const vessels: Rod[] = [{ x: 0.24, y: 0.1, radius: 0.013 }, { x: -0.2, y: -0.2, radius: 0.016 }, { x: -0.1, y: 0.25, radius: 0.012 }, { x: 0.05, y: -0.05, radius: 0.004 }, { x: -0.09, y: 0.1, radius: 0.004 }];
  group.add(rods(vessels, material('#b23a3f'), 0.99, 0.5095, 12));
  const focus = V(axons[Math.floor(axons.length * 0.55)].x, axons[Math.floor(axons.length * 0.55)].y, 0.5);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Epineurium', at: V(0.05, 0.27, 0.51) },
    { text: 'Perineurium', at: V(FASCICLE * 0.71, -FASCICLE * 0.71, 0.51) },
    { text: 'Axons in the endoneurium', at: focus },
    { text: 'Vessel of the nerve', at: V(0.24, 0.1, 0.51) },
    { text: 'Fat in the epineurium', at: V(fat[3].position.x, fat[3].position.y, 0.51) },
  ]);
}

/** Inside a fascicle: myelinated axons, groups of small unmyelinated axons in Remak bundles, Schwann cell nuclei, and a capillary. */
export function buildNerveFibres(): JourneyScene {
  const rng = random(20080302);
  const group = new THREE.Group();
  group.add(body(2.2, '#efe5d8', 1.2));
  const myelin: Rod[] = [], axon: Rod[] = [], taken: { x: number; y: number; radius: number }[] = [];
  const free = (x: number, y: number, radius: number) => taken.every((item) => Math.hypot(item.x - x, item.y - y) > item.radius + radius + 0.012);
  // A capillary and a Schwann cell with its nucleus are placed first, near the middle.
  const fibreAt = { x: 0.08, y: 0.03, radius: 0.13 };
  taken.push(fibreAt, { x: -0.42, y: 0.28, radius: 0.09 });
  myelin.push({ x: fibreAt.x, y: fibreAt.y, radius: fibreAt.radius });
  axon.push({ x: fibreAt.x, y: fibreAt.y, radius: fibreAt.radius * 0.68 });
  for (let tries = 0; tries < 2600; tries++) {
    const x = (rng() - 0.5) * 2.1, y = (rng() - 0.5) * 2.1, radius = 0.035 + rng() * rng() * 0.11;
    if (!free(x, y, radius)) continue;
    taken.push({ x, y, radius });
    if (rng() < 0.74) { myelin.push({ x, y, radius }); axon.push({ x, y, radius: radius * (0.62 + rng() * 0.12) }); }
  }
  group.add(rods(myelin, material('#2f2822'), 1.2, 0.502, 22));
  group.add(rods(axon, material('#f3ebd2'), 1.2, 0.504, 18));
  // Remak bundles: several small axons within one Schwann cell.
  const bundles: Rod[] = [], small: Rod[] = [];
  for (let tries = 0; tries < 420 && bundles.length < 26; tries++) {
    const x = (rng() - 0.5) * 2.1, y = (rng() - 0.5) * 2.1, radius = 0.05 + rng() * 0.025;
    if (!free(x, y, radius)) continue;
    taken.push({ x, y, radius });
    bundles.push({ x, y, radius });
    for (let k = 0; k < 8; k++) small.push({ x: x + Math.cos(k * 2.4) * radius * 0.62 * Math.sqrt(k / 8), y: y + Math.sin(k * 2.4) * radius * 0.62 * Math.sqrt(k / 8), radius: radius * 0.17 });
  }
  group.add(rods(bundles, material('#d6c7ae'), 1.2, 0.503, 14));
  group.add(rods(small, material('#f6efdc'), 1.2, 0.505, 8));
  // A capillary.
  group.add(rods([{ x: -0.42, y: 0.28, radius: 0.09 }], material('#d97c74'), 1.2, 0.503, 22));
  group.add(rods([{ x: -0.42, y: 0.28, radius: 0.066 }], material('#8e1f26'), 1.2, 0.505, 20));
  // The nucleus of the Schwann cell that makes the myelin of the middle fibre, lying against it.
  const angle = 0.8;
  const focus = V(fibreAt.x + Math.cos(angle) * (fibreAt.radius + 0.018), fibreAt.y + Math.sin(angle) * (fibreAt.radius + 0.018), 0.5);
  const nucleus = new THREE.Mesh(sphere(3), material(NUCLEUS_COLOUR));
  nucleus.position.copy(focus);
  nucleus.scale.set(0.03, 0.03, 0.05);
  group.add(nucleus);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a Schwann cell', at: focus },
    { text: 'Myelin', at: V(fibreAt.x - fibreAt.radius * 0.84, fibreAt.y, 0.505) },
    { text: 'Axon', at: V(fibreAt.x, fibreAt.y - 0.04, 0.505) },
    { text: 'Small axons in a Remak bundle', at: V(bundles[0].x, bundles[0].y, 0.505) },
    { text: 'Capillary', at: V(-0.42, 0.28, 0.505) },
  ]);
}

/** A femoral artery, vein and saphenous nerve in their connective tissue, as they lie together in the thigh. */
export function buildVesselBlock(route: 'artery' | 'vein'): JourneyScene {
  const rng = random(route === 'artery' ? 20131230 : 20131231);
  const group = new THREE.Group();
  group.add(body(0.99, '#ecdcc9'));
  const fat: Placement[] = [];
  for (const point of packed(0.49, 0.054, 0.012, rng)) fat.push({ position: V(point.x, point.y, 0.502), scale: V(0.024, 0.024, 0.002) });
  group.add(instances(sphere(1), material('#f4dc95'), fat));
  const artery = { x: -0.17, y: 0.03 }, vein = { x: 0.17, y: -0.02 }, nerve = { x: -0.02, y: 0.27 };
  const AR = 0.105, VR = 0.17;
  group.add(rods([{ x: artery.x, y: artery.y, radius: AR }], material('#efe3d3'), 0.99, 0.504, 40));
  group.add(rods([{ x: artery.x, y: artery.y, radius: AR * 0.84 }], material('#c8605a'), 0.99, 0.505, 40));
  group.add(rods([{ x: artery.x, y: artery.y, radius: AR * 0.6 }], material('#7c141c'), 0.99, 0.506, 40));
  group.add(rods([{ x: vein.x, y: vein.y, radius: VR }], material('#dfe0e6'), 0.99, 0.504, 40));
  group.add(rods([{ x: vein.x, y: vein.y, radius: VR * 0.94 }], material('#8e9ac4'), 0.99, 0.505, 40));
  group.add(rods([{ x: vein.x, y: vein.y, radius: VR * 0.87 }], material('#2e3a6e'), 0.99, 0.506, 40));
  group.add(rods([{ x: nerve.x, y: nerve.y, radius: 0.062 }], material('#e9d98f'), 0.99, 0.504, 24));
  // Red cells in the blood of both vessels.
  const cells: Placement[] = [];
  for (let i = 0; i < 260; i++) {
    const inArtery = i % 3 === 0;
    const r = (inArtery ? AR * 0.56 : VR * 0.83) * Math.sqrt(rng()), angle = rng() * Math.PI * 2;
    cells.push({ position: V((inArtery ? artery.x : vein.x) + Math.cos(angle) * r, (inArtery ? artery.y : vein.y) + Math.sin(angle) * r, 0.5075), scale: V(0.0045, 0.0045, 0.001) });
  }
  group.add(instances(sphere(1), material('#d6333c'), cells));
  const wallOfArtery = V(artery.x + AR * 0.72, artery.y, 0.5), wallOfVein = V(vein.x - VR * 0.9, vein.y, 0.5);
  return finish(group, V(0, 0.02, 0.2), route === 'artery' ? wallOfArtery : wallOfVein, [
    { text: route === 'artery' ? 'Femoral artery, thick wall' : 'Femoral artery', at: V(artery.x, artery.y + AR * 0.72, 0.51) },
    { text: route === 'vein' ? 'Femoral vein, thin wall' : 'Femoral vein', at: V(vein.x, vein.y + VR * 0.9, 0.51) },
    { text: 'Saphenous nerve', at: V(nerve.x, nerve.y, 0.51) },
    { text: 'Fat and connective tissue', at: V(0.36, 0.36, 0.51) },
  ]);
}

/** A wavy sheet across the wall, as an elastic lamina. */
function lamina(y: number, thickness: number, color: string, phase: number): THREE.Mesh {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) points.push(V(-1.2 + i * 2.4 / 96, y + Math.sin(i * 0.42 + phase) * 0.012, 0.5));
  return new THREE.Mesh(tubeGeometry(points, thickness / 2, 6, 1), material(color));
}

/** The wall of a vessel cut across, from the blood upwards. An artery has layers of smooth muscle between elastic laminae; a vein has few. */
export function buildVesselWall(route: 'artery' | 'vein'): JourneyScene {
  const rng = random(route === 'artery' ? 20090701 : 20090702);
  const group = new THREE.Group();
  const LUMEN = -0.34, MEDIA = route === 'artery' ? 0.2 : -0.14;
  const plate = (bottom: number, top: number, color: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, top - bottom, 1.2), material(color));
    mesh.position.set(0, (top + bottom) / 2, -0.1);
    group.add(mesh);
  };
  plate(-1, LUMEN, route === 'artery' ? '#9d1d26' : '#34407a');
  plate(LUMEN, MEDIA, route === 'artery' ? '#e6b3a8' : '#d9c9c8');
  plate(MEDIA, 1, '#f1e6d4');
  // Red cells in the blood.
  const cells: Placement[] = [];
  for (let i = 0; i < 22; i++) cells.push({ position: V((rng() - 0.5) * 2, LUMEN - 0.1 - rng() * 0.52, 0.52 + rng() * 0.02), scale: V(0.045, 0.045, 0.012), color: shade('#d6333c', 0.86 + rng() * 0.25) });
  group.add(instances(sphere(2), material('#ffffff'), cells));
  // Flat endothelial cells on the inner surface, with their nuclei.
  const nuclei: Placement[] = [];
  const endothelial: Placement[] = [];
  for (let x = -1.15; x < 1.2; x += 0.34) {
    endothelial.push({ position: V(x, LUMEN + 0.004, 0.502), scale: V(0.165, 0.011, 0.012) });
    nuclei.push({ position: V(x + 0.04, LUMEN + 0.003, 0.507), scale: V(0.05, 0.012, 0.03) });
  }
  group.add(instances(sphere(2), material('#f3cfc6'), endothelial));
  // Layers of the middle coat, with an elastic lamina between each pair in an artery.
  let focus = V(0.12, LUMEN + 0.004, 0.505);
  if (route === 'artery') {
    group.add(lamina(LUMEN + 0.026, 0.016, '#f4e4a6', 0.3));
    const layers = 3, step = (MEDIA - LUMEN - 0.03) / layers;
    const muscle: Placement[] = [];
    for (let layer = 0; layer < layers; layer++) {
      const y = LUMEN + 0.03 + step * (layer + 0.5);
      for (let x = -1.2 + (layer % 2) * 0.15; x < 1.2; x += 0.3) {
        muscle.push({ position: V(x, y, 0.5), scale: V(0.14, step * 0.33, 0.012) });
        const nucleus = V(x + 0.01, y, 0.507);
        nuclei.push({ position: nucleus, scale: V(0.052, step * 0.17, 0.03) });
        if (layer === 1 && Math.abs(x) < 0.16) focus = nucleus;
      }
      group.add(lamina(LUMEN + 0.03 + step * (layer + 1), 0.012, '#f4e4a6', layer * 1.7));
    }
    group.add(instances(sphere(2), material('#c4655a'), muscle));
  } else {
    const muscle: Placement[] = [];
    for (let x = -1.2; x < 1.2; x += 0.32) muscle.push({ position: V(x, (LUMEN + MEDIA) / 2, 0.5), scale: V(0.15, 0.05, 0.012) });
    group.add(instances(sphere(2), material('#c98279'), muscle));
    for (let x = -1.1; x < 1.2; x += 0.64) nuclei.push({ position: V(x, (LUMEN + MEDIA) / 2, 0.507), scale: V(0.05, 0.024, 0.03) });
  }
  // Collagen and fibroblasts of the outer coat.
  const collagen: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const y = MEDIA + 0.03 + rng() * (0.95 - MEDIA), x = (rng() - 0.5) * 2.2, phase = rng() * 6;
    collagen.push(tubeGeometry(Array.from({ length: 12 }, (_, k) => V(x - 0.34 + k * 0.062, y + Math.sin(phase + k * 0.9) * 0.02, 0.502)), 0.008, 5, 1));
  }
  group.add(new THREE.Mesh(merged(collagen), material('#e2cfae')));
  for (let i = 0; i < 6; i++) nuclei.push({ position: V((rng() - 0.5) * 2, MEDIA + 0.08 + rng() * (0.8 - MEDIA), 0.507), scale: V(0.05, 0.016, 0.03) });
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  const labels: JourneyLabel[] = [
    { text: 'Blood', at: V(-0.5, LUMEN - 0.4, 0.53) },
    { text: 'Endothelium', at: V(-0.6, LUMEN + 0.004, 0.51) },
    { text: 'Outer coat of collagen', at: V(0.5, Math.min(0.8, MEDIA + 0.5), 0.51) },
    { text: route === 'artery' ? 'Nucleus of a smooth muscle cell' : 'Nucleus of an endothelial cell', at: focus },
  ];
  if (route === 'artery') labels.push({ text: 'Elastic lamina', at: V(0.75, LUMEN + 0.026, 0.51) });
  else labels.push({ text: 'Thin layer of smooth muscle', at: V(0.62, (LUMEN + MEDIA) / 2, 0.51) });
  return finish(group, V(0, -0.1, 0.2), focus, labels);
}

/** The wall of a femur cut across. There are no osteons in the cortex of the mouse: lamellae run with the surface, with osteocytes in lacunae between them. */
export function buildBoneBlock(): JourneyScene {
  const rng = random(20130520);
  const group = new THREE.Group();
  group.add(body(0.99, '#e8d6c6'));
  const OUTER = 0.46, INNER = 0.33;
  group.add(rods([{ x: 0, y: 0, radius: OUTER + 0.012 }], material('#e9c7b2'), 0.99, 0.502, 72));
  group.add(rods([{ x: 0, y: 0, radius: OUTER }], material('#f2ead6'), 0.99, 0.504, 72));
  // Lamellae, seen as faint rings parallel to the surface.
  for (let i = 1; i < 6; i++) {
    const radius = OUTER - (OUTER - INNER) * i / 6;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.0012, radius + 0.0012, 96), material('#d9cdb2'));
    ring.position.z = 0.5045;
    group.add(ring);
  }
  group.add(rods([{ x: 0, y: 0, radius: INNER }], material('#a8504a'), 0.99, 0.505, 72));
  // Cells of the marrow, and its sinusoids.
  const marrow: Placement[] = [];
  for (const point of packed(INNER, 0.0115, 0.003, rng)) {
    if (Math.hypot(point.x, point.y) > INNER - 0.006) continue;
    const tone = rng();
    marrow.push({ position: V(point.x, point.y, 0.5055), scale: V(0.0048, 0.0048, 0.001), color: tone < 0.14 ? new THREE.Color('#f5dd9c') : shade('#c86f66', 0.82 + rng() * 0.34) });
  }
  group.add(instances(sphere(1), material('#ffffff'), marrow));
  // Osteocytes in their lacunae through the cortex.
  const lacunae: Placement[] = [];
  let focus = V(0.3, 0.27, 0.5);
  for (let i = 0; i < 520; i++) {
    const angle = rng() * Math.PI * 2, r = INNER + 0.008 + rng() * (OUTER - INNER - 0.016);
    const position = V(Math.cos(angle) * r, Math.sin(angle) * r, 0.5052);
    lacunae.push({ position, scale: V(0.0042, 0.0042, 0.001), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), angle) });
    if (i === 40) focus = position.clone();
  }
  group.add(instances(sphere(1), material('#5e4b3c'), lacunae));
  // Vessel channels cross the cortex and do not form osteons.
  const canals: Rod[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = i * 0.71, r = INNER + 0.03 + (i % 3) * 0.03;
    canals.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, radius: 0.005, length: 0.002 });
  }
  group.add(rods(canals, material('#a33d40'), 0.002, 0.506, 8));
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Periosteum', at: V(OUTER + 0.008, 0, 0.505) },
    { text: 'Compact bone', at: V(0, INNER + 0.06, 0.505) },
    { text: 'Osteocyte in its lacuna', at: focus },
    { text: 'Marrow', at: V(-0.1, -0.12, 0.507) },
    { text: 'Vessel channel', at: V(canals[1].x, canals[1].y, 0.507) },
  ]);
}

/** Bone at the scale of its cells: osteocytes in lacunae, joined by processes through canaliculi, with osteoblasts on the surface above. */
export function buildBoneCells(): JourneyScene {
  const rng = random(20110201);
  const group = new THREE.Group();
  group.add(body(2.2, '#f0e7d3', 1.2));
  // Lamellae.
  for (let i = 0; i < 16; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.07), material(i % 2 ? '#ece1c8' : '#f4ecda'));
    strip.position.set(0, 0.6 - i * 0.1, 0.5005);
    group.add(strip);
  }
  // Osteoblasts on the bone surface.
  const SURFACE = 0.62;
  const osteoid = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.03, 0.04), material('#e5d3ad'));
  osteoid.position.set(0, SURFACE + 0.015, 0.49);
  group.add(osteoid);
  const blasts: Placement[] = [], nuclei: Placement[] = [];
  for (let x = -1.1; x < 1.15; x += 0.145) {
    blasts.push({ position: V(x, SURFACE + 0.1, 0.5), scale: V(0.068, 0.075, 0.012) });
    nuclei.push({ position: V(x, SURFACE + 0.115, 0.506), scale: V(0.034, 0.034, 0.01) });
  }
  group.add(instances(sphere(2), material('#ddb9a5'), blasts));
  // Osteocytes.
  const cells = [V(0, 0, 0.5), V(-0.56, 0.2, 0.5), V(0.56, 0.22, 0.5), V(-0.34, -0.36, 0.5), V(0.36, -0.34, 0.5), V(-0.9, -0.2, 0.5), V(0.92, -0.14, 0.5), V(0.02, 0.43, 0.5), V(0, -0.72, 0.5), V(-0.72, -0.7, 0.5), V(0.74, -0.7, 0.5)];
  const lacunae: Placement[] = [], bodies: Placement[] = [];
  for (const cell of cells) {
    lacunae.push({ position: cell, scale: V(0.105, 0.05, 0.004) });
    bodies.push({ position: V(cell.x, cell.y, cell.z + 0.004), scale: V(0.09, 0.04, 0.004) });
    nuclei.push({ position: V(cell.x, cell.y, cell.z + 0.0085), scale: V(0.042, 0.03, 0.003) });
  }
  group.add(instances(sphere(3), material('#b49d7d'), lacunae));
  group.add(instances(sphere(3), material('#cbaa92'), bodies));
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  // Processes run through canaliculi to neighbouring cells and to the surface.
  const processes: THREE.BufferGeometry[] = [];
  for (const cell of cells) {
    for (let k = 0; k < 16; k++) {
      const angle = k / 16 * Math.PI * 2 + rng() * 0.3, reach = 0.16 + rng() * 0.2;
      const end = V(cell.x + Math.cos(angle) * reach * 1.3, cell.y + Math.sin(angle) * reach, 0.503);
      const middle = V((cell.x + end.x) / 2 + (rng() - 0.5) * 0.04, (cell.y + end.y) / 2 + (rng() - 0.5) * 0.04, 0.503);
      processes.push(tubeGeometry([V(cell.x + Math.cos(angle) * 0.09, cell.y + Math.sin(angle) * 0.04, 0.503), middle, end], 0.0035, 4, 1.5));
    }
  }
  group.add(new THREE.Mesh(merged(processes), material('#9a856a')));
  const focus = V(0, 0, 0.509);
  return finish(group, V(0, 0.1, 0.2), focus, [
    { text: 'Nucleus of an osteocyte', at: focus },
    { text: 'Process in a canaliculus', at: V(0.2, 0.09, 0.505) },
    { text: 'Lacuna', at: V(cells[2].x + 0.1, cells[2].y, 0.505) },
    { text: 'Osteoblasts on the surface', at: V(0.45, SURFACE + 0.1, 0.51) },
    { text: 'Lamellae of bone', at: V(-0.72, 0.56, 0.505) },
  ]);
}

/** White fat: close-packed cells in lobules, with capillaries among them and a small artery and vein in a band of connective tissue. */
export function buildFatBlock(): JourneyScene {
  const rng = random(20010801);
  const group = new THREE.Group();
  group.add(body(0.97, '#f0dd9d'));
  const cells: Placement[] = [];
  const add = (x: number, y: number, z: number, r: number) => cells.push({ position: V(x, y, z), scale: uniform(r), color: shade('#f6dd8a', 0.92 + rng() * 0.12) });
  const PITCH = 0.052;
  for (const point of packed(0.47, PITCH, 0.006, rng)) add(point.x, point.y, 0.485, 0.026 + rng() * 0.003);
  for (const point of packed(0.47, PITCH, 0.006, rng)) add(0.485, point.x, point.y, 0.026 + rng() * 0.003);
  for (const point of packed(0.47, PITCH, 0.006, rng)) add(point.x, 0.485, point.y, 0.026 + rng() * 0.003);
  group.add(instances(sphere(2), material('#ffffff'), cells));
  // A band of connective tissue across the front, with vessels.
  const band = [V(-0.5, -0.12, 0.515), V(-0.2, -0.05, 0.516), V(0.1, -0.14, 0.516), V(0.5, -0.04, 0.515)];
  group.add(new THREE.Mesh(tubeGeometry(band, 0.03, 8), material('#efe7d8')));
  group.add(new THREE.Mesh(tubeGeometry(band.map((p) => p.clone().add(V(0, 0.018, 0.018))), 0.011, 8), material('#c8333a')));
  group.add(new THREE.Mesh(tubeGeometry(band.map((p) => p.clone().add(V(0, -0.016, 0.018))), 0.014, 8), material('#3f5a9a')));
  // Capillaries among the cells.
  const nets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 90; i++) {
    const start = V((rng() - 0.5) * 0.92, (rng() - 0.5) * 0.92, 0.512);
    const points = [start];
    for (let k = 0; k < 4; k++) points.push(points[k].clone().add(V((rng() - 0.5) * 0.09, (rng() - 0.5) * 0.09, 0)));
    nets.push(tubeGeometry(points, 0.0028, 4, 1.4));
  }
  group.add(new THREE.Mesh(merged(nets), material('#b5393f')));
  const focus = V(cells[Math.floor(cells.length * 0.13)].position.x, cells[Math.floor(cells.length * 0.13)].position.y, 0.5);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Fat cell', at: focus },
    { text: 'Small artery', at: V(-0.2, -0.032, 0.54) },
    { text: 'Small vein', at: V(0.1, -0.156, 0.54) },
    { text: 'Capillaries', at: V(0.3, 0.3, 0.515) },
  ]);
}

/** Fat cells cut open: one large droplet of fat fills each cell, with cytoplasm and a flattened nucleus at its edge. */
export function buildFatCells(): JourneyScene {
  const rng = random(20010802);
  const group = new THREE.Group();
  const cut = new THREE.Plane(V(0, 0, -1), 0);
  const options = { clippingPlanes: [cut] };
  const centres = [V(0, 0, -0.02), V(0.86, 0.1, -0.05), V(-0.84, 0.16, 0.02), V(0.42, 0.78, 0.05), V(-0.44, 0.8, -0.05), V(0.44, -0.76, -0.03), V(-0.42, -0.74, 0.04), V(1.28, -0.66, 0), V(-1.26, -0.6, 0)];
  const between = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3), material('#eadccb'));
  between.position.z = -0.72;
  group.add(between);
  const fat = solid('#efc75e', '#f6d873', options), rim = solid('#e9c3ae', '#eac9b6', options);
  const geometry = new THREE.IcosahedronGeometry(1, 4);
  const nuclei: Placement[] = [], mitochondria: Placement[] = [];
  let focus = V(0, 0, 0);
  centres.forEach((centre, index) => {
    const radius = 0.44 + rng() * 0.03;
    const outer = new THREE.Mesh(geometry, rim);
    outer.position.copy(centre);
    outer.scale.setScalar(radius);
    group.add(outer);
    const droplet = new THREE.Mesh(geometry, fat);
    droplet.position.copy(centre);
    droplet.scale.setScalar(radius - 0.018);
    group.add(droplet);
    const angle = index === 0 ? 0.6 : rng() * Math.PI * 2;
    const at = V(centre.x + Math.cos(angle) * (radius - 0.012), centre.y + Math.sin(angle) * (radius - 0.012), 0);
    nuclei.push({ position: at, scale: V(0.03, 0.03, 0.05), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), angle) });
    if (index === 0) focus = at;
    for (let k = 0; k < 18; k++) {
      const around = rng() * Math.PI * 2;
      mitochondria.push({ position: V(centre.x + Math.cos(around) * (radius - 0.009), centre.y + Math.sin(around) * (radius - 0.009), 0), scale: V(0.012, 0.005, 0.005), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), around + 1.57) });
    }
  });
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  group.add(instances(sphere(1), material('#a6584a'), mitochondria));
  // A capillary in the angle between cells.
  const capillary = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 16), material('#c8605a'));
  capillary.quaternion.copy(ALONG_Z);
  capillary.position.set(0.43, 0.39, -0.63);
  group.add(capillary);
  return finish(group, V(0, 0.05, 0), focus, [
    { text: 'Nucleus, pressed against the edge', at: focus },
    { text: 'One droplet of fat', at: V(-0.05, -0.08, 0) },
    { text: 'Thin rim of cytoplasm', at: V(centres[1].x - 0.44, centres[1].y, 0) },
    { text: 'Capillary', at: V(0.43, 0.39, 0.02) },
  ], cut);
}

/** The face of a block as a flat disc, a little in front of what lies under it. */
const disc = (x: number, y: number, radius: number, z = 0.503, stretch = 1, angle = 0): Placement => ({ position: V(x, y, z), scale: V(radius, radius * stretch, 0.001), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), angle) });
const flatLines = (lines: readonly (readonly THREE.Vector3[])[], radius: number): THREE.BufferGeometry => merged(lines.map((line) => tubeGeometry(line, radius, 4, 1.2)));

/** Liver cut across: lobules with a central vein, portal triads at their corners, and plates of hepatocytes and sinusoids running between them. */
export function buildLiverBlock(): JourneyScene {
  const rng = random(20140419);
  const group = new THREE.Group();
  group.add(body(0.99, '#8f3f33'));
  const RADIUS = 0.17, centres = packed(0.42, RADIUS * Math.sqrt(3), 0.008, rng);
  const plates: THREE.Vector3[][] = [], sinusoids: THREE.Vector3[][] = [];
  const triadVeins: Placement[] = [], triadArteries: Placement[] = [], triadDucts: Placement[] = [], centrals: Placement[] = [];
  for (const centre of centres) {
    centrals.push(disc(centre.x, centre.y, 0.02, 0.5055));
    for (let k = 0; k < 48; k++) {
      const angle = k / 48 * Math.PI * 2, wobble = (rng() - 0.5) * 0.08, end = RADIUS * (0.84 + 0.08 * Math.cos(angle * 6));
      const line = [V(centre.x + Math.cos(angle) * 0.024, centre.y + Math.sin(angle) * 0.024, 0.503), V(centre.x + Math.cos(angle + wobble) * end * 0.55, centre.y + Math.sin(angle + wobble) * end * 0.55, 0.503), V(centre.x + Math.cos(angle) * end, centre.y + Math.sin(angle) * end, 0.503)];
      (k % 2 ? sinusoids : plates).push(line);
    }
    for (let corner = 0; corner < 6; corner += 2) {
      const angle = corner / 6 * Math.PI * 2 + Math.PI / 6, x = centre.x + Math.cos(angle) * RADIUS * 1.02, y = centre.y + Math.sin(angle) * RADIUS * 1.02;
      if (Math.abs(x) > 0.47 || Math.abs(y) > 0.47) continue;
      triadVeins.push(disc(x, y, 0.013, 0.5055));
      triadArteries.push(disc(x + 0.016, y + 0.009, 0.005, 0.5055));
      triadDucts.push(disc(x - 0.012, y + 0.014, 0.0055, 0.5055));
    }
  }
  group.add(new THREE.Mesh(flatLines(plates, 0.0052), material('#c9836c')));
  group.add(new THREE.Mesh(flatLines(sinusoids, 0.0028), material('#5e1f1c')));
  const round = () => sphere(2);
  group.add(instances(round(), material('#2f3f7a'), centrals));
  group.add(instances(round(), material('#3f5a9a'), triadVeins));
  group.add(instances(round(), material('#c8333a'), triadArteries));
  group.add(instances(round(), material('#4f8a5a'), triadDucts));
  const central = centrals[Math.floor(centrals.length / 2)].position, triad = triadVeins[Math.floor(triadVeins.length / 2)].position;
  const focus = V(central.x + 0.08, central.y + 0.03, 0.5);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Central vein', at: central },
    { text: 'Portal vein, hepatic artery and bile duct', at: triad },
    { text: 'Plates of hepatocytes', at: focus },
  ]);
}

/** Hepatocytes in plates beside sinusoids, with bile canaliculi between neighbouring cells. Sizes follow the measures of Hammad et al. in adult mice. */
export function buildLiverCells(): JourneyScene {
  const rng = random(20140420);
  const group = new THREE.Group();
  group.add(body(2.3, '#c98b78', 1.2));
  // A hepatocyte of about 5,100 cubic micrometres is about 10.7 micrometres in radius, and a sinusoid about 4.8.
  const CELL = 0.153, SINUSOID = 0.069;
  const cells: Placement[] = [], nuclei: Placement[] = [], canaliculi: THREE.Vector3[][] = [];
  const PITCH_Y = CELL * 2 + SINUSOID * 2;
  let focus = V(0, 0, 0.5);
  for (let row = -3; row <= 3; row++) {
    const y = row * PITCH_Y;
    for (let column = -5; column <= 5; column++) {
      const x = (column + (row % 2 ? 0.5 : 0)) * CELL * 1.86 + (rng() - 0.5) * 0.012;
      cells.push({ position: V(x, y, 0.5), scale: V(CELL * 0.97, CELL * 0.98, 0.012), color: shade('#bf7f6b', 0.92 + rng() * 0.14) });
      const nucleus = V(x + (rng() - 0.5) * 0.03, y + (rng() - 0.5) * 0.03, 0.512);
      nuclei.push({ position: nucleus, scale: V(0.052, 0.052, 0.01) });
      if (row === 0 && column === 0) focus = nucleus;
      // A bile canaliculus runs in the groove between two neighbours.
      canaliculi.push([V(x + CELL * 0.93, y - CELL * 0.2, 0.513), V(x + CELL * 0.93, y, 0.513), V(x + CELL * 0.93, y + CELL * 0.2, 0.513)]);
    }
    // The sinusoid above this plate, with red cells in it.
    const channel = new THREE.Mesh(new THREE.BoxGeometry(2.3, SINUSOID * 1.9, 0.01), material('#7b2a26'));
    channel.position.set(0, y + PITCH_Y / 2, 0.502);
    group.add(channel);
  }
  group.add(instances(sphere(3), material('#ffffff'), cells));
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  group.add(new THREE.Mesh(flatLines(canaliculi, 0.012), material('#5f9a68')));
  const red: Placement[] = [];
  for (let i = 0; i < 26; i++) red.push({ position: V((rng() - 0.5) * 2.2, Math.round((rng() - 0.5) * 6) * PITCH_Y + PITCH_Y / 2, 0.51), scale: V(0.043, 0.043, 0.006) });
  group.add(instances(sphere(2), material('#c9303a'), red));
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a hepatocyte', at: focus },
    { text: 'Sinusoid', at: V(0.42, PITCH_Y / 2, 0.51) },
    { text: 'Bile canaliculus', at: canaliculi[Math.floor(canaliculi.length * 0.62)][1] },
  ]);
}

/** The cortex of a kidney: tubules cut across, renal corpuscles, and a small artery. */
export function buildKidneyBlock(): JourneyScene {
  const rng = random(20051130);
  const group = new THREE.Group();
  group.add(body(0.99, '#a65a50'));
  const corpuscles: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 300 && corpuscles.length < 11; tries++) {
    const x = (rng() - 0.5) * 0.88, y = (rng() - 0.5) * 0.88;
    if (corpuscles.every((other) => Math.hypot(other.x - x, other.y - y) > 0.21)) corpuscles.push({ x, y });
  }
  const walls: Placement[] = [], lumens: Placement[] = [];
  for (const point of packed(0.485, 0.034, 0.008, rng)) {
    if (corpuscles.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 0.05)) continue;
    const stretch = 0.82 + rng() * 0.4, angle = rng() * 3.14, radius = 0.0135 + rng() * 0.003;
    walls.push({ ...disc(point.x, point.y, radius, 0.5035, stretch, angle), color: shade('#d39a8a', 0.9 + rng() * 0.18) });
    lumens.push(disc(point.x, point.y, radius * (0.28 + rng() * 0.2), 0.505, stretch, angle));
  }
  group.add(instances(sphere(2), material('#ffffff'), walls));
  group.add(instances(sphere(2), material('#f5e9e0'), lumens));
  const capsules: Placement[] = [], tufts: Placement[] = [];
  for (const corpuscle of corpuscles) {
    capsules.push(disc(corpuscle.x, corpuscle.y, 0.041, 0.5035));
    for (let k = 0; k < 16; k++) {
      const angle = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.027;
      tufts.push(disc(corpuscle.x + Math.cos(angle) * r, corpuscle.y + Math.sin(angle) * r, 0.0072, 0.506));
    }
  }
  group.add(instances(sphere(2), material('#f6ece4'), capsules));
  group.add(instances(sphere(2), material('#b5434a'), tufts));
  const vessel = [V(-0.5, -0.06, 0.508), V(-0.2, 0.0, 0.508), V(0.12, -0.05, 0.508), V(0.5, 0.02, 0.508)];
  group.add(new THREE.Mesh(tubeGeometry(vessel, 0.016, 10), material('#c8333a')));
  const tubule = walls[Math.floor(walls.length * 0.4)].position;
  return finish(group, V(0, 0, 0.2), V(tubule.x, tubule.y, 0.5), [
    { text: 'Renal corpuscle', at: V(corpuscles[0].x, corpuscles[0].y, 0.51) },
    { text: 'Tubule of a nephron', at: tubule },
    { text: 'Small artery', at: vessel[1] },
  ]);
}

/** A renal corpuscle beside a tubule cut across, whose cells carry a brush border towards the lumen. */
export function buildKidneyCells(): JourneyScene {
  const rng = random(20051201);
  const group = new THREE.Group();
  group.add(body(2.3, '#b56a5e', 1.2));
  const round = () => sphere(3);
  // The tubule.
  const T = V(0.32, -0.12, 0), OUT = 0.34, IN = 0.15;
  const wall: Placement[] = [], nuclei: Placement[] = [], brush: THREE.Vector3[][] = [];
  let focus = V(T.x, T.y, 0.5);
  const CELLS = 12;
  for (let k = 0; k < CELLS; k++) {
    const angle = k / CELLS * Math.PI * 2, mid = (OUT + IN) / 2;
    const at = V(T.x + Math.cos(angle) * mid, T.y + Math.sin(angle) * mid, 0.502);
    wall.push({ position: at, scale: V((OUT - IN) / 2, 0.092, 0.006), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), angle), color: shade('#dba495', 0.92 + rng() * 0.12) });
    const nucleus = V(T.x + Math.cos(angle) * (mid + 0.03), T.y + Math.sin(angle) * (mid + 0.03), 0.509);
    nuclei.push({ position: nucleus, scale: V(0.05, 0.05, 0.005) });
    if (k === 3) focus = nucleus;
    for (let m = -6; m <= 6; m++) {
      const a = angle + m * 0.04;
      brush.push([V(T.x + Math.cos(a) * IN, T.y + Math.sin(a) * IN, 0.512), V(T.x + Math.cos(a) * (IN - 0.03), T.y + Math.sin(a) * (IN - 0.03), 0.512)]);
    }
  }
  group.add(instances(sphere(3), material('#ffffff'), wall));
  const lumen = new THREE.Mesh(new THREE.CircleGeometry(IN - 0.03, 40), material('#f6ece4'));
  lumen.position.set(T.x, T.y, 0.5125);
  group.add(lumen);
  group.add(new THREE.Mesh(merged(brush.map((line) => tubeGeometry(line, 0.0042, 3, 1))), material('#c98a7c')));
  // The corpuscle: a capsule, a space, and a tuft of capillary loops with podocytes on them.
  const C = V(-0.62, 0.3, 0);
  const space = new THREE.Mesh(new THREE.CircleGeometry(0.46, 56), material('#f4e9e0'));
  space.position.set(C.x, C.y, 0.502);
  group.add(space);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.49, 56), material('#d7a79a'));
  rim.position.set(C.x, C.y, 0.5025);
  group.add(rim);
  const loops: Placement[] = [], lumens: Placement[] = [], podocytes: Placement[] = [];
  for (let k = 0; k < 40; k++) {
    const angle = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.33;
    const x = C.x + Math.cos(angle) * r, y = C.y + Math.sin(angle) * r;
    loops.push({ position: V(x, y, 0.504), scale: V(0.058, 0.058, 0.004) });
    lumens.push({ position: V(x, y, 0.507), scale: V(0.038, 0.038, 0.003) });
    if (k % 3 === 0) { podocytes.push({ position: V(x + 0.05, y + 0.03, 0.51), scale: V(0.03, 0.03, 0.004) }); nuclei.push({ position: V(x + 0.05, y + 0.03, 0.513), scale: V(0.02, 0.02, 0.002) }); }
  }
  group.add(instances(round(), material('#c87d78'), loops));
  group.add(instances(round(), material('#8e1f26'), lumens));
  group.add(instances(round(), material('#e8c9b8'), podocytes));
  group.add(instances(round(), material(NUCLEUS_COLOUR), nuclei));
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a tubule cell', at: focus },
    { text: 'Brush border', at: V(T.x + IN - 0.015, T.y, 0.515) },
    { text: 'Capillaries of the glomerulus', at: V(C.x - 0.1, C.y + 0.1, 0.51) },
    { text: 'Space inside the capsule', at: V(C.x + 0.3, C.y - 0.34, 0.51) },
    { text: 'Podocyte', at: podocytes[2].position },
  ]);
}

/** Lung cut across: a foam of alveoli, with a bronchiole and a branch of the pulmonary artery beside it. */
export function buildLungBlock(): JourneyScene {
  const rng = random(20090101);
  const group = new THREE.Group();
  group.add(body(0.99, '#d78f89'));
  const BRONCHIOLE = V(-0.12, 0.08, 0.5), ARTERY = V(0.05, 0.14, 0.5), VEIN = V(0.24, -0.26, 0.5);
  const air: Placement[] = [];
  for (const point of packed(0.482, 0.031, 0.009, rng)) {
    if (Math.hypot(point.x - BRONCHIOLE.x, point.y - BRONCHIOLE.y) < 0.1 || Math.hypot(point.x - ARTERY.x, point.y - ARTERY.y) < 0.075 || Math.hypot(point.x - VEIN.x, point.y - VEIN.y) < 0.065) continue;
    air.push({ ...disc(point.x, point.y, 0.0125 + rng() * 0.0025, 0.5035, 0.85 + rng() * 0.3, rng() * 3) });
  }
  group.add(instances(sphere(2), material('#fbf1ee'), air));
  group.add(rods([{ x: BRONCHIOLE.x, y: BRONCHIOLE.y, radius: 0.08 }], material('#c9716b'), 0.002, 0.504, 36));
  group.add(rods([{ x: BRONCHIOLE.x, y: BRONCHIOLE.y, radius: 0.056 }], material('#fbf1ee'), 0.002, 0.5055, 36));
  group.add(rods([{ x: ARTERY.x, y: ARTERY.y, radius: 0.055 }], material('#c55a58'), 0.002, 0.504, 30));
  group.add(rods([{ x: ARTERY.x, y: ARTERY.y, radius: 0.036 }], material('#3f4d8e'), 0.002, 0.5055, 30));
  group.add(rods([{ x: VEIN.x, y: VEIN.y, radius: 0.05 }], material('#a56a7a'), 0.002, 0.504, 30));
  group.add(rods([{ x: VEIN.x, y: VEIN.y, radius: 0.043 }], material('#a01f2b'), 0.002, 0.5055, 30));
  const alveolus = air[Math.floor(air.length * 0.7)].position;
  return finish(group, V(0, 0, 0.2), V(alveolus.x, alveolus.y, 0.5), [
    { text: 'Alveolus', at: alveolus },
    { text: 'Bronchiole', at: V(BRONCHIOLE.x, BRONCHIOLE.y, 0.51) },
    { text: 'Branch of the pulmonary artery', at: V(ARTERY.x, ARTERY.y, 0.51) },
    { text: 'Branch of the pulmonary vein', at: V(VEIN.x, VEIN.y, 0.51) },
  ]);
}

/** The thin walls between alveoli, with capillaries holding red cells, flat type I cells, a cuboidal type II cell and a macrophage in the air space. */
export function buildLungCells(): JourneyScene {
  const rng = random(20090102);
  const group = new THREE.Group();
  group.add(body(2.3, '#f9efec', 1.2));
  const centres = [V(-0.58, 0.42, 0), V(0.46, 0.46, 0), V(-0.56, -0.52, 0), V(0.5, -0.44, 0), V(0, -0.02, 0)];
  // Walls are the ground between round air spaces.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), material('#e0a29a'));
  ground.position.z = 0.501;
  group.add(ground);
  const AIR = [0.5, 0.48, 0.52, 0.49, 0.26];
  centres.forEach((centre, index) => {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(AIR[index], 56), material('#fbf5f2'));
    hole.position.set(centre.x, centre.y, 0.502);
    group.add(hole);
  });
  // Capillaries in the walls, cut across, each with red cells.
  const capillaries: Placement[] = [], reds: Placement[] = [], nuclei: Placement[] = [];
  const inWall = [V(0, 0.42, 0), V(-0.04, 0.56, 0), V(0.05, -0.47, 0), V(-0.06, -0.62, 0), V(-0.6, -0.04, 0), V(-0.42, -0.03, 0), V(0.62, 0.0, 0), V(0.4, 0.0, 0), V(1.02, 0.02, 0), V(-1.08, -0.05, 0)];
  for (const at of inWall) {
    capillaries.push({ position: V(at.x, at.y, 0.503), scale: V(0.058, 0.058, 0.002) });
    reds.push({ position: V(at.x + (rng() - 0.5) * 0.02, at.y + (rng() - 0.5) * 0.02, 0.5055), scale: V(0.043, 0.043, 0.002) });
  }
  group.add(instances(sphere(3), material('#efc8bd'), capillaries));
  group.add(instances(sphere(3), material('#c9303a'), reds));
  // A flat type I cell lines each space, and its nucleus bulges a little.
  const flat: THREE.Vector3[][] = [];
  centres.forEach((centre, index) => {
    const radius = AIR[index];
    flat.push(Array.from({ length: 33 }, (_, k) => { const a = k / 32 * Math.PI * 2; return V(centre.x + Math.cos(a) * (radius - 0.006), centre.y + Math.sin(a) * (radius - 0.006), 0.504); }));
    for (let n = 0; n < 2; n++) {
      const a = rng() * Math.PI * 2;
      nuclei.push({ position: V(centre.x + Math.cos(a) * (radius - 0.012), centre.y + Math.sin(a) * (radius - 0.012), 0.507), scale: V(0.038, 0.016, 0.003), rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a + Math.PI / 2) });
    }
  });
  group.add(new THREE.Mesh(merged(flat.map((line) => tubeGeometry(line, 0.0065, 4, 1))), material('#d7928a')));
  // A type II cell in a corner of the wall, with its lamellar bodies.
  const corner = V(-0.03, 0.27, 0.506);
  const type2 = new THREE.Mesh(sphere(3), material('#e7c4a4'));
  type2.position.copy(corner);
  type2.scale.set(0.105, 0.09, 0.004);
  group.add(type2);
  const focus = V(corner.x - 0.02, corner.y + 0.015, 0.509);
  nuclei.push({ position: focus, scale: V(0.045, 0.045, 0.003) });
  const bodies: Placement[] = [];
  for (let k = 0; k < 6; k++) bodies.push({ position: V(corner.x + 0.05 + (rng() - 0.5) * 0.05, corner.y - 0.03 + (rng() - 0.5) * 0.07, 0.509), scale: V(0.012, 0.012, 0.002) });
  group.add(instances(sphere(1), material('#8b6a4e'), bodies));
  // A macrophage in the air.
  const macrophage = V(0.5, 0.44, 0.507);
  const eater = new THREE.Mesh(sphere(3), material('#d9c7b5'));
  eater.position.copy(macrophage);
  eater.scale.set(0.13, 0.115, 0.004);
  group.add(eater);
  nuclei.push({ position: V(macrophage.x + 0.03, macrophage.y, 0.511), scale: V(0.05, 0.04, 0.002) });
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Nucleus of a type II cell', at: focus },
    { text: 'Air space', at: V(-0.62, 0.48, 0.51) },
    { text: 'Capillary with a red cell', at: V(inWall[2].x, inWall[2].y, 0.51) },
    { text: 'Macrophage', at: macrophage },
    { text: 'Thin type I cell', at: V(centres[3].x - 0.34, centres[3].y + 0.34, 0.51) },
  ]);
}

/** The wall of the small intestine cut lengthways: villi, crypts, the submucosa and two layers of muscle. */
export function buildGutBlock(): JourneyScene {
  const rng = random(20130718);
  const group = new THREE.Group();
  const plate = (bottom: number, top: number, color: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.99, top - bottom, 0.99), material(color));
    mesh.position.set(0, (top + bottom) / 2, 0.005);
    group.add(mesh);
  };
  const SEROSA = -0.47, LONGITUDINAL = -0.43, CIRCULAR = -0.34, SUBMUCOSA = -0.3, CRYPTS = -0.14;
  plate(-0.495, SEROSA, '#efe3d6'); plate(SEROSA, LONGITUDINAL, '#b65f52'); plate(LONGITUDINAL, CIRCULAR, '#a54c43'); plate(CIRCULAR, SUBMUCOSA, '#ecd7c6'); plate(SUBMUCOSA, CRYPTS, '#d8a596');
  const face = 0.511;
  // Crypts: tubes down into the tissue under the villi.
  const crypts: Placement[] = [];
  for (let x = -0.46; x <= 0.46; x += 0.064) crypts.push({ position: V(x, (SUBMUCOSA + CRYPTS) / 2, face), scale: V(0.019, (CRYPTS - SUBMUCOSA) / 2 * 0.92, 0.002), color: new THREE.Color('#f0d5c5') });
  group.add(instances(sphere(2), material('#ffffff'), crypts));
  // Villi: fingers into the space of the gut, each with a core, a capillary and a lacteal.
  const villi: Placement[] = [], cores: Placement[] = [];
  const lines: THREE.Vector3[][] = [], lacteals: THREE.Vector3[][] = [];
  for (let x = -0.44; x <= 0.45; x += 0.103) {
    const height = 0.29 + rng() * 0.05, width = 0.042;
    villi.push({ position: V(x, CRYPTS + height / 2, face), scale: V(width, height / 2 + 0.02, 0.003) });
    cores.push({ position: V(x, CRYPTS + height / 2 - 0.01, face + 0.002), scale: V(width * 0.62, height / 2 - 0.005, 0.002) });
    lines.push([V(x - 0.012, CRYPTS + 0.01, face + 0.004), V(x - 0.014, CRYPTS + height * 0.5, face + 0.004), V(x, CRYPTS + height * 0.9, face + 0.004), V(x + 0.014, CRYPTS + height * 0.5, face + 0.004), V(x + 0.012, CRYPTS + 0.01, face + 0.004)]);
    lacteals.push([V(x, CRYPTS, face + 0.005), V(x, CRYPTS + height * 0.74, face + 0.005)]);
  }
  group.add(instances(sphere(3), material('#e7b7a6'), villi));
  group.add(instances(sphere(3), material('#f3dccd'), cores));
  const behind: Placement[] = [];
  for (let z = 0.4; z > -0.47; z -= 0.098) for (let x = -0.45; x <= 0.46; x += 0.098) {
    const height = 0.26 + rng() * 0.08;
    behind.push({ position: V(x + (rng() - 0.5) * 0.02, CRYPTS + height / 2, z + (rng() - 0.5) * 0.02), scale: V(0.04, height / 2 + 0.02, 0.04), color: shade('#e7b7a6', 0.9 + rng() * 0.16) });
  }
  group.add(instances(sphere(2), material('#ffffff'), behind));
  group.add(new THREE.Mesh(flatLines(lines, 0.0032), material('#c8333a')));
  group.add(new THREE.Mesh(flatLines(lacteals, 0.0045), material('#f4eecd')));
  const vessel = [V(-0.5, (CIRCULAR + SUBMUCOSA) / 2, face), V(0, (CIRCULAR + SUBMUCOSA) / 2 + 0.006, face), V(0.5, (CIRCULAR + SUBMUCOSA) / 2, face)];
  group.add(new THREE.Mesh(tubeGeometry(vessel, 0.011, 8), material('#c8333a')));
  const tip = villi[4].position;
  return finish(group, V(0, -0.02, 0.2), V(tip.x, tip.y + 0.09, 0.5), [
    { text: 'Villus', at: V(tip.x, tip.y + 0.1, face) },
    { text: 'Crypts', at: crypts[6].position },
    { text: 'Vessel in the submucosa', at: vessel[1] },
    { text: 'Circular muscle', at: V(0.3, (LONGITUDINAL + CIRCULAR) / 2, face) },
    { text: 'Longitudinal muscle', at: V(-0.3, (SEROSA + LONGITUDINAL) / 2, face) },
  ]);
}

/** The side of a villus: tall absorptive cells with a brush border, a goblet cell, and the core with a capillary and a lacteal. */
export function buildGutCells(): JourneyScene {
  const rng = random(20130719);
  const group = new THREE.Group();
  group.add(body(2.3, '#f7efe3', 1.2));
  const core = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.72), material('#f0d7c6'));
  core.position.set(0, -0.76, 0.502);
  group.add(core);
  const BASE = -0.4, TOP = 0.08, WIDTH = 0.09;
  const cells: Placement[] = [], nuclei: Placement[] = [], goblets: Placement[] = [];
  const microvilli: THREE.Vector3[][] = [];
  let focus = V(0, 0, 0.5);
  let index = 0;
  for (let x = -1.1; x < 1.15; x += WIDTH * 2 + 0.006) {
    const isGoblet = index % 6 === 4;
    cells.push({ position: V(x, (BASE + TOP) / 2, 0.504), scale: V(WIDTH, (TOP - BASE) / 2, 0.003), color: shade(isGoblet ? '#cdb8c4' : '#e6b6a6', 0.94 + rng() * 0.1) });
    const nucleus = V(x, BASE + 0.1 + rng() * 0.02, 0.508);
    nuclei.push({ position: nucleus, scale: V(0.052, 0.078, 0.002) });
    if (isGoblet) goblets.push({ position: V(x, TOP - 0.13, 0.5075), scale: V(WIDTH * 0.74, 0.12, 0.002) });
    if (Math.abs(x) < WIDTH + 0.01 && !isGoblet) focus = nucleus;
    if (!isGoblet) for (let m = -5; m <= 5; m++) microvilli.push([V(x + m * WIDTH / 6, TOP, 0.507), V(x + m * WIDTH / 6, TOP + 0.045, 0.507)]);
    index++;
  }
  group.add(instances(sphere(3), material('#ffffff'), cells));
  group.add(instances(sphere(2), material('#f1e8ef'), goblets));
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  group.add(new THREE.Mesh(merged(microvilli.map((line) => tubeGeometry(line, 0.0048, 3, 1))), material('#d49c8c')));
  // Under the epithelium.
  const capillary = [V(-1.2, -0.56, 0.505), V(-0.4, -0.52, 0.505), V(0.3, -0.58, 0.505), V(1.2, -0.54, 0.505)];
  const lacteal = [V(-1.2, -0.86, 0.505), V(0, -0.82, 0.505), V(1.2, -0.87, 0.505)];
  group.add(new THREE.Mesh(tubeGeometry(capillary, 0.06, 12), material('#c8605a')));
  group.add(new THREE.Mesh(tubeGeometry(lacteal, 0.1, 12), material('#f4eecd')));
  return finish(group, V(0, -0.15, 0.2), focus, [
    { text: 'Nucleus of an absorptive cell', at: focus },
    { text: 'Brush border', at: V(0.42, TOP + 0.03, 0.51) },
    { text: 'Goblet cell', at: goblets[0].position },
    { text: 'Capillary', at: capillary[1] },
    { text: 'Lacteal', at: lacteal[1] },
  ]);
}

/** Heart muscle cut across: closely packed cells with many capillaries, and a small coronary artery and vein. */
export function buildHeartBlock(): JourneyScene {
  const rng = random(20151203);
  const group = new THREE.Group();
  group.add(body(0.99, '#e0c3b4'));
  const A = V(-0.14, 0.12, 0.5), B = V(0.03, 0.09, 0.5);
  const cells: Rod[] = [], capillaries: Rod[] = [];
  for (const point of packed(0.485, 0.0156, 0.003, rng)) {
    if (Math.hypot(point.x - A.x, point.y - A.y) < 0.06 || Math.hypot(point.x - B.x, point.y - B.y) < 0.07) continue;
    if (Math.abs(point.y + 0.2 + Math.sin(point.x * 7) * 0.03) < 0.01) continue;
    cells.push({ x: point.x, y: point.y, radius: 0.0066 + rng() * 0.0008, color: shade('#a7473f', 0.9 + rng() * 0.2) });
    capillaries.push({ x: point.x + 0.0078, y: point.y + 0.0045, radius: 0.0018 });
  }
  group.add(rods(cells, material('#ffffff'), 0.99, 0.503, 8));
  group.add(rods(capillaries, material('#6f141c'), 0.99, 0.504, 5));
  group.add(rods([{ x: A.x, y: A.y, radius: 0.048 }], material('#d66f6a'), 0.002, 0.505, 30));
  group.add(rods([{ x: A.x, y: A.y, radius: 0.027 }], material('#8b1a22'), 0.002, 0.5065, 30));
  group.add(rods([{ x: B.x, y: B.y, radius: 0.06 }], material('#8b95bd'), 0.002, 0.505, 30));
  group.add(rods([{ x: B.x, y: B.y, radius: 0.05 }], material('#2f3f7a'), 0.002, 0.5065, 30));
  const cell = cells[Math.floor(cells.length * 0.66)];
  return finish(group, V(0, 0, 0.2), V(cell.x, cell.y, 0.5), [
    { text: 'Heart muscle cell', at: V(cell.x, cell.y, 0.505) },
    { text: 'Small coronary artery', at: V(A.x, A.y, 0.51) },
    { text: 'Small coronary vein', at: V(B.x, B.y, 0.51) },
    { text: 'Band of connective tissue', at: V(0.25, -0.2 - Math.sin(1.75) * 0.03, 0.505) },
  ]);
}

/** Heart muscle cells lengthways, as short branched cells joined end to end at intercalated discs, with a capillary and a fibroblast. */
export function buildHeartCells(): JourneyScene {
  const rng = random(20151204);
  const group = new THREE.Group();
  group.add(body(2.4, '#ecd8c9', 1.2));
  const LENGTH = 0.92, HEIGHT = 0.2;
  const dark: Placement[] = [], pale: Placement[] = [], nuclei: Placement[] = [], discs: THREE.Vector3[][] = [];
  let focus = V(0, 0, 0.5);
  const SARCOMERE = 0.03;
  for (let row = -2; row <= 2; row++) {
    const y = row * (HEIGHT * 2 + 0.14), shift = (row % 2) * LENGTH * 0.5;
    for (let column = -2; column <= 2; column++) {
      const x = column * (LENGTH + 0.02) + shift;
      for (let s = -LENGTH / 2 + 0.02; s < LENGTH / 2 - 0.02; s += SARCOMERE) {
        dark.push({ position: V(x + s, y, 0.503), scale: V(SARCOMERE * 0.34, HEIGHT, 0.004) });
        pale.push({ position: V(x + s + SARCOMERE * 0.5, y, 0.503), scale: V(SARCOMERE * 0.16, HEIGHT, 0.004) });
      }
      const nucleus = V(x, y, 0.509);
      nuclei.push({ position: nucleus, scale: V(0.082, 0.05, 0.002) });
      if (row === 0 && column === 0) focus = nucleus;
      // The intercalated disc at the end of each cell runs in steps.
      const end = x + LENGTH / 2 + 0.005;
      discs.push(Array.from({ length: 9 }, (_, k) => V(end + (k % 2 ? 0.014 : -0.014), y - HEIGHT + k * HEIGHT / 4, 0.507)));
    }
  }
  const box = () => new THREE.BoxGeometry(2, 2, 1);
  group.add(instances(box(), material('#a7473f'), dark));
  group.add(instances(box(), material('#cf8b7e'), pale));
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  group.add(new THREE.Mesh(merged(discs.map((line) => tubeGeometry(line, 0.008, 4, 1))), material('#4f201c')));
  // Capillaries between the rows.
  const capillaries: THREE.Vector3[][] = [];
  for (let row = -2; row < 2; row++) {
    const y = (row + 0.5) * (HEIGHT * 2 + 0.14);
    capillaries.push(Array.from({ length: 7 }, (_, k) => V(-1.2 + k * 0.4, y + (rng() - 0.5) * 0.02, 0.505)));
  }
  group.add(new THREE.Mesh(merged(capillaries.map((line) => tubeGeometry(line, 0.044, 10))), material('#c8605a')));
  const fibroblast = new THREE.Mesh(sphere(3), material('#d9c0a7'));
  fibroblast.position.set(0.5, (HEIGHT * 2 + 0.14) * 0.5 + 0.05, 0.508);
  fibroblast.scale.set(0.09, 0.012, 0.002);
  group.add(fibroblast);
  return finish(group, V(0, 0, 0.2), focus, [
    { text: 'Central nucleus', at: focus },
    { text: 'Intercalated disc', at: discs[12][4] },
    { text: 'Capillary', at: capillaries[1][4] },
    { text: 'Fibroblast', at: fibroblast.position },
  ]);
}

/** The cerebral cortex from the surface inwards: layers of neurons of differing density, with vessels entering from the surface. */
export function buildBrainBlock(): JourneyScene {
  const rng = random(20181023);
  const group = new THREE.Group();
  group.add(body(0.99, '#efdfd7'));
  const white = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.2, 0.002), material('#f8f5ee'));
  white.position.set(0, -0.395, 0.502);
  group.add(white);
  const TOP = 0.47;
  const pia = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.018, 0.002), material('#e0a8a0'));
  pia.position.set(0, TOP + 0.012, 0.5022);
  group.add(pia);
  // Layer: its top, bottom, cells per unit area, and size.
  const LAYERS: readonly (readonly [number, number, number, number])[] = [[0.47, 0.38, 900, 0.0026], [0.38, 0.2, 7600, 0.0034], [0.2, 0.09, 8200, 0.003], [0.09, -0.08, 4200, 0.0052], [-0.08, -0.29, 3600, 0.0042]];
  const cells: Placement[] = [];
  for (const [top, bottom, density, size] of LAYERS) {
    const count = Math.round(density * (top - bottom) * 0.99);
    for (let i = 0; i < count; i++) cells.push({ position: V((rng() - 0.5) * 0.97, bottom + rng() * (top - bottom), 0.5035), scale: V(size * (0.8 + rng() * 0.5), size * (0.9 + rng() * 0.7), 0.001), color: shade('#7a5f93', 0.82 + rng() * 0.36) });
  }
  group.add(instances(sphere(1), material('#ffffff'), cells));
  // Apical dendrites of the larger neurons rise towards the surface.
  const dendrites: THREE.Vector3[][] = [];
  for (let i = 0; i < 80; i++) {
    const x = (rng() - 0.5) * 0.94, from = -0.06 + rng() * 0.14;
    dendrites.push([V(x, from, 0.5035), V(x + (rng() - 0.5) * 0.02, from + (TOP - from) * 0.5, 0.5035), V(x + (rng() - 0.5) * 0.03, TOP - 0.03, 0.5035)]);
  }
  group.add(new THREE.Mesh(flatLines(dendrites, 0.0007), material('#a897b4')));
  const vessels: THREE.Vector3[][] = [];
  for (let i = 0; i < 12; i++) {
    const x = -0.44 + i * 0.08 + (rng() - 0.5) * 0.02;
    vessels.push([V(x, TOP + 0.012, 0.504), V(x + (rng() - 0.5) * 0.02, TOP - 0.25, 0.504), V(x + (rng() - 0.5) * 0.05, TOP - 0.58 - rng() * 0.1, 0.504)]);
  }
  group.add(new THREE.Mesh(flatLines(vessels, 0.0032), material('#b84a4e')));
  const cell = cells[900];
  return finish(group, V(0, 0, 0.2), V(cell.position.x, cell.position.y, 0.5), [
    { text: 'Vessel entering from the surface', at: vessels[5][1] },
    { text: 'Neurons in layers', at: cell.position },
    { text: 'White matter', at: V(0.2, -0.4, 0.505) },
    { text: 'Pia', at: V(-0.3, TOP + 0.012, 0.505) },
  ]);
}

/** In the cortex: a pyramidal neuron with dendritic spines and a myelinated axon, an astrocyte with its end feet on a capillary, an oligodendrocyte and a microglial cell. */
export function buildBrainCells(): JourneyScene {
  const rng = random(20181024);
  const outer = new THREE.Group();
  outer.add(body(3, '#efe3dc', 1.2));
  const group = new THREE.Group();
  const CLOSER = 0.62;
  group.scale.set(CLOSER, CLOSER, 1);
  outer.add(group);
  const closer = (point: THREE.Vector3) => V(point.x * CLOSER, point.y * CLOSER, point.z);
  const FACE = 0.504;
  const nuclei: Placement[] = [];
  const soma = V(-0.12, -0.14, FACE);
  const neuron = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 24), material('#c7a9c9'));
  neuron.position.copy(soma);
  neuron.scale.z = 0.02;
  group.add(neuron);
  const focus = V(soma.x, soma.y - 0.03, FACE + 0.005);
  nuclei.push({ position: focus, scale: V(0.088, 0.088, 0.003) });
  const dendrites: THREE.Vector3[][] = [], spines: Placement[] = [];
  const trunk = [V(soma.x, soma.y + 0.2, FACE), V(soma.x + 0.03, soma.y + 0.5, FACE), V(soma.x - 0.02, soma.y + 0.8, FACE), V(soma.x + 0.02, soma.y + 1.15, FACE)];
  dendrites.push(trunk);
  for (const [dx, dy] of [[0.5, 0.42], [-0.46, 0.5], [0.42, 0.78], [-0.5, 0.9]] as const) dendrites.push([V(soma.x + 0.02, soma.y + dy * 0.72, FACE), V(soma.x + dx * 0.6, soma.y + dy * 0.9, FACE), V(soma.x + dx, soma.y + dy + 0.14, FACE)]);
  for (const [dx, dy] of [[0.62, -0.32], [-0.6, -0.36], [0.4, -0.52], [-0.36, -0.54]] as const) dendrites.push([V(soma.x + dx * 0.2, soma.y - 0.17, FACE), V(soma.x + dx * 0.6, soma.y + dy * 0.76, FACE), V(soma.x + dx, soma.y + dy, FACE)]);
  group.add(new THREE.Mesh(merged(dendrites.map((line) => tubeGeometry(line, 0.016, 6))), material('#bd9dc2')));
  for (const line of dendrites) {
    const curve = new THREE.CatmullRomCurve3([...line]);
    for (let t = 0.1; t < 1; t += 0.035) {
      const at = curve.getPointAt(t);
      spines.push({ position: V(at.x + (rng() - 0.5) * 0.05, at.y + (rng() - 0.5) * 0.05, FACE), scale: V(0.0085, 0.0085, 0.002) });
    }
  }
  group.add(instances(sphere(1), material('#a67fae'), spines));
  // The axon, with sheaths of myelin and bare nodes.
  const axon = [V(soma.x, soma.y - 0.2, FACE), V(soma.x + 0.02, soma.y - 0.4, FACE), V(soma.x - 0.02, soma.y - 0.7, FACE), V(soma.x, soma.y - 1, FACE)];
  group.add(new THREE.Mesh(tubeGeometry(axon, 0.012, 6), material('#bd9dc2')));
  const curve = new THREE.CatmullRomCurve3(axon);
  group.add(new THREE.Mesh(merged([[0.18, 0.5], [0.54, 0.86]].map(([from, to]) => tubeGeometry(Array.from({ length: 6 }, (_, k) => curve.getPointAt(from + (to - from) * k / 5)), 0.028, 8))), material('#f6f2e3')));
  // A capillary with the end feet of an astrocyte on it.
  const capillary = [V(0.5, -1.2, FACE), V(0.62, -0.4, FACE), V(0.58, 0.3, FACE), V(0.72, 1.2, FACE)];
  group.add(new THREE.Mesh(tubeGeometry(capillary, 0.058, 12), material('#c8605a')));
  const astro = V(0.98, -0.1, FACE);
  const astrocyte = new THREE.Mesh(sphere(3), material('#b7d2c0'));
  astrocyte.position.copy(astro);
  astrocyte.scale.set(0.09, 0.09, 0.012);
  group.add(astrocyte);
  nuclei.push({ position: V(astro.x, astro.y, FACE + 0.013), scale: V(0.052, 0.052, 0.002) });
  const processes: THREE.Vector3[][] = [];
  for (let k = 0; k < 13; k++) {
    const angle = k / 13 * Math.PI * 2 + 0.1;
    processes.push([astro, V(astro.x + Math.cos(angle) * 0.2, astro.y + Math.sin(angle) * 0.2 + (rng() - 0.5) * 0.04, FACE), V(astro.x + Math.cos(angle) * 0.36, astro.y + Math.sin(angle) * 0.36 + (rng() - 0.5) * 0.06, FACE)]);
  }
  processes.push([astro, V(astro.x - 0.16, astro.y + 0.04, FACE), V(0.67, -0.07, FACE)]);
  group.add(new THREE.Mesh(merged(processes.map((line) => tubeGeometry(line, 0.008, 4))), material('#a4c4ae')));
  const foot = new THREE.Mesh(sphere(2), material('#a4c4ae'));
  foot.position.set(0.635, -0.08, FACE);
  foot.scale.set(0.024, 0.07, 0.008);
  group.add(foot);
  // An oligodendrocyte beside the axon, and a microglial cell.
  const oligo = V(-0.6, -0.84, FACE);
  const others = new THREE.Mesh(sphere(3), material('#cfd8e8'));
  others.position.copy(oligo);
  others.scale.set(0.07, 0.07, 0.008);
  group.add(others);
  nuclei.push({ position: V(oligo.x, oligo.y, FACE + 0.009), scale: V(0.048, 0.048, 0.002) });
  group.add(new THREE.Mesh(tubeGeometry([oligo, V(-0.32, -0.72, FACE), V(soma.x, soma.y - 0.6, FACE)], 0.006, 4), material('#cfd8e8')));
  const micro = V(-0.84, 0.28, FACE);
  const microglia = new THREE.Mesh(sphere(3), material('#e0c6a2'));
  microglia.position.copy(micro);
  microglia.scale.set(0.05, 0.035, 0.008);
  group.add(microglia);
  nuclei.push({ position: V(micro.x, micro.y, FACE + 0.009), scale: V(0.032, 0.022, 0.002) });
  group.add(new THREE.Mesh(merged(Array.from({ length: 7 }, (_, k) => { const a = k * 0.9; return tubeGeometry([micro, V(micro.x + Math.cos(a) * 0.09, micro.y + Math.sin(a) * 0.09, FACE), V(micro.x + Math.cos(a + 0.4) * 0.17, micro.y + Math.sin(a + 0.4) * 0.17, FACE)], 0.004, 3); })), material('#d3b78f')));
  group.add(instances(sphere(3), material(NUCLEUS_COLOUR), nuclei));
  return finish(outer, V(0, 0, 0.2), closer(focus), [
    { text: 'Nucleus of a pyramidal neuron', at: closer(focus) },
    { text: 'Spines on a dendrite', at: closer(trunk[2]) },
    { text: 'Myelin on the axon', at: closer(curve.getPointAt(0.34)) },
    { text: 'Capillary', at: closer(capillary[1]) },
    { text: 'Astrocyte, with an end foot on the capillary', at: closer(astro) },
    { text: 'Oligodendrocyte', at: closer(oligo) },
    { text: 'Microglial cell', at: closer(micro) },
  ]);
}

/** The scenes of the tissue routes, by the id of their level. */
export const TISSUE_BUILDERS: Readonly<Record<string, () => JourneyScene>> = Object.freeze({
  'muscle-block': buildMuscleBlock, 'muscle-fibres': buildMuscleFibres,
  'nerve-block': buildNerveBlock, 'nerve-fibres': buildNerveFibres,
  'artery-block': () => buildVesselBlock('artery'), 'artery-wall': () => buildVesselWall('artery'),
  'vein-block': () => buildVesselBlock('vein'), 'vein-wall': () => buildVesselWall('vein'),
  'bone-block': buildBoneBlock, 'bone-cells': buildBoneCells,
  'fat-block': buildFatBlock, 'fat-cells': buildFatCells,
  'liver-block': buildLiverBlock, 'liver-cells': buildLiverCells,
  'kidney-block': buildKidneyBlock, 'kidney-cells': buildKidneyCells,
  'lung-block': buildLungBlock, 'lung-cells': buildLungCells,
  'gut-block': buildGutBlock, 'gut-cells': buildGutCells,
  'heart-block': buildHeartBlock, 'heart-cells': buildHeartCells,
  'brain-block': buildBrainBlock, 'brain-cells': buildBrainCells,
});
