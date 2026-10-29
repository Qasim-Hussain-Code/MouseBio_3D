import type * as THREE from 'three';
import type { Atlas } from '../domain/types';
import type { LocalTraceAsset } from '../domain/local-trace';
import { atlasAssetBytes, atlasAssetFormat, atlasAssetSha256 } from '../domain/atlas-asset';
import { fetchBoundGlb } from './region-detail';
import { fetchBoundAnatomyBytes } from './asset-fetch';

/** Load one reviewed reference without assigning scale or registration to another. */
export async function loadAtlasScene(atlas: Atlas, signal: AbortSignal, fetcher: typeof fetch = fetch, localTrace?: LocalTraceAsset): Promise<THREE.Group> {
  const format = atlasAssetFormat(atlas), bytes = atlasAssetBytes(atlas), hash = atlasAssetSha256(atlas);
  if (!format || bytes === null || !hash) throw new Error('The anatomical reference has invalid asset binding.');
  if (format === 'local-trace-v1') {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!localTrace) throw new Error('Open the original local trace file before displaying this reference.');
    const { buildLocalTraceScene } = await import('./local-trace-scene');
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return buildLocalTraceScene(atlas, localTrace);
  }
  if (format === 'swc-native-v1') {
    const { isSourceTraceAtlas, parseSourceTrace } = await import('../domain/source-trace');
    if (!isSourceTraceAtlas(atlas)) throw new Error('The neuronal source manifest does not match the reviewed reference.');
    const content = await fetchBoundAnatomyBytes(atlas.assetUrl, bytes, hash, signal, 'txt', fetcher);
    const result = await parseSourceTrace(content, atlas);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!result.ok || !result.asset) throw new Error('The neuronal source data do not match the reviewed reference.');
    const { buildSourceTraceScene } = await import('./source-trace-scene');
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return buildSourceTraceScene(atlas, result.asset);
  }
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
