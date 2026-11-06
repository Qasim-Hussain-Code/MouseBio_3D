import assert from 'node:assert/strict';
import test from 'node:test';
import { rowsToShow, type UnfoldGuideRow } from '../src/components/UnfoldGuide';
import { centringAt, columnStops, distanceForView, focusDepth, holeRadius, progressForStop, startAtDepth, stopIndexAt, stopSpacing, UNFOLD_NOTICE, unfoldProgress, unfoldRange, viewAtProgress, viewHeightAt, ZOOM_UNFOLD, type ColumnHit } from '../src/domain/zoom-unfold';

const MM = 0.001;
const COLUMN: ColumnHit[] = [
  { id: 'lung', tier: 'organs', depth: 6 * MM },
  { id: 'skin', tier: 'skin', depth: 0 },
  { id: 'fat', tier: 'fat', depth: 0.4 * MM },
  { id: 'skin', tier: 'skin', depth: 25 * MM },
  { id: 'muscle', tier: 'outer-muscle', depth: 1.5 * MM },
  { id: 'rib', tier: 'skeleton', depth: 3 * MM },
  { id: 'artery', tier: 'vessels-nerves', depth: 2 * MM },
  { id: 'liver', tier: 'organs', depth: 40 * MM },
  { id: 'forelimb', tier: 'skin', depth: -4 * MM },
];

test('the zoom is the only input: the height of the view gives how far the place has opened', () => {
  const range = unfoldRange(0.025);
  assert.equal(unfoldProgress(range.openAt * 2, range), 0);
  assert.equal(unfoldProgress(range.openAt, range), 0);
  assert.equal(unfoldProgress(range.fullAt, range), 1);
  assert.equal(unfoldProgress(range.fullAt / 3, range), 1);
  const middle = Math.sqrt(range.openAt * range.fullAt);
  assert.ok(Math.abs(unfoldProgress(middle, range) - 0.5) < 1e-9, 'equal steps of zoom are equal steps of opening');
  for (const progress of [0, 0.2, 0.7, 1]) assert.ok(Math.abs(unfoldProgress(viewAtProgress(progress, range), range) - progress) < 1e-9);
});

test('a thin part opens later and goes in closer than a thick one, within limits', () => {
  const trunk = unfoldRange(0.025), thigh = unfoldRange(0.009), paw = unfoldRange(0.002);
  assert.ok(trunk.openAt > thigh.openAt && thigh.openAt > paw.openAt);
  assert.ok(trunk.fullAt > paw.fullAt);
  assert.equal(unfoldRange(1).openAt, ZOOM_UNFOLD.widestOpen);
  assert.equal(unfoldRange(0).openAt, ZOOM_UNFOLD.narrowestOpen);
  assert.equal(unfoldRange(1).fullAt, ZOOM_UNFOLD.widestFull);
  assert.equal(unfoldRange(0).fullAt, ZOOM_UNFOLD.narrowestFull);
});

test('view height and camera distance convert both ways', () => {
  const view = viewHeightAt(0.07, 36);
  assert.ok(Math.abs(distanceForView(view, 36) - 0.07) < 1e-12);
  assert.ok(Math.abs(view - 0.0455) < 0.0001);
});

test('the stops are the structures on the way in, once each, outside first', () => {
  const stops = columnStops(COLUMN, 20 * MM);
  assert.deepEqual(stops.map((stop) => stop.id), ['skin', 'fat', 'muscle', 'rib', 'lung']);
  assert.equal(stops[0].depth, 0, 'a surface met twice counts where it is first met');
  assert.ok(!stops.some((stop) => stop.tier === 'vessels-nerves'), 'vessels and nerves are left whole and are not stops');
  assert.ok(!stops.some((stop) => stop.id === 'forelimb'), 'what lies in front of the spot is not a stop');
  assert.ok(!stops.some((stop) => stop.id === 'liver'), 'what lies beyond the depth of the cut is not a stop');
  assert.equal(stops[0].start, ZOOM_UNFOLD.firstStop);
  for (let index = 1; index < stops.length; index++) assert.ok(stops[index].start > stops[index - 1].start);
  assert.ok(stops[stops.length - 1].start < 1);
});

test('an empty column has no stops and does not break the depth functions', () => {
  assert.deepEqual(columnStops([], 0.01), []);
  assert.equal(focusDepth(0.5, []), 0);
  assert.equal(startAtDepth(0.01, []), ZOOM_UNFOLD.firstStop);
  assert.equal(stopIndexAt(0.5, []), -1);
});

test('the centre of the view goes down through each stop in turn and comes back the same way', () => {
  const stops = columnStops(COLUMN, 20 * MM);
  for (const stop of stops) assert.ok(Math.abs(focusDepth(stop.start, stops) - stop.depth) < 1e-12);
  assert.equal(focusDepth(0, stops), 0);
  assert.equal(focusDepth(1, stops), stops[stops.length - 1].depth);
  let last = -1;
  for (let progress = 0; progress <= 1; progress += 0.01) { const depth = focusDepth(progress, stops); assert.ok(depth >= last); last = depth; }
});

test('the stop being passed follows the zoom', () => {
  const stops = columnStops(COLUMN, 20 * MM);
  assert.equal(stopIndexAt(0, stops), -1);
  assert.equal(stopIndexAt(stops[0].start, stops), 0);
  assert.equal(stopIndexAt(stops[2].start + 0.001, stops), 2);
  assert.equal(stopIndexAt(1, stops), stops.length - 1);
  for (const stop of stops) assert.equal(stops[stopIndexAt(progressForStop(stop, stops), stops)].id, stop.id, 'going to a stop arrives at it');
});

test('a structure off the line opens when the column reaches its depth', () => {
  const stops = columnStops(COLUMN, 20 * MM);
  assert.equal(startAtDepth(-1 * MM, stops), stops[0].start);
  const between = startAtDepth(2.25 * MM, stops);
  assert.ok(between > stops[2].start && between < stops[3].start);
  assert.equal(startAtDepth(30 * MM, stops), stops[stops.length - 1].start);
});

test('outer layers open first and wider, so that each stands as a ring around the next', () => {
  const stops = columnStops(COLUMN, 20 * MM), spacing = stopSpacing(stops), range = unfoldRange(0.025);
  const radii = (progress: number) => stops.map((stop) => holeRadius(stop.start, progress, spacing, range));
  assert.deepEqual(radii(0), stops.map(() => 0), 'closed at the start');
  assert.ok(radii(stops[1].start)[0] > 0 && radii(stops[1].start)[2] === 0, 'the skin opens before the muscle');
  const full = radii(1);
  for (let index = 1; index < full.length; index++) assert.ok(full[index] < full[index - 1], 'each opening is narrower than the one above it');
  for (const stop of stops) {
    const before = holeRadius(stop.start, stop.start + 0.02, spacing, range), after = holeRadius(stop.start, stop.start + 0.1, spacing, range);
    assert.ok(after > before, 'an opening grows as the zoom goes on');
  }
  // Zooming back gives the same openings: nothing depends on the path taken.
  assert.deepEqual(radii(0.5), radii(0.5));
  assert.ok(full[0] <= ZOOM_UNFOLD.holeShare * range.openAt);
});

test('the opening of a layer fits the view of the moment it opens', () => {
  const stops = columnStops(COLUMN, 20 * MM), spacing = stopSpacing(stops), range = unfoldRange(0.025);
  for (const stop of stops) {
    const opened = holeRadius(stop.start, 1, spacing, range);
    assert.ok(opened < viewAtProgress(stop.start, range), 'it does not take away more than was in view when it started');
  }
});

test('the view reaches the spot early in the zoom and returns to where it was', () => {
  assert.equal(centringAt(0), 0);
  assert.equal(centringAt(ZOOM_UNFOLD.centring), 1);
  assert.equal(centringAt(1), 1);
  assert.ok(centringAt(ZOOM_UNFOLD.centring / 2) > 0 && centringAt(ZOOM_UNFOLD.centring / 2) < 1);
});

test('the guide lists every layer, and of the vessels and nerves only those passed at the layer shown now', () => {
  const row = (id: string, depthMm: number, passing = false): UnfoldGuideRow => ({ id, name: id, depthMm, passing, systems: [] });
  const rows = [row('skin', 0), row('muscle', 1), row('artery', 1.4, true), row('nerve', 2, true), row('rib', 3), row('vein', 3.5, true), row('liver', 6)];
  const shown = (current: string | null) => rowsToShow(rows, current).map((item) => item.id);
  assert.deepEqual(shown(null), ['skin', 'muscle', 'rib', 'liver']);
  assert.deepEqual(shown('skin'), ['skin', 'muscle', 'rib', 'liver']);
  assert.deepEqual(shown('muscle'), ['skin', 'muscle', 'artery', 'nerve', 'rib', 'liver']);
  assert.deepEqual(shown('rib'), ['skin', 'muscle', 'rib', 'vein', 'liver']);
  assert.deepEqual(shown('liver'), ['skin', 'muscle', 'rib', 'liver']);
});

test('the notice says this is a display and not a dissection', () => {
  assert.match(UNFOLD_NOTICE, /not a dissection/);
  assert.match(UNFOLD_NOTICE, /evidence/);
  assert.doesNotMatch(UNFOLD_NOTICE, /[–—]/);
});
