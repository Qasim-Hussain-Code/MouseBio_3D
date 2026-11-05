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
import { buildPosture, deformAxial, deformSurface, type PostureField } from './posture';
import { buildBodySurface } from './exterior';
import { extractSurface, maskBox } from './extract';
import { writeGlb, type GlbSurface } from './glb';
import { JOINTS, type Vec3 } from './rig';
import { components, dilate, erode, voxelIndex, type Grid } from './volume';
import type { Surface } from './surface-nets';
import { buildAttachments } from './attachments';
import { STRUCTURES, type Plan } from './structures';
import { TRACED, traceTissues } from './trace';
import { buildInternal } from './internal';
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
if (process.argv.includes('--cached') && fs.existsSync(tissueFile)) tissues = fs.readFileSync(tissueFile);
else {
  const traced = traceTissues({ grid, labels, ct, rgb: fs.readFileSync(path.join(WORK, 'rgb.bin')) });
  tissues = traced.classes;
  fs.writeFileSync(tissueFile, tissues);
  log('traced', JSON.stringify(traced.report));
}

const LIMB_PARTS = new Set(['forelimb-arteries', 'hindlimb-arteries', 'forelimb-veins', 'hindlimb-veins', 'forelimb-nerves', 'hindlimb-nerves', 'lymph-nodes']);

/**
 * The traced gut divided by estimate: 1 the caecum, the largest thick part on the left of the abdomen;
 * 2 the colon and rectum, behind the bladder; 3 the rest, which is mostly small intestine.
 */
let gutCache: Uint8Array | null = null;
function gutParts(): Uint8Array {
  if (gutCache) return gutCache;
  const gut = new Uint8Array(voxels);
  for (let i = 0; i < voxels; i++) if (tissues[i] === TRACED.gut) gut[i] = 1;
  const free = new Uint8Array(voxels);
  for (let i = 0; i < voxels; i++) free[i] = labels[i] === 1 ? 1 : 0;
  const grown = dilate(gut, grid, 2, free);
  const thick = dilate(erode(gut, grid, 13), grid, 13, gut);
  const { ids, list } = components(thick, grid);
  const caecum = list.find((item) => item.centroid[0] > 190)?.id ?? -1;
  log('gut thick parts', list.slice(0, 5).map((item) => `${item.size}@${item.centroid.map((v) => v.toFixed(0)).join(',')}`).join(' '));
  const out = new Uint8Array(voxels);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z);
    if (!grown[at]) continue;
    out[at] = ids[at] === caecum ? 1 : y > 720 ? 2 : 3;
  }
  // The wall grown round the caecum goes with the caecum.
  gutCache = out;
  return out;
}

function build(plan: Plan): Surface {
  if (plan.kind === 'skin') {
    const exterior = buildBodySurface(grid, body, posture);
    log('shank radii', exterior.shanks.map((shank) => shank.radii.map((r) => r.toFixed(1)).join('/')).join(' '));
    return exterior.surface;
  }
  if (plan.kind === 'ct-bone') {
    // CT values give a smooth bone surface, and show the digits that the labels crop.
    const box = maskBox(grid, (i) => !!bone[i]);
    const labelled = new Uint8Array(voxels);
    for (let i = 0; i < voxels; i++) labelled[i] = labels[i] === 2 ? 1 : 0;
    const allowed = dilate(labelled, grid, 2);
    return deformSurface(extractSurface(grid, (i) => allowed[i] || (near[i] && !labels[i]) ? ct[i] : 0, box, { step: 2, radius: 0, isovalue: plan.threshold }), posture);
  }
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
    const scan = extractSurface(grid, (i) => mask[i], box, { step: plan.step, radius: plan.radius });
    // Vessels and air spaces belong to the trunk and head; only fat and muscle follow the limbs.
    return plan.tissue === 'blood' || plan.tissue === 'airway' ? deformAxial(scan, posture) : deformSurface(scan, posture);
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
      return best === index;
    };
    const box = maskBox(grid, inside);
    return deformAxial(extractSurface(grid, (i) => inside(i) ? 1 : 0, box, { step: 2, radius: 1, isovalue: seeds.length > 1 ? 0.56 : 0.5 }), posture);
  }
  if (plan.kind === 'gut-part') {
    const parts = gutParts();
    const value = plan.part === 'caecum' ? 1 : plan.part === 'colon' ? 2 : 3;
    const box = maskBox(grid, (i) => parts[i] === value);
    return deformAxial(extractSurface(grid, (i) => parts[i] === value ? 1 : 0, box, { step: 2, radius: 1, isovalue: 0.54 }), posture);
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
const records: Record<string, unknown>[] = [];
const toMetres = (values: Float32Array) => { const out = new Float32Array(values.length); for (let i = 0; i < values.length; i++) out[i] = values[i] * METRES; return out; };

const landmarks = measureLandmarks(grid, labels, ct);
const attachments = buildAttachments(posture, { labels, grid, landmarks });
const internal = buildInternal(grid, labels, landmarks);
log('internal');
const musclePartition = partitionMuscles(grid, (i) => tissues[i] === TRACED.muscle, landmarks);
log('muscles', [...musclePartition.counts].join(','));
const muscleScanSurfaces = new Map<number, Surface>();
for (const structure of STRUCTURES) {
  const surface = structure.plan.kind === 'attachment' ? attachments.parts[structure.plan.part]
    : structure.plan.kind === 'internal' ? (LIMB_PARTS.has(structure.plan.part) ? deformSurface : deformAxial)(internal[structure.plan.part], posture)
      : structure.plan.kind === 'muscle' ? (MUSCLES[structure.plan.index].group === 'head' ? deformAxial : deformSurface)(muscleScan(structure.plan.index), posture)
        : structure.plan.kind === 'muscle-rest' ? deformSurface(muscleSurface(musclePartition, UNNAMED), posture) : build(structure.plan);
  if (!surface || !surface.indices.length) throw new Error(`No surface for ${structure.id}`);
  const fur = structure.plan.kind === 'skin' ? furAttribute(surface) : undefined;
  const fibre = structure.plan.kind === 'muscle' ? fibreOf(structure.plan.index, surface) : undefined;
  surfaces.push({ id: structure.id, name: structure.name, positions: toMetres(surface.positions), normals: surface.normals, indices: surface.indices, fur, fibre });
  const { plan: _plan, ...record } = structure;
  const positions = toMetres(surface.positions);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  records.push({ ...record, meshNode: structure.id, geometry: { vertices: positions.length / 3, triangles: surface.indices.length / 3, boundsMeters: [min, max] } });
  log(structure.id, surface.positions.length / 3, surface.indices.length / 3);
}

/** Scan-frame surfaces of muscles are kept to find the direction of their fibres after the posture moves them. */
function muscleScan(index: number): Surface {
  const surface = muscleSurface(musclePartition, index + 1);
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

/** xyz is the combing direction of the hair, tangent to the surface; w is the relative hair length, zero on bare skin. */
function furAttribute(surface: Surface): Float32Array {
  const count = surface.positions.length / 3;
  const out = new Float32Array(4 * count);
  const nose = attachments.tip;
  for (let i = 0; i < count; i++) {
    const x = surface.positions[3 * i], y = surface.positions[3 * i + 1], z = surface.positions[3 * i + 2];
    const nx0 = surface.normals[3 * i], ny0 = surface.normals[3 * i + 1], nz0 = surface.normals[3 * i + 2];
    // Backwards along the body and down the flanks and limbs.
    let dx = 0, dy = 1, dz = -0.35;
    const ventral = Math.max(0, Math.min(1, (40 - z) / 60));
    dy -= ventral * 0.6; dz -= ventral * 1.2;
    const along = dx * nx0 + dy * ny0 + dz * nz0;
    dx -= along * nx0; dy -= along * ny0; dz -= along * nz0;
    const n = Math.hypot(dx, dy, dz) || 1;
    const fromNose = Math.hypot(x - nose[0], y - nose[1], z - nose[2]);
    const face = Math.max(0.3, Math.min(1, (fromNose - 20) / 110));
    // Short hair round the eyes and ear roots, so that they stand clear of the coat.
    const near = (points: readonly Vec3[], inner: number, outer: number) => Math.min(...points.map((point) => Math.max(0, Math.min(1, (Math.hypot(x - point[0], y - point[1], z - point[2]) - inner) / (outer - inner)))));
    const clear = near(attachments.eyes, 15, 42) * near(attachments.earRoots, 8, 34);
    const belly = z < 20 ? 0.85 : 1;
    // Hair shortens towards the wrists and ankles, where the bare paws begin.
    const j = posture.pose.joints;
    const low = near([j.wristR, j.wristL, j.ankleR, j.ankleL], 4, 26);
    out[4 * i] = dx / n; out[4 * i + 1] = dy / n; out[4 * i + 2] = dz / n; out[4 * i + 3] = Math.max(0, face * belly * low * clear);
  }
  return out;
}

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
    'Anatomical orientation, laterality and physical calibration remain unverified, and nothing here has had independent anatomical review.',
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
