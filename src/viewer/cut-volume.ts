import * as THREE from 'three';
import { CutField, cutFieldShape, type CutPoint, type CutRegion } from '../domain/cut-field';

/**
 * The grid of cuts on the graphics card. The first upload sends everything, and a cut then sends only the part of the grid it has changed, so that cutting stays smooth.
 */
export interface CutVolume {
  readonly field: CutField;
  readonly textures: readonly [THREE.Data3DTexture, THREE.Data3DTexture];
  readonly toTexture: THREE.Matrix4;
  /** Sweep a ball along a line in a channel, and send the change. */
  sweep(channel: number, from: CutPoint, to: CutPoint, radius: number, restore?: boolean): boolean;
  /** Sweep along a whole path, and send the change once. A step longer than `jump` lifts the ball off. */
  sweepPath(channel: number, points: readonly CutPoint[], radius: number, jump: number, restore?: boolean): boolean;
  /** Send everything again, after the grid has been rebuilt. */
  refresh(): void;
  dispose(): void;
}

export function createCutVolume(renderer: THREE.WebGLRenderer, box: THREE.Box3): CutVolume {
  const shape = cutFieldShape(box.min.toArray() as unknown as CutPoint, box.max.toArray() as unknown as CutPoint);
  const field = new CutField(shape);
  const makeTexture = (data: Uint8Array) => {
    const texture = new THREE.Data3DTexture(data as unknown as Uint8Array<ArrayBuffer>, shape.nx, shape.ny, shape.nz);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  };
  const textures = [makeTexture(field.data[0]), makeTexture(field.data[1])] as const;
  const toTexture = new THREE.Matrix4().makeScale(1 / (shape.nx * shape.cell), 1 / (shape.ny * shape.cell), 1 / (shape.nz * shape.cell))
    .multiply(new THREE.Matrix4().makeTranslation(-shape.origin[0], -shape.origin[1], -shape.origin[2]));
  const gl = renderer.getContext() as WebGL2RenderingContext;

  const send = (texture: THREE.Data3DTexture, data: Uint8Array, region: CutRegion) => {
    const handle = (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture;
    // A texture not yet on the card goes there whole when it is first used.
    if (!handle) { texture.needsUpdate = true; return; }
    renderer.state.bindTexture(gl.TEXTURE_3D, handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, shape.nx);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, shape.ny);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, region.x);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, region.y);
    gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, region.z);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, region.x, region.y, region.z, region.width, region.height, region.depth, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
  };

  return {
    field, textures, toTexture,
    sweep(channel, from, to, radius, restore = false) {
      const region = field.sweep(channel, from, to, radius, restore);
      if (!region) return false;
      const set = channel >> 2;
      send(textures[set], field.data[set], region);
      return true;
    },
    sweepPath(channel, points, radius, jump, restore = false) {
      let low: [number, number, number] | null = null, high: [number, number, number] = [0, 0, 0];
      const take = (region: CutRegion | null) => {
        if (!region) return;
        const end: [number, number, number] = [region.x + region.width, region.y + region.height, region.z + region.depth];
        if (!low) { low = [region.x, region.y, region.z]; high = end; return; }
        low = [Math.min(low[0], region.x), Math.min(low[1], region.y), Math.min(low[2], region.z)];
        high = [Math.max(high[0], end[0]), Math.max(high[1], end[1]), Math.max(high[2], end[2])];
      };
      if (points.length === 1) take(field.sweep(channel, points[0], points[0], radius, restore));
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1], b = points[index];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < jump) take(field.sweep(channel, a, b, radius, restore));
      }
      if (!low) return false;
      const [x, y, z] = low as [number, number, number], set = channel >> 2;
      send(textures[set], field.data[set], { x, y, z, width: high[0] - x, height: high[1] - y, depth: high[2] - z });
      return true;
    },
    refresh() { for (const texture of textures) texture.needsUpdate = true; },
    dispose() { for (const texture of textures) texture.dispose(); },
  };
}
