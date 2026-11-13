/**
 * The body surface in the stance, as one closed surface. Source body voxels are carried forward
 * by the posture into a stance grid, gaps are closed and thin flaps removed, and the surface is taken
 * from the smoothed result. The scanned lower hind legs lay pressed flat against the embedding block, the
 * scanned forearms ended in a blunt mass of tissue round the wrists, and the source images crop the paws, so the
 * shanks and forearms are replaced by simulated shapes whose radii are measured from the limb tissue and limited to
 * a slender limb, and the paws are separate simulated parts. Each simulated limb follows the centre line of its own
 * measured bones in the stance, and is at least wide enough to hold most of them.
 */
import { BONE_IDS, add, applyRigid, dot, length, scale, sub, type Vec3 } from './rig';
import { weightsAt, WITH_LIMB, type PostureField } from './posture';
import { blendRigid, JOINTS, type RigidTransform } from './rig';
import { surfaceNets, type Surface } from './surface-nets';
import { components, dilate, erode, partSheets, smoothField, voxelIndex, type Grid } from './volume';

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

/** A simulated limb: a line through the middle of its bones, with a radius at each point. */
export interface LimbTube { readonly points: readonly Vec3[]; readonly radii: readonly number[] }

const LINE_BINS = 5;

/** Where the bones of a limb segment lie in the stance: the middle of each of five lengths, and how far most of the bone reaches from it. */
function boneLine(grid: Grid, bone: Uint8Array, posture: PostureField, id: (typeof BONE_IDS)[number], start: Vec3, end: Vec3): { centres: Vec3[]; reach: number[] } {
  const index = BONE_IDS.indexOf(id), transform = posture.transforms[index];
  const axis = sub(end, start), len = length(axis), direction = scale(axis, 1 / len);
  const moved: Vec3[][] = Array.from({ length: LINE_BINS }, () => []);
  for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
    const at = voxelIndex(grid, x, y, z);
    if (!bone[at] || posture.owner[at] !== index) continue;
    const along = dot(sub([x, y, z], start), direction) / len;
    if (along >= 0 && along < 1) moved[Math.floor(along * LINE_BINS)].push(applyRigid(transform, [x, y, z]));
  }
  const centres: Vec3[] = [], reach: number[] = [];
  for (const list of moved) {
    if (!list.length) throw new Error(`No bone found along ${id}`);
    const centre = scale(list.reduce<Vec3>((sum, p) => add(sum, p), [0, 0, 0]), 1 / list.length);
    const distances = list.map((p) => length(sub(p, centre))).sort((a, b) => a - b);
    centres.push(centre); reach.push(distances[Math.floor(distances.length * 0.95)]);
  }
  return { centres, reach };
}

/** Parameter along a limb, distance from its line, and radius there, at the nearest point of the line. */
export function nearestOnTube(tube: LimbTube, p: Vec3): { along: number; distance: number; radius: number; centre: Vec3 } {
  let best = { along: 0, distance: Infinity, radius: 0, centre: tube.points[0] };
  const segments = tube.points.length - 1;
  for (let k = 0; k < segments; k++) {
    const a = tube.points[k], ab = sub(tube.points[k + 1], a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
    const centre = add(a, scale(ab, t)), distance = length(sub(p, centre));
    if (distance < best.distance) best = { along: (k + t) / segments, distance, radius: tube.radii[k] + (tube.radii[k + 1] - tube.radii[k]) * t, centre };
  }
  return best;
}

const capsuleField = (p: Vec3, a: Vec3, b: Vec3, ra: number, rb: number) => {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return ra + (rb - ra) * t - length(sub(p, add(a, scale(ab, t))));
};

/**
 * How far a cell lies inside the body, in cells, from the smoothed field of the body: negative outside. The field is a mask smoothed
 * by three passes of a box three cells wide, so across a flat face of the body it takes these values at the centres of the cells,
 * and its level of 0.5 lies on the face. Where the field is zero the body is more than three cells away.
 */
const FIELD_STEPS = [0, 1 / 27, 4 / 27, 10 / 27, 17 / 27, 23 / 27, 26 / 27, 1];
export function depthInBody(value: number): number {
  if (value <= 0) return -Infinity;
  if (value >= 1) return 3.5;
  let k = 1;
  while (value > FIELD_STEPS[k]) k++;
  return k - 4.5 + (value - FIELD_STEPS[k - 1]) / (FIELD_STEPS[k] - FIELD_STEPS[k - 1]);
}

/**
 * Where a simulated limb meets the body, the tissue that was carried into the stance beside the limb that was taken away is ragged,
 * and the grid of 0.3 mm drew the line where the two meet as a row of teeth. There the field is smoothed once more: wholly on the
 * limb where the body is within 1.5 cells and on the body where it touches the limb, and less and less up to JOIN_REACH cells from
 * the limb and 3.5 cells from the body. `body` and `limb` are the depths in each, in cells, negative outside.
 */
export const JOIN_REACH = 5, JOIN_SMOOTH = 2;
export function joinShare(body: number, limb: number): number {
  const ramp = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
  return ramp((limb + JOIN_REACH) / JOIN_REACH) * ramp((body + 3.5) / 2);
}

/** The body on the stance grid: its smoothed field, whose level of 0.5 is the skin, the cells inside, and for each cell outside the nearest cell inside, found outwards in steps. */
export interface UnderSkin { readonly grid: Grid; readonly origin: Vec3; readonly cell: number; readonly inside: Uint8Array; readonly nearest: Int32Array; readonly smooth: Float32Array }

function nearestInside(inside: Uint8Array, grid: Grid, reach: number): Int32Array {
  const nearest = new Int32Array(inside.length).fill(-1);
  let frontier: number[] = [];
  for (let i = 0; i < inside.length; i++) if (inside[i]) { nearest[i] = i; frontier.push(i); }
  const steps = [1, -1, grid.nx, -grid.nx, grid.nx * grid.ny, -grid.nx * grid.ny];
  const position = (i: number): Vec3 => { const x = i % grid.nx, rest = (i - x) / grid.nx, y = rest % grid.ny; return [x, y, (rest - y) / grid.ny]; };
  for (let pass = 0; pass < reach && frontier.length; pass++) {
    const next: number[] = [];
    for (const i of frontier) for (const step of steps) {
      const j = i + step;
      if (j < 0 || j >= inside.length || nearest[j] >= 0) continue;
      // Steps that would wrap round the edge of the grid are not neighbours.
      const a = position(i), b = position(j);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) !== 1) continue;
      nearest[j] = nearest[i];
      next.push(j);
    }
    frontier = next;
  }
  return nearest;
}

/** The smoothed field of the body at a point, between the centres of its cells, where the skin is its level of 0.5. */
function bodyValue(field: UnderSkin, p: Vec3): number {
  const { grid, origin, cell, smooth } = field;
  const fx = (p[0] - origin[0]) / cell - 0.5, fy = (p[1] - origin[1]) / cell - 0.5, fz = (p[2] - origin[2]) / cell - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz), tx = fx - x0, ty = fy - y0, tz = fz - z0;
  let value = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const x = x0 + dx, y = y0 + dy, z = z0 + dz;
    if (x < 0 || y < 0 || z < 0 || x >= grid.nx || y >= grid.ny || z >= grid.nz) continue;
    value += (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz) * smooth[voxelIndex(grid, x, y, z)];
  }
  return value;
}

/**
 * A point standing outside the body, moved to just under the skin. It goes up the slope of the smoothed field of the body, whose level
 * of 0.5 is the skin, and then `clearance` further in, so that neighbouring points move alike and a surface keeps its order instead of
 * gathering on one place. From further out than the slope reaches, it first goes straight towards the nearest cell inside the body.
 * A point inside comes back unchanged, and so does one too far out to have a cell inside near it.
 */
export function underSkin(field: UnderSkin, p: Vec3, clearance: number): Vec3 {
  if (bodyValue(field, p) >= 0.5) return p;
  const { grid, origin, cell } = field;
  const x = Math.floor((p[0] - origin[0]) / cell), y = Math.floor((p[1] - origin[1]) / cell), z = Math.floor((p[2] - origin[2]) / cell);
  if (x < 0 || y < 0 || z < 0 || x >= grid.nx || y >= grid.ny || z >= grid.nz) return p;
  const seed = field.nearest[voxelIndex(grid, x, y, z)];
  if (seed < 0) return p;
  const sx = seed % grid.nx, rest = (seed - sx) / grid.nx, sy = rest % grid.ny, sz = (rest - sy) / grid.ny;
  const inner: Vec3 = [origin[0] + (sx + 0.5) * cell, origin[1] + (sy + 0.5) * cell, origin[2] + (sz + 0.5) * cell];
  let q = p;
  const SLOPE = 0.02;
  if (bodyValue(field, q) < SLOPE) {
    const to = sub(inner, p), steps = Math.max(1, Math.ceil(length(to) / (0.25 * cell)));
    for (let k = 1; k <= steps && bodyValue(field, q) < SLOPE; k++) q = add(p, scale(to, k / steps));
  }
  const h = 0.5 * cell;
  const slope = (at: Vec3): Vec3 => [
    (bodyValue(field, [at[0] + h, at[1], at[2]]) - bodyValue(field, [at[0] - h, at[1], at[2]])) / (2 * h),
    (bodyValue(field, [at[0], at[1] + h, at[2]]) - bodyValue(field, [at[0], at[1] - h, at[2]])) / (2 * h),
    (bodyValue(field, [at[0], at[1], at[2] + h]) - bodyValue(field, [at[0], at[1], at[2] - h])) / (2 * h),
  ];
  let way: Vec3 | null = null;
  for (let k = 0; k < 64; k++) {
    const value = bodyValue(field, q), g = slope(q), size = length(g);
    if (size < 1e-6) break;
    way = scale(g, 1 / size);
    if (value >= 0.5) break;
    q = add(q, scale(way, Math.min(0.5 * cell, (0.5 - value) / size + 0.05 * cell)));
  }
  if (way && bodyValue(field, q) >= 0.5) return add(q, scale(way, clearance));
  // Where the slope gives no way in, the point goes to the nearest cell inside, as far in as the clearance.
  const to = sub(inner, p), span = length(to) || 1;
  return add(inner, scale(to, clearance / span));
}

export function buildBodySurface(grid: Grid, body: Uint8Array, bone: Uint8Array, posture: PostureField): { surface: Surface; shanks: ShankProfile[]; tubes: LimbTube[]; under: UnderSkin } {
  const { pose, owner } = posture;
  const excluded = new Set(['tibiaR', 'tibiaL', 'pesR', 'pesL', 'manusR', 'manusL', 'forearmR', 'forearmL'].map((id) => BONE_IDS.indexOf(id as (typeof BONE_IDS)[number])));
  const axial = new Set(['trunk', 'head', 'pelvis'].map((id) => BONE_IDS.indexOf(id as (typeof BONE_IDS)[number])));
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
    // Tissue that the trunk holds on the limb's side of a parting lay against a forearm or a paw, and is left out as they are.
    if (weightsAt(posture, p, weights) === WITH_LIMB && axial.has(owner[at])) continue;
    moved.length = 0; factors.length = 0;
    for (let k = 0; k < weights.length; k++) if (weights[k] > 0.005) { moved.push(posture.transforms[k]); factors.push(weights[k]); }
    const q = moved.length === 1 && moved[0] === posture.transforms[0] ? p : blendRigid(moved, factors, p);
    const cx = Math.floor((q[0] - origin[0]) / cell), cy = Math.floor((q[1] - origin[1]) / cell), cz = Math.floor((q[2] - origin[2]) / cell);
    if (cx >= 0 && cy >= 0 && cz >= 0 && cx < stance.nx && cy < stance.ny && cz < stance.nz) occupied[voxelIndex(stance, cx, cy, cz)] = 1;
  }
  // Close the gaps left by stretching, then remove thin flaps.
  const nearly = erode(dilate(occupied, stance, 3), stance, 3);
  // Behind the neck, narrow folds between a limb and the trunk are filled as well, as loose skin and fur fill them on a living animal. The head keeps its finer shape, with the hollows of the eyes.
  const fuller = erode(dilate(occupied, stance, 7), stance, 7);
  const neckAt = Math.floor((Math.min(pose.joints.shoulderR[1], pose.joints.shoulderL[1]) - 12 - origin[1]) / cell);
  occupied = nearly;
  for (let z = 0; z < stance.nz; z++) for (let y = Math.max(0, neckAt); y < stance.ny; y++) for (let x = 0; x < stance.nx; x++) {
    const at = voxelIndex(stance, x, y, z);
    if (fuller[at]) occupied[at] = 1;
  }
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
  const forearms: ShankProfile[] = [
    { knee: j.elbowR, ankle: j.wristR, radii: measureShank(grid, owner, BONE_IDS.indexOf('forearmR'), JOINTS.elbowR, JOINTS.wristR) },
    { knee: j.elbowL, ankle: j.wristL, radii: measureShank(grid, owner, BONE_IDS.indexOf('forearmL'), JOINTS.elbowL, JOINTS.wristL) },
  ];
  const field = new Float32Array(occupied.length);
  for (let i = 0; i < field.length; i++) field[i] = occupied[i];
  const smooth = smoothField(field, stance, 1);
  // Shanks and forearms join the field as soft shapes, one voxel cell wide at their boundary.
  // The lower end is lifted so that it stays inside the paw and does not show through the sole.
  const tube = (profile: ShankProfile, id: (typeof BONE_IDS)[number], start: Vec3, end: Vec3, caps: readonly [number, number, number], lift: number): LimbTube => {
    const line = boneLine(grid, bone, posture, id, start, end);
    const wanted = (t: number) => {
      const limit = (k: number) => Math.min(caps[k], profile.radii[k]);
      return t < 0.5 ? limit(0) + (limit(1) - limit(0)) * t * 2 : limit(1) + (limit(2) - limit(1)) * (t - 0.5) * 2;
    };
    const points: Vec3[] = [profile.knee, ...line.centres, add(profile.ankle, [0, 0, lift])];
    const radii = [wanted(0), ...line.centres.map((_, k) => Math.max(wanted((k + 0.5) / LINE_BINS), line.reach[k] + 1)), wanted(1)];
    return { points, radii };
  };
  const tubes: LimbTube[] = [
    tube(shanks[0], 'tibiaR', JOINTS.kneeR, JOINTS.ankleR, [22, 20, 10], 7), tube(shanks[1], 'tibiaL', JOINTS.kneeL, JOINTS.ankleL, [22, 20, 10], 7),
    tube(forearms[0], 'forearmR', JOINTS.elbowR, JOINTS.wristR, [20, 15, 8], 6), tube(forearms[1], 'forearmL', JOINTS.elbowL, JOINTS.wristL, [20, 15, 8], 6),
  ];
  const share = new Float32Array(smooth.length);
  for (let z = 0; z < stance.nz; z++) for (let y = 0; y < stance.ny; y++) for (let x = 0; x < stance.nx; x++) {
    const p: Vec3 = [origin[0] + (x + 0.5) * cell, origin[1] + (y + 0.5) * cell, origin[2] + (z + 0.5) * cell];
    let distance = -Infinity;
    for (const shape of tubes) for (let k = 0; k + 1 < shape.points.length; k++) {
      distance = Math.max(distance, capsuleField(p, shape.points[k], shape.points[k + 1], shape.radii[k], shape.radii[k + 1]));
    }
    const at = voxelIndex(stance, x, y, z);
    share[at] = joinShare(depthInBody(smooth[at]), distance / cell);
    if (distance < -cell) continue;
    const value = Math.max(0, Math.min(1, 0.5 + distance / (2 * cell)));
    if (value > smooth[at]) smooth[at] = value;
  }
  // Where a limb meets the body the field is smoothed once more.
  const softer = smoothField(smooth, stance, JOIN_SMOOTH);
  for (let i = 0; i < smooth.length; i++) if (share[i]) smooth[i] += share[i] * (softer[i] - smooth[i]);
  // Where two sheets of the skin would meet along an edge, as where a limb just touches the trunk, they are parted.
  partSheets(smooth, stance, 0.5);
  const surface = surfaceNets(smooth, stance, 0.5, [origin[0] + 0.5 * cell, origin[1] + 0.5 * cell, origin[2] + 0.5 * cell], cell);
  const inside = new Uint8Array(smooth.length);
  for (let i = 0; i < smooth.length; i++) inside[i] = smooth[i] >= 0.5 ? 1 : 0;
  return { surface, shanks, tubes, under: { grid: stance, origin, cell, inside, nearest: nearestInside(inside, stance, 24), smooth } };
}
