/**
 * The traced skeleton divided into named bones and groups of bones. Each CT bone voxel goes to the bone whose
 * course, placed by hand on measured joints and the vertebral column, is nearest relative to its width. The boundaries
 * are therefore estimates. Names and counts follow Cook (1965) and Hummel et al. (1966).
 */
import { dot, JOINTS, sub, type BoneId, type Vec3 } from './rig';
import type { Landmarks } from './landmarks';
import type { Grid } from './volume';
import { voxelIndex } from './volume';

const M = 181;
interface Course { readonly points: readonly Vec3[]; readonly radius: number }
export interface BoneDefinition {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  /** A bone that moves as one rigid piece with this limb segment. Others follow the bends of the column. */
  readonly rigid?: BoneId;
  readonly courses: (lm: Landmarks) => readonly Course[];
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

export const BONES: readonly BoneDefinition[] = [
  { id: 'skull', name: 'Skull', note: 'The cranium and face, without the mandible.', courses: () => [c(62, [M, 70, 72], [M, 150, 95], [M, 250, 125])] },
  { id: 'mandible', name: 'Mandible', note: 'After Cook figures 14 and 15.', courses: () => paired((s) => [c(11, at(s, 8, 70, 24), at(s, 26, 150, 30), at(s, 44, 215, 52))]) },
  { id: 'cervical', name: 'Cervical vertebrae', note: 'Seven vertebrae, as counted by Hummel et al.', courses: (lm) => [c(26, ...spineLine(lm, 275, 345))] },
  { id: 'thoracic', name: 'Thoracic vertebrae', note: 'Twelve to fourteen vertebrae, as counted by Hummel et al.', courses: (lm) => [c(24, ...spineLine(lm, 345, 590))] },
  { id: 'lumbar', name: 'Lumbar vertebrae', note: 'Five or six vertebrae, as counted by Hummel et al.', courses: (lm) => [c(26, ...spineLine(lm, 590, 712))] },
  { id: 'sacrum', name: 'Sacrum', note: 'Four vertebrae, as counted by Hummel et al.', courses: (lm) => [c(24, ...spineLine(lm, 712, 800))] },
  { id: 'caudal', name: 'Caudal vertebrae in the scan', note: 'The vertebrae of the tail base that lie in the CT.', courses: (lm) => [c(22, ...spineLine(lm, 800, 930))] },
  {
    id: 'ribs', name: 'Ribs', note: 'Twelve to fourteen pairs, as counted by Hummel et al.; individual ribs are not separated.',
    courses: (lm) => paired((s) => [370, 410, 450, 490, 530, 570].map((y) => {
      const v = lm.spineAt(y).ventralZ;
      return c(16, at(s, 18, y, v + 6), at(s, 62, y + 22, v - 24), at(s, 74, y + 50, v - 70), at(s, 40, y + 62, 40));
    })),
  },
  { id: 'sternum', name: 'Sternum', note: 'Six parts in Hummel et al.; they are not separated.', courses: () => [c(14, [M, 340, 36], [M, 430, 30], [M, 530, 30])] },
  { id: 'clavicles', name: 'Clavicles', note: 'From the sternum to the shoulder.', courses: () => [c(7, at(-1, 6, 345, 42), JOINTS.shoulderR), c(7, at(1, 6, 345, 42), JOINTS.shoulderL)] },
  { id: 'scapulae', name: 'Scapulae', note: 'After Cook figure 31.', courses: () => [c(26, JOINTS.shoulderR, SCAPULA_R), c(26, JOINTS.shoulderL, SCAPULA_L)] },
  { id: 'humerus-r', name: 'Right humerus', note: 'Moved as one rigid piece.', rigid: 'humerusR', courses: () => [c(24, JOINTS.shoulderR, JOINTS.elbowR)] },
  { id: 'humerus-l', name: 'Left humerus', note: 'Moved as one rigid piece.', rigid: 'humerusL', courses: () => [c(24, JOINTS.shoulderL, JOINTS.elbowL)] },
  { id: 'forearm-r', name: 'Right radius and ulna', note: 'Moved as one rigid piece.', rigid: 'forearmR', courses: () => [c(22, JOINTS.elbowR, JOINTS.wristR)] },
  { id: 'forearm-l', name: 'Left radius and ulna', note: 'Moved as one rigid piece.', rigid: 'forearmL', courses: () => [c(22, JOINTS.elbowL, JOINTS.wristL)] },
  { id: 'manus-r', name: 'Right fore paw bones', note: 'Carpals, metacarpals and phalanges, which the source label crops. Moved as one rigid piece.', rigid: 'manusR', courses: () => [c(36, JOINTS.wristR, JOINTS.tipR)] },
  { id: 'manus-l', name: 'Left fore paw bones', note: 'Carpals, metacarpals and phalanges, which the source label crops. Moved as one rigid piece.', rigid: 'manusL', courses: () => [c(36, JOINTS.wristL, JOINTS.tipL)] },
  { id: 'pelvis', name: 'Pelvis', note: 'Both ossa coxae, after Cook figures 37 and 38.', courses: () => paired((s) => [c(28, at(s, 34, 690, 150), at(s, 56, 770, 118), at(s, 22, 836, 96)), c(20, at(s, 18, 790, 62), at(s, 44, 768, 100))]) },
  { id: 'femur-r', name: 'Right femur', note: 'Moved as one rigid piece.', rigid: 'femurR', courses: () => [c(24, JOINTS.hipR, JOINTS.kneeR)] },
  { id: 'femur-l', name: 'Left femur', note: 'Moved as one rigid piece.', rigid: 'femurL', courses: () => [c(24, JOINTS.hipL, JOINTS.kneeL)] },
  { id: 'tibia-r', name: 'Right tibia and fibula', note: 'Moved as one rigid piece.', rigid: 'tibiaR', courses: () => [c(24, JOINTS.kneeR, JOINTS.ankleR)] },
  { id: 'tibia-l', name: 'Left tibia and fibula', note: 'Moved as one rigid piece.', rigid: 'tibiaL', courses: () => [c(24, JOINTS.kneeL, JOINTS.ankleL)] },
  { id: 'pes-r', name: 'Right ankle bones in the scan', note: 'The tarsal bones that lie in the CT. Moved as one rigid piece.', rigid: 'pesR', courses: () => [c(34, JOINTS.ankleR, JOINTS.toeR)] },
  { id: 'pes-l', name: 'Left ankle bones in the scan', note: 'The tarsal bones that lie in the CT. Moved as one rigid piece.', rigid: 'pesL', courses: () => [c(34, JOINTS.ankleL, JOINTS.toeL)] },
];

/** For each voxel allowed as bone, 1 + the index of its nearest bone; 0 elsewhere. */
export function partitionBones(grid: Grid, allowed: (index: number) => boolean, lm: Landmarks): Uint8Array {
  const segments: { bone: number; a: Vec3; axis: Vec3; lengthSquared: number; radius: number }[] = [];
  BONES.forEach((bone, index) => {
    for (const course of bone.courses(lm)) for (let i = 0; i + 1 < course.points.length; i++) {
      const axis = sub(course.points[i + 1], course.points[i]);
      segments.push({ bone: index, a: course.points[i], axis, lengthSquared: dot(axis, axis) || 1, radius: course.radius });
    }
  });
  const out = new Uint8Array(grid.nx * grid.ny * grid.nz);
  for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
    const i = voxelIndex(grid, x, y, z);
    if (!allowed(i)) continue;
    let best = -1, bestScore = Infinity;
    for (const segment of segments) {
      const rx = x - segment.a[0], ry = y - segment.a[1], rz = z - segment.a[2];
      const t = Math.max(0, Math.min(1, (rx * segment.axis[0] + ry * segment.axis[1] + rz * segment.axis[2]) / segment.lengthSquared));
      const dx = rx - t * segment.axis[0], dy = ry - t * segment.axis[1], dz = rz - t * segment.axis[2];
      const score = (dx * dx + dy * dy + dz * dz) / (segment.radius * segment.radius);
      if (score < bestScore) { bestScore = score; best = segment.bone; }
    }
    out[i] = best + 1;
  }
  return out;
}
