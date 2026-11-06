import type { DissectionTierId } from './dissection';

/**
 * Zooming in opens the mouse where it is being looked at. The structures that lie under that spot are found, in the order
 * in which they lie, and each one opens in turn as the view narrows, so that the outer layers leave the frame while the
 * deeper ones come into it; zooming out closes them again. How far a view opens at what width is a way of showing the
 * model. Nothing here adds or measures anatomy, and the order at a spot comes from the model itself.
 */
export const ZOOM_UNFOLD = Object.freeze({
  /** The height of the view at which a place starts to open, in metres of the display. A thick part opens earlier than a thin one. */
  widestOpen: 0.045, narrowestOpen: 0.018, openPerThickness: 2.6,
  /** The height of the view at which a place is open as far as it goes. */
  widestFull: 0.0042, narrowestFull: 0.0016, fullPerThickness: 0.16,
  /** Share of the zoom before the first layer starts to open. */
  firstStop: 0.04,
  /** Radius of the opening in a layer once it is open, as a share of the height of the view at that moment. */
  holeShare: 0.46,
  /** Anything nearer to the camera than this share of the distance to what is being looked at is not drawn, so that a vessel passing the camera does not fill the view. */
  nearShare: 0.16,
  /** How far along the zoom the view takes to bring the spot to its centre. */
  centring: 0.14,
});

export interface UnfoldRange {
  /** Height of the view at which the place starts to open. */
  readonly openAt: number;
  /** Height of the view at which it is fully open. */
  readonly fullAt: number;
}

const between = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => { const t = between(value, 0, 1); return t * t * (3 - 2 * t); };

export const viewHeightAt = (distance: number, fovDegrees: number) => 2 * distance * Math.tan(fovDegrees * Math.PI / 360);
export const distanceForView = (view: number, fovDegrees: number) => view / (2 * Math.tan(fovDegrees * Math.PI / 360));

/** The range of views over which a part of the given thickness, along the line of sight, opens. */
export function unfoldRange(thickness: number): UnfoldRange {
  return {
    openAt: between(thickness * ZOOM_UNFOLD.openPerThickness, ZOOM_UNFOLD.narrowestOpen, ZOOM_UNFOLD.widestOpen),
    fullAt: between(thickness * ZOOM_UNFOLD.fullPerThickness, ZOOM_UNFOLD.narrowestFull, ZOOM_UNFOLD.widestFull),
  };
}

/** How far the place has opened at this height of the view, from 0, closed, to 1. Equal steps of zoom are equal steps here. */
export function unfoldProgress(view: number, range: UnfoldRange): number {
  return between(Math.log(range.openAt / view) / Math.log(range.openAt / range.fullAt), 0, 1);
}

export function viewAtProgress(progress: number, range: UnfoldRange): number {
  return range.openAt * (range.fullAt / range.openAt) ** between(progress, 0, 1);
}

export interface ColumnHit {
  readonly id: string;
  readonly tier: DissectionTierId;
  /** Distance under the spot along the line going in. Negative for what lies in front of the spot. */
  readonly depth: number;
}

export interface UnfoldStop extends ColumnHit {
  /** The point of the zoom at which this structure starts to open. */
  readonly start: number;
}

/**
 * The structures met on going straight in from the spot, one stop for each, outside first. Vessels and nerves are not stops, because
 * they are left whole, and what lies in front of the spot or beyond the depth of the opening is not a stop either.
 */
export function columnStops(hits: readonly ColumnHit[], depthLimit: number): UnfoldStop[] {
  const first = new Map<string, ColumnHit>();
  for (const hit of hits) {
    if (hit.tier === 'vessels-nerves' || hit.depth < -0.0005 || hit.depth > depthLimit) continue;
    const known = first.get(hit.id);
    if (!known || hit.depth < known.depth) first.set(hit.id, hit);
  }
  const ordered = [...first.values()].sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
  const room = 1 - ZOOM_UNFOLD.firstStop;
  return ordered.map((hit, index) => ({ ...hit, start: ZOOM_UNFOLD.firstStop + room * index / ordered.length }));
}

/** The share of the zoom given to each stop. */
export const stopSpacing = (stops: readonly UnfoldStop[]) => (1 - ZOOM_UNFOLD.firstStop) / Math.max(1, stops.length);

/** When a structure at a given depth starts to open, if it is not itself in the column: when the column reaches that depth. */
export function startAtDepth(depth: number, stops: readonly UnfoldStop[]): number {
  if (!stops.length || depth <= stops[0].depth) return ZOOM_UNFOLD.firstStop;
  for (let index = 1; index < stops.length; index++) {
    if (depth > stops[index].depth) continue;
    const before = stops[index - 1], after = stops[index];
    const part = (depth - before.depth) / Math.max(after.depth - before.depth, 1e-9);
    return before.start + (after.start - before.start) * part;
  }
  return stops[stops.length - 1].start;
}

/** How deep the point at the centre of the view lies at this point of the zoom. */
export function focusDepth(progress: number, stops: readonly UnfoldStop[]): number {
  if (!stops.length || progress <= stops[0].start) return stops[0]?.depth ?? 0;
  for (let index = 1; index < stops.length; index++) {
    if (progress > stops[index].start) continue;
    const before = stops[index - 1], after = stops[index];
    return before.depth + (after.depth - before.depth) * (progress - before.start) / (after.start - before.start);
  }
  return stops[stops.length - 1].depth;
}

/** The stop being passed at this point of the zoom, or -1 before the first. */
export function stopIndexAt(progress: number, stops: readonly UnfoldStop[]): number {
  let found = -1;
  for (let index = 0; index < stops.length; index++) if (progress >= stops[index].start) found = index;
  return found;
}

/** The point of the zoom that shows a stop best: its own surface in the middle, not yet opened far. */
export const progressForStop = (stop: UnfoldStop, stops: readonly UnfoldStop[]) => between(stop.start + stopSpacing(stops) * 0.12, 0, 1);

/**
 * Radius of the opening in a structure that starts to open at `start`. It grows while the next stops arrive, up to a size that
 * nearly fills the view of that moment, so that outer layers stand as rings around deeper ones, wider than those and leaving the frame first.
 */
export function holeRadius(start: number, progress: number, spacing: number, range: UnfoldRange): number {
  const span = Math.max(1.5 * spacing, 0.12);
  const open = smooth((progress - start) / span);
  if (open <= 0) return 0;
  return ZOOM_UNFOLD.holeShare * viewAtProgress(start + span, range) * open;
}

/** How far the centre of the view has moved to the spot. */
export const centringAt = (progress: number) => smooth(progress / ZOOM_UNFOLD.centring);

export const UNFOLD_NOTICE = 'A display of the model, not a dissection of an animal: the order comes from the structures that lie under this spot in the model, and how far each is opened is chosen for viewing. Each structure keeps its own evidence mark.';
