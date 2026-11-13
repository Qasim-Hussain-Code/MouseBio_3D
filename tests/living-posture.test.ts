import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPosture, deformSurface, inParting, partedSurfaces, sidesOf, THIGH_REACH, UNPARTED, weightsAt, WITH_LIMB, WITH_TRUNK } from '../scripts/living/posture';
import { depthInBody, joinShare, JOIN_REACH } from '../scripts/living/exterior';
import { BONE_IDS, boneOfVoxel, JOINTS, type BoneId } from '../scripts/living/rig';
import { voxelIndex, type Grid } from '../scripts/living/volume';

// A block of soft tissue round the right thigh as it lies in the scan, with the flank in front of the knee, a thin femur along the
// line between hip and knee, a piece of the knee that lies 3 mm in front of that line, and a column of the trunk far from them.
const grid: Grid = { nx: 140, ny: 800, nz: 130 };
const voxels = grid.nx * grid.ny * grid.nz;
const at = (x: number, y: number, z: number) => voxelIndex(grid, x, y, z);
const body = new Uint8Array(voxels), bone = new Uint8Array(voxels), organs = new Uint8Array(voxels);
for (let z = 30; z < 125; z++) for (let y = 640; y < 795; y++) for (let x = 20; x < 135; x++) body[at(x, y, z)] = 1;
const femur = new Set<number>(), knee = new Set<number>(), column = new Set<number>();
const hip = JOINTS.hipR, kneeJoint = JOINTS.kneeR;
for (let k = 15; k <= 100; k++) {
  const t = k / 100, c = [hip[0] + (kneeJoint[0] - hip[0]) * t, hip[1] + (kneeJoint[1] - hip[1]) * t, hip[2] + (kneeJoint[2] - hip[2]) * t].map(Math.round);
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) femur.add(at(c[0] + dx, c[1] + dy, c[2] + dz));
}
for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) knee.add(at(38 + dx, 726 + dy, 40 + dz));
for (let z = 100; z < 110; z++) for (let y = 640; y < 795; y++) for (let x = 130; x < 134; x++) column.add(at(x, y, z));
for (const i of [...femur, ...knee, ...column]) bone[i] = 1;
const drawnAs = (i: number): BoneId | null => femur.has(i) || knee.has(i) ? 'femurR' : column.has(i) ? 'trunk' : null;
const FEMUR_R = BONE_IDS.indexOf('femurR');

test('each skeleton voxel holds its tissue to the bone it is drawn as, where the capsules of the rig would give it to the trunk', () => {
  assert.equal(boneOfVoxel([38, 726, 40]), 'trunk', 'the piece of the knee lies outside the capsule of the femur');
  const byCapsule = buildPosture(grid, body, bone, organs);
  const byBone = buildPosture(grid, body, bone, organs, drawnAs);
  assert.equal(byCapsule.owner[at(38, 726, 40)], 0);
  assert.equal(byBone.owner[at(38, 726, 40)], FEMUR_R);
  // Soft tissue beside that piece of the knee follows it.
  assert.equal(byCapsule.owner[at(38, 729, 44)], 0);
  assert.equal(byBone.owner[at(38, 729, 44)], FEMUR_R);
  // Tissue round the shaft of the femur follows the femur either way, and tissue beside the column the trunk.
  const middle = [Math.round((hip[0] + kneeJoint[0]) / 2), Math.round((hip[1] + kneeJoint[1]) / 2) - 10, Math.round((hip[2] + kneeJoint[2]) / 2)] as const;
  assert.equal(byCapsule.owner[at(...middle)], FEMUR_R);
  assert.equal(byBone.owner[at(...middle)], FEMUR_R);
  assert.equal(byBone.owner[at(128, 700, 105)], 0);
  assert.equal(byBone.owner[at(10, 700, 60)], 255, 'outside the body nothing is assigned');
});

test('a thigh carries the tissue within its reach of the femur, and the flank beyond it stays with the trunk', () => {
  const posture = buildPosture(grid, body, bone, organs, drawnAs);
  const distance = (x: number, y: number, z: number) => {
    const ab = [kneeJoint[0] - hip[0], kneeJoint[1] - hip[1], kneeJoint[2] - hip[2]], ap = [x - hip[0], y - hip[1], z - hip[2]];
    const t = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return { t, d: Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]) };
  };
  const reach = (t: number) => THIGH_REACH.hip + (THIGH_REACH.knee - THIGH_REACH.hip) * t;
  // The flank 10 mm in front of the knee lies nearest the femur by the way through the tissue, but beyond its reach.
  const flank = distance(40, 650, 45);
  assert.ok(flank.d > reach(flank.t) + 50);
  assert.equal(posture.owner[at(40, 650, 45)], 0);
  // Tissue 1.6 mm in front of the knee is within reach.
  const near = distance(38, 740, 40);
  assert.ok(near.d < reach(near.t));
  assert.equal(posture.owner[at(38, 740, 40)], FEMUR_R);
  // No soft voxel of the thigh lies beyond the reach, the count is that of the voxels returned, and the left thigh has none here.
  let beyond = 0, held = 0;
  for (let z = 30; z < 125; z++) for (let y = 640; y < 795; y++) for (let x = 20; x < 135; x++) {
    if (posture.owner[at(x, y, z)] !== FEMUR_R || bone[at(x, y, z)]) continue;
    held++;
    const { t, d } = distance(x, y, z);
    if (d > reach(t)) beyond++;
  }
  assert.equal(beyond, 0);
  assert.ok(held > 100_000, `${held} soft voxels follow the femur`);
  assert.ok(posture.beyondThighs[0] > 100_000, `${posture.beyondThighs[0]} voxels of the flank stay with the trunk`);
  assert.equal(posture.beyondThighs[1], 0);
  // The weights of the femur vanish on the flank and are whole in the thigh.
  const cell = (x: number, y: number, z: number) => voxelIndex(posture.coarse, x >> 2, y >> 2, z >> 2);
  assert.ok(posture.weights[FEMUR_R][cell(40, 650, 45)] < 1e-3);
  assert.ok(posture.weights[FEMUR_R][cell(70, 762, 70)] > 30);
});

test('the trunk and a forearm that lay against it are parted, and the upper arm joins both', () => {
  // A slab of tissue with a bone of the head along one side and, along the other, a forearm with its upper arm behind it.
  const small: Grid = { nx: 96, ny: 96, nz: 32 };
  const index = (x: number, y: number, z: number) => voxelIndex(small, x, y, z);
  const count = small.nx * small.ny * small.nz;
  const tissue = new Uint8Array(count), hard = new Uint8Array(count), none = new Uint8Array(count);
  for (let z = 4; z < 28; z++) for (let y = 8; y < 88; y++) for (let x = 8; x < 88; x++) tissue[index(x, y, z)] = 1;
  const kind = new Map<number, BoneId>();
  for (let z = 14; z < 18; z++) for (let y = 8; y < 88; y++) {
    for (let x = 16; x < 19; x++) kind.set(index(x, y, z), 'trunk');
    for (let x = 76; x < 79; x++) kind.set(index(x, y, z), y < 58 ? 'forearmL' : 'humerusL');
  }
  for (const i of kind.keys()) hard[i] = 1;
  const posture = buildPosture(small, tissue, hard, none, (i) => kind.get(i) ?? null);
  const id = (name: BoneId) => BONE_IDS.indexOf(name);
  const weights = new Float64Array(BONE_IDS.length);
  const axial = () => weights[id('trunk')] + weights[id('head')] + weights[id('pelvis')];
  const total = () => weights.reduce((sum, w) => sum + w, 0);
  // Beside the bone of the head, within the reach of the smoothing of the forearm: the head keeps the tissue whole.
  assert.equal(posture.owner[index(36, 30, 16)], 0);
  assert.equal(weightsAt(posture, [36, 30, 16], weights), WITH_TRUNK);
  assert.equal(weights[id('forearmL')], 0);
  assert.ok(axial() > 0.9 && Math.abs(axial() + weights[id('humerusL')] - 1) < 1e-9 && Math.abs(total() - 1) < 1e-9);
  // Beside the forearm the forearm keeps it, and the head takes no part.
  assert.equal(posture.owner[index(58, 30, 16)], id('forearmL'));
  assert.equal(weightsAt(posture, [58, 30, 16], weights), WITH_LIMB);
  assert.equal(axial(), 0);
  assert.ok(weights[id('forearmL')] > 0.9 && Math.abs(weights[id('forearmL')] + weights[id('humerusL')] - 1) < 1e-9 && Math.abs(total() - 1) < 1e-9);
  // Just either side of the place where the two are equal, the tissue goes wholly one way or the other.
  let last = WITH_TRUNK, changes = 0;
  for (let x = 30; x <= 64; x++) {
    const side = weightsAt(posture, [x, 30, 16], weights);
    assert.ok(side === WITH_TRUNK || side === WITH_LIMB);
    assert.ok(side === WITH_TRUNK ? weights[id('forearmL')] === 0 : axial() === 0);
    if (side !== last) { changes++; last = side; }
  }
  assert.equal(changes, 1, 'one parting between the two');
  // Far from the head, where the forearm meets its upper arm, nothing is parted and the two blend.
  assert.equal(weightsAt(posture, [86, 58, 16], weights), UNPARTED);
  assert.ok(weights[id('forearmL')] > 0.2 && weights[id('humerusL')] > 0.2);
  // Beside the head and nearer the upper arm than the forearm, the head still drops the forearm and keeps the upper arm.
  assert.equal(weightsAt(posture, [40, 80, 16], weights), WITH_TRUNK);
  assert.equal(weights[id('forearmL')], 0);
  assert.ok(weights[id('humerusL')] > 0 && axial() > weights[id('humerusL')]);
  // A triangle with corners on both sides of the parting is counted, with its longest edge after and before.
  partedSurfaces.length = 0;
  const positions = Float32Array.from([36, 30, 16, 58, 30, 16, 40, 34, 16]);
  deformSurface({ positions, normals: new Float32Array(9), indices: Uint32Array.from([0, 1, 2]) }, posture);
  assert.equal(partedSurfaces.length, 1);
  assert.equal(partedSurfaces[0].across, 1);
  assert.equal(partedSurfaces[0].withTrunk, 2);
  assert.equal(partedSurfaces[0].withLimb, 1);
  assert.ok(partedSurfaces[0].was >= 18 && partedSurfaces[0].was <= 22.1 && partedSurfaces[0].longest !== partedSurfaces[0].was);
  partedSurfaces.length = 0;
  // The parting itself is a thin layer between the two, and nothing else is.
  let layer = 0, first = -1;
  for (let x = 20; x <= 74; x++) if (inParting(posture, [x, 30, 16], weights)) { layer++; if (first < 0) first = x; }
  assert.ok(layer >= 8 && layer <= 11, `${layer} voxels across`);
  assert.ok(first > 36 && first + layer - 1 < 58);
  assert.ok(!inParting(posture, [86, 58, 16], weights), 'where the forearm meets its upper arm there is none');
  // A point given the side of another is kept by that side wherever it meets a parting, and nowhere else.
  assert.equal(weightsAt(posture, [36, 30, 16], weights, WITH_LIMB), WITH_LIMB);
  assert.equal(axial(), 0);
  assert.equal(weightsAt(posture, [58, 30, 16], weights, WITH_TRUNK), WITH_TRUNK);
  assert.equal(weights[id('forearmL')], 0);
  assert.equal(weightsAt(posture, [86, 58, 16], weights, WITH_TRUNK), UNPARTED);
  const surface = { positions, normals: new Float32Array(9), indices: Uint32Array.from([0, 1, 2]) };
  assert.deepEqual([...sidesOf(surface, posture)], [WITH_TRUNK, WITH_LIMB, WITH_TRUNK]);
  // Carried with the sides of other points, all three corners here stay with the trunk and nothing spans the parting.
  deformSurface(surface, posture, Uint8Array.from([WITH_TRUNK, WITH_TRUNK, WITH_TRUNK]));
  assert.equal(partedSurfaces[0].across, 0);
  assert.equal(partedSurfaces[0].withTrunk, 3);
  partedSurfaces.length = 0;
});

test('the depth in the body follows the smoothed field, and a limb is joined to the body only where both are near', () => {
  assert.equal(depthInBody(0), -Infinity);
  assert.equal(depthInBody(1), 3.5);
  assert.ok(Math.abs(depthInBody(0.5)) < 1e-12, 'the level of 0.5 is the face of the body');
  assert.ok(Math.abs(depthInBody(10 / 27) + 0.5) < 1e-12 && Math.abs(depthInBody(17 / 27) - 0.5) < 1e-12);
  assert.ok(Math.abs(depthInBody(1 / 27) + 2.5) < 1e-12 && Math.abs(depthInBody(26 / 27) - 2.5) < 1e-12);
  let before = -Infinity;
  for (let k = 1; k <= 200; k++) { const depth = depthInBody(k / 200); assert.ok(depth > before); before = depth; }
  assert.equal(joinShare(0, 0), 1, 'where the faces of both meet');
  assert.equal(joinShare(3, 2), 1, 'and inside both');
  assert.equal(joinShare(-3.5, 0), 0, 'on the limb far from the body');
  assert.equal(joinShare(-Infinity, 0), 0);
  assert.equal(joinShare(0, -JOIN_REACH), 0, 'on the body far from the limb');
  assert.ok(joinShare(0, -1) > joinShare(0, -3) && joinShare(0, -3) > 0);
  assert.ok(joinShare(-2, 0) > 0 && joinShare(-2, 0) < 1);
});
