import type * as THREE from 'three';
import { isSourceTraceAsset, isSourceTraceAtlas, type SourceTraceAsset } from '../domain/source-trace';
import type { Atlas } from '../domain/types';
import { buildParentLinkedTraceScene } from './local-trace-scene';

/** Draw only the reviewed source sample-to-parent lines; radius fields create no surface or measured thickness. */
export function buildSourceTraceScene(atlas: Atlas, asset: SourceTraceAsset): THREE.Group {
  if (!isSourceTraceAsset(asset) || atlas !== asset.atlas || !isSourceTraceAtlas(atlas)) {
    throw new Error('A parser-produced bundled trace and its exact source atlas are required.');
  }
  return buildParentLinkedTraceScene(atlas, asset.nodes);
}
