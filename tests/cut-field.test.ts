import assert from 'node:assert/strict';
import test from 'node:test';
import { CUT_CHANNELS, CutField, cutFieldShape, type CutPoint } from '../src/domain/cut-field';

const field = () => new CutField({ origin: [0, 0, 0], cell: 0.001, nx: 40, ny: 40, nz: 40 });

test('a grid over the body keeps to its size and never goes finer than asked', () => {
  const shape = cutFieldShape([0, 0, 0], [0.17, 0.05, 0.06]);
  assert.ok(shape.nx * shape.ny * shape.nz <= 6e6, `${shape.nx * shape.ny * shape.nz} boxes`);
  assert.ok(shape.cell >= 0.00022);
  assert.ok(shape.nx * shape.cell >= 0.17 && shape.ny * shape.cell >= 0.05 && shape.nz * shape.cell >= 0.06);
  const small = cutFieldShape([0, 0, 0], [0.001, 0.001, 0.001]);
  assert.equal(small.cell, 0.00022);
});

test('a sweep takes away what lies within its radius of the line and nothing further off', () => {
  const cut = field();
  const from: CutPoint = [0.01, 0.02, 0.02], to: CutPoint = [0.03, 0.02, 0.02];
  assert.ok(cut.sweep(0, from, to, 0.002));
  assert.ok(cut.sample(0, [0.02, 0.02, 0.02]) > 0.9, 'on the line');
  assert.ok(cut.sample(0, [0.02, 0.0215, 0.02]) > 0.5, 'just inside the radius');
  assert.ok(cut.sample(0, [0.02, 0.0245, 0.02]) < 0.5, 'just outside the radius');
  assert.equal(cut.sample(0, [0.02, 0.03, 0.02]), 0, 'well outside');
  assert.ok(cut.sample(0, [0.005, 0.02, 0.02]) < 0.5, 'beyond the end');
});

test('each layer has its own channel: a cut in one leaves the others whole', () => {
  const cut = field();
  cut.sweep(5, [0.01, 0.01, 0.01], [0.02, 0.01, 0.01], 0.002);
  for (let channel = 0; channel < CUT_CHANNELS; channel++) {
    const value = cut.sample(channel, [0.015, 0.01, 0.01]);
    if (channel === 5) assert.ok(value > 0.9, 'the channel that was cut'); else assert.equal(value, 0, `channel ${channel}`);
  }
});

test('the part of the grid that changed is reported, and sweeping the same place again reports nothing', () => {
  const cut = field();
  const region = cut.sweep(1, [0.01, 0.01, 0.01], [0.012, 0.01, 0.01], 0.001)!;
  assert.ok(region);
  assert.ok(region.x <= 9 && region.x + region.width >= 13, 'along x');
  assert.ok(region.y <= 9 && region.y + region.height >= 11, 'along y');
  assert.equal(cut.sweep(1, [0.01, 0.01, 0.01], [0.012, 0.01, 0.01], 0.001), null);
  assert.equal(cut.sweep(1, [1, 1, 1], [1.01, 1, 1], 0.001), null, 'wholly outside the grid');
});

test('closing a cut gives back what it took, and only there', () => {
  const cut = field();
  cut.sweep(0, [0.01, 0.02, 0.02], [0.03, 0.02, 0.02], 0.002);
  cut.sweep(0, [0.015, 0.02, 0.02], [0.02, 0.02, 0.02], 0.003, true);
  assert.ok(cut.sample(0, [0.0175, 0.02, 0.02]) < 0.5, 'closed');
  assert.ok(cut.sample(0, [0.027, 0.02, 0.02]) > 0.5, 'still open further along');
});

test('running the same sweeps again on a cleared grid gives the same grid, which is how a step is undone', () => {
  const cut = field();
  const sweeps: [number, CutPoint, CutPoint, number, boolean][] = [[0, [0.01, 0.01, 0.01], [0.03, 0.02, 0.02], 0.0012, false], [2, [0.02, 0.01, 0.03], [0.02, 0.03, 0.03], 0.002, false], [0, [0.02, 0.015, 0.015], [0.022, 0.016, 0.016], 0.001, true]];
  for (const [channel, from, to, radius, restore] of sweeps) cut.sweep(channel, from, to, radius, restore);
  const first = [cut.data[0].slice(), cut.data[1].slice()];
  cut.clear();
  assert.equal(cut.data[0].reduce((sum, value) => sum + value, 0), 0, 'cleared');
  for (const [channel, from, to, radius, restore] of sweeps) cut.sweep(channel, from, to, radius, restore);
  assert.deepEqual(cut.data[0], first[0]);
  assert.deepEqual(cut.data[1], first[1]);
});
