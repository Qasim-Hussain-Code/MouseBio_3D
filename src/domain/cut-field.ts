/**
 * What has been cut away in a practice dissection, held as a grid of small boxes over the body with one number for each group of layers in each box. A number of 128 or more means that
 * the layers of that group are gone there, and the numbers near the edge of a cut grade smoothly, so that interpolating between boxes gives a smooth edge finer than the boxes.
 * It records what the person using the instruments has done, in the coordinates of the model at rest, so that a cut stays on the tissue when the tissue moves. It is not a model of tissue.
 */
export const CUT_CHANNELS = 8;

export type CutPoint = readonly [number, number, number];

/** A part of the grid, as the first box and the size in boxes along each axis, that has changed. */
export interface CutRegion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface CutFieldShape {
  /** The low corner of the grid, in metres. */
  readonly origin: CutPoint;
  /** The size of a box, in metres. */
  readonly cell: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/** A grid over a box with at most about this many boxes. */
export function cutFieldShape(low: CutPoint, high: CutPoint, largest = 5.5e6, finest = 0.00022): CutFieldShape {
  const size = [high[0] - low[0], high[1] - low[1], high[2] - low[2]];
  const cell = Math.max(finest, Math.cbrt((size[0] * size[1] * size[2]) / largest));
  return { origin: low, cell, nx: Math.max(2, Math.ceil(size[0] / cell)), ny: Math.max(2, Math.ceil(size[1] / cell)), nz: Math.max(2, Math.ceil(size[2] / cell)) };
}

export class CutField {
  readonly shape: CutFieldShape;
  /** Two sets of four channels. Each is laid out as texture data: red, green, blue, alpha at each box, with x changing fastest. */
  readonly data: readonly [Uint8Array, Uint8Array];

  constructor(shape: CutFieldShape) {
    this.shape = shape;
    const count = shape.nx * shape.ny * shape.nz * 4;
    this.data = [new Uint8Array(count), new Uint8Array(count)];
  }

  clear() {
    this.data[0].fill(0);
    this.data[1].fill(0);
  }

  private at(x: number, y: number, z: number) {
    return (x + this.shape.nx * (y + this.shape.ny * z)) * 4;
  }

  /** The value of a channel at a point, from 0 to 1, as the display would read it. */
  sample(channel: number, point: CutPoint): number {
    const { origin, cell, nx, ny, nz } = this.shape;
    const fx = (point[0] - origin[0]) / cell - 0.5, fy = (point[1] - origin[1]) / cell - 0.5, fz = (point[2] - origin[2]) / cell - 0.5;
    if (fx < -0.5 || fy < -0.5 || fz < -0.5 || fx > nx - 0.5 || fy > ny - 0.5 || fz > nz - 0.5) return 0;
    const clampTo = (value: number, most: number) => Math.max(0, Math.min(most, value));
    const x0 = clampTo(Math.floor(fx), nx - 1), y0 = clampTo(Math.floor(fy), ny - 1), z0 = clampTo(Math.floor(fz), nz - 1);
    const x1 = clampTo(x0 + 1, nx - 1), y1 = clampTo(y0 + 1, ny - 1), z1 = clampTo(z0 + 1, nz - 1);
    const tx = clampTo(fx - x0, 1), ty = clampTo(fy - y0, 1), tz = clampTo(fz - z0, 1);
    const set = this.data[channel >> 2], part = channel & 3;
    const read = (x: number, y: number, z: number) => set[this.at(x, y, z) + part];
    const along = (y: number, z: number) => read(x0, y, z) * (1 - tx) + read(x1, y, z) * tx;
    const across = (z: number) => along(y0, z) * (1 - ty) + along(y1, z) * ty;
    return (across(z0) * (1 - tz) + across(z1) * tz) / 255;
  }

  /**
   * Sweep a ball along a line, removing a channel where it passes, or giving back what was removed if `restore` is set. The numbers grade over about one box on each side of the surface
   * of the sweep, so that the edge read by the display lies at the radius. Returns the part of the grid that has changed, if any.
   */
  sweep(channel: number, from: CutPoint, to: CutPoint, radius: number, restore = false): CutRegion | null {
    const { origin, cell, nx, ny, nz } = this.shape;
    const reach = radius + cell * 1.5;
    const lowest = (axis: 0 | 1 | 2, most: number) => Math.max(0, Math.floor((Math.min(from[axis], to[axis]) - reach - origin[axis]) / cell));
    const highest = (axis: 0 | 1 | 2, most: number) => Math.min(most - 1, Math.ceil((Math.max(from[axis], to[axis]) + reach - origin[axis]) / cell));
    const x0 = lowest(0, nx), x1 = highest(0, nx), y0 = lowest(1, ny), y1 = highest(1, ny), z0 = lowest(2, nz), z1 = highest(2, nz);
    if (x0 > x1 || y0 > y1 || z0 > z1) return null;
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    const set = this.data[channel >> 2], part = channel & 3;
    let changed = false;
    for (let z = z0; z <= z1; z++) {
      const pz = origin[2] + (z + 0.5) * cell - from[2];
      for (let y = y0; y <= y1; y++) {
        const py = origin[1] + (y + 0.5) * cell - from[1];
        let index = this.at(x0, y, z) + part;
        for (let x = x0; x <= x1; x++, index += 4) {
          const px = origin[0] + (x + 0.5) * cell - from[0];
          const t = lengthSquared > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / lengthSquared)) : 0;
          const away = Math.hypot(px - t * dx, py - t * dy, pz - t * dz);
          const value = Math.round(Math.max(0, Math.min(1, 0.5 + (radius - away) / (2 * cell))) * 255);
          if (value <= 0) continue;
          const old = set[index], next = restore ? Math.min(old, 255 - value) : Math.max(old, value);
          if (next !== old) { set[index] = next; changed = true; }
        }
      }
    }
    return changed ? { x: x0, y: y0, z: z0, width: x1 - x0 + 1, height: y1 - y0 + 1, depth: z1 - z0 + 1 } : null;
  }
}
