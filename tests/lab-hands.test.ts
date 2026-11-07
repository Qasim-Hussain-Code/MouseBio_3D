import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildHandSurface, FINGER_PLANS, handDistance, mirrorHandSurface } from '../src/viewer/lab-hand-model';
import { createHand } from '../src/viewer/lab-hands';
import { createInstrument } from '../src/viewer/lab-instruments';
import type { LabToolId } from '../src/domain/dissection-lab';

test('the hand is about the size of an adult hand beside a mouse, and closed', () => {
  const tip = FINGER_PLANS[2].joints[3];
  assert.ok(tip[1] > 0.17 && tip[1] < 0.2, `wrist to middle fingertip ${tip[1]}`);
  assert.ok(handDistance(0, 0.05, 0) < 0, 'inside the palm');
  assert.ok(handDistance(0, 0.05, 0.05) > 0, 'above the back of the hand');
  const surface = buildHandSurface(0.003);
  assert.ok(surface.positions.length > 0 && surface.indices.length > 0);
  for (let index = 0; index < surface.indices.length; index++) assert.ok(surface.indices[index] < surface.positions.length / 3);
  // Each vertex hangs on bones with weights that add to one, and its normal faces out of the shape.
  for (let vertex = 0; vertex < surface.positions.length / 3; vertex += 37) {
    const weights = surface.boneWeights.subarray(4 * vertex, 4 * vertex + 4);
    assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-5);
    const [x, y, z] = surface.positions.subarray(3 * vertex, 3 * vertex + 3), [nx, ny, nz] = surface.normals.subarray(3 * vertex, 3 * vertex + 3);
    assert.ok(handDistance(x + nx * 0.002, y + ny * 0.002, z + nz * 0.002) > handDistance(x - nx * 0.002, y - ny * 0.002, z - nz * 0.002));
  }
});

test('a left hand is the mirror of the right, with its faces still turned outward', () => {
  const right = buildHandSurface(0.004), left = mirrorHandSurface(right);
  assert.equal(left.positions[0], -right.positions[0]);
  assert.equal(left.positions[1], right.positions[1]);
  const facing = (surface: typeof right) => {
    const at = (index: number) => new THREE.Vector3().fromArray(surface.positions, 3 * surface.indices[index]);
    const n = at(1).sub(at(0)).cross(at(2).sub(at(0)));
    return n.dot(new THREE.Vector3().fromArray(surface.normals, 3 * surface.indices[0]));
  };
  assert.ok(facing(right) > 0 && facing(left) > 0);
});

const place = (made: NonNullable<ReturnType<typeof createInstrument>>, side: 1 | -1) => {
  const z = new THREE.Vector3(side * 0.6, -0.42, 0.68).normalize();
  const y = made.grip === 'rings' ? (() => { const back = new THREE.Vector3(side * 0.5, 0, 0.85); return back.addScaledVector(z, -back.dot(z)).normalize().negate(); })() : (() => { const outer = new THREE.Vector3(side, 0, 0); return outer.addScaledVector(z, -outer.dot(z)).normalize(); })();
  made.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
  made.group.updateMatrixWorld(true);
};

test('the fingers reach their places on every instrument, in either hand', () => {
  const tools: readonly LabToolId[] = ['scalpel', 'scissors', 'forceps', 'probe', 'bone-cutter', 'ligature', 'suture', 'swab', 'pin'];
  for (const tool of tools) for (const side of [1, -1] as const) {
    const made = createInstrument(tool)!;
    const hand = createHand(side === 1 ? 'right' : 'left');
    place(made, side);
    hand.hold(made, made.grip, new THREE.Vector3(side * 0.26, -0.46, 0.1));
    const misses = hand.misses();
    assert.ok(misses.thumb !== undefined && misses.index !== undefined, tool);
    assert.ok((misses.thumb ?? 1) < 0.012, `${tool} thumb ${misses.thumb}`);
    assert.ok((misses.index ?? 1) < 0.012, `${tool} index ${misses.index}`);
    assert.ok(!hand.holder.position.toArray().some(Number.isNaN), tool);
    hand.dispose();
  }
});

test('the hand follows the instrument, and the fingers keep their grip on it as it moves', () => {
  const made = createInstrument('forceps')!;
  const hand = createHand('right');
  place(made, 1);
  hand.hold(made, made.grip, new THREE.Vector3(0.26, -0.46, 0.1));
  const before = hand.holder.position.clone(), misses = { ...hand.misses() };
  made.group.position.set(0.02, 0.03, 0.01);
  made.group.updateMatrixWorld(true);
  hand.hold(made, made.grip, new THREE.Vector3(0.28, -0.43, 0.11));
  assert.ok(hand.holder.position.clone().sub(before).distanceTo(new THREE.Vector3(0.02, 0.03, 0.01)) < 1e-6);
  assert.deepEqual(hand.misses(), misses);
  hand.dispose();
});

test('closing the rings closes the blades, as on real scissors', () => {
  const made = createInstrument('scissors')!;
  const spread = () => { const holds = made.holds(); return Math.abs(holds.thumb![0] - holds.ring![0]); };
  made.setOpen(1);
  const open = spread();
  made.setOpen(0);
  const shut = spread();
  assert.ok(open > shut + 0.01, `${open} and ${shut}`);
});
