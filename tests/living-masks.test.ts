import assert from 'node:assert/strict';
import test from 'node:test';
import { animalMasks, BONE_CT, PIECE_CONTACT, TISSUE_CT } from '../scripts/living/masks';
import { joinedAbove, voxelIndex, type Grid } from '../scripts/living/volume';

test('voxels are joined above a level through faces, edges and corners, and not across a gap', () => {
  const grid: Grid = { nx: 8, ny: 8, nz: 8 };
  const values = new Uint8Array(8 * 8 * 8), seed = new Uint8Array(8 * 8 * 8);
  const set = (x: number, y: number, z: number, value: number) => { values[voxelIndex(grid, x, y, z)] = value; };
  set(1, 1, 1, 90); seed[voxelIndex(grid, 1, 1, 1)] = 1;
  set(2, 2, 2, 50);   // touches the seed by a corner only
  set(3, 2, 2, 50);
  set(5, 5, 5, 200);  // bright, but nothing at the level joins it to the seed
  set(1, 1, 2, 30);   // below the level
  const joined = joinedAbove(seed, values, 40, grid);
  assert.equal(joined[voxelIndex(grid, 1, 1, 1)], 1);
  assert.equal(joined[voxelIndex(grid, 2, 2, 2)], 1);
  assert.equal(joined[voxelIndex(grid, 3, 2, 2)], 1);
  assert.equal(joined[voxelIndex(grid, 5, 5, 5)], 0);
  assert.equal(joined[voxelIndex(grid, 1, 1, 2)], 0);
  // A seed below the level joins nothing.
  assert.equal(joinedAbove(seed, values, 100, grid).reduce((sum, v) => sum + v, 0), 0);
});

test('bright CT outside the labelled body is the animal only in a paw or in real contact, and joined to it by tissue', () => {
  const grid: Grid = { nx: 48, ny: 48, nz: 40 };
  const voxels = grid.nx * grid.ny * grid.nz;
  const labels = new Uint8Array(voxels), ct = new Uint8Array(voxels);
  const at = (x: number, y: number, z: number) => voxelIndex(grid, x, y, z);
  // A labelled body with a core of skeleton.
  for (let z = 10; z < 30; z++) for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) { labels[at(x, y, z)] = 1; ct[at(x, y, z)] = 100; }
  for (let z = 18; z < 22; z++) for (let y = 18; y < 22; y++) for (let x = 18; x < 22; x++) { labels[at(x, y, z)] = 2; ct[at(x, y, z)] = 250; }
  // A digit of a paw that the labels crop: bright, joined to the body by soft tissue, and touching no labelled voxel.
  const digit: number[] = [];
  for (let x = 30; x < 33; x++) ct[at(x, 20, 20)] = 60;
  for (let x = 33; x < 43; x++) { ct[at(x, 20, 20)] = 240; digit.push(at(x, 20, 20)); }
  // A post beside the body: bright, joined by one voxel of partial volume, and touching the body with one voxel in thirty-one.
  const post: number[] = [];
  for (let z = 5; z < 35; z++) { ct[at(8, 20, z)] = 235; post.push(at(8, 20, z)); }
  ct[at(9, 20, 20)] = 50;
  ct[at(9, 20, 25)] = 235; post.push(at(9, 20, 25));
  // A bright piece that no tissue joins to the body.
  const apart: number[] = [];
  for (let z = 20; z < 22; z++) for (let y = 34; y < 36; y++) for (let x = 34; x < 36; x++) { ct[at(x, y, z)] = 230; apart.push(at(x, y, z)); }
  // Bright CT lying on the labelled body, as bone does where a label ends short of it.
  const rind: number[] = [];
  for (let y = 12; y < 20; y++) for (let x = 12; x < 20; x++) { ct[at(x, y, 30)] = 228; rind.push(at(x, y, 30)); }
  const inPaw = (p: readonly [number, number, number]) => p[0] >= 31 && p[1] >= 18 && p[1] <= 22;
  const masks = animalMasks(grid, labels, ct, inPaw, 14);
  assert.ok(BONE_CT > TISSUE_CT && PIECE_CONTACT > 1 / 31 && PIECE_CONTACT < 1, 'the levels this case is built on');
  for (const i of digit) assert.ok(masks.body[i] && masks.bone[i], 'the digit is the animal');
  for (const i of rind) assert.ok(masks.body[i] && masks.bone[i], 'bone lying on the body is the animal');
  for (const i of post) assert.ok(!masks.body[i] && !masks.bone[i] && masks.beside[i], 'the post is left out and marked');
  for (const i of apart) assert.ok(!masks.body[i] && !masks.bone[i] && !masks.beside[i] && !masks.attached[i], 'the piece apart is left out');
  assert.deepEqual(masks.report, { apart: apart.length, grazing: post.length, grazingPieces: 1 });
  // The labelled body and its skeleton are kept as they are, and the soft tissue between the body and the digit is not skeleton.
  assert.ok(masks.body[at(15, 15, 15)] && !masks.bone[at(15, 15, 15)] && masks.bone[at(19, 19, 19)]);
  assert.ok(!masks.bone[at(31, 20, 20)] && !masks.body[at(31, 20, 20)] && masks.attached[at(31, 20, 20)]);
  // Without the paw the digit only grazes the body, and is left out as the post is.
  const bare = animalMasks(grid, labels, ct, () => false, 14);
  for (const i of digit) assert.ok(!bare.body[i] && bare.beside[i]);
  assert.equal(bare.report.grazingPieces, 2);
});
