import type { Atlas } from '../domain/types';

const MAX_BYTES = 80 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const REGISTERED_LEVELS = {
  'fine-020': { spacing: 0.2, folder: '/atlas-volume/detail/' },
  'source-010': { spacing: 0.1, folder: '/atlas-volume/native-010/' },
} as const;
type Bounds = readonly [readonly number[], readonly number[]];
/** A processing level changes surface sampling, not the represented biological scale. */
export interface RegionDetailLevel {
  readonly id: string;
  readonly title: string;
  readonly processingVoxelSpacingMm: readonly number[];
  readonly description: string;
  readonly limitations: readonly string[];
}
export interface RegionDetailAsset {
  readonly atlasId: string;
  readonly atlasAssetSha256: string;
  readonly structureId: string;
  readonly levelId: string;
  readonly coordinateFrameId: string;
  readonly assetUrl: string;
  readonly glbBytes: number;
  readonly glbSha256: string;
  readonly processingVoxelSpacingMm: readonly number[];
  readonly geometry: { readonly vertices: number; readonly triangles: number; readonly boundsMeters: Bounds };
}
export type RegionDetailStatus = {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  structureId: string | null;
  assetSha256?: string;
  message?: string;
  triangles?: number;
  processingVoxelSpacingMm?: readonly number[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function vector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every((number) => typeof number === 'number' && Number.isFinite(number));
}
function checksum(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 4096 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}
function registeredLevel(value: unknown): value is keyof typeof REGISTERED_LEVELS {
  return typeof value === 'string' && Object.hasOwn(REGISTERED_LEVELS, value);
}
function levelSpacing(levelId: unknown, value: unknown): value is number[] {
  return registeredLevel(levelId) && vector(value) && value.every((spacing) => spacing === REGISTERED_LEVELS[levelId].spacing);
}
function levelPath(levelId: unknown, value: unknown): value is string {
  return registeredLevel(levelId) && isLocalGlbPath(value) && value.startsWith(REGISTERED_LEVELS[levelId].folder);
}
function levelRegion(levelId: unknown, structureId: unknown, assetUrl: unknown): boolean {
  if (!registeredLevel(levelId) || typeof structureId !== 'string') return false;
  const match = /^digimouse-volume:([1-9][0-9]*)$/.exec(structureId);
  if (!match) return false;
  const label = Number(match[1]);
  return (levelId === 'fine-020' ? label >= 3 && label <= 21 : label === 12 || label === 20)
    && assetUrl === `${REGISTERED_LEVELS[levelId].folder}region-${label}.glb`;
}
function pair(structureId: string, levelId: string): string { return `${structureId}\0${levelId}`; }
export function isLocalGlbPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/[A-Za-z0-9_./-]+\.glb$/.test(value) && !value.startsWith('//')
    && value.slice(1).split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
function validGeometry(value: unknown): value is RegionDetailAsset['geometry'] {
  if (!record(value) || Object.keys(value).some((key) => !['vertices', 'triangles', 'boundsMeters'].includes(key))) return false;
  const bounds = value.boundsMeters;
  return Number.isSafeInteger(value.vertices) && (value.vertices as number) > 0 && (value.vertices as number) <= 10_000_000
    && Number.isSafeInteger(value.triangles) && (value.triangles as number) > 0 && (value.triangles as number) <= 5_000_000
    && Array.isArray(bounds) && bounds.length === 2 && vector(bounds[0]) && vector(bounds[1])
    && bounds[0].every((minimum, axis) => minimum < bounds[1][axis]);
}

/** Validate the shipped detail registry against its own complete reference, without remapping IDs. */
export function buildRegionDetailAssets(input: unknown, atlas: Atlas): { ok: boolean; assets: RegionDetailAsset[]; levels: RegionDetailLevel[]; errors: string[] } {
  const errors: string[] = [];
  const fail = (message: string) => ({ ok: false, assets: [], levels: [], errors: [message] });
  if (!record(input) || !['mousebio.volume-detail-index.v1', 'mousebio.volume-detail-index.v2'].includes(input.schemaVersion as string) || input.atlasId !== atlas.id
      || !record(input.coordinateFrame) || input.coordinateFrame.id !== atlas.coordinateFrame.id
      || !record(input.source) || input.source.archiveSha256 !== atlas.source.archiveSha256
      || !checksum(atlas.source.archiveSha256) || input.source.id !== atlas.source.id
      || input.source.license !== atlas.source.license || !nonempty(atlas.source.license)
      || input.source.licenseUrl !== atlas.source.licenseUrl || !nonempty(atlas.source.licenseUrl)
      || !checksum(atlas.statistics.glbSha256)) {
    return fail('Regional detail does not match this atlas, coordinate frame or source provenance.');
  }
  const legacy = input.schemaVersion === 'mousebio.volume-detail-index.v1';
  const declarations = legacy ? [{ id: 'fine-020', title: '0.2 mm processing', processingVoxelSpacingMm: [0.2, 0.2, 0.2],
    description: 'Regional surfaces at the declared 0.2 mm processing spacing.',
    limitations: ['Processing spacing does not add anatomical structures or establish biological resolution.'] }] : input.levels;
  if (!Array.isArray(declarations) || declarations.length !== (legacy ? 1 : 2)) return fail('Regional detail requires the registered processing-level inventory.');
  const levels: RegionDetailLevel[] = [];
  const levelIds = new Set<string>();
  for (const entry of declarations) {
    if (!record(entry) || Object.keys(entry).some((key) => !['id', 'title', 'processingVoxelSpacingMm', 'description', 'limitations'].includes(key))
        || !registeredLevel(entry.id) || levelIds.has(entry.id) || !levelSpacing(entry.id, entry.processingVoxelSpacingMm)
        || !nonempty(entry.title) || !nonempty(entry.description) || !Array.isArray(entry.limitations)
        || !entry.limitations.length || entry.limitations.length > 32 || !entry.limitations.every(nonempty)) {
      return fail('A processing level has invalid identity, spacing or scientific limitations.');
    }
    levelIds.add(entry.id);
    levels.push(Object.freeze({ id: entry.id, title: entry.title, processingVoxelSpacingMm: Object.freeze([...entry.processingVoxelSpacingMm]),
      description: entry.description, limitations: Object.freeze([...entry.limitations]) }));
  }
  if (!Array.isArray(input.assets) || input.assets.length > atlas.structures.length * levels.length || !Array.isArray(input.unavailable)
      || input.unavailable.length > atlas.structures.length * levels.length) {
    return fail('Regional detail requires an explicit bounded asset and unavailable-region inventory.');
  }
  const known = new Set(atlas.structures.map((structure) => structure.id));
  if (known.size !== atlas.structures.length) return fail('The reference source inventory contains duplicate IDs.');
  const seen = new Set<string>();
  const urls = new Set<string>();
  const assets: RegionDetailAsset[] = [];
  for (const candidate of input.assets) {
    const levelId = legacy ? 'fine-020' : record(candidate) ? candidate.levelId : undefined;
    if (!record(candidate) || Object.keys(candidate).some((key) => !['structureId', 'assetUrl', 'coordinateFrameId',
      'glbBytes', 'glbSha256', 'processingVoxelSpacingMm', 'geometry', ...(legacy ? [] : ['levelId'])].includes(key))
      || typeof candidate.structureId !== 'string' || !known.has(candidate.structureId) || !registeredLevel(levelId)
      || !levelIds.has(levelId) || seen.has(pair(candidate.structureId, levelId))
      || candidate.coordinateFrameId !== atlas.coordinateFrame.id || !levelPath(levelId, candidate.assetUrl)
      || !levelRegion(levelId, candidate.structureId, candidate.assetUrl)
      || urls.has(candidate.assetUrl) || !checksum(candidate.glbSha256)
      || !Number.isSafeInteger(candidate.glbBytes) || (candidate.glbBytes as number) < 28 || (candidate.glbBytes as number) > MAX_BYTES
      || !levelSpacing(levelId, candidate.processingVoxelSpacingMm)
      || !validGeometry(candidate.geometry)) {
      errors.push('A detail record has invalid identity, local path, frame, checksum, size or geometry.');
      continue;
    }
    seen.add(pair(candidate.structureId, levelId));
    urls.add(candidate.assetUrl);
    assets.push(Object.freeze({ atlasId: atlas.id, atlasAssetSha256: atlas.statistics.glbSha256 as string,
      structureId: candidate.structureId, levelId, coordinateFrameId: candidate.coordinateFrameId as string,
      assetUrl: candidate.assetUrl, glbBytes: candidate.glbBytes as number, glbSha256: candidate.glbSha256,
      processingVoxelSpacingMm: Object.freeze([...candidate.processingVoxelSpacingMm]),
      geometry: Object.freeze({ vertices: candidate.geometry.vertices, triangles: candidate.geometry.triangles,
        boundsMeters: Object.freeze(candidate.geometry.boundsMeters.map((corner) => Object.freeze([...corner]))) as unknown as Bounds }),
    }));
  }
  for (const entry of input.unavailable) {
    const levelId = legacy ? 'fine-020' : record(entry) ? entry.levelId : undefined;
    if (!record(entry) || Object.keys(entry).some((key) => !['structureId', 'reason', ...(legacy ? [] : ['levelId'])].includes(key))
        || typeof entry.structureId !== 'string' || !known.has(entry.structureId) || !registeredLevel(levelId) || !levelIds.has(levelId)
        || seen.has(pair(entry.structureId, levelId)) || !nonempty(entry.reason)) errors.push('Unavailable detail regions require unique known region-level pairs and reasons.');
    else seen.add(pair(entry.structureId, levelId));
  }
  if (seen.size !== known.size * levels.length) errors.push('Every reference region and processing level must have an asset or an explicit unavailable record.');
  const availableIds = new Set(assets.map((asset) => asset.structureId));
  if (!Array.isArray(input.structures) || input.structures.length !== availableIds.size
      || input.structures.some((entry) => !record(entry) || typeof entry.id !== 'string' || !availableIds.has(entry.id))
      || new Set(input.structures.map((entry) => record(entry) ? entry.id : undefined)).size !== availableIds.size
      || !record(input.statistics) || input.statistics.structures !== availableIds.size
      || (!legacy && input.statistics.assets !== assets.length)
      || input.statistics.glbBytesTotal !== assets.reduce((total, asset) => total + asset.glbBytes, 0)) {
    errors.push('Regional detail structures and size statistics must match the asset inventory.');
  }
  if (assets.reduce((total, asset) => total + asset.glbBytes, 0) > MAX_TOTAL_BYTES) errors.push('Regional detail exceeds the total registered asset budget.');
  return errors.length ? { ok: false, assets: [], levels: [], errors } : { ok: true, assets, levels, errors };
}

export function assertRegionDetailBinding(asset: RegionDetailAsset, atlas: Atlas) {
  if (asset.atlasId !== atlas.id || asset.atlasAssetSha256 !== atlas.statistics.glbSha256
      || asset.coordinateFrameId !== atlas.coordinateFrame.id || !atlas.structures.some((structure) => structure.id === asset.structureId)
      || !levelPath(asset.levelId, asset.assetUrl) || !levelRegion(asset.levelId, asset.structureId, asset.assetUrl)
      || !levelSpacing(asset.levelId, asset.processingVoxelSpacingMm)
      || !checksum(asset.glbSha256) || !Number.isSafeInteger(asset.glbBytes)
      || asset.glbBytes < 28 || asset.glbBytes > MAX_BYTES || !validGeometry(asset.geometry)) {
    throw new Error('The requested detail is not bound to this reference and region.');
  }
}
