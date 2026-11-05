import type { Atlas } from './types';

/**
 * Coregistered source images of the registered-volume reference, shown on the
 * cut face of a virtual section. They are measurements of the same specimen on
 * the same voxel grid as the source labels, so the section displays actual
 * image data rather than an interpolated or generated tissue appearance. This
 * module has no renderer dependency so the interface and a worker can share it.
 */
export type SectionImageId = 'cryosection' | 'ct';
export type SectionImageChoice = SectionImageId | 'none';
export type Dimensions = readonly [number, number, number];

interface BoundAsset { readonly assetUrl: string; readonly assetBytes: number; readonly assetSha256: string }
export interface SectionLabels extends BoundAsset { readonly format: 'deflate-raw-u8-v1'; readonly expandedBytes: number; readonly expandedSha256: string }
export interface SectionPhotographLayer extends BoundAsset {
  readonly id: 'cryosection'; readonly title: string; readonly description: string; readonly format: 'jpeg-slices-v1';
  readonly slices: readonly (readonly [number, number])[];
}
export interface SectionGreyLayer extends BoundAsset {
  readonly id: 'ct'; readonly title: string; readonly description: string; readonly format: 'deflate-raw-u8-v1';
  readonly expandedBytes: number; readonly expandedSha256: string;
}
export type SectionLayer = SectionPhotographLayer | SectionGreyLayer;
export interface SectionImagesManifest {
  readonly atlasId: string;
  readonly coordinateFrameId: string;
  readonly dimensions: Dimensions;
  readonly voxelSpacingMm: Dimensions;
  readonly layers: readonly SectionLayer[];
  readonly labels: SectionLabels;
  readonly limitations: readonly string[];
}
export interface SectionImagesResult { readonly ok: boolean; readonly manifest?: SectionImagesManifest; readonly errors: readonly string[] }

const ATLAS_ID = 'digimouse-volume-040-v1';
const FRAME_ID = 'digimouse-registered-voxel-native-v1';
const MAX_ASSET_BYTES = 80 * 1024 * 1024;
export const SECTION_IMAGES_URL = '/atlas-volume/sections/sections.json';
/** In-plane source voxels per displayed texel; the slice direction keeps every source slice. */
export const SECTION_DOWNSAMPLE = 2;

/** Only the registered-volume reference shares the grid of these images. */
export function sectionImagesApplyTo(atlas: Pick<Atlas, 'id'>): boolean {
  return atlas.id === ATLAS_ID;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function boundAsset(value: Record<string, unknown>): boolean {
  return typeof value.assetUrl === 'string' && /^\/atlas-volume\/sections\/[a-z-]+\.bin$/.test(value.assetUrl)
    && Number.isSafeInteger(value.assetBytes) && (value.assetBytes as number) > 0 && (value.assetBytes as number) <= MAX_ASSET_BYTES
    && typeof value.assetSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.assetSha256);
}
function expanded(value: Record<string, unknown>, voxels: number): boolean {
  return value.format === 'deflate-raw-u8-v1' && value.expandedBytes === voxels
    && typeof value.expandedSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.expandedSha256);
}

/** Validate the section image manifest against the loaded reference. Any error rejects the complete manifest. */
export function parseSectionImages(value: unknown, atlas: Pick<Atlas, 'id' | 'coordinateFrame'>): SectionImagesResult {
  const fail = (message: string): SectionImagesResult => ({ ok: false, errors: [message] });
  if (!record(value) || value.schemaVersion !== 'mousebio.section-images.v1') return fail('Unsupported section image manifest.');
  if (value.atlasId !== atlas.id || value.atlasId !== ATLAS_ID || value.coordinateFrameId !== atlas.coordinateFrame.id || value.coordinateFrameId !== FRAME_ID) {
    return fail('The section images do not belong to this reference frame.');
  }
  const { dimensions, voxelSpacingMm, layers, labels, limitations } = value;
  if (!Array.isArray(dimensions) || dimensions.length !== 3 || !dimensions.every((size) => Number.isSafeInteger(size) && size > 0)
      || !Array.isArray(voxelSpacingMm) || voxelSpacingMm.length !== 3 || !voxelSpacingMm.every((size) => typeof size === 'number' && size > 0)) {
    return fail('Invalid section image grid.');
  }
  const voxels = dimensions[0] * dimensions[1] * dimensions[2];
  if (!record(labels) || !boundAsset(labels) || !expanded(labels, voxels)) return fail('Invalid section label asset.');
  if (!Array.isArray(layers) || layers.length === 0 || !Array.isArray(limitations) || limitations.length === 0) return fail('Invalid section image layers.');
  const seen = new Set<unknown>();
  for (const layer of layers) {
    if (!record(layer) || !boundAsset(layer) || typeof layer.title !== 'string' || typeof layer.description !== 'string' || seen.has(layer.id)) return fail('Invalid section image layer.');
    seen.add(layer.id);
    if (layer.id === 'ct') { if (!expanded(layer, voxels)) return fail('Invalid CT section layer.'); continue; }
    if (layer.id !== 'cryosection' || layer.format !== 'jpeg-slices-v1' || !Array.isArray(layer.slices) || layer.slices.length !== dimensions[2]) return fail('Invalid photograph section layer.');
    let offset = 0;
    for (const slice of layer.slices) {
      if (!Array.isArray(slice) || slice[0] !== offset || !Number.isSafeInteger(slice[1]) || slice[1] <= 0) return fail('Photograph slices must be contiguous.');
      offset += slice[1];
    }
    if (offset !== layer.assetBytes) return fail('Photograph slices do not cover their asset.');
  }
  return { ok: true, manifest: value as unknown as SectionImagesManifest, errors: [] };
}

export function sectionLayer(manifest: SectionImagesManifest, id: SectionImageId): SectionLayer | undefined {
  return manifest.layers.find((layer) => layer.id === id);
}

/** Texels of the displayed volume. */
export function sectionTextureSize(dimensions: Dimensions, factor = SECTION_DOWNSAMPLE): Dimensions {
  return [Math.ceil(dimensions[0] / factor), Math.ceil(dimensions[1] / factor), dimensions[2]];
}

/**
 * Normalized volume coordinates of a native asset position in metres. A source
 * voxel centre lies at its integer index times the spacing, and the same
 * convention places the extracted surfaces, so images and surfaces coincide.
 */
export function sectionTextureCoordinate(position: Dimensions, spacingMm: Dimensions, dimensions: Dimensions): Dimensions {
  return [0, 1, 2].map((axis) => (position[axis] / (spacingMm[axis] / 1000) + 0.5) / dimensions[axis]) as unknown as Dimensions;
}

/** Copy one downsampled RGBA image plane into the RGB channels of a volume; image rows are native y. */
export function setPhotographPlane(volume: Uint8Array, rgba: ArrayLike<number>, z: number, size: Dimensions): void {
  const [width, height] = size;
  const base = width * height * z * 4;
  for (let texel = 0, pixels = width * height; texel < pixels; texel++) {
    volume[base + texel * 4] = rgba[texel * 4];
    volume[base + texel * 4 + 1] = rgba[texel * 4 + 1];
    volume[base + texel * 4 + 2] = rgba[texel * 4 + 2];
  }
}

/** Fill a volume's RGB channels with box-averaged 8-bit source values. */
export function setGreyVolume(volume: Uint8Array, values: ArrayLike<number>, dimensions: Dimensions, factor = SECTION_DOWNSAMPLE): void {
  const [sx, sy, sz] = dimensions, [width, height] = sectionTextureSize(dimensions, factor);
  for (let z = 0; z < sz; z++) {
    const plane = sx * sy * z;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let total = 0, count = 0;
        for (let dy = 0; dy < factor && y * factor + dy < sy; dy++) {
          for (let dx = 0; dx < factor && x * factor + dx < sx; dx++) { total += values[plane + (y * factor + dy) * sx + x * factor + dx]; count++; }
        }
        const base = (width * height * z + width * y + x) * 4, grey = Math.round(total / count);
        volume[base] = grey; volume[base + 1] = grey; volume[base + 2] = grey;
      }
    }
  }
}

/** Set each texel's alpha to the fraction of its source voxels that carry a nonzero label, so images stop at the labelled body. */
export function setLabelMask(volume: Uint8Array, labels: ArrayLike<number>, dimensions: Dimensions, factor = SECTION_DOWNSAMPLE): void {
  const [sx, sy, sz] = dimensions, [width, height] = sectionTextureSize(dimensions, factor);
  for (let z = 0; z < sz; z++) {
    const plane = sx * sy * z;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let inside = 0, count = 0;
        for (let dy = 0; dy < factor && y * factor + dy < sy; dy++) {
          for (let dx = 0; dx < factor && x * factor + dx < sx; dx++) { if (labels[plane + (y * factor + dy) * sx + x * factor + dx]) inside++; count++; }
        }
        volume[(width * height * z + width * y + x) * 4 + 3] = Math.round(255 * inside / count);
      }
    }
  }
}

/** Expand a raw deflate stream and require its declared size. */
export async function inflateRaw(stream: ArrayBuffer, expectedBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot expand the section images.');
  const expanded = new Uint8Array(await new Response(new Blob([stream]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  if (expanded.length !== expectedBytes) throw new Error('A section image expanded to an unexpected size.');
  return expanded;
}
