/**
 * The shape of a gloved human hand, for showing how the instruments of the practice dissection are held. It is a drawing at about the size of an adult hand, made as a smooth union of tapered
 * capsules along the bones of the fingers and palm and turned into a surface with its weights on those bones. Its proportions are display estimates and it is not a model of any measured hand.
 *
 * All lengths are in metres. The frame is that of a right hand lying palm down: x towards the little finger, y along the fingers, z out of the back of the hand, with the wrist at the origin.
 * A left hand is the same hand mirrored in x.
 */
export type HandSide = 'right' | 'left';
export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
export type V3 = readonly [number, number, number];

export interface FingerPlan {
  readonly name: FingerName;
  /** The first joint, the two between, and the tip. */
  readonly joints: readonly [V3, V3, V3, V3];
  readonly radii: readonly [number, number, number, number];
}

export const FINGER_PLANS: readonly FingerPlan[] = Object.freeze([
  { name: 'thumb', joints: [[-0.024, 0.018, -0.008], [-0.05, 0.056, -0.014], [-0.064, 0.085, -0.016], [-0.073, 0.109, -0.016]], radii: [0.0135, 0.0108, 0.0098, 0.0082] },
  { name: 'index', joints: [[-0.027, 0.086, 0.001], [-0.0295, 0.125, 0.001], [-0.031, 0.148, 0.001], [-0.032, 0.169, 0.001]], radii: [0.0094, 0.0086, 0.0076, 0.0066] },
  { name: 'middle', joints: [[-0.006, 0.091, 0.002], [-0.006, 0.134, 0.002], [-0.006, 0.161, 0.002], [-0.006, 0.183, 0.002]], radii: [0.0096, 0.0088, 0.0078, 0.0068] },
  { name: 'ring', joints: [[0.015, 0.087, 0.001], [0.0175, 0.126, 0.001], [0.019, 0.151, 0.001], [0.02, 0.172, 0.001]], radii: [0.009, 0.0082, 0.0074, 0.0064] },
  { name: 'little', joints: [[0.034, 0.076, -0.001], [0.0385, 0.107, -0.001], [0.041, 0.126, -0.001], [0.043, 0.144, -0.001]], radii: [0.008, 0.0072, 0.0065, 0.0056] },
] as const) as readonly FingerPlan[];

/** The end of the glove on the forearm, and the half width and half thickness of the wrist there. */
export const GLOVE_END = -0.075;
export const WRIST_HALF = Object.freeze({ width: 0.033, thickness: 0.0205 });

type Cone = readonly [number, number, number, number, number, number, number, number];
const cone = (a: V3, b: V3, ra: number, rb: number): Cone => [a[0], a[1], a[2], b[0], b[1], b[2], ra, rb];

const PALM: readonly Cone[] = [
  cone([-0.018, 0.004, 0], FINGER_PLANS[1].joints[0], 0.0125, 0.0105),
  cone([-0.006, 0, 0], FINGER_PLANS[2].joints[0], 0.0125, 0.0105),
  cone([0.008, 0, 0], FINGER_PLANS[3].joints[0], 0.0125, 0.0102),
  cone([0.02, 0.004, 0], FINGER_PLANS[4].joints[0], 0.0125, 0.0095),
  // The ball of the thumb, and the heel of the hand under the little finger.
  cone([-0.02, 0.015, -0.008], [-0.046, 0.052, -0.014], 0.016, 0.0115),
  cone([0.024, 0.012, -0.006], [0.033, 0.062, -0.006], 0.0135, 0.0105),
  // The wrist, flat rather than round, as two lying side by side.
  cone([-0.012, 0.004, 0], [-0.0125, GLOVE_END, 0], 0.0195, 0.0205),
  cone([0.012, 0.004, 0], [0.0125, GLOVE_END, 0], 0.0195, 0.0205),
];

const FINGER_CONES: readonly (readonly Cone[])[] = FINGER_PLANS.map((plan) => [0, 1, 2].map((part) => cone(plan.joints[part], plan.joints[part + 1], plan.radii[part], plan.radii[part + 1])));

/** How far a point lies outside a tapered capsule, along the nearest point of its line. */
function coneDistance(c: Cone, x: number, y: number, z: number): number {
  const ax = c[3] - c[0], ay = c[4] - c[1], az = c[5] - c[2];
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const t = Math.max(0, Math.min(1, (px * ax + py * ay + pz * az) / (ax * ax + ay * ay + az * az)));
  const dx = px - ax * t, dy = py - ay * t, dz = pz - az * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (c[6] + (c[7] - c[6]) * t);
}

/** A union that rounds the join between two parts over about k. */
function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function palmDistance(x: number, y: number, z: number): number {
  let d = coneDistance(PALM[0], x, y, z);
  for (let i = 1; i < PALM.length; i++) d = smoothMin(d, coneDistance(PALM[i], x, y, z), 0.012);
  return d;
}

function fingerDistance(finger: number, x: number, y: number, z: number): number {
  const cones = FINGER_CONES[finger];
  return Math.min(coneDistance(cones[0], x, y, z), coneDistance(cones[1], x, y, z), coneDistance(cones[2], x, y, z));
}

/** How far a point lies outside the hand, negative inside. */
export function handDistance(x: number, y: number, z: number): number {
  let fingers = Infinity;
  for (let finger = 1; finger < 5; finger++) fingers = Math.min(fingers, fingerDistance(finger, x, y, z));
  const palm = palmDistance(x, y, z);
  // Nothing past the end of the glove.
  return Math.max(smoothMin(smoothMin(palm, fingers, 0.006), fingerDistance(0, x, y, z), 0.01), GLOVE_END - y);
}

export const BONE_COUNT = 17;
/** The forearm and the back of the hand come first, then three bones for each finger in the order of the plans. */
export const boneOf = (finger: number, part: number) => 2 + finger * 3 + part;

export interface HandSurface {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly boneIndices: Uint16Array;
  readonly boneWeights: Float32Array;
}

/** Turn the shape into a surface: one point in each small box that the surface passes through, joined to its neighbours. */
export function buildHandSurface(cell = 0.002): HandSurface {
  const low = [-0.095, GLOVE_END - cell * 2, -0.042], high = [0.066, 0.2, 0.03];
  const nx = Math.ceil((high[0] - low[0]) / cell) + 1, ny = Math.ceil((high[1] - low[1]) / cell) + 1, nz = Math.ceil((high[2] - low[2]) / cell) + 1;
  const values = new Float32Array(nx * ny * nz);
  for (let z = 0, at = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, at++) values[at] = handDistance(low[0] + x * cell, low[1] + y * cell, low[2] + z * cell);
  const valueAt = (x: number, y: number, z: number) => values[x + nx * (y + ny * z)];
  const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellAt = (x: number, y: number, z: number) => x + (nx - 1) * (y + (ny - 1) * z);
  const points: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let sx = 0, sy = 0, sz = 0, crossings = 0;
    for (const [a, b] of edges) {
      const ca = corners[a], cb = corners[b];
      const va = valueAt(x + ca[0], y + ca[1], z + ca[2]), vb = valueAt(x + cb[0], y + cb[1], z + cb[2]);
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t;
      crossings++;
    }
    if (!crossings) continue;
    cells[cellAt(x, y, z)] = points.length / 3;
    points.push(low[0] + (x + sx / crossings) * cell, low[1] + (y + sy / crossings) * cell, low[2] + (z + sz / crossings) * cell);
  }
  const triangles: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, outward: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (outward) triangles.push(a, b, c, a, c, d); else triangles.push(a, c, b, a, d, c);
  };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const here = valueAt(x, y, z) < 0;
    if (here !== valueAt(x + 1, y, z) < 0) quad(cells[cellAt(x, y - 1, z - 1)], cells[cellAt(x, y, z - 1)], cells[cellAt(x, y, z)], cells[cellAt(x, y - 1, z)], here);
    if (here !== valueAt(x, y + 1, z) < 0) quad(cells[cellAt(x - 1, y, z - 1)], cells[cellAt(x - 1, y, z)], cells[cellAt(x, y, z)], cells[cellAt(x, y, z - 1)], here);
    if (here !== valueAt(x, y, z + 1) < 0) quad(cells[cellAt(x - 1, y - 1, z)], cells[cellAt(x, y - 1, z)], cells[cellAt(x, y, z)], cells[cellAt(x - 1, y, z)], here);
  }
  const count = points.length / 3;
  const normals = new Float32Array(count * 3), boneIndices = new Uint16Array(count * 4), boneWeights = new Float32Array(count * 4);
  const scores = new Float64Array(BONE_COUNT);
  const order = Array.from({ length: BONE_COUNT }, (_, index) => index);
  for (let index = 0; index < count; index++) {
    const x = points[3 * index], y = points[3 * index + 1], z = points[3 * index + 2], step = 0.0006;
    const gx = handDistance(x + step, y, z) - handDistance(x - step, y, z), gy = handDistance(x, y + step, z) - handDistance(x, y - step, z), gz = handDistance(x, y, z + step) - handDistance(x, y, z - step);
    const size = Math.hypot(gx, gy, gz) || 1;
    normals[3 * index] = gx / size; normals[3 * index + 1] = gy / size; normals[3 * index + 2] = gz / size;
    // Each bone counts for more the nearer it lies; the wrist passes from the hand to the forearm over a short length.
    const score = (distance: number) => 1 / (0.0012 + Math.max(0, distance)) ** 3;
    scores.fill(0);
    const palm = score(palmDistance(x, y, z));
    const wrist = Math.max(0, Math.min(1, (y + 0.016) / 0.03));
    const toHand = wrist * wrist * (3 - 2 * wrist);
    scores[0] = palm * (1 - toHand);
    scores[1] = palm * toHand;
    FINGER_CONES.forEach((cones, finger) => cones.forEach((part, which) => { scores[boneOf(finger, which)] = score(coneDistance(part, x, y, z)); }));
    order.sort((left, right) => scores[right] - scores[left]);
    let total = 0;
    for (let k = 0; k < 4; k++) total += scores[order[k]];
    for (let k = 0; k < 4; k++) { boneIndices[4 * index + k] = order[k]; boneWeights[4 * index + k] = scores[order[k]] / total; }
  }
  return { positions: new Float32Array(points), normals, indices: new Uint32Array(triangles), boneIndices, boneWeights };
}

/** The same surface for the other hand: mirrored in x, with its triangles turned so that they still face outwards. */
export function mirrorHandSurface(surface: HandSurface): HandSurface {
  const positions = surface.positions.slice(), normals = surface.normals.slice(), indices = surface.indices.slice();
  for (let index = 0; index < positions.length; index += 3) { positions[index] = -positions[index]; normals[index] = -normals[index]; }
  for (let index = 0; index < indices.length; index += 3) { const swap = indices[index + 1]; indices[index + 1] = indices[index + 2]; indices[index + 2] = swap; }
  return { positions, normals, indices, boneIndices: surface.boneIndices, boneWeights: surface.boneWeights };
}
