import type { Atlas } from './types';

/**
 * Display posture for references whose dorsal side can be inferred from the
 * positions of their own source labels. The inference chooses which display
 * direction points up and where a ground shadow is drawn. It does not verify
 * the source axes, assign laterality or calibrate any dimension.
 */
export interface DisplayPosture {
  /** Display-frame direction treated as dorsal, after the presentation rotation. */
  readonly up: readonly [number, number, number];
  /** Unit direction from the target to the default camera, before scaling by the display radius. */
  readonly view: readonly [number, number, number];
  /** Distance of the default camera in display radii. */
  readonly distance: number;
  readonly basis: string;
}

/**
 * Both Digimouse references share the registered voxel axes, and native z equals
 * display z after the presentation rotation about display z. In mid-trunk
 * columns of the 0.1 mm label image the vertebral column lies at a median 0.84
 * of the body's native z extent and the kidneys at 0.69, while the heart lies
 * at 0.30 and the bladder at 0.24; native +z is therefore treated as dorsal.
 */
const DIGIMOUSE_POSTURE: DisplayPosture = Object.freeze({
  up: Object.freeze([0, 0, 1] as const),
  view: Object.freeze(normalize([0.36, -0.84, 0.42])),
  distance: 3.1,
  basis: 'Dorsal side inferred from source label positions: in mid-trunk columns of the Digimouse label image the vertebral column and kidneys lie towards native +z (median relative positions 0.84 and 0.69) and the heart and bladder towards native -z (0.30 and 0.24). Laterality and calibration remain unverified.',
});

const POSTURES: Readonly<Record<string, DisplayPosture>> = Object.freeze({
  'digimouse-tessellated-v1': DIGIMOUSE_POSTURE,
  'digimouse-volume-040-v1': DIGIMOUSE_POSTURE,
});

function normalize(vector: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/** The inferred posture of a reference, or null when no dorsal direction is inferred. */
export function displayPostureFor(atlas: Pick<Atlas, 'id'>): DisplayPosture | null {
  return Object.hasOwn(POSTURES, atlas.id) ? POSTURES[atlas.id] : null;
}

/** The region whose outer surface is the body surface of the specimen, when one exists. */
export function bodySurfaceIdFor(atlas: Pick<Atlas, 'id' | 'structures'>): string | null {
  const id = atlas.id === 'digimouse-tessellated-v1' ? 'digimouse:1' : atlas.id === 'digimouse-volume-040-v1' ? 'digimouse-volume:1' : null;
  return id && atlas.structures.some((structure) => structure.id === id) ? id : null;
}
