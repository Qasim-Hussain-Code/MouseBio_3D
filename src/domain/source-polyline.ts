import vascularManifest from '../../public/atlas-vascular/atlas.json';
import type { Atlas } from './types';

export type SourcePolylinePoint = readonly [number, number, number];
export type SourcePolylinePath = readonly number[];
export interface SourcePolylineAsset {
  readonly atlas: Atlas;
  readonly points: readonly SourcePolylinePoint[];
  readonly paths: readonly SourcePolylinePath[];
  readonly sourceGraph?: SourcePolylineGraph;
}
export interface SourcePolylineGraph {
  readonly vertexIds: readonly number[];
  readonly vertexCoordinates: readonly SourcePolylinePoint[];
  readonly edgeIds: readonly number[];
  readonly connectivity: readonly (readonly [number, number])[];
}
export interface SourcePolylineResult {
  readonly ok: boolean;
  readonly asset?: SourcePolylineAsset;
  readonly errors: readonly string[];
}
export interface PolylineStatistics {
  readonly points: number; readonly polylines: number; readonly segments: number; readonly components: number;
  readonly isolatedPoints: number; readonly zeroLengthSegments: number; readonly float32CollapsedSegments: number;
  readonly boundsSourceUnits: readonly (readonly number[])[];
  readonly displayBoundsSourceUnits: readonly (readonly number[])[];
  readonly maxFloat32PositionError: number;
}
export interface PolylineInspectionResult {
  readonly ok: boolean;
  readonly statistics?: PolylineStatistics;
  readonly errors: readonly string[];
}

const ASSET_BYTES = 55658;
const ASSET_SHA256 = 'e59fea98d4f41adab6149eee38e28ea6c3737dfa37013d5a2039e89c4c3ef0ce';
const SOURCE_SHA256 = 'b35b59a1056d04e5992a0e463751ceb89a733d80837e66d951be810899ec3c27';
const SOURCE_COMMIT = '7fe04a9ccf37664d76fe548ae226147c0023ceb7';
const MAX_POINTS = 1000000, MAX_PATHS = 100000, MAX_SEGMENTS = 2000000;
const parsedAssets = new WeakSet<object>();
const expectedStatistics = {
  assetBytes: ASSET_BYTES, assetSha256: ASSET_SHA256, points: 1940, polylines: 84, segments: 1876,
  components: 64, isolatedPoints: 0, zeroLengthSegments: 0, float32CollapsedSegments: 0,
  boundsSourceUnits: [[1, 1, 101], [298, 298, 298]], displayBoundsSourceUnits: [[1, 1, 101], [298, 298, 298]],
  maxFloat32PositionError: 1.5136718729991117e-05,
};
const expectedFrame = {
  id: 'mousemapper-nerve-patch0-native-unknown-units-v1', sourceUnits: 'unknown', assetUnits: 'unknown',
  sourceToAssetScale: 1, unitsVerified: false, anatomicalOrientationVerified: false,
  physicalCalibrationVerified: false, registration: null, registrationToDigimouse: null,
  origin: 'Source VTK origin; anatomical origin unverified',
  axes: { x: 'native graph x; anatomical direction unverified', y: 'native graph y; anatomical direction unverified',
    z: 'native graph z; anatomical direction unverified' },
};
const expectedProcessing = {
  sourceToAssetScale: 1, coordinateConversion: false, pointRemoval: false, pathRepair: false,
  smoothing: false, registration: false, radiusUsed: false, positionStorage: 'float32 for display only',
  sourcePointOrderPreserved: true, sourcePathOrderPreserved: true, sourceConnectivityPreserved: true,
};
const expectedOmissions = [
  { association: 'POINT_DATA', declaredRecords: 1940, field: 'radius', components: 1, tuples: 2290 },
  { association: 'CELL_DATA', declaredRecords: 84, field: 'radius', components: 1, tuples: 145 },
];
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): boolean { return typeof value === 'string' && value.trim().length > 0; }
function equalData(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length && expected.every((child, index) => equalData(value[index], child));
  if (record(expected)) return record(value) && Object.keys(value).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, child]) => Object.hasOwn(value, key) && equalData(value[key], child));
  return value === expected;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
const VASCULAR = freeze(JSON.parse(JSON.stringify(vascularManifest))) as Atlas;
function failure(message: string): { readonly ok: false; readonly errors: readonly string[] } { return Object.freeze({ ok: false, errors: Object.freeze([message]) }); }
function requireCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finiteFloat32(value: number): boolean { return Number.isFinite(value) && Number.isFinite(Math.fround(value)); }
function include(bounds: number[][], point: readonly number[]): void {
  for (let axis = 0; axis < 3; axis++) { bounds[0][axis] = Math.min(bounds[0][axis], point[axis]); bounds[1][axis] = Math.max(bounds[1][axis], point[axis]); }
}
const emptyBounds = () => [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];

/** Numerical inspection grants no source identity, units or scientific classification. Cycles are allowed. */
export function inspectSourcePolylineData(value: unknown): PolylineInspectionResult {
  try {
    requireCondition(record(value) && (Object.keys(value).length === 3 || Object.keys(value).length === 4 && Object.hasOwn(value, 'sourceGraph')) && value.schemaVersion === 'mousebio.polyline.v1'
      && Object.hasOwn(value, 'points') && Object.hasOwn(value, 'paths') && Array.isArray(value.points) && Array.isArray(value.paths), 'Invalid polyline data layout.');
    const points = value.points, paths = value.paths;
    requireCondition(points.length > 0 && points.length <= MAX_POINTS && paths.length > 0 && paths.length <= MAX_PATHS, 'Polyline source counts exceed supported bounds.');
    const bounds = emptyBounds(), displayBounds = emptyBounds();
    const display: number[][] = [], referenced = new Uint8Array(points.length), representatives = Uint32Array.from({ length: points.length }, (_, index) => index);
    const rank = new Uint8Array(points.length);
    let maximumError = 0, segments = 0, components = points.length, zeroLengthSegments = 0, float32CollapsedSegments = 0;
    for (const point of points) {
      requireCondition(Array.isArray(point) && point.length === 3 && point.every((number) => typeof number === 'number' && finiteFloat32(number)), 'Polyline coordinates must contain supported finite numeric triples.');
      const stored = point.map(Math.fround);
      for (let axis = 0; axis < 3; axis++) maximumError = Math.max(maximumError, Math.abs(stored[axis] - point[axis]));
      display.push(stored); include(bounds, point);
    }
    const representative = (index: number): number => {
      let result = index;
      while (representatives[result] !== result) result = representatives[result];
      while (representatives[index] !== index) { const next = representatives[index]; representatives[index] = result; index = next; }
      return result;
    };
    for (const path of paths) {
      requireCondition(Array.isArray(path) && path.length >= 2 && path.length <= MAX_SEGMENTS + 1, 'Polyline paths require bounded source index sequences.');
      requireCondition(segments + path.length - 1 <= MAX_SEGMENTS, 'Polyline segment count exceeds the supported bound.');
      for (const index of path) requireCondition(typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 && index < points.length, 'A polyline point index is invalid.');
      for (let offset = 1; offset < path.length; offset++) {
        const first = path[offset - 1], second = path[offset];
        referenced[first] = 1; referenced[second] = 1;
        include(displayBounds, display[first]); include(displayBounds, display[second]);
        const sourceCoincident = points[first].every((coordinate: number, axis: number) => coordinate === points[second][axis]);
        if (sourceCoincident) zeroLengthSegments++;
        else if (display[first].every((coordinate, axis) => coordinate === display[second][axis])) float32CollapsedSegments++;
        const firstRoot = representative(first), secondRoot = representative(second);
        if (firstRoot !== secondRoot) {
          if (rank[firstRoot] < rank[secondRoot]) representatives[firstRoot] = secondRoot;
          else { representatives[secondRoot] = firstRoot; if (rank[firstRoot] === rank[secondRoot]) rank[firstRoot]++; }
          components--;
        }
        segments++;
      }
    }
    const extent = Math.hypot(...displayBounds[0].map((coordinate, axis) => displayBounds[1][axis] - coordinate));
    const radius = extent / 2;
    requireCondition(Number.isFinite(extent) && extent > 0 && finiteFloat32(radius / 2000) && Math.fround(radius / 2000) > 0
      && finiteFloat32(radius * 100) && finiteFloat32(radius * 12), 'Polyline display extent cannot be supported safely.');
    const graphStatistics = Object.hasOwn(value, 'sourceGraph') ? inspectSourceGraph(value.sourceGraph, points, paths) : {};
    const statistics: PolylineStatistics = freeze({ ...graphStatistics, points: points.length, polylines: paths.length, segments, components,
      isolatedPoints: points.length - referenced.reduce((sum, present) => sum + present, 0), zeroLengthSegments,
      float32CollapsedSegments, boundsSourceUnits: bounds, displayBoundsSourceUnits: displayBounds, maxFloat32PositionError: maximumError });
    return Object.freeze({ ok: true, statistics, errors: Object.freeze([]) });
  } catch { return failure('The polyline coordinates or source connectivity are invalid or unsupported.'); }
}

/** Validate the approved source manifest before fetching its local derivative. */
export function isSourcePolylineAtlas(value: unknown): value is Atlas & { readonly assetFormat: 'polyline-native-v1' } {
  try {
    if (record(value) && value.id === 'schmid2021-mvn1-v1') return VASCULAR.statistics.assetSha256 === '8d9fb19e943a126562ab5a439d83590b5694d58b208f064a8140d556ed3e4652' && VASCULAR.source.sourceSha256 === '40d8a729e8bc977e4121a633da162d1e49f2e71e343454a04e18cc541965c627' && equalData(value, VASCULAR);
    if (!record(value) || value.id !== 'mousemapper-nerve-patch0-v1' || value.assetFormat !== 'polyline-native-v1'
      || value.assetUrl !== '/atlas-nerve/mousemapper-patch0-lines.json' || !text(value.title)
      || !record(value.source) || !record(value.coordinateFrame) || !equalData(value.statistics, expectedStatistics)
      || !equalData(value.coordinateFrame, expectedFrame) || !equalData(value.processing, expectedProcessing)
      || !equalData(value.sourceAttributesOmitted, expectedOmissions) || !Array.isArray(value.structures) || value.structures.length !== 1
      || !Array.isArray(value.limitations) || !value.limitations.length || !value.limitations.every(text)) return false;
    const source = value.source, structure = value.structures[0];
    if (source.id !== 'mousemapper-7fe04a9c-graph-patch0' || source.sourceSha256 !== SOURCE_SHA256 || source.sourceBytes !== 60899
      || source.repositoryCommit !== SOURCE_COMMIT || source.license !== 'Apache-2.0' || source.licenseUrl !== 'https://www.apache.org/licenses/LICENSE-2.0'
      || !text(source.citation) || !text(source.url)) return false;
    if (!record(structure) || structure.id !== 'mousemapper-nerve:patch0' || structure.sourceLabel !== 'patch_volume_4X_0_pred'
      || structure.meshNode !== 'region_mousemapper_patch0' || !equalData(structure.systems, ['nervous'])
      || structure.scale !== undefined || structure.ontology !== undefined || structure.parentId !== undefined) return false;
    if (value.specimen !== undefined && (!record(value.specimen) || value.specimen.sex !== 'unknown'
      || value.specimen.age !== undefined || value.specimen.mass !== undefined || value.specimen.strain !== undefined
      || value.specimen.count !== undefined || value.specimen.scientificName !== undefined || value.specimen.ageClaims !== undefined)) return false;
    return true;
  } catch { return false; }
}
export function isSourcePolylineAsset(value: unknown): value is SourcePolylineAsset { return !!value && typeof value === 'object' && parsedAssets.has(value); }
function isPlainJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object' || ancestors.has(value) || Object.getOwnPropertySymbols(value).length) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype) && prototype !== null) return false;
  ancestors.add(value);
  const valid = Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, descriptor]) => Array.isArray(value) && key === 'length'
    || 'value' in descriptor && descriptor.enumerable && isPlainJson(descriptor.value, ancestors));
  ancestors.delete(value);
  return valid;
}

/** Preserve approved zero-based point and path records without radius-derived surfaces or inferred links. */
export async function parseSourcePolyline(input: ArrayBuffer, atlas: Atlas): Promise<SourcePolylineResult> {
  try {
    if (!isPlainJson(atlas) || !isSourcePolylineAtlas(atlas)) return failure('The polyline manifest does not match the reviewed source.');
    const snapshot = JSON.stringify(atlas);
    const expected = atlas.id === VASCULAR.id ? VASCULAR.statistics : expectedStatistics;
    if (!(input instanceof ArrayBuffer) || input.byteLength !== expected.assetBytes || input.byteLength > 80 * 1024 * 1024) return failure('The polyline source byte count is inconsistent.');
    const bytes = input.slice(0);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
    if (hash !== expected.assetSha256) return failure('The polyline source checksum does not match the reviewed derivative.');
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const inspection = inspectSourcePolylineData(body);
    if (!inspection.ok || !inspection.statistics || !equalData({ assetBytes: bytes.byteLength, assetSha256: hash, ...inspection.statistics }, expected)) {
      return failure('The polyline source graph statistics do not match the reviewed derivative.');
    }
    if (!isPlainJson(atlas) || !isSourcePolylineAtlas(atlas) || JSON.stringify(atlas) !== snapshot) return failure('The polyline manifest changed while its source bytes were checked.');
    const asset: SourcePolylineAsset = freeze({ atlas, points: body.points, paths: body.paths, ...(body.sourceGraph ? { sourceGraph: body.sourceGraph } : {}) });
    parsedAssets.add(asset);
    return Object.freeze({ ok: true, asset, errors: Object.freeze([]) });
  } catch { return failure('The polyline source could not be validated.'); }
}


/** Original graph identities are separate from edge-local rendering indices. */
function inspectSourceGraph(value: unknown, points: number[][], paths: number[][]): Record<string, number> {
  requireCondition(record(value) && Object.keys(value).length === 4 && ['vertexIds', 'vertexCoordinates', 'edgeIds', 'connectivity'].every((key) => Object.hasOwn(value, key) && Array.isArray(value[key])), 'Invalid source graph layout.');
  const { vertexIds, vertexCoordinates, edgeIds, connectivity } = value as unknown as { vertexIds: number[]; vertexCoordinates: number[][]; edgeIds: number[]; connectivity: number[][] };
  const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0;
  requireCondition(vertexIds.length > 0 && vertexIds.length <= 100000 && vertexCoordinates.length === vertexIds.length && edgeIds.length === paths.length && connectivity.length === paths.length
    && vertexIds.every(validId) && edgeIds.every(validId) && new Set(vertexIds).size === vertexIds.length && new Set(edgeIds).size === edgeIds.length, 'Invalid source graph identity inventory.');
  requireCondition(vertexCoordinates.every((point) => Array.isArray(point) && point.length === 3 && point.every((value) => typeof value === 'number' && finiteFloat32(value))), 'Invalid source graph coordinates.');
  const byId = new Map(vertexIds.map((id, row) => [id, row]));
  const representatives = Uint32Array.from({ length: vertexIds.length }, (_, row) => row);
  const find = (row: number): number => { while (representatives[row] !== row) { representatives[row] = representatives[representatives[row]]; row = representatives[row]; } return row; };
  let components = vertexIds.length, mismatches = 0, selfLinks = 0;
  for (let edge = 0; edge < paths.length; edge++) {
    const connection = connectivity[edge];
    requireCondition(Array.isArray(connection) && connection.length === 2 && connection.every((id) => validId(id) && byId.has(id)), 'Invalid source graph endpoint.');
    const first = byId.get(connection[0])!, second = byId.get(connection[1])!;
    if (first === second) selfLinks++;
    const a = find(first), b = find(second); if (a !== b) { representatives[a] = b; components--; }
    const path = paths[edge];
    if (!points[path[0]].every((coordinate, axis) => coordinate === vertexCoordinates[first][axis])
      || !points[path[path.length - 1]].every((coordinate, axis) => coordinate === vertexCoordinates[second][axis])) mismatches++;
  }
  return { sourceGraphVertices: vertexIds.length, sourceGraphEdges: edgeIds.length, sourceGraphComponents: components,
    sourceGraphCycleRank: edgeIds.length - vertexIds.length + components, sourceGraphSelfLinks: selfLinks, sourceEndpointMismatchPaths: mismatches };
}
