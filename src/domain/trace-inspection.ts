import { isLocalTraceAsset, type LocalTraceAsset, type LocalTraceNode } from './local-trace';
import { isSourceTraceAsset, type SourceTraceAsset } from './source-trace';
import { atlasAssetSha256 } from './atlas-asset';

export const TRACE_CHILD_PAGE_SIZE = 20;
export type TraceInspectionAsset = LocalTraceAsset | SourceTraceAsset;
export interface TraceInspectionSummary {
  readonly samples: number;
  readonly parentLinks: number;
  readonly roots: number;
  readonly isolatedSamples: number;
  /** Every sample with no declared children, including isolated roots. */
  readonly samplesWithoutChildren: number;
  /** Every sample with more than one declared child, including roots. */
  readonly branchSamples: number;
}
/** A capability to inspect one parser-owned source. It contains no sample arrays. */
export interface TraceInspectionIndex {
  readonly kind: 'mousebio.trace-inspection.v1';
  readonly atlasId: string;
  readonly coordinateFrameId: string;
  readonly structureId: string;
  readonly assetSha256: string;
  readonly firstSampleId: number;
  readonly summary: TraceInspectionSummary;
}
export interface TraceInspectionResult {
  readonly ok: boolean;
  readonly index?: TraceInspectionIndex;
  readonly errors: readonly string[];
}
export interface TraceSampleRecord {
  /** A defensive immutable copy of the original seven numeric fields. */
  readonly sample: LocalTraceNode;
  readonly parent: LocalTraceNode | null;
  /** Child identifiers retain their original source-row order. */
  readonly children: readonly number[];
  readonly childOffset: number;
  readonly totalChildren: number;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  /** Adjacent source rows; these are not anatomical directions. */
  readonly previousSampleId: number | null;
  readonly nextSampleId: number | null;
  readonly rowIndex: number;
  readonly incidentLinks: number;
}
export interface TraceSampleResult {
  readonly ok: boolean;
  readonly record?: TraceSampleRecord;
  readonly errors: readonly string[];
}
interface PrivateIndex {
  readonly asset: TraceInspectionAsset;
  readonly byId: ReadonlyMap<number, number>;
  readonly childStarts: Uint32Array;
  readonly childRows: Uint32Array;
}
const indexes = new WeakMap<object, PrivateIndex>();
const assetIndexes = new WeakMap<object, TraceInspectionIndex>();
const emptyErrors: readonly string[] = Object.freeze([]);
function failure(message: string): { readonly ok: false; readonly errors: readonly string[] } {
  return Object.freeze({ ok: false, errors: Object.freeze([message]) });
}
function sourceId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export function isTraceInspectionIndex(value: unknown): value is TraceInspectionIndex {
  return !!value && typeof value === 'object' && indexes.has(value);
}

/** Index explicit source identities in O(n), without inferring geometry or biological classifications. */
export function createTraceInspection(value: unknown): TraceInspectionResult {
  if (!isLocalTraceAsset(value) && !isSourceTraceAsset(value)) {
    return failure('Sample inspection requires a parser-produced trace asset.');
  }
  const cached = assetIndexes.get(value);
  if (cached) return Object.freeze({ ok: true, index: cached, errors: emptyErrors });
  const { atlas, nodes } = value;
  const assetSha256 = atlasAssetSha256(atlas), coordinateFrameId = atlas.coordinateFrame.id;
  if (!assetSha256 || typeof coordinateFrameId !== 'string' || atlas.structures.length !== 1 || !nodes.length) {
    return failure('The trace inspection source binding is inconsistent.');
  }
  const byId = new Map<number, number>();
  const childCounts = new Uint32Array(nodes.length);
  for (const [row, sample] of nodes.entries()) byId.set(sample[0], row);
  let roots = 0;
  for (const sample of nodes) {
    if (sample[6] === -1) roots++;
    else childCounts[byId.get(sample[6])!]++;
  }
  // Compressed child-row lists make each page O(page size), including large
  // child inventories. Insertion retains original source-row order.
  const childStarts = new Uint32Array(nodes.length + 1);
  let isolatedSamples = 0, samplesWithoutChildren = 0, branchSamples = 0;
  for (let row = 0; row < nodes.length; row++) {
    childStarts[row + 1] = childStarts[row] + childCounts[row];
    if (childCounts[row] === 0) {
      samplesWithoutChildren++;
      if (nodes[row][6] === -1) isolatedSamples++;
    }
    if (childCounts[row] > 1) branchSamples++;
  }
  const childRows = new Uint32Array(nodes.length - roots), cursors = childStarts.slice(0, -1);
  for (const [row, sample] of nodes.entries()) {
    if (sample[6] !== -1) childRows[cursors[byId.get(sample[6])!]++] = row;
  }
  const summary: TraceInspectionSummary = Object.freeze({ samples: nodes.length, parentLinks: childRows.length,
    roots, isolatedSamples, samplesWithoutChildren, branchSamples });
  const index: TraceInspectionIndex = Object.freeze({ kind: 'mousebio.trace-inspection.v1', atlasId: atlas.id,
    coordinateFrameId, structureId: atlas.structures[0].id, assetSha256, firstSampleId: nodes[0][0], summary });
  indexes.set(index, { asset: value, byId, childStarts, childRows });
  assetIndexes.set(value, index);
  return Object.freeze({ ok: true, index, errors: emptyErrors });
}
function copySample(sample: LocalTraceNode): LocalTraceNode {
  return Object.freeze([...sample]) as unknown as LocalTraceNode;
}

/** Inspect exact source numbers only. No units, radius interpretation, cell types or experimental IDs are inferred. */
export function inspectTraceSample(index: unknown, sampleId: unknown, childOffset = 0): TraceSampleResult {
  if (!isTraceInspectionIndex(index)) return failure('Initialize sample inspection from the original parsed trace.');
  if (!sourceId(sampleId)) return failure('A sample ID must be a positive safe integer.');
  const data = indexes.get(index)!;
  const row = data.byId.get(sampleId);
  if (row === undefined) return failure('The requested sample ID is absent from this source trace.');
  const totalChildren = data.childStarts[row + 1] - data.childStarts[row];
  if (!Number.isSafeInteger(childOffset) || childOffset < 0 || (totalChildren ? childOffset >= totalChildren : childOffset !== 0)) {
    return failure('The requested child page is outside the source sample record.');
  }
  const nodes = data.asset.nodes, sample = nodes[row];
  const parent = sample[6] === -1 ? null : nodes[data.byId.get(sample[6])!];
  const children: number[] = [];
  for (let offset = childOffset; offset < Math.min(childOffset + TRACE_CHILD_PAGE_SIZE, totalChildren); offset++) {
    children.push(nodes[data.childRows[data.childStarts[row] + offset]][0]);
  }
  const record: TraceSampleRecord = Object.freeze({ sample: copySample(sample), parent: parent ? copySample(parent) : null,
    children: Object.freeze(children), childOffset, totalChildren, hasPreviousPage: childOffset > 0,
    hasNextPage: childOffset + children.length < totalChildren, previousSampleId: nodes[row - 1]?.[0] ?? null,
    nextSampleId: nodes[row + 1]?.[0] ?? null, rowIndex: row, incidentLinks: totalChildren + (parent ? 1 : 0) });
  return Object.freeze({ ok: true, record, errors: emptyErrors });
}
