import { buildEma147Groups } from './ema147-groups';
import type { Atlas, Structure } from './types';

export interface NativeSurfaceSummary {
  readonly sourceFile: string;
  readonly sourceRegionIndex: number;
  readonly sourceEMAPAId: string | null;
  readonly sourceVolumeLabelIndex: number | null;
  readonly vertices: number;
  readonly triangles: number;
  readonly topology: Readonly<{
    boundaryEdges: number;
    nonmanifoldEdges: number;
    inconsistentWindingEdges: number;
    noncyclicVertexLinks: number;
    degenerateTriangles: number;
    duplicateTriangles: number;
    components: number;
    /** Executed mesh diagnostics only, not anatomical or self-intersection validation. */
    closed: boolean;
  }>;
}

const ARCHIVE_SHA256 = 'efd5df6df9b69cf21a62d1f4245ecc5419ee4e5c4c72635f444ce3fba5b7971c';
const ASSET_SHA256 = '8593f83eb1ebf05f17203b9b3b3257adcf04195b7d117ab312efa4ed1a38a75f';
const INDEX_SHA256 = '970f2870a1e56603b6be75225de1ec9c0a6f0ec91dfb16bea73849c0155bac1b';
const DEFECTS = ['boundaryEdges', 'nonmanifoldEdges', 'inconsistentWindingEdges',
  'noncyclicVertexLinks', 'degenerateTriangles', 'duplicateTriangles'] as const;
const TOTAL_TOPOLOGY = Object.freeze({ boundaryEdges: 1411, nonmanifoldEdges: 2285,
  inconsistentWindingEdges: 11, noncyclicVertexLinks: 4139, degenerateTriangles: 0, duplicateTriangles: 0 });

// Copied/adapted EMA147 source metadata: Ruffins et al., 2017, CC BY 4.0,
// doi:10.7488/ds/2167. Original validation code is MIT. Rows follow the exact
// sorted filename inventory independently checked by buildEma147Groups.
// Columns: vertices, triangles, exact label-volume index or null, boundary
// edges, nonmanifold edges, winding conflicts, noncyclic links, components.
// Degenerate and duplicate triangle counts are zero for every reviewed region.
type ReviewedNumbers = readonly [number, number, number | null, number, number, number, number, number];
const REVIEWED: readonly ReviewedNumbers[] = Object.freeze(([
  [9854, 19999, 16, 71, 194, 0, 296, 6],
  [3004, 6002, 49, 9, 7, 0, 15, 1],
  [5789, 11744, 19, 120, 150, 0, 279, 7],
  [3006, 5992, 36, 5, 51, 0, 73, 17],
  [50, 92, 39, 0, 0, 0, 0, 2],
  [310, 616, 51, 0, 0, 0, 0, 1],
  [5839, 11673, 64, 142, 96, 1, 236, 8],
  [821, 1637, 33, 4, 7, 0, 11, 2],
  [753, 1502, 52, 0, 0, 0, 0, 1],
  [9975, 20000, 59, 142, 150, 1, 282, 2],
  [620, 1250, 65, 0, 12, 0, 12, 1],
  [3046, 6077, 21, 17, 15, 0, 32, 3],
  [4684, 9408, 31, 32, 49, 0, 82, 1],
  [1292, 2608, null, 5, 10, 0, 16, 1],
  [2346, 4695, 54, 15, 15, 0, 31, 1],
  [381, 754, 38, 0, 0, 0, 0, 2],
  [2658, 5358, 42, 11, 15, 0, 30, 2],
  [732, 1390, 44, 0, 0, 0, 5, 19],
  [1661, 3318, 53, 0, 0, 0, 0, 1],
  [126, 240, null, 0, 0, 0, 0, 3],
  [506, 1044, 40, 4, 10, 0, 22, 3],
  [22, 40, 48, 0, 0, 0, 0, 1],
  [2153, 4270, 61, 38, 17, 0, 56, 4],
  [1557, 3123, 20, 15, 19, 1, 37, 1],
  [9356, 19849, 23, 220, 248, 6, 618, 1],
  [9881, 20000, null, 66, 128, 0, 219, 2],
  [5942, 11866, null, 63, 52, 0, 122, 5],
  [8934, 18500, 27, 24, 110, 0, 190, 7],
  [3060, 6115, 28, 12, 11, 0, 23, 1],
  [1653, 3304, 30, 2, 3, 0, 5, 1],
  [237, 462, 34, 0, 0, 0, 0, 3],
  [5108, 10216, 35, 0, 2, 0, 3, 1],
  [573, 1142, 46, 0, 0, 0, 0, 1],
  [492, 976, 57, 0, 0, 0, 0, 2],
  [673, 1346, 58, 1, 4, 0, 6, 2],
  [220, 436, 4, 0, 0, 0, 0, 1],
  [8647, 17596, null, 34, 157, 0, 223, 3],
  [4737, 9440, 72, 91, 82, 1, 186, 18],
  [7698, 15746, 8, 32, 127, 0, 190, 1],
  [1652, 3333, 29, 15, 30, 0, 48, 1],
  [30, 56, null, 0, 0, 0, 0, 1],
  [444, 879, 37, 0, 3, 0, 3, 3],
  [370, 732, 41, 0, 0, 0, 0, 2],
  [3499, 7031, 45, 117, 190, 0, 305, 7],
  [801, 1578, null, 8, 18, 0, 34, 15],
  [319, 636, 63, 0, 6, 0, 6, 2],
  [6791, 13529, 1, 1, 15, 0, 25, 19],
  [7672, 15420, 71, 15, 47, 0, 77, 2],
  [854, 1700, 76, 0, 0, 0, 0, 2],
  [215, 422, null, 0, 0, 0, 0, 2],
  [1987, 4010, 56, 2, 9, 0, 21, 2],
  [870, 1741, 60, 1, 4, 0, 6, 1],
  [1034, 2063, 62, 5, 4, 0, 9, 1],
  [662, 1320, 75, 2, 2, 0, 4, 1],
  [1118, 2228, 50, 0, 0, 0, 0, 2],
  [365, 722, 17, 0, 0, 0, 0, 2],
  [398, 792, 18, 0, 0, 0, 0, 1],
  [115, 233, 26, 1, 3, 0, 5, 1],
  [1305, 2645, 43, 1, 7, 0, 14, 2],
  [807, 1610, 47, 0, 0, 0, 0, 1],
  [1229, 2484, 69, 10, 23, 0, 35, 1],
  [470, 963, 70, 0, 39, 0, 39, 3],
  [168, 332, 73, 0, 0, 0, 0, 1],
  [2363, 4729, 74, 4, 6, 0, 11, 2],
  [854, 1701, 9, 1, 2, 0, 3, 2],
  [1089, 2172, 10, 0, 1, 0, 2, 2],
  [1947, 3907, 11, 14, 30, 0, 45, 2],
  [534, 1056, 13, 0, 0, 0, 0, 3],
  [1410, 2820, 14, 5, 13, 0, 18, 2],
  [1665, 3327, 15, 6, 11, 0, 17, 2],
  [1296, 2587, 5, 7, 10, 0, 16, 2],
  [217, 426, 67, 0, 0, 0, 0, 2],
  [926, 1858, 68, 6, 16, 0, 21, 1],
  [1357, 2708, 2, 0, 1, 0, 2, 2],
  [148, 292, 6, 0, 0, 0, 0, 1],
  [426, 866, 22, 0, 24, 0, 24, 2],
  [9976, 19991, null, 15, 30, 1, 49, 1],
] satisfies ReviewedNumbers[]).map((row) => Object.freeze(row)));

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Summarize reviewed source diagnostics without assigning units or anatomy. */
export function buildNativeSurfaceSummary(atlas: Atlas, structureId: string): NativeSurfaceSummary | null {
  const frame = field(atlas, 'coordinateFrame'), source = field(atlas, 'source');
  const statistics = field(atlas, 'statistics'), structures = field(atlas, 'structures');
  if (field(atlas, 'id') !== 'ema147-native-v1' || field(atlas, 'assetFormat') !== 'ply-native-v1'
      || field(atlas, 'assetUrl') !== '/atlas-ema147/ema147-native.ply'
      || field(frame, 'id') !== 'emouseatlas-ema147-stl-native-v1'
      || field(frame, 'sourceUnits') !== 'unknown' || field(frame, 'assetUnits') !== 'unknown'
      || field(frame, 'sourceToAssetScale') !== 1 || field(frame, 'unitsVerified') !== false
      || field(frame, 'anatomicalOrientationVerified') !== false || field(frame, 'physicalCalibrationVerified') !== false
      || field(frame, 'registrationToDigimouse') !== null
      || field(source, 'id') !== 'emouseatlas-ema147-2017' || field(source, 'archiveSha256') !== ARCHIVE_SHA256
      || field(source, 'license') !== 'CC-BY-4.0' || field(source, 'licenseUrl') !== 'https://creativecommons.org/licenses/by/4.0/'
      || field(source, 'anatomyIndexSha256') !== INDEX_SHA256
      || field(statistics, 'assetSha256') !== ASSET_SHA256 || field(statistics, 'assetBytes') !== 10079275
      || field(statistics, 'glbSha256') !== undefined || field(statistics, 'glbBytes') !== undefined
      || field(statistics, 'structures') !== 77 || field(statistics, 'vertices') !== 185779
      || field(statistics, 'triangles') !== 374725 || field(statistics, 'closedManifoldSourceRegions') !== 23
      || !Array.isArray(structures) || structures.length !== REVIEWED.length || typeof structureId !== 'string') return null;

  let vertexOffset = 0, triangleOffset = 0;
  let selected: NativeSurfaceSummary | null = null;
  const inventory: Structure[] = [];
  for (let index = 0; index < REVIEWED.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(structures, String(index));
    const structure: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    const [vertices, triangles, sourceVolumeLabelIndex, boundaryEdges, nonmanifoldEdges,
      inconsistentWindingEdges, noncyclicVertexLinks, components] = REVIEWED[index];
    const expectedTopology = { boundaryEdges, nonmanifoldEdges, inconsistentWindingEdges,
      noncyclicVertexLinks, components, degenerateTriangles: 0, duplicateTriangles: 0 };
    const id = field(structure, 'id'), sourceFile = field(structure, 'sourceFile');
    if (typeof id !== 'string' || typeof sourceFile !== 'string') return null;
    const sourceIdentity = /^ema147:(EMAPA:[1-9]\d*)$/.exec(id);
    const sourceEMAPAId = sourceIdentity?.[1] ?? null;
    if (!sourceIdentity && id !== 'ema147:reference') return null;
    const geometry = field(structure, 'geometry'), topology = field(geometry, 'sourceTopology');
    const systems = field(structure, 'systems');
    // Validate fields read by buildEma147Groups before calling its inventory gate.
    if (field(structure, 'sourceRegionIndex') !== index
        || field(structure, 'sourceLabel') !== sourceFile.slice('Surfaces/'.length, -4)
        || !Array.isArray(systems) || systems.length !== 0
        || (field(structure, 'sourceEMAPAId') ?? null) !== sourceEMAPAId
        || (field(structure, 'sourceVolumeLabelIndex') ?? null) !== sourceVolumeLabelIndex
        || field(geometry, 'vertexOffset') !== vertexOffset || field(geometry, 'triangleOffset') !== triangleOffset
        || field(geometry, 'vertices') !== vertices || field(geometry, 'triangles') !== triangles
        || !DEFECTS.every((key) => natural(field(topology, key)) && field(topology, key) === expectedTopology[key])
        || !natural(field(topology, 'components')) || (field(topology, 'components') as number) < 1
        || field(topology, 'components') !== components) return null;
    inventory.push({ id, sourceFile, sourceRegionIndex: index, name: '', meshNode: id, systems: [],
      sourceLabel: sourceFile.slice('Surfaces/'.length, -4) } as Structure);
    vertexOffset += vertices; triangleOffset += triangles;
    if (id === structureId) selected = Object.freeze({
      sourceFile, sourceRegionIndex: index, sourceEMAPAId, sourceVolumeLabelIndex, vertices, triangles,
      topology: Object.freeze({
        ...expectedTopology, closed: DEFECTS.every((key) => expectedTopology[key] === 0),
      }),
    });
  }
  if (!selected || !DEFECTS.every((key) => field(field(statistics, 'sourceTopology'), key) === TOTAL_TOPOLOGY[key])) return null;
  // The inventory gate receives only validated own data, not input accessors or
  // overridden array methods. It supplies no new anatomical classification.
  const inventoryAtlas: Atlas = { id: 'ema147-native-v1', title: '', assetUrl: '/atlas-ema147/ema147-native.ply',
    assetFormat: 'ply-native-v1', coordinateFrame: { id: 'emouseatlas-ema147-stl-native-v1', sourceUnits: 'unknown', sourceToAssetScale: 1 },
    source: { archiveSha256: ARCHIVE_SHA256, license: 'CC-BY-4.0' }, structures: inventory, statistics: {}, limitations: [] };
  return buildEma147Groups(inventoryAtlas).ok ? selected : null;
}
