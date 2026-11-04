/** Screen-space label placement. These checks cover geometry of boxes, not rendered text. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateLabelSize, layoutLabels, leaderEnd, type LabelCandidate, type PlacedLabel } from '../src/viewer/label-layout';

const viewport = { width: 800, height: 600 };
const candidate = (id: string, x: number, y: number, priority = 1, depth = 0.5): LabelCandidate => ({ id, name: id, x, y, depth, priority });
const overlap = (a: PlacedLabel, b: PlacedLabel) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

test('labels around one crowded anchor never overlap and stay inside the viewport', () => {
  const candidates = Array.from({ length: 12 }, (_, index) => candidate(`region-${index}`, 400 + (index % 3) * 4, 300 + Math.floor(index / 3) * 4));
  const placed = layoutLabels(candidates, viewport);
  assert.ok(placed.length >= 8, `placed ${placed.length}`);
  for (const label of placed) {
    assert.ok(label.left >= 0 && label.top >= 0 && label.left + label.width <= viewport.width && label.top + label.height <= viewport.height, label.id);
    assert.deepEqual(estimateLabelSize(label.name, viewport), { width: label.width, height: label.height });
  }
  for (const a of placed) for (const b of placed) if (a !== b) assert.equal(overlap(a, b), false, `${a.id} overlaps ${b.id}`);
  assert.deepEqual([...new Set(placed.map((label) => label.id))].length, placed.length);
});

test('higher priority is placed first and keeps its nearest offset', () => {
  const placed = layoutLabels([candidate('low', 300, 300, 1), candidate('high', 300, 300, 10)], viewport);
  assert.equal(placed[0].id, 'high');
  assert.equal(placed[0].left, 322); // first offset: to the right of the anchor
  assert.equal(placed.length, 2);
  assert.equal(overlap(placed[0], placed[1]), false);
  assert.deepEqual([placed[0].anchorX, placed[0].anchorY], [300, 300]);
});

test('candidates behind the camera, off screen or with invalid numbers are omitted', () => {
  const placed = layoutLabels([candidate('behind', 100, 100, 1, 1.5), candidate('far', 100, 100, 1, -1), candidate('off', -10, 100),
    candidate('nan', NaN, 100), candidate('ok', 100, 100)], viewport);
  assert.deepEqual(placed.map((label) => label.id), ['ok']);
  assert.deepEqual(layoutLabels([candidate('ok', 100, 100)], { width: 0, height: 600 }), []);
  assert.deepEqual(layoutLabels([], viewport), []);
});

test('a label near the viewport edge is moved to an inward offset or dropped', () => {
  const [edge] = layoutLabels([{ id: 'edge', name: 'A very long structure name indeed', x: 795, y: 300, depth: 0.5, priority: 1 }], viewport);
  assert.ok(edge, 'an inward offset exists');
  assert.ok(edge.left + edge.width <= viewport.width);
  const corner = layoutLabels([{ id: 'corner', name: 'Something much too long for the corner of the viewport to hold it anywhere near', x: 2, y: 2, depth: 0.5, priority: 1 }], { width: 120, height: 40 });
  assert.deepEqual(corner, []);
});

test('the label limit and deterministic ordering hold', () => {
  const candidates = Array.from({ length: 30 }, (_, index) => candidate(`r${index}`, 40 + index * 25, 100 + (index % 5) * 90));
  assert.equal(layoutLabels(candidates, { ...viewport, maxLabels: 5 }).length, 5);
  const first = layoutLabels(candidates, viewport), second = layoutLabels([...candidates].reverse(), viewport);
  assert.deepEqual(first, second, 'placement does not depend on input order for equal priorities');
});

test('leader lines end on the box edge nearest the anchor', () => {
  const [label] = layoutLabels([candidate('x', 300, 300)], viewport);
  const end = leaderEnd(label);
  assert.equal(end.x, label.left);
  assert.ok(end.y >= label.top && end.y <= label.top + label.height);
  const inside: PlacedLabel = { ...label, left: 290, top: 290, width: 40, height: 20 };
  assert.deepEqual(leaderEnd(inside), { x: 300, y: 300 });
});
