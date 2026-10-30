import type { Atlas } from '../domain/types';
import { atlasAssetBytes, atlasAssetFormat, atlasAssetSha256 } from '../domain/atlas-asset';
import { isSourcePolylineAtlas, parseSourcePolyline, type SourcePolylineAsset } from '../domain/source-polyline';
import { fetchBoundAnatomyBytes } from './asset-fetch';

// A live parser-owned asset can be reused without retaining a second strong copy.
const retainedAssets = new WeakMap<Atlas, WeakRef<SourcePolylineAsset>>();

/** Read the checked local derivative for rendering or explicit source-path inspection. */
export async function loadSourcePolylineAsset(atlas: Atlas, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<SourcePolylineAsset> {
  const bytes = atlasAssetBytes(atlas), hash = atlasAssetSha256(atlas);
  if (atlasAssetFormat(atlas) !== 'polyline-native-v1' || !isSourcePolylineAtlas(atlas) || bytes === null || !hash) {
    throw new Error('The polyline source manifest does not match the reviewed reference.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const retained = retainedAssets.get(atlas)?.deref();
  if (retained?.atlas === atlas) return retained;
  const content = await fetchBoundAnatomyBytes(atlas.assetUrl, bytes, hash, signal, 'json', fetcher);
  const result = await parseSourcePolyline(content, atlas);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!result.ok || !result.asset) throw new Error('The polyline source data do not match the reviewed reference.');
  retainedAssets.set(atlas, new WeakRef(result.asset));
  return result.asset;
}
