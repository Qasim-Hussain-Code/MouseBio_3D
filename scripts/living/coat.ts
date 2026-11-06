/**
 * Where the simulated coat grows, which way it lies, how long it is and where it turns pale. The specimen is a
 * nude mouse and has no coat to measure, so all of this is a display estimate after the general pattern of a
 * wild-type mouse: a darker back, a paler belly with a diffuse border along the flank, short hair on the lower limbs,
 * and fine hair on the ears, the backs of the paws and the tail. Coordinates are source voxels of 0.1 mm, in the stance.
 */
import { dot, length, scale, sub, type StancePose, type Vec3 } from './rig';
import type { AttachmentPart } from './structures';
import type { Surface } from './surface-nets';

export interface CoatLandmarks {
  readonly joints: StancePose['joints'];
  readonly eyes: readonly Vec3[];
  readonly earRoots: readonly Vec3[];
  readonly tip: Vec3;
  readonly mouth: readonly Vec3[];
}

/** `fur` holds the combing direction and relative hair length of each vertex; `coat` is below zero on the back and flanks and above zero on the belly. */
export interface CoatAttributes { readonly fur: Float32Array; readonly coat: Float32Array }

/** The border between back and belly, as a share of the height of the body above its underside. */
export const FLANK_LINE = 0.22;

const smooth = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

function toSegment(p: Vec3, a: Vec3, b: Vec3): { t: number; distance: number } {
  const axis = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), axis) / (dot(axis, axis) || 1)));
  return { t, distance: length(sub(p, [a[0] + axis[0] * t, a[1] + axis[1] * t, a[2] + axis[2] * t])) };
}

/** The upper and lower outline of the body along its length, read from the central strip so that limbs do not count. */
export function bodyOutline(surface: Surface, middle: number, bin = 6, halfWidth = 34) {
  let low = Infinity, high = -Infinity;
  for (let i = 1; i < surface.positions.length; i += 3) { low = Math.min(low, surface.positions[i]); high = Math.max(high, surface.positions[i]); }
  const bins = Math.max(1, Math.ceil((high - low) / bin) + 1);
  const top = new Array<number>(bins).fill(-Infinity), bottom = new Array<number>(bins).fill(Infinity);
  for (let i = 0; i < surface.positions.length; i += 3) {
    if (Math.abs(surface.positions[i] - middle) >= halfWidth) continue;
    const at = Math.floor((surface.positions[i + 1] - low) / bin);
    top[at] = Math.max(top[at], surface.positions[i + 2]);
    bottom[at] = Math.min(bottom[at], surface.positions[i + 2]);
  }
  const filled = (values: number[]) => {
    const out = [...values];
    let last = out.find(Number.isFinite) ?? 0;
    for (let i = 0; i < bins; i++) { if (Number.isFinite(out[i])) last = out[i]; else out[i] = last; }
    return out.map((_, i) => {
      const part = out.slice(Math.max(0, i - 4), i + 5);
      return part.reduce((sum, value) => sum + value, 0) / part.length;
    });
  };
  const upper = filled(top), lower = filled(bottom);
  return (y: number) => {
    const at = Math.max(0, Math.min(bins - 1, Math.floor((y - low) / bin)));
    return { top: upper[at], bottom: lower[at] };
  };
}

/** The coat of the body surface. */
export function bodyCoat(surface: Surface, marks: CoatLandmarks): CoatAttributes {
  const count = surface.positions.length / 3;
  const fur = new Float32Array(4 * count), coat = new Float32Array(count);
  const j = marks.joints;
  const middle = (marks.eyes[0][0] + marks.eyes[1][0]) / 2;
  const outline = bodyOutline(surface, middle);
  const thighs: readonly (readonly [Vec3, Vec3])[] = [[j.hipR, j.kneeR], [j.hipL, j.kneeL]];
  const upper: readonly (readonly [Vec3, Vec3])[] = [[j.shoulderR, j.elbowR], [j.shoulderL, j.elbowL], ...thighs];
  const lower: readonly (readonly [Vec3, Vec3])[] = [[j.elbowR, j.wristR], [j.elbowL, j.wristL], [j.kneeR, j.ankleR], [j.kneeL, j.ankleL]];
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [surface.positions[3 * i], surface.positions[3 * i + 1], surface.positions[3 * i + 2]];
    const n: Vec3 = [surface.normals[3 * i], surface.normals[3 * i + 1], surface.normals[3 * i + 2]];
    // Backwards along the body and down the flanks and limbs.
    const ventral = Math.max(0, Math.min(1, (40 - p[2]) / 60));
    let dx = 0, dy = 1 - ventral * 0.6, dz = -0.35 - ventral * 1.2;
    const along = dx * n[0] + dy * n[1] + dz * n[2];
    dx -= along * n[0]; dy -= along * n[1]; dz -= along * n[2];
    const size = Math.hypot(dx, dy, dz) || 1;
    // Short hair on the snout and round the eyes and ear roots, so that they stand clear of the coat.
    const face = Math.max(0.3, Math.min(1, (length(sub(p, marks.tip)) - 20) / 110));
    const near = (points: readonly Vec3[], inner: number, outer: number) => Math.min(...points.map((point) => Math.max(0, Math.min(1, (length(sub(p, point)) - inner) / (outer - inner)))));
    const clear = near(marks.eyes, 15, 42) * Math.max(0.25, near(marks.earRoots, 8, 34)) * Math.max(0.3, near(marks.mouth, 3, 13));
    const belly = p[2] < 20 ? 0.85 : 1;
    // Hair shortens down the lower limbs and stays short where it meets the paws.
    let limb = 1, reach = 0, thigh = 0, towardsPaw = 0;
    for (const [a, b] of lower) {
      const { t, distance } = toSegment(p, a, b);
      const within = 1 - smooth(20, 36, distance);
      limb = Math.min(limb, 1 - within * (1 - (0.62 - 0.44 * smooth(0, 1, t))));
      towardsPaw = Math.max(towardsPaw, within * smooth(0.25, 0.95, t));
      reach = Math.max(reach, 1 - smooth(30, 50, distance));
    }
    for (const [a, b] of upper) reach = Math.max(reach, 1 - smooth(30, 50, toSegment(p, a, b).distance));
    for (const [a, b] of thighs) thigh = Math.max(thigh, 1 - smooth(30, 50, toSegment(p, a, b).distance));
    fur[4 * i] = dx / size; fur[4 * i + 1] = dy / size; fur[4 * i + 2] = dz / size; fur[4 * i + 3] = Math.max(0, face * belly * limb * clear);
    // Pale below the flank line, except on the outer sides of the limbs and the back of the thigh.
    const { top, bottom } = outline(p[1]);
    const height = Math.max(20, top - bottom);
    let value = (bottom + FLANK_LINE * height - p[2]) / height;
    if (value > 0) {
      const outward = (p[0] < middle ? -1 : 1) * n[0];
      const outer = Math.max(smooth(0.02, 0.45, outward) * reach, smooth(0.25, 0.75, n[1]) * thigh);
      value = value * (1 - outer) - 0.05 * outer;
    }
    // Hair turns pale towards the paws.
    coat[i] = value * (1 - towardsPaw) + 0.1 * towardsPaw;
  }
  return { fur, coat };
}

const tangent = (direction: Vec3, normal: Vec3): Vec3 => {
  const along = sub(direction, scale(normal, dot(direction, normal)));
  return scale(along, 1 / (length(along) || 1));
};

/** Fine hair on the ears, on the backs of the paws and, sparsely, on the tail. Other attachments are bare. */
export function shortCoat(part: AttachmentPart, surface: Surface, marks: CoatLandmarks): CoatAttributes | undefined {
  if (part !== 'pinnae' && part !== 'forepaws' && part !== 'hindpaws' && part !== 'tail') return undefined;
  const count = surface.positions.length / 3;
  const fur = new Float32Array(4 * count), coat = new Float32Array(count);
  const sides = 14;
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [surface.positions[3 * i], surface.positions[3 * i + 1], surface.positions[3 * i + 2]];
    const n: Vec3 = [surface.normals[3 * i], surface.normals[3 * i + 1], surface.normals[3 * i + 2]];
    let direction: Vec3, hair = 0, tone = 0;
    if (part === 'pinnae') {
      const root = marks.earRoots.reduce((best, point) => length(sub(p, point)) < length(sub(p, best)) ? point : best);
      direction = sub(p, root);
      // The opening of the ear canal is bare and dark.
      hair = (surface.colors?.[3 * i] ?? 1) < 0.5 ? 0 : 0.11;
      tone = -0.15;
    } else if (part === 'tail') {
      const next = i + sides < count - 2 ? i + sides : i;
      const previous = next === i ? Math.max(0, i - sides) : i;
      direction = sub([surface.positions[3 * next], surface.positions[3 * next + 1], surface.positions[3 * next + 2]], [surface.positions[3 * previous], surface.positions[3 * previous + 1], surface.positions[3 * previous + 2]]);
      hair = 0.26;
      tone = n[2] > -0.1 ? -0.15 : 0.1;
    } else {
      // Forwards along the digits, on the back of the paw only.
      direction = [0, -1, 0];
      hair = n[2] > -0.05 ? 0.14 : 0;
      tone = 0.1;
    }
    const comb = tangent(direction, n);
    fur[4 * i] = comb[0]; fur[4 * i + 1] = comb[1]; fur[4 * i + 2] = comb[2]; fur[4 * i + 3] = hair;
    coat[i] = tone;
  }
  return { fur, coat };
}
