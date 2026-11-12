/**
 * Builds the living mouse reference from the packaged Digimouse images, in a simulated standing posture.
 *
 * Usage, from the project root, after scripts/living/decode_inputs.py:
 *   tsx scripts/living/build.ts [--work <dir>]
 * The output is deterministic for the same inputs.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPosture, deformAxial, deformRigid, deformSurface, vertexNormals, type PostureField } from './posture';
import { bodyCoat, shortCoat } from './coat';
import { BONES, partitionBones, ribCourses, smallBoneAt } from './bones';
import { buildInteriors } from './interiors';
import { buildTrees } from './organ-trees';
import { buildBodySurface, nearestOnTube, underSkin, type LimbTube, type UnderSkin } from './exterior';
import { clusterSurface, extractSurface, maskBox, mergeSurfaces, tube } from './extract';
import { flowLinesOf, FLOW_NOTICE } from './flow-paths';
import { writeGlb, type GlbSurface } from './glb';
import { add, boneOfVoxel, cross, JOINTS, scale, unit, type Vec3 } from './rig';
import { components, dilate, erode, voxelIndex, type Grid } from './volume';
import type { Surface } from './surface-nets';
import { buildAttachments, type PawField } from './attachments';
import { HEART, MIDDLE_X, STOMACH, STRUCTURES, type Plan } from './structures';
import { TRACED, traceTissues } from './trace';
import { buildInternal } from './internal';
import { buildLimbRoutes } from './limb-routes';
import { measureLandmarks } from './landmarks';
import { fibreAttribute, MUSCLES, muscleSurface, partitionMuscles, UNNAMED } from './muscles';

const ROOT = path.resolve(import.meta.dirname, '../..');
const argument = process.argv.indexOf('--work');
const WORK = argument > 0 ? process.argv[argument + 1] : path.join(os.homedir(), 'mousebio-work');
const OUT = path.join(ROOT, 'public/atlas-living');
const METRES = 0.0001;
const grid: Grid = { nx: 380, ny: 992, nz: 208 };
const { nx, ny, nz } = grid;
const voxels = nx * ny * nz;

const labels = fs.readFileSync(path.join(WORK, 'labels.bin'));
const ct = fs.readFileSync(path.join(WORK, 'ct.bin'));
const log = (...values: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...values);

// Bone: the source skeleton label, and CT bone in the paws, which the source labels crop.
const BONE_CT = 215;
const body = new Uint8Array(voxels);
const bone = new Uint8Array(voxels);
for (let i = 0; i < voxels; i++) if (labels[i]) { body[i] = 1; if (labels[i] === 2) bone[i] = 1; }
const near = dilate(body, grid, 25);
for (let i = 0; i < voxels; i++) if (near[i] && !body[i] && ct[i] >= BONE_CT) { bone[i] = 1; body[i] = 1; }
log('masks', bone.reduce((sum, value) => sum + value, 0));

const organs = new Uint8Array(voxels);
for (let i = 0; i < voxels; i++) if (labels[i] > 2) organs[i] = 1;
const posture: PostureField = buildPosture(grid, body, bone, organs);
log('posture');

// Traced tissue classes are reused between runs with --cached, which is only for trying out surfaces.
const tissueFile = path.join(WORK, 'tissues.bin');
let tissues: Uint8Array;
const cavityFile = path.join(WORK, 'cavity.bin');
let cavity: Uint8Array;
if (process.argv.includes('--cached') && fs.existsSync(tissueFile) && fs.existsSync(cavityFile)) { tissues = fs.readFileSync(tissueFile); cavity = fs.readFileSync(cavityFile); }
else {
  const traced = traceTissues({ grid, labels, ct, rgb: fs.readFileSync(path.join(WORK, 'rgb.bin')) });
  tissues = traced.classes;
  cavity = traced.cavity;
  fs.writeFileSync(tissueFile, tissues);
  fs.writeFileSync(cavityFile, cavity);
  log('traced', JSON.stringify(traced.report));
}

const SHELLS: Record<string, ReadonlySet<number>> = { pericardium: new Set([9]), pleura: new Set([21]), meninges: new Set([4, 5, 6, 7, 8, 10]) };
const LIMB_PARTS = new Set(['cervical-lymph-nodes', 'axillary-lymph-nodes', 'brachial-lymph-nodes', 'inguinal-lymph-nodes', 'sciatic-lymph-nodes', 'mediastinal-lymph-nodes', 'pyloric-lymph-nodes', 'renal-lymph-nodes', 'lumbar-lymph-nodes', 'mesenteric-lymph-node', 'caudal-lymph-node']);

/**
 * The traced gut divided by estimate: 1 the caecum, the largest thick part on the left of the abdomen;
 * 2 the colon and rectum, behind the bladder; 3 the rest, which is mostly small intestine.
 */
let gutCache: Uint8Array | null = null;
const GUT_SPECK_VOXELS = 6000;
function gutParts(): Uint8Array {
  if (gutCache) return gutCache;
  const gut = new Uint8Array(voxels);
  for (let i = 0; i < voxels; i++) if (tissues[i] === TRACED.gut) gut[i] = 1;
  const free = new Uint8Array(voxels);
  for (let i = 0; i < voxels; i++) free[i] = labels[i] === 1 ? 1 : 0;
  const grown = dilate(gut, grid, 2, free);
  // Pieces of the same colours elsewhere are not gut: one lay in the forelimb, one in the thigh and one on the ventral midline below the bladder, where the colon does not run.
  const pieces = components(grown, grid);
  const speck = new Set(pieces.list.filter((piece) => piece.size < GUT_SPECK_VOXELS).map((piece) => piece.id));
  log('gut specks removed', speck.size);
  const thick = dilate(erode(gut, grid, 13), grid, 13, gut);
  const { ids, list } = components(thick, grid);
  const caecum = list.find((item) => item.centroid[0] > 190)?.id ?? -1;
  log('gut thick parts', list.slice(0, 5).map((item) => `${item.size}@${item.centroid.map((v) => v.toFixed(0)).join(',')}`).join(' '));
  const out = new Uint8Array(voxels);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z);
    if (!grown[at] || speck.has(pieces.ids[at])) continue;
    out[at] = ids[at] === caecum ? 1 : y > 720 ? 2 : 3;
  }
  // The wall grown round the caecum goes with the caecum.
  gutCache = out;
  return out;
}

let skinCache: Surface | null = null;
let limbTubes: readonly LimbTube[] = [];
let skinField: UnderSkin | null = null;
function skinSurface(): Surface {
  if (skinCache) return skinCache;
  const exterior = buildBodySurface(grid, body, bone, posture);
  limbTubes = exterior.tubes;
  skinField = exterior.under;
  log('shank radii', exterior.shanks.map((shank) => shank.radii.map((r) => r.toFixed(1)).join('/')).join(' '));
  skinCache = exterior.surface;
  return skinCache;
}

function build(plan: Plan): Surface {
  if (plan.kind === 'skin') return skinSurface();
  if (plan.kind === 'traced') {
    const value = TRACED[plan.tissue];
    let mask: Uint8Array<ArrayBufferLike> = new Uint8Array(voxels);
    for (let i = 0; i < voxels; i++) if (tissues[i] === value) mask[i] = 1;
    if (plan.grow) {
      const free = new Uint8Array(voxels);
      for (let i = 0; i < voxels; i++) free[i] = labels[i] === 1 ? 1 : 0;
      mask = dilate(mask, grid, plan.grow, free);
    }
    const box = maskBox(grid, (i) => !!mask[i]);
    const scan = clusterSurface(extractSurface(grid, (i) => mask[i], box, { step: plan.step, radius: plan.radius }), 3.4);
    // Vessels and air spaces belong to the trunk and head; only fat and muscle follow the limbs.
    return plan.tissue === 'blood' || plan.tissue === 'airway' ? deformAxial(scan, posture) : deformSurface(scan, posture);
  }
  if (plan.kind === 'shell') {
    let mask: Uint8Array<ArrayBufferLike> = new Uint8Array(voxels);
    if (plan.membrane === 'peritoneum') { for (let i = 0; i < voxels; i++) if (cavity[i] && labels[i]) mask[i] = 1; }
    else { const wanted = SHELLS[plan.membrane]; for (let i = 0; i < voxels; i++) if (wanted.has(labels[i])) mask[i] = 1; mask = dilate(mask, grid, plan.grow); }
    const box = maskBox(grid, (i) => !!mask[i]);
    return deformAxial(clusterSurface(extractSurface(grid, (i) => mask[i], box, { step: plan.step, radius: plan.radius }), 4), posture);
  }
  if (plan.kind === 'label-part') {
    const { label, seeds, index, lowX, highX } = plan;
    const inside = (at: number) => {
      if (labels[at] !== label) return false;
      const x = at % nx, rest = (at - x) / nx, y = rest % ny, z = (rest - y) / ny;
      if ((lowX !== undefined && x < lowX) || (highX !== undefined && x >= highX)) return false;
      let best = 0, bestDistance = Infinity;
      for (let k = 0; k < seeds.length; k++) {
        const distance = (x - seeds[k][0]) ** 2 + (y - seeds[k][1]) ** 2 + (z - seeds[k][2]) ** 2;
        if (distance < bestDistance) { bestDistance = distance; best = k; }
      }
      return Array.isArray(index) ? index.includes(best) : best === index;
    };
    const box = maskBox(grid, inside);
    return deformAxial(extractSurface(grid, (i) => inside(i) ? 1 : 0, box, { step: 2, radius: 1, isovalue: seeds.length > 1 ? 0.56 : 0.5 }), posture);
  }
  if (plan.kind === 'gut-part') {
    const parts = gutParts();
    const value = plan.part === 'caecum' ? 1 : plan.part === 'colon' ? 2 : 3;
    const box = maskBox(grid, (i) => parts[i] === value);
    return deformAxial(clusterSurface(extractSurface(grid, (i) => parts[i] === value ? 1 : 0, box, { step: 2, radius: 1, isovalue: 0.54 }), 2.8), posture);
  }
  if (plan.kind === 'labels') {
    const wanted = new Set(plan.labels);
    const box = maskBox(grid, (i) => wanted.has(labels[i]));
    return deformSurface(extractSurface(grid, (i) => wanted.has(labels[i]) ? 1 : 0, box, { step: plan.step ?? 2, radius: plan.radius ?? 1 }), posture);
  }
  throw new Error(`Unknown plan ${JSON.stringify(plan)}`);
}

fs.mkdirSync(OUT, { recursive: true });
const surfaces: GlbSurface[] = [];
/** The surfaces built so far, in the frame of the stance, for what is placed on or in them. */
const builtSurfaces = new Map<string, Surface>();

/** A core along the shaft of a bone, on its centre line and under half of its thickness there, both measured from its own surface. */
function shaftCore(bone: Surface): Surface {
  const count = bone.positions.length / 3;
  const mean: Vec3 = [0, 0, 0];
  for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) mean[k] += bone.positions[3 * i + k] / count;
  // The long axis, by repeated multiplication with the scatter of the points.
  let axis: Vec3 = [1, 1, 1];
  for (let round = 0; round < 24; round++) {
    const next: Vec3 = [0, 0, 0];
    for (let i = 0; i < count; i += 3) {
      const d: Vec3 = [bone.positions[3 * i] - mean[0], bone.positions[3 * i + 1] - mean[1], bone.positions[3 * i + 2] - mean[2]];
      const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
      for (let k = 0; k < 3; k++) next[k] += d[k] * along;
    }
    const size = Math.hypot(next[0], next[1], next[2]) || 1;
    axis = [next[0] / size, next[1] / size, next[2] / size];
  }
  let low = Infinity, high = -Infinity;
  const place = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    place[i] = (bone.positions[3 * i] - mean[0]) * axis[0] + (bone.positions[3 * i + 1] - mean[1]) * axis[1] + (bone.positions[3 * i + 2] - mean[2]) * axis[2];
    low = Math.min(low, place[i]); high = Math.max(high, place[i]);
  }
  const BINS = 9, points: Vec3[] = [], radii: number[] = [];
  for (let bin = 0; bin < BINS; bin++) {
    const from = low + (high - low) * (0.16 + 0.68 * bin / BINS), to = low + (high - low) * (0.16 + 0.68 * (bin + 1) / BINS);
    const centre: Vec3 = [0, 0, 0]; let inside = 0;
    for (let i = 0; i < count; i++) if (place[i] >= from && place[i] < to) { inside += 1; for (let k = 0; k < 3; k++) centre[k] += bone.positions[3 * i + k]; }
    if (!inside) continue;
    for (let k = 0; k < 3; k++) centre[k] /= inside;
    const distances: number[] = [];
    for (let i = 0; i < count; i++) if (place[i] >= from && place[i] < to) distances.push(Math.hypot(bone.positions[3 * i] - centre[0], bone.positions[3 * i + 1] - centre[1], bone.positions[3 * i + 2] - centre[2]));
    distances.sort((left, right) => left - right);
    points.push(centre);
    radii.push(Math.max(0.6, 0.42 * distances[Math.floor(distances.length * 0.25)]));
  }
  return tube(points, radii, 10);
}

/** Points spread out over surfaces, each as far as can be from the others, the same every time. */
function spreadPoints(on: readonly Surface[], wanted: number): { readonly at: Vec3; readonly normal: Vec3 }[] {
  const pool: { at: Vec3; normal: Vec3; gap: number }[] = [];
  for (const surface of on) {
    const stride = Math.max(1, Math.floor(surface.positions.length / 3 / (wanted * 12)));
    for (let i = 0; i < surface.positions.length / 3; i += stride) pool.push({ at: [surface.positions[3 * i], surface.positions[3 * i + 1], surface.positions[3 * i + 2]], normal: [surface.normals[3 * i], surface.normals[3 * i + 1], surface.normals[3 * i + 2]], gap: Infinity });
  }
  const chosen: { at: Vec3; normal: Vec3 }[] = [];
  let next = pool[0];
  while (chosen.length < wanted) {
    chosen.push({ at: next.at, normal: next.normal });
    let best = next, widest = -1;
    for (const item of pool) {
      item.gap = Math.min(item.gap, Math.hypot(item.at[0] - next.at[0], item.at[1] - next.at[1], item.at[2] - next.at[2]));
      if (item.gap > widest) { widest = item.gap; best = item; }
    }
    next = best;
  }
  return chosen;
}

/** Flattened patches lying on a surface, each turned to face out from it. */
function surfacePatches(on: readonly Surface[], count: number, radii: readonly [number, number, number]): Surface {
  return mergeSurfaces(spreadPoints(on, count).map(({ at, normal }) => {
    const n = unit(normal), u = unit(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0])), v = cross(n, u);
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    const ROWS = 8, COLUMNS = 14;
    for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLUMNS; c++) {
      const theta = Math.PI * r / ROWS, phi = 2 * Math.PI * c / COLUMNS;
      const a = Math.sin(theta) * Math.cos(phi), b = Math.sin(theta) * Math.sin(phi), d = Math.cos(theta);
      for (let k = 0; k < 3; k++) { positions.push(at[k] + radii[0] * a * u[k] + radii[1] * b * v[k] + radii[2] * d * n[k]); normals.push(a * u[k] + b * v[k] + d * n[k]); }
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLUMNS; c++) { const p = r * (COLUMNS + 1) + c, q = p + COLUMNS + 1; indices.push(p, q, p + 1, p + 1, q, q + 1); }
    return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) } as Surface;
  }));
}

/** A net of thin strands on surfaces, joining each spread point to its two nearest neighbours. */
function surfaceNet(on: readonly Surface[], count: number, radius: number): Surface {
  const points = spreadPoints(on, count);
  const strands: Surface[] = [], done = new Set<string>();
  for (let index = 0; index < points.length; index++) {
    const nearest = points.map((item, other) => ({ other, gap: other === index ? Infinity : Math.hypot(item.at[0] - points[index].at[0], item.at[1] - points[index].at[1], item.at[2] - points[index].at[2]) })).sort((left, right) => left.gap - right.gap).slice(0, 2);
    for (const { other, gap } of nearest) {
      const key = index < other ? index + ':' + other : other + ':' + index;
      if (done.has(key) || gap > 40) continue;
      done.add(key);
      const lift = (p: { at: Vec3; normal: Vec3 }): Vec3 => add(p.at, scale(unit(p.normal), 0.7));
      strands.push(tube([lift(points[index]), lift(points[other])], [radius, radius], 3));
    }
  }
  return mergeSurfaces(strands);
}
const records: Record<string, unknown>[] = [];
const toMetres = (values: Float32Array) => { const out = new Float32Array(values.length); for (let i = 0; i < values.length; i++) out[i] = values[i] * METRES; return out; };

const landmarks = measureLandmarks(grid, labels, ct);
const attachments = buildAttachments(posture, { labels, grid, landmarks });
const trees = buildTrees(grid, labels, landmarks, (i) => gutParts()[i] !== 0);
log('trees', Object.entries(trees).map(([name, surface]) => `${name} ${surface.indices.length / 3}`).join(', '));
// Named bones from the CT, with the same test for bone as before: the source label and nearby CT bone outside the labelled body.
const labelledBone = new Uint8Array(voxels);
for (let i = 0; i < voxels; i++) labelledBone[i] = labels[i] === 2 ? 1 : 0;
const allowedBone = dilate(labelledBone, grid, 2);
const inForePaw = (i: number) => {
  const x = i % nx, rest = (i - x) / nx, y = rest % ny, z = (rest - y) / ny;
  const bone = boneOfVoxel([x, y, z]);
  return bone === 'manusR' || bone === 'manusL';
};
// Small bones that the source skeleton label leaves out are read directly from the CT, with a stricter test because they lie in soft tissue.
const inSmallBone = (i: number) => {
  if (ct[i] < 170) return false;
  const x = i % nx, rest = (i - x) / nx, y = rest % ny, z = (rest - y) / ny;
  return smallBoneAt(x, y, z) !== undefined;
};
const bonePart = partitionBones(grid, (i) => inSmallBone(i) || (ct[i] >= 140 && (!!allowedBone[i] || (!!near[i] && !labels[i] && inForePaw(i)))), landmarks);
log('bones');
const ribLines = ribCourses(grid, bonePart);
log('rib courses', ribLines.r.map((line) => line.length).join(','), ribLines.l.map((line) => line.length).join(','));
const limbRoutes = buildLimbRoutes(landmarks);
for (const part of Object.keys(limbRoutes)) LIMB_PARTS.add(part);
// The middle of each traced part of the gut, for the vessels that go to it.
const gutMiddle = (value: number): Vec3 => {
  const parts = gutParts();
  let x = 0, y = 0, z = 0, count = 0;
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) if (parts[voxelIndex(grid, i, j, k)] === value) { x += i; y += j; z += k; count++; }
  return count ? [x / count, y / count, z / count] : [178, 640, 90];
};
const internal = { ...buildInternal(grid, labels, landmarks, ribLines, { caecum: gutMiddle(1), small: gutMiddle(3) }), ...limbRoutes, ...buildInteriors(grid, labels, landmarks, { heart: HEART, stomach: STOMACH, kidneyLimitX: MIDDLE_X }, [190, 392, 88], [176, 372, 84]) };
log('internal');
// Nothing simulated inside the body may reach far beyond the surface of the specimen, which would show through the skin. Vertices within half a millimetre are allowed, for openings at the surface.
const nearBody = dilate(body, grid, 5);
for (const [name, surface] of Object.entries(internal)) {
  let beyond = 0;
  const count = surface.positions.length / 3;
  for (let v = 0; v < count; v++) {
    const x = Math.round(surface.positions[3 * v]), y = Math.round(surface.positions[3 * v + 1]), z = Math.round(surface.positions[3 * v + 2]);
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz || !nearBody[voxelIndex(grid, x, y, z)]) beyond++;
  }
  if (beyond / count > 0.001) throw new Error(`${name} lies outside the body: ${beyond} of ${count} vertices`);
}
// One pass finds the extent of every bone, because there are many of them.
const boneBoxes = BONES.map((): [number, number, number, number, number, number] => [nx, -1, ny, -1, nz, -1]);
for (let z = 0, i = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, i++) {
  const value = bonePart[i];
  if (!value) continue;
  const box = boneBoxes[value - 1];
  if (x < box[0]) box[0] = x; if (x > box[1]) box[1] = x;
  if (y < box[2]) box[2] = y; if (y > box[3]) box[3] = y;
  if (z < box[4]) box[4] = z; if (z > box[5]) box[5] = z;
}
log('bone voxels', BONES.map((bone, index) => `${bone.id}:${(boneBoxes[index][1] - boneBoxes[index][0] + 1)}x${(boneBoxes[index][3] - boneBoxes[index][2] + 1)}x${(boneBoxes[index][5] - boneBoxes[index][4] + 1)}`).join(' '));
function boneStance(index: number): Surface {
  const wanted = index + 1;
  // Bones of the trunk and head are small and thin, so they keep the full grid. Limb bones are longer and move as rigid pieces.
  const scan = BONES[index].rigid
    ? clusterSurface(extractSurface(grid, (i) => bonePart[i] === wanted ? ct[i] : 0, boneBoxes[index], { step: 2, radius: 0, isovalue: 172 }), 2.7)
    : clusterSurface(extractSurface(grid, (i) => bonePart[i] === wanted ? ct[i] : 0, boneBoxes[index], { step: 1, radius: 0, isovalue: 172 }), 1.9);
  const rigid = BONES[index].rigid;
  return rigid ? deformRigid(scan, posture.pose.transforms[rigid]) : deformAxial(scan, posture);
}
/**
 * Below the wrists and ankles the body is closed by the simulated paws. Soft tissue that the stance carries there must stay inside
 * them: a thin vessel or nerve is drawn in just under the paw's surface, while traced tissue of the scanned paws, which lay flattened
 * in the scan and cannot be fitted to the sculpted paws, is left out. Points inside the body or a limb are left where they are.
 */
const PAW_CLEARANCE = 1.5;
/** Only points this near a paw, in voxels of the source, belong to it; 40 is 4 mm. */
const PAW_REACH = 40;
const PAW_LEVEL = (() => { const j = posture.pose.joints; return Math.max(j.wristR[2], j.wristL[2], j.ankleR[2], j.ankleL[2]) + 4; })();
function insideBodyOrLimb(p: Vec3): boolean {
  skinSurface();
  const { grid: cells, origin, cell, inside } = skinField!;
  const x = Math.floor((p[0] - origin[0]) / cell), y = Math.floor((p[1] - origin[1]) / cell), z = Math.floor((p[2] - origin[2]) / cell);
  if (x >= 0 && y >= 0 && z >= 0 && x < cells.nx && y < cells.ny && z < cells.nz && inside[voxelIndex(cells, x, y, z)]) return true;
  for (const limb of limbTubes) { const nearest = nearestOnTube(limb, p); if (nearest.distance <= nearest.radius) return true; }
  return false;
}
/** The paw a point lies nearest to the inside of, and how far inside it is; negative outside. */
function strongestPaw(p: Vec3): { field: PawField; value: number } {
  let field = attachments.pawFields[0], value = -Infinity;
  for (const candidate of attachments.pawFields) { const v = candidate(p); if (v > value) { value = v; field = candidate; } }
  return { field, value };
}
/** A point outside every paw, moved along the shape's gradient to just inside the paw it is nearest. A point inside comes back unchanged. */
function intoPaw(p: Vec3): Vec3 {
  const { field, value } = strongestPaw(p);
  if (value >= 0) return p;
  let q = p;
  for (let step = 0; step < 16; step++) {
    const v = field(q);
    if (v >= PAW_CLEARANCE) break;
    const h = 0.5;
    const g: Vec3 = [(field([q[0] + h, q[1], q[2]]) - field([q[0] - h, q[1], q[2]])) / (2 * h), (field([q[0], q[1] + h, q[2]]) - field([q[0], q[1] - h, q[2]])) / (2 * h),
      (field([q[0], q[1], q[2] + h]) - field([q[0], q[1], q[2] - h])) / (2 * h)];
    const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (g2 < 1e-6) break;
    q = add(q, scale(g, (PAW_CLEARANCE - v + 0.1) / g2));
  }
  return q;
}
/** A surface without the triangles that touch any of the given vertices, with the vertices it no longer uses removed. */
function withoutVertices(surface: Surface, drop: Uint8Array): Surface {
  const kept: number[] = [];
  for (let t = 0; t < surface.indices.length; t += 3) {
    const a = surface.indices[t], b = surface.indices[t + 1], c = surface.indices[t + 2];
    if (!drop[a] && !drop[b] && !drop[c]) kept.push(a, b, c);
  }
  const remap = new Int32Array(surface.positions.length / 3).fill(-1);
  let count = 0;
  for (const v of kept) if (remap[v] < 0) remap[v] = count++;
  const positions = new Float32Array(count * 3);
  const colors = surface.colors ? new Float32Array(count * 3) : undefined;
  for (let v = 0; v < remap.length; v++) {
    const to = remap[v];
    if (to < 0) continue;
    for (let k = 0; k < 3; k++) { positions[3 * to + k] = surface.positions[3 * v + k]; if (colors) colors[3 * to + k] = surface.colors![3 * v + k]; }
  }
  const indices = Uint32Array.from(kept, (v) => remap[v]);
  return { ...surface, positions, indices, normals: vertexNormals(positions, indices), colors, lines: undefined };
}
/**
 * The scanned shanks and forearms lay pressed flat, so their traced muscles are wider than the slender simulated limbs. Their
 * outer parts are drawn in towards the middle of the limb until they lie under the skin, smoothly, so that muscles keep their order.
 * Bones are not moved, because they are measured and rigid.
 */
const SKIN_CLEARANCE = 2.5;
function pressIntoLimbs(surface: Surface): Surface {
  skinSurface();
  const positions = surface.positions.slice();
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
    let found = nearestOnTube(limbTubes[0], p);
    for (let k = 1; k < limbTubes.length; k++) { const other = nearestOnTube(limbTubes[k], p); if (other.distance < found.distance) found = other; }
    const room = found.radius - SKIN_CLEARANCE;
    const start = room * 0.55;
    if (found.distance <= start || room <= 0) continue;
    const pressed = start + (room - start) * (1 - Math.exp(-(found.distance - start) / (room - start)));
    // Near the knee or elbow the limb meets the body, whose surface is not the limb's.
    const t = Math.max(0, Math.min(1, (found.along - 0.04) / 0.14));
    const distance = found.distance + (pressed - found.distance) * t * t * (3 - 2 * t);
    const factor = distance / found.distance;
    for (let k = 0; k < 3; k++) positions[i + k] = found.centre[k] + (p[k] - found.centre[k]) * factor;
  }
  return { ...surface, positions };
}
/**
 * Soft tissue carried into the stance can end up a little outside the skin. Such points are moved to just under it. Bones stay where
 * they are, because they are measured and rigid, and so do the parts that belong below the wrists and ankles, in the eyes and in the tail, whose own surfaces close them.
 */
const LEFT_WHERE_THEY_ARE = new Set(['living:irises', 'living:lenses', 'living:retinas', 'living:tail-vessels', 'living:tail-vertebrae', 'living:panniculus']);
const UNDER_SKIN_CLEARANCE = 1.5;
/** The wall of the abdomen: from just behind the lowest ribs to the pelvis, along the body, and how far under the skin, in voxels of the source. */
const WALL_FROM = 452, WALL_TO = 752, WALL_DEPTH = 1.2;
function keepUnderSkin(id: string, plan: Plan, surface: Surface): Surface {
  if (plan.kind === 'skin' || plan.kind === 'abdominal-wall' || plan.kind === 'attachment' || plan.kind === 'bone' || plan.kind === 'marrow' || plan.kind === 'patches' || plan.kind === 'net' || LEFT_WHERE_THEY_ARE.has(id)) return surface;
  skinSurface();
  const positions = surface.positions.slice();
  // Traced tissue of the scanned paws is left out, because the sculpted paws cannot hold it in its scanned shape.
  const drop = plan.kind === 'muscle-rest' ? new Uint8Array(positions.length / 3) : null;
  let moved = 0, intoPaws = 0, outside = 0, dropped = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
    if (p[2] < PAW_LEVEL) {
      // Below the wrists and ankles the paws close the body, so a point outside the body and the limbs belongs to a paw.
      if (insideBodyOrLimb(p)) continue;
      // Low parts of the body far from every paw, such as the tip of the penis between the hind limbs, are left where they are.
      if (strongestPaw(p).value < -PAW_REACH) continue;
      if (drop) { drop[i / 3] = 1; dropped++; continue; }
      const q = intoPaw(p);
      if (q !== p) { positions[i] = q[0]; positions[i + 1] = q[1]; positions[i + 2] = q[2]; moved++; intoPaws++; }
      if (strongestPaw(q).value < -5) outside++;
      continue;
    }
    const q = underSkin(skinField!, p, UNDER_SKIN_CLEARANCE);
    if (q !== p) { positions[i] = q[0]; positions[i + 1] = q[1]; positions[i + 2] = q[2]; moved++; }
  }
  // As for the interiors, a few points within half a millimetre are allowed; more than that stops the build.
  if (outside > 0.001 * (positions.length / 3)) throw new Error(`${id} stands outside the paws: ${outside} of ${positions.length / 3} vertices`);
  let result = moved ? { ...surface, positions, normals: vertexNormals(positions, surface.indices) } : surface;
  if (moved) log('under skin', id, moved, intoPaws ? `of which ${intoPaws} into the paws` : '');
  if (dropped) {
    result = withoutVertices(result, drop!);
    log('paw tissue left out', id, dropped, 'vertices', (surface.indices.length - result.indices.length) / 3, 'triangles');
  }
  return result;
}
const PRESSED_MUSCLES = new Set(['gastrocnemius', 'soleus', 'tibialis', 'peroneals', 'deep-flexors', 'forearm-extensors', 'forearm-flexors']);
const musclePartition = partitionMuscles(grid, (i) => tissues[i] === TRACED.muscle, landmarks);
log('muscles', [...musclePartition.counts].join(','));
const muscleScanSurfaces = new Map<number, Surface>();
const flowLines: ReturnType<typeof flowLinesOf> = [];
const carriesFlow = (id: string, systems: readonly string[]) => id === 'living:lymph-vessels' || id === 'living:meningeal-lymphatics' || systems.includes('arterial-venous') || (systems.includes('nervous') && /nerve|(?<!enteric-)plexus|cord|trunks|roots/.test(id));
for (const structure of STRUCTURES) {
  const surface = keepUnderSkin(structure.id, structure.plan, structure.plan.kind === 'attachment' ? attachments.parts[structure.plan.part]
    : structure.plan.kind === 'internal' ? (LIMB_PARTS.has(structure.plan.part) ? deformSurface : deformAxial)(internal[structure.plan.part], posture)
      : structure.plan.kind === 'bone' ? boneStance(structure.plan.index)
      : structure.plan.kind === 'marrow' ? mergeSurfaces(structure.plan.bones.map((id) => shaftCore(builtSurfaces.get(id)!)))
      : structure.plan.kind === 'patches' ? surfacePatches(structure.plan.on.map((id) => builtSurfaces.get(id)!), structure.plan.count, structure.plan.radii)
      : structure.plan.kind === 'net' ? surfaceNet(structure.plan.on.map((id) => builtSurfaces.get(id)!), structure.plan.points, structure.plan.radius)
      : structure.plan.kind === 'tree' ? deformAxial(trees[structure.plan.part], posture)
      : structure.plan.kind === 'muscle' ? (PRESSED_MUSCLES.has(MUSCLES[structure.plan.index].id) ? pressIntoLimbs(deformSurface(muscleScan(structure.plan.index), posture)) : (MUSCLES[structure.plan.index].group === 'head' ? deformAxial : deformSurface)(muscleScan(structure.plan.index), posture))
        : structure.plan.kind === 'muscle-rest' ? deformSurface(muscleSurface(musclePartition, UNNAMED), posture)
          : structure.plan.kind === 'panniculus' ? panniculus()
            : structure.plan.kind === 'abdominal-wall' ? abdominalWall() : build(structure.plan));
  if (!surface || !surface.indices.length) throw new Error(`No surface for ${structure.id}`);
  builtSurfaces.set(structure.id, surface);
  // The paw bones are measured and the paws sculpted; how far the bones reach beyond the paws is recorded, not hidden.
  if (structure.plan.kind === 'bone' && /^(manus|pes)-/.test(BONES[structure.plan.index].id)) {
    const used = new Uint8Array(surface.positions.length / 3);
    for (const v of surface.indices) used[v] = 1;
    let beyond = 0, deepest = 0, drawn = 0;
    for (let v = 0; v < used.length; v++) {
      if (!used[v]) continue;
      drawn++;
      const p: Vec3 = [surface.positions[3 * v], surface.positions[3 * v + 1], surface.positions[3 * v + 2]];
      if (p[2] >= PAW_LEVEL || insideBodyOrLimb(p)) continue;
      const value = strongestPaw(p).value;
      if (value < 0) { beyond++; deepest = Math.max(deepest, -value); }
    }
    log('paw bone beyond its paw', structure.id, beyond, 'of', drawn, 'vertices, up to', (deepest * METRES * 1000).toFixed(2), 'mm');
  }
  const marks = { joints: posture.pose.joints, eyes: attachments.eyes, earRoots: attachments.earRoots, tip: attachments.tip, mouth: [...attachments.mouth, ...attachments.openings] };
  const hair = structure.plan.kind === 'skin' ? bodyCoat(surface, marks) : structure.plan.kind === 'attachment' ? shortCoat(structure.plan.part, surface, marks) : undefined;
  const fibre = structure.plan.kind === 'muscle' ? fibreOf(structure.plan.index, surface) : structure.plan.kind === 'abdominal-wall' ? wallFibre(surface) : undefined;
  surfaces.push({ id: structure.id, name: structure.name, positions: toMetres(surface.positions), normals: surface.normals, indices: surface.indices, fur: hair?.fur, coat: hair?.coat, fibre, colors: surface.colors });
  if (carriesFlow(structure.id, structure.systems)) flowLines.push(...flowLinesOf(structure.id, surface));
  const { plan: _plan, ...record } = structure;
  const positions = toMetres(surface.positions);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  records.push({ ...record, meshNode: structure.id, geometry: { vertices: positions.length / 3, triangles: surface.indices.length / 3, boundsMeters: [min, max] } });
  log(structure.id, surface.positions.length / 3, surface.indices.length / 3);
}

/** A sheet just under the skin of the head, neck and trunk, taken from the body surface itself. Hummel et al. describe it there and not on the limbs. */
function panniculus(): Surface {
  const skin = skinSurface();
  const j = posture.pose.joints;
  const limbs: readonly (readonly [Vec3, Vec3])[] = [[j.shoulderR, j.elbowR], [j.elbowR, j.wristR], [j.shoulderL, j.elbowL], [j.elbowL, j.wristL], [j.hipR, j.kneeR], [j.kneeR, j.ankleR], [j.hipL, j.kneeL], [j.kneeL, j.ankleL]];
  const count = skin.positions.length / 3;
  const positions = new Float32Array(skin.positions.length), keep = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [skin.positions[3 * i], skin.positions[3 * i + 1], skin.positions[3 * i + 2]];
    let limbDistance = Infinity;
    for (const [a, b] of limbs) {
      const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay + (p[2] - a[2]) * az) / (ax * ax + ay * ay + az * az)));
      limbDistance = Math.min(limbDistance, Math.hypot(p[0] - a[0] - ax * t, p[1] - a[1] - ay * t, p[2] - a[2] - az * t));
    }
    keep[i] = limbDistance > 34 ? 1 : 0;
    for (let k = 0; k < 3; k++) positions[3 * i + k] = skin.positions[3 * i + k] - 4 * skin.normals[3 * i + k];
  }
  const kept: number[] = [];
  for (let t = 0; t < skin.indices.length; t += 3) if (keep[skin.indices[t]] && keep[skin.indices[t + 1]] && keep[skin.indices[t + 2]]) kept.push(skin.indices[t], skin.indices[t + 1], skin.indices[t + 2]);
  return clusterSurface({ positions, normals: skin.normals, indices: Uint32Array.from(kept) }, 5);
}

/** One sheet for the wall of the belly and flanks, taken from the body surface just inside the panniculus. */
function abdominalWall(): Surface {
  const skin = skinSurface();
  const j = posture.pose.joints;
  const limbs: readonly (readonly [Vec3, Vec3])[] = [[j.hipR, j.kneeR], [j.kneeR, j.ankleR], [j.hipL, j.kneeL], [j.kneeL, j.ankleL], [j.shoulderR, j.elbowR], [j.shoulderL, j.elbowL]];
  const count = skin.positions.length / 3;
  const positions = new Float32Array(skin.positions.length), keep = new Uint8Array(count), limits = new Float32Array(2 * count);
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [skin.positions[3 * i], skin.positions[3 * i + 1], skin.positions[3 * i + 2]];
    let limbDistance = Infinity;
    for (const [a, b] of limbs) {
      const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay + (p[2] - a[2]) * az) / (ax * ax + ay * ay + az * az)));
      limbDistance = Math.min(limbDistance, Math.hypot(p[0] - a[0] - ax * t, p[1] - a[1] - ay * t, p[2] - a[2] - az * t));
    }
    // It ends at the groin, along a line from the pubis out and forwards towards the hip bone, and does not run on over the inner thigh.
    const far = Math.abs(p[0] - landmarks.spineAt(p[1]).x);
    const groin = Math.min(WALL_TO, (j.hipR[1] + j.hipL[1]) / 2 + 30 - 1.4 * far);
    // At the front it follows the margin of the ribs, furthest forward at the middle and further back to the sides.
    const margin = WALL_FROM + 0.9 * far;
    keep[i] = limbDistance > 30 && p[1] >= margin && p[1] <= groin && p[2] < landmarks.spineAt(p[1]).canalZ - 14 ? 1 : 0;
    for (let k = 0; k < 3; k++) positions[3 * i + k] = skin.positions[3 * i + k] - WALL_DEPTH * skin.normals[3 * i + k];
    // Points just beyond the line are brought back on to it, so that the edge of the sheet runs true and has no steps.
    limits[2 * i] = margin; limits[2 * i + 1] = groin;
  }
  // Only the points it uses.
  const newIndex = new Int32Array(count).fill(-1), kept: number[] = [], places: number[] = [], normals: number[] = [];
  for (let t = 0; t < skin.indices.length; t += 3) {
    const corners = [skin.indices[t], skin.indices[t + 1], skin.indices[t + 2]];
    const inside = corners.filter((corner) => keep[corner]).length;
    // A triangle on the edge is kept if most of it lies inside and the corner outside lies only a little way past the line along the body.
    if (inside < 2 || !corners.every((corner) => keep[corner] || (skin.positions[3 * corner + 1] < limits[2 * corner] && skin.positions[3 * corner + 1] > limits[2 * corner] - 6) || (skin.positions[3 * corner + 1] > limits[2 * corner + 1] && skin.positions[3 * corner + 1] < limits[2 * corner + 1] + 6))) continue;
    for (const corner of corners) {
      if (newIndex[corner] < 0) {
        newIndex[corner] = places.length / 3;
        for (let k = 0; k < 3; k++) { places.push(positions[3 * corner + k]); normals.push(skin.normals[3 * corner + k]); }
        if (!keep[corner]) places[places.length - 2] = Math.max(limits[2 * corner], Math.min(limits[2 * corner + 1], places[places.length - 2]));
      }
      kept.push(newIndex[corner]);
    }
  }
  // Each side of the middle line a darker band, for the rectus, and a pale line where it meets the muscles of the flank. Colours for display, after the order of layers in the sources.
  const colors = new Float32Array(places.length);
  const ease = (a: number, b: number, x: number) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  for (let i = 0; i < places.length / 3; i++) {
    const far = Math.abs(places[3 * i] - landmarks.spineAt(places[3 * i + 1]).x);
    const rectus = 1 - ease(40, 52, far), seam = ease(40, 46, far) * (1 - ease(46, 54, far));
    const r = 0.94 + 0.06 * rectus + 0.08 * seam, g = 0.97 - 0.13 * rectus + 0.2 * seam, b = 0.97 - 0.13 * rectus + 0.2 * seam;
    colors[3 * i] = Math.min(1, r); colors[3 * i + 1] = Math.min(1, g); colors[3 * i + 2] = Math.min(1, b);
  }
  return { positions: Float32Array.from(places), normals: Float32Array.from(normals), indices: Uint32Array.from(kept), colors };
}
/** xyz is the way its fibres run, along the body beside the middle and round it further out, and w is the tendon: its pale middle line. */
function wallFibre(surface: Surface): Float32Array {
  const count = surface.positions.length / 3, out = new Float32Array(4 * count);
  const ease = (a: number, b: number, x: number) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  for (let i = 0; i < count; i++) {
    const x = surface.positions[3 * i], y = surface.positions[3 * i + 1];
    const aside = x - landmarks.spineAt(y).x, far = Math.abs(aside), round = ease(42, 70, far);
    const nx = surface.normals[3 * i], nz = surface.normals[3 * i + 2];
    // Round the body is square to the normal and to the length of the body.
    let rx = nz, rz = -nx;
    const side = Math.hypot(rx, rz) || 1; rx /= side; rz /= side;
    const dx = rx * round * 0.85 * Math.sign(aside || 1), dy = 1 - round * 0.45, dz = rz * round * 0.85 * Math.sign(aside || 1);
    const size = Math.hypot(dx, dy, dz) || 1;
    out[4 * i] = dx / size; out[4 * i + 1] = dy / size; out[4 * i + 2] = dz / size;
    out[4 * i + 3] = 1 - ease(3, 8, far);
  }
  return out;
}

/** Scan-frame surfaces of muscles are kept to find the direction of their fibres after the posture moves them. */
function muscleScan(index: number): Surface {
  // Muscle surfaces are large and show little fine shape, so they carry fewer triangles.
  const surface = clusterSurface(muscleSurface(musclePartition, index + 1), 3.4);
  muscleScanSurfaces.set(index, surface);
  return surface;
}

/** xyz is the fibre direction after the posture; w is how far the vertex lies into a tendon. */
function fibreOf(index: number, stance: Surface): Float32Array {
  const scan = muscleScanSurfaces.get(index)!;
  const { directions, tendon } = fibreAttribute(scan, musclePartition.courses[index]);
  const shifted = new Float32Array(scan.positions.length);
  for (let i = 0; i < shifted.length; i++) shifted[i] = scan.positions[i] + 4 * directions[i];
  const ahead = deformSurface({ ...scan, positions: shifted }, posture).positions;
  const count = scan.positions.length / 3;
  const out = new Float32Array(4 * count);
  for (let i = 0; i < count; i++) {
    const dx = ahead[3 * i] - stance.positions[3 * i], dy = ahead[3 * i + 1] - stance.positions[3 * i + 1], dz = ahead[3 * i + 2] - stance.positions[3 * i + 2];
    const n = Math.hypot(dx, dy, dz) || 1;
    out[4 * i] = dx / n; out[4 * i + 1] = dy / n; out[4 * i + 2] = dz / n; out[4 * i + 3] = tendon[i];
  }
  return out;
}

// The centre lines of the simulated vessels and nerves, in the coordinates of the model, for the tokens of the motion display. The geometry above does not depend on them.
fs.writeFileSync(path.join(OUT, 'flow-paths.json'), JSON.stringify({ format: 'mousebio-flow-paths-v1', referenceId: 'mousebio-living-v1', evidence: 'simulated', notice: FLOW_NOTICE, unitMetres: METRES / 100, lines: flowLines }) + '\n');
log('flow lines', flowLines.length, flowLines.reduce((sum, line) => sum + line.points.length / 4, 0));
const glb = writeGlb(surfaces, 'MouseBio_3D living mouse build');
const name = 'living-mouse.glb';
fs.writeFileSync(path.join(OUT, name), glb);
const digest = createHash('sha256').update(glb).digest('hex');
const triangles = surfaces.reduce((sum, surface) => sum + surface.indices.length / 3, 0);
const manifest = {
  id: 'mousebio-living-v1',
  title: 'Living mouse: measured, traced and simulated layers',
  assetUrl: `/atlas-living/${name}`,
  coordinateFrame: {
    id: 'digimouse-living-stance-v1', assetUnits: 'metres', sourceUnits: 'zero-based voxel indices of the Digimouse grid, after a simulated posture',
    sourceVoxelSpacingMm: [0.1, 0.1, 0.1], voxelIndexToAssetScale: METRES,
    origin: 'Index(0,0,0) of the Digimouse image; limbs are displaced from it by the simulated posture',
    axes: { x: 'native x', y: 'native y, towards the tail', z: 'native z, towards the back; inferred from label positions' },
    anatomicalOrientationVerified: false, physicalCalibrationVerified: false, posture: 'simulated', groundZMetres: posture.pose.groundZ * METRES,
    joints: JOINTS,
  },
  source: {
    id: 'digimouse-registered-volume-2007', title: 'Digimouse: a 3D whole body mouse atlas from CT and cryosection data', displayName: 'Living mouse model',
    authors: ['Belma Dogdas', 'David Stout', 'Arion F. Chatziioannou', 'Richard M. Leahy'], doi: '10.1088/0031-9155/52/3/003', publicationYear: 2007,
    url: 'https://neuroimage.usc.edu/neuro/Digimouse', license: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  structures: records,
  statistics: { structures: records.length, triangles, glbBytes: glb.length, glbSha256: digest, sourceVoxelSpacingMm: [0.1, 0.1, 0.1] },
  limitations: [
    'This is a constructed model and not a measurement of a living mouse. Each structure states whether it is source-labelled, traced from the source images or simulated.',
    'The standing posture is simulated: the specimen was scanned spread flat, postmortem and frozen, and its limbs were rotated about their joints to an estimated stance.',
    'Simulated structures follow published anatomical descriptions and are not measured from this specimen or any other.',
    'Anatomical orientation, laterality and physical calibration remain unverified.',
  ],
  specimen: {
    scientificName: 'Mus musculus', taxonomyId: 'NCBITaxon:10090', sex: 'male', mass: { value: 28, unit: 'g' }, scope: 'one specimen with simulated additions', count: 1,
    description: 'Measured layers from one 28 g normal nude male mouse, with a simulated posture and simulated layers. The coat is simulated, because the specimen is hairless.',
    sourceReference: 'https://doi.org/10.1088/0031-9155/52/3/003',
  },
};
fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(manifest, null, 1) + '\n');
// A constructed reference holds simulated structures, so it has its own catalog, apart from the source references.
fs.writeFileSync(path.join(ROOT, 'data/constructed-references.json'), JSON.stringify([{
  id: manifest.id, title: 'Living mouse: measured and simulated', manifestUrl: '/atlas-living/atlas.json',
  coordinateFrameId: manifest.coordinateFrame.id, assetSha256: digest,
  coverage: {
    regionCount: records.length, systems: [...new Set(STRUCTURES.flatMap((structure) => structure.systems))].sort(),
    description: 'One male Digimouse specimen in a simulated posture. Every structure declares whether it is source-labelled, traced from the source images or simulated.',
  },
  processingResolution: {
    sourceVoxelSpacingMm: [0.1, 0.1, 0.1], processingVoxelSpacingMm: [0.2, 0.2, 0.2],
    method: 'Surfaces from source labels and images, moved to a simulated standing posture, with simulated layers added',
    limitations: ['This is a constructed model, not a measurement of a living mouse.', 'The posture, coat and all structures marked simulated are estimates and are not measured.'],
  },
  licenses: [{ identifier: manifest.source.license, url: manifest.source.licenseUrl }],
}], null, 2) + '\n');
log('done', triangles, 'triangles', glb.length, 'bytes', digest);
void ny; void nz; void voxelIndex;
if (MUSCLES.length + 1 !== records.filter((record) => String(record.id).startsWith('living:muscle-')).length) throw new Error('Muscle inventory differs');
