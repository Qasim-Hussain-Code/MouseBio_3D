import { isSourcePolylineAsset, type SourcePolylineAsset, type SourcePolylinePoint } from './source-polyline';
import { atlasAssetSha256 } from './atlas-asset';

export const POLYLINE_POINT_PAGE_SIZE = 20;
export const POLYLINE_INCIDENT_PAGE_SIZE = 20;
export type PolylinePathIdBasis = 'source-edge-id' | 'zero-based-path-index';
/** An opaque capability; the private source records are not serialized with this value. */
export interface PolylineInspectionIndex {
  readonly kind: 'mousebio.polyline-inspection.v1';
  readonly atlasId: string;
  readonly assetSha256: string;
  readonly coordinateFrameId: string;
  readonly structureId: string;
  readonly pathCount: number;
  readonly pointCount: number;
  readonly firstPathId: number;
  readonly pathIdBasis: PolylinePathIdBasis;
  readonly hasOriginalTopology: boolean;
  readonly firstVertexId: number | null;
}
export interface PolylineInspectionResult {
  readonly ok: boolean;
  readonly index?: PolylineInspectionIndex;
  readonly errors: readonly string[];
}
export interface PolylineEndpoint {
  readonly vertexId: number;
  readonly coordinates: SourcePolylinePoint;
  /** Distinct declared paths incident to this vertex; a self-link is counted once. */
  readonly incidentPathCount: number;
}
export interface PolylinePathPoint {
  readonly sourcePointIndex: number;
  readonly coordinates: SourcePolylinePoint;
}
export interface PolylinePathRecord {
  readonly pathId: number;
  readonly pathRowIndex: number;
  readonly pointCount: number;
  readonly segmentCount: number;
  readonly previousPathId: number | null;
  readonly nextPathId: number | null;
  readonly pointOffset: number;
  readonly points: readonly PolylinePathPoint[];
  readonly hasNextPointPage: boolean;
  readonly hasPreviousPointPage: boolean;
  /** Endpoint order follows original connectivity, not a repaired path direction. */
  readonly originalTopology?: { readonly endpoints: readonly [PolylineEndpoint, PolylineEndpoint] };
}
export interface PolylinePathResult {
  readonly ok: boolean;
  readonly record?: PolylinePathRecord;
  readonly errors: readonly string[];
}
export interface PolylineVertexRecord {
  readonly vertexId: number;
  readonly vertexRowIndex: number;
  readonly coordinates: SourcePolylinePoint;
  readonly incidentPathCount: number;
  readonly incidentPathIds: readonly number[];
  readonly pathOffset: number;
  readonly hasPreviousPathPage: boolean;
  readonly hasNextPathPage: boolean;
  readonly previousVertexId: number | null;
  readonly nextVertexId: number | null;
}
export interface PolylineVertexResult {
  readonly ok: boolean;
  readonly record?: PolylineVertexRecord;
  readonly errors: readonly string[];
}
interface PrivateIndex {
  readonly asset: SourcePolylineAsset;
  readonly pathIds: readonly number[];
  readonly pathById: ReadonlyMap<number, number>;
  readonly vertexById: ReadonlyMap<number, number> | null;
  readonly incidentStarts: Uint32Array | null;
  readonly incidentRows: Uint32Array | null;
}
const indexes = new WeakMap<object, PrivateIndex>();
const assetIndexes = new WeakMap<object, PolylineInspectionIndex>();
const EMPTY_ERRORS: readonly string[] = Object.freeze([]);
function failure(message: string): { readonly ok: false; readonly errors: readonly string[] } {
  return Object.freeze({ ok: false, errors: Object.freeze([message]) });
}
function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function validOffset(value: number, length: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && (length === 0 ? value === 0 : value < length);
}
function copyPoint(point: SourcePolylinePoint): SourcePolylinePoint {
  return Object.freeze([...point]) as unknown as SourcePolylinePoint;
}
export function isPolylineInspectionIndex(value: unknown): value is PolylineInspectionIndex {
  return !!value && typeof value === 'object' && indexes.has(value);
}

/** Index only parser-owned source paths; numerical adjacency supplies no physiological or anatomical inference. */
export function createPolylineInspection(value: unknown): PolylineInspectionResult {
  if (!isSourcePolylineAsset(value)) return failure('Polyline inspection requires a parser-produced source asset.');
  const cached = assetIndexes.get(value);
  if (cached) return Object.freeze({ ok: true, index: cached, errors: EMPTY_ERRORS });
  try {
    const { atlas, points, paths, sourceGraph } = value;
    const assetSha256 = atlasAssetSha256(atlas), coordinateFrameId = atlas.coordinateFrame.id;
    if (!assetSha256 || typeof coordinateFrameId !== 'string' || atlas.structures.length !== 1 || !points.length || !paths.length) {
      return failure('The polyline inspection source binding is inconsistent.');
    }
    const pathIds = sourceGraph ? sourceGraph.edgeIds : Object.freeze(paths.map((_, row) => row));
    const pathById = new Map<number, number>();
    if (pathIds.length !== paths.length) return failure('The source path identity inventory is inconsistent.');
    for (const [row, id] of pathIds.entries()) {
      if (!validId(id) || pathById.has(id)) return failure('The source path identity inventory is inconsistent.');
      pathById.set(id, row);
    }
    let vertexById: Map<number, number> | null = null, incidentStarts: Uint32Array | null = null, incidentRows: Uint32Array | null = null;
    if (sourceGraph) {
      if (sourceGraph.vertexIds.length !== sourceGraph.vertexCoordinates.length || sourceGraph.connectivity.length !== paths.length) {
        return failure('The explicit source topology inventory is inconsistent.');
      }
      vertexById = new Map<number, number>();
      for (const [row, id] of sourceGraph.vertexIds.entries()) {
        if (!validId(id) || vertexById.has(id)) return failure('The explicit source vertex identity is inconsistent.');
        vertexById.set(id, row);
      }
      const incidentCounts = new Uint32Array(sourceGraph.vertexIds.length);
      for (const pair of sourceGraph.connectivity) {
        const first = vertexById.get(pair[0]), second = vertexById.get(pair[1]);
        if (first === undefined || second === undefined) return failure('An explicit source endpoint is absent from its vertex inventory.');
        incidentCounts[first]++;
        if (first !== second) incidentCounts[second]++;
      }
      incidentStarts = new Uint32Array(sourceGraph.vertexIds.length + 1);
      for (let row = 0; row < incidentCounts.length; row++) incidentStarts[row + 1] = incidentStarts[row] + incidentCounts[row];
      incidentRows = new Uint32Array(incidentStarts[incidentStarts.length - 1]);
      const cursors = incidentStarts.slice(0, -1);
      for (const [pathRow, pair] of sourceGraph.connectivity.entries()) {
        const first = vertexById.get(pair[0])!, second = vertexById.get(pair[1])!;
        incidentRows[cursors[first]++] = pathRow;
        if (first !== second) incidentRows[cursors[second]++] = pathRow;
      }
    }
    const index: PolylineInspectionIndex = Object.freeze({ kind: 'mousebio.polyline-inspection.v1', atlasId: atlas.id,
      assetSha256, coordinateFrameId, structureId: atlas.structures[0].id, pathCount: paths.length, pointCount: points.length,
      firstPathId: pathIds[0], pathIdBasis: sourceGraph ? 'source-edge-id' : 'zero-based-path-index',
      hasOriginalTopology: !!sourceGraph, firstVertexId: sourceGraph?.vertexIds[0] ?? null });
    indexes.set(index, { asset: value, pathIds, pathById, vertexById, incidentStarts, incidentRows });
    assetIndexes.set(value, index);
    return Object.freeze({ ok: true, index, errors: EMPTY_ERRORS });
  } catch { return failure('The polyline source could not be indexed for inspection.'); }
}

/** Read a bounded page in original path order, preserving edge-local point indices and coordinates. */
export function inspectPolylinePath(index: unknown, pathId: unknown, pointOffset = 0): PolylinePathResult {
  if (!isPolylineInspectionIndex(index)) return failure('Initialize polyline inspection from the original parser-produced asset.');
  if (!validId(pathId)) return failure('A path ID must be a nonnegative safe integer.');
  const data = indexes.get(index)!, row = data.pathById.get(pathId);
  if (row === undefined) return failure('The requested path ID is absent from this source.');
  const path = data.asset.paths[row];
  if (!validOffset(pointOffset, path.length)) return failure('The requested point page is outside this source path.');
  const points: PolylinePathPoint[] = [];
  for (let offset = pointOffset; offset < Math.min(pointOffset + POLYLINE_POINT_PAGE_SIZE, path.length); offset++) {
    const sourcePointIndex = path[offset];
    points.push(Object.freeze({ sourcePointIndex, coordinates: copyPoint(data.asset.points[sourcePointIndex]) }));
  }
  let originalTopology: PolylinePathRecord['originalTopology'];
  const graph = data.asset.sourceGraph;
  if (graph && data.vertexById && data.incidentStarts) {
    const endpoint = (vertexId: number): PolylineEndpoint => {
      const vertexRow = data.vertexById!.get(vertexId)!;
      return Object.freeze({ vertexId, coordinates: copyPoint(graph.vertexCoordinates[vertexRow]),
        incidentPathCount: data.incidentStarts![vertexRow + 1] - data.incidentStarts![vertexRow] });
    };
    const pair = graph.connectivity[row];
    originalTopology = Object.freeze({ endpoints: Object.freeze([endpoint(pair[0]), endpoint(pair[1])]) as readonly [PolylineEndpoint, PolylineEndpoint] });
  }
  const record: PolylinePathRecord = Object.freeze({ pathId, pathRowIndex: row, pointCount: path.length, segmentCount: path.length - 1,
    previousPathId: data.pathIds[row - 1] ?? null, nextPathId: data.pathIds[row + 1] ?? null, pointOffset,
    points: Object.freeze(points), hasPreviousPointPage: pointOffset > 0, hasNextPointPage: pointOffset + points.length < path.length,
    ...(originalTopology ? { originalTopology } : {}) });
  return Object.freeze({ ok: true, record, errors: EMPTY_ERRORS });
}

/** Inspect explicit source vertices only; coincident path points never create a synthetic junction. */
export function inspectPolylineVertex(index: unknown, vertexId: unknown, offset = 0): PolylineVertexResult {
  if (!isPolylineInspectionIndex(index)) return failure('Initialize polyline inspection from the original parser-produced asset.');
  if (!validId(vertexId)) return failure('A source vertex ID must be a nonnegative safe integer.');
  const data = indexes.get(index)!, graph = data.asset.sourceGraph;
  if (!graph || !data.vertexById || !data.incidentStarts || !data.incidentRows) return failure('This source has no separately declared vertex connectivity.');
  const row = data.vertexById.get(vertexId);
  if (row === undefined) return failure('The requested vertex ID is absent from this source.');
  const count = data.incidentStarts[row + 1] - data.incidentStarts[row];
  if (!validOffset(offset, count)) return failure('The requested incident-path page is outside this source vertex.');
  const incidentPathIds: number[] = [];
  for (let position = offset; position < Math.min(offset + POLYLINE_INCIDENT_PAGE_SIZE, count); position++) {
    incidentPathIds.push(data.pathIds[data.incidentRows[data.incidentStarts[row] + position]]);
  }
  const record: PolylineVertexRecord = Object.freeze({ vertexId, vertexRowIndex: row, coordinates: copyPoint(graph.vertexCoordinates[row]),
    incidentPathCount: count, incidentPathIds: Object.freeze(incidentPathIds), pathOffset: offset,
    hasPreviousPathPage: offset > 0, hasNextPathPage: offset + incidentPathIds.length < count,
    previousVertexId: graph.vertexIds[row - 1] ?? null, nextVertexId: graph.vertexIds[row + 1] ?? null });
  return Object.freeze({ ok: true, record, errors: EMPTY_ERRORS });
}
