/**
 * Simulated internal structures: routes and bodies placed by hand on landmarks measured
 * from the source labels and CT. Branching order and relations follow the plates of Cook
 * (1965) and the text of Hummel et al. (1966); nerves, which those works omit, follow Greene
 * (1935), which describes the rat. Radii and exact courses are estimates and are not measured.
 *
 * Coordinates are source voxels of 0.1 mm in the scanned frame, before the simulated posture.
 * Low native x is the animal's right.
 */
import { mergeSurfaces, tube } from './extract';
import type { Landmarks } from './landmarks';
import { add, JOINTS, unit, type Vec3 } from './rig';
import { surfaceNets, type Surface } from './surface-nets';
import { smoothField, voxelIndex, type Grid } from './volume';

const M = 181;
const mirror = (p: Vec3): Vec3 => [2 * M - p[0], p[1], p[2]];
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A centripetal-style Catmull-Rom curve through control points, sampled about every three voxels. */
export function curve(controls: readonly Vec3[], spacing = 3): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)], p1 = controls[i], p2 = controls[i + 1], p3 = controls[Math.min(controls.length - 1, i + 2)];
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const value = (k: 0 | 1 | 2) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([value(0), value(1), value(2)]);
    }
  }
  out.push(controls[controls.length - 1]);
  return out;
}

/** A tube through controls whose radius tapers from r0 to r1. */
export function route(controls: readonly Vec3[], r0: number, r1: number, sides = 8): Surface {
  const points = curve(controls);
  const radii = points.map((_, i) => r0 + (r1 - r0) * i / (points.length - 1));
  return tube(points, radii, sides);
}

/** An ellipsoid body at a centre. */
export function blob(centre: Vec3, radii: Vec3, rows = 12, columns = 18): Surface {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    const theta = Math.PI * r / rows, phi = 2 * Math.PI * c / columns;
    const n: Vec3 = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
    positions.push(centre[0] + radii[0] * n[0], centre[1] + radii[1] * n[1], centre[2] + radii[2] * n[2]);
    const m = unit([n[0] / radii[0], n[1] / radii[1], n[2] / radii[2]]);
    normals.push(m[0], m[1], m[2]);
  }
  const at = (r: number, c: number) => r * (columns + 1) + c;
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    if (r > 0) indices.push(at(r, c), at(r + 1, c), at(r, c + 1));
    if (r < rows - 1) indices.push(at(r, c + 1), at(r + 1, c), at(r + 1, c + 1));
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}

const J = JOINTS;

/** A route down a limb from joint to joint, offset a little from the bones. */
function limbRoute(joints: readonly Vec3[], offset: Vec3, r0: number, r1: number, sides = 6): Surface {
  return route(joints.map((joint) => add(joint, offset)), r0, r1, sides);
}

export type InternalPart =
  | 'aorta' | 'head-arteries' | 'forelimb-arteries' | 'coronary-arteries' | 'visceral-arteries' | 'hindlimb-arteries'
  | 'caudal-vena-cava' | 'cranial-veins' | 'forelimb-veins' | 'hindlimb-veins' | 'portal-veins'
  | 'spinal-cord' | 'spinal-nerves' | 'forelimb-nerves' | 'hindlimb-nerves' | 'vagus-phrenic' | 'cranial-nerves'
  | 'trachea' | 'diaphragm' | 'oesophagus' | 'tongue' | 'salivary-glands' | 'gall-bladder'
  | 'ureters' | 'male-ducts' | 'seminal-vesicles' | 'prostate' | 'preputial-glands' | 'penis'
  | 'thyroid' | 'thymus' | 'pituitary' | 'lymph-nodes';

export function buildInternal(grid: Grid, labels: Uint8Array, lm: Landmarks): Record<InternalPart, Surface> {
  const s = (y: number) => lm.spineAt(y);
  const aortaAt = (y: number): Vec3 => [s(y).x + 7, y, s(y).ventralZ - 8];
  const cavaAt = (y: number): Vec3 => [s(y).x - 9, y, s(y).ventralZ - 9];
  const kidneyR = lm.label(19, 'low'), kidneyL = lm.label(19, 'high');
  const testisR = lm.label(14, 'low'), testisL = lm.label(14, 'high');
  const bladder = lm.label(13), stomach = lm.label(15), spleen = lm.label(16);
  const crest: Vec3 = [196, 350, 80];

  // Arteries. Arch branches in the order of Cook figure 90: innominate, left common carotid, left subclavian.
  const descending = [400, 450, 500, 550, 600, 650, 700, 735].map(aortaAt);
  const aorta = route([[190, 392, 88], [190, 368, 86], crest, [203, 358, 84], [194, 380, 94], ...descending], 5.2, 3.6);
  const innominate: Vec3 = [176, 336, 74];
  const headArteries = mergeSurfaces([
    route([crest, [186, 345, 76], innominate], 3, 2.6),
    route([innominate, [170, 300, 70], [165, 262, 72]], 2.2, 1.9), route([crest, [205, 320, 72], [207, 285, 70], [206, 262, 74]], 2.2, 1.9),
    route([[165, 262, 72], [158, 235, 92], [165, 220, 100]], 1.6, 1.1, 6), route([[165, 262, 72], [146, 240, 62], [132, 205, 52]], 1.6, 0.9, 6),
    route([[206, 262, 74], [212, 235, 92], [205, 220, 100]], 1.6, 1.1, 6), route([[206, 262, 74], [224, 240, 62], [238, 205, 52]], 1.6, 0.9, 6),
  ]);
  const forelimbArteries = mergeSurfaces([
    route([innominate, [150, 326, 80], [130, 312, 90], add(J.shoulderR, [-3, 6, -8]), mix(J.shoulderR, J.elbowR, 0.5), add(J.elbowR, [6, -4, 2]), mix(J.elbowR, J.wristR, 0.5), add(J.wristR, [3, 0, 2])], 2.2, 0.9, 6),
    route([[203, 358, 84], [222, 336, 88], [238, 312, 96], add(J.shoulderL, [3, 6, -8]), mix(J.shoulderL, J.elbowL, 0.5), add(J.elbowL, [-6, -4, 2]), mix(J.elbowL, J.wristL, 0.5), add(J.wristL, [-3, 0, 2])], 2.2, 0.9, 6),
  ]);
  // Coronary arteries run on the surface of the source heart label.
  const heart = lm.label(9);
  const onHeart = (phi: number, theta: number): Vec3 => {
    const c = heart.centroid, r: Vec3 = [(heart.max[0] - heart.min[0]) / 2 + 1, (heart.max[1] - heart.min[1]) / 2 + 1, (heart.max[2] - heart.min[2]) / 2 + 1];
    return [c[0] + r[0] * Math.sin(theta) * Math.cos(phi), c[1] + r[1] * Math.cos(theta), c[2] + r[2] * Math.sin(theta) * Math.sin(phi)];
  };
  const arc = (phiA: number, thetaA: number, phiB: number, thetaB: number) => Array.from({ length: 9 }, (_, i) => onHeart(phiA + (phiB - phiA) * i / 8, thetaA + (thetaB - thetaA) * i / 8));
  const coronary = mergeSurfaces([route(arc(-1.2, 0.5, -1.1, 2.8), 1.2, 0.5, 6), route(arc(-1.2, 0.5, 0.9, 1.9), 1.1, 0.5, 6), route(arc(-2.4, 0.5, -3.6, 2.5), 1.1, 0.5, 6), route(arc(-1.15, 1.2, 0, 2.1), 0.8, 0.4, 5), route(arc(-3, 1.3, -2.2, 2.4), 0.8, 0.4, 5)]);
  // Abdominal branches in the order given by Hummel et al.: coeliac, superior mesenteric, renal, genital, inferior mesenteric.
  const coeliac = aortaAt(525), sma = aortaAt(545), genital = aortaAt(640), ima = aortaAt(690);
  const fan = (index: number): Vec3[] => {
    const angle = -1.1 + index * 0.44;
    const middle: Vec3 = [178, 615, 90];
    return [middle, add(middle, [Math.sin(angle) * 42, 18 + Math.cos(angle) * 34, -12 + index * 2]), add(middle, [Math.sin(angle) * 82, 22 + Math.cos(angle) * 62, -26 + index * 3])];
  };
  const visceral = mergeSurfaces([
    route([coeliac, add(coeliac, [2, 8, -22]), [194, 515, 108]], 2.1, 1.5, 6),
    route([[194, 515, 108], [185, 500, 98], [165, 500, 80]], 1.3, 0.8, 6),
    route([[194, 515, 108], [222, 530, 118], lm.label(16).centroid], 1.3, 0.8, 6),
    route([[194, 515, 108], [212, 520, 104], stomach.centroid], 1.0, 0.7, 6),
    route([sma, add(sma, [-2, 22, -28]), [178, 615, 90]], 2.3, 1.7, 6),
    ...[0, 1, 2, 3, 4, 5].map((index) => route(fan(index), 1.1, 0.4, 5)),
    route([aortaAt(585), [150, 590, s(590).ventralZ - 12], add(kidneyR.centroid, [16, 0, -3])], 1.9, 1.3, 6),
    route([aortaAt(600), [205, 604, s(600).ventralZ - 12], add(kidneyL.centroid, [-16, 0, -3])], 1.9, 1.3, 6),
    route([genital, [168, 700, 90], [150, 760, 62], testisR.centroid], 0.9, 0.6, 5),
    route([genital, [198, 690, 92], [212, 730, 66], testisL.centroid], 0.9, 0.6, 5),
    route([ima, add(ima, [-2, 26, -16]), [182, 770, 96]], 1.3, 0.7, 6),
  ]);
  const bifurcation = aortaAt(735);
  const hindlimb = mergeSurfaces([
    route([bifurcation, [160, 755, 100], add(J.hipR, [8, 2, -14]), mix(J.hipR, J.kneeR, 0.5), add(J.kneeR, [6, 6, 0]), mix(J.kneeR, J.ankleR, 0.5), add(J.ankleR, [2, -2, 2])], 2.4, 1.0, 6),
    route([bifurcation, [204, 755, 104], add(J.hipL, [-8, 2, -14]), mix(J.hipL, J.kneeL, 0.5), add(J.kneeL, [-6, 6, 0]), mix(J.kneeL, J.ankleL, 0.5), add(J.ankleL, [-2, -2, 2])], 2.4, 1.0, 6),
    route([bifurcation, ...[770, 800, 830, 860].map((y): Vec3 => [s(y).x, y, s(y).ventralZ - 5])], 1.5, 0.9, 6),
  ]);

  // Veins. The caudal vena cava lies to the right of the column and the aorta, after Hummel et al.
  const caudalVenaCava = route([cavaAt(735), cavaAt(690), cavaAt(640), cavaAt(590), [170, 540, 145], [172, 490, 118], [174, 440, 92], [176, 400, 84]], 4.6, 5.2);
  const azygos = route([[172, 545, s(545).ventralZ - 6], ...[500, 460, 420, 390].map((y): Vec3 => [s(y).x - 7, y, s(y).ventralZ - 6]), [172, 375, 92]], 1.5, 1.2, 6);
  // Two superior venae cavae, right and left, each formed by jugular and subclavian veins: Cook figure 90.
  const junctionR: Vec3 = [146, 336, 74], junctionL: Vec3 = [216, 336, 74];
  const cranial = mergeSurfaces([
    route([[172, 392, 82], [158, 365, 80], junctionR], 3.4, 3), route([[204, 396, 86], [216, 368, 80], junctionL], 3.4, 3),
    route([junctionR, [128, 300, 56], [114, 250, 44], [118, 215, 40]], 2.6, 1.3, 6), route([junctionL, [234, 300, 56], [248, 250, 44], [244, 215, 40]], 2.6, 1.3, 6),
    route([junctionR, [160, 300, 66], [157, 262, 78]], 1.5, 1.1, 6), route([junctionL, [202, 300, 66], [205, 262, 78]], 1.5, 1.1, 6),
    azygos,
  ]);
  const forelimbVeins = mergeSurfaces([
    route([junctionR, [128, 318, 76], add(J.shoulderR, [-6, 10, -14]), mix(J.shoulderR, J.elbowR, 0.5), add(J.elbowR, [3, -8, 0]), mix(J.elbowR, J.wristR, 0.5), add(J.wristR, [-3, 0, 0])], 2.3, 0.9, 6),
    route([junctionL, [234, 318, 76], add(J.shoulderL, [6, 10, -14]), mix(J.shoulderL, J.elbowL, 0.5), add(J.elbowL, [-3, -8, 0]), mix(J.elbowL, J.wristL, 0.5), add(J.wristL, [3, 0, 0])], 2.3, 0.9, 6),
  ]);
  const hindlimbVeins = mergeSurfaces([
    route([cavaAt(735), [152, 758, 92], add(J.hipR, [6, 8, -20]), mix(J.hipR, J.kneeR, 0.5), add(J.kneeR, [3, 10, -3]), mix(J.kneeR, J.ankleR, 0.5), add(J.ankleR, [-2, -2, -1])], 2.6, 1, 6),
    route([cavaAt(735), [206, 758, 96], add(J.hipL, [-6, 8, -20]), mix(J.hipL, J.kneeL, 0.5), add(J.kneeL, [-3, 10, -3]), mix(J.kneeL, J.ankleL, 0.5), add(J.ankleL, [2, -2, -1])], 2.6, 1, 6),
  ]);
  const portal = mergeSurfaces([
    route([[178, 625, 88], [180, 590, 96], [186, 545, 104], [176, 510, 104]], 2.6, 2.8),
    ...[0, 1, 2, 3].map((index) => route(fan(index * 1.6).map((p) => add(p, [3, 4, -2])), 1.2, 0.5, 5)),
    route([[186, 545, 104], [224, 555, 122], spleen.centroid], 1.3, 0.9, 6),
    route([add(kidneyR.centroid, [16, 3, -4]), [150, 598, s(590).ventralZ - 14], cavaAt(592)], 1.6, 2, 6),
    route([add(kidneyL.centroid, [-16, 3, -4]), [205, 606, s(600).ventralZ - 16], cavaAt(598)], 1.6, 2, 6),
    route([[172, 490, 118], [150, 485, 100], [128, 500, 82]], 2, 1, 6), route([[172, 490, 118], [200, 482, 100], [226, 498, 86]], 2, 1, 6),
  ]);

  // Spinal cord: the course follows the vertebral canal measured in the CT; radius is an estimate with cervical and lumbar enlargements.
  const cordPoints: Vec3[] = [], cordRadii: number[] = [];
  for (let y = 300; y <= 800; y += 5) {
    const sample = s(y);
    cordPoints.push([sample.x, y, sample.canalZ]);
    const cervical = Math.exp(-(((y - 335) / 45) ** 2)), lumbar = Math.exp(-(((y - 665) / 45) ** 2));
    const taper = Math.min(1, Math.max(0.22, (790 - y) / 90));
    cordRadii.push((5 + 2.6 * cervical + 2.2 * lumbar) * taper);
  }
  const spinalCord = tube(cordPoints, cordRadii, 10);
  // Seven cervical, thirteen thoracic, six lumbar and four sacral levels, from the vertebral formula in Hummel et al.
  const levels: { y: number; kind: 'c' | 't' | 'l' | 's' }[] = [];
  const spread = (from: number, to: number, count: number, kind: 'c' | 't' | 'l' | 's') => { for (let i = 0; i < count; i++) levels.push({ y: from + (to - from) * (i + 0.5) / count, kind }); };
  spread(295, 345, 8, 'c'); spread(345, 590, 13, 't'); spread(590, 720, 6, 'l'); spread(720, 800, 4, 's');
  const nerves: Surface[] = [];
  for (const level of levels) for (const side of [-1, 1] as const) {
    const sample = s(level.y);
    const root: Vec3 = [sample.x, level.y, sample.canalZ];
    const reach = level.kind === 't' ? 82 : level.kind === 'c' ? 34 : 42;
    const fall = level.kind === 't' ? 62 : 26;
    nerves.push(route([root, [root[0] + side * 12, level.y + 2, root[2] - 4], [root[0] + side * reach * 0.6, level.y + 10, root[2] - fall * 0.35], [root[0] + side * reach, level.y + 22, root[2] - fall]], 0.85, 0.35, 5));
  }
  const plexus = (side: 'R' | 'L') => {
    const sign = side === 'R' ? -1 : 1, shoulder = side === 'R' ? J.shoulderR : J.shoulderL, elbow = side === 'R' ? J.elbowR : J.elbowL, wrist = side === 'R' ? J.wristR : J.wristL;
    const gather: Vec3 = add(shoulder, [sign * -10, 16, -6]);
    const roots = [318, 328, 338, 348, 358].map((y) => route([[s(y).x, y, s(y).canalZ], [s(y).x + sign * 22, y + 4, s(y).canalZ - 10], gather], 0.9, 0.9, 5));
    return [...roots,
      route([gather, mix(shoulder, elbow, 0.5), add(elbow, [sign * -5, -3, 3]), mix(elbow, wrist, 0.5), add(wrist, [sign * -2, 0, 3])], 1, 0.5, 5),
      route([gather, add(mix(shoulder, elbow, 0.5), [0, 3, 4]), add(elbow, [sign * 2, 4, 5]), add(mix(elbow, wrist, 0.5), [sign * 2, 0, 3]), add(wrist, [sign * 3, 0, 3])], 0.9, 0.45, 5),
      route([gather, add(mix(shoulder, elbow, 0.45), [0, 5, 7]), add(elbow, [sign * 4, 0, 8])], 0.9, 0.5, 5),
    ];
  };
  const sacralPlexus = (side: 'R' | 'L') => {
    const sign = side === 'R' ? -1 : 1, hip = side === 'R' ? J.hipR : J.hipL, knee = side === 'R' ? J.kneeR : J.kneeL, ankle = side === 'R' ? J.ankleR : J.ankleL;
    const gather: Vec3 = add(hip, [sign * -12, 14, 4]);
    const roots = [690, 710, 730, 750].map((y) => route([[s(y).x, y, s(y).canalZ], [s(y).x + sign * 24, y + 8, s(y).canalZ - 8], gather], 1, 1, 5));
    return [...roots,
      // The sciatic nerve runs behind the femur and divides above the knee.
      route([gather, add(mix(hip, knee, 0.5), [0, 9, 6]), add(mix(hip, knee, 0.85), [0, 8, 3])], 1.5, 1.2, 6),
      route([add(mix(hip, knee, 0.85), [0, 8, 3]), add(knee, [sign * -4, 12, 2]), add(mix(knee, ankle, 0.5), [sign * -3, 0, 4]), add(ankle, [sign * -3, 0, 3])], 1, 0.5, 5),
      route([add(mix(hip, knee, 0.85), [0, 8, 3]), add(knee, [sign * 2, 8, -3]), add(mix(knee, ankle, 0.5), [sign * 3, 0, -3]), add(ankle, [sign * 2, -3, 2])], 0.9, 0.45, 5),
      // The femoral nerve runs in front of the thigh.
      route([[s(700).x + sign * 18, 700, s(700).ventralZ - 2], add(hip, [sign * -4, -8, -12]), add(mix(hip, knee, 0.55), [0, -7, -6])], 1, 0.5, 5),
    ];
  };
  const vagus = (side: 'R' | 'L'): Surface[] => {
    const x = side === 'R' ? 160 : 202, sign = side === 'R' ? -1 : 1;
    const main = route([[M + sign * 16, 262, 108], [x, 262, 80], [x + sign * -2, 300, 72], [x + sign * -6, 345, 74], [M + sign * 10, 400, 100], [M + sign * 8, 460, 128], [200 + sign * 6, 505, 132]], 0.8, 0.5, 5);
    const phrenic = route([[s(325).x + sign * 20, 325, 96], [x + sign * 6, 345, 78], [M + sign * 42, 400, 60], [M + sign * 44, 440, 70]], 0.5, 0.35, 5);
    return [main, phrenic];
  };
  const eyes = [lm.label(3, 'low'), lm.label(3, 'high')];
  const chiasm: Vec3 = [189, 198, 92];
  const cranialNerves = mergeSurfaces([
    route([eyes[0].centroid, [172, 175, 96], chiasm], 0.9, 0.9, 6), route([eyes[1].centroid, [206, 175, 96], chiasm], 0.9, 0.9, 6), route([chiasm, [189, 215, 95]], 1, 0.9, 6),
    ...[-1, 1].flatMap((sign) => {
      const ganglion: Vec3 = [M + sign * 24, 222, 86];
      return [
        route([[M + sign * 12, 240, 100], ganglion], 1.5, 1.5, 6),
        route([ganglion, [M + sign * 32, 180, 92], [M + sign * 36, 140, 90]], 0.8, 0.4, 5),
        route([ganglion, [M + sign * 30, 170, 74], [M + sign * 26, 110, 62], [M + sign * 22, 80, 54]], 1, 0.5, 5),
        route([ganglion, [M + sign * 30, 200, 62], [M + sign * 22, 150, 40]], 0.9, 0.45, 5),
        route([[M + sign * 16, 245, 104], [M + sign * 46, 240, 80], [M + sign * 44, 190, 62], [M + sign * 34, 120, 56]], 0.7, 0.35, 5),
      ];
    }),
  ]);

  // Respiratory: larynx and a ringed trachea with its bronchi. The rings follow Cook figure 46.
  const trachealPoints = curve([[190, 262, 66], [189, 300, 70], [188, 345, 70], [186, 385, 90]], 1.5);
  const trachea = mergeSurfaces([
    tube(trachealPoints, trachealPoints.map((_, i) => 6.2 + 0.7 * Math.sin(i * 1.6)), 12),
    route([[186, 385, 90], [160, 410, 104], [136, 432, 110]], 4.2, 2.2, 8), route([[186, 385, 90], [210, 408, 106], [222, 432, 120]], 4.2, 2.2, 8),
    route([[160, 410, 104], [150, 395, 112]], 2.4, 1.5, 6), route([[160, 410, 104], [150, 432, 92]], 2.4, 1.5, 6), route([[210, 408, 106], [222, 395, 118]], 2.4, 1.5, 6),
    blob([190, 250, 66], [12, 16, 11]),
  ]);
  const oesophagus = route([[189, 250, 84], [187, 300, 84], [187, 355, 80], [186, 410, 104], [190, 460, 128], [204, 508, 136]], 4.6, 4.2, 10);

  const tongue = mergeSurfaces([route([[188, 88, 40], [188, 120, 42], [188, 160, 46], [188, 205, 52]], 7, 10, 12), blob([188, 86, 40], [7, 7, 5])]);
  const salivary = mergeSurfaces([-1, 1].flatMap((sign) => [
    blob([M + sign * 22, 292, 46], [17, 30, 13]), blob([M + sign * 26, 312, 46], [9, 14, 9]), blob([M + sign * 58, 268, 74], [12, 27, 19]),
  ]));
  const gallBladder = route([[170, 492, 34], [172, 505, 36], [176, 515, 44]], 5, 1.4, 10);
  const ureters = mergeSurfaces([
    route([add(kidneyR.centroid, [14, 5, -8]), [146, 640, 118], [150, 680, 90], add(bladder.centroid, [-10, 8, 24])], 1, 0.8, 6),
    route([add(kidneyL.centroid, [-14, 5, -8]), [205, 650, 118], [192, 685, 92], add(bladder.centroid, [12, 8, 24])], 1, 0.8, 6),
    route([add(bladder.centroid, [4, 36, -2]), [176, 770, 42], [178, 820, 32], [178, 860, 26]], 1.7, 1.2, 6),
  ]);
  const ducts = (testis: { centroid: Vec3; min: Vec3; max: Vec3 }, sign: -1 | 1): Surface[] => {
    const c = testis.centroid;
    const side = sign * ((testis.max[0] - testis.min[0]) / 2 - 2);
    const caudal: Vec3 = [c[0] + side, testis.max[1] - 4, c[2]];
    const cranial2: Vec3 = [c[0] + side, testis.min[1] + 4, c[2] + 6];
    return [
      route([cranial2, [c[0] + side + sign * 3, c[1], c[2] + 3], caudal], 5, 5.5, 10),
      route([caudal, [c[0] + side - sign * 8, c[1] + 6, c[2] + 12], [c[0] - sign * 2, testis.min[1] - 6, c[2] + 28], [M + sign * 8, 752, 66], [176, 752, 44]], 1.3, 1.1, 6),
    ];
  };
  const maleDucts = mergeSurfaces([...ducts(testisR, -1), ...ducts(testisL, 1)]);
  const seminal = mergeSurfaces([-1, 1].flatMap((sign) => [
    route([[M + sign * 9, 748, 62], [M + sign * 18, 722, 86], [M + sign * 22, 690, 104], [M + sign * 12, 668, 116]], 5, 3, 10),
    route([[M + sign * 11, 742, 56], [M + sign * 26, 716, 76], [M + sign * 30, 695, 88]], 3, 1.8, 8),
  ]));
  const prostate = mergeSurfaces([blob([174, 750, 50], [15, 11, 11]), blob([174, 752, 66], [14, 10, 6])]);
  const preputial = mergeSurfaces([blob([164, 846, 24], [8, 15, 6]), blob([194, 846, 24], [8, 15, 6])]);
  const penis = route([[178, 815, 30], [178, 850, 24], [178, 880, 24]], 5.5, 3.6, 10);
  const thyroid = mergeSurfaces([blob([178, 288, 67], [5, 14, 8]), blob([201, 288, 67], [5, 14, 8]), route([[178, 292, 62], [201, 292, 62]], 1.6, 1.6, 6)]);
  const thymus = mergeSurfaces([blob([170, 345, 62], [17, 26, 14]), blob([208, 345, 62], [17, 26, 14])]);
  const pituitary = blob([189, 216, 91], [6, 4.4, 3]);

  // Lymph nodes by the list and locations in Hummel et al. Each is an estimated body at the described location.
  const node = (centre: Vec3, radius: number, stretch = 1): Surface => blob(centre, [radius, radius * stretch, radius], 8, 12);
  const pair = (p: Vec3, radius: number, stretch = 1): Surface[] => [node(p, radius, stretch), node(mirror(p), radius, stretch)];
  const lymph = mergeSurfaces([
    ...pair([158, 266, 34], 5, 1.4), ...pair([176, 300, 58], 3.5, 1.3), ...pair([108, 345, 66], 7, 1.2),
    node(add(mix(J.shoulderR, J.elbowR, 0.55), [0, -7, -7]), 5.5, 1.2), node(add(mix(J.shoulderL, J.elbowL, 0.55), [0, -7, -7]), 5.5, 1.2),
    ...pair([92, 735, 40], 8, 1.3), ...pair([106, 800, 92], 3.8), ...pair([176, 372, 96], 3.6), node([190, 392, 104], 3.4),
    node([214, 566, 112], 4, 1.2), node([224, 574, 116], 3.6, 1.2), node([150, 608, 132], 3.2), node([205, 615, 134], 3.2),
    ...pair([172, 725, s(725).ventralZ - 15], 3), node([186, 640, 82], 5.5, 2.6), node([182, 752, s(750).ventralZ - 12], 2.8),
  ]);

  return {
    aorta, 'head-arteries': headArteries, 'forelimb-arteries': forelimbArteries, 'coronary-arteries': coronary, 'visceral-arteries': visceral, 'hindlimb-arteries': hindlimb,
    'caudal-vena-cava': caudalVenaCava, 'cranial-veins': cranial, 'forelimb-veins': forelimbVeins, 'hindlimb-veins': hindlimbVeins, 'portal-veins': portal,
    'spinal-cord': spinalCord, 'spinal-nerves': mergeSurfaces(nerves), 'forelimb-nerves': mergeSurfaces([...plexus('R'), ...plexus('L')]), 'hindlimb-nerves': mergeSurfaces([...sacralPlexus('R'), ...sacralPlexus('L')]),
    'vagus-phrenic': mergeSurfaces([...vagus('R'), ...vagus('L')]), 'cranial-nerves': cranialNerves,
    trachea, diaphragm: buildDiaphragm(grid, labels), oesophagus, tongue, 'salivary-glands': salivary, 'gall-bladder': gallBladder,
    ureters, 'male-ducts': maleDucts, 'seminal-vesicles': seminal, prostate, 'preputial-glands': preputial, penis,
    thyroid, thymus, pituitary, 'lymph-nodes': lymph,
  };
}

/** A thin sheet between the source thoracic and abdominal labels, within the body wall. */
function buildDiaphragm(grid: Grid, labels: Uint8Array): Surface {
  const cell = 2;
  const nx = Math.floor(grid.nx / cell), nz = Math.floor(grid.nz / cell);
  const thorax = new Float32Array(nx * nz), abdomen = new Float32Array(nx * nz).fill(Infinity);
  const inside = new Uint8Array(nx * nz);
  const THORAX = new Set([9, 21]), ABDOMEN = new Set([15, 16, 18]);
  for (let z = 0; z < grid.nz; z++) for (let y = 330; y < 650; y++) for (let x = 0; x < grid.nx; x++) {
    const label = labels[voxelIndex(grid, x, y, z)];
    const at = (z >> 1) * nx + (x >> 1);
    if (x >> 1 >= nx || z >> 1 >= nz) continue;
    if (THORAX.has(label) && y > thorax[at]) thorax[at] = y;
    if (ABDOMEN.has(label) && y < abdomen[at]) abdomen[at] = y;
  }
  // Known heights are the midpoint between lung and liver; the rest of the disc is filled by diffusion.
  let height = new Float32Array(nx * nz);
  const known = new Uint8Array(nx * nz);
  let sum = 0, count = 0;
  for (let i = 0; i < height.length; i++) {
    if (thorax[i] > 0 && abdomen[i] < Infinity && abdomen[i] > thorax[i]) { height[i] = (thorax[i] + abdomen[i]) / 2; known[i] = 1; sum += height[i]; count++; }
    else if (abdomen[i] < Infinity) { height[i] = abdomen[i] - 4; known[i] = 1; sum += height[i]; count++; }
  }
  const mean = sum / count;
  for (let i = 0; i < height.length; i++) if (!known[i]) height[i] = mean;
  for (let pass = 0; pass < 240; pass++) {
    const next = height.slice();
    for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) {
      const at = z * nx + x;
      if (known[at]) continue;
      next[at] = (height[at - 1] + height[at + 1] + height[at - nx] + height[at + nx]) / 4;
    }
    height = next;
  }
  const planar = smoothField(height, { nx, ny: nz, nz: 1 }, 3);
  // The sheet stops one millimetre inside the body surface at its own height.
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const y = Math.round(planar[z * nx + x]);
    let solid = 0;
    for (const [dx, dz] of [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]] as const) {
      const xx = 2 * x + dx, zz = 2 * z + dz;
      if (xx >= 0 && zz >= 0 && xx < grid.nx && zz < grid.nz && y >= 0 && y < grid.ny && labels[voxelIndex(grid, xx, y, zz)]) solid++;
    }
    inside[z * nx + x] = solid === 5 ? 1 : 0;
  }
  const yLow = Math.floor(Math.min(...planar)) - 6, yHigh = Math.ceil(Math.max(...planar)) + 6;
  const local: Grid = { nx, ny: Math.ceil((yHigh - yLow) / cell) + 1, nz };
  const field = new Float32Array(local.nx * local.ny * local.nz).fill(-1);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    if (!inside[z * nx + x]) continue;
    for (let j = 0; j < local.ny; j++) field[voxelIndex(local, x, j, z)] = Math.max(-2, 3 - Math.abs(yLow + j * cell - planar[z * nx + x]));
  }
  return surfaceNets(smoothField(field, local, 1), local, 0, [0, yLow, 0], cell);
}
