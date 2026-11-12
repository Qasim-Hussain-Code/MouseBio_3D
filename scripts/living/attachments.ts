/**
 * Simulated exterior parts, placed from the source labels and the stance, following the
 * plates of Cook (1965). Shapes, counts and sizes here are estimates and are not measured.
 * All coordinates are source voxels of 0.1 mm, in the stance frame.
 */
import { vertexNormals, type PostureField } from './posture';
import { nasalAt, route } from './internal';
import { add, applyRigid, cross, dot, length, rotate, scale, sub, unit, type RigidTransform, type Vec3 } from './rig';
import { mergeSurfaces, tube } from './extract';
import { curve } from './internal';
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
  return { positions, normals, indices: surface.indices, colors: surface.colors, lines: surface.lines };
}

/** Tint a surface by a function of position and normal. */
function tinted(surface: Surface, tint: (p: Vec3, n: Vec3) => Vec3): Surface {
  const colors = new Float32Array(surface.positions.length);
  for (let i = 0; i < colors.length; i += 3) {
    const value = tint([surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]], [surface.normals[i], surface.normals[i + 1], surface.normals[i + 2]]);
    colors[i] = value[0]; colors[i + 1] = value[1]; colors[i + 2] = value[2];
  }
  return { ...surface, colors };
}

/** Lids on the visible part of the globe: an almond-shaped line that lies on its surface. */
function eyelid(centre: Vec3, outward: Vec3, radius: number): Surface {
  const along = unit(sub([0, 1, 0], scale(outward, dot([0, 1, 0], outward))));
  const across = unit(cross(outward, along));
  const points: Vec3[] = [], radii: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const angle = 2 * Math.PI * i / 48;
    const a = Math.cos(angle) * radius * 0.92, b = Math.sin(angle) * radius * 0.7 * (1 - 0.28 * Math.cos(angle) ** 2);
    const height = Math.sqrt(Math.max(0, radius * radius - a * a - b * b));
    points.push(add(add(add(centre, scale(along, a)), scale(across, b)), scale(outward, height)));
    radii.push(0.85);
  }
  return tube(points, radii, 8);
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

/** The shape of a simulated paw, positive inside, in voxels of the source. */
export type PawField = (p: Vec3) => number;

/** The undersides of paws, where the walking pads lie, are darker. */
const padTint = (ground: number) => (p: Vec3, n: Vec3): Vec3 => {
  const down = Math.max(0, -n[2]) * Math.max(0, 1 - (p[2] - ground) / 10);
  const value = 1 - 0.28 * down;
  return [value, value * 0.92, value * 0.9];
};

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

/** An artery and vein along each digit from the middle of the paw, with a nerve beside them, on the side of the sole, as simple courses. */
function digitalRoutes(frame: PawFrame, digitList: readonly Digit[], from: number): { arteries: Surface[]; veins: Surface[]; nerves: Surface[] } {
  const along = (digit: Digit, across: number, drop: number): Vec3[] => {
    const shift = (p: Vec3, reach: number) => add(add(p, scale(frame.lateral, across * reach)), scale(frame.up, -drop * reach));
    return [inPaw(frame, from, across * 2, 4), inPaw(frame, (from + dot(sub(digit.base, frame.origin), frame.forward)) / 2, dot(sub(digit.base, frame.origin), frame.lateral) * 0.6, 4), shift(digit.base, 1), shift(digit.knuckle, 1), shift(digit.tip, 0.7)];
  };
  return {
    arteries: digitList.map((digit) => route(along(digit, -1.2, 1), 0.5, 0.22, 5)),
    veins: digitList.map((digit) => route(along(digit, 0.3, 1.2), 0.55, 0.25, 5)),
    nerves: digitList.map((digit) => route(along(digit, 1.5, 1), 0.42, 0.2, 5)),
  };
}

/** On the back of the fore paw, the dorsal metacarpal arteries fan out from the wrist, where the collateral radial artery comes down the forearm, after Cook figure 108. */
function forepawDorsalArteries(frame: PawFrame, digitList: readonly Digit[]): Surface[] {
  const start = inPaw(frame, -13, -2, 12.5);
  return digitList.map((digit) => {
    const across = dot(sub(digit.base, frame.origin), frame.lateral);
    return route([start, inPaw(frame, 2, across * 0.45, 12), inPaw(frame, 14, across * 0.85, 10.5), add(digit.base, scale(frame.up, 3))], 0.42, 0.25, 5);
  });
}

/**
 * The vessels of the hind foot after Cook figures 103 and 104: a lateral and a medial marginal vein along the borders of the foot and up the shank, dorsal metatarsal veins from the digits to the lateral one,
 * a medial tarsal artery and vein on the back of the tarsus, and veins on the sole to the pads between the digits. Their courses are estimates from the figures.
 */
function hindpawVessels(frame: PawFrame, digitList: readonly Digit[], ankle: Vec3): { arteries: Surface[]; veins: Surface[] } {
  const shank = (across: number): Vec3 => add([ankle[0], ankle[1] + 6, ankle[2] + 22], scale(frame.lateral, across));
  const lateral = [inPaw(frame, 60, 11.5, 8), inPaw(frame, 42, 10.5, 9), inPaw(frame, 22, 9, 9.5), inPaw(frame, 2, 7.8, 10.5), inPaw(frame, -10, 7, 12.5), shank(8.5)];
  const medial = [inPaw(frame, 58, -11.5, 8), inPaw(frame, 38, -10.5, 9), inPaw(frame, 18, -9, 9.5), inPaw(frame, -2, -7.8, 10.5), inPaw(frame, -10, -7, 12.5), shank(-8.5)];
  const metatarsal = digitList.slice(1, 4).map((digit) => {
    const across = dot(sub(digit.base, frame.origin), frame.lateral);
    return [add(digit.base, scale(frame.up, 3.2)), inPaw(frame, 50, across * 0.8, 13.5), inPaw(frame, 34, 6 + across * 0.25, 13), inPaw(frame, 24, 9, 9.8)];
  });
  const tarsalArtery = [inPaw(frame, -12, -3, 14), inPaw(frame, 8, -3.5, 14.5), inPaw(frame, 30, -4, 13.5)];
  const tarsalVein = tarsalArtery.map((point) => add(point, scale(frame.lateral, 1.4)));
  const pads = ([[62, -9], [66, -2], [66, 4.5], [60, 10]] as const).map(([along, across]) => [inPaw(frame, 44, -10, 3), inPaw(frame, (44 + along) / 2, (across - 10) / 2, 2), inPaw(frame, along, across, 1.6)]);
  return {
    arteries: [route(tarsalArtery, 0.45, 0.3, 5)],
    veins: [route(lateral, 0.75, 0.5, 6), route(medial, 0.6, 0.4, 6), ...metatarsal.map((points) => route(points, 0.35, 0.45, 5)), route(tarsalVein, 0.4, 0.3, 5), ...pads.map((points) => route(points, 0.4, 0.25, 5))],
  };
}

/** The sculpted shape of the fore paw, after Cook figure 6, with the frame and digits it is built on. */
function forepawShape(wrist: Vec3, side: -1 | 1, ground: number): { frame: PawFrame; digitList: Digit[]; shape: PawField; box: readonly [Vec3, Vec3] } {
  // Spacing and lengths follow the digit bones in the CT of the scanned paw, which lay palm down as this one does.
  const frame = pawFrame(wrist, side, ground, 0);
  const digitList = digits(frame, [[-15, 24, 28, -3], [-5, 26, 40, -1], [5, 26, 39, 1], [15, 22, 24, 3]]);
  const pollex = [inPaw(frame, 12, -19, 4), inPaw(frame, 17, -21, 3)] as const;
  const shape: PawField = (p) => {
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
  };
  return { frame, digitList, shape, box: [add(frame.origin, [-45, -75, -14]), add(frame.origin, [45, 20, 18])] };
}

/** The back of the fore paw and four digits with a small pollex. */
function forepaw(wrist: Vec3, side: -1 | 1, ground: number): { skin: Surface; claws: Surface[]; routes: ReturnType<typeof digitalRoutes>; field: PawField } {
  const { frame, digitList, shape: field, box } = forepawShape(wrist, side, ground);
  const skin = sculpt(box, 1.2, field);
  const claws = digitList.map((digit) => clawOn(digit.tip, unit(sub(digit.tip, digit.knuckle)), frame.up, 2.4, 11));
  claws.push(sphere(inPaw(frame, 20, -18, 3), [1.8, 2.2, 0.7], 8, 12));
  const routes = digitalRoutes(frame, digitList, -6);
  return { skin, claws, routes: { ...routes, arteries: [...routes.arteries, ...forepawDorsalArteries(frame, digitList)] }, field };
}

/** The sculpted shape of the hind paw, long and narrow with five digits, after Cook figure 7. The heel sits under the ankle. */
function hindpawShape(ankle: Vec3, side: -1 | 1, ground: number): { frame: PawFrame; digitList: Digit[]; shape: PawField; box: readonly [Vec3, Vec3] } {
  const frame = pawFrame(ankle, side, ground);
  frame.origin = [ankle[0], ankle[1], ground + 7];
  const digitList = digits(frame, [[-14, 62, 24, -7], [-6.5, 72, 34, -2], [0, 74, 37, 0], [6.5, 72, 34, 2], [14, 58, 28, 7]]);
  const shape: PawField = (p) => {
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
  };
  return { frame, digitList, shape, box: [add(frame.origin, [-50, -125, -14]), add(frame.origin, [50, 35, 40])] };
}

/** The hind paw, with its simulated bones beyond the scan. */
function hindpaw(ankle: Vec3, side: -1 | 1, ground: number): { skin: Surface; claws: Surface[]; bones: Surface[]; heel: Vec3; routes: ReturnType<typeof digitalRoutes>; field: PawField } {
  const { frame, digitList, shape: field, box } = hindpawShape(ankle, side, ground);
  const skin = sculpt(box, 1.3, field);
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
  return { skin, claws: digitList.map((digit) => clawOn(digit.tip, unit(sub(digit.tip, digit.knuckle)), frame.up, 2.6, 13)), bones, heel: inPaw(frame, -20, 0, 8), routes: (() => { const routes = digitalRoutes(frame, digitList, -10), vessels = hindpawVessels(frame, digitList, ankle); return { ...routes, arteries: [...routes.arteries, ...vessels.arteries], veins: vessels.veins }; })(), field };
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
 * The outline is a rounded oval narrowing to the root, and the middle is a shallow bowl. As in figure 5, a dark opening
 * lies low on the front of the bowl with a ridge behind it, the rim rolls a little forwards, and the sheet thins towards the rim.
 */
function pinna(root: Vec3, side: -1 | 1): Surface {
  const out = unit([side * 0.5, 0.2, 0.84]);      // from the root towards the rim, up and outwards
  const face = unit([side * 0.62, -0.78, 0.05]);  // the concave side faces forwards and outwards
  const across = unit(cross(out, face));
  const faceTrue = unit(cross(across, out));
  // Which way along `across` is towards the nose differs between the two ears.
  const front = dot(across, [0, -1, 0]) >= 0 ? 1 : -1;
  const width = 78, height = 88, cup = 19;
  const rings = 30, segments = 76;
  const centre = add(root, scale(out, height * 0.46));
  const outline = (theta: number) => {
    // Rounded above, narrowing towards the root below.
    const v = Math.sin(theta), u = Math.cos(theta);
    const narrow = v < 0 ? 1 - 0.42 * v * v : 1;
    return [u * width * 0.5 * narrow, v * height * (v < 0 ? 0.46 : 0.54)] as const;
  };
  const opening = (u: number, v: number) => Math.exp(-(((front * u - 8) / 8) ** 2) - (((v + 24) / 11) ** 2));
  const funnel = (u: number, v: number) => Math.exp(-(((front * u - 5) / 24) ** 2) - (((v + 12) / 28) ** 2));
  const sheet = (r: number, u: number, v: number, theta: number) => {
    const ridge = 2.4 * Math.exp(-(((front * u + 13) / 8) ** 2)) * Math.max(0, 1 - Math.abs(v + 16) / 26);
    const rim = 1.3 * Math.exp(-(((r - 0.88) / 0.09) ** 2));
    const wave = 0.8 * Math.sin(theta * 3 + 1) * r * r * r;
    return cup * (1 - r * r) - cup * 0.28 + 8 * opening(u, v) - ridge - rim + wave;
  };
  const positions: number[] = [];
  const indices: number[] = [];
  const shades: number[] = [];
  const point = (r: number, theta: number, offset: number): Vec3 => {
    const [ou, ov] = outline(theta);
    const u = ou * r, v = ov * r;
    return add(add(add(centre, scale(across, u)), scale(out, v)), scale(faceTrue, -sheet(r, u, v, theta) + offset));
  };
  const thickness = (r: number) => 0.55 + 1.05 * (1 - r) ** 0.7;
  const shadeOf = (r: number, theta: number, inner: boolean) => {
    const [ou, ov] = outline(theta);
    const vein = 1 - 0.1 * Math.max(0, Math.sin(theta * 11 + r * 7)) ** 8 * r;
    if (!inner) return 0.74 * vein;
    // Darker into the bowl and pale at the rim, where light comes through the thin sheet.
    return (0.82 + 0.26 * r * r) * (1 - 0.42 * funnel(ou * r, ov * r)) * (1 - 0.92 * opening(ou * r, ov * r)) * vein;
  };
  // Each face runs from the centre outwards. Windings are chosen so that normals point away from the sheet.
  const pushFace = (sign: 1 | -1) => {
    const base = positions.length / 3;
    const c = point(0, 0, sign * thickness(0));
    positions.push(c[0], c[1], c[2]);
    shades.push(shadeOf(0, 0, sign > 0));
    for (let ring = 1; ring <= rings; ring++) for (let s = 0; s < segments; s++) {
      const r = ring / rings, theta = 2 * Math.PI * s / segments;
      const p = point(r, theta, sign * thickness(r));
      positions.push(p[0], p[1], p[2]);
      shades.push(shadeOf(r, theta, sign > 0));
    }
    const at = (ring: number, s: number) => base + 1 + (ring - 1) * segments + (s % segments);
    for (let s = 0; s < segments; s++) {
      if (sign > 0) indices.push(base, at(1, s), at(1, s + 1)); else indices.push(base, at(1, s + 1), at(1, s));
      for (let ring = 1; ring < rings; ring++) {
        const a = at(ring, s), b = at(ring, s + 1), c2 = at(ring + 1, s), d = at(ring + 1, s + 1);
        if (sign > 0) indices.push(a, c2, b, b, c2, d); else indices.push(a, b, c2, b, d, c2);
      }
    }
    return (s: number) => at(rings, s);
  };
  const concave = pushFace(1), convex = pushFace(-1);
  for (let s = 0; s < segments; s++) indices.push(concave(s), convex(s), concave(s + 1), concave(s + 1), convex(s), convex(s + 1));
  const positionArray = Float32Array.from(positions), indexArray = Uint32Array.from(indices);
  const colors = new Float32Array(positionArray.length);
  shades.forEach((shade, i) => { colors[3 * i] = shade; colors[3 * i + 1] = shade * 0.96; colors[3 * i + 2] = shade * 0.95; });
  return { positions: positionArray, normals: vertexNormals(positionArray, indexArray), indices: indexArray, colors };
}

/** The tail runs along the caudal vertebrae measured in the CT, then falls to the ground and curves. */
function buildTail(landmarks: Landmarks, ground: number, totalLength: number, pelvis: RigidTransform): { skin: Surface; vertebrae: Surface; vessels: Surface; lateralVeins: Surface } {
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
  // Hummel et al. count 27 to 30 caudal vertebrae. Five lie in the CT; the others are simple shafts along the tail.
  const count = 23;
  const first = measured.length, shafts: Surface[] = [];
  const usable = points.length - first - 4;
  for (let k = 0; k < count; k++) {
    const from = first + Math.round(usable * (k + 0.06) / count), to = first + Math.round(usable * (k + 0.94) / count);
    const a = points[from], b = points[to], c = add(a, scale(sub(b, a), 0.5));
    const r = radii[Math.round((from + to) / 2)] * 0.56;
    shafts.push(tube([a, add(a, scale(sub(b, a), 0.18)), c, add(a, scale(sub(b, a), 0.82)), b], [r * 1.25, r * 0.9, r * 0.8, r * 0.9, r * 1.25], 8));
  }
  const skin = tube(points, radii, 14);
  const colors = new Float32Array(skin.positions.length).fill(1);
  const rows2 = points.length;
  for (let row = 0; row < rows2; row++) for (let s = 0; s < 14; s++) {
    const at = 3 * (row * 14 + s);
    const upward = Math.max(0, skin.normals[at + 2]);
    const ring = row % 2 ? 0.9 : 1;
    const value = ring * (1 - 0.3 * upward);
    colors[at] = value; colors[at + 1] = value * 0.96; colors[at + 2] = value * 0.94;
  }
  // The middle caudal vessels run under the vertebrae, side by side. Their position within the tail is an estimate.
  const vesselLine = (side: number) => {
    const line: Vec3[] = [], lineRadii: number[] = [];
    for (let i = 0; i < points.length; i += 8) {
      const r = radii[i];
      line.push(add(points[i], [side * r * 0.14, 0, -r * 0.58]));
      lineRadii.push(Math.max(0.2, r * 0.09));
    }
    return tube(line, lineRadii, 5);
  };
  // The lateral veins run along the sides of the tail, just under the skin, where they show through it. Beyond the tail's first length, where it leaves the body.
  const lateralVein = (side: number) => {
    const line: Vec3[] = [], lineRadii: number[] = [];
    for (let i = first + 6; i < points.length - 2; i += 4) {
      const r = radii[i], way = unit(sub(points[i + 1], points[i - 1]));
      line.push(add(points[i], scale(unit(cross(way, [0, 0, 1])), side * r * 0.93)));
      lineRadii.push(Math.max(0.45, r * 0.12));
    }
    return tube(line, lineRadii, 6);
  };
  return { skin: { ...skin, colors }, vertebrae: mergeSurfaces(shafts), vessels: mergeSurfaces([vesselLine(-1), vesselLine(1)]), lateralVeins: mergeSurfaces([lateralVein(-1), lateralVein(1)]) };
}

/** A whisker: a hair sweeping out from its follicle, curving along its length and tapering to a fine point. */
function hair(rootAt: Vec3, direction: Vec3, droop: Vec3, len: number, radius: number): Surface {
  const points: Vec3[] = [], radii: number[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    points.push(add(rootAt, add(scale(direction, len * t), scale(droop, len * t * t))));
    radii.push(radius * (1 - t) ** 1.25 + 0.035);
  }
  return tube(points, radii, 5);
}

/** The bare nose pad: two lobes with a groove between them and a comma-shaped nostril in each, dark inside. */
function nosePad(centre: Vec3): Surface {
  const nostrils = [-1, 1].map((side) => [add(centre, [side * 5.4, -6.4, 1.4]), add(centre, [side * 7.2, -4.2, -0.6])] as const);
  const surface = sculpt([add(centre, [-16, -14, -12]), add(centre, [16, 12, 12])], 0.55, (p) => {
    const body = smoothUnion(8 - length(sub(p, add(centre, [-4.4, 0, 0]))), 8 - length(sub(p, add(centre, [4.4, 0, 0]))), 3.4);
    // A groove down the middle of the pad, deepening towards the lip.
    const groove = Math.abs(p[0] - centre[0]) - 0.5 - 0.1 * Math.max(0, centre[2] - p[2]);
    let value = -smoothUnion(-body, -Math.max(groove, centre[1] - 3 - p[1]), 0.8);
    for (const [a, b] of nostrils) value = Math.min(value, -capsule(p, a, b, 1.7, 1.2));
    return value;
  }, 0);
  return tinted(surface, (p) => {
    const inNostril = Math.max(...nostrils.map(([a, b]) => capsule(p, a, b, 2.1, 1.6)));
    const inGroove = Math.max(0, 1 - Math.abs(p[0] - centre[0]) / 1.4) * (p[1] < centre[1] - 3 ? 1 : 0);
    const value = (1 - 0.86 * Math.max(0, Math.min(1, (inNostril + 0.5) / 1.2))) * (1 - 0.35 * inGroove);
    return [value, value * 0.92, value * 0.9];
  });
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

export interface AttachmentResult { readonly parts: Record<AttachmentPart, Surface>; readonly eyes: readonly [Vec3, Vec3]; readonly earRoots: readonly [Vec3, Vec3]; readonly tip: Vec3; readonly mouth: readonly Vec3[]; readonly openings: readonly Vec3[]; readonly pawFields: readonly PawField[] }

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

  // Ear roots lie on the side of the head above the external auditory meatus, which the CT shows at about y 240 and z 100.
  const earR: Vec3 = [midX - 60, eyes.left[1] + 92, eyes.left[2] + 20];
  const earL: Vec3 = [midX + 60, eyes.right[1] + 92, eyes.right[2] + 20];

  const nose = nosePad([tip[0], tip[1] + 7, tip[2] + 3]);

  // The mouth line runs along the side of the snout low on the upper lip, as in Cook figure 5, read off the outer surface of the labels.
  const mouthLine = (side: -1 | 1): Vec3[] => {
    const line: Vec3[] = [];
    const last = (eyes.left[1] + eyes.right[1]) / 2 + 6;
    for (let y = tip[1] + 16; y <= last; y += 5) {
      const column = context.landmarks.bodyColumn(midX, y);
      if (!column) continue;
      const z = column.low + 0.15 * (column.high - column.low);
      let x = midX;
      while (Math.abs(x - midX) < 90 && context.labels[voxelIndex(context.grid, Math.round(x + side), Math.round(y), Math.round(z))]) x += side;
      line.push([x + side * 0.4, y, z]);
    }
    return line;
  };
  const mouthSides = [mouthLine(-1), mouthLine(1)];
  // The two sides meet under the groove of the nose pad.
  const front: Vec3 = [midX, tip[1] + 11, Math.min(mouthSides[0][0][2], mouthSides[1][0][2]) + 2];
  const lips = mergeSurfaces(mouthSides.map((line) => {
    const points = curve([front, ...line]);
    return tube(points, points.map((_, i) => 0.42 + 0.34 * Math.sin(Math.PI * i / (points.length - 1))), 6);
  }));

  // Whisker groups, after Cook figure 5. Mystacial rows lie on the side of the snout and sweep backwards and out.
  const rng = random(19650607);
  // A whisker grows from the skin, and its follicle lies under it: a place planned beside the snout is brought in to where the body begins, a little under its surface.
  const inBody = (p: Vec3) => {
    const x = Math.round(p[0]), y = Math.round(p[1]), z = Math.round(p[2]), grid = context.grid;
    return x >= 0 && y >= 0 && z >= 0 && x < grid.nx && y < grid.ny && z < grid.nz && context.labels[voxelIndex(grid, x, y, z)] !== 0;
  };
  const onSnout = (planned: Vec3, side: -1 | 1): Vec3 => {
    for (let lift = 0; lift <= 14; lift += 2) {
      const start: Vec3 = [planned[0], planned[1], planned[2] + lift];
      // Out to where the body ends, or in to where it begins.
      if (inBody(start)) {
        let x = start[0];
        while (inBody([x + side, start[1], start[2]]) && Math.abs(x - tip[0]) < 90) x += side;
        return [x - side * 1.5, start[1], start[2]];
      }
      for (let x = start[0]; Math.abs(x - tip[0]) > 3; x -= side * 0.5) if (inBody([x, start[1], start[2]])) return [x - side * 1.5, start[1], start[2]];
    }
    return planned;
  };
  const whiskers: Surface[] = [], follicles: Surface[] = [];
  for (const side of [-1, 1] as const) {
    for (let row = 0; row < 5; row++) for (let column = 0; column < 7; column++) {
      if ((row === 0 || row === 4) && column > 4) continue;
      const root = onSnout([tip[0] + side * (15 + column * 3.4 + row * 1.5), tip[1] + 22 + column * 9, tip[2] + 7 - row * 5.2], side);
      // Upper rows fan upwards and lower rows downwards, and all curve back along the face, as in figure 5.
      const spreadUp = (2 - row) * 0.34 + (rng() - 0.5) * 0.08;
      // The head is pitched in the stance, so they are lifted to fan about the horizontal.
      const direction = unit([side * (0.72 + rng() * 0.08), 0.42 + column * 0.07 + rng() * 0.06, spreadUp + 0.2]);
      const len = 62 + column * 20 + rng() * 16;
      whiskers.push(hair(root, direction, [side * -0.08, 0.2, -0.05 - spreadUp * 0.12], len, 0.4 + column * 0.04));
      // The follicle goes in under the root of the whisker, longer for the longer whiskers further back. Its size is an estimate.
      const deep = 9 + column * 1.1, wide = 1.2 + column * 0.13;
      follicles.push(tube([add(root, scale(direction, -1.5)), add(root, scale(direction, -deep * 0.55)), add(root, scale(direction, -deep))], [wide * 0.7, wide, wide * 0.75], 8));
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
  const pelvis = posture.pose.transforms.pelvis;

  // Inside each globe, from the back: a dark inner coat, a lens that nearly fills the globe, an iris and, on the front, a cornea over about half of its surface.
  const eyeInner = (centre: Vec3, out: Vec3, part: 'retina' | 'lens' | 'iris' | 'cornea'): Surface => {
    if (part === 'retina') return sphere(centre, [eyeRadius * 0.92, eyeRadius * 0.92, eyeRadius * 0.92], 14, 20);
    if (part === 'lens') { const r = eyeRadius * 0.68; return sphere(add(centre, scale(out, eyeRadius * 0.18)), [r, r, r], 14, 20); }
    const along = unit(sub([0, 1, 0], scale(out, dot([0, 1, 0], out)))), across = unit(cross(out, along));
    if (part === 'iris') {
      const middle = add(centre, scale(out, eyeRadius * 0.72));
      const loop = Array.from({ length: 25 }, (_, i): Vec3 => { const t = 2 * Math.PI * i / 24; return add(middle, add(scale(along, Math.cos(t) * eyeRadius * 0.55), scale(across, Math.sin(t) * eyeRadius * 0.55))); });
      return tube(loop, loop.map(() => eyeRadius * 0.11), 8);
    }
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    const rows = 12, columns = 28, shell = eyeRadius * 1.012, limit = Math.PI / 2;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
      const theta = limit * r / rows, phi = 2 * Math.PI * c / columns;
      const n = add(scale(out, Math.cos(theta)), add(scale(along, Math.sin(theta) * Math.cos(phi)), scale(across, Math.sin(theta) * Math.sin(phi))));
      const p = add(centre, scale(n, shell));
      positions.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]);
    }
    const at = (r: number, c: number) => r * (columns + 1) + c;
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) indices.push(at(r, c), at(r + 1, c), at(r, c + 1), at(r, c + 1), at(r + 1, c), at(r + 1, c + 1));
    return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
  };
  const eyeOutR = unit([-0.86, 0, 0.5]), eyeOutL = unit([0.86, 0, 0.5]);
  const bothEyes = (part: 'retina' | 'lens' | 'iris' | 'cornea') => moved(mergeSurfaces([eyeInner(eyeLeft, eyeOutR, part), eyeInner(eyeRight, eyeOutL, part)]), head);
  // Four recti, two obliques and a retractor bulbi round each globe. Marques et al. name these muscles in the mouse, and four and two are the usual mammalian numbers. Courses and sizes are estimates.
  const eyeMuscles = (centre: Vec3, out: Vec3): Surface[] => {
    const along: Vec3 = [0, 1, 0];
    const up = unit(cross(out, along));
    const apex = add(centre, scale(out, -eyeRadius * 2));
    const round = (angle: number, back: number, reach: number): Vec3 => add(add(centre, scale(out, -eyeRadius * back)), add(scale(along, Math.cos(angle) * eyeRadius * reach), scale(up, Math.sin(angle) * eyeRadius * reach)));
    return [
      ...[0, 1, 2, 3].map((quarter) => {
        const angle = quarter * Math.PI / 2;
        return route([apex, round(angle, 1.2, 0.78), round(angle, 0.45, 1.06), round(angle, 0.02, 1.03)], 1.9, 1.3, 8);
      }),
      ...[0, 1, 2, 3].map((quarter) => {
        const angle = Math.PI / 4 + quarter * Math.PI / 2;
        return route([apex, round(angle, 1.4, 0.5), round(angle, 0.86, 0.6)], 1.2, 0.8, 6);
      }),
      route([apex, round(2.2, 1, 1.12), round(2.2, 0.3, 1.2), round(1.7, 0.02, 1.03)], 1.2, 1, 7),
      route([round(-2.4, 0.55, 1.2), round(-1.6, 0.2, 1.1), round(-0.6, 0.02, 1.03)], 1.3, 1, 7),
    ];
  };
  // The calcaneal tendon runs from the gastrocnemius down the back of the shank to the heel. Its course and size are estimates.
  const calcanealTendon = (hip: Vec3, knee: Vec3, ankle: Vec3, heel: Vec3): Surface => {
    const shank = unit(sub(ankle, knee));
    const bend = add(unit(sub(hip, knee)), shank);
    const back = unit(sub(bend, scale(shank, dot(bend, shank))));
    const down = (t: number, offset: number) => add(add(knee, scale(sub(ankle, knee), t)), scale(back, offset));
    return route([down(0.55, 6), down(0.8, 5), down(1, 4.5), heel], 1.8, 1.3, 8);
  };
  // A horseshoe behind each globe, open towards the outer corner of the eye.
  const harderian = (centre: Vec3, out: Vec3): Surface => {
    const along: Vec3 = [0, 1, 0];
    const up = unit(cross(out, along));
    const arc = Array.from({ length: 19 }, (_, i): Vec3 => {
      const t = -2.2 + 4.4 * i / 18;
      return add(add(centre, scale(out, -eyeRadius * 0.95)), add(scale(along, -Math.cos(t) * eyeRadius * 0.82), scale(up, Math.sin(t) * eyeRadius * 0.95)));
    });
    return tube(arc, arc.map((_, i) => 3.2 + 2.2 * Math.sin(Math.PI * i / 18)), 10);
  };
  // Dark rings at the openings on the body surface, found by leaving the labels from inside the body.
  const leaving = (start: Vec3, direction: Vec3): Vec3 => {
    let p = start;
    for (let i = 0; i < 120; i++) {
      const q = add(p, direction);
      if (!context.labels[voxelIndex(context.grid, Math.round(q[0]), Math.round(q[1]), Math.round(q[2]))]) break;
      p = q;
    }
    return p;
  };
  const anus = leaving([177, 884, 52], [0, 1, 0]);
  const preputial = leaving([170, 815, 16], [0, 0, -1]);
  const openingRing = (centre: Vec3, axis: Vec3, radius: number): Surface => {
    const a = unit(axis), u = unit(Math.abs(a[2]) < 0.9 ? cross(a, [0, 0, 1]) : cross(a, [0, 1, 0])), v = cross(a, u);
    const loop = Array.from({ length: 21 }, (_, i): Vec3 => { const t = 2 * Math.PI * i / 20; return add(centre, add(scale(u, Math.cos(t) * radius), scale(v, Math.sin(t) * radius))); });
    return mergeSurfaces([tube(loop, loop.map(() => radius * 0.42), 6), sphere(centre, [radius * 0.8, radius * 0.8, radius * 0.8], 8, 10)]);
  };
  const openingPoints = [applyRigid(pelvis, anus), applyRigid(pelvis, preputial)];
  // A patella on the front of each knee and a fabella behind it, placed on the bisector of the bent joint in the stance.
  const kneeBones = (hip: Vec3, knee: Vec3, ankle: Vec3): Surface[] => {
    const thigh = unit(sub(hip, knee)), shank = unit(sub(ankle, knee));
    const back = unit(add(thigh, shank));
    const front = scale(back, -1);
    const patellaAt = add(knee, scale(front, 11));
    const along = unit(add(thigh, scale(shank, -1)));
    return [
      tube([add(patellaAt, scale(along, 10)), add(patellaAt, scale(along, 3)), add(patellaAt, scale(along, -4)), add(patellaAt, scale(along, -10))], [1.2, 3.4, 3.2, 1], 10),
      sphere(add(knee, scale(back, 12)), [1.8, 1.8, 1.8], 8, 10),
    ];
  };
  // A rounded cap of cartilage where the bones meet, sized to the joint by estimate.
  const jointCaps = mergeSurfaces(([
    [joints.hipR, 7], [joints.hipL, 7], [joints.kneeR, 9], [joints.kneeL, 9], [joints.ankleR, 5], [joints.ankleL, 5],
    [joints.shoulderR, 7], [joints.shoulderL, 7], [joints.elbowR, 6], [joints.elbowL, 6], [joints.wristR, 4], [joints.wristL, 4],
  ] as const).map(([at, radius]) => sphere(at as Vec3, [radius, radius, radius], 10, 14)));
  // A crescent on each side of the knee, in the plane between the femur and the tibia.
  const kneeCrescents = (hip: Vec3, knee: Vec3, ankle: Vec3): Surface[] => {
    const thigh = unit(sub(hip, knee)), shank = unit(sub(ankle, knee));
    const outward = unit(cross(thigh, shank)), front = scale(unit(add(thigh, shank)), -1);
    return [-1, 1].map((side) => {
      const middle = add(knee, scale(outward, side * 5));
      const arc = Array.from({ length: 11 }, (_, i): Vec3 => {
        const t = (-1.8 + 3.6 * i / 10);
        return add(middle, add(scale(front, Math.cos(t) * 5), scale(outward, side * Math.sin(t) * 1.8)));
      });
      return tube(arc, arc.map((_, i) => 1 + 0.8 * Math.sin(Math.PI * i / 10)), 6);
    });
  };
  // From the lower edge of the patella to the front of the tibia. Its course is an estimate.
  const patellarTendon = (hip: Vec3, knee: Vec3, ankle: Vec3): Surface => {
    const thigh = unit(sub(hip, knee)), shank = unit(sub(ankle, knee));
    const front = scale(unit(add(thigh, shank)), -1);
    const along = unit(add(thigh, scale(shank, -1)));
    const from = add(add(knee, scale(front, 11)), scale(along, -8));
    const to = add(add(knee, scale(sub(ankle, knee), 0.2)), scale(front, 5));
    return route([from, add(from.map((value, k) => (value + to[k]) / 2) as unknown as Vec3, scale(front, 0.8)), to], 1.5, 1.2, 8);
  };
  // A narrow tube low on each side of the septum, just under the floor of the simulated nasal cavity and over the premaxilla. Its length and width are estimates.
  const vomeronasal = (side: -1 | 1): Surface => {
    const points = [0, 1, 2, 3, 4].map((i): Vec3 => { const y = 90 + i * 7, [, middle, , half] = nasalAt(y); return [tip[0] + side * 2.6, y, middle - half - 2.5]; });
    return tube(points, [0.7, 1.2, 1.5, 1.2, 0.6], 8);
  };
  // Short glands in a row in each lid, under the skin over the globe. Their number and size are estimates.
  const meibomian = (centre: Vec3, out: Vec3): Surface[] => {
    const up0: Vec3 = [0, 0, 1];
    const up = unit(sub(up0, scale(out, dot(up0, out)))), across = cross(out, up);
    const glands: Surface[] = [];
    for (const lid of [0, Math.PI]) for (let i = 0; i < 8; i++) {
      const phi = lid + (-0.85 + 1.7 * i / 7);
      const direction = (theta: number): Vec3 => add(scale(out, Math.cos(theta)), add(scale(up, Math.sin(theta) * Math.cos(phi)), scale(across, Math.sin(theta) * Math.sin(phi))));
      // Each lies in the lid beyond the edge of the opening, between the globe and the skin, a little under the skin wherever there is room for it.
      const rim = Math.asin(Math.min(0.99, Math.hypot(0.92 * Math.sin(phi), 0.7 * Math.cos(phi)))) + 0.2;
      const points = [0, 1, 2, 3].map((k): Vec3 => {
        const way = direction(rim + 0.13 * k);
        let out = eyeRadius * 1.02;
        while (out < eyeRadius * 1.4 && labelAt(...add(centre, scale(way, out))) !== 0) out += 0.25;
        return add(centre, scale(way, Math.min(eyeRadius * 1.16, Math.max(eyeRadius * 0.99, out - 2.6))));
      });
      glands.push(tube(points, [0.35, 0.45, 0.45, 0.35], 5));
    }
    return glands;
  };
  // The brain in the labels of the source, to lay on it what lies on its surface.
  const BRAIN = new Set([4, 5, 6, 7, 8, 10]), CEREBRUM = new Set([7]);
  const labelAt = (x: number, y: number, z: number) => context.labels[voxelIndex(context.grid, Math.round(x), Math.round(y), Math.round(z))];
  const topOf = (x: number, y: number, kinds: ReadonlySet<number>): number => { for (let z = context.grid.nz - 1; z >= 0; z--) if (kinds.has(labelAt(x, y, z))) return z; return -1; };
  const brainFrom = (() => { for (let y = 0; y < context.grid.ny; y++) if (topOf(tip[0], y, CEREBRUM) >= 0) return y; return tip[1]; })();
  const brainTo = (() => { for (let y = context.grid.ny - 1; y >= 0; y--) if (topOf(tip[0], y, CEREBRUM) >= 0) return y; return tip[1]; })();
  const widthAt = (y: number, z: number): number => { let reach = 0; for (let dx = 0; dx < 80; dx++) if (BRAIN.has(labelAt(tip[0] + dx, y, z))) reach = dx; return reach; };
  const SINUS_CLEARANCE = 2.2;
  const sagittalLine = (offset: number, lift: number): Vec3[] => Array.from({ length: 9 }, (_, i) => { const y = brainFrom + 6 + (brainTo - brainFrom - 6) * i / 8; return [tip[0] + offset, y, topOf(tip[0], y, BRAIN) + lift]; });
  const transverseLine = (side: -1 | 1, ahead: number): Vec3[] => {
    const top = topOf(tip[0], brainTo, BRAIN), low = top - 16, wide = widthAt(brainTo, low);
    return [[tip[0], brainTo + ahead, top + SINUS_CLEARANCE], [tip[0] + side * wide * 0.55, brainTo + ahead + 1, topOf(tip[0] + side * wide * 0.55, brainTo, BRAIN) + SINUS_CLEARANCE], [tip[0] + side * (wide + SINUS_CLEARANCE), brainTo + ahead + 3, low], [side < 0 ? 157 : 205, 262, 78]];
  };
  const sinuses = mergeSurfaces([route(sagittalLine(0, SINUS_CLEARANCE), 1.1, 1.7, 8), route(transverseLine(-1, 0), 1.6, 1.2, 8), route(transverseLine(1, 0), 1.6, 1.2, 8)]);
  const meningealLymph = mergeSurfaces([-1, 1].flatMap((side) => [
    route(sagittalLine(side * 2.6, SINUS_CLEARANCE), 0.35, 0.45, 5),
    route([...transverseLine(side as -1 | 1, 2.4), side < 0 ? [160, 300, 66] : [202, 300, 66]], 0.45, 0.5, 5),
  ]));
  // The bones that the CT does not separate, set by what lies round them.
  const vomer = mergeSurfaces(Array.from({ length: 6 }, (_, i) => { const y = 112 + i * 9, [, middle, , half] = nasalAt(y); return sphere([tip[0], y, middle - half - 1.5], [0.7, 6.5, 2.4], 8, 12); }));
  const olfactoryFront = (() => { for (let y = 0; y < context.grid.ny; y++) if (topOf(tip[0] - 4, y, new Set([6])) >= 0 || topOf(tip[0] + 4, y, new Set([6])) >= 0) return y; return tip[1]; })();
  const olfactoryMiddle = Math.max(topOf(tip[0] - 4, olfactoryFront + 6, new Set([6])), topOf(tip[0] + 4, olfactoryFront + 6, new Set([6]))) - 15;
  const ethmoid = mergeSurfaces([sphere([tip[0], olfactoryFront - 1, olfactoryMiddle], [8, 0.9, 8], 10, 14), sphere([tip[0], olfactoryFront - 8, olfactoryMiddle - 1.5], [0.6, 7, 3.5], 8, 12)]);
  const lacrimal = mergeSurfaces([eyeLeft, eyeRight].map((eye) => sphere(add(eye, [0, -eyeRadius * 1.22, -1]), [1.5, 1.1, 2.4], 8, 10)));
  const parts: Record<AttachmentPart, Surface> = {
    'whisker-follicles': moved(mergeSurfaces(follicles), head),
    'dural-venous-sinuses': moved(sinuses, head),
    'meningeal-lymphatics': moved(meningealLymph, head),
    'bone-vomer': moved(vomer, head),
    'bone-ethmoid': moved(ethmoid, head),
    'bone-lacrimal': moved(lacrimal, head),
    'articular-cartilage': jointCaps,
    menisci: mergeSurfaces([...kneeCrescents(joints.hipR, joints.kneeR, joints.ankleR), ...kneeCrescents(joints.hipL, joints.kneeL, joints.ankleL)]),
    'patellar-tendons': mergeSurfaces([patellarTendon(joints.hipR, joints.kneeR, joints.ankleR), patellarTendon(joints.hipL, joints.kneeL, joints.ankleL)]),
    'vomeronasal-organs': moved(mergeSurfaces([vomeronasal(-1), vomeronasal(1)]), head),
    'meibomian-glands': moved(mergeSurfaces([...meibomian(eyeLeft, eyeOutR), ...meibomian(eyeRight, eyeOutL)]), head),
    eyes: moved(mergeSurfaces([sphere(eyeLeft, [eyeRadius, eyeRadius, eyeRadius]), sphere(eyeRight, [eyeRadius, eyeRadius, eyeRadius])]), head),
    eyelids: moved(mergeSurfaces([eyelid(eyeLeft, unit([-0.86, 0, 0.5]), eyeRadius), eyelid(eyeRight, unit([0.86, 0, 0.5]), eyeRadius)]), head),
    corneas: bothEyes('cornea'), irises: bothEyes('iris'), lenses: bothEyes('lens'), retinas: bothEyes('retina'),
    'harderian-glands': moved(mergeSurfaces([harderian(eyeLeft, eyeOutR), harderian(eyeRight, eyeOutL)]), head),
    'intraorbital-glands': moved(mergeSurfaces([sphere(add(eyeLeft, [0, eyeRadius * 1.25, -3]), [4, 6, 3], 8, 12), sphere(add(eyeRight, [0, eyeRadius * 1.25, -3]), [4, 6, 3], 8, 12)]), head),
    'tail-vessels': tail.vessels,
    'tail-lateral-veins': tail.lateralVeins,
    patellae: mergeSurfaces([...kneeBones(joints.hipR, joints.kneeR, joints.ankleR), ...kneeBones(joints.hipL, joints.kneeL, joints.ankleL)]),
    'calcaneal-tendons': mergeSurfaces([calcanealTendon(joints.hipR, joints.kneeR, joints.ankleR, hindR.heel), calcanealTendon(joints.hipL, joints.kneeL, joints.ankleL, hindL.heel)]),
    'extraocular-muscles': moved(mergeSurfaces([...eyeMuscles(eyeLeft, eyeOutR), ...eyeMuscles(eyeRight, eyeOutL)]), head),
    openings: moved(mergeSurfaces([openingRing(anus, [0, 1, 0], 2.8), openingRing(preputial, [0, 0.3, -1], 2)]), pelvis),
    pinnae: moved(mergeSurfaces([pinna(earR, -1), pinna(earL, 1)]), head),
    nose: moved(nose, head),
    lips: moved(lips, head),
    vibrissae: moved(mergeSurfaces(whiskers), head),
    forepaws: tinted(mergeSurfaces([foreR.skin, foreL.skin]), padTint(groundZ)),
    hindpaws: tinted(mergeSurfaces([hindR.skin, hindL.skin]), padTint(groundZ)),
    claws: mergeSurfaces([...foreR.claws, ...foreL.claws, ...hindR.claws, ...hindL.claws]),
    tail: tail.skin,
    'tail-vertebrae': tail.vertebrae,
    'foot-bones': mergeSurfaces([...hindR.bones, ...hindL.bones]),
    'paw-arteries': mergeSurfaces([foreR, foreL, hindR, hindL].flatMap((paw) => paw.routes.arteries)),
    'paw-veins': mergeSurfaces([foreR, foreL, hindR, hindL].flatMap((paw) => paw.routes.veins)),
    'paw-nerves': mergeSurfaces([foreR, foreL, hindR, hindL].flatMap((paw) => paw.routes.nerves)),
  };
  return { parts, eyes: [applyRigid(head, eyeLeft), applyRigid(head, eyeRight)], earRoots: [applyRigid(head, earR), applyRigid(head, earL)], tip: applyRigid(head, tip), mouth: [...mouthSides[0], ...mouthSides[1]].map((point) => applyRigid(head, point)), openings: openingPoints, pawFields: [foreR.field, foreL.field, hindR.field, hindL.field] };
}
