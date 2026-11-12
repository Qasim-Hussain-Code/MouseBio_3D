/**
 * The traced skeleton divided into named bones. CT bone voxels first go to a coarse group, whose course is placed by hand on
 * measured joints and the vertebral column. The groups of the trunk and head are then divided further:
 * - The vertebrae, ribs and parts of the sternum grow from seeds through the bone, so that each voxel goes to the seed with the shortest
 *   path through bone, and a process stays with the vertebra it grows from. Limits between vertebrae are read from gaps in the CT.
 * - The CT shows no sutures, so the bones of the skull are divided by position, read off Cook (1965) figures 11 to 13.
 * All boundaries are therefore estimates. Names and counts follow Cook (1965) and Hummel et al. (1966).
 */
import { dot, JOINTS, sub, type BoneId, type Vec3 } from './rig';
import type { Landmarks } from './landmarks';
import type { Grid } from './volume';
import { voxelIndex } from './volume';

const M = 181;
/** The midline of the skull, measured from the CT. The column reaches the trunk midline further back. */
const SKULL_MIDLINE = 189.5;

interface Course { readonly points: readonly Vec3[]; readonly radius: number }
export interface BoneDefinition {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  /** How its limits were found. */
  readonly division: string;
  /** How the surface relates to the source label, where it does not lie near that label. */
  readonly surface?: string;
  /** A bone that moves as one rigid piece with this limb segment. Others follow the bends of the column. */
  readonly rigid?: BoneId;
}

const c = (radius: number, ...points: Vec3[]): Course => ({ points, radius });
const SCAPULA_R: Vec3 = [120.2, 387.8, 136.1], SCAPULA_L: Vec3 = [244, 393.5, 145.5];
const paired = (make: (s: -1 | 1) => Course[]) => [...make(-1), ...make(1)];
const at = (s: -1 | 1, x: number, y: number, z: number): Vec3 => [M + s * x, y, z];
const spineLine = (lm: Landmarks, from: number, to: number, count = 6): Vec3[] => Array.from({ length: count }, (_, i) => {
  const y = from + (to - from) * i / (count - 1);
  const s = lm.spineAt(y);
  return [s.x, y, (s.ventralZ + s.dorsalZ) / 2];
});

const NEAREST = 'Its limits are estimates, by the nearest course placed by hand on measured joints.';
const BY_SIDE = 'It is taken as the part on one side of the midline of a group whose limits are estimates, by the nearest course placed by hand on measured joints.';
const BY_POSITION = 'The CT shows no sutures, so its limits are estimates by position, read off Cook figures 11 to 13. Paired bones are not separated.';
const THROUGH_BONE = 'Its limits along the column are read from gaps in the CT between vertebral bodies, and each process goes to the vertebra with the shortest path to it through bone, so they are estimates.';
const RIB_DIVISION = 'It grows from seeds placed on this rib in the CT, each voxel going to the seed with the shortest path to it through bone, so its ends are estimates.';
const BY_BOX = 'It is an isolated bright body in the CT, so its limits are those of that body, and its name is estimated from its shape and position.';
const OUTSIDE_LABEL = 'An isosurface of the source CT in a part that the source skeleton label leaves out.';
const SHANK_DIVISION = 'It grows from seeds placed on it in sections of the CT, each voxel going to the seed with the shortest path to it through bone, so its limits with the other bone of the shank are estimates.';
const STERNUM_DIVISION = 'Its limits along the sternum are read from the places where the ribs meet it in the CT, so they are estimates.';

/** Coarse groups of bone, each with hand-placed courses. */
interface CoarseBone { readonly id: string; readonly courses: (lm: Landmarks) => readonly Course[] }
const COARSE: readonly CoarseBone[] = [
  { id: 'skull', courses: () => [c(62, [M, 70, 72], [M, 150, 95], [M, 250, 125])] },
  { id: 'mandible', courses: () => paired((s) => [c(11, at(s, 8, 70, 24), at(s, 26, 150, 30), at(s, 44, 215, 52))]) },
  { id: 'cervical', courses: (lm) => [c(26, ...spineLine(lm, 275, 345))] },
  { id: 'thoracic', courses: (lm) => [c(24, ...spineLine(lm, 345, 590))] },
  { id: 'lumbar', courses: (lm) => [c(26, ...spineLine(lm, 590, 712))] },
  { id: 'sacrum', courses: (lm) => [c(24, ...spineLine(lm, 712, 800))] },
  { id: 'caudal', courses: (lm) => [c(22, ...spineLine(lm, 800, 930))] },
  {
    id: 'ribs',
    courses: (lm) => paired((s) => [370, 410, 450, 490, 530, 570].map((y) => {
      const v = lm.spineAt(y).ventralZ;
      return c(16, at(s, 18, y, v + 6), at(s, 62, y + 22, v - 24), at(s, 74, y + 50, v - 70), at(s, 40, y + 62, 40));
    })),
  },
  { id: 'sternum', courses: () => [c(14, [M, 340, 36], [M, 430, 30], [M, 530, 30])] },
  { id: 'clavicles', courses: () => [c(7, at(-1, 6, 345, 42), JOINTS.shoulderR), c(7, at(1, 6, 345, 42), JOINTS.shoulderL)] },
  { id: 'scapulae', courses: () => [c(26, JOINTS.shoulderR, SCAPULA_R), c(26, JOINTS.shoulderL, SCAPULA_L)] },
  { id: 'humerus-r', courses: () => [c(24, JOINTS.shoulderR, JOINTS.elbowR)] },
  { id: 'humerus-l', courses: () => [c(24, JOINTS.shoulderL, JOINTS.elbowL)] },
  { id: 'forearm-r', courses: () => [c(22, JOINTS.elbowR, JOINTS.wristR)] },
  { id: 'forearm-l', courses: () => [c(22, JOINTS.elbowL, JOINTS.wristL)] },
  { id: 'manus-r', courses: () => [c(36, JOINTS.wristR, JOINTS.tipR)] },
  { id: 'manus-l', courses: () => [c(36, JOINTS.wristL, JOINTS.tipL)] },
  { id: 'pelvis', courses: () => paired((s) => [c(28, at(s, 34, 690, 150), at(s, 56, 770, 118), at(s, 22, 836, 96)), c(20, at(s, 18, 790, 62), at(s, 44, 768, 100))]) },
  { id: 'femur-r', courses: () => [c(24, JOINTS.hipR, JOINTS.kneeR)] },
  { id: 'femur-l', courses: () => [c(24, JOINTS.hipL, JOINTS.kneeL)] },
  { id: 'tibia-r', courses: () => [c(24, JOINTS.kneeR, JOINTS.ankleR)] },
  { id: 'tibia-l', courses: () => [c(24, JOINTS.kneeL, JOINTS.ankleL)] },
  { id: 'pes-r', courses: () => [c(34, JOINTS.ankleR, JOINTS.toeR)] },
  { id: 'pes-l', courses: () => [c(34, JOINTS.ankleL, JOINTS.toeL)] },
];

/**
 * Vertebrae along the column, in voxels of native y. Limits in the trunk are minima of bone in the vertebral bodies; rib heads meet the column at
 * the limits from C7/T1 to T12/T13, which gives the thoracic count of 13. In the neck and sacrum the bodies join, so limits there come from the dorsal arches
 * and the gaps between them. The counts agree with Hummel et al.: seven cervical, 12 to 14 thoracic, five or six lumbar and four sacral.
 */
export const VERTEBRAE: readonly { readonly id: string; readonly name: string; readonly from: number; readonly to: number }[] = [
  ...[[268, 283], [283, 295], [295, 303], [303, 310], [310, 319], [319, 330], [330, 340]].map(([from, to], i) => ({
    id: `c${i + 1}`, name: i === 0 ? 'Atlas (first cervical vertebra)' : i === 1 ? 'Axis (second cervical vertebra)' : `Cervical vertebra ${i + 1}`, from, to,
  })),
  ...[[340, 352], [352, 364], [364, 377], [377, 389], [389, 402], [402, 415], [415, 429], [429, 443], [443, 457], [457, 472], [472, 491], [491, 508], [508, 531]].map(([from, to], i) => ({ id: `t${i + 1}`, name: `Thoracic vertebra ${i + 1}`, from, to })),
  ...[[531, 556], [556, 585], [585, 613], [613, 643], [643, 671], [671, 700]].map(([from, to], i) => ({ id: `l${i + 1}`, name: `Lumbar vertebra ${i + 1}`, from, to })),
  ...[[700, 729], [729, 754], [754, 781], [781, 807]].map(([from, to], i) => ({ id: `s${i + 1}`, name: `Sacral vertebra ${i + 1}`, from, to })),
  ...[[807, 834], [834, 859], [859, 884], [884, 916], [916, 950]].map(([from, to], i) => ({ id: `ca${i + 1}`, name: `Caudal vertebra ${i + 1}`, from, to })),
];

/**
 * Seeds on each rib, read from the bone components and sections of the CT. The first point lies where the dorsal segment nears the column, and
 * for ribs 1 to 7 the last lies where the ventral segment leaves the sternum. Floating ribs are followed through sections. Index 0 is rib 1.
 * Low native x is the animal's right. The two sides are not quite symmetric in this specimen.
 */
const RIB_SEEDS: Readonly<Record<'r' | 'l', readonly (readonly Vec3[])[]>> = {
  r: [
    [[156, 342, 81], [170, 334, 58]],
    [[158, 352, 106], [172, 360, 45]],
    [[159, 362, 108], [165, 390, 42]],
    [[159, 373, 112], [169, 410, 40]],
    [[159, 391, 117], [170, 430, 39]],
    [[159, 402, 124], [166, 450, 40]],
    [[159, 415, 132], [167, 460, 39]],
    [[159, 426, 138]],
    [[158, 445, 149]],
    [[116, 470, 152], [104, 480, 143], [94, 490, 132]],
    [[133, 480, 164], [115, 490, 160], [102, 500, 152]],
    [[133, 500, 172], [116, 510, 168], [99, 520, 160]],
    [[154, 510, 187], [135, 520, 177], [122, 530, 178], [107, 540, 175]],
  ],
  l: [
    [[203, 345, 96], [192, 330, 54]],
    [[203, 356, 98], [191, 363, 45]],
    [[204, 368, 106], [193, 390, 44]],
    [[204, 379, 114], [191, 410, 42]],
    [[204, 387, 122], [190, 430, 42]],
    [[204, 398, 131], [196, 450, 43]],
    [[204, 411, 143], [196, 460, 43]],
    [[203, 427, 148]],
    [[203, 441, 158]],
    [[203, 458, 166], [222, 470, 165], [239, 480, 156]],
    [[202, 479, 169], [218, 490, 171]],
    [[202, 500, 177], [216, 510, 176], [233, 520, 170]],
    [[201, 521, 181], [211, 530, 183], [223, 540, 183]],
  ],
};

/** The centre line of the sternum, measured in sections of the CT. */
const STERNUM_LINE: readonly (readonly [number, number, number])[] = [[325, 180, 50], [340, 183, 50], [360, 183, 48], [380, 179, 44], [400, 179, 43], [420, 179, 42], [440, 180, 43], [460, 180, 46], [480, 180, 42], [497, 181, 38]];
/** Parts of the sternum after Cook figures 30 and 32: limits lie where ribs meet it. Hummel et al. count six parts. */
const STERNUM_PARTS: readonly { readonly id: string; readonly name: string; readonly from: number; readonly to: number }[] = [
  { id: 'manubrium', name: 'Manubrium', from: 320, to: 359 },
  { id: 'sternebra-1', name: 'Sternebra 1', from: 359, to: 384 },
  { id: 'sternebra-2', name: 'Sternebra 2', from: 384, to: 406 },
  { id: 'sternebra-3', name: 'Sternebra 3', from: 406, to: 427 },
  { id: 'sternebra-4', name: 'Sternebra 4', from: 427, to: 447 },
  { id: 'xiphisternum', name: 'Xiphisternum', from: 447, to: 500 },
];

/**
 * Small bones seen in the CT that lie outside the source skeleton label, as boxes that hold them and no other bone. The hyoid is a U-shaped bar below the skull.
 * The os penis tapers from y 784 back to y 812, close under the skin of the ventral midline, so that its broad base lies forward.
 */
const SMALL_BONES: readonly { readonly id: string; readonly min: Vec3; readonly max: Vec3 }[] = [
  { id: 'hyoid', min: [158, 241, 52], max: [221, 262, 80] },
  { id: 'os-penis', min: [156, 778, 5], max: [182, 816, 22] },
];
export function smallBoneAt(x: number, y: number, z: number): string | undefined {
  return SMALL_BONES.find(({ min, max }) => x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2])?.id;
}

const SKULL_BONES: readonly { readonly id: string; readonly name: string; readonly note: string }[] = [
  { id: 'nasal', name: 'Nasal bones', note: 'Along the top of the snout, after Cook figures 11 and 12.' },
  { id: 'premaxilla', name: 'Premaxillae', note: 'At the front of the snout, holding the upper incisors, after Cook figures 12 and 13.' },
  { id: 'maxilla', name: 'Maxillae', note: 'On the side of the snout and the roof of the mouth, holding the molars, after Cook figures 12 and 13.' },
  { id: 'palatine', name: 'Palatine bones', note: 'Behind the molars in the roof of the mouth, after Cook figure 13.' },
  { id: 'frontal', name: 'Frontal bones', note: 'Between the orbits, after Cook figures 11 and 12.' },
  { id: 'zygomatic', name: 'Zygomatic arches', note: 'The arch lateral to the orbit, after Cook figures 11 and 12.' },
  { id: 'parietal', name: 'Parietal bones', note: 'The roof of the braincase, after Cook figures 11 and 12.' },
  { id: 'squamosal', name: 'Squamosal bones', note: 'The side of the braincase, after Cook figures 11 and 12.' },
  { id: 'interparietal', name: 'Interparietal bone', note: 'Behind the parietals, after Cook figures 11 and 12.' },
  { id: 'occipital', name: 'Occipital bone', note: 'The back and base of the braincase round the foramen magnum, after Cook figures 11 to 13.' },
  { id: 'sphenoid', name: 'Sphenoid bones', note: 'The floor of the braincase, including the pterygoid processes, after Cook figures 12 and 13.' },
  { id: 'bulla', name: 'Tympanic bullae', note: 'The swellings that hold the middle ears, with the external auditory meatus, after Cook figures 12 and 13.' },
];

const SIDED = (id: string, name: string, note: string, division: string, rigid?: BoneId): BoneDefinition => ({ id, name, note, division, rigid });
const RIB_KIND = (rib: number) => rib <= 7 ? 'A true rib, which reaches the sternum, as in Cook figure 32.' : rib <= 10 ? 'A false rib, as in Cook figure 32.' : 'A floating rib, as in Cook figure 32.';

export const BONES: readonly BoneDefinition[] = [
  ...SKULL_BONES.map((bone) => ({ ...bone, division: BY_POSITION })),
  { id: 'hyoid', name: 'Hyoid', note: 'A U-shaped bone below the skull that the source skeleton label leaves out. Hummel et al. name it as an attachment of the tongue.', division: BY_BOX, surface: OUTSIDE_LABEL },
  SIDED('mandible-r', 'Right mandible', 'After Cook figures 14 and 15.', BY_SIDE),
  SIDED('mandible-l', 'Left mandible', 'After Cook figures 14 and 15.', BY_SIDE),
  ...VERTEBRAE.map((vertebra) => ({ id: vertebra.id, name: vertebra.name, note: vertebra.id.startsWith('ca') ? 'One of the caudal vertebrae of the tail base that lie in the CT.' : 'Counted from the column in the CT, as described by Hummel et al.', division: THROUGH_BONE })),
  ...Array.from({ length: 13 }, (_, i) => (['r', 'l'] as const).map((side) => ({
    id: `rib-${i + 1}-${side}`, name: `${side === 'r' ? 'Right' : 'Left'} rib ${i + 1}`, note: `${RIB_KIND(i + 1)} Thirteen pairs are seen in the CT; Hummel et al. count 12 to 14.`, division: RIB_DIVISION,
  }))).flat(),
  ...STERNUM_PARTS.map((part) => ({ id: part.id, name: part.name, note: 'After Cook figures 30 and 32. Hummel et al. count six parts.', division: STERNUM_DIVISION })),
  SIDED('clavicle-r', 'Right clavicle', 'From the sternum to the shoulder.', BY_SIDE),
  SIDED('clavicle-l', 'Left clavicle', 'From the sternum to the shoulder.', BY_SIDE),
  SIDED('scapula-r', 'Right scapula', 'After Cook figure 31.', BY_SIDE),
  SIDED('scapula-l', 'Left scapula', 'After Cook figure 31.', BY_SIDE),
  SIDED('humerus-r', 'Right humerus', 'Moved as one rigid piece.', NEAREST, 'humerusR'),
  SIDED('humerus-l', 'Left humerus', 'Moved as one rigid piece.', NEAREST, 'humerusL'),
  SIDED('forearm-r', 'Right radius and ulna', 'Moved as one rigid piece.', NEAREST, 'forearmR'),
  SIDED('forearm-l', 'Left radius and ulna', 'Moved as one rigid piece.', NEAREST, 'forearmL'),
  SIDED('manus-r', 'Right fore paw bones', 'Carpals, metacarpals and phalanges, which the source label crops. Moved as one rigid piece. Parts lie outside the sculpted paw, by up to about 1.1 mm.', NEAREST, 'manusR'),
  SIDED('manus-l', 'Left fore paw bones', 'Carpals, metacarpals and phalanges, which the source label crops. Moved as one rigid piece. Parts lie outside the sculpted paw, by up to about 2.1 mm.', NEAREST, 'manusL'),
  { id: 'os-penis', name: 'Os penis', note: 'A tapering bone under the skin of the ventral midline, which the source skeleton label leaves out. Hummel et al. describe a small bone in the penis.', division: BY_BOX, surface: OUTSIDE_LABEL },
  SIDED('coxa-r', 'Right os coxae', 'After Cook figures 37 and 38.', BY_SIDE),
  SIDED('coxa-l', 'Left os coxae', 'After Cook figures 37 and 38.', BY_SIDE),
  SIDED('femur-r', 'Right femur', 'Moved as one rigid piece.', NEAREST, 'femurR'),
  SIDED('femur-l', 'Left femur', 'Moved as one rigid piece.', NEAREST, 'femurL'),
  SIDED('tibia-r', 'Right tibia', 'With the distal part where the fibula joins it. Moved as one rigid piece.', SHANK_DIVISION, 'tibiaR'),
  SIDED('tibia-l', 'Left tibia', 'With the distal part where the fibula joins it. Moved as one rigid piece.', SHANK_DIVISION, 'tibiaL'),
  SIDED('fibula-r', 'Right fibula', 'The free part, which sections of the CT show apart from the tibia. Hummel et al. describe the two as separate for the proximal two thirds and fused along the distal third. Moved as one rigid piece.', SHANK_DIVISION, 'tibiaR'),
  SIDED('fibula-l', 'Left fibula', 'The free part, which sections of the CT show apart from the tibia. Hummel et al. describe the two as separate for the proximal two thirds and fused along the distal third. Moved as one rigid piece.', SHANK_DIVISION, 'tibiaL'),
  SIDED('pes-r', 'Right ankle bones in the scan', 'The tarsal bones that lie in the CT. Moved as one rigid piece. Parts lie outside the sculpted paw, by up to about 1.8 mm.', NEAREST, 'pesR'),
  SIDED('pes-l', 'Left ankle bones in the scan', 'The tarsal bones that lie in the CT. Moved as one rigid piece. Parts lie outside the sculpted paw, by up to about 0.8 mm.', NEAREST, 'pesL'),
];

const indexOfBone = new Map(BONES.map((bone, index) => [bone.id, index + 1]));
const part = (id: string): number => {
  const value = indexOfBone.get(id);
  if (!value) throw new Error(`Unknown bone ${id}`);
  return value;
};

const interpolate = (points: readonly (readonly [number, number])[], y: number): number => {
  if (y <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (y <= points[i][0]) {
    const [y0, v0] = points[i - 1], [y1, v1] = points[i];
    return v0 + (v1 - v0) * (y - y0) / (y1 - y0);
  }
  return points[points.length - 1][1];
};
// The outline of the skull seen from the side and from above, read from the CT.
const TOP_LINE: readonly (readonly [number, number])[] = [[75, 55], [100, 80], [125, 112], [150, 130], [175, 145], [210, 160], [250, 165], [262, 160], [270, 127]];
const BASE_LINE: readonly (readonly [number, number])[] = [[92, 35], [135, 57], [162, 38], [192, 42], [215, 85], [240, 85], [270, 107]];
const BRAIN_WIDTH: readonly (readonly [number, number])[] = [[120, 18], [150, 27], [175, 41], [195, 51], [240, 51], [262, 40], [280, 28]];
const SKULL_FRONT = 75, SKULL_LENGTH = 203;

/** Which bone of the skull a voxel falls in, by position. Proportions are read off Cook figures 11 to 13 and scaled to the length of this skull. */
export function skullBoneAt(x: number, y: number, z: number): string {
  const u = (y - SKULL_FRONT) / SKULL_LENGTH;
  const side = Math.abs(x - SKULL_MIDLINE);
  const top = interpolate(TOP_LINE, y), base = interpolate(BASE_LINE, y);
  const height = (z - base) / Math.max(10, top - base);
  const brain = interpolate(BRAIN_WIDTH, y);
  if (u >= 0.92) return 'occipital';
  if (u >= 0.84 && height > 0.55 && side < 34) return 'interparietal';
  if (u >= 0.82 && side < 22 && height <= 0.55) return 'occipital';
  if (u >= 0.72 && u < 0.92 && height < 0.42 && side >= 14) return 'bulla';
  if (u >= 0.55 && u < 0.82 && height < 0.34 && side < 30) return 'sphenoid';
  if (u >= 0.45 && u < 0.56 && height < 0.26 && side < 18) return 'palatine';
  if (y >= 150 && y <= 200 && side > brain + 4) return 'zygomatic';
  if (u >= 0.62 && u < 0.84) return height > 0.62 || side < 28 ? 'parietal' : 'squamosal';
  if (u >= 0.33) return height > 0.45 ? 'frontal' : 'maxilla';
  if (height > 0.6 && side <= 12) return 'nasal';
  return u < 0.23 ? 'premaxilla' : 'maxilla';
}

const SIDE_SPLIT: Readonly<Record<string, readonly [string, string]>> = {
  mandible: ['mandible-r', 'mandible-l'], clavicles: ['clavicle-r', 'clavicle-l'], pelvis: ['coxa-r', 'coxa-l'],
};
// The scapulae lie against the ribs, so they grow through bone from their own seeds along with the ribs. The tibia and fibula are divided the same way.
const AXIAL = new Set(['cervical', 'thoracic', 'lumbar', 'sacrum', 'caudal', 'ribs', 'sternum', 'scapulae', 'tibia-r', 'tibia-l']);
/** Seeds on the bones of the shank, read from sections of the CT. Low native x is the animal's right. Below these fibula seeds the two bones are one. */
const SHANK_SEEDS: Readonly<Record<string, readonly Vec3[]>> = {
  'tibia-r': [[40, 775, 35], [43, 790, 35], [44, 805, 26], [47, 820, 26], [53, 835, 29], [62, 850, 33], [72, 865, 37], [82, 880, 38], [88, 895, 36]],
  'fibula-r': [[66, 805, 47], [74, 820, 43], [78, 835, 41], [79, 850, 40]],
  'tibia-l': [[325, 775, 48], [326, 790, 41], [321, 805, 39], [313, 820, 39], [303, 835, 46], [293, 850, 45], [286, 865, 45], [281, 880, 43], [276, 895, 44]],
  'fibula-l': [[298, 790, 59], [292, 805, 55], [289, 820, 52]],
};

const vertebraAt = (y: number) => VERTEBRAE.find((vertebra) => y < vertebra.to) ?? VERTEBRAE[VERTEBRAE.length - 1];
const sternumAt = (y: number) => STERNUM_PARTS.find((item) => y < item.to) ?? STERNUM_PARTS[STERNUM_PARTS.length - 1];

/** The rib whose seeds lie nearest a point, for bone that no seed can reach. */
function nearestRib(x: number, y: number, z: number): string {
  let best = 'rib-1-r', distance = Infinity;
  for (const side of ['r', 'l'] as const) RIB_SEEDS[side].forEach((seeds, rib) => {
    for (const seed of seeds) {
      const d = (x - seed[0]) ** 2 + (y - seed[1]) ** 2 + (z - seed[2]) ** 2;
      if (d < distance) { distance = d; best = `rib-${rib + 1}-${side}`; }
    }
  });
  return best;
}

/** For each voxel allowed as bone, 1 + the index of its bone; 0 elsewhere. */
export function partitionBones(grid: Grid, allowed: (index: number) => boolean, lm: Landmarks): Uint8Array {
  const { nx, ny, nz } = grid;
  const segments: { bone: number; a: Vec3; axis: Vec3; lengthSquared: number; radius: number }[] = [];
  COARSE.forEach((bone, index) => {
    for (const course of bone.courses(lm)) for (let i = 0; i + 1 < course.points.length; i++) {
      const axis = sub(course.points[i + 1], course.points[i]);
      segments.push({ bone: index, a: course.points[i], axis, lengthSquared: dot(axis, axis) || 1, radius: course.radius });
    }
  });
  const out = new Uint8Array(nx * ny * nz);
  // Voxels of the column, ribs, sternum, scapulae and shanks, for the growth from seeds.
  const axial: number[] = [];
  const coarseOf = new Map<number, string>();
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = voxelIndex(grid, x, y, z);
    if (!allowed(i)) continue;
    const small = smallBoneAt(x, y, z);
    if (small) { out[i] = part(small); continue; }
    let best = -1, bestScore = Infinity;
    for (const segment of segments) {
      const rx = x - segment.a[0], ry = y - segment.a[1], rz = z - segment.a[2];
      const t = Math.max(0, Math.min(1, (rx * segment.axis[0] + ry * segment.axis[1] + rz * segment.axis[2]) / segment.lengthSquared));
      const dx = rx - t * segment.axis[0], dy = ry - t * segment.axis[1], dz = rz - t * segment.axis[2];
      const score = (dx * dx + dy * dy + dz * dz) / (segment.radius * segment.radius);
      if (score < bestScore) { bestScore = score; best = segment.bone; }
    }
    const coarse = COARSE[best].id;
    if (AXIAL.has(coarse)) { axial.push(i); coarseOf.set(i, coarse); continue; }
    if (coarse === 'skull') out[i] = part(skullBoneAt(x, y, z));
    else if (SIDE_SPLIT[coarse]) out[i] = part(SIDE_SPLIT[coarse][x < (coarse === 'mandible' ? SKULL_MIDLINE : M) ? 0 : 1]);
    else out[i] = part(coarse);
  }

  // Seeds. Unclaimed voxels are marked; a seed claims the axial voxels in a small neighbourhood of its point.
  const UNCLAIMED = 255;
  for (const i of axial) out[i] = UNCLAIMED;
  const queue = new Int32Array(axial.length);
  let head = 0, tail = 0;
  const claim = (x: number, y: number, z: number, value: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return;
    const i = voxelIndex(grid, x, y, z);
    if (out[i] === UNCLAIMED) { out[i] = value; queue[tail++] = i; }
  };
  const ball = (centre: Vec3, radius: number, value: number) => {
    const [cx, cy, cz] = centre.map(Math.round);
    for (let dz = -radius; dz <= radius; dz++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy + dz * dz <= radius * radius) claim(cx + dx, cy + dy, cz + dz, value);
    }
  };
  for (const side of ['r', 'l'] as const) RIB_SEEDS[side].forEach((seeds, rib) => {
    for (const seed of seeds) ball(seed, 3, part(`rib-${rib + 1}-${side}`));
  });
  for (const [side, seeds] of [['r', [SCAPULA_R, [134, 359, 141]]], ['l', [SCAPULA_L, [225, 363, 147]]]] as const) for (const seed of seeds) ball(seed, 6, part(`scapula-${side}`));
  for (const [id, seeds] of Object.entries(SHANK_SEEDS)) for (const seed of seeds) ball(seed, id.startsWith('fibula') ? 2 : 4, part(id));
  for (const item of STERNUM_PARTS) for (let y = item.from + 2; y <= item.to - 2; y++) {
    const cx = interpolate(STERNUM_LINE.map(([ly, lx]) => [ly, lx] as const), y), cz = interpolate(STERNUM_LINE.map(([ly, , lz]) => [ly, lz] as const), y);
    ball([cx, y, cz], 3, part(item.id));
  }
  for (const vertebra of VERTEBRAE) {
    const value = part(vertebra.id);
    for (let y = vertebra.from + 2; y <= vertebra.to - 2; y++) {
      const s = lm.spineAt(y);
      // The body, in the line of the column.
      for (let z = Math.round(s.ventralZ) + 1; z <= Math.round(s.canalZ) - 4; z++) for (let x = Math.round(s.x) - 5; x <= Math.round(s.x) + 5; x++) claim(x, y, z, value);
      // The dorsal arch, shifted along the column by its slope, so that a plane through the vertebra stays square to it.
      const slope = (lm.spineAt(y + 10).ventralZ - lm.spineAt(y - 10).ventralZ) / 20;
      const shifted = Math.round(y - slope * (s.canalZ + 7 - s.ventralZ));
      const a = lm.spineAt(shifted);
      for (let z = Math.round(a.canalZ) + 4; z <= Math.round(a.canalZ) + 10; z++) for (let x = Math.round(a.x) - 3; x <= Math.round(a.x) + 3; x++) claim(x, shifted, z, value);
    }
  }
  // Growth through bone, in rings, so that each voxel goes to the seed with the shortest path.
  while (head < tail) {
    const i = queue[head++];
    const z = Math.floor(i / (nx * ny)), rest = i - z * nx * ny, y = Math.floor(rest / nx), x = rest - y * nx;
    const value = out[i];
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) claim(x + dx, y + dy, z + dz, value);
  }
  // Bone that no seed reached goes by position.
  for (const i of axial) {
    if (out[i] !== UNCLAIMED) continue;
    const z = Math.floor(i / (nx * ny)), rest = i - z * nx * ny, y = Math.floor(rest / nx), x = rest - y * nx;
    const coarse = coarseOf.get(i);
    out[i] = part(coarse === 'ribs' ? nearestRib(x, y, z) : coarse === 'sternum' ? sternumAt(y).id : coarse === 'scapulae' ? (x < M ? 'scapula-r' : 'scapula-l') : coarse?.startsWith('tibia') ? coarse : vertebraAt(y).id);
  }
  return out;
}

export type RibLines = Readonly<Record<'r' | 'l', readonly (readonly Vec3[])[]>>;

/**
 * The measured course of each rib, from the column outwards, as the mean position of its voxels at each path length through the bone from its first seed.
 * The result holds as much of the rib as is joined to that seed; a ventral segment that does not touch the dorsal segment in the CT is left out.
 */
export function ribCourses(grid: Grid, parts: Uint8Array, spacing = 6): RibLines {
  const { nx, ny, nz } = grid;
  const members = new Map<number, number[]>();
  const wanted = new Set<number>();
  for (const side of ['r', 'l'] as const) RIB_SEEDS[side].forEach((_, rib) => { const value = part(`rib-${rib + 1}-${side}`); wanted.add(value); members.set(value, []); });
  for (let i = 0; i < parts.length; i++) if (wanted.has(parts[i])) members.get(parts[i])!.push(i);
  const line = (side: 'r' | 'l', rib: number): Vec3[] => {
    const voxels = members.get(part(`rib-${rib + 1}-${side}`))!;
    if (!voxels.length) return [];
    const seed = RIB_SEEDS[side][rib][0];
    const position = (i: number): Vec3 => { const z = Math.floor(i / (nx * ny)), rest = i - z * nx * ny, y = Math.floor(rest / nx); return [rest - y * nx, y, z]; };
    const squared = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    // A rib can lie in more than one piece in the CT. The largest piece holds most of its course, and it is followed from its end nearest the column.
    const piece = new Map<number, number>();
    const walk = (start: number, into: Map<number, number>) => {
      const queue = [start];
      into.set(start, 0);
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head], d = into.get(i)!;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const other = i + dx + dy * nx + dz * nx * ny;
          if (parts[other] === parts[i] && !into.has(other)) { into.set(other, d + 1); queue.push(other); }
        }
      }
      return queue;
    };
    let largest: number[] = [];
    for (const i of voxels) {
      if (piece.has(i)) continue;
      const found = walk(i, piece);
      if (found.length > largest.length) largest = found;
    }
    let start = largest[0];
    for (const i of largest) if (squared(position(i), seed) < squared(position(start), seed)) start = i;
    const distance = new Map<number, number>();
    const queue = walk(start, distance);
    const sums: [number, number, number, number][] = [];
    for (const i of queue) {
      const bin = Math.floor(distance.get(i)! / spacing), p = position(i);
      sums[bin] ??= [0, 0, 0, 0];
      sums[bin][0] += p[0]; sums[bin][1] += p[1]; sums[bin][2] += p[2]; sums[bin][3]++;
    }
    return sums.filter((sum) => sum && sum[3] >= 2).map((sum): Vec3 => [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]]);
  };
  const lines = (side: 'r' | 'l') => RIB_SEEDS[side].map((_, rib) => line(side, rib));
  return { r: lines('r'), l: lines('l') };
}
