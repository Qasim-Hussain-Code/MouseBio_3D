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

/**
 * In the micro-CT scan of Rosenhain et al. (2018) the kidneys and spleen lie at
 * smaller native y than the heart and bladder, and the trunk bone lies at small
 * native y within the kidneys' rostrocaudal range, so native -y is treated as
 * dorsal. After the presentation rotation about display z, native -y is display
 * +x. The heart lies at larger native z than the bladder, so display +z points
 * towards the head; the default view leans that way.
 */
const MICROCT_POSTURE: DisplayPosture = Object.freeze({
  up: Object.freeze([1, 0, 0] as const),
  view: Object.freeze(normalize([0.42, -0.84, 0.36])),
  distance: 3.1,
  basis: 'Dorsal side inferred from source class positions: in the micro-CT scan the kidneys, spleen and trunk bone lie towards native -y and the heart and bladder towards native +y. Laterality and calibration remain unverified.',
});

const POSTURES: Readonly<Record<string, DisplayPosture>> = Object.freeze({
  'digimouse-tessellated-v1': DIGIMOUSE_POSTURE,
  'digimouse-volume-040-v1': DIGIMOUSE_POSTURE,
  'rosenhain2018-m01-native-v1': MICROCT_POSTURE,
});

/** The region whose outer surface is the body surface of each reference that has one. */
const BODY_SURFACES: Readonly<Record<string, string>> = Object.freeze({
  'digimouse-tessellated-v1': 'digimouse:1',
  'digimouse-volume-040-v1': 'digimouse-volume:1',
  'rosenhain2018-m01-native-v1': 'rosenhain2018-m01:Bed:1',
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
  const id = Object.hasOwn(BODY_SURFACES, atlas.id) ? BODY_SURFACES[atlas.id] : null;
  return id && atlas.structures.some((structure) => structure.id === id) ? id : null;
}

/**
 * Whether the body surface opens as opaque skin. The Digimouse specimens are
 * imaged whole; the micro-CT scan covers the trunk only, so its body surface
 * is cut flat at the field edges and opens see-through to show the organs.
 */
export function opensAsSkin(atlas: Pick<Atlas, 'id' | 'structures'>): boolean {
  return bodySurfaceIdFor(atlas) !== null && atlas.id !== 'rosenhain2018-m01-native-v1';
}
