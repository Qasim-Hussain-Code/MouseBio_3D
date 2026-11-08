import * as THREE from 'three';
import type { CutFieldShape, CutPoint } from '../domain/cut-field';

/**
 * Where the coat has been clipped before an operation: a coarse grid over the body, read for the root of each hair. It covers the same box as the grid of cuts, so that the two share one way of finding a place in them.
 * This records what was done with the clippers. It says nothing about hair growth or skin.
 */
export interface ClipGrid {
  readonly texture: THREE.Data3DTexture;
  /** Clip a band along a line, of this half width. */
  sweep(from: CutPoint, to: CutPoint, radius: number): void;
  clear(): void;
  /** Send what has changed to the graphics card. */
  flush(): void;
  /** How far clipped a point is, from 0 to 1. */
  sample(point: CutPoint): number;
  readonly any: () => boolean;
  dispose(): void;
}

/** The size of a box of the grid, in metres. A hair is either in or out, so this need not be fine. */
const CELL = 0.00035;

export function createClipGrid(shape: CutFieldShape): ClipGrid {
  const span = [shape.nx * shape.cell, shape.ny * shape.cell, shape.nz * shape.cell] as const;
  const nx = Math.max(2, Math.ceil(span[0] / CELL)), ny = Math.max(2, Math.ceil(span[1] / CELL)), nz = Math.max(2, Math.ceil(span[2] / CELL));
  const size = [span[0] / nx, span[1] / ny, span[2] / nz] as const;
  const data = new Uint8Array(nx * ny * nz);
  const texture = new THREE.Data3DTexture(data as unknown as Uint8Array<ArrayBuffer>, nx, ny, nz);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  let dirty = false, some = false;
  const { origin } = shape;
  return {
    texture,
    sweep(from, to, radius) {
      const reach = radius + CELL * 1.5;
      const first = (axis: 0 | 1 | 2) => Math.max(0, Math.floor((Math.min(from[axis], to[axis]) - reach - origin[axis]) / size[axis]));
      const last = (axis: 0 | 1 | 2, most: number) => Math.min(most - 1, Math.ceil((Math.max(from[axis], to[axis]) + reach - origin[axis]) / size[axis]));
      const x0 = first(0), x1 = last(0, nx), y0 = first(1), y1 = last(1, ny), z0 = first(2), z1 = last(2, nz);
      const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], lengthSquared = dx * dx + dy * dy + dz * dz;
      for (let z = z0; z <= z1; z++) {
        const pz = origin[2] + (z + 0.5) * size[2] - from[2];
        for (let y = y0; y <= y1; y++) {
          const py = origin[1] + (y + 0.5) * size[1] - from[1];
          for (let x = x0; x <= x1; x++) {
            const px = origin[0] + (x + 0.5) * size[0] - from[0];
            const t = lengthSquared > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / lengthSquared)) : 0;
            const away = Math.hypot(px - t * dx, py - t * dy, pz - t * dz);
            const value = Math.round(Math.max(0, Math.min(1, 0.5 + (radius - away) / (2 * CELL))) * 255);
            const index = x + nx * (y + ny * z);
            if (value > data[index]) { data[index] = value; dirty = true; some = true; }
          }
        }
      }
    },
    clear() { data.fill(0); dirty = true; some = false; },
    flush() { if (dirty) { texture.needsUpdate = true; dirty = false; } },
    sample(point) {
      const x = Math.floor((point[0] - origin[0]) / size[0]), y = Math.floor((point[1] - origin[1]) / size[1]), z = Math.floor((point[2] - origin[2]) / size[2]);
      return x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : data[x + nx * (y + ny * z)] / 255;
    },
    any: () => some,
    dispose() { texture.dispose(); },
  };
}
