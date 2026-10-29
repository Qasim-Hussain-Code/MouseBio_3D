import type { Atlas } from '../domain/types';
import { atlasAssetBytes, atlasAssetFormat, atlasAssetSha256 } from '../domain/atlas-asset';
import { isSourceTraceAtlas, parseSourceTrace, type SourceTraceAsset } from '../domain/source-trace';
import { fetchBoundAnatomyBytes } from './asset-fetch';

/** Read the reviewed bundled numeric source for rendering or explicit sample inspection. */
export async function loadSourceTraceAsset(atlas: Atlas, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<SourceTraceAsset> {
  const bytes = atlasAssetBytes(atlas), hash = atlasAssetSha256(atlas);
  if (atlasAssetFormat(atlas) !== 'swc-native-v1' || !isSourceTraceAtlas(atlas) || bytes === null || !hash) {
    throw new Error('The neuronal source manifest does not match the reviewed reference.');
  }
  const content = await fetchBoundAnatomyBytes(atlas.assetUrl, bytes, hash, signal, 'txt', fetcher);
  const result = await parseSourceTrace(content, atlas);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!result.ok || !result.asset) throw new Error('The neuronal source data do not match the reviewed reference.');
  return result.asset;
}
