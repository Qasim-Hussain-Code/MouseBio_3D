import type { Surface } from './surface-nets';

/** Rings of a tube are kept this far apart along its line, in voxels of 0.1 mm, in the file. */
const SPACING = 4;

export const FLOW_NOTICE = 'Simulated. The centre lines of the simulated vessels and nerves of the living mouse, recovered from the rings of their own tubes after every move of the build, so that they lie where the surfaces lie. They carry the tokens of an illustrative motion display and are not measured flow paths.';

export interface FlowLineRecord {
  readonly structure: string;
  /** x, y, z and radius at each point, in units of 0.001 mm. */
  readonly points: number[];
}

/**
 * The centre line of each tube of a surface, read from the mean of each ring of its vertices. The vertices have been deformed along with
 * the rest of the structure by then, so nothing has to be told about the posture or about parts pressed under the skin.
 */
export function flowLinesOf(id: string, surface: Surface): FlowLineRecord[] {
  const lines: FlowLineRecord[] = [];
  for (const line of surface.lines ?? []) {
    const centres: { x: number; y: number; z: number; r: number }[] = [];
    for (let ring = 0; ring < line.rings; ring++) {
      let x = 0, y = 0, z = 0;
      const first = line.start + ring * line.sides;
      for (let side = 0; side < line.sides; side++) {
        x += surface.positions[3 * (first + side)]; y += surface.positions[3 * (first + side) + 1]; z += surface.positions[3 * (first + side) + 2];
      }
      x /= line.sides; y /= line.sides; z /= line.sides;
      const r = Math.hypot(surface.positions[3 * first] - x, surface.positions[3 * first + 1] - y, surface.positions[3 * first + 2] - z);
      centres.push({ x, y, z, r });
    }
    const points: number[] = [];
    let travelled = Infinity, last = centres[0];
    centres.forEach((centre, index) => {
      travelled += Math.hypot(centre.x - last.x, centre.y - last.y, centre.z - last.z);
      last = centre;
      // The ends of a line are always kept.
      if (travelled < SPACING && index !== centres.length - 1) return;
      travelled = 0;
      // Voxels are 0.1 mm, and the file holds whole numbers of 0.001 mm.
      points.push(Math.round(centre.x * 100), Math.round(centre.y * 100), Math.round(centre.z * 100), Math.max(1, Math.round(centre.r * 100)));
    });
    if (points.length >= 8) lines.push({ structure: id, points });
  }
  return lines;
}
