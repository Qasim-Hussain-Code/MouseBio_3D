/**
 * Soft tissue follows the nearest bone. Skeleton voxels are assigned to limb segments
 * or the trunk, a breadth-first search through the body carries that assignment to
 * every body voxel, and the result is stored as smoothed weights on a coarse grid.
 * Surfaces are then deformed vertex by vertex with blended rigid transforms.
 * A thigh carries only the tissue within reach of its femur (THIGH_REACH), and the
 * trunk and the forearms and paws that lay against it in the scan are parted (weightsAt).
 */
import { blendRigid, BONE_IDS, boneOfVoxel, HEAD_BEND, JOINTS, PELVIS_BEND, stancePose, type BoneId, type RigidTransform, type StancePose, type Vec3 } from './rig';
import type { Surface } from './surface-nets';
import { smoothField, voxelIndex, type Grid } from './volume';

const UNASSIGNED = 255;
export const CELL = 4;

/**
 * How far from a femur the soft tissue that turns with it may lie, in voxels of the source: 6 mm at the hip, falling to 3.4 mm at
 * the knee, an estimate. In the scan the thighs lie spread against the flanks, and the nearest bone to the wall of the flank in front
 * of a knee is the femur, as far as 12.9 mm from it on the right and 11.0 mm on the left: 33 and 38 percent of the soft tissue
 * nearest the right and the left femur lie beyond this reach. Turned forwards with the femur, that wall leaves a groove along the
 * flank, so it stays with the trunk. The surface of the stance was compared for reaches from 4.4 mm and 2 mm to 6.6 mm and 4 mm,
 * which give the same form of both flanks; with no limit both flanks carry the groove.
 */
export const THIGH_REACH = { hip: 60, knee: 34 } as const;

export interface PostureField {
  readonly pose: StancePose;
  readonly coarse: Grid;
  readonly weights: readonly Float32Array[];
  readonly transforms: readonly RigidTransform[];
  readonly owner: Uint8Array;
  /** How many soft voxels lay nearest the right and the left femur but beyond THIGH_REACH of it, and so stay with the trunk. */
  readonly beyondThighs: readonly [number, number];
}

/**
 * `bone` marks skeleton voxels, `organs` voxels that stay with the trunk, and `body` every voxel that tissue can be assigned to.
 * `segmentOf` gives the limb segment that the bone of a skeleton voxel moves with, 'trunk' for a bone of the trunk or the head, and
 * null where the bone is not known; there, and without it, the capsules of the rig decide (boneOfVoxel). The capsules alone miss the
 * parts of a limb bone that lie more than 2 mm from the straight line between its joints, as round the knees, and those parts would
 * hold the tissue round them to the trunk.
 */
export function buildPosture(grid: Grid, body: Uint8Array, bone: Uint8Array, organs: Uint8Array, segmentOf?: (index: number) => BoneId | null): PostureField {
  const { nx, ny, nz } = grid;
  const owner = new Uint8Array(body.length).fill(UNASSIGNED);
  const queue = new Int32Array(body.length);
  let head = 0, tail = 0;
  const index = new Map<BoneId, number>(BONE_IDS.map((id, i) => [id, i]));
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z);
    if (organs[at]) { owner[at] = 0; queue[tail++] = at; continue; }
    if (!bone[at]) continue;
    owner[at] = index.get(segmentOf?.(at) ?? boneOfVoxel([x, y, z]))!;
    queue[tail++] = at;
  }
  while (head < tail) {
    const at = queue[head++];
    const z = Math.floor(at / (nx * ny)), rest = at - z * nx * ny, y = Math.floor(rest / nx), x = rest - y * nx;
    const value = owner[at];
    const visit = (other: number) => { if (body[other] && owner[other] === UNASSIGNED) { owner[other] = value; queue[tail++] = other; } };
    if (x > 0) visit(at - 1);
    if (x < nx - 1) visit(at + 1);
    if (y > 0) visit(at - nx);
    if (y < ny - 1) visit(at + nx);
    if (z > 0) visit(at - nx * ny);
    if (z < nz - 1) visit(at + nx * ny);
  }
  // A thigh carries the soft tissue within THIGH_REACH of its femur. What lies nearest the femur but beyond that stays with the trunk.
  const beyondThighs: [number, number] = [0, 0];
  const thighs = (['R', 'L'] as const).map((side, k) => {
    const a = JOINTS[`hip${side}`], b = JOINTS[`knee${side}`], axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    return { value: index.get(`femur${side}`)!, a, axis, lengthSquared: axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2], k };
  });
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z), value = owner[at];
    const thigh = value === thighs[0].value ? thighs[0] : value === thighs[1].value ? thighs[1] : null;
    if (!thigh || bone[at]) continue;
    const rx = x - thigh.a[0], ry = y - thigh.a[1], rz = z - thigh.a[2];
    const t = Math.max(0, Math.min(1, (rx * thigh.axis[0] + ry * thigh.axis[1] + rz * thigh.axis[2]) / thigh.lengthSquared));
    const distance = Math.hypot(rx - t * thigh.axis[0], ry - t * thigh.axis[1], rz - t * thigh.axis[2]);
    if (distance > THIGH_REACH.hip + (THIGH_REACH.knee - THIGH_REACH.hip) * t) { owner[at] = 0; beyondThighs[thigh.k]++; }
  }
  const coarse: Grid = { nx: Math.ceil(nx / CELL), ny: Math.ceil(ny / CELL), nz: Math.ceil(nz / CELL) };
  const ramp = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
  const headIndex = index.get('head')!, pelvisIndex = index.get('pelvis')!;
  const cells = coarse.nx * coarse.ny * coarse.nz;
  const raw = BONE_IDS.map(() => new Float32Array(cells));
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const value = owner[voxelIndex(grid, x, y, z)];
    if (value === UNASSIGNED) continue;
    const cell = voxelIndex(coarse, x >> 2, y >> 2, z >> 2);
    if (value !== 0) { raw[value][cell]++; continue; }
    // The trunk divides smoothly along the body into the head, the middle and the rump, which bend about the column.
    const towardsPelvis = ramp((y - PELVIS_BEND.fromY) / (PELVIS_BEND.toY - PELVIS_BEND.fromY));
    const towardsHead = ramp((HEAD_BEND.fromY - y) / (HEAD_BEND.fromY - HEAD_BEND.toY));
    raw[headIndex][cell] += towardsHead;
    raw[pelvisIndex][cell] += towardsPelvis;
    raw[0][cell] += 1 - towardsHead - towardsPelvis;
  }
  const pose = stancePose();
  return { pose, coarse, owner, weights: raw.map((field) => smoothField(field, coarse, 2)), transforms: BONE_IDS.map((id) => pose.transforms[id]), beyondThighs };
}

const AXIAL: readonly number[] = (['trunk', 'head', 'pelvis'] as const).map((id) => BONE_IDS.indexOf(id));
const FREE: readonly number[] = (['forearmR', 'manusR', 'forearmL', 'manusL', 'pesR', 'pesL'] as const).map((id) => BONE_IDS.indexOf(id));

/** What weightsAt found at a point: no parting, or a parting in which the point stays with the trunk, or goes with the limb. */
export const UNPARTED = 0, WITH_TRUNK = 1, WITH_LIMB = 2;

/** Normalized weights of every bone at a point as they were smoothed, before any parting, and whether anything is near. */
function smoothedWeights(field: PostureField, p: Vec3, out: Float64Array): boolean {
  const { nx, ny, nz } = field.coarse;
  const fx = Math.min(nx - 1.001, Math.max(0, p[0] / CELL - 0.375)), fy = Math.min(ny - 1.001, Math.max(0, p[1] / CELL - 0.375)), fz = Math.min(nz - 1.001, Math.max(0, p[2] / CELL - 0.375));
  const x = Math.floor(fx), y = Math.floor(fy), z = Math.floor(fz);
  const u = fx - x, v = fy - y, w = fz - z;
  const a = (z * ny + y) * nx + x;
  const corners = [a, a + 1, a + nx, a + nx + 1, a + nx * ny, a + nx * ny + 1, a + nx * ny + nx, a + nx * ny + nx + 1];
  const factors = [(1 - u) * (1 - v) * (1 - w), u * (1 - v) * (1 - w), (1 - u) * v * (1 - w), u * v * (1 - w), (1 - u) * (1 - v) * w, u * (1 - v) * w, (1 - u) * v * w, u * v * w];
  let total = 0;
  for (let k = 0; k < out.length; k++) {
    let sum = 0;
    const weights = field.weights[k];
    for (let c = 0; c < 8; c++) sum += weights[corners[c]] * factors[c];
    out[k] = sum; total += sum;
  }
  if (total < 1e-6) { out.fill(0); out[0] = 1; return false; }
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return true;
}

/**
 * Normalized weights of every bone at a point in source voxel coordinates, the trunk when nothing is near.
 *
 * A forearm and a paw are free of the trunk and the head in the animal, but in the scan the forearms lie stretched forwards
 * against the head and the neck. Smoothed weights alone would carry the tissue of the cheek and neck that touched a forearm part of
 * the way after it, as far as 13 mm, and hold the tissue of the forearm back. So where the weights of the trunk, head or rump meet
 * those of a forearm or a paw, the stronger side keeps the point and the other takes no part in its movement: the two are parted
 * along the surface where they are equal. The upper arm, the thigh and the shank join both and blend as before. The result says
 * which side kept the point. With `side` given as WITH_TRUNK or WITH_LIMB, that side keeps the point wherever a parting is found,
 * for a point that belongs with another point on that side, as the end of a short step from it.
 */
export function weightsAt(field: PostureField, p: Vec3, out: Float64Array, side = UNPARTED): number {
  if (!smoothedWeights(field, p, out)) return UNPARTED;
  let axial = 0, free = 0;
  for (const k of AXIAL) axial += out[k];
  for (const k of FREE) free += out[k];
  if (axial <= 0 || free <= 0) return UNPARTED;
  const limb = side === UNPARTED ? free > axial : side === WITH_LIMB, kept = 1 - (limb ? axial : free);
  for (const k of limb ? AXIAL : FREE) out[k] = 0;
  for (let k = 0; k < out.length; k++) out[k] /= kept;
  return limb ? WITH_LIMB : WITH_TRUNK;
}

/**
 * Whether a point lies in a parting itself: within PARTING_HALF voxels of the surface where the trunk and a forearm or paw are
 * equal, where each has at least PARTING_MIN of the movement of the point. The distance is the difference of the two, as a share
 * of their sum, over its slope. Tissue traced there joined two parts that only touched, and a surface drawn through it would be
 * stretched from one to the other; the layer is 0.9 mm thick, which the smoothing of a traced surface does not bridge. Where
 * either side has less than PARTING_MIN, the two sides move within about a quarter of a millimetre of each other.
 */
export const PARTING_MIN = 0.01, PARTING_HALF = 4.5;
export function inParting(field: PostureField, p: Vec3, scratch: Float64Array): boolean {
  const sides = (q: Vec3): [number, number] => {
    if (!smoothedWeights(field, q, scratch)) return [0, 0];
    let axial = 0, free = 0;
    for (const k of AXIAL) axial += scratch[k];
    for (const k of FREE) free += scratch[k];
    return [axial, free];
  };
  const [axial, free] = sides(p);
  if (Math.min(axial, free) < PARTING_MIN) return false;
  const margin = (q: Vec3): number => { const [a, f] = sides(q); return a + f > 0 ? (a - f) / (a + f) : NaN; };
  const here = (axial - free) / (axial + free), h = 2;
  // The slope by differences over two voxels either way; a step that leaves the reach of both sides counts for nothing.
  let squared = 0;
  for (let k = 0; k < 3; k++) {
    const ahead: [number, number, number] = [p[0], p[1], p[2]], behind: [number, number, number] = [p[0], p[1], p[2]];
    ahead[k] += h; behind[k] -= h;
    const a = margin(ahead), b = margin(behind);
    const slope = Number.isNaN(a) || Number.isNaN(b) ? 0 : (a - b) / (2 * h);
    squared += slope * slope;
  }
  return Math.abs(here) <= PARTING_HALF * Math.sqrt(squared);
}

/**
 * What deformSurface found of the partings in the surfaces it carried since this list was last emptied: how many vertices each side
 * of a parting kept, how many triangles have corners on both sides, and the longest edge of such a triangle after and before.
 */
export interface PartedSurface { readonly withTrunk: number; readonly withLimb: number; readonly across: number; readonly longest: number; readonly was: number }
export const partedSurfaces: PartedSurface[] = [];

/** Which side of a parting keeps each vertex of a surface given in source voxel coordinates. */
export function sidesOf(surface: Surface, field: PostureField): Uint8Array {
  const sides = new Uint8Array(surface.positions.length / 3), weights = new Float64Array(BONE_IDS.length);
  for (let i = 0; i < sides.length; i++) sides[i] = weightsAt(field, [surface.positions[3 * i], surface.positions[3 * i + 1], surface.positions[3 * i + 2]], weights);
  return sides;
}

/**
 * Deform a surface given in source voxel coordinates to the stance. With `sides`, each vertex is kept by the side given for it
 * wherever it meets a parting, so that points a short step from the vertices of a surface are carried as those vertices are.
 */
export function deformSurface(surface: Surface, field: PostureField, sides?: Uint8Array): Surface {
  const positions = new Float32Array(surface.positions.length);
  const weights = new Float64Array(BONE_IDS.length);
  const moved: RigidTransform[] = [], factors: number[] = [];
  const side = new Uint8Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]];
    side[i / 3] = weightsAt(field, p, weights, sides ? sides[i / 3] : UNPARTED);
    if (weights[0] > 0.999) { positions[i] = p[0]; positions[i + 1] = p[1]; positions[i + 2] = p[2]; continue; }
    moved.length = 0; factors.length = 0;
    for (let k = 0; k < weights.length; k++) if (weights[k] > 0.005) { moved.push(field.transforms[k]); factors.push(weights[k]); }
    const out = blendRigid(moved, factors, p);
    positions[i] = out[0]; positions[i + 1] = out[1]; positions[i + 2] = out[2];
  }
  let withTrunk = 0, withLimb = 0, across = 0, longest = 0, was = 0;
  for (let v = 0; v < side.length; v++) { if (side[v] === WITH_TRUNK) withTrunk++; else if (side[v] === WITH_LIMB) withLimb++; }
  if (withTrunk && withLimb) {
    const { indices } = surface, before = surface.positions;
    const edge = (q: Float32Array, a: number, b: number) => Math.hypot(q[3 * a] - q[3 * b], q[3 * a + 1] - q[3 * b + 1], q[3 * a + 2] - q[3 * b + 2]);
    for (let t = 0; t < indices.length; t += 3) {
      const corners = [indices[t], indices[t + 1], indices[t + 2]];
      if (!(corners.some((v) => side[v] === WITH_TRUNK) && corners.some((v) => side[v] === WITH_LIMB))) continue;
      across++;
      for (let k = 0; k < 3; k++) {
        const a = corners[k], b = corners[(k + 1) % 3], now = edge(positions, a, b);
        if (now > longest) { longest = now; was = edge(before, a, b); }
      }
    }
  }
  if (withTrunk || withLimb) partedSurfaces.push({ withTrunk, withLimb, across, longest, was });
  return { positions, normals: vertexNormals(positions, surface.indices), indices: surface.indices, colors: surface.colors, lines: surface.lines };
}

/** A limb bone moves as one rigid piece about its joint. */
export function deformRigid(surface: Surface, transform: RigidTransform): Surface {
  const positions = new Float32Array(surface.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const out = blendRigid([transform], [1], [surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]]);
    positions[i] = out[0]; positions[i + 1] = out[1]; positions[i + 2] = out[2];
  }
  return { positions, normals: vertexNormals(positions, surface.indices), indices: surface.indices, lines: surface.lines };
}

/** Deform a surface of the trunk or head, which follows only the bends of the column and never a limb lying beside it in the scan. */
export function deformAxial(surface: Surface, field: PostureField): Surface {
  const positions = new Float32Array(surface.positions.length);
  const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
  const head = field.pose.transforms.head, pelvis = field.pose.transforms.pelvis, trunk = field.pose.transforms.trunk;
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]];
    const towardsPelvis = smooth((p[1] - PELVIS_BEND.fromY) / (PELVIS_BEND.toY - PELVIS_BEND.fromY));
    const towardsHead = smooth((HEAD_BEND.fromY - p[1]) / (HEAD_BEND.fromY - HEAD_BEND.toY));
    const out = blendRigid([trunk, head, pelvis], [1 - towardsPelvis - towardsHead, towardsHead, towardsPelvis], p);
    positions[i] = out[0]; positions[i + 1] = out[1]; positions[i + 2] = out[2];
  }
  return { positions, normals: vertexNormals(positions, surface.indices), indices: surface.indices, lines: surface.lines };
}

export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = 3 * indices[t], b = 3 * indices[t + 1], c = 3 * indices[t + 2];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= n; normals[i + 1] /= n; normals[i + 2] /= n;
  }
  return normals;
}

/** Drop triangles whose vertices all satisfy a test, and any vertices left unused. */
export function removeTriangles(surface: Surface, remove: (x: number, y: number, z: number) => boolean): Surface {
  const { positions, normals, indices } = surface;
  const drop = new Uint8Array(positions.length / 3);
  for (let i = 0; i < drop.length; i++) drop[i] = remove(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]) ? 1 : 0;
  const keep: number[] = [];
  for (let t = 0; t < indices.length; t += 3) if (!(drop[indices[t]] && drop[indices[t + 1]] && drop[indices[t + 2]])) keep.push(indices[t], indices[t + 1], indices[t + 2]);
  const remap = new Int32Array(drop.length).fill(-1);
  let count = 0;
  for (const i of keep) if (remap[i] < 0) remap[i] = count++;
  const newPositions = new Float32Array(3 * count), newNormals = new Float32Array(3 * count);
  for (let i = 0; i < drop.length; i++) {
    const j = remap[i];
    if (j < 0) continue;
    for (let k = 0; k < 3; k++) { newPositions[3 * j + k] = positions[3 * i + k]; newNormals[3 * j + k] = normals[3 * i + k]; }
  }
  return { positions: newPositions, normals: newNormals, indices: Uint32Array.from(keep, (i) => remap[i]) };
}
