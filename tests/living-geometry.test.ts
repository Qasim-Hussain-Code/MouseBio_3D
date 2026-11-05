import assert from 'node:assert/strict';
import test from 'node:test';
import { surfaceMeasures, surfaceNets } from '../scripts/living/surface-nets';
import { components, dilate, distanceInside, erode, smoothField, voxelIndex, type Grid } from '../scripts/living/volume';

const sphereField = (grid: Grid, radius: number, centre: readonly [number, number, number]) => {
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
    field[voxelIndex(grid, x, y, z)] = radius - Math.hypot(x - centre[0], y - centre[1], z - centre[2]);
  }
  return field;
};

test('surface nets recover the volume and area of a sphere, with outward winding and normals', () => {
  const grid = { nx: 41, ny: 41, nz: 41 };
  const radius = 15;
  const surface = surfaceNets(sphereField(grid, radius, [20, 20, 20]), grid, 0, [0, 0, 0], 1);
  const { volume, area } = surfaceMeasures(surface);
  assert.ok(Math.abs(volume / (4 / 3 * Math.PI * radius ** 3) - 1) < 0.01, `volume ${volume}`);
  assert.ok(Math.abs(area / (4 * Math.PI * radius ** 2) - 1) < 0.03, `area ${area}`);
  for (let i = 0; i < surface.positions.length; i += 3) {
    const dot = (surface.positions[i] - 20) * surface.normals[i] + (surface.positions[i + 1] - 20) * surface.normals[i + 1] + (surface.positions[i + 2] - 20) * surface.normals[i + 2];
    assert.ok(dot > 0.9 * radius, 'normal points outward');
    assert.ok(Math.abs(Math.hypot(surface.normals[i], surface.normals[i + 1], surface.normals[i + 2]) - 1) < 1e-5);
  }
});

test('surface nets produce a closed manifold: every edge is shared by two opposed triangles', () => {
  const grid = { nx: 25, ny: 25, nz: 25 };
  const { indices } = surfaceNets(sphereField(grid, 8, [12, 12, 12]), grid, 0, [0, 0, 0], 1);
  const edges = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = indices[i + k], b = indices[i + (k + 1) % 3];
    const key = `${a}/${b}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  for (const [key, count] of edges) {
    const [a, b] = key.split('/');
    assert.equal(count, 1);
    assert.equal(edges.get(`${b}/${a}`), 1);
  }
});

test('output coordinates follow the supplied origin and spacing', () => {
  const grid = { nx: 41, ny: 41, nz: 41 };
  const surface = surfaceNets(sphereField(grid, 16, [20, 20, 20]), grid, 0, [5, 0, -5], 0.5);
  const { volume } = surfaceMeasures(surface);
  assert.ok(Math.abs(volume / (4 / 3 * Math.PI * 8 ** 3) - 1) < 0.01);
  let mean = 0;
  for (let i = 0; i < surface.positions.length; i += 3) mean += surface.positions[i];
  assert.ok(Math.abs(mean / (surface.positions.length / 3) - 15) < 0.01);
});

test('smoothing preserves the mean of a constant field and spreads a step symmetrically', () => {
  const grid = { nx: 30, ny: 4, nz: 4 };
  const constant = new Float32Array(30 * 16).fill(2);
  for (const value of smoothField(constant, grid, 2)) assert.ok(Math.abs(value - 2) < 1e-5);
  const step = new Float32Array(30 * 16);
  for (let i = 0; i < step.length; i++) step[i] = i % 30 >= 15 ? 1 : 0;
  const smooth = smoothField(step, grid, 2);
  assert.ok(smooth[14] > 0.2 && smooth[14] < 0.5 && smooth[15] > 0.5 && smooth[15] < 0.8);
  assert.ok(Math.abs(smooth[14] + smooth[15] - 1) < 1e-5);
});

test('smoothing stays finite on an axis shorter than the filter', () => {
  const flat = new Float32Array(8 * 8).fill(3);
  for (const value of smoothField(flat, { nx: 8, ny: 8, nz: 1 }, 3)) assert.ok(Math.abs(value - 3) < 1e-5);
});

test('components, erosion, dilation and interior distance behave on known shapes', () => {
  const grid = { nx: 12, ny: 12, nz: 12 };
  const mask = new Uint8Array(12 ** 3);
  for (let z = 2; z <= 6; z++) for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) mask[voxelIndex(grid, x, y, z)] = 1;
  mask[voxelIndex(grid, 10, 10, 10)] = 1;
  const { list } = components(mask, grid);
  assert.deepEqual(list.map((item) => item.size), [125, 1]);
  assert.deepEqual([...list[0].box], [2, 6, 2, 6, 2, 6]);
  assert.deepEqual([...list[0].centroid], [4, 4, 4]);
  const eroded = erode(mask, grid, 1);
  assert.equal(eroded.reduce((sum, value) => sum + value, 0), 27);
  const grown = dilate(eroded, grid, 1);
  assert.equal(grown.reduce((sum, value) => sum + value, 0), 27 + 6 * 9);
  const distance = distanceInside(mask, grid);
  assert.ok(Math.abs(distance[voxelIndex(grid, 4, 4, 4)] - 3) < 1e-5);
  assert.equal(distance[voxelIndex(grid, 0, 0, 0)], 0);
});
