import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionBones, ribCourses, BONES, VERTEBRAE } from '../scripts/living/bones';
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

test('bones are divided: by course in the limbs, by position in the skull, and along the column and sternum', () => {
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
  assert.equal(names([190, 150, 125]), 'frontal');
  assert.equal(names([190, 120, 100]), 'nasal');
  assert.equal(names([190, 225, 160]), 'parietal');
  assert.equal(names([225, 240, 95]), 'bulla');
  assert.equal(names([190, 255, 160]), 'interparietal');
  assert.equal(names([190, 262, 110]), 'occipital');
  assert.equal(names([181, 430, 42]), 'sternebra-4');
  assert.equal(names([181, 335, 48]), 'manubrium');
  assert.equal(names(middle(JOINTS.hipR, JOINTS.kneeR)), 'femur-r');
  const coxae = [names([125, 770, 118]), names([237, 770, 118])];
  assert.deepEqual(coxae, ['coxa-r', 'coxa-l'], 'a pelvis voxel goes to its own side');
});

test('the skeleton is listed bone by bone, with the counts of the sources', () => {
  const ids = BONES.map((bone) => bone.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(BONES.length < 255, 'each voxel holds its bone in one byte');
  const count = (prefix: RegExp) => ids.filter((id) => prefix.test(id)).length;
  assert.equal(count(/^c[0-9]+$/), 7);
  assert.equal(count(/^t[0-9]+$/), 13);
  assert.equal(count(/^l[0-9]+$/), 6);
  assert.equal(count(/^s[0-9]+$/), 4);
  assert.equal(count(/^rib-[0-9]+-r$/), 13);
  assert.equal(count(/^rib-[0-9]+-l$/), 13);
  for (const bone of BONES) assert.ok(bone.division.length > 20, bone.id);
  // Limits along the column follow on from one another, without gaps or overlaps.
  VERTEBRAE.slice(1).forEach((vertebra, i) => assert.equal(vertebra.from, VERTEBRAE[i].to, vertebra.id));
  for (const vertebra of VERTEBRAE) assert.ok(vertebra.to > vertebra.from, vertebra.id);
});

test('seeded growth keeps each rib apart and sends a process to its own vertebra', () => {
  const grid = { nx: 380, ny: 992, nz: 208 };
  const voxels = grid.nx * grid.ny * grid.nz;
  const empty = new Uint8Array(voxels);
  const spine = measureLandmarks(grid, empty, empty);
  const index = (x: number, y: number, z: number) => (z * grid.ny + y) * grid.nx + x;
  // A column segment and, from thoracic vertebra 6, a process that leans back over the next vertebra.
  const inside = new Set<number>();
  const s = spine.spineAt(408);
  const zBody = Math.round((s.ventralZ + s.canalZ) / 2);
  for (let y = 395; y <= 425; y++) for (let x = 178; x <= 184; x++) for (let z = zBody - 2; z <= zBody + 2; z++) inside.add(index(x, y, z));
  // A lateral process that starts at y 408 and runs back to y 420 well beside the column.
  for (let t = 0; t <= 14; t++) inside.add(index(184 + t, 408 + Math.min(12, t), zBody));
  const parts = partitionBones(grid, (i) => inside.has(i), spine);
  const name = (x: number, y: number, z: number) => BONES[parts[index(x, y, z)] - 1].id;
  assert.equal(name(181, 408, zBody), 't6');
  assert.equal(name(181, 420, zBody), 't7');
  assert.equal(name(198, 420, zBody), 't6', 'the tip of the process lies over thoracic vertebra 7 but goes with its own vertebra');
});

test('a rib course runs from the column along its largest piece of bone', () => {
  const grid = { nx: 380, ny: 992, nz: 208 };
  const parts = new Uint8Array(grid.nx * grid.ny * grid.nz);
  const index = (x: number, y: number, z: number) => (z * grid.ny + y) * grid.nx + x;
  const rib = BONES.findIndex((bone) => bone.id === 'rib-2-r') + 1;
  // The main piece runs out from the column, and a small piece lies apart from it.
  for (let x = 160; x >= 110; x--) parts[index(x, 352, 106)] = rib;
  for (let x = 100; x >= 95; x--) parts[index(x, 380, 60)] = rib;
  const line = ribCourses(grid, parts).r[1];
  assert.ok(line.length >= 8);
  assert.ok(Math.abs(line[0][0] - 158) < 6, `it starts at the column, at x ${line[0][0]}`);
  assert.ok(line[line.length - 1][0] < 118, 'it runs outwards');
  for (const point of line) assert.equal(point[1], 352, 'the small piece is left out');
});
