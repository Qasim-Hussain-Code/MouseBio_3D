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
import { add, JOINTS, scale, unit, type Vec3 } from './rig';
import { VERTEBRAE, type RibLines } from './bones';
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
  | 'aorta' | 'innominate-artery' | 'common-carotid-arteries' | 'internal-carotid-arteries' | 'external-carotid-arteries' | 'coronary-arteries'
  | 'coeliac-arteries' | 'common-hepatic-artery' | 'gastric-arteries' | 'lienal-arteries' | 'lieno-pancreatic-artery' | 'superior-pancreaticoduodenal-artery'
  | 'superior-mesenteric-artery' | 'jejunal-ileal-arteries' | 'inferior-pancreaticoduodenal-artery' | 'ileocolic-artery' | 'renal-artery-stems' | 'suprarenal-arteries' | 'testicular-arteries' | 'inferior-mesenteric-artery' | 'inferior-vesical-arteries' | 'superficial-temporal-arteries'
  | 'caudal-vena-cava' | 'superior-venae-cavae' | 'external-jugular-veins' | 'anterior-jugular-veins' | 'posterior-facial-veins' | 'superficial-temporal-veins' | 'anterior-facial-veins' | 'internal-jugular-veins' | 'azygos-vein'
  | 'portal-vein' | 'superior-mesenteric-vein' | 'jejunal-ileal-veins' | 'ileocolic-vein' | 'inferior-mesenteric-vein' | 'lienal-vein' | 'gastric-vein' | 'pancreaticoduodenal-veins' | 'renal-vein-stems' | 'suprarenal-veins' | 'inferior-phrenic-veins' | 'testicular-veins' | 'hypogastric-veins' | 'hepatic-vein-stems'
  | 'spinal-cord' | 'cervical-nerves' | 'thoracic-nerves' | 'lumbar-nerves' | 'sacral-nerves' | 'vagus-nerves' | 'recurrent-laryngeal-nerves' | 'phrenic-nerves'
  | 'optic-nerves' | 'trigeminal-roots' | 'ophthalmic-nerves' | 'maxillary-nerves' | 'mandibular-nerves' | 'facial-nerves'
  | 'olfactory-nerves' | 'oculomotor-nerves' | 'trochlear-nerves' | 'abducens-nerves' | 'vestibulocochlear-nerves' | 'glossopharyngeal-nerves' | 'accessory-nerves' | 'hypoglossal-nerves'
  | 'cervical-lymph-nodes' | 'axillary-lymph-nodes' | 'brachial-lymph-nodes' | 'inguinal-lymph-nodes' | 'sciatic-lymph-nodes' | 'mediastinal-lymph-nodes' | 'pyloric-lymph-nodes' | 'renal-lymph-nodes' | 'lumbar-lymph-nodes' | 'mesenteric-lymph-node' | 'caudal-lymph-node'
  | 'trachea' | 'diaphragm' | 'oesophagus' | 'tongue' | 'submandibular-glands' | 'sublingual-glands' | 'parotid-glands' | 'nasal-cavities' | 'turbinals' | 'soft-palate' | 'pharynx' | 'gall-bladder'
  | 'ureters' | 'male-ducts' | 'seminal-vesicles' | 'prostate' | 'preputial-glands' | 'penis'
  | 'thyroid' | 'thymus' | 'pituitary' | 'lymph-vessels' | 'cerebral-base'
  | 'incisors' | 'molars' | 'root-ganglia' | 'sympathetic-trunks' | 'coeliac-ganglia' | 'inner-ears'
  | 'intervertebral-discs' | 'xiphoid-cartilage' | 'intercostal-arteries' | 'intercostal-veins'
  | 'middle-ears' | 'pineal' | 'parathyroids' | 'mammary-arteries' | 'mammary-veins'
  | 'larynx' | 'tracheal-rings' | 'bile-ducts' | 'pancreatic-ducts' | 'brown-fat' | 'accessory-glands' | 'brain-ventricles';

export function buildInternal(grid: Grid, labels: Uint8Array, lm: Landmarks, ribLines: RibLines, gut: { readonly caecum: Vec3; readonly small: Vec3 }): Record<InternalPart, Surface> {
  const s = (y: number) => lm.spineAt(y);
  // Superficial structures are held under the surface of the specimen: a point moves towards a place inside the body until it lies the given depth within the labels.
  const inBody = (p: Vec3) => {
    const x = Math.round(p[0]), y = Math.round(p[1]), z = Math.round(p[2]);
    return x >= 0 && y >= 0 && z >= 0 && x < grid.nx && y < grid.ny && z < grid.nz && labels[voxelIndex(grid, x, y, z)] !== 0;
  };
  const under = (p: Vec3, towards: Vec3, depth: number): Vec3 => {
    const reach: readonly Vec3[] = [[0, 0, 0], [depth, 0, 0], [-depth, 0, 0], [0, depth, 0], [0, -depth, 0], [0, 0, depth], [0, 0, -depth]];
    for (let t = 0; t <= 1; t += 0.02) {
      const q = mix(p, towards, t);
      if (reach.every((step) => inBody(add(q, step)))) return q;
    }
    return towards;
  };
  const aortaAt = (y: number): Vec3 => [s(y).x + 7, y, s(y).ventralZ - 8];
  const cavaAt = (y: number): Vec3 => [s(y).x - 9, y, s(y).ventralZ - 9];
  // Where a line from inside an organ of the source labels leaves it, so that a vessel runs on the organ and not through it.
  const onLabel = (label: number, from: Vec3, way: Vec3): Vec3 => {
    const step = unit(way);
    let last = from;
    for (let t = 1; t < 200; t++) {
      const q = add(from, scale(step, t));
      const x = Math.round(q[0]), y = Math.round(q[1]), z = Math.round(q[2]);
      if (x < 0 || y < 0 || z < 0 || x >= grid.nx || y >= grid.ny || z >= grid.nz) break;
      if (labels[voxelIndex(grid, x, y, z)] === label) last = q;
    }
    return last;
  };
  const kidneyR = lm.label(19, 'low'), kidneyL = lm.label(19, 'high');
  const testisR = lm.label(14, 'low'), testisL = lm.label(14, 'high');
  const bladder = lm.label(13), stomach = lm.label(15), spleen = lm.label(16);
  const crest: Vec3 = [196, 350, 80];

  // Arteries. Arch branches in the order of Cook figure 90: innominate, left common carotid, left subclavian.
  const descending = [400, 450, 500, 550, 600, 650, 700, 735].map(aortaAt);
  const aorta = route([[190, 392, 88], [190, 368, 86], crest, [203, 358, 84], [194, 380, 94], ...descending], 5.2, 3.6);
  const innominate: Vec3 = [176, 336, 74];
  const innominateArtery = route([crest, [186, 345, 76], innominate], 3, 2.6);
  const commonCarotids = mergeSurfaces([route([innominate, [170, 300, 70], [165, 262, 72]], 2.2, 1.9), route([crest, [205, 320, 72], [207, 285, 70], [206, 262, 74]], 2.2, 1.9)]);
  const internalCarotids = mergeSurfaces([route([[165, 262, 72], [158, 235, 92], [165, 220, 100]], 1.6, 1.1, 6), route([[206, 262, 74], [212, 235, 92], [205, 220, 100]], 1.6, 1.1, 6)]);
  const externalCarotids = mergeSurfaces([route([[165, 262, 72], [146, 240, 62], [132, 205, 52]], 1.6, 0.9, 6), route([[206, 262, 74], [224, 240, 62], [238, 205, 52]], 1.6, 0.9, 6)]);
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
  // The branches of the coeliac artery are those of Cook figures 79 and 80. Their names and order follow the plates, and their courses are estimates placed on the organs.
  const coeliacDivision: Vec3 = [194, 515, 108];
  const coeliacArteries = route([coeliac, add(coeliac, [2, 8, -22]), coeliacDivision], 2.1, 1.5, 6);
  const commonHepaticArtery = route([coeliacDivision, [185, 500, 98], [165, 500, 80]], 1.3, 0.8, 6);
  const superiorPancreaticoduodenal = route([[176, 500, 90], [160, 515, 88], [150, 540, 96], [146, 560, 100]], 0.8, 0.4, 5);
  // A gastric artery branching over the near face of the stomach.
  const stomachFace = (x: number, y: number) => onLabel(15, stomach.centroid, [x, y, -1]);
  const gastricArteries = mergeSurfaces([
    route([coeliacDivision, [212, 520, 104], stomachFace(-0.5, -0.2)], 1, 0.7, 6),
    route([stomachFace(-0.5, -0.2), stomachFace(-0.1, -0.3), stomachFace(0.4, -0.4)], 0.6, 0.3, 5),
    route([stomachFace(-0.5, -0.2), stomachFace(-0.1, 0.1), stomachFace(0.4, 0.2)], 0.6, 0.3, 5),
    route([stomachFace(-0.5, -0.2), stomachFace(-0.2, 0.5), stomachFace(0.2, 0.7)], 0.5, 0.25, 5),
  ]);
  const spleenHilum = onLabel(16, spleen.centroid, [-1, 0, -0.3]);
  const lienalArteries = mergeSurfaces([
    route([coeliacDivision, [222, 530, 118], spleenHilum], 1.3, 0.8, 6),
    // The lieno-gastric branch, to the far side of the stomach.
    route([[222, 530, 118], [228, 520, 112], stomachFace(0.8, 0.1)], 0.6, 0.3, 5),
  ]);
  const pancreas = lm.label(17);
  const lienoPancreatic = route([coeliacDivision, [204, 535, 116], add(pancreas.centroid, [8, -6, 4]), add(spleenHilum, [-6, 22, 4])], 0.9, 0.45, 5);
  const superiorMesenteric = route([sma, add(sma, [-2, 22, -28]), [178, 615, 90]], 2.3, 1.7, 6);
  const jejunalIleal = mergeSurfaces([0, 1, 2, 3, 4, 5].map((index) => route(fan(index), 1.1, 0.4, 5)));
  const inferiorPancreaticoduodenal = route([add(sma, [-2, 22, -28]), [156, 575, 96], [144, 590, 100]], 0.8, 0.4, 5);
  const ileocolic = route([[178, 615, 90], add([178, 615, 90], scale(unit(add(gut.caecum, [-178, -615, -90])), 40)), gut.caecum], 1, 0.5, 5);
  // After Cook figures 110 and 112: a superior suprarenal artery from the aorta, and an inferior from the renal artery.
  const adrenalR = lm.label(20, 'low'), adrenalL = lm.label(20, 'high');
  const suprarenalArteries = mergeSurfaces([
    route([aortaAt(560), add(adrenalL.centroid, [-5, 0, 0])], 0.5, 0.3, 5),
    route([add(kidneyL.centroid, [-24, -6, -3]), add(adrenalL.centroid, [-3, 4, 0])], 0.45, 0.28, 5),
    route([aortaAt(555), add(adrenalR.centroid, [5, 0, 0])], 0.5, 0.3, 5),
    route([add(kidneyR.centroid, [24, -6, -3]), add(adrenalR.centroid, [3, 4, 0])], 0.45, 0.28, 5),
  ]);
  const renalArteryStems = mergeSurfaces([
    route([aortaAt(585), [150, 590, s(590).ventralZ - 12], add(kidneyR.centroid, [16, 0, -3])], 1.9, 1.3, 6),
    route([aortaAt(600), [205, 604, s(600).ventralZ - 12], add(kidneyL.centroid, [-16, 0, -3])], 1.9, 1.3, 6),
  ]);
  const testicularArteries = mergeSurfaces([
    route([genital, [168, 700, 90], [150, 760, 62], testisR.centroid], 0.9, 0.6, 5),
    route([genital, [198, 690, 92], [212, 730, 66], testisL.centroid], 0.9, 0.6, 5),
  ]);
  const inferiorMesenteric = route([ima, add(ima, [-2, 26, -16]), [182, 770, 96]], 1.3, 0.7, 6);

  // Veins. The caudal vena cava lies to the right of the column and the aorta, after Hummel et al.
  const caudalVenaCava = route([cavaAt(735), cavaAt(690), cavaAt(640), cavaAt(590), [170, 540, 145], [172, 490, 118], [174, 440, 92], [176, 400, 84]], 4.6, 5.2);
  // The azygos vein runs on the left of the aorta and joins the left superior vena cava: Cook figure 95.
  const azygos = route([...[525, 500, 460, 420].map((y): Vec3 => [s(y).x + 14, y, s(y).ventralZ - 6]), [s(395).x + 17, 395, s(395).ventralZ - 8], [208, 382, 84]], 1.2, 1.5, 6);
  // Two superior venae cavae, right and left, each formed by jugular and subclavian veins: Cook figure 90.
  const junctionR: Vec3 = [146, 336, 74], junctionL: Vec3 = [216, 336, 74];
  const superiorVenaeCavae = mergeSurfaces([route([[172, 392, 82], [158, 365, 80], junctionR], 3.4, 3), route([[204, 396, 86], [216, 368, 80], junctionL], 3.4, 3)]);
  const externalJugulars = mergeSurfaces([
    route([junctionR, under([128, 300, 56], [150, 300, 66], 3), under([114, 250, 44], [150, 250, 66], 3), under([118, 215, 40], [150, 215, 58], 3)], 2.6, 1.3, 6),
    route([junctionL, under([234, 300, 56], [212, 300, 66], 3), under([248, 250, 44], [212, 250, 66], 3), under([244, 215, 40], [212, 215, 58], 3)], 2.6, 1.3, 6),
  ]);
  const internalJugulars = mergeSurfaces([route([junctionR, [160, 300, 66], [157, 262, 78]], 1.5, 1.1, 6), route([junctionL, [202, 300, 66], [205, 262, 78]], 1.5, 1.1, 6)]);
  // The hepatic portal system of Cook figures 81 to 83.
  const portalVein = route([[180, 590, 96], [186, 545, 104], [176, 510, 104]], 2.7, 2.8);
  const superiorMesentericVein = route([[178, 625, 88], [180, 590, 96]], 2.4, 2.6);
  const jejunalIlealVeins = mergeSurfaces([0, 1, 2, 3].map((index) => route(fan(index * 1.6).map((p) => add(p, [3, 4, -2])), 1.2, 0.5, 5)));
  const ileocolicVein = route([[179, 618, 88], add([180, 618, 88], scale(unit(add(gut.caecum, [-178, -615, -90])), 40)), add(gut.caecum, [2, -2, -1])], 1.1, 0.55, 5);
  const inferiorMesentericVein = route([[180, 592, 94], [184, 640, 92], [184, 710, 92], [183, 770, 94]], 1.2, 0.6, 5);
  const lienalVein = route([[186, 545, 104], [224, 555, 122], add(spleenHilum, [-1, 2, -1])], 1.4, 0.9, 6);
  const gastricVein = mergeSurfaces([
    route([[186, 540, 104], [206, 526, 104], stomachFace(-0.4, -0.05)], 0.9, 0.6, 5),
    route([stomachFace(-0.4, -0.05), stomachFace(0, 0.25), stomachFace(0.45, 0.35)], 0.55, 0.28, 5),
  ]);
  const pancreaticoduodenalVeins = mergeSurfaces([
    route([[180, 520, 104], [162, 520, 94], [152, 545, 98]], 0.7, 0.35, 5),
    route([[181, 585, 97], [158, 580, 98], [146, 593, 102]], 0.7, 0.35, 5),
  ]);
  const suprarenalVeins = mergeSurfaces([
    route([add(adrenalL.centroid, [-3, 5, 0]), add(kidneyL.centroid, [-26, -4, -5])], 0.45, 0.35, 5),
    route([add(adrenalR.centroid, [3, 5, 0]), cavaAt(575)], 0.45, 0.4, 5),
  ]);
  // The inferior phrenic vein of Cook figure 112 joins the left suprarenal vein, and comes down from the diaphragm.
  const inferiorPhrenicVeins = route([[M + 14, 470, s(470).ventralZ - 24], [M + 16, 510, s(510).ventralZ - 14], add(adrenalL.centroid, [-3, -2, 0])], 0.4, 0.5, 5);
  // The spermatic veins of Cook figures 115 and 116, beside their arteries.
  const testicularVeins = mergeSurfaces([
    route([cavaAt(660), [165, 702, 88], [147, 760, 60], add(testisR.centroid, [2, -3, 2])], 0.7, 0.8, 5),
    route([add(kidneyL.centroid, [-22, 4, -6]), [197, 660, 92], [200, 695, 90], [214, 730, 64], add(testisL.centroid, [-2, -3, 2])], 0.7, 0.8, 5),
  ]);
  // Where the iliac vessels divide on each side, as in the routes of the limbs. The vessels of the pelvis are those of Cook figures 115 and 116.
  const pelvis = (sign: number): Vec3 => [aortaAt(735)[0] + sign * 26, 762, aortaAt(735)[2] - 4];
  const hypogastricVeins = mergeSurfaces([-1, 1].flatMap((sign) => [
    route([add(pelvis(sign), [sign * 3, 2, -6]), add(pelvis(sign), [-sign * 6, 24, 2]), add(pelvis(sign), [-sign * 10, 44, 6])], 1.3, 0.6, 5),
    // The vesical veins, to the side of the bladder.
    route([add(pelvis(sign), [-sign * 6, 24, 2]), onLabel(13, bladder.centroid, [sign, -0.3, 0.2])], 0.5, 0.3, 5),
  ]));
  const inferiorVesicalArteries = mergeSurfaces([-1, 1].map((sign) => route([add(pelvis(sign), [-sign * 3, 16, 10]), add(pelvis(sign), [-sign * 9, 26, 5]), onLabel(13, bladder.centroid, [sign, -0.1, 0.4])], 0.5, 0.25, 5)));
  const renalVeinStems = mergeSurfaces([
    route([add(kidneyR.centroid, [16, 3, -4]), [150, 598, s(590).ventralZ - 14], cavaAt(592)], 1.6, 2, 6),
    route([add(kidneyL.centroid, [-16, 3, -4]), [205, 606, s(600).ventralZ - 16], cavaAt(598)], 1.6, 2, 6),
  ]);
  const hepaticVeinStems = mergeSurfaces([route([[172, 490, 118], [150, 485, 100], [128, 500, 82]], 2, 1, 6), route([[172, 490, 118], [200, 482, 100], [226, 498, 86]], 2, 1, 6)]);

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
  // Eight cervical, thirteen thoracic, six lumbar and four sacral pairs, as Sleigh et al. (2020) count them in the mouse, with each ganglion level with a disc. The first cervical pair leaves above the atlas, and the others at the lower end of the vertebra before them, on the vertebrae measured in the CT.
  const kindOf = (id: string): 'c' | 't' | 'l' | 's' | null => id.startsWith('ca') ? null : id[0] === 'c' ? 'c' : id[0] === 't' ? 't' : id[0] === 'l' ? 'l' : 's';
  const levels: { y: number; kind: 'c' | 't' | 'l' | 's'; id: string }[] = [
    { y: VERTEBRAE[0].from, kind: 'c', id: 'c1' },
    ...VERTEBRAE.flatMap((vertebra, index) => {
      const kind = kindOf(vertebra.id);
      if (!kind) return [];
      const name = kind === 'c' ? `c${index + 2}` : vertebra.id;
      return [{ y: vertebra.to, kind, id: name }];
    }),
  ];
  const nerves: Record<'c' | 't' | 'l' | 's', Surface[]> = { c: [], t: [], l: [], s: [] };
  for (const level of levels) for (const side of [-1, 1] as const) {
    const sample = s(level.y);
    const root: Vec3 = [sample.x, level.y, sample.canalZ];
    const reach = level.kind === 't' ? 82 : level.kind === 'c' ? 34 : 42;
    const fall = level.kind === 't' ? 62 : 26;
    nerves[level.kind].push(route([root, [root[0] + side * 12, level.y + 2, root[2] - 4], [root[0] + side * reach * 0.6, level.y + 10, root[2] - fall * 0.35], under([root[0] + side * reach, level.y + 22, root[2] - fall], [root[0] + side * 12, level.y + 22, root[2] - fall], 2)], 0.85, 0.35, 5));
  }
  const vagus = (side: 'R' | 'L') => {
    const x = side === 'R' ? 160 : 202, sign = side === 'R' ? -1 : 1;
    const main = route([[M + sign * 16, 262, 108], [x, 262, 80], [x + sign * -2, 300, 72], [x + sign * -6, 345, 74], [M + sign * 10, 400, 100], [M + sign * 8, 460, 128], [200 + sign * 6, 505, 132]], 0.8, 0.5, 5);
    const phrenic = route([[s(325).x + sign * 20, 325, 96], [x + sign * 6, 345, 78], [M + sign * 42, 400, 60], [M + sign * 44, 440, 70]], 0.5, 0.35, 5);
    // Back under the arch of the aorta on the left, as in Cook figure 91, and under the subclavian artery on the right, then forward beside the trachea to the larynx. The course on the right is an estimate.
    const laryngeal = side === 'L'
      ? route([[x + 4, 345, 74], [198, 372, 92], [186, 362, 92], [183, 320, 78], [183, 270, 72]], 0.35, 0.28, 5)
      : route([[x + 2, 322, 72], [150, 334, 80], [170, 322, 80], [175, 290, 74], [177, 262, 72]], 0.35, 0.28, 5);
    return { main, phrenic, laryngeal };
  };
  const eyes = [lm.label(3, 'low'), lm.label(3, 'high')];
  const chiasm: Vec3 = [189, 198, 92];
  // Points of the face are read off Cook figure 85 by where they lie between the eye and the end of the external jugular vein, and held just under the skin.
  const JUGULAR_END: Record<'R' | 'L', Vec3> = { R: under([118, 215, 40], [150, 215, 58], 3), L: under([244, 215, 40], [212, 215, 58], 3) };
  const faceAt = (side: 'R' | 'L', px: number, py: number): Vec3 => {
    const eye = eyes[side === 'R' ? 0 : 1].centroid, jugular = JUGULAR_END[side], sign = side === 'R' ? -1 : 1;
    const y = eye[1] + (px - 600) * (jugular[1] - eye[1]) / (305 - 600), z = eye[2] + (py - 180) * (jugular[2] - eye[2]) / (305 - 180);
    // Out from inside the head to where it ends. Coming in from outside would first meet the fore limb, which lies beside the head in the source images.
    for (let k = 0; k <= 12; k++) {
      const held = z + (eye[2] - z) * k / 12;
      let last = -1, gap = 0;
      for (let far = 16; far <= 84; far += 0.5) {
        if (inBody([189 + sign * far, y, held])) { last = far; gap = 0; }
        else if (last >= 0 && ++gap >= 8) break;
      }
      if (last >= 0) return [189 + sign * Math.max(16, last - 2), y, held];
    }
    return [189 + sign * 30, y, eye[2]];
  };
  // A vein of the face stays under the skin all along, so its course is found every few pixels of the figure and then smoothed. Between far apart points it would cut across the hollows of the head.
  const alongFace = (side: 'R' | 'L', points: readonly (readonly [number, number])[]): Vec3[] => {
    const held: Vec3[] = [];
    points.forEach(([px, py], index) => {
      if (index === 0) { held.push(faceAt(side, px, py)); return; }
      const [qx, qy] = points[index - 1], count = Math.max(1, Math.ceil(Math.hypot(px - qx, py - qy) / 12));
      for (let k = 1; k <= count; k++) held.push(faceAt(side, qx + (px - qx) * k / count, qy + (py - qy) * k / count));
    });
    return held.map((point, i) => i === 0 || i === held.length - 1 ? point : scale(add(add(held[i - 1], held[i + 1]), scale(point, 2)), 0.25));
  };
  const onFace = (side: 'R' | 'L', points: readonly (readonly [number, number])[], r0: number, r1: number) => route(alongFace(side, points), r0, r1, 5);
  const posteriorFacialVeins = mergeSurfaces((['R', 'L'] as const).map((side) => route([JUGULAR_END[side], ...alongFace(side, [[340, 265], [370, 235]])], 1.8, 1.4, 6)));
  const superficialTemporalVeins = mergeSurfaces((['R', 'L'] as const).flatMap((side) => [
    onFace(side, [[370, 235], [420, 228], [470, 218]], 1.3, 1),
    // Its branches: anterior auricular, masseteric, middle temporal, inferior palpebral and transverse facial.
    onFace(side, [[370, 235], [335, 222]], 0.5, 0.3),
    onFace(side, [[345, 280], [385, 296]], 0.45, 0.25),
    onFace(side, [[470, 218], [520, 178], [595, 150]], 0.8, 0.5),
    onFace(side, [[470, 218], [560, 222], [618, 216]], 0.55, 0.3),
    onFace(side, [[472, 225], [560, 236], [632, 262]], 0.6, 0.45),
  ]));
  const anteriorFacialVeins = mergeSurfaces((['R', 'L'] as const).flatMap((side) => [
    route([JUGULAR_END[side], ...alongFace(side, [[405, 350], [500, 345], [560, 322], [632, 262]])], 1.5, 0.8, 6),
    // The cutaneous and supraorbital veins.
    onFace(side, [[555, 325], [585, 365]], 0.5, 0.3),
    onFace(side, [[632, 262], [690, 195], [675, 180]], 0.6, 0.4),
  ]));
  const superficialTemporalArteries = mergeSurfaces((['R', 'L'] as const).map((side) => route([side === 'R' ? [132, 205, 52] : [238, 205, 52], ...alongFace(side, [[372, 242], [430, 236], [480, 226], [560, 242]])], 0.7, 0.35, 5)));
  // The anterior jugular veins of Cook figures 98 and 100, from the external jugular veins forward under the skin of the throat.
  const anteriorJugularVeins = mergeSurfaces([-1, 1].map((sign) => {
    const start: Vec3 = [189 + sign * 44, 320, 62];
    return route([start, under([189 + sign * 24, 290, 10], [189 + sign * 24, 290, 80], 3), under([189 + sign * 17, 262, 10], [189 + sign * 17, 262, 80], 3), under([189 + sign * 14, 238, 10], [189 + sign * 14, 238, 80], 3)], 0.9, 0.5, 5);
  }));
  const opticNerves = mergeSurfaces([route([eyes[0].centroid, [172, 175, 96], chiasm], 0.9, 0.9, 6), route([eyes[1].centroid, [206, 175, 96], chiasm], 0.9, 0.9, 6), route([chiasm, [189, 215, 95]], 1, 0.9, 6)]);
  const HEAD = 189;
  const eachSide = (make: (sign: number) => Surface) => mergeSurfaces([-1, 1].map(make));
  const ganglionAt = (sign: number): Vec3 => [HEAD + sign * 24, 222, 86];
  const trigeminalRoots = eachSide((sign) => route([[HEAD + sign * 12, 240, 100], ganglionAt(sign)], 1.5, 1.5, 6));
  const ophthalmicNerves = eachSide((sign) => route([ganglionAt(sign), [HEAD + sign * 32, 180, 92], [HEAD + sign * 36, 140, 90]], 0.8, 0.4, 5));
  const maxillaryNerves = eachSide((sign) => route([ganglionAt(sign), [HEAD + sign * 30, 170, 74], [HEAD + sign * 26, 110, 62], [HEAD + sign * 22, 90, 50]], 1, 0.5, 5));
  const mandibularNerves = eachSide((sign) => route([ganglionAt(sign), [HEAD + sign * 30, 200, 62], [HEAD + sign * 18, 150, 28]], 0.9, 0.45, 5));
  const facialNerves = eachSide((sign) => route([[HEAD + sign * 16, 245, 104], [HEAD + sign * 46, 240, 80], [HEAD + sign * 44, 190, 62], [HEAD + sign * 34, 120, 56]], 0.7, 0.35, 5));

  // Respiratory. Sections of the specimen show the midline of the neck near x 183, a tube near z 80 taken as the oesophagus, and the hyoid at y 243 to 261 with small calcified
  // patches behind it at y 263 to 275, taken as the larynx. The trachea is collapsed in the specimen and cannot be followed, so its course is an estimate.
  const NECK = 183;
  const trachealPoints = curve([[NECK + 1, 282, 71], [NECK, 300, 72], [NECK, 345, 72], [186, 385, 90]], 1.5);
  const trachea = mergeSurfaces([
    tube(trachealPoints, trachealPoints.map(() => 4.9), 12),
    route([[186, 385, 90], [160, 410, 104], [136, 432, 110]], 4.2, 2.2, 8), route([[186, 385, 90], [210, 408, 106], [222, 432, 120]], 4.2, 2.2, 8),
    route([[160, 410, 104], [150, 395, 112]], 2.4, 1.5, 6), route([[160, 410, 104], [150, 432, 92]], 2.4, 1.5, 6), route([[210, 408, 106], [222, 395, 118]], 2.4, 1.5, 6),
  ]);
  // Cartilage rings, incomplete dorsally, as Hummel et al. describe. The gap faces the oesophagus.
  const trachealRings = (() => {
    const rings: Surface[] = [];
    for (let i = 3; i < trachealPoints.length - 2; i += 3) {
      const here = trachealPoints[i], axis = unit([trachealPoints[i + 1][0] - trachealPoints[i - 1][0], trachealPoints[i + 1][1] - trachealPoints[i - 1][1], trachealPoints[i + 1][2] - trachealPoints[i - 1][2]]);
      const across = unit([1, 0, -axis[0]]);
      const dorsal = unit([axis[1] * across[2] - axis[2] * across[1], axis[2] * across[0] - axis[0] * across[2], axis[0] * across[1] - axis[1] * across[0]]);
      const up = dorsal[2] >= 0 ? dorsal : scale(dorsal, -1);
      const arc = Array.from({ length: 19 }, (_, k): Vec3 => { const t = -2.45 + 4.9 * k / 18; return add(here, add(scale(up, 5.5 * Math.cos(t)), scale(across, 5.5 * Math.sin(t)))); });
      rings.push(tube(arc, arc.map(() => 0.72), 6));
    }
    return mergeSurfaces(rings);
  })();
  // The larynx: thyroid and cricoid cartilages, paired arytenoids and the triangular epiglottis named by Hummel et al.
  const larynx = mergeSurfaces([
    blob([NECK + 1, 268, 66], [10, 9, 6]), blob([NECK + 1 - 7, 268, 72], [3, 8, 7]), blob([NECK + 1 + 7, 268, 72], [3, 8, 7]),
    route(Array.from({ length: 13 }, (_, i): Vec3 => { const t = 2 * Math.PI * i / 12; return [NECK + 1 + 7 * Math.sin(t), 278, 72 + 7 * Math.cos(t)]; }), 1.5, 1.5, 6),
    blob([NECK - 2, 266, 80], [2.2, 3, 3]), blob([NECK + 4, 266, 80], [2.2, 3, 3]),
    route([[NECK + 1, 262, 74], [NECK + 1, 255, 78], [NECK + 1, 249, 80]], 5, 0.5, 8),
  ]);
  // Usually one parathyroid near the dorsolateral border of each thyroid lobe: Hummel et al.
  const parathyroids = mergeSurfaces([blob([NECK - 11, 288, 75], [1.5, 2.2, 1.3], 6, 8), blob([NECK + 11, 288, 75], [1.5, 2.2, 1.3], 6, 8)]);
  const oesophagus = route([[NECK, 262, 84], [NECK, 300, 81], [184, 355, 80], [186, 410, 104], [190, 460, 128], [204, 508, 136]], 4.6, 4.2, 10);

  // The tongue fills the floor of the mouth behind the lower incisors.
  const tongue = mergeSurfaces([route([[189, 114, 32], [189, 135, 37], [189, 165, 43], [189, 205, 54]], 6, 10, 12), blob([189, 112, 32], [6, 6, 4])]);
  // Three pairs of salivary glands, as Hummel et al. describe them. The submandibular glands are large and compact in the ventral neck, the sublingual glands small, flattened and pressed
  // against their ventral anterolateral surfaces, and the parotids diffuse and lobulated, from the ears to the clavicles. Sizes and the places of the lobules are estimates.
  const submandibular = mergeSurfaces([-1, 1].map((sign) => blob([M + sign * 26, 292, 63], [15, 28, 11])));
  const sublingual = mergeSurfaces([-1, 1].map((sign) => blob([M + sign * 35, 272.5, 58.5], [5.5, 9, 3], 8, 12)));
  const parotid = mergeSurfaces([-1, 1].flatMap((sign) => Array.from({ length: 16 }, (_, i) => {
    const centre = mix([M + sign * 52, 250, 78], [M + sign * 46, 325, 66], i / 15);
    const radius = 4.5 + 1.5 * Math.sin(i * 1.3);
    const lobule = add(centre, [sign * 6 * Math.sin(i * 2.3), 3 * Math.sin(i * 3.1), 9 * Math.cos(i * 1.7)]);
    return blob(under(lobule, [M + sign * 24, lobule[1], 72], radius + 1), [radius, radius * 1.2, radius], 6, 8);
  })));
  // The nasal cavities on either side of a septum, with sizes read section by section from colour sections of the specimen: y, height of the middle, half width and half height.
  // The dark passages are visible there, but the CT does not resolve them well enough to trace, so this shape is an estimate. They lead back above the palate to the pharynx.
  const NOSE = 191;
  const nasalCavities = mergeSurfaces([
    ...[-1, 1].flatMap((sign) => Array.from({ length: 22 }, (_, i) => {
      const [y, z, halfWidth, halfHeight] = nasalAt(78 + i * 6);
      return blob([NOSE + sign * (halfWidth + 0.8), y, z], [halfWidth, 5.5, halfHeight], 8, 10);
    })),
    route([[188, 205, 76], [187, 225, 76], [186, 240, 78], [185, 248, 81]], 2.3, 2.3, 8),
  ]);
  // Two sets of bony ridges on each side, the dorsal and lateral turbinals: Hummel et al. Their courses are estimates within the simulated cavities.
  const turbinals = mergeSurfaces([-1, 1].flatMap((sign) => [
    route([[NOSE + sign * 3.5, 96, 67], [NOSE + sign * 4.5, 112, 83], [NOSE + sign * 5, 130, 93], [NOSE + sign * 4.5, 152, 92]], 1.2, 0.8, 7),
    route([[NOSE + sign * 7, 100, 62], [NOSE + sign * 10.5, 112, 71], [NOSE + sign * 11.5, 130, 76], [NOSE + sign * 8.5, 150, 75]], 1.7, 1, 7),
    route([[NOSE + sign * 8, 104, 69], [NOSE + sign * 11, 116, 76], [NOSE + sign * 11, 132, 81], [NOSE + sign * 8.5, 150, 80]], 1.1, 0.7, 7),
  ]));
  // The soft palate continues the bony palate, which ends near y 208 in the CT, and the pharynx is a small chamber behind the oral cavity: Hummel et al.
  const softPalate = blob([187, 226, 71.5], [15, 19, 2.2], 8, 14);
  const pharynx = blob([185, 254, 84], [9, 11, 4.5], 10, 14);
  const gallBladder = route([[170, 492, 34], [172, 505, 36], [176, 515, 44]], 5, 1.4, 10);
  const ureters = mergeSurfaces([
    route([add(kidneyR.centroid, [14, 5, -8]), [146, 640, 118], [150, 680, 90], add(bladder.centroid, [-10, 8, 24])], 1, 0.8, 6),
    route([add(kidneyL.centroid, [-14, 5, -8]), [205, 650, 118], [192, 685, 92], add(bladder.centroid, [12, 8, 24])], 1, 0.8, 6),
    // The urethra runs back through the pelvis above the pubic bone seen in the CT, and round the back of it.
    route([add(bladder.centroid, [4, 36, -2]), [174, 770, 72], [178, 812, 74], [180, 838, 62], [176, 840, 46]], 1.7, 1.3, 6),
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
  // The penis forms a hairpin. The os penis in the CT tapers from y 784 back to y 812 close under the skin, and sections show a dark ring round its base, so the body runs forward below
  // the pubic bone to a flexure near y 770, and the glans turns back from there.
  const preputial = mergeSurfaces([blob([157, 770, 20], [8, 13, 3.5]), blob([177, 770, 20], [7, 13, 3.5])]);
  const penis = route([[176, 840, 46], [172, 815, 40], [167, 785, 38], [163, 768, 31], [165, 776, 22], [169, 790, 16], [170, 806, 11.5], [170, 816, 10]], 4.2, 2.8, 12);
  const accessoryGlands = mergeSurfaces([
    blob([170, 838, 54], [5, 7, 4]), blob([188, 838, 54], [5, 7, 4]),
    blob([170, 745, 54], [3, 6, 3]), blob([180, 745, 54], [3, 6, 3]),
  ]);
  const thyroid = mergeSurfaces([blob([NECK - 8, 292, 70], [3.6, 12, 6.5]), blob([NECK + 8, 292, 70], [3.6, 12, 6.5]), route([[NECK - 8, 296, 64.5], [NECK + 8, 296, 64.5]], 1.4, 1.4, 6)]);
  const thymus = mergeSurfaces([blob([170, 345, 62], [17, 26, 14]), blob([208, 345, 62], [17, 26, 14])]);
  const pituitary = blob([189, 216, 91], [6, 4.4, 3]);

  // Lymph nodes by the list and locations in Hummel et al. Each is an estimated body at the described location.
  const node = (centre: Vec3, radius: number, stretch = 1): Surface => blob(centre, [radius, radius * stretch, radius], 8, 12);
  const pair = (p: Vec3, radius: number, stretch = 1): Surface[] => [node(p, radius, stretch), node(mirror(p), radius, stretch)];
  const mandibularNode = under([158, 266, 34], [168, 266, 60], 5.5);
  const lymphNodes = {
    'cervical-lymph-nodes': mergeSurfaces([...pair(mandibularNode, 5, 1.4), ...pair([176, 300, 58], 3.5, 1.3)]),
    'axillary-lymph-nodes': mergeSurfaces(pair([108, 345, 66], 7, 1.2)),
    'brachial-lymph-nodes': mergeSurfaces([node(add(mix(J.shoulderR, J.elbowR, 0.55), [0, -7, -7]), 5.5, 1.2), node(add(mix(J.shoulderL, J.elbowL, 0.55), [0, -7, -7]), 5.5, 1.2)]),
    'inguinal-lymph-nodes': mergeSurfaces(pair([92, 735, 40], 8, 1.3)),
    'sciatic-lymph-nodes': mergeSurfaces(pair([106, 800, 92], 3.8)),
    'mediastinal-lymph-nodes': mergeSurfaces([...pair([176, 372, 96], 3.6), node([190, 392, 104], 3.4)]),
    'pyloric-lymph-nodes': mergeSurfaces([node([214, 566, 112], 4, 1.2), node([224, 574, 116], 3.6, 1.2)]),
    'renal-lymph-nodes': mergeSurfaces([node([150, 608, 132], 3.2), node([205, 615, 134], 3.2)]),
    'lumbar-lymph-nodes': mergeSurfaces(pair([172, 725, s(725).ventralZ - 15], 3)),
    'mesenteric-lymph-node': node([186, 640, 82], 5.5, 2.6),
    'caudal-lymph-node': node([182, 752, s(750).ventralZ - 12], 2.8),
  };

  // Lymph trunks gather towards a cisterna beside the aorta, and the thoracic duct carries them to the left venous angle.
  const cisterna: Vec3 = [s(610).x - 2, 610, s(610).ventralZ - 12];
  const lymphVessels = mergeSurfaces([
    route([cisterna, [s(540).x - 3, 540, s(540).ventralZ - 8], [s(460).x - 3, 460, s(460).ventralZ - 7], [s(400).x + 2, 400, s(400).ventralZ - 7], [204, 360, 88], junctionL], 0.8, 0.8, 5),
    route([[186, 640, 82], [180, 625, 110], cisterna], 0.55, 0.55, 5),
    route([[172, 725, s(725).ventralZ - 15], [172, 670, s(670).ventralZ - 12], cisterna], 0.5, 0.55, 5),
    route([[190, 725, s(725).ventralZ - 15], [186, 670, s(670).ventralZ - 12], cisterna], 0.5, 0.55, 5),
    route([[92, 735, 40], [130, 735, 80], [172, 725, s(725).ventralZ - 15]], 0.4, 0.5, 5),
    route([[270, 735, 40], [232, 735, 80], [190, 725, s(725).ventralZ - 15]], 0.4, 0.5, 5),
    route([[108, 345, 66], [128, 340, 70], junctionR], 0.4, 0.5, 5),
    route([[254, 345, 66], [234, 340, 70], junctionL], 0.4, 0.5, 5),
    route([mandibularNode, [160, 300, 54], junctionR], 0.35, 0.5, 5),
    route([mirror(mandibularNode), [202, 300, 54], junctionL], 0.35, 0.5, 5),
  ]);
  // The vertebral arteries join as the basilar artery under the medulla, which ends in a ring at the base of the brain, after Cook figures 87 and 88.
  const ring = Array.from({ length: 13 }, (_, i): Vec3 => { const angle = 2 * Math.PI * i / 12; return [189 + 13 * Math.cos(angle), 203 + 16 * Math.sin(angle), 87]; });
  const cerebralBase = mergeSurfaces([
    route([[189, 292, 100], [189, 255, 93], [189, 219, 88]], 1.1, 1, 6),
    route([[170, 340, 92], [176, 310, 98], [189, 292, 100]], 0.8, 0.8, 5), route([[208, 340, 92], [202, 310, 98], [189, 292, 100]], 0.8, 0.8, 5),
    route(ring, 0.8, 0.8, 5),
    route([[165, 220, 96], [176, 205, 88]], 0.9, 0.8, 5), route([[205, 220, 96], [202, 205, 88]], 0.9, 0.8, 5),
  ]);

  // Teeth are placed in the jaws seen in the CT, whose 8-bit values do not separate teeth from bone. The upper incisors end near y 90 and z 18, the lower near y 100 and z 26,
  // and the rows of molars lie near y 165 to 190, either side of the midline of the skull, about where the jaws meet.
  const SKULL = 189.5;
  const incisors = mergeSurfaces([-1, 1].flatMap((sign) => [
    route([[SKULL + sign * 4, 122, 82], [SKULL + sign * 4, 108, 62], [SKULL + sign * 3.5, 97, 40], [SKULL + sign * 3, 90, 19]], 2.6, 1.1, 8),
    route([[SKULL + sign * 7, 175, 22], [SKULL + sign * 6, 140, 19], [SKULL + sign * 4, 112, 20], [SKULL + sign * 3, 100, 26]], 2.6, 1, 8),
  ]));
  const molars = mergeSurfaces([-1, 1].flatMap((sign) => ([[168, 6, 4.6], [179, 4.8, 4.1], [188, 3.4, 3.4]] as const).flatMap(([y, long, wide]) => [
    blob([SKULL + sign * 18, y, 56], [wide, long, 4.4], 8, 10), blob([SKULL + sign * 18, y, 43], [wide, long, 4.4], 8, 10),
  ])));
  // A ganglion on each dorsal root, at the levels used for the spinal nerves.
  // Sleigh et al. (2020) find the lumbar ganglia growing from the first to the fourth, which is the largest. How much is an estimate.
  const GANGLION_SIZE: Readonly<Record<string, number>> = { l1: 0.85, l2: 0.95, l3: 1.1, l4: 1.3, l5: 1.1, l6: 0.95 };
  const ganglia = mergeSurfaces(levels.flatMap((level) => [-1, 1].map((side) => {
    const sample = s(level.y), size = GANGLION_SIZE[level.id] ?? 1;
    return blob([sample.x + side * 12, level.y, sample.canalZ - 4], [2.2 * size, 2.6 * size, 2.2 * size], 6, 8);
  })));
  // Beaded chains beside the column, under the vertebral bodies.
  const sympathetic = mergeSurfaces([-1, 1].flatMap((side) => {
    const superior: Vec3 = [189 + side * 26, 258, 84];
    const line: Vec3[] = [superior, ...[300, 340, 380, 460, 540, 620, 700, 780].map((y): Vec3 => [s(y).x + side * 11, y, s(y).ventralZ - 3])];
    // A ganglion at each level from the thorax back. The neck has only the superior cervical ganglion, at the carotid bifurcation as Ning et al. (2022) find it, and the stellate ganglion, between the seventh cervical and first thoracic vertebrae as Duan et al. (2024) place it.
    const beads = levels.filter((level) => level.kind !== 'c' && level.id !== 't1').map((level): Surface => blob([s(level.y).x + side * 11, level.y, s(level.y).ventralZ - 3], [1.1, 1.5, 1.1], 5, 6));
    return [route(line, 0.4, 0.4, 4), ...beads, blob(superior, [1.5, 3.4, 1.5], 6, 8), blob([s(340).x + side * 11, 340, s(340).ventralZ - 3], [2.2, 2.8, 1.6], 6, 8)];
  }));
  // Attached to the coeliac and superior mesenteric arteries, with the splanchnic ganglia medial to the kidneys, as Trevizan-Bau et al. (2024) describe. Their sizes are estimates.
  const coeliacGanglia = mergeSurfaces([
    blob(add(coeliac, [-4, 6, -16]), [3.2, 2.4, 1.8], 6, 8),
    blob(add(coeliac, [8, 6, -16]), [3.2, 2.4, 1.8], 6, 8),
    blob(add(sma, [-1, 8, -12]), [2.8, 2.2, 1.6], 6, 8),
    blob(add(kidneyL.centroid, [-26, -22, -2]), [1.8, 2.6, 1.6], 6, 8),
    blob(add(kidneyR.centroid, [26, -22, -2]), [1.8, 2.6, 1.6], 6, 8),
    // The splanchnic nerves, from the sympathetic trunk through the diaphragm.
    route([[s(480).x + 11, 480, s(480).ventralZ - 3], [s(520).x + 16, 520, s(520).ventralZ - 8], add(kidneyL.centroid, [-26, -22, -2]), add(coeliac, [8, 6, -16])], 0.4, 0.4, 4),
    route([[s(480).x - 11, 480, s(480).ventralZ - 3], [s(520).x - 16, 520, s(520).ventralZ - 8], add(kidneyR.centroid, [26, -22, -2]), add(coeliac, [-4, 6, -16])], 0.4, 0.4, 4),
  ]);
  // Inside each tympanic bulla: an ear canal from the external auditory meatus seen in the CT, a tympanic membrane, and a chain of three ossicles to the cochlea. Their sizes are estimates.
  const middleEar = (sign: -1 | 1): Surface[] => {
    const HEAD = 189.5;
    const membrane: Vec3 = [HEAD + sign * 38, 241, 100];
    return [
      tube([add(membrane, [sign * 0.5, 0, 0]), add(membrane, [sign * 2, 0, 0.5]), [HEAD + sign * 50, 243, 110], [HEAD + sign * 55.5, 245.5, 125]], [4.2, 4.4, 4.4, 5], 12),
      blob(membrane, [0.5, 8.5, 8.5], 6, 16),
      route([add(membrane, [sign * -0.8, 0, -5]), add(membrane, [sign * -1.6, 0, 1]), add(membrane, [sign * -3, 1, 5])], 0.6, 1.1, 6),
      blob(add(membrane, [sign * -4.6, 1.2, 5.6]), [1.5, 1.8, 1.4], 6, 8),
      route([add(membrane, [sign * -5.2, 2, 4.6]), add(membrane, [sign * -7, 2.6, 2.4])], 0.5, 0.45, 5),
      route([add(membrane, [sign * -7, 2.6, 2.4]), [HEAD + sign * 30.5, 243.5, 100]], 0.7, 0.9, 6),
    ];
  };
  // A coiled cochlea and three loops beside it, in each temporal region. Only their rough position is known here.
  const innerEar = (sign: -1 | 1): Surface[] => {
    // In the temporal region of the head, medial to the tympanic bulla seen in the CT.
    const centre: Vec3 = [189 + sign * 30, 243, 92];
    const coil = Array.from({ length: 26 }, (_, i): Vec3 => { const a = i * 0.72, r = 5.4 - i * 0.16; return [centre[0] + sign * i * 0.22, centre[1] + r * Math.cos(a), centre[2] + r * Math.sin(a)]; });
    const loop = (axis: 0 | 1 | 2): Vec3[] => Array.from({ length: 11 }, (_, i): Vec3 => { const a = i * 0.56, p = 4.4 * Math.cos(a), q = 4.4 * Math.sin(a); return axis === 0 ? [centre[0], centre[1] + 9 + p, centre[2] + 6 + q] : axis === 1 ? [centre[0] + p, centre[1] + 9, centre[2] + 6 + q] : [centre[0] + p, centre[1] + 9 + q, centre[2] + 6]; });
    return [route(coil, 1, 0.5, 5), route(loop(0), 0.5, 0.5, 5), route(loop(1), 0.5, 0.5, 5), route(loop(2), 0.5, 0.5, 5)];
  };

  // The hepatic ducts and the cystic duct from the gall bladder form the common bile duct, which crosses part of the pancreas to the duodenum: Cook figure 61 and Hummel et al.
  const bileUnion: Vec3 = [180, 532, 66], duodenalEnd: Vec3 = [182, 575, 100];
  const bileDucts = mergeSurfaces([
    route([[176, 515, 44], [178, 524, 56], bileUnion], 0.8, 0.8, 6),
    route([[150, 515, 72], [165, 526, 70], bileUnion], 0.7, 0.8, 6), route([[206, 512, 76], [192, 526, 72], bileUnion], 0.7, 0.8, 6),
    route([bileUnion, [181, 555, 84], duodenalEnd], 0.9, 0.9, 6),
  ]);
  // Several excretory ducts join the bile duct as it crosses the pancreas, and at least one enters the duodenum by itself: Hummel et al.
  const pancreaticDucts = mergeSurfaces([
    route([[212, 590, 124], [196, 578, 108], [181, 562, 90]], 0.5, 0.6, 5),
    route([[198, 612, 130], [190, 590, 112], [182, 570, 96]], 0.5, 0.6, 5),
    route([[185, 596, 124], [186, 584, 108], [186, 578, 102]], 0.5, 0.6, 5),
  ]);
  // Hummel et al. name brown fat between the scapulae, in the axillae, along the jugular veins, near the thymus, along the thoracic aorta, at the hilus of the kidney and beside the urethra.
  const brownFat = mergeSurfaces([
    blob([166, 365, 168], [13, 26, 8]), blob([196, 365, 168], [13, 26, 8]),
    blob([112, 352, 84], [9, 14, 7]), blob([250, 352, 84], [9, 14, 7]),
    blob([150, 290, 58], [6, 16, 5]), blob([214, 290, 58], [6, 16, 5]),
    blob([160, 345, 90], [5, 8, 4]), blob([206, 345, 90], [5, 8, 4]),
    route([...[415, 445, 475, 505].map(aortaAt)].map((p) => add(p, [5, 0, -2])), 1.6, 1.2, 6),
    blob(add(kidneyR.centroid, [24, 2, -8]), [5, 7, 4]), blob(add(kidneyL.centroid, [-24, 2, -8]), [5, 7, 4]),
    blob([170, 790, 80], [4, 12, 3]), blob([186, 790, 80], [4, 12, 3]),
  ]);
  // The ventricles of the brain, placed on the source brain labels after the description of the rat in Greene. The midline of the head is near x 189.
  const brainMiddle = 189;
  const ventricles = mergeSurfaces([
    ...[-1, 1].flatMap((sign) => [
      route([[brainMiddle + sign * 9, 192, 134], [brainMiddle + sign * 20, 205, 144], [brainMiddle + sign * 30, 224, 138], [brainMiddle + sign * 33, 232, 118]], 1.7, 0.9, 6),
      route([[brainMiddle + sign * 9, 192, 134], [brainMiddle + sign * 3, 202, 124], [brainMiddle, 208, 118]], 0.9, 0.9, 5),
    ]),
    blob([brainMiddle, 214, 112], [1.1, 10, 10], 8, 12),
    route([[brainMiddle, 224, 118], [brainMiddle, 238, 124], [brainMiddle, 250, 126]], 0.7, 0.7, 5),
    blob([brainMiddle, 258, 124], [6, 6, 1.8], 8, 12),
  ]);
  // The cranial nerves not drawn with the others, simplified, from the brain stem to their targets, after the description of the rat in Greene.
  const eyeOn = (sign: number) => eyes[sign < 0 ? 0 : 1].centroid;
  const olfactoryNerves = eachSide((sign) => route([[brainMiddle + sign * 6, 166, 104], [brainMiddle + sign * 7, 148, 100], [brainMiddle + sign * 7, 128, 92]], 0.6, 0.3, 5));
  const oculomotorNerves = eachSide((sign) => route([[brainMiddle + sign * 4, 232, 100], [brainMiddle + sign * 18, 205, 96], eyeOn(sign)], 0.5, 0.3, 5));
  const trochlearNerves = eachSide((sign) => route([[brainMiddle + sign * 6, 245, 112], [brainMiddle + sign * 26, 210, 101], eyeOn(sign)], 0.35, 0.25, 5));
  const abducensNerves = eachSide((sign) => route([[brainMiddle + sign * 3, 252, 100], [brainMiddle + sign * 20, 210, 92], eyeOn(sign)], 0.35, 0.25, 5));
  const vestibulocochlearNerves = eachSide((sign) => route([[brainMiddle + sign * 12, 255, 104], [brainMiddle + sign * 30, 243, 92]], 0.7, 0.6, 5));
  const glossopharyngealNerves = eachSide((sign) => route([[brainMiddle + sign * 11, 262, 100], [brainMiddle + sign * 14, 256, 80], [NECK + sign * 6, 256, 76]], 0.4, 0.3, 5));
  const accessoryNerves = eachSide((sign) => route([[brainMiddle + sign * 9, 270, 100], [brainMiddle + sign * 22, 292, 84], [brainMiddle + sign * 40, 318, 96]], 0.4, 0.3, 5));
  const hypoglossalNerves = eachSide((sign) => route([[brainMiddle + sign * 6, 275, 98], [brainMiddle + sign * 14, 250, 66], [188 + sign * 5, 190, 50]], 0.5, 0.3, 5));

  // A disc in each gap of the column. There is none between the atlas and axis, or between the fused sacral vertebrae.
  const discs = VERTEBRAE.slice(1).flatMap((vertebra, i): Surface[] => {
    if (vertebra.id === 'c2' || /^s[234]$/.test(vertebra.id)) return [];
    const y = vertebra.from, here = s(y), before = s(y - 6), after = s(y + 6);
    const axis = unit([after.x - before.x, 12, ((after.ventralZ + after.canalZ) - (before.ventralZ + before.canalZ)) / 2]);
    const centre: Vec3 = [here.x, y, (here.ventralZ + here.canalZ) / 2 - 1];
    const radius = Math.max(5, (here.canalZ - here.ventralZ) / 2 + 0.5);
    const thickness = Math.max(0.9, Math.min(2.2, (VERTEBRAE[i].to - VERTEBRAE[i].from) / 12));
    return [tube([add(centre, scale(axis, -thickness)), centre, add(centre, scale(axis, thickness))], [radius * 0.9, radius, radius * 0.9], 18)];
  });

  // Intercostal vessels run along the caudal border of each rib, whose course is measured in the CT, on its inner side. From the fifth rib back the arteries leave
  // the aorta and the veins join the azygos; the second to fourth come from a highest intercostal vessel further forward: Cook figure 95.
  const inward = (p: Vec3, caudal: number): Vec3 => {
    const toward = unit([s(p[1]).x - p[0], 0, 105 - p[2]]);
    return add(p, [toward[0] * 1.4, caudal, toward[2] * 1.4]);
  };
  const azygosAt = (y: number): Vec3 => [s(y).x + 14, y, s(y).ventralZ - 6];
  const intercostal = (origin: (rib: number, y: number) => Vec3, caudal: number, radius: number) => mergeSurfaces((['r', 'l'] as const).flatMap((side) => ribLines[side].flatMap((line, index): Surface[] => {
    const rib = index + 1;
    if (rib === 1 || line.length < 3) return [];
    const course = line.slice(0, 26).map((p) => inward(p, caudal));
    return [route([origin(rib, line[0][1]), ...course.filter((_, i) => i % 2 === 0 || i === course.length - 1)], radius, radius * 0.5, 5)];
  })));
  const highestArtery = (y: number): Vec3 => [s(y).x + (y < 0 ? 0 : -13), y, s(y).ventralZ - 6];
  const intercostalArteries = mergeSurfaces([
    intercostal((rib, y) => rib >= 5 ? aortaAt(y) : highestArtery(y), 3, 0.55),
    route([[s(340).x - 13, 340, s(340).ventralZ - 6], ...[355, 370, 385].map(highestArtery)], 0.7, 0.5, 5),
    route([[s(340).x + 13, 340, s(340).ventralZ - 6], ...[355, 370, 385].map((y): Vec3 => [s(y).x + 13, y, s(y).ventralZ - 6])], 0.7, 0.5, 5),
  ]);
  const intercostalVeins = intercostal((rib, y) => rib >= 5 ? azygosAt(y) : [s(y).x - 11, y, s(y).ventralZ - 5], 4.8, 0.6);

  return {
    'middle-ears': mergeSurfaces([...middleEar(-1), ...middleEar(1)]),
    // A very small cone on the dorsal surface of the brain between cerebrum and cerebellum: Hummel et al.
    pineal: route([[189, 232, 150], [189, 235, 153], [189, 237.5, 155.5]], 2.3, 0.5, 8),
    parathyroids,
    // Beside the sternum on each side, from the subclavian vessels: Cook figures 91 and 95.
    'mammary-arteries': mergeSurfaces([route([[150, 326, 80], [166, 345, 64], [168, 400, 52], [169, 480, 50]], 0.8, 0.45, 5), route([[222, 336, 88], [196, 345, 64], [194, 400, 52], [193, 480, 50]], 0.8, 0.45, 5)]),
    'mammary-veins': mergeSurfaces([route([[146, 336, 74], [163, 345, 62], [165, 400, 50], [166, 480, 48]], 0.9, 0.5, 5), route([[216, 336, 74], [199, 345, 62], [197, 400, 50], [196, 480, 48]], 0.9, 0.5, 5)]),
    larynx, 'tracheal-rings': trachealRings, 'bile-ducts': bileDucts, 'pancreatic-ducts': pancreaticDucts, 'brown-fat': brownFat, 'accessory-glands': accessoryGlands, 'brain-ventricles': ventricles,     'intervertebral-discs': mergeSurfaces(discs),
    'xiphoid-cartilage': mergeSurfaces([blob([181, 512, 37], [14, 15, 1.6], 10, 16), route([[181, 498, 38], [181, 503, 37.5]], 2.4, 2.8, 8)]),
    'intercostal-arteries': intercostalArteries, 'intercostal-veins': intercostalVeins,
    incisors, molars, 'root-ganglia': ganglia, 'sympathetic-trunks': sympathetic, 'coeliac-ganglia': coeliacGanglia, 'inner-ears': mergeSurfaces([...innerEar(-1), ...innerEar(1)]),
    'lymph-vessels': lymphVessels, 'cerebral-base': cerebralBase,
    aorta, 'innominate-artery': innominateArtery, 'common-carotid-arteries': commonCarotids, 'internal-carotid-arteries': internalCarotids, 'external-carotid-arteries': externalCarotids, 'coronary-arteries': coronary,
    'coeliac-arteries': coeliacArteries, 'common-hepatic-artery': commonHepaticArtery, 'gastric-arteries': gastricArteries, 'lienal-arteries': lienalArteries, 'lieno-pancreatic-artery': lienoPancreatic, 'superior-pancreaticoduodenal-artery': superiorPancreaticoduodenal,
    'superior-mesenteric-artery': superiorMesenteric, 'jejunal-ileal-arteries': jejunalIleal, 'inferior-pancreaticoduodenal-artery': inferiorPancreaticoduodenal, 'ileocolic-artery': ileocolic, 'suprarenal-arteries': suprarenalArteries, 'inferior-vesical-arteries': inferiorVesicalArteries, 'superficial-temporal-arteries': superficialTemporalArteries,
    'renal-artery-stems': renalArteryStems, 'testicular-arteries': testicularArteries, 'inferior-mesenteric-artery': inferiorMesenteric,
    'caudal-vena-cava': caudalVenaCava, 'superior-venae-cavae': superiorVenaeCavae, 'external-jugular-veins': externalJugulars, 'internal-jugular-veins': internalJugulars, 'azygos-vein': azygos, 'anterior-jugular-veins': anteriorJugularVeins, 'posterior-facial-veins': posteriorFacialVeins, 'superficial-temporal-veins': superficialTemporalVeins, 'anterior-facial-veins': anteriorFacialVeins,
    'portal-vein': portalVein, 'superior-mesenteric-vein': superiorMesentericVein, 'jejunal-ileal-veins': jejunalIlealVeins, 'ileocolic-vein': ileocolicVein, 'inferior-mesenteric-vein': inferiorMesentericVein, 'lienal-vein': lienalVein, 'gastric-vein': gastricVein, 'pancreaticoduodenal-veins': pancreaticoduodenalVeins, 'suprarenal-veins': suprarenalVeins, 'inferior-phrenic-veins': inferiorPhrenicVeins, 'testicular-veins': testicularVeins, 'hypogastric-veins': hypogastricVeins,
    'renal-vein-stems': renalVeinStems, 'hepatic-vein-stems': hepaticVeinStems,
    'spinal-cord': spinalCord, 'cervical-nerves': mergeSurfaces(nerves.c), 'thoracic-nerves': mergeSurfaces(nerves.t), 'lumbar-nerves': mergeSurfaces(nerves.l), 'sacral-nerves': mergeSurfaces(nerves.s),
    'vagus-nerves': mergeSurfaces([vagus('R').main, vagus('L').main]), 'phrenic-nerves': mergeSurfaces([vagus('R').phrenic, vagus('L').phrenic]), 'recurrent-laryngeal-nerves': mergeSurfaces([vagus('R').laryngeal, vagus('L').laryngeal]),
    'optic-nerves': opticNerves, 'trigeminal-roots': trigeminalRoots, 'ophthalmic-nerves': ophthalmicNerves, 'maxillary-nerves': maxillaryNerves, 'mandibular-nerves': mandibularNerves, 'facial-nerves': facialNerves,
    'olfactory-nerves': olfactoryNerves, 'oculomotor-nerves': oculomotorNerves, 'trochlear-nerves': trochlearNerves, 'abducens-nerves': abducensNerves, 'vestibulocochlear-nerves': vestibulocochlearNerves, 'glossopharyngeal-nerves': glossopharyngealNerves, 'accessory-nerves': accessoryNerves, 'hypoglossal-nerves': hypoglossalNerves,
    trachea, diaphragm: buildDiaphragm(grid, labels), oesophagus, tongue, 'submandibular-glands': submandibular, 'sublingual-glands': sublingual, 'parotid-glands': parotid, 'nasal-cavities': nasalCavities, turbinals, 'soft-palate': softPalate, pharynx, 'gall-bladder': gallBladder,
    ureters, 'male-ducts': maleDucts, 'seminal-vesicles': seminal, prostate, 'preputial-glands': preputial, penis,
    thyroid, thymus, pituitary, ...lymphNodes,
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

/** A section of one nasal cavity along the snout, in voxels: its place along the body, the height of its middle, its half width and its half height. */
const NASAL_SECTIONS: readonly (readonly [number, number, number, number])[] = [[78, 50, 2.5, 3], [92, 58, 4.2, 7], [110, 77, 6, 10], [130, 84, 7, 16], [150, 84, 6, 16], [170, 81, 3.4, 5], [190, 78, 2.6, 3], [205, 76, 2.4, 2.2]];
export const nasalAt = (y: number): readonly [number, number, number, number] => {
  const after = NASAL_SECTIONS.findIndex((section) => section[0] >= y);
  if (after <= 0) return NASAL_SECTIONS[0];
  const a = NASAL_SECTIONS[after - 1], b = NASAL_SECTIONS[after], t = (y - a[0]) / (b[0] - a[0]);
  return [y, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
};
