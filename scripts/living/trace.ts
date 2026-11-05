/**
 * Tissue classes traced from the coregistered source photographs and CT, inside the
 * residual label that the source authors left unsegmented. These are automatic colour
 * and density rules chosen by inspecting the images. They have not been reviewed by an
 * anatomist, and no structure found here has a source label.
 */
import { components, dilate, distanceInside, erode, voxelIndex, type Grid } from './volume';

export const TRACED = { none: 0, gut: 1, blood: 2, fat: 3, muscle: 4, airway: 5, connective: 6 } as const;
export type TracedClass = (typeof TRACED)[keyof typeof TRACED];

/** The labels that make up the abdominal viscera in the source image, used to find the abdominal cavity. */
const VISCERAL_LABELS = new Set([13, 14, 15, 16, 17, 18, 19, 20]);
const RESIDUAL = 1;

export interface TraceInputs { readonly grid: Grid; readonly labels: Uint8Array; readonly rgb: Uint8Array; readonly ct: Uint8Array }

export interface TraceResult {
  readonly classes: Uint8Array;
  readonly cavity: Uint8Array;
  readonly report: Record<string, number>;
}

/** Rule thresholds, on a 3 by 3 by 3 mean of 8-bit image values. */
export const TRACE_RULES = Object.freeze({
  airCt: 12, fatCt: 88, bloodLuminance: 34, yellow: 0.38, tan: 0.28, paleLuminance: 135, paleSaturation: 0.42, innerDepthVoxels: 3, bloodDepthVoxels: 8, gutDepthVoxels: 12,
});

export function classifyVoxel(r: number, g: number, b: number, ct: number, depth: number, inCavity: boolean): TracedClass {
  const rules = TRACE_RULES;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const saturation = max ? (max - min) / max : 0;
  const yellow = (g - b) / (r + 1);
  if (depth <= rules.innerDepthVoxels) return TRACED.connective;
  if (ct < rules.airCt) return TRACED.airway;
  if (luminance < rules.bloodLuminance) return depth > rules.bloodDepthVoxels ? TRACED.blood : TRACED.connective;
  // Gut lies only in the abdominal cavity; the same colours elsewhere are fat or the embedding medium at the body surface.
  if (inCavity && depth > rules.gutDepthVoxels && yellow > rules.tan) return TRACED.gut;
  if (ct < rules.fatCt || (luminance > rules.paleLuminance && saturation < rules.paleSaturation)) return TRACED.fat;
  return inCavity ? TRACED.connective : TRACED.muscle;
}

/** A coarse mask of the abdominal cavity: the viscera and yellow gut contents, closed across the gaps between them. */
function abdominalCavity(inputs: TraceInputs): Uint8Array {
  const { grid, labels, rgb } = inputs;
  const { nx, ny, nz } = grid;
  const cell = 4;
  const coarse: Grid = { nx: Math.ceil(nx / cell), ny: Math.ceil(ny / cell), nz: Math.ceil(nz / cell) };
  const count = new Uint16Array(coarse.nx * coarse.ny * coarse.nz);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z);
    const label = labels[at];
    let inside = VISCERAL_LABELS.has(label);
    if (!inside && label === RESIDUAL) {
      const r = rgb[3 * at], g = rgb[3 * at + 1], b = rgb[3 * at + 2];
      inside = (g - b) / (r + 1) > TRACE_RULES.yellow;
    }
    if (inside) count[voxelIndex(coarse, x >> 2, y >> 2, z >> 2)]++;
  }
  let mask: Uint8Array<ArrayBufferLike> = new Uint8Array(count.length);
  for (let i = 0; i < count.length; i++) mask[i] = count[i] >= 12 ? 1 : 0;
  mask = erode(dilate(mask, coarse, 7), coarse, 7);
  // Keep the largest component: the abdomen, without stray yellow specks elsewhere in the body.
  const { ids, list } = components(mask, coarse);
  const largest = list[0]?.id;
  const out = new Uint8Array(labels.length);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (ids[voxelIndex(coarse, x >> 2, y >> 2, z >> 2)] === largest) out[voxelIndex(grid, x, y, z)] = 1;
  }
  return out;
}

export function traceTissues(inputs: TraceInputs): TraceResult {
  const { grid, labels, rgb, ct } = inputs;
  const { nx, ny, nz } = grid;
  const voxels = nx * ny * nz;
  const body = new Uint8Array(voxels);
  for (let i = 0; i < voxels; i++) body[i] = labels[i] ? 1 : 0;
  const depth = distanceInside(body, grid);
  const cavity = abdominalCavity(inputs);
  const classes = new Uint8Array(voxels);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z);
    if (labels[at] !== RESIDUAL) continue;
    let r = 0, g = 0, b = 0, c = 0, count = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy, zz = z + dz;
      if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
      const i = voxelIndex(grid, xx, yy, zz);
      r += rgb[3 * i]; g += rgb[3 * i + 1]; b += rgb[3 * i + 2]; c += ct[i]; count++;
    }
    classes[at] = classifyVoxel(r / count, g / count, b / count, c / count, depth[at], !!cavity[at]);
  }
  // Remove thin sheets and specks, which are mostly partial volume at organ boundaries.
  const clean = (value: TracedClass, minimum: number, open: number): Uint8Array => {
    let mask: Uint8Array<ArrayBufferLike> = new Uint8Array(voxels);
    for (let i = 0; i < voxels; i++) if (classes[i] === value) mask[i] = 1;
    if (open) mask = dilate(erode(mask, grid, open), grid, open, mask);
    const { ids, list } = components(mask, grid);
    const keep = new Uint8Array(list.length + 2);
    for (const item of list) if (item.size >= minimum) keep[item.id] = 1;
    const out = new Uint8Array(voxels);
    for (let i = 0; i < voxels; i++) if (keep[ids[i]]) out[i] = 1;
    return out;
  };
  const gut = clean(TRACED.gut, 400, 1);
  const blood = clean(TRACED.blood, 1500, 1);
  const fat = clean(TRACED.fat, 400, 1);
  const muscle = clean(TRACED.muscle, 2000, 1);
  const airway = clean(TRACED.airway, 60, 0);
  const out = new Uint8Array(voxels);
  const report: Record<string, number> = { gut: 0, blood: 0, fat: 0, muscle: 0, airway: 0 };
  for (let i = 0; i < voxels; i++) {
    if (blood[i]) { out[i] = TRACED.blood; report.blood++; }
    else if (gut[i]) { out[i] = TRACED.gut; report.gut++; }
    else if (airway[i]) { out[i] = TRACED.airway; report.airway++; }
    else if (fat[i]) { out[i] = TRACED.fat; report.fat++; }
    else if (muscle[i]) { out[i] = TRACED.muscle; report.muscle++; }
    else if (classes[i]) out[i] = TRACED.connective;
  }
  return { classes: out, cavity, report };
}
