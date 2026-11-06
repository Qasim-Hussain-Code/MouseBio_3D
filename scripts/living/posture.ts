/**
 * Soft tissue follows the nearest bone. Skeleton voxels are assigned to limb segments
 * or the trunk, a breadth-first search through the body carries that assignment to
 * every body voxel, and the result is stored as smoothed weights on a coarse grid.
 * Surfaces are then deformed vertex by vertex with blended rigid transforms.
 */
import { blendRigid, BONE_IDS, boneOfVoxel, HEAD_BEND, PELVIS_BEND, stancePose, type BoneId, type RigidTransform, type StancePose, type Vec3 } from './rig';
import type { Surface } from './surface-nets';
import { smoothField, voxelIndex, type Grid } from './volume';

const UNASSIGNED = 255;
export const CELL = 4;

export interface PostureField {
  readonly pose: StancePose;
  readonly coarse: Grid;
  readonly weights: readonly Float32Array[];
  readonly transforms: readonly RigidTransform[];
  readonly owner: Uint8Array;
}

/** `bone` marks skeleton voxels, `organs` voxels that stay with the trunk, and `body` every voxel that tissue can be assigned to. */
export function buildPosture(grid: Grid, body: Uint8Array, bone: Uint8Array, organs: Uint8Array): PostureField {
  const { nx, ny, nz } = grid;
  const owner = new Uint8Array(body.length).fill(UNASSIGNED);
  const queue = new Int32Array(body.length);
  let head = 0, tail = 0;
  const index = new Map<BoneId, number>(BONE_IDS.map((id, i) => [id, i]));
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z);
    if (organs[at]) { owner[at] = 0; queue[tail++] = at; continue; }
    if (!bone[at]) continue;
    owner[at] = index.get(boneOfVoxel([x, y, z]))!;
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
  return { pose, coarse, owner, weights: raw.map((field) => smoothField(field, coarse, 2)), transforms: BONE_IDS.map((id) => pose.transforms[id]) };
}

/** Normalized weights of every bone at a point in source voxel coordinates, the trunk when nothing is near. */
export function weightsAt(field: PostureField, p: Vec3, out: Float64Array): void {
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
  if (total < 1e-6) { out.fill(0); out[0] = 1; return; }
  for (let k = 0; k < out.length; k++) out[k] /= total;
}

/** Deform a surface given in source voxel coordinates to the stance. */
export function deformSurface(surface: Surface, field: PostureField): Surface {
  const positions = new Float32Array(surface.positions.length);
  const weights = new Float64Array(BONE_IDS.length);
  const moved: RigidTransform[] = [], factors: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]];
    weightsAt(field, p, weights);
    if (weights[0] > 0.999) { positions[i] = p[0]; positions[i + 1] = p[1]; positions[i + 2] = p[2]; continue; }
    moved.length = 0; factors.length = 0;
    for (let k = 0; k < weights.length; k++) if (weights[k] > 0.005) { moved.push(field.transforms[k]); factors.push(weights[k]); }
    const out = blendRigid(moved, factors, p);
    positions[i] = out[0]; positions[i + 1] = out[1]; positions[i + 2] = out[2];
  }
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
