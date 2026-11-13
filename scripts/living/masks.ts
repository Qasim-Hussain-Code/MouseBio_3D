/**
 * Which voxels of the scan are the animal. The source labels crop the paws and the end of the tail, so CT as bright as bone just
 * outside the labelled body is added to it. The CT also shows objects beside the animal, whose edges are as bright as bone and lie
 * within 2.5 mm of the labelled body: the bed under it, and upright pieces beside the left fore paw and the right knee. Bright CT
 * outside the labelled body is taken for the animal only where it is joined to the labelled body through voxels of at least
 * TISSUE_CT, and where the piece it belongs to lies in a paw of the rig or touches the labelled body by a face with at least one
 * voxel in twenty (PIECE_CONTACT). A piece that lies apart, or that only grazes the body as the bed does where the animal rests on
 * it, is not part of the animal.
 */
import { boneOfVoxel, type Vec3 } from './rig';
import { components, dilate, joinedAbove, voxelIndex, type Grid } from './volume';

/** CT at or above this outside the labelled body is as bright as bone. */
export const BONE_CT = 215;
/**
 * The least CT of soft tissue that joins a bright piece to the body. In the scan, values more than 4 mm from the labelled body,
 * mostly air, are at most 13 in 99 voxels of 100, and those of the labelled body outside the skeleton are at least 43 in 95 of 100.
 */
export const TISSUE_CT = 40;
/** The least share of the voxels of a bright piece outside the paws that must touch the labelled body by a face. */
export const PIECE_CONTACT = 0.05;
/** How far from the labelled body bright CT is looked for, in voxels: 2.5 mm. */
export const NEAR_BODY = 25;

export interface AnimalMasks {
  /** Every voxel of the animal: the labelled body and the bright CT added to it. */
  readonly body: Uint8Array;
  /** The skeleton: the source label and the bright CT added to the body. */
  readonly bone: Uint8Array;
  /** Voxels within NEAR_BODY of the labelled body, the labelled body among them. */
  readonly near: Uint8Array;
  /** Voxels joined to the labelled body through voxels of at least TISSUE_CT. */
  readonly attached: Uint8Array;
  /** Bright voxels of pieces that only graze the body, which are left out. */
  readonly beside: Uint8Array;
  /** How many bright voxels near the body no tissue joins to it, and how many lie in how many pieces that only graze it. */
  readonly report: { readonly apart: number; readonly grazing: number; readonly grazingPieces: number };
}

/** Whether a point lies in a paw of the rig, fore or hind. */
export const inRigPaw = (p: Vec3): boolean => { const id = boneOfVoxel(p); return id === 'manusR' || id === 'manusL' || id === 'pesR' || id === 'pesL'; };

/** `labels` holds the source labels, zero outside the body and 2 for the skeleton; `ct` the CT; `inPaw` tells where the labels crop a paw. */
export function animalMasks(grid: Grid, labels: Uint8Array, ct: Uint8Array, inPaw: (p: Vec3) => boolean, nearBody = NEAR_BODY): AnimalMasks {
  const { nx, ny, nz } = grid;
  const voxels = nx * ny * nz;
  const body = new Uint8Array(voxels), bone = new Uint8Array(voxels);
  for (let i = 0; i < voxels; i++) if (labels[i]) { body[i] = 1; if (labels[i] === 2) bone[i] = 1; }
  const near = dilate(body, grid, nearBody);
  const attached = joinedAbove(body, ct, TISSUE_CT, grid);
  const bright = new Uint8Array(voxels), beside = new Uint8Array(voxels);
  let apart = 0;
  for (let i = 0; i < voxels; i++) if (near[i] && !body[i] && ct[i] >= BONE_CT) { if (attached[i]) bright[i] = 1; else apart++; }
  const pieces = components(bright, grid);
  const size = new Int32Array(pieces.list.length + 1), touching = new Int32Array(pieces.list.length + 1), inPaws = new Int32Array(pieces.list.length + 1);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const at = voxelIndex(grid, x, y, z), id = pieces.ids[at];
    if (!id) continue;
    size[id]++;
    if (inPaw([x, y, z])) inPaws[id]++;
    if ((x > 0 && labels[at - 1]) || (x < nx - 1 && labels[at + 1]) || (y > 0 && labels[at - nx]) || (y < ny - 1 && labels[at + nx]) || (z > 0 && labels[at - nx * ny]) || (z < nz - 1 && labels[at + nx * ny])) touching[id]++;
  }
  const kept = (id: number) => 2 * inPaws[id] >= size[id] || touching[id] >= PIECE_CONTACT * size[id];
  let grazing = 0, grazingPieces = 0;
  for (let id = 1; id < size.length; id++) if (!kept(id)) { grazingPieces++; grazing += size[id]; }
  for (let i = 0; i < voxels; i++) { const id = pieces.ids[i]; if (!id) continue; if (kept(id)) { bone[i] = 1; body[i] = 1; } else beside[i] = 1; }
  return { body, bone, near, attached, beside, report: { apart, grazing, grazingPieces } };
}
