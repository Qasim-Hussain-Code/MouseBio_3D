/**
 * Simulated standing posture for the scanned specimen.
 *
 * Joint positions are read from the source CT, in voxel units of the 0.1 mm grid.
 * The trunk, skull, pelvis and scapulae stay where they were scanned. Each limb
 * segment receives one rigid transform that rotates it about its real joint, so
 * that segment lengths are preserved. The target directions are a choice made to
 * imitate a crouched standing mouse; they are not measured from any animal, and
 * everything moved by them is classified as simulated in posture.
 */
export type Vec3 = readonly [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

export type Quat = readonly [number, number, number, number];
export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];
export const quatMultiply = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export function rotate(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}
/** The smallest rotation taking one direction to another. */
export function rotationBetween(from: Vec3, to: Vec3): Quat {
  const a = unit(from), b = unit(to);
  const d = dot(a, b);
  if (d > 1 - 1e-9) return IDENTITY_QUAT;
  if (d < -1 + 1e-9) {
    const axis = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(a, b), w = 1 + d, n = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / n, c[1] / n, c[2] / n, w / n];
}

/** Maps a point p to target + rotation (p - pivot). */
export interface RigidTransform { readonly rotation: Quat; readonly pivot: Vec3; readonly target: Vec3 }
export const applyRigid = (t: RigidTransform, p: Vec3): Vec3 => add(t.target, rotate(t.rotation, sub(p, t.pivot)));

export const BONE_IDS = ['trunk', 'humerusR', 'forearmR', 'manusR', 'humerusL', 'forearmL', 'manusL', 'femurR', 'tibiaR', 'pesR', 'femurL', 'tibiaL', 'pesL', 'head', 'pelvis'] as const;
export type BoneId = (typeof BONE_IDS)[number];

/** A limb segment for assigning bone: the segment from a to b, its capsule radius and the plane offset beyond a that it starts at. */
export interface BoneSegment { readonly id: BoneId; readonly a: Vec3; readonly b: Vec3; readonly radius: number; readonly start: number }

/** Joint positions in source voxels, snapped to CT bone by mean shift from hand-read projections. */
export const JOINTS = {
  shoulderR: [125, 295, 102], elbowR: [61.5, 339.7, 44.6], wristR: [77.1, 210.3, 36], tipR: [69.9, 153, 27.2],
  shoulderL: [247.4, 292.5, 111], elbowL: [308.7, 313.6, 45.8], wristL: [312, 200, 38], tipL: [316.9, 134.9, 48],
  hipR: [120.5, 771.3, 116.2], kneeR: [38.3, 756.2, 39.9], ankleR: [89.9, 900.1, 36.9], toeR: [75, 935, 28],
  hipL: [239.3, 771.1, 122.2], kneeL: [331.7, 751.3, 44.9], ankleL: [270.4, 900.3, 43], toeL: [300, 930, 42],
} as const satisfies Record<string, Vec3>;

export const BONE_SEGMENTS: readonly BoneSegment[] = [
  { id: 'humerusR', a: JOINTS.shoulderR, b: JOINTS.elbowR, radius: 20, start: 12 },
  { id: 'forearmR', a: JOINTS.elbowR, b: JOINTS.wristR, radius: 18, start: -18 },
  { id: 'manusR', a: JOINTS.wristR, b: JOINTS.tipR, radius: 32, start: 4 },
  { id: 'humerusL', a: JOINTS.shoulderL, b: JOINTS.elbowL, radius: 20, start: 12 },
  { id: 'forearmL', a: JOINTS.elbowL, b: JOINTS.wristL, radius: 18, start: -18 },
  { id: 'manusL', a: JOINTS.wristL, b: JOINTS.tipL, radius: 32, start: 4 },
  { id: 'femurR', a: JOINTS.hipR, b: JOINTS.kneeR, radius: 20, start: 16 },
  { id: 'tibiaR', a: JOINTS.kneeR, b: JOINTS.ankleR, radius: 20, start: -10 },
  { id: 'pesR', a: JOINTS.ankleR, b: JOINTS.toeR, radius: 34, start: -12 },
  { id: 'femurL', a: JOINTS.hipL, b: JOINTS.kneeL, radius: 20, start: 16 },
  { id: 'tibiaL', a: JOINTS.kneeL, b: JOINTS.ankleL, radius: 20, start: -10 },
  { id: 'pesL', a: JOINTS.ankleL, b: JOINTS.toeL, radius: 34, start: -12 },
];

/**
 * Target unit directions, written for the limb at low native x in (x, caudal, dorsal) axes; the other limb mirrors x.
 * Limb names follow the animal: the frame is right-handed with +y caudal and +z dorsal, and the stomach and spleen lie
 * at high x, so high x is taken as the animal's left. That is an inference from label positions, not a verified laterality.
 */
const TARGETS = {
  humerus: [-0.18, 0.76, -0.62], forearm: [0.02, -0.85, -0.52],
  femur: [-0.3, -0.72, -0.62], tibia: [-0.04, 0.85, -0.53],
} as const satisfies Record<string, Vec3>;

const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
/**
 * The scan lies stretched out. The simulated posture tucks the rump down and lifts the head, each by a rotation about
 * a pivot on the vertebral column, so that the back rounds as in a standing mouse. Soft tissue blends across the bends.
 */
export const PELVIS_BEND = { pivot: [180, 640, 165] as Vec3, degrees: 24, fromY: 570, toY: 700 };
export const HEAD_BEND = { pivot: [180, 290, 110] as Vec3, degrees: 13, fromY: 320, toY: 255 };

/** A rotation about the native x axis; positive turns +y towards -z. */
function pitch(degrees: number): Quat {
  const half = (degrees * Math.PI / 180) / 2;
  return [-Math.sin(half), 0, 0, Math.cos(half)];
}

/** The chosen ground, 5.3 mm below the scanned table: the belly of a crouching mouse clears it by a few millimetres. */
export const GROUND_Z = -53;
const WRIST_HEIGHT = 12, ANKLE_HEIGHT = 18;

export interface StancePose {
  readonly transforms: Readonly<Record<BoneId, RigidTransform>>;
  /** Stance positions of the joints. */
  readonly joints: Readonly<Record<keyof typeof JOINTS, Vec3>>;
  /** Ground height in voxels, under the lowest wrist or ankle. */
  readonly groundZ: number;
}

/** The second segment keeps its horizontal heading and takes the pitch that brings its end to the given height. */
function limb(start: Vec3, middle: Vec3, end: Vec3, firstDirection: Vec3, secondHeading: Vec3, endHeight: number, movedStart: Vec3 = start) {
  const firstRotation = rotationBetween(sub(middle, start), firstDirection);
  const newMiddle = add(movedStart, scale(unit(firstDirection), length(sub(middle, start))));
  const secondLength = length(sub(end, middle));
  const pitch = Math.max(-0.97, Math.min(0.97, (endHeight - newMiddle[2]) / secondLength));
  const horizontal = unit([secondHeading[0], secondHeading[1], 0]);
  const secondDirection = add(scale(horizontal, Math.sqrt(1 - pitch * pitch)), [0, 0, pitch]);
  const secondRotation = rotationBetween(sub(end, middle), secondDirection);
  const newEnd = add(newMiddle, scale(secondDirection, secondLength));
  return {
    first: { rotation: firstRotation, pivot: start, target: movedStart } as RigidTransform,
    second: { rotation: secondRotation, pivot: middle, target: newMiddle } as RigidTransform,
    middle: newMiddle, end: newEnd,
  };
}

/** The distal segments keep their scanned orientation in the fore paw, which lay palm down, and are turned to point cranially in the hind paw. */
export function stancePose(): StancePose {
  const j = JOINTS;
  const pelvis: RigidTransform = { rotation: pitch(PELVIS_BEND.degrees), pivot: PELVIS_BEND.pivot, target: PELVIS_BEND.pivot };
  const head: RigidTransform = { rotation: pitch(HEAD_BEND.degrees), pivot: HEAD_BEND.pivot, target: HEAD_BEND.pivot };
  const foreR = limb(j.shoulderR, j.elbowR, j.wristR, TARGETS.humerus, TARGETS.forearm, GROUND_Z + WRIST_HEIGHT);
  const foreL = limb(j.shoulderL, j.elbowL, j.wristL, mirror(TARGETS.humerus), mirror(TARGETS.forearm), GROUND_Z + WRIST_HEIGHT);
  const hindR = limb(j.hipR, j.kneeR, j.ankleR, TARGETS.femur, TARGETS.tibia, GROUND_Z + ANKLE_HEIGHT, applyRigid(pelvis, j.hipR));
  const hindL = limb(j.hipL, j.kneeL, j.ankleL, mirror(TARGETS.femur), mirror(TARGETS.tibia), GROUND_Z + ANKLE_HEIGHT, applyRigid(pelvis, j.hipL));
  const pesRotation = (ankle: Vec3, toe: Vec3, lateral: number) => rotationBetween(sub(toe, ankle), [lateral, -1, 0]);
  const transforms: Record<BoneId, RigidTransform> = {
    trunk: { rotation: IDENTITY_QUAT, pivot: [0, 0, 0], target: [0, 0, 0] },
    head, pelvis,
    humerusR: foreR.first, forearmR: foreR.second,
    manusR: { rotation: IDENTITY_QUAT, pivot: j.wristR, target: foreR.end },
    humerusL: foreL.first, forearmL: foreL.second,
    manusL: { rotation: IDENTITY_QUAT, pivot: j.wristL, target: foreL.end },
    femurR: hindR.first, tibiaR: hindR.second,
    pesR: { rotation: pesRotation(j.ankleR, j.toeR, -0.1), pivot: j.ankleR, target: hindR.end },
    femurL: hindL.first, tibiaL: hindL.second,
    pesL: { rotation: pesRotation(j.ankleL, j.toeL, 0.1), pivot: j.ankleL, target: hindL.end },
  };
  const moved = (bone: BoneId, p: Vec3) => applyRigid(transforms[bone], p);
  const joints = {
    shoulderR: j.shoulderR, elbowR: foreR.middle, wristR: foreR.end, tipR: moved('manusR', j.tipR),
    shoulderL: j.shoulderL, elbowL: foreL.middle, wristL: foreL.end, tipL: moved('manusL', j.tipL),
    hipR: applyRigid(pelvis, j.hipR), kneeR: hindR.middle, ankleR: hindR.end, toeR: moved('pesR', j.toeR),
    hipL: applyRigid(pelvis, j.hipL), kneeL: hindL.middle, ankleL: hindL.end, toeL: moved('pesL', j.toeL),
  };
  return { transforms, joints, groundZ: GROUND_Z };
}

/** Which limb segment a skeleton voxel belongs to, or the trunk. Nearest capsule wins among those it lies within. */
export function boneOfVoxel(p: Vec3): BoneId {
  let best: BoneId = 'trunk', bestDistance = Infinity;
  for (const segment of BONE_SEGMENTS) {
    const axis = sub(segment.b, segment.a), len = length(axis), direction = scale(axis, 1 / len);
    const along = dot(sub(p, segment.a), direction);
    if (along < segment.start || along > len + segment.radius) continue;
    const t = Math.max(0, Math.min(len, along));
    const distance = length(sub(p, add(segment.a, scale(direction, t))));
    if (distance < segment.radius && distance < bestDistance) { best = segment.id; bestDistance = distance; }
  }
  return best;
}

/** Weighted blend of rigid transforms by dual quaternions, which avoids the volume loss of blending matrices. */
export function blendRigid(transforms: readonly RigidTransform[], weights: readonly number[], p: Vec3): Vec3 {
  let r: [number, number, number, number] = [0, 0, 0, 0];
  let d: [number, number, number, number] = [0, 0, 0, 0];
  let first: Quat | null = null;
  for (let i = 0; i < transforms.length; i++) {
    const w0 = weights[i];
    if (!w0) continue;
    const { rotation: q, pivot, target } = transforms[i];
    // Translation of the whole rigid map, x -> R x + t.
    const t = sub(target, rotate(q, pivot));
    first ??= q;
    const sign = q[0] * first[0] + q[1] * first[1] + q[2] * first[2] + q[3] * first[3] < 0 ? -1 : 1;
    const w = w0 * sign;
    const dual = quatMultiply([t[0] / 2, t[1] / 2, t[2] / 2, 0], q);
    r = [r[0] + w * q[0], r[1] + w * q[1], r[2] + w * q[2], r[3] + w * q[3]];
    d = [d[0] + w * dual[0], d[1] + w * dual[1], d[2] + w * dual[2], d[3] + w * dual[3]];
  }
  const norm = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
  const real: Quat = [r[0] / norm, r[1] / norm, r[2] / norm, r[3] / norm];
  const dual: Quat = [d[0] / norm, d[1] / norm, d[2] / norm, d[3] / norm];
  const conjugate: Quat = [-real[0], -real[1], -real[2], real[3]];
  const t = quatMultiply(dual, conjugate);
  return add(rotate(real, p), [2 * t[0], 2 * t[1], 2 * t[2]]);
}
