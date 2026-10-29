import type { Atlas } from './types';

export type AtlasAssetFormat = 'glb' | 'ply-native-v1' | 'local-trace-v1' | 'swc-native-v1';

/** A format declaration never supplies a physical unit or registration. */
export function atlasAssetFormat(atlas: Atlas): AtlasAssetFormat | null {
  return atlas.assetFormat === undefined || atlas.assetFormat === 'glb' ? 'glb'
    : atlas.assetFormat === 'ply-native-v1' ? 'ply-native-v1' : atlas.assetFormat === 'local-trace-v1' ? 'local-trace-v1' : atlas.assetFormat === 'swc-native-v1' ? 'swc-native-v1' : null;
}

export function atlasAssetSha256(atlas: Atlas): string | null {
  const format = atlasAssetFormat(atlas);
  const statistics = atlas.statistics;
  if (!statistics || !format) return null;
  if (format !== 'glb' && (statistics.glbSha256 !== undefined || statistics.glbBytes !== undefined)) return null;
  const value = format === 'glb' ? statistics.glbSha256 : statistics.assetSha256;
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function atlasAssetBytes(atlas: Atlas): number | null {
  const format = atlasAssetFormat(atlas);
  const value = format === 'glb' ? atlas.statistics?.glbBytes : format ? atlas.statistics?.assetBytes : undefined;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 80 * 1024 * 1024 ? value : null;
}
