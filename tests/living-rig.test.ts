import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRigid, blendRigid, BONE_IDS, boneOfVoxel, HEAD_BEND, JOINTS, PELVIS_BEND, length, rotate, rotationBetween, stancePose, sub, unit, type RigidTransform, type Vec3 } from '../scripts/living/rig';

const close = (a: Vec3, b: Vec3, tolerance = 1e-6) => assert.ok(length(sub(a, b)) < tolerance, `${a} and ${b}`);

test('rotationBetween takes one direction to the other, including opposite directions', () => {
  for (const [from, to] of [[[1, 0, 0], [0, 1, 0]], [[0.2, -0.3, 0.9], [-1, 2, 0.1]], [[1, 0, 0], [-1, 0, 0]], [[0, 0, 1], [0, 0, 1]]] as [Vec3, Vec3][]) {
    close(rotate(rotationBetween(from, to), unit(from)), unit(to));
  }
});

test('the stance preserves every limb segment length and keeps segments joined at their joints', () => {
  const pose = stancePose();
  for (const [a, b] of [['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'], ['hipL', 'kneeL'], ['kneeL', 'ankleL']] as const) {
    assert.ok(Math.abs(length(sub(JOINTS[a], JOINTS[b])) - length(sub(pose.joints[a], pose.joints[b]))) < 1e-6, `${a} to ${b}`);
  }
  const t = pose.transforms;
  close(applyRigid(t.humerusR, JOINTS.shoulderR), JOINTS.shoulderR);
  close(applyRigid(t.humerusR, JOINTS.elbowR), applyRigid(t.forearmR, JOINTS.elbowR));
  close(applyRigid(t.forearmR, JOINTS.wristR), applyRigid(t.manusR, JOINTS.wristR));
  close(applyRigid(t.femurL, JOINTS.kneeL), applyRigid(t.tibiaL, JOINTS.kneeL));
  close(applyRigid(t.femurR, JOINTS.hipR), applyRigid(t.pelvis, JOINTS.hipR));
  close(applyRigid(t.femurL, JOINTS.hipL), applyRigid(t.pelvis, JOINTS.hipL));
  close(applyRigid(t.head, HEAD_BEND.pivot), HEAD_BEND.pivot);
  close(applyRigid(t.pelvis, PELVIS_BEND.pivot), PELVIS_BEND.pivot);
  close(applyRigid(t.tibiaL, JOINTS.ankleL), applyRigid(t.pesL, JOINTS.ankleL));
  assert.equal(length(sub(applyRigid(t.trunk, [10, 20, 30]), [10, 20, 30])), 0);
});

test('the stance stands: paws lie below the belly, on a common ground, knees forward of hips and elbows behind shoulders', () => {
  const { joints, groundZ } = stancePose();
  for (const name of ['wristR', 'wristL', 'ankleR', 'ankleL'] as const) {
    assert.ok(joints[name][2] < 0, `${name} below the scanned belly`);
    assert.ok(joints[name][2] - groundZ < 40, `${name} near the ground`);
  }
  assert.ok(joints.kneeR[1] < joints.hipR[1] && joints.kneeL[1] < joints.hipL[1]);
  assert.ok(joints.elbowR[1] > joints.shoulderR[1] && joints.elbowL[1] > joints.shoulderL[1]);
  assert.ok(joints.ankleR[0] < joints.ankleL[0] && joints.wristR[0] < joints.wristL[0], 'left and right stay on their sides');
});

test('the bends tuck the rump down and lift the nose', () => {
  const { transforms } = stancePose();
  const rump: Vec3 = [180, 850, 100], nose: Vec3 = [180, 50, 50];
  assert.ok(applyRigid(transforms.pelvis, rump)[2] < rump[2] - 40);
  assert.ok(applyRigid(transforms.head, nose)[2] > nose[2] + 40);
});

test('skeleton voxels are assigned to the limb segment around them and the trunk otherwise', () => {
  assert.equal(boneOfVoxel([93, 317, 73]), 'humerusR');
  assert.equal(boneOfVoxel([70, 270, 40]), 'forearmR');
  assert.equal(boneOfVoxel([72, 170, 30]), 'manusR');
  assert.equal(boneOfVoxel([80, 763, 78]), 'femurR');
  assert.equal(boneOfVoxel([300, 830, 45]), 'tibiaL');
  assert.equal(boneOfVoxel([272.7, 894.8, 43.1]), 'tibiaL', 'the end of the left shank, 0.6 mm before the ankle');
  assert.equal(boneOfVoxel([258, 905, 45]), 'pesL', 'the left heel, which lies beside the end of the shank and beyond the plane across it');
  assert.equal(boneOfVoxel([290, 915, 43]), 'pesL', 'the left foot towards the toes');
  assert.equal(boneOfVoxel([87.9, 894.5, 37]), 'tibiaR', 'the end of the right shank');
  assert.equal(boneOfVoxel([93.3, 909.5, 36.7]), 'pesR', 'the right foot, in line with the shank');
  assert.equal(boneOfVoxel([178, 500, 175]), 'trunk', 'spine');
  assert.equal(boneOfVoxel([125, 295, 102]), 'trunk', 'the shoulder joint itself stays with the scapula');
  assert.equal(boneOfVoxel([120, 390, 136]), 'trunk', 'scapula');
});

test('blending by dual quaternions reproduces one transform at full weight and keeps a shared pivot fixed', () => {
  const a: RigidTransform = { rotation: rotationBetween([1, 0, 0], [0, 1, 0]), pivot: [5, 5, 5], target: [5, 5, 5] };
  const b: RigidTransform = { rotation: rotationBetween([1, 0, 0], [0, 0, 1]), pivot: [5, 5, 5], target: [5, 5, 5] };
  const p: Vec3 = [7, 3, 9];
  close(blendRigid([a, b], [1, 0], p), applyRigid(a, p), 1e-5);
  close(blendRigid([a, b], [0, 1], p), applyRigid(b, p), 1e-5);
  close(blendRigid([a, b], [0.4, 0.6], [5, 5, 5]), [5, 5, 5], 1e-5);
  // Blending two rigid maps is rigid, so distance from the shared pivot is preserved where matrix blending would shrink it.
  assert.ok(Math.abs(length(sub(blendRigid([a, b], [0.5, 0.5], p), [5, 5, 5])) - length(sub(p, [5, 5, 5]))) < 1e-5);
  assert.equal(BONE_IDS.length, 15);
});
