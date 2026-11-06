/**
 * Screen-space placement of region labels. Each label is tied to a projected
 * anchor point and placed at one of several offsets so that label boxes do not
 * overlap. The anchor is a display bounds centre, not an anatomical centroid.
 * This module has no renderer dependency and performs no measurement.
 */
export interface LabelCandidate {
  readonly id: string;
  readonly name: string;
  /** Projected anchor in CSS pixels of the viewport. */
  readonly x: number;
  readonly y: number;
  /** Normalised device depth; values outside (-1, 1) are behind the camera or beyond the far plane. */
  readonly depth: number;
  /** Larger values are placed first; the selected region should get the largest. */
  readonly priority: number;
}

export interface PlacedLabel {
  readonly id: string;
  readonly name: string;
  readonly anchorX: number;
  readonly anchorY: number;
  /** Top-left corner and size of the label box in CSS pixels. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LabelLayoutOptions {
  readonly width: number;
  readonly height: number;
  /** Approximate glyph advance and box padding used to estimate label size. */
  readonly glyphWidth?: number;
  readonly paddingX?: number;
  readonly boxHeight?: number;
  readonly margin?: number;
  readonly maxLabels?: number;
}

const DEFAULTS = Object.freeze({ glyphWidth: 6.4, paddingX: 9, boxHeight: 24, margin: 6, maxLabels: 48 });

/** Offsets tried in order, as multiples of a step; the first collision-free one wins. */
const OFFSETS: readonly (readonly [number, number])[] = Object.freeze([
  [1, -1], [1, 1], [-1, -1], [-1, 1], [0, -1.6], [0, 1.6], [1.6, 0], [-1.6, 0],
  [2.2, -1.6], [2.2, 1.6], [-2.2, -1.6], [-2.2, 1.6], [0, -2.8], [0, 2.8],
  [3.4, -2.6], [3.4, 2.6], [-3.4, -2.6], [-3.4, 2.6], [0, -4], [0, 4], [3.4, 0], [-3.4, 0],
]);
const STEP = 22;

function overlaps(a: PlacedLabel, b: PlacedLabel, margin: number): boolean {
  return a.left < b.left + b.width + margin && b.left < a.left + a.width + margin
    && a.top < b.top + b.height + margin && b.top < a.top + a.height + margin;
}

/** Names in two columns beside the view, as on an anatomical plate, each with a line to what it names. */
export interface PlateOptions {
  readonly width: number;
  readonly height: number;
  readonly columnWidth: number;
  /** Space kept clear at the top and bottom of each column, for the controls that lie over the view. */
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomLeft: number;
  readonly bottomRight: number;
}

const PLATE_GLYPH = 5.5, PLATE_PADDING = 8, PLATE_LINE = 13, PLATE_GAP = 3;

export function layoutPlate(candidates: readonly LabelCandidate[], options: PlateOptions): PlacedLabel[] {
  const { width, height, columnWidth, topLeft, topRight, bottomLeft, bottomRight } = options;
  if (width < columnWidth * 2.5 || height <= 0) return [];
  const heightOf = (name: string) => Math.ceil((name.length * PLATE_GLYPH) / (columnWidth - PLATE_PADDING * 2)) * PLATE_LINE + 6;
  const room = { left: Math.max(0, height - bottomLeft - topLeft), right: Math.max(0, height - bottomRight - topRight) };
  const columns: { left: LabelCandidate[]; right: LabelCandidate[] } = { left: [], right: [] };
  const used = { left: 0, right: 0 };
  // The selection first, then in order of priority. A name goes to the side it lies nearer, or the other side if that is full.
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (candidate.x < 0 || candidate.y < 0 || candidate.x > width || candidate.y > height) continue;
    const size = heightOf(candidate.name) + PLATE_GAP;
    const near = candidate.x < width / 2 ? 'left' : 'right', far = near === 'left' ? 'right' : 'left';
    const side = used[near] + size <= room[near] ? near : used[far] + size <= room[far] ? far : null;
    if (!side) continue;
    columns[side].push(candidate); used[side] += size;
  }
  const placed: PlacedLabel[] = [];
  for (const side of ['left', 'right'] as const) {
    // In order of height on the screen, so that the lines do not cross more than they must.
    const list = columns[side].sort((a, b) => a.y - b.y);
    const start = side === 'left' ? topLeft : topRight;
    let top = start + Math.max(0, (room[side] - used[side]) / 2);
    for (const item of list) {
      const boxHeight = heightOf(item.name);
      placed.push({ id: item.id, name: item.name, anchorX: item.x, anchorY: item.y, left: side === 'left' ? 8 : width - columnWidth - 8, top: Math.round(top), width: columnWidth, height: boxHeight });
      top += boxHeight + PLATE_GAP;
    }
  }
  return placed;
}

/** Estimate the label box for a name. Deterministic and independent of fonts. */
export function estimateLabelSize(name: string, options: LabelLayoutOptions): { width: number; height: number } {
  const glyph = options.glyphWidth ?? DEFAULTS.glyphWidth, padding = options.paddingX ?? DEFAULTS.paddingX;
  return { width: Math.round(name.length * glyph + padding * 2), height: options.boxHeight ?? DEFAULTS.boxHeight };
}

/**
 * Place labels by descending priority. Candidates behind the camera, outside
 * the viewport or without a collision-free offset are omitted rather than
 * drawn over another label. The result order follows placement order.
 */
export function layoutLabels(candidates: readonly LabelCandidate[], options: LabelLayoutOptions): PlacedLabel[] {
  if (!Number.isFinite(options.width) || !Number.isFinite(options.height) || options.width <= 0 || options.height <= 0) return [];
  const margin = options.margin ?? DEFAULTS.margin, limit = options.maxLabels ?? DEFAULTS.maxLabels;
  const ordered = candidates.filter((candidate) => Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.depth)
    && candidate.depth > -1 && candidate.depth < 1 && candidate.x >= 0 && candidate.x <= options.width && candidate.y >= 0 && candidate.y <= options.height)
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const placed: PlacedLabel[] = [];
  for (const candidate of ordered) {
    if (placed.length >= limit) break;
    const size = estimateLabelSize(candidate.name, options);
    for (const [dx, dy] of OFFSETS) {
      const centreX = candidate.x + dx * STEP, centreY = candidate.y + dy * STEP;
      const left = Math.round(dx > 0 ? candidate.x + dx * STEP : dx < 0 ? candidate.x + dx * STEP - size.width : centreX - size.width / 2);
      const top = Math.round(centreY - size.height / 2);
      if (left < 0 || top < 0 || left + size.width > options.width || top + size.height > options.height) continue;
      const box: PlacedLabel = { id: candidate.id, name: candidate.name, anchorX: candidate.x, anchorY: candidate.y, left, top, width: size.width, height: size.height };
      if (placed.some((other) => overlaps(box, other, margin))) continue;
      placed.push(box);
      break;
    }
  }
  return placed;
}

/** The point on a label box edge nearest to its anchor, where the leader line ends. */
export function leaderEnd(label: PlacedLabel): { x: number; y: number } {
  const x = Math.min(Math.max(label.anchorX, label.left), label.left + label.width);
  const y = Math.min(Math.max(label.anchorY, label.top), label.top + label.height);
  return { x, y };
}
