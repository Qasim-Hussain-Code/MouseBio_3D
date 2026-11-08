/**
 * The grid in which clipping is held, without a graphics card. It says where the clippers went, and nothing about hair or skin.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { cutFieldShape } from '../src/domain/cut-field';
import { createClipGrid } from '../src/viewer/lab-clip';

test('clippers clear a band along their way and nothing beside it, and the grid can be cleared', () => {
  const grid = createClipGrid(cutFieldShape([0, 0, 0], [0.04, 0.02, 0.02]));
  assert.equal(grid.any(), false);
  grid.sweep([0.01, 0.01, 0.01], [0.03, 0.01, 0.01], 0.003);
  assert.equal(grid.any(), true);
  assert.ok(grid.sample([0.02, 0.01, 0.01]) > 0.9, 'on the way');
  assert.ok(grid.sample([0.02, 0.012, 0.01]) > 0.5, 'within the half width');
  assert.equal(grid.sample([0.02, 0.0165, 0.01]), 0, 'beyond it');
  assert.equal(grid.sample([0.038, 0.01, 0.01]), 0, 'past the end');
  assert.equal(grid.sample([-1, 0, 0]), 0, 'outside the grid');
  grid.clear();
  assert.equal(grid.any(), false);
  assert.equal(grid.sample([0.02, 0.01, 0.01]), 0);
  grid.dispose();
});
