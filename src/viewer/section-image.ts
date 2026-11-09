import * as THREE from 'three';
import { fetchBoundAnatomyBytes } from './asset-fetch';
import { deployedPath } from '../domain/deployed-path';
import { parseSectionImages, sectionLayer, sectionTextureSize, SECTION_IMAGES_URL, type Dimensions, type SectionImageId, type SectionImagesManifest } from '../domain/section-images';
import type { Atlas } from '../domain/types';

export interface SectionVolume { readonly id: SectionImageId; readonly data: Uint8Array; readonly size: Dimensions; readonly manifest: SectionImagesManifest }

/** Read one image layer and its label mask, then decode them off the page thread. The caller owns the result. */
export async function loadSectionVolume(atlas: Atlas, id: SectionImageId, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<SectionVolume> {
  if (typeof Worker !== 'function') throw new Error('This browser cannot prepare the section images.');
  const response = await fetcher(deployedPath(SECTION_IMAGES_URL), { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error('The section image manifest could not be read.');
  const parsed = parseSectionImages(await response.json(), atlas);
  if (!parsed.ok || !parsed.manifest) throw new Error(parsed.errors.join(' '));
  const manifest = parsed.manifest, layer = sectionLayer(manifest, id);
  if (!layer) throw new Error('This section image layer is unavailable.');
  const [image, labelStream] = await Promise.all([
    fetchBoundAnatomyBytes(layer.assetUrl, layer.assetBytes, layer.assetSha256, signal, 'bin', fetcher),
    fetchBoundAnatomyBytes(manifest.labels.assetUrl, manifest.labels.assetBytes, manifest.labels.assetSha256, signal, 'bin', fetcher),
  ]);
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/section-volume.worker.ts', import.meta.url), { type: 'module' });
    const finish = (settle: () => void) => { worker.terminate(); signal.removeEventListener('abort', abort); settle(); };
    const abort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'result' && message.volume instanceof Uint8Array) finish(() => resolve(message.volume));
      else if (message?.type === 'error') finish(() => reject(new Error(String(message.message))));
    };
    worker.onerror = () => finish(() => reject(new Error('The section image worker could not run.')));
    worker.postMessage({ type: 'build', layer, labels: manifest.labels, image, labelStream, dimensions: manifest.dimensions }, [image, labelStream]);
  });
  return { id, data, size: sectionTextureSize(manifest.dimensions), manifest };
}

const VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
// Source image values are shown unlit and unconverted: they are the image, not a lit surface.
const FRAGMENT = `
uniform highp sampler3D uVolume;
uniform mat4 uWorldToNative;
uniform vec3 uVoxelMetres;
uniform vec3 uDimensions;
varying vec3 vWorld;
void main() {
  vec3 native_ = (uWorldToNative * vec4(vWorld, 1.0)).xyz;
  vec3 coordinate = (native_ / uVoxelMetres + 0.5) / uDimensions;
  if (any(lessThan(coordinate, vec3(0.0))) || any(greaterThan(coordinate, vec3(1.0)))) discard;
  vec4 texel = texture(uVolume, coordinate);
  if (texel.a < 0.5) discard;
  gl_FragColor = vec4(texel.rgb, 1.0);
}`;

export interface SectionImagePlane {
  readonly mesh: THREE.Mesh;
  setVolume(volume: SectionVolume): void;
  /** Place the plane at a display-axis coordinate within the display bounds. */
  place(axis: 'x' | 'y' | 'z', coordinate: number): void;
  dispose(): void;
}

/** A quad on the section plane that samples the image volume at each pixel's native position. */
export function createSectionImagePlane(bounds: THREE.Box3, worldToNative: THREE.Matrix4): SectionImagePlane {
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uniforms = {
    uVolume: { value: null as THREE.Data3DTexture | null }, uWorldToNative: { value: worldToNative.clone() },
    uVoxelMetres: { value: new THREE.Vector3(1, 1, 1) }, uDimensions: { value: new THREE.Vector3(1, 1, 1) },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'display-section-image';
  mesh.visible = false;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  let texture: THREE.Data3DTexture | null = null;
  return {
    mesh,
    setVolume(volume) {
      texture?.dispose();
      texture = new THREE.Data3DTexture(volume.data as Uint8Array<ArrayBuffer>, volume.size[0], volume.size[1], volume.size[2]);
      texture.format = THREE.RGBAFormat;
      texture.type = THREE.UnsignedByteType;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      uniforms.uVolume.value = texture;
      uniforms.uVoxelMetres.value.set(...volume.manifest.voxelSpacingMm).multiplyScalar(0.001);
      uniforms.uDimensions.value.set(...volume.manifest.dimensions);
    },
    place(axis, coordinate) {
      mesh.position.copy(center);
      mesh.position[axis] = coordinate;
      mesh.rotation.set(axis === 'y' ? Math.PI / 2 : 0, axis === 'x' ? Math.PI / 2 : 0, 0);
      if (axis === 'x') mesh.scale.set(size.z, size.y, 1);
      else if (axis === 'y') mesh.scale.set(size.x, size.z, 1);
      else mesh.scale.set(size.x, size.y, 1);
    },
    dispose() {
      texture?.dispose();
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}

/** A display direction facing the cut face of a section, which keeps the half at smaller axis coordinates. */
export function cutFaceView(axis: 'x' | 'y' | 'z'): THREE.Vector3 {
  const directions = { x: [0.92, -0.25, 0.3], y: [0.25, 0.85, 0.46], z: [0.2, -0.5, 0.84] } as const;
  return new THREE.Vector3(...directions[axis]).normalize();
}
