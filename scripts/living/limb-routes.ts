/**
 * Named vessels and nerves of the limbs, each with its own structure, so that a place in a limb can say which of them lie there.
 *
 * The order of branching and the relations to muscles of the hind limb arteries follow the dissections of Kochi et al. (2013), in the
 * mouse, which also name the two large veins on the outer side of the thigh. The segments giving the sciatic nerve follow Rigaud et al.
 * (2008), in the mouse, and its division into three branches follows Shields et al. (2003), in the mouse. Other nerves and the fore limb follow
 * Greene (1935), which describes the rat. Radii and exact courses are estimates placed on the measured joints, and they are not measured.
 *
 * Each limb has its own frame, from the plane of its joints, because the limbs lay splayed in the scan: a point is given by how far along the
 * bone it lies, how far towards the middle of the body, and how far towards the front of the limb, in source voxels of 0.1 mm.
 */
import { mergeSurfaces } from './extract';
import { route } from './internal';
import type { Landmarks } from './landmarks';
import { add, cross, dot, JOINTS, length, scale, sub, unit, type Vec3 } from './rig';
import type { Surface } from './surface-nets';

export type LimbPart =
  | 'common-iliac-arteries' | 'internal-iliac-arteries' | 'external-iliac-arteries' | 'median-coccygeal-artery' | 'gluteal-arteries' | 'iliacofemoral-arteries'
  | 'pudendoepigastric-arteries' | 'femoral-arteries' | 'lateral-circumflex-femoral-arteries' | 'caudal-femoral-arteries' | 'deep-femoral-arteries' | 'obturator-arteries'
  | 'saphenous-arteries' | 'popliteal-arteries' | 'tibial-arteries'
  | 'common-iliac-veins' | 'femoral-veins' | 'saphenous-veins' | 'popliteal-veins' | 'lateral-saphenous-veins' | 'ischial-veins'
  | 'lumbosacral-plexus' | 'sciatic-nerves' | 'tibial-nerves' | 'common-peroneal-nerves' | 'sural-nerves' | 'femoral-nerves' | 'saphenous-nerves' | 'obturator-nerves' | 'gluteal-nerves'
  | 'subclavian-arteries' | 'axillary-arteries' | 'brachial-arteries' | 'forearm-arteries'
  | 'subclavian-veins' | 'brachial-veins' | 'cephalic-veins'
  | 'brachial-plexus' | 'musculocutaneous-nerves' | 'axillary-nerves' | 'radial-nerves' | 'median-nerves' | 'ulnar-nerves';

type Side = 'R' | 'L';
const SIDES: readonly Side[] = ['R', 'L'];

/** Points along a two-part limb. */
interface LimbFrame {
  /** Along the upper bone, towards the middle of the body, towards the front of the limb. */
  upper(along: number, medial: number, front: number): Vec3;
  /** Along the lower bone, towards the middle of the body, towards the front of the limb. */
  lower(along: number, medial: number, front: number): Vec3;
  readonly end: Vec3;
  readonly beyond: Vec3;
}

function limbFrame(top: Vec3, middle: Vec3, bottom: Vec3, tip: Vec3, medialSign: number, bendsForward: boolean): LimbFrame {
  const toMiddle = sub(middle, top), toBottom = sub(bottom, middle);
  const a = unit(toMiddle), b = unit(toBottom);
  const medial = scale(unit(cross(a, b)), medialSign);
  // The hind limb folds backwards at the knee and the fore limb forwards at the elbow, so the front of each segment follows from the angle at the joint.
  const sign = bendsForward ? 1 : -1;
  const frontUpper = scale(unit(sub(b, scale(a, dot(a, b)))), sign);
  const frontLower = scale(unit(sub(a, scale(b, dot(a, b)))), -sign);
  const lengthA = length(toMiddle), lengthB = length(toBottom);
  return {
    upper: (along, m, f) => add(add(add(top, scale(a, along * lengthA)), scale(medial, m)), scale(frontUpper, f)),
    lower: (along, m, f) => add(add(add(middle, scale(b, along * lengthB)), scale(medial, m)), scale(frontLower, f)),
    end: bottom,
    beyond: tip,
  };
}

const hindFrame = (side: Side) => limbFrame(JOINTS[`hip${side}`], JOINTS[`knee${side}`], JOINTS[`ankle${side}`], JOINTS[`toe${side}`], side === 'R' ? 1 : -1, false);
const foreFrame = (side: Side) => limbFrame(JOINTS[`shoulder${side}`], JOINTS[`elbow${side}`], JOINTS[`wrist${side}`], JOINTS[`tip${side}`], side === 'R' ? -1 : 1, true);
const between = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

export function buildLimbRoutes(lm: Landmarks): Record<LimbPart, Surface> {
  const s = (y: number) => lm.spineAt(y);
  const aortaAt = (y: number): Vec3 => [s(y).x + 7, y, s(y).ventralZ - 8];
  const cavaAt = (y: number): Vec3 => [s(y).x - 9, y, s(y).ventralZ - 9];
  const bifurcation = aortaAt(735), cavaEnd = cavaAt(735);
  const both = (make: (side: Side, sign: number) => Surface[]): Surface => mergeSurfaces(SIDES.flatMap((side) => make(side, side === 'R' ? -1 : 1)));

  // The point of division of the common iliac artery, and where the external iliac passes under the inguinal ligament, on each side.
  const hipParts = (side: Side, sign: number) => {
    const limb = hindFrame(side), hip = JOINTS[`hip${side}`];
    const division: Vec3 = [bifurcation[0] + sign * 26, 762, bifurcation[2] - 4];
    const inguinal = limb.upper(0.02, 16, 15);
    return { limb, hip, division, inguinal };
  };

  const parts: Partial<Record<LimbPart, Surface>> = {};

  // Hind limb arteries, in the order of Kochi et al. (2013). The deep femoral artery is drawn from the internal iliac artery, the commonest of its origins there.
  parts['common-iliac-arteries'] = both((side, sign) => [route([bifurcation, [bifurcation[0] + sign * 12, 750, bifurcation[2] - 2], hipParts(side, sign).division], 2.4, 2, 6)]);
  parts['median-coccygeal-artery'] = route([bifurcation, ...[770, 800, 830, 860].map((y): Vec3 => [s(y).x, y, s(y).ventralZ - 5])], 1.3, 0.8, 6);
  parts['internal-iliac-arteries'] = both((side, sign) => {
    const { division } = hipParts(side, sign);
    return [route([division, add(division, [-sign * 3, 16, 10]), add(division, [-sign * 8, 34, 14])], 1.5, 1, 6)];
  });
  parts['external-iliac-arteries'] = both((side, sign) => {
    const { division, inguinal } = hipParts(side, sign);
    return [route([division, between(division, inguinal, 0.5), inguinal], 1.9, 1.7, 6)];
  });
  parts['gluteal-arteries'] = both((side, sign) => {
    const { division, limb, hip } = hipParts(side, sign);
    const cranialEnd = limb.upper(0.08, -12, -6), caudalEnd = limb.upper(0.14, -10, -18);
    return [
      // Side by side, caudally and dorsally, with branches to the gluteal muscles and the top of the biceps femoris.
      route([add(division, [0, -4, 4]), add(hip, [-sign * 6, -6, 24]), cranialEnd], 1, 0.6, 5),
      route([add(division, [0, 4, 5]), add(hip, [-sign * 3, 8, 24]), caudalEnd], 1, 0.6, 5),
      // The caudal gluteal artery ends as the internal pudendal and lateral coccygeal arteries.
      route([add(hip, [-sign * 3, 8, 24]), add(hip, [-sign * 22, 32, 12]), [s(800).x + sign * 7, 800, s(800).ventralZ + 3]], 0.7, 0.45, 5),
      route([add(hip, [-sign * 3, 8, 24]), add(hip, [-sign * 30, 34, -14])], 0.7, 0.45, 5),
    ];
  });
  parts['iliacofemoral-arteries'] = both((side, sign) => {
    const { division, limb } = hipParts(side, sign);
    // Across, behind the iliopsoas, into the top of the quadriceps.
    return [route([add(division, [0, 2, 3]), limb.upper(-0.04, 6, 20), limb.upper(0.14, -2, 18), limb.upper(0.28, -6, 15)], 1, 0.55, 5)];
  });
  parts['pudendoepigastric-arteries'] = both((side, sign) => {
    const { division, inguinal } = hipParts(side, sign);
    const trunk = between(division, inguinal, 0.82);
    return [
      route([trunk, add(trunk, [-sign * 4, -3, -7])], 1, 0.9, 5),
      // The caudal epigastric artery runs on to the abdominal wall.
      route([add(trunk, [-sign * 4, -3, -7]), [s(690).x + sign * 22, 690, s(690).ventralZ - 42], [s(620).x + sign * 18, 620, s(620).ventralZ - 58]], 0.7, 0.35, 5),
      // The external pudendal artery runs towards the middle, parallel to the inguinal ligament, and ends in the perineum.
      route([add(trunk, [-sign * 4, -3, -7]), [s(790).x + sign * 16, 790, s(790).ventralZ - 34], [s(815).x + sign * 5, 815, s(815).ventralZ - 18]], 0.7, 0.4, 5),
    ];
  });
  // The femoral artery runs on the inner side of the thigh and divides into the popliteal and saphenous arteries above the knee.
  const femoralEnd = (limb: LimbFrame) => limb.upper(0.74, 17, 1);
  parts['femoral-arteries'] = both((side, sign) => {
    const { inguinal, limb } = hipParts(side, sign);
    return [route([inguinal, limb.upper(0.22, 19, 11), limb.upper(0.48, 19, 6), femoralEnd(limb)], 1.7, 1.25, 6)];
  });
  parts['lateral-circumflex-femoral-arteries'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    // From the middle of the femoral artery into the middle of the quadriceps, with a branch of the femoral nerve.
    return [route([limb.upper(0.36, 19, 8), limb.upper(0.42, 8, 15), limb.upper(0.56, -4, 15)], 0.8, 0.45, 5)];
  });
  parts['caudal-femoral-arteries'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    return [
      // The proximal caudal femoral artery, on the surface of the adductors and under the gracilis.
      route([limb.upper(0.46, 19, 6), limb.upper(0.54, 19, -7), limb.upper(0.66, 15, -20)], 0.85, 0.45, 5),
      // The superficial caudal epigastric artery, outwards through the inguinal fat.
      route([limb.upper(0.46, 19, 6), limb.upper(0.3, 24, 22), add(limb.upper(0.05, 24, 30), [sign * 0, -30, 0])], 0.7, 0.35, 5),
    ];
  });
  parts['deep-femoral-arteries'] = both((side, sign) => {
    const { division, limb } = hipParts(side, sign);
    const start = add(division, [-sign * 3, 16, 10]);
    // On the deep adductors, behind the femur, with branches to the external obturator and the hamstrings, whose end branches reach the biceps femoris.
    return [
      route([start, limb.upper(-0.02, 15, -9), limb.upper(0.25, 11, -11), limb.upper(0.58, 8, -14)], 1.2, 0.6, 5),
      route([limb.upper(0.25, 11, -11), limb.upper(0.3, 3, -22), limb.upper(0.38, -10, -24)], 0.6, 0.35, 5),
      route([limb.upper(0.42, 10, -12), limb.upper(0.48, 0, -24), limb.upper(0.56, -12, -24)], 0.6, 0.35, 5),
    ];
  });
  parts['obturator-arteries'] = both((side, sign) => {
    const { division, limb } = hipParts(side, sign);
    return [route([add(division, [-sign * 3, 16, 10]), limb.upper(-0.06, 18, -2), limb.upper(0.04, 16, -8)], 0.7, 0.4, 5)];
  });
  parts['saphenous-arteries'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    const split = limb.lower(0.62, 12, 0);
    return [
      // Down the inner side of the leg, close under the skin, then cranial and caudal branches to the foot.
      route([femoralEnd(limb), limb.upper(0.92, 17, -2), limb.lower(0.12, 15, -2), limb.lower(0.36, 13, -2), split], 1.05, 0.7, 5),
      route([split, limb.lower(0.82, 9, 5), between(limb.end, limb.beyond, 0.12)], 0.6, 0.35, 5),
      route([split, limb.lower(0.84, 11, -6), between(limb.end, limb.beyond, 0.22)], 0.6, 0.35, 5),
    ];
  });
  parts['popliteal-arteries'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    const fossa = limb.lower(0.02, 0, -9);
    return [
      // Outwards between the quadriceps and the adductors to the back of the knee.
      route([femoralEnd(limb), limb.upper(0.84, 6, -8), limb.upper(0.96, 0, -11), fossa], 1, 0.85, 5),
      // The medial proximal genicular artery, near its origin, to the bottom of the quadriceps.
      route([limb.upper(0.78, 13, -2), limb.upper(0.8, 6, 12), limb.upper(0.74, -2, 16)], 0.55, 0.3, 5),
      // The distal caudal femoral artery to the bottom of the biceps femoris, and the lateral proximal genicular artery from it.
      route([limb.upper(0.96, 0, -11), limb.upper(0.9, -14, -14), limb.upper(0.76, -19, -17)], 0.65, 0.35, 5),
      route([limb.upper(0.9, -14, -14), limb.upper(0.86, -18, 2), limb.upper(0.78, -14, 13)], 0.45, 0.28, 5),
    ];
  });
  parts['tibial-arteries'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    const fossa = limb.lower(0.02, 0, -9);
    return [
      // Deep on the back of the shank, and through to the front between the tibia and the fibula.
      route([fossa, limb.lower(0.3, 1, -6), limb.lower(0.72, 3, -4), between(limb.end, limb.beyond, 0.1)], 0.7, 0.35, 5),
      route([fossa, limb.lower(0.12, -3, 2), limb.lower(0.42, -3, 6), limb.lower(0.92, 0, 5), between(limb.end, limb.beyond, 0.28)], 0.6, 0.3, 5),
    ];
  });

  // Hind limb veins. The femoral and saphenous veins go with their arteries; two large veins lie on the outer side of the thigh.
  parts['common-iliac-veins'] = both((side, sign) => [route([cavaEnd, [cavaEnd[0] + sign * 13 + (side === 'L' ? 16 : 0), 756, cavaEnd[2] - 3], add(hipParts(side, sign).division, [sign * 3, 2, -6])], 2.7, 2.3, 6)]);
  parts['femoral-veins'] = both((side, sign) => {
    const { division, inguinal, limb } = hipParts(side, sign);
    // On the inner side of the artery and beside it, so that the two can be told apart when the thigh is opened.
    return [route([add(division, [sign * 3, 2, -6]), add(inguinal, [0, 3, -3]), limb.upper(0.22, 25, 11), limb.upper(0.48, 25, 6), limb.upper(0.74, 19, -2)], 2.2, 1.5, 6)];
  });
  parts['saphenous-veins'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    return [route([limb.upper(0.74, 19, -2), limb.upper(0.92, 18, -5), limb.lower(0.12, 16, -5), limb.lower(0.4, 14, -5), limb.lower(0.8, 11, -3), between(limb.end, limb.beyond, 0.14)], 1.2, 0.55, 5)];
  });
  parts['popliteal-veins'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    return [route([limb.upper(0.74, 19, -2), limb.upper(0.84, 8, -11), limb.upper(0.96, 2, -14), limb.lower(0.02, 2, -12), limb.lower(0.3, 3, -9), limb.lower(0.72, 5, -6)], 1.2, 0.5, 5)];
  });
  parts['lateral-saphenous-veins'] = both((side, sign) => {
    const { limb } = hipParts(side, sign);
    return [route([limb.lower(0.9, -12, -3), limb.lower(0.5, -15, -8), limb.lower(0.12, -14, -12), limb.upper(0.86, -24, -18)], 0.6, 1.2, 5)];
  });
  parts['ischial-veins'] = both((side, sign) => {
    const { limb, hip } = hipParts(side, sign);
    return [route([limb.upper(0.86, -24, -18), limb.upper(0.5, -27, -22), limb.upper(0.16, -22, -24), add(hip, [-sign * 16, 16, 10])], 1.2, 1.6, 5)];
  });

  // Hind limb nerves. The sciatic nerve comes from the third and fourth lumbar nerves in the mouse, leaves the pelvis behind the hip and divides above the knee into three.
  const lumbar = (y: number, side: number): Vec3 => [s(y).x + side * 6, y, s(y).canalZ];
  const sciaticStart = (side: Side, sign: number) => add(JOINTS[`hip${side}`], [-sign * 8, 14, 12]);
  parts['lumbosacral-plexus'] = both((side, sign) => [
    // The third and fourth lumbar nerves leave at the ends of their vertebrae, and run back on the psoas.
    route([lumbar(613, sign), add(lumbar(613, sign), [sign * 16, 22, -22]), add(lumbar(700, sign), [sign * 26, 0, -24]), add(sciaticStart(side, sign), [sign * 14, -10, 2])], 1, 1.3, 5),
    route([lumbar(643, sign), add(lumbar(643, sign), [sign * 15, 22, -18]), add(lumbar(712, sign), [sign * 24, 0, -18]), add(sciaticStart(side, sign), [sign * 14, -10, 2])], 1, 1.3, 5),
    route([add(sciaticStart(side, sign), [sign * 14, -10, 2]), sciaticStart(side, sign)], 1.9, 2.2, 6),
  ]);
  const sciaticDivision = (limb: LimbFrame) => limb.upper(0.7, -5, -13);
  parts['sciatic-nerves'] = both((side, sign) => {
    const limb = hindFrame(side);
    return [route([sciaticStart(side, sign), limb.upper(0.08, -9, -15), limb.upper(0.38, -8, -15), sciaticDivision(limb)], 2.2, 1.9, 7)];
  });
  parts['tibial-nerves'] = both((side) => {
    const limb = hindFrame(side);
    return [route([sciaticDivision(limb), limb.upper(0.92, -3, -14), limb.lower(0.04, 0, -11), limb.lower(0.45, 2, -8), limb.lower(0.92, 6, -5), between(limb.end, limb.beyond, 0.34)], 1.4, 0.6, 5)];
  });
  parts['common-peroneal-nerves'] = both((side) => {
    const limb = hindFrame(side);
    // Outwards round the head of the fibula and into the front of the shank.
    return [route([sciaticDivision(limb), limb.upper(0.92, -10, -11), limb.lower(0.08, -11, -2), limb.lower(0.22, -8, 6), limb.lower(0.6, -3, 7), limb.lower(0.95, 0, 5), between(limb.end, limb.beyond, 0.3)], 1.2, 0.5, 5)];
  });
  parts['sural-nerves'] = both((side) => {
    const limb = hindFrame(side);
    return [route([sciaticDivision(limb), limb.upper(0.9, -13, -15), limb.lower(0.14, -9, -14), limb.lower(0.55, -8, -11), limb.lower(0.96, -7, -5), between(limb.end, limb.beyond, 0.2)], 0.8, 0.35, 5)];
  });
  const femoralNerveStart = (limb: LimbFrame) => limb.upper(0.04, 12, 19);
  parts['femoral-nerves'] = both((side, sign) => {
    const limb = hindFrame(side);
    const from = lumbar(600, sign);
    // From the lumbar nerves through the psoas, on the outer side of the artery, with a branch into the quadriceps beside the lateral circumflex femoral artery.
    return [
      route([from, add(from, [sign * 18, 30, -26]), add(lumbar(700, sign), [sign * 30, 0, -34]), add(hipParts(side, sign).inguinal, [sign * 3, -4, 5]), femoralNerveStart(limb)], 1, 1.2, 5),
      route([femoralNerveStart(limb), limb.upper(0.2, 10, 19), limb.upper(0.42, 4, 18), limb.upper(0.58, -4, 18)], 1, 0.45, 5),
    ];
  });
  parts['saphenous-nerves'] = both((side) => {
    const limb = hindFrame(side);
    return [route([limb.upper(0.2, 10, 19), limb.upper(0.3, 18, 13), limb.upper(0.74, 15, 3), limb.upper(0.94, 15, 0), limb.lower(0.14, 13, 0), limb.lower(0.62, 10, 2), limb.lower(0.95, 8, 2)], 0.6, 0.3, 5)];
  });
  parts['obturator-nerves'] = both((side, sign) => {
    const limb = hindFrame(side);
    const from = lumbar(613, sign);
    return [route([from, add(from, [sign * 14, 30, -30]), add(lumbar(720, sign), [sign * 18, 0, -30]), limb.upper(-0.05, 19, -3), limb.upper(0.06, 18, -9), limb.upper(0.28, 15, -13)], 0.8, 0.4, 5)];
  });
  parts['gluteal-nerves'] = both((side, sign) => {
    const limb = hindFrame(side);
    return [route([sciaticStart(side, sign), limb.upper(0.04, -12, -7), limb.upper(0.14, -15, -4)], 0.6, 0.35, 5), route([sciaticStart(side, sign), limb.upper(0.06, -12, -20), limb.upper(0.18, -16, -24)], 0.6, 0.35, 5)];
  });

  // Fore limb, after Greene (1935). The left subclavian artery leaves the arch and the right comes from the innominate artery, as in the plates of Cook (1965).
  const INNOMINATE: Vec3 = [176, 336, 74];
  const LEFT_SUBCLAVIAN: Vec3 = [203, 358, 84];
  const JUNCTION: Record<Side, Vec3> = { R: [146, 336, 74], L: [216, 336, 74] };
  const axilla = (limb: LimbFrame) => limb.upper(0.04, 14, -3);
  parts['subclavian-arteries'] = both((side, sign) => {
    const limb = foreFrame(side);
    const from = side === 'R' ? INNOMINATE : LEFT_SUBCLAVIAN;
    return [route([from, add(from, [sign * 22, -8, 6]), add(from, [sign * 40, -22, 16]), add(axilla(limb), [-sign * 10, 6, -6])], 1.9, 1.5, 6)];
  });
  parts['axillary-arteries'] = both((side, sign) => {
    const limb = foreFrame(side);
    return [
      route([add(axilla(limb), [-sign * 10, 6, -6]), axilla(limb), limb.upper(0.22, 14, -2)], 1.5, 1.25, 6),
      // Branches towards the wall of the chest and round the top of the humerus.
      route([axilla(limb), add(axilla(limb), [-sign * 8, 26, -8]), add(axilla(limb), [-sign * 6, 52, -6])], 0.7, 0.35, 5),
      route([limb.upper(0.14, 14, -2), limb.upper(0.16, 2, 12), limb.upper(0.18, -11, 4)], 0.6, 0.35, 5),
    ];
  });
  parts['brachial-arteries'] = both((side) => {
    const limb = foreFrame(side);
    return [route([limb.upper(0.22, 14, -2), limb.upper(0.55, 12, 1), limb.upper(0.92, 10, 3), limb.lower(0.05, 7, 5)], 1.25, 0.9, 5)];
  });
  parts['forearm-arteries'] = both((side) => {
    const limb = foreFrame(side);
    return [
      route([limb.lower(0.05, 7, 5), limb.lower(0.4, 5, 2), limb.lower(0.85, 3, 2), between(limb.end, limb.beyond, 0.2)], 0.8, 0.4, 5),
      route([limb.lower(0.05, 7, 5), limb.lower(0.3, -3, 4), limb.lower(0.86, -4, 2)], 0.55, 0.3, 5),
    ];
  });
  parts['subclavian-veins'] = both((side, sign) => {
    const limb = foreFrame(side);
    return [route([JUNCTION[side], add(JUNCTION[side], [sign * 18, -18, 2]), add(axilla(limb), [-sign * 9, 9, -10]), limb.upper(0.22, 16, -5)], 2.2, 1.7, 6)];
  });
  parts['brachial-veins'] = both((side) => {
    const limb = foreFrame(side);
    return [route([limb.upper(0.22, 16, -5), limb.upper(0.55, 14, -2), limb.upper(0.92, 12, 0), limb.lower(0.3, 7, -1), limb.lower(0.85, 5, -1)], 1.4, 0.45, 5)];
  });
  parts['cephalic-veins'] = both((side) => {
    const limb = foreFrame(side);
    // Close under the skin on the outer side of the limb.
    return [route([limb.lower(0.85, -7, 4), limb.lower(0.3, -8, 7), limb.upper(0.9, -7, 11), limb.upper(0.45, -7, 12), limb.upper(0.1, 2, 15), limb.upper(0.04, 13, 2)], 0.45, 0.95, 5)];
  });
  const plexusAt = (side: Side, sign: number) => add(axilla(foreFrame(side)), [-sign * 12, -2, 6]);
  parts['brachial-plexus'] = both((side, sign) => {
    const gather = plexusAt(side, sign);
    return [318, 328, 338, 348, 358].map((y) => route([[s(y).x, y, s(y).canalZ], [s(y).x + sign * 22, y + 4, s(y).canalZ - 10], gather], 0.9, 1, 5));
  });
  parts['musculocutaneous-nerves'] = both((side, sign) => {
    const limb = foreFrame(side);
    return [route([plexusAt(side, sign), limb.upper(0.18, 11, 5), limb.upper(0.45, 7, 9), limb.upper(0.7, 4, 10), limb.lower(0.12, 0, 7)], 0.8, 0.35, 5)];
  });
  parts['axillary-nerves'] = both((side, sign) => {
    const limb = foreFrame(side);
    // Round the back of the humerus towards the deltoid.
    return [route([plexusAt(side, sign), limb.upper(0.12, 6, -10), limb.upper(0.18, -9, -7), limb.upper(0.28, -14, 3)], 0.8, 0.35, 5)];
  });
  parts['radial-nerves'] = both((side, sign) => {
    const limb = foreFrame(side);
    // Round the back of the humerus under the triceps, then along the outer side of the forearm.
    return [route([plexusAt(side, sign), limb.upper(0.2, 8, -8), limb.upper(0.5, -4, -11), limb.upper(0.8, -10, -3), limb.lower(0.06, -9, 4), limb.lower(0.5, -6, 5), limb.lower(0.9, -3, 3)], 1, 0.35, 5)];
  });
  parts['median-nerves'] = both((side, sign) => {
    const limb = foreFrame(side);
    // With the brachial artery, then down the middle of the forearm to the palm.
    return [route([plexusAt(side, sign), limb.upper(0.22, 12, 0), limb.upper(0.55, 10, 3), limb.upper(0.92, 8, 5), limb.lower(0.1, 5, 6), limb.lower(0.55, 2, 3), limb.lower(0.95, 1, 1), between(limb.end, limb.beyond, 0.34)], 1, 0.35, 5)];
  });
  parts['ulnar-nerves'] = both((side, sign) => {
    const limb = foreFrame(side);
    // Behind the inner side of the elbow, then along the ulnar side of the forearm.
    return [route([plexusAt(side, sign), limb.upper(0.22, 13, -4), limb.upper(0.6, 13, -7), limb.upper(0.96, 11, -7), limb.lower(0.12, 8, -6), limb.lower(0.55, 6, -4), limb.lower(0.95, 4, -2), between(limb.end, limb.beyond, 0.3)], 0.9, 0.35, 5)];
  });
  return parts as Record<LimbPart, Surface>;
}
