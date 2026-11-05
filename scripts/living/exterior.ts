/**
 * The body surface in the stance, as one closed surface. Source body voxels are carried forward
 * by the posture into a stance grid, gaps are closed and thin flaps removed, and the surface is taken
 * from the smoothed result. The scanned lower hind legs lay pressed flat against the embedding block, and
 * the source images crop the paws, so the shanks are replaced by simulated shapes whose radii are measured
 * from the leg tissue, and the paws are separate simulated parts.
 */
import { BONE_IDS, add, dot, length, scale, sub, unit, type Vec3 } from './rig';
import { weightsAt, type PostureField } from './posture';
import { blendRigid, JOINTS, type RigidTransform } from './rig';
import { surfaceNets, type Surface } from './surface-nets';
import { components, dilate, erode, smoothField, voxelIndex, type Grid } from './volume';

export interface ShankProfile { readonly knee: Vec3; readonly ankle: Vec3; readonly radii: readonly [number, number, number] }

/** The 80th percentile of the distance from the shank axis, near the knee, at mid shank and near the ankle. */
function measureShank(grid: Grid, owner: Uint8Array, bone: number, knee: Vec3, ankle: Vec3): readonly [number, number, number] {
  const axis = sub(ankle, knee), len = length(axis), direction = scale(axis, 1 / len);
  const bins: number[][] = [[], [], []];
  for (let z = 0; z < grid.nz; z += 2) for (let y = 0; y < grid.ny; y += 2) for (let x = 0; x < grid.nx; x += 2) {
    if (owner[voxelIndex(grid, x, y, z)] !== bone) continue;
    const relative = sub([x, y, z], knee);
    const along = dot(relative, direction) / len;
    if (along < 0 || along > 1) continue;
    bins[Math.min(2, Math.floor(along * 3))].push(length(sub(relative, scale(direction, along * len))));
  }
  const percentile = (values: number[]) => { const sorted = values.sort((a, b) => a - b); return sorted[Math.floor(sorted.length * 0.8)] ?? 8; };
  return [percentile(bins[0]), percentile(bins[1]), percentile(bins[2])];
}

const capsuleField = (p: Vec3, a: Vec3, b: Vec3, ra: number, rb: number) => {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return ra + (rb - ra) * t - length(sub(p, add(a, scale(ab, t))));
};

export function buildBodySurface(grid: Grid, body: Uint8Array, posture: PostureField): { surface: Surface; shanks: ShankProfile[] } {
  const { pose, owner } = posture;
  const excluded = new Set(['tibiaR', 'tibiaL', 'pesR', 'pesL', 'manusR', 'manusL'].map((id) => BONE_IDS.indexOf(id as (typeof BONE_IDS)[number])));
  const cell = 3;
  const origin: Vec3 = [-30, -30, pose.groundZ - 20];
  const stance: Grid = { nx: Math.ceil((grid.nx + 60) / cell), ny: Math.ceil((grid.ny + 60) / cell), nz: Math.ceil((grid.nz + 60 - pose.groundZ) / cell) };
  let occupied: Uint8Array<ArrayBufferLike> = new Uint8Array(stance.nx * stance.ny * stance.nz);
  const weights = new Float64Array(BONE_IDS.length);
  const moved: RigidTransform[] = [], factors: number[] = [];
  for (let z = 0; z < grid.nz; z += 2) for (let y = 0; y < grid.ny; y += 2) for (let x = 0; x < grid.nx; x += 2) {
    const at = voxelIndex(grid, x, y, z);
    if (!body[at] || excluded.has(owner[at])) continue;
    const p: Vec3 = [x, y, z];
    weightsAt(posture, p, weights);
    moved.length = 0; factors.length = 0;
    for (let k = 0; k < weights.length; k++) if (weights[k] > 0.005) { moved.push(posture.transforms[k]); factors.push(weights[k]); }
    const q = moved.length === 1 && moved[0] === posture.transforms[0] ? p : blendRigid(moved, factors, p);
    const cx = Math.floor((q[0] - origin[0]) / cell), cy = Math.floor((q[1] - origin[1]) / cell), cz = Math.floor((q[2] - origin[2]) / cell);
    if (cx >= 0 && cy >= 0 && cz >= 0 && cx < stance.nx && cy < stance.ny && cz < stance.nz) occupied[voxelIndex(stance, cx, cy, cz)] = 1;
  }
  // Close the gaps left by stretching, then remove thin flaps.
  occupied = erode(dilate(occupied, stance, 2), stance, 2);
  occupied = dilate(erode(occupied, stance, 2), stance, 2);
  // Scraps that came away from the body when the shanks were removed are not part of it.
  const { ids, list } = components(occupied, stance);
  const largest = list[0].id;
  for (let i = 0; i < occupied.length; i++) occupied[i] = ids[i] === largest ? 1 : 0;

  const j = pose.joints;
  const shanks: ShankProfile[] = [
    { knee: j.kneeR, ankle: j.ankleR, radii: measureShank(grid, owner, BONE_IDS.indexOf('tibiaR'), JOINTS.kneeR, JOINTS.ankleR) },
    { knee: j.kneeL, ankle: j.ankleL, radii: measureShank(grid, owner, BONE_IDS.indexOf('tibiaL'), JOINTS.kneeL, JOINTS.ankleL) },
  ];
  const field = new Float32Array(occupied.length);
  for (let i = 0; i < field.length; i++) field[i] = occupied[i];
  const smooth = smoothField(field, stance, 1);
  // Shanks and wrists join the field as soft shapes, one voxel cell wide at their boundary.
  const stations = (profile: ShankProfile) => {
    const axis = sub(profile.ankle, profile.knee);
    return { a: profile.knee, b: add(profile.knee, scale(axis, 0.5)), c: profile.ankle, ra: Math.min(22, profile.radii[0]), rb: Math.min(20, profile.radii[1]), rc: Math.min(12, profile.radii[2]) };
  };
  const shapes = shanks.map(stations);
  const wrists: { a: Vec3; b: Vec3 }[] = [
    { a: add(j.wristR, scale(unit(sub(j.elbowR, j.wristR)), 26)), b: j.wristR },
    { a: add(j.wristL, scale(unit(sub(j.elbowL, j.wristL)), 26)), b: j.wristL },
  ];
  for (let z = 0; z < stance.nz; z++) for (let y = 0; y < stance.ny; y++) for (let x = 0; x < stance.nx; x++) {
    const p: Vec3 = [origin[0] + (x + 0.5) * cell, origin[1] + (y + 0.5) * cell, origin[2] + (z + 0.5) * cell];
    let distance = -Infinity;
    for (const shape of shapes) {
      distance = Math.max(distance, capsuleField(p, shape.a, shape.b, shape.ra, shape.rb), capsuleField(p, shape.b, shape.c, shape.rb, shape.rc));
    }
    for (const wrist of wrists) distance = Math.max(distance, capsuleField(p, wrist.a, wrist.b, 13, 9.5));
    if (distance < -cell) continue;
    const value = Math.max(0, Math.min(1, 0.5 + distance / (2 * cell)));
    const at = voxelIndex(stance, x, y, z);
    if (value > smooth[at]) smooth[at] = value;
  }
  const surface = surfaceNets(smooth, stance, 0.5, [origin[0] + 0.5 * cell, origin[1] + 0.5 * cell, origin[2] + 0.5 * cell], cell);
  return { surface, shanks };
}
