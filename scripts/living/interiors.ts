/**
 * The insides of organs: nested closed surfaces that show in a section. Each grows from the measured outline of a source label, by a distance that is an estimate,
 * after the descriptions in Hummel et al. (1966). They hold no measurement of these spaces, which the source images do not separate.
 * Coordinates are source voxels of 0.1 mm in the scanned frame, before the simulated posture.
 */
import { clusterSurface, mergeSurfaces, extractSurface, tube } from './extract';
import type { Landmarks } from './landmarks';
import { add, dot, length, scale, sub, unit, type Vec3 } from './rig';
import type { Surface } from './surface-nets';
import { erode, voxelIndex, type Grid } from './volume';

export type InteriorPart = 'adrenal-medullae' | 'left-heart-spaces' | 'right-heart-spaces' | 'heart-valves' | 'renal-medullae' | 'renal-pelves' | 'stomach-lumen' | 'limiting-ridge' | 'bladder-lumen';

interface Region { readonly grid: Grid; readonly origin: Vec3; readonly mask: Uint8Array }

/** Voxels of a test within a box, on a small grid of their own. */
function regionOf(grid: Grid, min: Vec3, max: Vec3, inside: (x: number, y: number, z: number, index: number) => boolean): Region {
  const margin = 4;
  const origin: Vec3 = [Math.max(0, min[0] - margin), Math.max(0, min[1] - margin), Math.max(0, min[2] - margin)];
  const local: Grid = { nx: Math.min(grid.nx, max[0] + margin + 1) - origin[0], ny: Math.min(grid.ny, max[1] + margin + 1) - origin[1], nz: Math.min(grid.nz, max[2] + margin + 1) - origin[2] };
  const mask = new Uint8Array(local.nx * local.ny * local.nz);
  for (let z = 0; z < local.nz; z++) for (let y = 0; y < local.ny; y++) for (let x = 0; x < local.nx; x++) {
    const X = origin[0] + x, Y = origin[1] + y, Z = origin[2] + z;
    if (inside(X, Y, Z, voxelIndex(grid, X, Y, Z))) mask[voxelIndex(local, x, y, z)] = 1;
  }
  return { grid: local, origin, mask };
}

function surfaceOf(region: Region, mask: Uint8Array = region.mask, radius = 1): Surface {
  const { nx, ny, nz } = region.grid;
  const surface = extractSurface(region.grid, (i) => mask[i], [0, nx - 1, 0, ny - 1, 0, nz - 1], { step: 1, radius });
  const positions = new Float32Array(surface.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = surface.positions[i] + region.origin[0];
    positions[i + 1] = surface.positions[i + 1] + region.origin[1];
    positions[i + 2] = surface.positions[i + 2] + region.origin[2];
  }
  return clusterSurface({ ...surface, positions }, 2.2);
}

const nearestSeed = (seeds: readonly (readonly [number, number, number])[], x: number, y: number, z: number) => {
  let best = 0, distance = Infinity;
  seeds.forEach((seed, k) => { const d = (x - seed[0]) ** 2 + (y - seed[1]) ** 2 + (z - seed[2]) ** 2; if (d < distance) { distance = d; best = k; } });
  return best;
};

/** A thin flap from a point on a ring towards the middle of a passage. */
const flap = (base: Vec3, tip: Vec3, width: number): Surface => tube([base, add(base, scale(sub(tip, base), 0.5)), tip], [width, width * 0.8, 0.2], 10);

/** A ring round an axis. */
function ring(centre: Vec3, axis: Vec3, radius: number, thickness: number): Surface {
  const a = unit(axis);
  const u = unit(Math.abs(a[2]) < 0.9 ? [a[1], -a[0], 0] : [0, a[2], -a[1]]);
  const v: Vec3 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const points = Array.from({ length: 25 }, (_, i): Vec3 => { const t = 2 * Math.PI * i / 24; return add(centre, add(scale(u, radius * Math.cos(t)), scale(v, radius * Math.sin(t)))); });
  return tube(points, points.map(() => thickness), 6);
}

/** A valve: a ring, with flaps that reach into the passage along its axis. */
function valve(centre: Vec3, axis: Vec3, radius: number, flaps: number, reach: number): Surface {
  const a = unit(axis);
  const u = unit(Math.abs(a[2]) < 0.9 ? [a[1], -a[0], 0] : [0, a[2], -a[1]]);
  const v: Vec3 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const parts: Surface[] = [ring(centre, axis, radius, Math.max(0.45, radius * 0.1))];
  for (let k = 0; k < flaps; k++) {
    const t = 2 * Math.PI * k / flaps;
    const base = add(centre, add(scale(u, radius * Math.cos(t)), scale(v, radius * Math.sin(t))));
    const tip = add(add(centre, scale(a, reach)), add(scale(u, radius * 0.22 * Math.cos(t)), scale(v, radius * 0.22 * Math.sin(t))));
    parts.push(flap(base, tip, radius * (flaps === 2 ? 0.6 : 0.45)));
  }
  return mergeSurfaces(parts);
}

export interface InteriorSeeds {
  readonly heart: readonly (readonly [number, number, number])[];
  readonly stomach: readonly (readonly [number, number, number])[];
  readonly kidneyLimitX: number;
}

export function buildInteriors(grid: Grid, labels: Uint8Array, lm: Landmarks, seeds: InteriorSeeds, aortaRoot: Vec3, pulmonaryRoot: Vec3): Record<InteriorPart, Surface> {
  const box = (id: number) => { const record = lm.label(id); return { min: record.min, max: record.max, centroid: record.centroid }; };

  // The heart. Hummel et al.: the myocardium is thin in the atria and considerably thicker in the left ventricle than the right. Seeds are in the order right atrium, left atrium, right ventricle, left ventricle.
  const heart = box(9);
  const heartRegion = regionOf(grid, heart.min, heart.max, (_x, _y, _z, i) => labels[i] === 9);
  const chamber = (index: number) => {
    const mask = new Uint8Array(heartRegion.mask.length);
    for (let z = 0; z < heartRegion.grid.nz; z++) for (let y = 0; y < heartRegion.grid.ny; y++) for (let x = 0; x < heartRegion.grid.nx; x++) {
      const at = voxelIndex(heartRegion.grid, x, y, z);
      if (heartRegion.mask[at] && nearestSeed(seeds.heart, heartRegion.origin[0] + x, heartRegion.origin[1] + y, heartRegion.origin[2] + z) === index) mask[at] = 1;
    }
    return mask;
  };
  const chambers = [0, 1, 2, 3].map(chamber);
  const WALL = [2, 2, 4, 10];
  const space = (index: number) => surfaceOf(heartRegion, erode(chambers[index], heartRegion.grid, WALL[index]) as Uint8Array);
  /** The middle of the boundary between two chambers. */
  const between = (a: number, b: number): { centre: Vec3; radius: number; axis: Vec3 } => {
    const { nx, ny, nz } = heartRegion.grid;
    let sx = 0, sy = 0, sz = 0, n = 0;
    let ax = 0, ay = 0, az = 0, an = 0, bx = 0, by = 0, bz = 0, bn = 0;
    for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
      const at = voxelIndex(heartRegion.grid, x, y, z);
      if (chambers[a][at]) { ax += x; ay += y; az += z; an++; if (chambers[b][at + 1] || chambers[b][at - 1] || chambers[b][at + nx] || chambers[b][at - nx] || chambers[b][at + nx * ny] || chambers[b][at - nx * ny]) { sx += x; sy += y; sz += z; n++; } }
      if (chambers[b][at]) { bx += x; by += y; bz += z; bn++; }
    }
    const o = heartRegion.origin;
    const centre: Vec3 = n ? [o[0] + sx / n, o[1] + sy / n, o[2] + sz / n] : [o[0] + ax / an, o[1] + ay / an, o[2] + az / an];
    return { centre, radius: Math.min(9, Math.max(4, Math.sqrt(n / Math.PI) * 0.55)), axis: unit([bx / bn - ax / an, by / bn - ay / an, bz / bn - az / an]) };
  };
  const mitral = between(1, 3), tricuspid = between(0, 2);
  const leftOutlet = unit(sub(aortaRoot, mitral.centre)), rightOutlet = unit(sub(pulmonaryRoot, tricuspid.centre));
  const heartValves = mergeSurfaces([
    valve(mitral.centre, mitral.axis, mitral.radius, 2, 9),
    valve(tricuspid.centre, tricuspid.axis, tricuspid.radius, 3, 8),
    valve(aortaRoot, leftOutlet, 4.4, 3, 2.6),
    valve(pulmonaryRoot, rightOutlet, 4.2, 3, 2.6),
  ]);

  // The kidneys. Hummel et al.: the cortex follows the convex border; the medulla is a broad pyramid with its base towards the cortex, whose apex, the papilla, is surrounded by the pelvis at the hilus.
  const kidneys = [{ side: 'low' as const, test: (x: number) => x < seeds.kidneyLimitX }, { side: 'high' as const, test: (x: number) => x >= seeds.kidneyLimitX }];
  const medullae: Surface[] = [], pelves: Surface[] = [];
  for (const kidney of kidneys) {
    const { centroid, min, max } = lm.label(19, kidney.side);
    const region = regionOf(grid, min, max, (x, _y, _z, i) => labels[i] === 19 && kidney.test(x));
    const towardsHilus = unit([lm.midX - centroid[0], 0, -0.25 * Math.abs(lm.midX - centroid[0])]);
    const halfWidth = (max[0] - min[0]) / 2;
    const apex = add(centroid, scale(towardsHilus, halfWidth * 0.62));
    const inner = erode(region.mask, region.grid, 10) as Uint8Array;
    const pyramid = new Uint8Array(inner.length);
    for (let z = 0; z < region.grid.nz; z++) for (let y = 0; y < region.grid.ny; y++) for (let x = 0; x < region.grid.nx; x++) {
      const at = voxelIndex(region.grid, x, y, z);
      if (!inner[at]) continue;
      const p: Vec3 = [region.origin[0] + x, region.origin[1] + y, region.origin[2] + z];
      const fromApex = sub(p, apex);
      const along = -dot(fromApex, towardsHilus);
      const across = length(sub(fromApex, scale(towardsHilus, -along)));
      if (along > 0 && across < along * 1.05) pyramid[at] = 1;
    }
    medullae.push(surfaceOf(region, pyramid));
    // The pelvis is a funnel round the papilla that narrows into the ureter at the hilus.
    pelves.push(tube([add(apex, scale(towardsHilus, -5)), apex, add(apex, scale(towardsHilus, 6)), add(apex, scale(towardsHilus, 13))], [5.5, 6.5, 3.5, 1.2], 14));
  }

  // The stomach. Hummel et al.: a thin-walled left side and a thick-walled right side, separated by a ridge round the entrance of the oesophagus. Seeds are in the order cardiac, pyloric.
  const stomach = box(15);
  const stomachRegion = regionOf(grid, stomach.min, stomach.max, (_x, _y, _z, i) => labels[i] === 15);
  const stomachParts = [0, 1].map((index) => {
    const mask = new Uint8Array(stomachRegion.mask.length);
    for (let z = 0; z < stomachRegion.grid.nz; z++) for (let y = 0; y < stomachRegion.grid.ny; y++) for (let x = 0; x < stomachRegion.grid.nx; x++) {
      const at = voxelIndex(stomachRegion.grid, x, y, z);
      if (stomachRegion.mask[at] && nearestSeed(seeds.stomach, stomachRegion.origin[0] + x, stomachRegion.origin[1] + y, stomachRegion.origin[2] + z) === index) mask[at] = 1;
    }
    return mask;
  });
  const lumenThin = erode(stomachParts[0], stomachRegion.grid, 2) as Uint8Array, lumenThick = erode(stomachParts[1], stomachRegion.grid, 5) as Uint8Array;
  const lumen = new Uint8Array(lumenThin.length);
  for (let i = 0; i < lumen.length; i++) lumen[i] = lumenThin[i] || lumenThick[i] ? 1 : 0;
  // The ridge: where the two regions meet, in the wall of the stomach.
  const { nx: sx0, ny: sy0, nz: sz0 } = stomachRegion.grid;
  const ridge = new Uint8Array(lumen.length);
  const reach = 3;
  const deepInside = erode(stomachRegion.mask, stomachRegion.grid, 7) as Uint8Array;
  for (let z = reach; z < sz0 - reach; z++) for (let y = reach; y < sy0 - reach; y++) for (let x = reach; x < sx0 - reach; x++) {
    const at = voxelIndex(stomachRegion.grid, x, y, z);
    if (!stomachParts[0][at] || deepInside[at]) continue;
    let near = false;
    for (let dz = -reach; dz <= reach && !near; dz++) for (let dy = -reach; dy <= reach && !near; dy++) for (let dx = -reach; dx <= reach && !near; dx++) {
      if (stomachParts[1][voxelIndex(stomachRegion.grid, x + dx, y + dy, z + dz)]) near = true;
    }
    if (near) ridge[at] = 1;
  }

  // The adrenal glands have a cortex and a medulla: Hummel et al. The depth of the cortex is an estimate.
  const adrenal = box(20);
  const adrenalRegion = regionOf(grid, adrenal.min, adrenal.max, (_x, _y, _z, i) => labels[i] === 20);

  // The bladder. Its wall is an estimate.
  const bladder = box(13);
  const bladderRegion = regionOf(grid, bladder.min, bladder.max, (_x, _y, _z, i) => labels[i] === 13);

  return {
    'adrenal-medullae': surfaceOf(adrenalRegion, erode(adrenalRegion.mask, adrenalRegion.grid, 3) as Uint8Array, 0),
    'left-heart-spaces': mergeSurfaces([space(1), space(3)]),
    'right-heart-spaces': mergeSurfaces([space(0), space(2)]),
    'heart-valves': heartValves,
    'renal-medullae': mergeSurfaces(medullae),
    'renal-pelves': mergeSurfaces(pelves),
    'stomach-lumen': surfaceOf(stomachRegion, lumen),
    'limiting-ridge': surfaceOf(stomachRegion, ridge),
    'bladder-lumen': surfaceOf(bladderRegion, erode(bladderRegion.mask, bladderRegion.grid, 3) as Uint8Array),
  };
}
