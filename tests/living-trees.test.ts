import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionBones, BONES } from '../scripts/living/bones';
import { measureLandmarks } from '../scripts/living/landmarks';
import { surfaceMeasures } from '../scripts/living/surface-nets';
import { growTree, treeSurface } from '../scripts/living/trees';
import { JOINTS, type Vec3 } from '../scripts/living/rig';

const sphere = (x: number, y: number, z: number) => (x - 50) ** 2 + (y - 50) ** 2 + (z - 50) ** 2 < 40 ** 2;
const box: [Vec3, Vec3] = [[0, 0, 0], [100, 100, 100]];

test('a grown tree fills its volume from its root, stays near it, and repeats exactly', () => {
  const options = { points: 300, step: 3, influence: 25, killDistance: 5, seed: 3 };
  const { nodes } = growTree(sphere, box, [50, 50, 10], [0, 0, 1], options);
  assert.ok(nodes.length > 100, String(nodes.length));
  assert.deepEqual(nodes[0].position, [50, 50, 10]);
  for (const node of nodes) assert.ok(Math.hypot(node.position[0] - 50, node.position[1] - 50, node.position[2] - 50) < 46);
  assert.ok(nodes.some((node) => node.position[2] > 70), 'it reaches the far side');
  const again = growTree(sphere, box, [50, 50, 10], [0, 0, 1], options);
  assert.deepEqual(again.nodes.map((node) => node.position), nodes.map((node) => node.position));
});

test('radii follow the law of branching from the tips to the root, within the stated maximum', () => {
  const options = { points: 300, step: 3, influence: 25, killDistance: 5, seed: 5, exponent: 2.8, terminalRadius: 0.3, maximumRadius: 50 };
  const { nodes } = growTree(sphere, box, [50, 50, 10], [0, 0, 1], options);
  for (const node of nodes) {
    if (!node.children.length) { assert.equal(node.radius, 0.3); continue; }
    const sum = node.children.reduce((total, child) => total + nodes[child].radius ** 2.8, 0);
    assert.ok(Math.abs(node.radius - sum ** (1 / 2.8)) < 1e-9);
    for (const child of node.children) assert.ok(nodes[child].radius <= node.radius + 1e-9);
  }
  assert.ok(nodes[0].radius > 1);
  const capped = growTree(sphere, box, [50, 50, 10], [0, 0, 1], { ...options, maximumRadius: 1 });
  assert.ok(capped.nodes.every((node) => node.radius <= 1));
});

test('a tree becomes closed tubes with valid indices', () => {
  const { nodes } = growTree(sphere, box, [50, 50, 10], [0, 0, 1], { points: 120, seed: 9 });
  const surface = treeSurface(nodes, 5);
  assert.ok(surface.indices.length > 300);
  const vertices = surface.positions.length / 3;
  for (const index of surface.indices) assert.ok(index < vertices);
  assert.ok(surfaceMeasures(surface).volume > 0);
});

test('bones go to the nearest course: a femur voxel to the femur and a rib voxel to the ribs', () => {
  const grid = { nx: 380, ny: 992, nz: 208 };
  const voxels = grid.nx * grid.ny * grid.nz;
  const empty = new Uint8Array(voxels);
  const spine = measureLandmarks(grid, empty, empty);
  const names = (p: Vec3) => {
    const wanted = (p[2] * grid.ny + p[1]) * grid.nx + p[0];
    const parts = partitionBones(grid, (i) => i === wanted, spine);
    return BONES[parts[wanted] - 1].id;
  };
  const middle = (a: Vec3, b: Vec3): Vec3 => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2)];
  assert.equal(names(middle(JOINTS.hipR, JOINTS.kneeR)), 'femur-r');
  assert.equal(names(middle(JOINTS.hipL, JOINTS.kneeL)), 'femur-l');
  assert.equal(names(middle(JOINTS.shoulderR, JOINTS.elbowR)), 'humerus-r');
  assert.equal(names(middle(JOINTS.kneeL, JOINTS.ankleL)), 'tibia-l');
  assert.equal(names([181, 150, 100]), 'skull');
  assert.equal(names([181, 430, 30]), 'sternum');
});
