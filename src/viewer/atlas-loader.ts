import type * as THREE from 'three';
import type { Atlas } from '../domain/types';
import { atlasAssetBytes, atlasAssetFormat, atlasAssetSha256 } from '../domain/atlas-asset';
import { fetchBoundGlb } from './region-detail';
import { fetchBoundAnatomyBytes } from './asset-fetch';

/** Load one reviewed reference without assigning scale or registration to another. */
export async function loadAtlasScene(atlas: Atlas, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<THREE.Group> {
  const format = atlasAssetFormat(atlas), bytes = atlasAssetBytes(atlas), hash = atlasAssetSha256(atlas);
  if (!format || bytes === null || !hash) throw new Error('The anatomical reference has invalid asset binding.');
  if (format === 'ply-native-v1') {
    const content = await fetchBoundAnatomyBytes(atlas.assetUrl, bytes, hash, signal, 'ply', fetcher);
    const { parseNativePly } = await import('./native-ply');
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return parseNativePly(content, atlas);
  }
  const content = await fetchBoundGlb(atlas.assetUrl, bytes, hash, signal, fetcher);
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return (await new GLTFLoader().parseAsync(content, '')).scene;
}
