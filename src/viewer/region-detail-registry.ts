import type { Atlas } from '../domain/types';

const MAX_BYTES = 80 * 1024 * 1024;
type Bounds = readonly [readonly number[], readonly number[]];
export interface RegionDetailAsset {
  readonly atlasId: string;
  readonly atlasAssetSha256: string;
  readonly structureId: string;
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
export function buildRegionDetailAssets(input: unknown, atlas: Atlas): { ok: boolean; assets: RegionDetailAsset[]; errors: string[] } {
  const errors: string[] = [];
  const fail = (message: string) => ({ ok: false, assets: [], errors: [message] });
  if (!record(input) || input.schemaVersion !== 'mousebio.volume-detail-index.v1' || input.atlasId !== atlas.id
      || !record(input.coordinateFrame) || input.coordinateFrame.id !== atlas.coordinateFrame.id
      || !record(input.source) || input.source.archiveSha256 !== atlas.source.archiveSha256
      || input.source.license !== atlas.source.license || !checksum(atlas.statistics.glbSha256)) {
    return fail('Regional detail does not match this atlas, coordinate frame or source provenance.');
  }
  if (!Array.isArray(input.assets) || input.assets.length > atlas.structures.length || !Array.isArray(input.unavailable)) {
    return fail('Regional detail requires an explicit bounded asset and unavailable-region inventory.');
  }
  const known = new Set(atlas.structures.map((structure) => structure.id));
  const seen = new Set<string>();
  const assets: RegionDetailAsset[] = [];
  for (const candidate of input.assets) {
    if (!record(candidate) || Object.keys(candidate).some((key) => !['structureId', 'assetUrl', 'coordinateFrameId',
      'glbBytes', 'glbSha256', 'processingVoxelSpacingMm', 'geometry'].includes(key))
      || typeof candidate.structureId !== 'string' || !known.has(candidate.structureId) || seen.has(candidate.structureId)
      || candidate.coordinateFrameId !== atlas.coordinateFrame.id || !isLocalGlbPath(candidate.assetUrl)
      || !candidate.assetUrl.startsWith('/atlas-volume/detail/') || !checksum(candidate.glbSha256)
      || !Number.isSafeInteger(candidate.glbBytes) || (candidate.glbBytes as number) < 28 || (candidate.glbBytes as number) > MAX_BYTES
      || !vector(candidate.processingVoxelSpacingMm) || !candidate.processingVoxelSpacingMm.every((spacing) => spacing > 0)
      || !validGeometry(candidate.geometry)) {
      errors.push('A detail record has invalid identity, local path, frame, checksum, size or geometry.');
      continue;
    }
    seen.add(candidate.structureId);
    assets.push(Object.freeze({ atlasId: atlas.id, atlasAssetSha256: atlas.statistics.glbSha256 as string,
      structureId: candidate.structureId, coordinateFrameId: candidate.coordinateFrameId as string,
      assetUrl: candidate.assetUrl, glbBytes: candidate.glbBytes as number, glbSha256: candidate.glbSha256,
      processingVoxelSpacingMm: Object.freeze([...candidate.processingVoxelSpacingMm]),
      geometry: Object.freeze({ vertices: candidate.geometry.vertices, triangles: candidate.geometry.triangles,
        boundsMeters: Object.freeze(candidate.geometry.boundsMeters.map((corner) => Object.freeze([...corner]))) as unknown as Bounds }),
    }));
  }
  for (const entry of input.unavailable) {
    if (!record(entry) || typeof entry.structureId !== 'string' || !known.has(entry.structureId) || seen.has(entry.structureId)
        || typeof entry.reason !== 'string' || !entry.reason.trim()) errors.push('Unavailable detail regions require unique known IDs and reasons.');
    else seen.add(entry.structureId);
  }
  if (seen.size !== known.size) errors.push('Every reference region must have a detail asset or an explicit unavailable record.');
  return errors.length ? { ok: false, assets: [], errors } : { ok: true, assets, errors };
}

export function assertRegionDetailBinding(asset: RegionDetailAsset, atlas: Atlas) {
  if (asset.atlasId !== atlas.id || asset.atlasAssetSha256 !== atlas.statistics.glbSha256
      || asset.coordinateFrameId !== atlas.coordinateFrame.id || !atlas.structures.some((structure) => structure.id === asset.structureId)
      || !isLocalGlbPath(asset.assetUrl) || !checksum(asset.glbSha256) || !Number.isSafeInteger(asset.glbBytes)
      || asset.glbBytes < 28 || asset.glbBytes > MAX_BYTES || !validGeometry(asset.geometry)) {
    throw new Error('The requested detail is not bound to this reference and region.');
  }
}
