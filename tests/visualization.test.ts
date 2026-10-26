import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizedPosition, measurementColors } from '../src/domain/visualization';

test('quantitative colors preserve zero, endpoints, and negative observations', () => {
  assert.equal(normalizedPosition(-10, -10, 10), 0);
  assert.equal(normalizedPosition(0, -10, 10), 0.5);
  assert.equal(normalizedPosition(10, -10, 10), 1);
  assert.equal(normalizedPosition(4, 4, 4), 0.5);
});

test('opposite large finite measurements do not produce invalid colors', () => {
  assert.equal(normalizedPosition(0, -1.7e308, 1.7e308), 0.5);
  assert.equal(normalizedPosition(1.7e308, -1.7e308, 1.7e308), 1);
  assert.throws(() => normalizedPosition(Infinity, 0, 1));
  assert.throws(() => normalizedPosition(1, 2, 1));
});

test('empty measurement groups create no fabricated anatomical overlays', () => {
  assert.deepEqual(measurementColors([], 0, 0), {});
});
