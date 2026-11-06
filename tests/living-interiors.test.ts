import assert from 'node:assert/strict';
import test from 'node:test';
import { BONES, partitionBones } from '../scripts/living/bones';
import { buildInteriors } from '../scripts/living/interiors';
import type { Landmarks } from '../scripts/living/landmarks';
import { measureLandmarks } from '../scripts/living/landmarks';
import type { Vec3 } from '../scripts/living/rig';
import type { Surface } from '../scripts/living/surface-nets';
import { voxelIndex, type Grid } from '../scripts/living/volume';
import { clipPercentAt } from '../src/viewer/scene-utils';

/** Spherical organs on a small grid, far enough apart that each is tested alone. */
const grid: Grid = { nx: 200, ny: 200, nz: 100 };
const organs: readonly { id: number; centre: Vec3; radius: number }[] = [
  { id: 9, centre: [40, 50, 50], radius: 34 },
  { id: 15, centre: [120, 50, 50], radius: 24 },
  { id: 13, centre: [170, 50, 50], radius: 18 },
  { id: 19, centre: [60, 150, 50], radius: 22 },
  { id: 19, centre: [140, 150, 50], radius: 22 },
  { id: 20, centre: [100, 110, 50], radius: 12 },
];
const labels = new Uint8Array(grid.nx * grid.ny * grid.nz);
for (const organ of organs) for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
  if (Math.hypot(x - organ.centre[0], y - organ.centre[1], z - organ.centre[2]) <= organ.radius) labels[voxelIndex(grid, x, y, z)] = organ.id;
}
const landmarks = {
  midX: 100,
  label(id: number, side?: 'low' | 'high') {
    const found = organs.filter((organ) => organ.id === id && (!side || (side === 'low' ? organ.centre[0] < 100 : organ.centre[0] >= 100)));
    const { centre, radius } = found[0];
    return { centroid: centre, min: [centre[0] - radius, centre[1] - radius, centre[2] - radius] as Vec3, max: [centre[0] + radius, centre[1] + radius, centre[2] + radius] as Vec3 };
  },
} as unknown as Landmarks;
const seeds = {
  heart: [[24, 34, 50], [56, 34, 50], [24, 66, 50], [56, 66, 50]] as const,
  stomach: [[108, 50, 50], [132, 50, 50]] as const,
  kidneyLimitX: 100,
};
const parts = buildInteriors(grid, labels, landmarks, seeds, [40, 20, 50], [40, 26, 66]);

const vertices = (surface: Surface): Vec3[] => Array.from({ length: surface.positions.length / 3 }, (_, i) => [surface.positions[3 * i], surface.positions[3 * i + 1], surface.positions[3 * i + 2]]);
/** How far points lie inside a sphere: the depth of the shallowest. */
const shallowest = (points: readonly Vec3[], centre: Vec3, radius: number) => Math.min(...points.map((p) => radius - Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2])));

test('every interior is a surface, inside its organ', () => {
  for (const [name, surface] of Object.entries(parts)) assert.ok(surface.indices.length > 30, name);
  for (const p of vertices(parts['left-heart-spaces'])) assert.ok(Math.hypot(p[0] - 40, p[1] - 50, p[2] - 50) < 34, 'in the heart');
  for (const p of vertices(parts['bladder-lumen'])) assert.ok(Math.hypot(p[0] - 170, p[1] - 50, p[2] - 50) < 18, 'in the bladder');
});

test('the adrenal medulla leaves a cortex round it', () => {
  const points = vertices(parts['adrenal-medullae']);
  assert.ok(points.length > 10);
  assert.ok(shallowest(points, [100, 110, 50], 12) >= 1.5, 'a cortex of some depth remains');
});

test('the left ventricle has a thicker wall than the right, and the atria the thinnest', () => {
  const centre: Vec3 = [40, 50, 50];
  const left = vertices(parts['left-heart-spaces']), right = vertices(parts['right-heart-spaces']);
  const leftVentricle = left.filter((p) => p[1] > 50), rightVentricle = right.filter((p) => p[1] > 50);
  const leftAtrium = left.filter((p) => p[1] < 50), rightAtrium = right.filter((p) => p[1] < 50);
  assert.ok(leftVentricle.length && rightVentricle.length && leftAtrium.length && rightAtrium.length);
  const lv = shallowest(leftVentricle, centre, 34), rv = shallowest(rightVentricle, centre, 34), la = shallowest(leftAtrium, centre, 34);
  assert.ok(lv > rv + 3, `left ${lv}, right ${rv}`);
  assert.ok(rv >= la, `right ${rv}, atrium ${la}`);
});

test('valves lie in the heart, with a ring and flaps for each of the four', () => {
  assert.ok(parts['heart-valves'].indices.length > 1000);
  for (const p of vertices(parts['heart-valves'])) assert.ok(Math.hypot(p[0] - 40, p[1] - 50, p[2] - 50) < 44, `${p}`);
});

test('the renal medulla keeps within the cortex, and the pelvis lies towards the hilus', () => {
  for (const [centre, inward] of [[[60, 150, 50], 1], [[140, 150, 50], -1]] as const) {
    const medulla = vertices(parts['renal-medullae']).filter((p) => Math.abs(p[0] - centre[0]) < 30);
    const pelvis = vertices(parts['renal-pelves']).filter((p) => Math.abs(p[0] - centre[0]) < 30);
    assert.ok(medulla.length && pelvis.length);
    assert.ok(shallowest(medulla, centre as unknown as Vec3, 22) >= 7, 'a cortex is left round it');
    const mean = (points: readonly Vec3[]) => points.reduce((sum, p) => sum + p[0], 0) / points.length;
    assert.ok((mean(pelvis) - mean(medulla)) * inward > 0, 'the pelvis lies nearer the midline than the medulla');
  }
});

test('the stomach has a thin wall on one side and a thick wall on the other, with a ridge between', () => {
  const centre: Vec3 = [120, 50, 50];
  const lumen = vertices(parts['stomach-lumen']);
  const thin = shallowest(lumen.filter((p) => p[0] < 110), centre, 24), thick = shallowest(lumen.filter((p) => p[0] > 130), centre, 24);
  assert.ok(thick > thin + 1.5, `thin ${thin}, thick ${thick}`);
  for (const p of vertices(parts['limiting-ridge'])) assert.ok(Math.abs(p[0] - 120) < 8, `the ridge lies where the regions meet, not at x ${p[0]}`);
});

test('small bones outside the source skeleton label are named by their boxes', () => {
  const full: Grid = { nx: 380, ny: 992, nz: 208 };
  const empty = new Uint8Array(full.nx * full.ny * full.nz);
  const spine = measureLandmarks(full, empty, empty);
  const name = (p: Vec3) => {
    const wanted = (p[2] * full.ny + p[1]) * full.nx + p[0];
    return BONES[partitionBones(full, (i) => i === wanted, spine)[wanted] - 1].id;
  };
  assert.equal(name([170, 790, 14]), 'os-penis');
  assert.equal(name([189, 250, 62]), 'hyoid');
});

test('a section plane can be placed through a coordinate', () => {
  assert.equal(clipPercentAt(0, 0.1), 50);
  assert.equal(clipPercentAt(0.1, 0.1), 100);
  assert.equal(clipPercentAt(-0.05, 0.1), 25);
  assert.equal(clipPercentAt(5, 0.1), 100);
});
