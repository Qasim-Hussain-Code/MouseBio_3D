/**
 * Simulated exterior parts, placed from the source labels and the stance, following the
 * plates of Cook (1965). Shapes, counts and sizes here are estimates and are not measured.
 * All coordinates are source voxels of 0.1 mm, in the stance frame.
 */
import { vertexNormals, type PostureField } from './posture';
import { add, applyRigid, cross, dot, length, rotate, scale, sub, unit, type RigidTransform, type Vec3 } from './rig';
import { mergeSurfaces, tube } from './extract';
import { surfaceNets, type Surface } from './surface-nets';
import { smoothField, voxelIndex, type Grid } from './volume';
import type { AttachmentPart } from './structures';
import type { Landmarks } from './landmarks';

interface Context { readonly labels: Uint8Array; readonly grid: Grid; readonly landmarks: Landmarks }

/** Deterministic pseudo-random numbers, so that the build reproduces byte for byte. */
function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
}

const sphere = (centre: Vec3, radii: Vec3, rows = 18, columns = 28): Surface => {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    const theta = Math.PI * r / rows, phi = 2 * Math.PI * c / columns;
    const n: Vec3 = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
    positions.push(centre[0] + radii[0] * n[0], centre[1] + radii[1] * n[1], centre[2] + radii[2] * n[2]);
    const m = unit([n[0] / radii[0], n[1] / radii[1], n[2] / radii[2]]);
    normals.push(m[0], m[1], m[2]);
  }
  const at = (r: number, c: number) => r * (columns + 1) + c;
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    if (r > 0) indices.push(at(r, c), at(r + 1, c), at(r, c + 1));
    if (r < rows - 1) indices.push(at(r, c + 1), at(r + 1, c), at(r + 1, c + 1));
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
};

/** A rigid copy of a surface. */
function moved(surface: Surface, transform: RigidTransform): Surface {
  const positions = new Float32Array(surface.positions.length), normals = new Float32Array(surface.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    const p = applyRigid(transform, [surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]]);
    const n = rotate(transform.rotation, [surface.normals[i], surface.normals[i + 1], surface.normals[i + 2]]);
    positions[i] = p[0]; positions[i + 1] = p[1]; positions[i + 2] = p[2];
    normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
  }
  return { positions, normals, indices: surface.indices };
}

/** Polygonize a signed function, positive inside, on a local grid around a box. */
function sculpt(box: readonly [Vec3, Vec3], cell: number, value: (p: Vec3) => number, radius = 1): Surface {
  const size = sub(box[1], box[0]);
  const grid: Grid = { nx: Math.ceil(size[0] / cell) + 8, ny: Math.ceil(size[1] / cell) + 8, nz: Math.ceil(size[2] / cell) + 8 };
  const origin: Vec3 = [box[0][0] - 4 * cell, box[0][1] - 4 * cell, box[0][2] - 4 * cell];
  const field = new Float32Array(grid.nx * grid.ny * grid.nz);
  for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
    field[voxelIndex(grid, x, y, z)] = value([origin[0] + x * cell, origin[1] + y * cell, origin[2] + z * cell]);
  }
  return surfaceNets(radius ? smoothField(field, grid, radius) : field, grid, 0, origin, cell);
}

/** Signed distance to a capsule with radii that taper from a to b, positive inside. */
function capsule(p: Vec3, a: Vec3, b: Vec3, ra: number, rb: number): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return ra + (rb - ra) * t - length(sub(p, add(a, scale(ab, t))));
}
const smoothUnion = (a: number, b: number, k: number) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k)); return b + (a - b) * h + k * h * (1 - h); };

/** Direction bases for a paw: forward along the digits, lateral across them, up out of the back of the hand. */
interface PawFrame { origin: Vec3; forward: Vec3; lateral: Vec3; up: Vec3 }

function pawFrame(origin: Vec3, side: -1 | 1, ground: number, toeOut = 0.14): PawFrame {
  const forward = unit([side * toeOut, -1, 0]);
  const up: Vec3 = [0, 0, 1];
  const lateral = unit(cross(forward, up));
  return { origin: [origin[0], origin[1], Math.max(ground + 8, origin[2])], forward, lateral: scale(lateral, dot(lateral, [side, 0, 0]) >= 0 ? 1 : -1), up };
}
const inPaw = (frame: PawFrame, along: number, across: number, height: number): Vec3 =>
  add(frame.origin, add(add(scale(frame.forward, along), scale(frame.lateral, across)), scale(frame.up, height)));

interface Digit { base: Vec3; knuckle: Vec3; tip: Vec3; radius: number }

/** Digits are given by base position across the paw and length, from the medial side outwards. */
function digits(frame: PawFrame, layout: readonly (readonly [number, number, number, number])[]): Digit[] {
  return layout.map(([across, start, len, spread]) => {
    const base = inPaw(frame, start, across, 4);
    const knuckle = inPaw(frame, start + len * 0.55, across + spread * 0.55, 5);
    const tip = inPaw(frame, start + len, across + spread, 1);
    return { base, knuckle, tip, radius: 4.6 };
  });
}

/** The back of the fore paw and four digits with a small pollex, after Cook figure 6. */
function forepaw(wrist: Vec3, side: -1 | 1, ground: number): { skin: Surface; claws: Surface[] } {
  // Spacing and lengths follow the digit bones in the CT of the scanned paw, which lay palm down as this one does.
  const frame = pawFrame(wrist, side, ground, 0);
  const digitList = digits(frame, [[-15, 24, 28, -3], [-5, 26, 40, -1], [5, 26, 39, 1], [15, 22, 24, 3]]);
  const pollex = [inPaw(frame, 12, -19, 4), inPaw(frame, 17, -21, 3)] as const;
  const skin = sculpt([add(frame.origin, [-45, -75, -14]), add(frame.origin, [45, 20, 18])], 1.2, (p) => {
    let value = capsule(p, inPaw(frame, -14, 0, 6), inPaw(frame, 0, 0, 5), 10, 10.5);
    value = smoothUnion(value, capsule(p, inPaw(frame, 0, -6, 4.5), inPaw(frame, 24, -9, 4), 10, 8.5), 3);
    value = smoothUnion(value, capsule(p, inPaw(frame, 0, 6, 4.5), inPaw(frame, 24, 9, 4), 10, 8.5), 3);
    for (const digit of digitList) {
      value = smoothUnion(value, capsule(p, digit.base, digit.knuckle, digit.radius, digit.radius * 0.88), 2);
      value = smoothUnion(value, capsule(p, digit.knuckle, digit.tip, digit.radius * 0.88, digit.radius * 0.58), 1.2);
    }
    value = smoothUnion(value, capsule(p, pollex[0], pollex[1], 3.4, 2.6), 2);
    // Walking pads on the sole.
    for (const [along, across, r] of [[18, -10, 3.6], [20, 0, 3.4], [18, 10, 3.6], [6, -9, 3.8], [4, 7, 4.2]] as const) value = smoothUnion(value, r - length(sub(p, inPaw(frame, along, across, 0.2))), 1.2);
    return value;
  });
  const claws = digitList.map((digit) => clawOn(digit.tip, unit(sub(digit.tip, digit.knuckle)), frame.up, 2.4, 11));
  claws.push(sphere(inPaw(frame, 20, -18, 3), [1.8, 2.2, 0.7], 8, 12));
  return { skin, claws };
}

/** The hind paw is long and narrow with five digits, after Cook figure 7. The heel sits under the ankle. */
function hindpaw(ankle: Vec3, side: -1 | 1, ground: number): { skin: Surface; claws: Surface[]; bones: Surface[] } {
  const frame = pawFrame(ankle, side, ground);
  frame.origin = [ankle[0], ankle[1], ground + 7];
  const digitList = digits(frame, [[-14, 62, 24, -7], [-6.5, 72, 34, -2], [0, 74, 37, 0], [6.5, 72, 34, 2], [14, 58, 28, 7]]);
  const skin = sculpt([add(frame.origin, [-50, -125, -14]), add(frame.origin, [50, 35, 40])], 1.3, (p) => {
    let value = capsule(p, inPaw(frame, -18, 0, 8), inPaw(frame, 18, 0, 6), 9.5, 10);
    value = smoothUnion(value, capsule(p, inPaw(frame, 18, 0, 6), inPaw(frame, 66, 0, 5), 10, 13), 4);
    value = smoothUnion(value, capsule(p, inPaw(frame, 60, -7, 4.5), inPaw(frame, 72, -7, 4.5), 7, 6), 3);
    value = smoothUnion(value, capsule(p, inPaw(frame, 60, 7, 4.5), inPaw(frame, 72, 7, 4.5), 7, 6), 3);
    // The ankle rises into the shank.
    value = smoothUnion(value, capsule(p, inPaw(frame, -8, 0, 8), [ankle[0], ankle[1] + 6, ankle[2] + 22], 9.5, 11), 4);
    for (const digit of digitList) {
      value = smoothUnion(value, capsule(p, digit.base, digit.knuckle, digit.radius, digit.radius * 0.9), 2);
      value = smoothUnion(value, capsule(p, digit.knuckle, digit.tip, digit.radius * 0.9, digit.radius * 0.6), 1.2);
    }
    for (const [along, across, r] of [[64, -10, 3.2], [68, -2, 3.2], [68, 5, 3.2], [62, 11, 3.2], [36, 6, 3.2], [28, -7, 3]] as const) value = smoothUnion(value, r - length(sub(p, inPaw(frame, along, across, 0.1))), 1.2);
    return value;
  });
  // Seven tarsals, five metatarsals and phalanges by the counts in Hummel et al., drawn as simple shafts.
  const bones: Surface[] = [
    tube([inPaw(frame, -20, 0, 8), inPaw(frame, -6, 0, 8), inPaw(frame, 8, 0, 8)], [3.6, 3.2, 3.4], 8),
    ...[[14, -5, 6], [14, 5, 6], [22, -5, 5.6], [22, 0, 5.6], [22, 5, 5.6], [10, 0, 10], [30, 0, 5.4]].map(([along, across, height]) => sphere(inPaw(frame, along, across, height), [2.6, 2.6, 2.1], 6, 8)),
    ...digitList.flatMap((digit, index) => {
      const heel = inPaw(frame, 32, [-5, -2.5, 0, 2.5, 5][index], 5);
      const shafts: Surface[] = [tube([heel, digit.base], [1.5, 1.3], 6)];
      const knuckle2 = add(digit.base, scale(sub(digit.knuckle, digit.base), 0.55));
      shafts.push(tube([digit.base, knuckle2], [1.1, 1], 6));
      if (index !== 0) shafts.push(tube([knuckle2, digit.knuckle], [1, 0.9], 6));
      shafts.push(tube([index === 0 ? knuckle2 : digit.knuckle, digit.tip], [0.9, 0.5], 6));
      return shafts;
    }),
  ];
  return { skin, claws: digitList.map((digit) => clawOn(digit.tip, unit(sub(digit.tip, digit.knuckle)), frame.up, 2.6, 13)), bones };
}

/** A claw curving down from the digit tip. */
function clawOn(tip: Vec3, forward: Vec3, up: Vec3, radius: number, len: number): Surface {
  const points: Vec3[] = [], radii: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    points.push(add(add(tip, scale(forward, len * t - 2)), scale(up, 1.2 - 3.2 * t * t)));
    radii.push(radius * (1 - t) ** 0.8 + 0.08);
  }
  return tube(points, radii, 8);
}

/**
 * A thin cupped sheet, after Cook figures 4 and 5, built from a polar grid so that its rim is smooth.
 * The outline is a rounded oval narrowing to the root, the middle is a shallow bowl with a fold near the base,
 * and the sheet thins towards the rim.
 */
function pinna(root: Vec3, side: -1 | 1): Surface {
  const out = unit([side * 0.55, 0.22, 0.8]);     // from the root towards the rim, up and outwards
  const face = unit([side * 0.5, -0.85, 0.05]);   // the concave side faces forwards and outwards
  const across = unit(cross(out, face));
  const faceTrue = unit(cross(across, out));
  const width = 84, height = 96, cup = 20;
  const rings = 26, segments = 72;
  const centre = add(root, scale(out, height * 0.46));
  const outline = (theta: number) => {
    // Rounded above, narrowing towards the root below.
    const v = Math.sin(theta), u = Math.cos(theta);
    const narrow = v < 0 ? 1 - 0.42 * v * v : 1;
    return [u * width * 0.5 * narrow, v * height * (v < 0 ? 0.46 : 0.54)] as const;
  };
  const sheet = (r: number, u: number, v: number) => {
    const fold = 2.6 * Math.exp(-(((u - 6) / 8) ** 2)) * Math.max(0, 1 - Math.abs(v + 20) / 30);
    const antihelix = 1.1 * Math.exp(-(((r - 0.82) / 0.1) ** 2));
    return cup * (1 - r * r) - cup * 0.3 + fold + antihelix;
  };
  const positions: number[] = [];
  const indices: number[] = [];
  const point = (r: number, theta: number, offset: number): Vec3 => {
    const [ou, ov] = outline(theta);
    const u = ou * r, v = ov * r;
    return add(add(add(centre, scale(across, u)), scale(out, v)), scale(faceTrue, -sheet(r, u, v) + offset));
  };
  const thickness = (r: number) => 0.55 + 1.05 * (1 - r) ** 0.7;
  // Inner face, outer face, each from the centre point outwards.
  const pushFace = (sign: 1 | -1) => {
    const base = positions.length / 3;
    const c = point(0, 0, sign * thickness(0));
    positions.push(c[0], c[1], c[2]);
    for (let ring = 1; ring <= rings; ring++) for (let s = 0; s < segments; s++) {
      const r = ring / rings, theta = 2 * Math.PI * s / segments;
      const p = point(r, theta, sign * thickness(r));
      positions.push(p[0], p[1], p[2]);
    }
    const at = (ring: number, s: number) => base + 1 + (ring - 1) * segments + (s % segments);
    for (let s = 0; s < segments; s++) {
      if (sign > 0) indices.push(base, at(1, s + 1), at(1, s)); else indices.push(base, at(1, s), at(1, s + 1));
      for (let ring = 1; ring < rings; ring++) {
        const a = at(ring, s), b = at(ring, s + 1), c2 = at(ring + 1, s), d = at(ring + 1, s + 1);
        if (sign > 0) indices.push(a, b, c2, b, d, c2); else indices.push(a, c2, b, b, c2, d);
      }
    }
    return (s: number) => at(rings, s);
  };
  const front = pushFace(-1), back = pushFace(1);
  for (let s = 0; s < segments; s++) indices.push(front(s), front(s + 1), back(s), front(s + 1), back(s + 1), back(s));
  const positionArray = Float32Array.from(positions), indexArray = Uint32Array.from(indices);
  return { positions: positionArray, normals: vertexNormals(positionArray, indexArray), indices: indexArray };
}

/** The tail runs along the caudal vertebrae measured in the CT, then falls to the ground and curves. */
function buildTail(landmarks: Landmarks, ground: number, totalLength: number, pelvis: RigidTransform): { skin: Surface; vertebrae: Surface } {
  const points: Vec3[] = [], radii: number[] = [];
  const ringStep = 3.2;
  const measured: Vec3[] = [];
  for (let y = 850; y <= 925; y += ringStep / 2) { const s = landmarks.spineAt(y); measured.push(applyRigid(pelvis, [s.x, y, s.canalZ - 4])); }
  const rows = Math.round(totalLength / ringStep * 2);
  let p = measured[0];
  let dir = unit(sub(measured[measured.length - 1], measured[0]));
  const rest = ground + 10;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    points.push(p);
    const base = 11 * (1 - t) ** 0.85 + 2.8;
    // A shallow ring at each scale row: tail annuli, after Cook figure 4.
    radii.push(base * (1 + (i % 2 ? 0.035 : -0.035)));
    // The tail falls to the ground and then curves gently to one side.
    if (i + 1 < measured.length) { p = measured[i + 1]; continue; }
    const heading = 0.95 * Math.sin(Math.max(0, t - 0.2) * 2.6);
    const target: Vec3 = p[2] > rest + 1 ? unit([0.02, 1, -0.75]) : unit([Math.sin(heading), Math.cos(heading), 0]);
    dir = unit(add(scale(dir, 0.975), scale(target, 0.025)));
    p = add(p, scale(dir, ringStep / 2));
    if (p[2] < rest) p = [p[0], p[1], rest];
  }
  // Hummel et al. count 27 to 30 caudal vertebrae. About eight lie in the CT; the others are simple shafts along the tail.
  const count = 20;
  const first = measured.length, shafts: Surface[] = [];
  const usable = points.length - first - 4;
  for (let k = 0; k < count; k++) {
    const from = first + Math.round(usable * (k + 0.06) / count), to = first + Math.round(usable * (k + 0.94) / count);
    const a = points[from], b = points[to], c = add(a, scale(sub(b, a), 0.5));
    const r = radii[Math.round((from + to) / 2)] * 0.56;
    shafts.push(tube([a, add(a, scale(sub(b, a), 0.18)), c, add(a, scale(sub(b, a), 0.82)), b], [r * 1.25, r * 0.9, r * 0.8, r * 0.9, r * 1.25], 8));
  }
  return { skin: tube(points, radii, 14), vertebrae: mergeSurfaces(shafts) };
}

/** A whisker: a tapering hair sweeping out from its follicle. */
function hair(rootAt: Vec3, direction: Vec3, droop: Vec3, len: number, radius: number): Surface {
  const points: Vec3[] = [], radii: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    points.push(add(rootAt, add(scale(direction, len * t), scale(droop, len * t * t))));
    radii.push(radius * (1 - t) + 0.05);
  }
  return tube(points, radii, 5);
}

/** The foremost labelled point of the snout. */
function rostralTip(context: Context): Vec3 {
  const { labels, grid } = context;
  for (let y = 0; y < grid.ny; y++) {
    let sx = 0, sz = 0, n = 0;
    for (let z = 0; z < grid.nz; z++) for (let x = 0; x < grid.nx; x++) if (labels[voxelIndex(grid, x, y, z)]) { sx += x; sz += z; n++; }
    if (n > 40) return [sx / n, y, sz / n];
  }
  throw new Error('No snout found');
}

/** The head is measured here from the source eye label, the only sensory landmark in the labels. */
function eyePositions(context: Context): { left: Vec3; right: Vec3 } {
  const { labels, grid } = context;
  const totals = [[0, 0, 0, 0], [0, 0, 0, 0]];
  const middle = 190;
  for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
    if (labels[voxelIndex(grid, x, y, z)] !== 3) continue;
    const side = totals[x < middle ? 0 : 1];
    side[0] += x; side[1] += y; side[2] += z; side[3]++;
  }
  const mean = (t: number[]): Vec3 => [t[0] / t[3], t[1] / t[3], t[2] / t[3]];
  return { left: mean(totals[0]), right: mean(totals[1]) };
}

export interface AttachmentResult { readonly parts: Record<AttachmentPart, Surface>; readonly eyes: readonly [Vec3, Vec3]; readonly earRoots: readonly [Vec3, Vec3]; readonly tip: Vec3 }

export function buildAttachments(posture: PostureField, context: Context): AttachmentResult {
  const { joints, groundZ } = posture.pose;
  const eyes = eyePositions(context);
  // The globe bulges through the body surface where a ray from the label leaves the head sideways and up.
  const eyeRadius = 15;
  const outward = (start: Vec3, direction: Vec3): Vec3 => {
    let p = start;
    for (let i = 0; i < 200; i++) {
      const q = add(p, direction);
      if (!context.labels[voxelIndex(context.grid, Math.round(q[0]), Math.round(q[1]), Math.round(q[2]))]) break;
      p = q;
    }
    return p;
  };
  const eyeOut = (centre: Vec3, side: -1 | 1): Vec3 => {
    const direction = unit([side * 0.86, 0, 0.5]);
    return add(outward(centre, direction), scale(direction, -eyeRadius * 0.42));
  };
  const eyeLeft = eyeOut(eyes.left, -1);
  const eyeRight = eyeOut(eyes.right, 1);
  const midX = (eyes.left[0] + eyes.right[0]) / 2;
  const tip = rostralTip(context);

  const foreR = forepaw(joints.wristR, -1, groundZ), foreL = forepaw(joints.wristL, 1, groundZ);
  const hindR = hindpaw(joints.ankleR, -1, groundZ), hindL = hindpaw(joints.ankleL, 1, groundZ);

  // Ear roots lie behind and above the eyes, on the side of the skull.
  const earR: Vec3 = [midX - 60, eyes.left[1] + 92, eyes.left[2] + 46];
  const earL: Vec3 = [midX + 60, eyes.right[1] + 92, eyes.right[2] + 46];

  const nose = (() => {
    const centre: Vec3 = [tip[0], tip[1] + 7, tip[2] + 3];
    return mergeSurfaces([sphere(centre, [9.5, 9, 7.5]), sphere(add(centre, [-6, -5, 0]), [4.2, 4.2, 4.2], 10, 14), sphere(add(centre, [6, -5, 0]), [4.2, 4.2, 4.2], 10, 14)]);
  })();

  // Whisker groups, after Cook figure 5. Mystacial rows lie on the side of the snout and sweep backwards and out.
  const rng = random(19650607);
  const whiskers: Surface[] = [];
  for (const side of [-1, 1] as const) {
    for (let row = 0; row < 5; row++) for (let column = 0; column < 7; column++) {
      if ((row === 0 || row === 4) && column > 4) continue;
      const root: Vec3 = [tip[0] + side * (15 + column * 3.4 + row * 1.5), tip[1] + 22 + column * 9, tip[2] + 7 - row * 5.2];
      const spreadUp = (2 - row) * 0.24 + (rng() - 0.5) * 0.1;
      const direction = unit([side * (0.8 + rng() * 0.1), 0.18 + column * 0.11 + rng() * 0.08, spreadUp]);
      const len = 70 + column * 24 + rng() * 25;
      whiskers.push(hair(root, direction, [side * -0.05, 0.16, -0.1], len, 0.42 + column * 0.04));
    }
    // Superciliary, above the eye.
    const eye = side < 0 ? eyeLeft : eyeRight;
    for (const k of [0, 1]) whiskers.push(hair(add(eye, [side * 6, -3 + k * 7, 16]), unit([side * 0.5, 0.35, 0.8]), [0, 0.2, -0.12], 70 + rng() * 20, 0.34));
    // Genal, on the cheek.
    for (const k of [0, 1]) whiskers.push(hair([midX + side * 50, eye[1] + 55 + k * 14, eye[2] - 34 - k * 8], unit([side * 0.8, 0.5, -0.1]), [0, 0.2, -0.12], 60 + rng() * 15, 0.32));
    // Submental and interramal, under the jaw.
    for (const k of [0, 1, 2]) whiskers.push(hair([tip[0] + side * (4 + k * 3), tip[1] + 38 + k * 12, tip[2] - 24 - k], unit([side * 0.45, 0.45, -0.75]), [0, 0.2, -0.08], 40 + rng() * 12, 0.28));
  }

  const tail = buildTail(context.landmarks, groundZ, 800, posture.pose.transforms.pelvis);
  const head = posture.pose.transforms.head;
  const parts: Record<AttachmentPart, Surface> = {
    eyes: moved(mergeSurfaces([sphere(eyeLeft, [eyeRadius, eyeRadius, eyeRadius]), sphere(eyeRight, [eyeRadius, eyeRadius, eyeRadius])]), head),
    pinnae: moved(mergeSurfaces([pinna(earR, -1), pinna(earL, 1)]), head),
    nose: moved(nose, head),
    vibrissae: moved(mergeSurfaces(whiskers), head),
    forepaws: mergeSurfaces([foreR.skin, foreL.skin]),
    hindpaws: mergeSurfaces([hindR.skin, hindL.skin]),
    claws: mergeSurfaces([...foreR.claws, ...foreL.claws, ...hindR.claws, ...hindL.claws]),
    tail: tail.skin,
    'tail-vertebrae': tail.vertebrae,
    'foot-bones': mergeSurfaces([...hindR.bones, ...hindL.bones]),
  };
  return { parts, eyes: [applyRigid(head, eyeLeft), applyRigid(head, eyeRight)], earRoots: [applyRigid(head, earR), applyRigid(head, earL)], tip: applyRigid(head, tip) };
}
