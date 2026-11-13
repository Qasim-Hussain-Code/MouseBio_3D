import assert from 'node:assert/strict';
import test from 'node:test';
import { drawLayers, insidePlanes, supportPlanes, surfaceForm } from '../scripts/living/attachments';
import { length, sub, type Vec3 } from '../scripts/living/rig';
import { surfaceNets } from '../scripts/living/surface-nets';
import { partSheets, voxelIndex, type Grid } from '../scripts/living/volume';

test('the form of a surface tells a closed ball from a ring and from two pieces', () => {
  const grid: Grid = { nx: 40, ny: 40, nz: 24 };
  const field = (value: (x: number, y: number, z: number) => number) => {
    const out = new Float32Array(grid.nx * grid.ny * grid.nz);
    for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) out[voxelIndex(grid, x, y, z)] = value(x, y, z);
    return surfaceNets(out, grid, 0, [0, 0, 0], 1);
  };
  assert.deepEqual(surfaceForm(field((x, y, z) => 8 - Math.hypot(x - 20, y - 20, z - 12))), { pieces: 1, odd: 0, euler: 2 });
  // A ring has one tunnel through it.
  assert.deepEqual(surfaceForm(field((x, y, z) => 4 - Math.hypot(Math.hypot(x - 20, y - 20) - 11, z - 12))), { pieces: 1, odd: 0, euler: 0 });
  const two = surfaceForm(field((x, y, z) => Math.max(5 - Math.hypot(x - 10, y - 20, z - 12), 5 - Math.hypot(x - 28, y - 20, z - 12))));
  assert.deepEqual(two, { pieces: 2, odd: 0, euler: 4 });
});

test('the planes that bound a set of points hold every point and lie close round them', () => {
  const points: Vec3[] = [];
  let state = 7;
  const random = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  for (let i = 0; i < 400; i++) points.push([10 * random() - 5, 6 * random() - 3, 4 * random() - 2]);
  const planes = supportPlanes(points);
  for (const p of points) assert.ok(insidePlanes(planes, p, 0) >= -1e-9, 'every point lies inside or on the planes');
  // The points fill a box of 10 by 6 by 4; no plane need lie square to its thinnest side, so the middle lies a little deeper than 2.
  const middle = insidePlanes(planes, [0, 0, 0], 0);
  assert.ok(middle > 1.9 && middle < 2.4, `the middle lies about as deep as the nearest side: ${middle}`);
  assert.ok(Math.abs(insidePlanes(planes, [0, 0, 0], 3) - insidePlanes(planes, [0, 0, 0], 0) - 3) < 1e-9, 'growing moves every plane out alike');
  // A point outside the box of the points lies outside the planes, by about its distance from the box.
  const out = insidePlanes(planes, [9, 0, 0], 0);
  assert.ok(out < -3.2 && out > -4.3, `${out}`);
});

test('a paw drawn from layers is one closed surface, cut flat at the ground, and its field is the shape as drawn', () => {
  const ground = 0;
  const ball: Vec3 = [0, 0, 6], digit: [Vec3, Vec3] = [[6, 0, 4], [16, 0, 3]];
  const capsule = (p: Vec3, a: Vec3, b: Vec3, r: number) => {
    const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    return r - length(sub(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]));
  };
  const { skin, field } = drawLayers([-18, -18, -8], [28, 18, 22], 1, [
    { value: (p) => 9 - length(sub(p, ball)), smooth: 2, join: 0 },
    { value: (p) => capsule(p, digit[0], digit[1], 5), smooth: 1, join: 2 },
  ], 1, ground);
  assert.deepEqual(surfaceForm(skin), { pieces: 1, odd: 0, euler: 2 });
  let lowest = Infinity, farthest = -Infinity;
  for (let i = 0; i < skin.positions.length; i += 3) { lowest = Math.min(lowest, skin.positions[i + 2]); farthest = Math.max(farthest, skin.positions[i]); }
  assert.ok(Math.abs(lowest - ground) < 0.05, `the lowest point lies on the ground: ${lowest}`);
  assert.ok(farthest > 18.5 && farthest < 21, `the digit reaches its length less what the smoothing takes from its tip: ${farthest}`);
  // The field is positive inside, negative outside and below the ground, and near zero on the surface.
  assert.ok(field([0, 0, 6]) > 4 && field([12, 0, 3]) > 1);
  assert.ok(field([0, 0, -2]) < 0 && field([0, 14, 6]) < 0 && field([60, 0, 3]) < -30);
  let worst = 0;
  for (let i = 0; i < skin.positions.length; i += 3) worst = Math.max(worst, Math.abs(field([skin.positions[i], skin.positions[i + 1], skin.positions[i + 2]])));
  assert.ok(worst < 0.35, `the surface lies where the field changes sign: ${worst}`);
});

test('two sheets of a drawn surface that would meet along an edge are parted', () => {
  const grid: Grid = { nx: 9, ny: 9, nz: 9 };
  // Two blocks that touch along an edge: the corners of the faces between them lie inside and outside by turns.
  const blocks = () => {
    const field = new Float32Array(729).fill(-1);
    for (const z of [3, 4, 5]) for (const [x0, y0] of [[2, 2], [4, 4]]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) field[voxelIndex(grid, x0 + dx, y0 + dy, z)] = 1;
    return field;
  };
  assert.equal(surfaceForm(surfaceNets(blocks(), grid, 0, [0, 0, 0], 1)).odd, 3, 'as they stand, the two sheets share an edge in each layer');
  const parted = blocks();
  assert.equal(partSheets(parted, grid), 3, 'one face in each of the three layers');
  assert.deepEqual(surfaceForm(surfaceNets(parted, grid, 0, [0, 0, 0], 1)), { pieces: 2, odd: 0, euler: 4 });
  assert.ok(parted[voxelIndex(grid, 3, 3, 4)] < 0 && parted[voxelIndex(grid, 4, 4, 4)] < 0, 'the corners that touched are put outside');
  assert.ok(parted[voxelIndex(grid, 2, 2, 4)] > 0 && parted[voxelIndex(grid, 5, 5, 4)] > 0, 'the rest of each block stays');
  assert.equal(partSheets(parted, grid), 0, 'a second pass finds nothing to change');
  // With another level the same holds for a field that is inside above it.
  const lifted = blocks().map((value) => 0.5 + 0.25 * value);
  assert.equal(partSheets(lifted, grid, 0.5), 3);
  assert.equal(surfaceForm(surfaceNets(lifted, grid, 0.5, [0, 0, 0], 1)).odd, 0);
});
