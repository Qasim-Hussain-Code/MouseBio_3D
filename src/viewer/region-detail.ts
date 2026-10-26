import * as THREE from 'three';
import type { Atlas } from '../domain/types';
import { assertRegionDetailBinding, isLocalGlbPath, type RegionDetailAsset, type RegionDetailStatus } from './region-detail-registry';
export { buildRegionDetailAssets, isLocalGlbPath } from './region-detail-registry';
export type { RegionDetailAsset, RegionDetailStatus } from './region-detail-registry';

const MAX_BYTES = 80 * 1024 * 1024;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function checksum(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
/** Refuse external resources before GLTFLoader can resolve them. */
export function inspectInternalGlb(bytes: ArrayBuffer): Record<string, unknown> {
  const view = new DataView(bytes);
  if (bytes.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
      || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Invalid internal GLB header.');
  const jsonLength = view.getUint32(12, true);
  if (jsonLength % 4 || jsonLength > 1024 * 1024 || jsonLength + 28 > bytes.byteLength) throw new Error('Invalid GLB JSON length.');
  const document: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes, 20, jsonLength)));
  if (!record(document) || !record(document.asset) || document.asset.version !== '2.0'
      || !Array.isArray(document.buffers) || document.buffers.length !== 1
      || !record(document.buffers[0]) || !Number.isSafeInteger(document.buffers[0].byteLength)
      || (document.buffers[0].byteLength as number) < 0
      || ['images', 'textures', 'skins', 'animations', 'extensionsRequired', 'extensionsUsed'].some((key) =>
        document[key] !== undefined && (!Array.isArray(document[key]) || (document[key] as unknown[]).length > 0))) {
    throw new Error('Only self-contained static GLBs without external resources are supported.');
  }
  const rejectUris = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(rejectUris); return; }
    if (record(value)) for (const [key, nested] of Object.entries(value)) {
      if (key === 'uri' || key === 'extensions') throw new Error('GLB external resources and extensions are not permitted.');
      rejectUris(nested);
    }
  };
  rejectUris(document);
  const binaryOffset = 20 + jsonLength;
  if (view.getUint32(binaryOffset + 4, true) !== 0x004e4942 || view.getUint32(binaryOffset, true) % 4
      || binaryOffset + 8 + view.getUint32(binaryOffset, true) !== bytes.byteLength
      || (document.buffers[0].byteLength as number) > view.getUint32(binaryOffset, true)
      || view.getUint32(binaryOffset, true) - (document.buffers[0].byteLength as number) > 3) throw new Error('Invalid GLB binary bounds.');
  return document;
}

/** Bounded same-origin request with decoded byte and SHA-256 checks. No research data is sent. */
export async function fetchBoundGlb(url: string, expectedBytes: number, expectedHash: string, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  if (!isLocalGlbPath(url) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 28 || expectedBytes > MAX_BYTES
      || !checksum(expectedHash)) throw new Error('Invalid local anatomical asset binding.');
  const response = await fetcher(url, { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok || response.type === 'opaque' || !response.body) throw new Error('The local anatomical asset could not be read.');
  const bytes = new Uint8Array(expectedBytes);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expectedBytes) throw new Error('The anatomical asset exceeds its declared byte limit.');
      bytes.set(value, offset); offset += value.byteLength;
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (offset !== expectedBytes) throw new Error('The anatomical asset byte count does not match its registry.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('The anatomical asset checksum does not match its registry.');
  inspectInternalGlb(bytes.buffer);
  return bytes.buffer;
}

export async function loadRegionDetailGeometry(asset: RegionDetailAsset, atlas: Atlas, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<THREE.BufferGeometry> {
  assertRegionDetailBinding(asset, atlas);
  const bytes = await fetchBoundGlb(asset.assetUrl, asset.glbBytes, asset.glbSha256, signal, fetcher);
  const document = inspectInternalGlb(bytes);
  if (!Array.isArray(document.nodes) || document.nodes.length !== 1 || !record(document.nodes[0])
      || !record(document.nodes[0].extras) || document.nodes[0].extras.structureId !== asset.structureId) {
    throw new Error('The detail GLB contains an unexpected anatomical region.');
  }
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const model = await new GLTFLoader().parseAsync(bytes, '');
  const meshes: THREE.Mesh[] = [];
  model.scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
  try {
    if (meshes.length !== 1) throw new Error('A detail file must contain exactly one surface region.');
    const mesh = meshes[0];
    mesh.updateWorldMatrix(true, false);
    if (mesh.userData.structureId !== asset.structureId || !mesh.matrixWorld.equals(new THREE.Matrix4())) {
      throw new Error('The detail region has an unsupported identity or coordinate transform.');
    }
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), indices = geometry.index;
    if (!positions || !normals || !indices || positions.count !== asset.geometry.vertices || normals.count !== positions.count
        || indices.count !== asset.geometry.triangles * 3 || Object.keys(geometry.morphAttributes).length) throw new Error('Detail geometry counts do not match its registry.');
    for (let index = 0; index < positions.count; index++) {
      if (![positions.getX(index), positions.getY(index), positions.getZ(index), normals.getX(index), normals.getY(index), normals.getZ(index)].every(Number.isFinite)
          || Math.abs(Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index)) - 1) > 1e-5) throw new Error('Detail coordinates or normals are invalid.');
    }
    for (let index = 0; index < indices.count; index++) if (!Number.isSafeInteger(indices.getX(index))
      || indices.getX(index) < 0 || indices.getX(index) >= positions.count) throw new Error('Detail triangle indices exceed the source vertices.');
    geometry.computeBoundingBox();
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(geometry.boundingBox!.min.getComponent(axis) - asset.geometry.boundsMeters[0][axis]) > 1e-8
          || Math.abs(geometry.boundingBox!.max.getComponent(axis) - asset.geometry.boundsMeters[1][axis]) > 1e-8) throw new Error('Detail coordinate bounds do not match its registry.');
    }
    return geometry;
  } catch (error) { meshes.forEach((mesh) => mesh.geometry.dispose()); throw error; }
  finally { meshes.forEach((mesh) => [mesh.material].flat().forEach((material) => material.dispose())); }
}

export interface RegionDetailTarget { mesh: THREE.Mesh<THREE.BufferGeometry>; sourceToLocal: THREE.Matrix4 }
/** One finer region per viewer. Coarse pivots, transforms, materials and camera are unchanged. */
export class RegionDetailController {
  private sequence = 0;
  private abort?: AbortController;
  private key = '';
  private disposed = false;
  private active?: { target: RegionDetailTarget; coarse: THREE.BufferGeometry; fine: THREE.BufferGeometry };
  constructor(private atlas: Atlas, private target: (id: string) => RegionDetailTarget | undefined,
    private changed: () => void, private status: (status: RegionDetailStatus) => void,
    private loader = loadRegionDetailGeometry) {}
  private restore() {
    if (this.active) {
      this.active.target.mesh.geometry = this.active.coarse;
      this.active.fine.dispose(); this.active = undefined; this.changed();
    }
  }
  async request(asset: RegionDetailAsset | undefined | null, selected: string | null) {
    const key = asset && asset.structureId === selected ? `${asset.atlasId}:${asset.structureId}:${asset.glbSha256}` : '';
    if (key === this.key || this.disposed) return;
    this.key = key;
    const sequence = ++this.sequence;
    this.abort?.abort(); this.restore();
    if (!key || !asset) { this.status({ status: 'idle', structureId: null }); return; }
    const target = this.target(asset.structureId);
    if (!target) { this.status({ status: 'failed', structureId: asset.structureId, message: 'The coarse region is unavailable.' }); return; }
    const abort = new AbortController(); this.abort = abort;
    this.status({ status: 'loading', structureId: asset.structureId });
    let fine: THREE.BufferGeometry | undefined;
    try {
      assertRegionDetailBinding(asset, this.atlas);
      fine = await this.loader(asset, this.atlas, abort.signal);
      if (this.disposed || sequence !== this.sequence || abort.signal.aborted) { fine.dispose(); return; }
      fine.applyMatrix4(target.sourceToLocal);
      fine.computeBoundingBox(); fine.computeBoundingSphere();
      const coarse = target.mesh.geometry;
      target.mesh.geometry = fine;
      this.active = { target, coarse, fine };
      fine = undefined;
      this.changed();
      this.status({ status: 'ready', structureId: asset.structureId, triangles: asset.geometry.triangles,
        processingVoxelSpacingMm: asset.processingVoxelSpacingMm });
    } catch (error) {
      fine?.dispose();
      if (!this.disposed && sequence === this.sequence) {
        this.key = '';
        this.status({ status: 'failed', structureId: asset.structureId,
          message: error instanceof Error ? error.message : 'Detail loading failed; the coarse region is retained.' });
      }
    }
  }
  dispose() { this.disposed = true; this.sequence++; this.abort?.abort(); this.restore(); }
}
