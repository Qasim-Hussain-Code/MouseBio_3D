/**
 * A simulated division of the traced muscle tissue into named muscles.
 *
 * The tissue itself is traced from the source images. Each named muscle is given a course: a line
 * from origin to insertion placed on measured joints and the vertebral column. Every tissue cell goes to
 * the muscle whose course is nearest, relative to that muscle's width. The boundaries and names are therefore
 * estimates, and the shapes follow the tissue of this specimen, not dissected muscles.
 * Hind limb names follow Charles et al. (2016), which describes the mouse. Other names follow Greene (1935),
 * which describes the rat. Limbs lie as scanned here; the posture moves them afterwards.
 */
import { add, dot, JOINTS, length, scale, sub, type Vec3 } from './rig';
import type { Landmarks } from './landmarks';
import { surfaceNets, type Surface } from './surface-nets';
import { smoothField, voxelIndex as voxelIndexOf, type Grid } from './volume';

const M = 181;

export interface MuscleCourse { readonly points: readonly Vec3[]; readonly radius: number }
export interface MuscleDefinition { readonly id: string; readonly name: string; readonly basis: 'charles' | 'greene'; readonly group: string; readonly note: string; readonly courses: (side: Side) => readonly MuscleCourse[] }

export interface Side {
  readonly s: -1 | 1;
  readonly shoulder: Vec3; readonly elbow: Vec3; readonly wrist: Vec3; readonly scapulaEnd: Vec3;
  readonly hip: Vec3; readonly knee: Vec3; readonly ankle: Vec3;
  readonly at: (lateral: number, y: number, z: number) => Vec3;
  readonly off: (joint: Vec3, lateral: number, y: number, z: number) => Vec3;
  readonly mix: (a: Vec3, b: Vec3, t: number) => Vec3;
  readonly spine: Landmarks['spineAt'];
}

const c = (radius: number, ...points: Vec3[]): MuscleCourse => ({ points, radius });

export const MUSCLES: readonly MuscleDefinition[] = [
  // Head and neck.
  { id: 'temporalis', name: 'Temporalis', basis: 'greene', group: 'head', note: 'On the side of the skull.', courses: (d) => [c(16, d.at(46, 205, 125), d.at(34, 250, 150))] },
  { id: 'facial', name: 'Facial muscles', basis: 'greene', group: 'head', note: 'On the side of the face, in front of the masseter.', courses: (d) => [c(14, d.at(38, 110, 55), d.at(46, 190, 78))] },
  { id: 'mystacial', name: 'Mystacial pad muscles', basis: 'greene', group: 'head', note: 'In the whisker pad.', courses: (d) => [c(10, d.at(18, 70, 50), d.at(30, 120, 55))] },
  { id: 'digastric', name: 'Digastric', basis: 'greene', group: 'head', note: 'Under the jaw.', courses: (d) => [c(9, d.at(16, 165, 32), d.at(30, 240, 48))] },
  { id: 'strap', name: 'Sternohyoid and sternothyroid', basis: 'greene', group: 'neck', note: 'Strap muscles on the front of the neck.', courses: (d) => [c(9, d.at(6, 350, 42), d.at(7, 255, 50))] },
  { id: 'sternomastoid', name: 'Sternomastoid', basis: 'greene', group: 'neck', note: 'From the manubrium to behind the ear.', courses: (d) => [c(11, d.at(8, 345, 40), d.at(58, 258, 92))] },
  { id: 'neck-extensors', name: 'Splenius and semispinalis', basis: 'greene', group: 'neck', note: 'Deep on the back of the neck.', courses: (d) => [c(17, d.at(16, 275, 168), d.at(16, 355, 150))] },
  // Trunk.
  { id: 'acromiotrapezius', name: 'Acromiotrapezius', basis: 'greene', group: 'trunk', note: 'From the back of the neck to the scapula.', courses: (d) => [c(14, d.at(10, 320, 176), d.at(62, 345, 152))] },
  { id: 'spinotrapezius', name: 'Spinotrapezius', basis: 'greene', group: 'trunk', note: 'From the thoracic midline to the scapula.', courses: (d) => [c(12, d.at(10, 420, 188), d.at(60, 372, 160))] },
  { id: 'latissimus', name: 'Latissimus dorsi', basis: 'greene', group: 'trunk', note: 'From the lower back to the humerus.', courses: (d) => [c(13, d.at(25, 540, 198), d.at(85, 440, 150), d.off(d.shoulder, 20, 25, -15))] },
  { id: 'erector', name: 'Longissimus and iliocostalis', basis: 'greene', group: 'trunk', note: 'Along the vertebral column; the course follows the column measured in the CT.', courses: (d) => [c(20, ...[345, 420, 500, 580, 650, 720].map((y): Vec3 => d.at(20, y, d.spine(y).dorsalZ - 4)))] },
  { id: 'serratus', name: 'Serratus ventralis', basis: 'greene', group: 'trunk', note: 'From the ribs to under the scapula.', courses: (d) => [c(12, d.at(62, 372, 125), d.at(85, 450, 95))] },
  { id: 'intercostals', name: 'Intercostal muscles', basis: 'greene', group: 'trunk', note: 'Between the ribs.', courses: (d) => [c(14, d.at(58, 395, 120), d.at(72, 450, 125), d.at(80, 510, 125))] },
  { id: 'pectoralis', name: 'Pectoralis', basis: 'greene', group: 'trunk', note: 'From the sternum to the humerus.', courses: (d) => [c(16, d.at(5, 410, 30), d.mix(d.shoulder, d.elbow, 0.45))] },
  { id: 'obliques', name: 'Abdominal obliques and transversus', basis: 'greene', group: 'trunk', note: 'In the side wall of the abdomen.', courses: (d) => [c(20, d.at(95, 500, 118), d.at(108, 600, 95), d.at(95, 700, 70))] },
  { id: 'rectus', name: 'Rectus abdominis', basis: 'greene', group: 'trunk', note: 'In the ventral wall of the abdomen.', courses: (d) => [c(11, d.at(15, 470, 22), d.at(14, 745, 22))] },
  { id: 'tail-base', name: 'Tail base muscles', basis: 'greene', group: 'trunk', note: 'Beside the first caudal vertebrae.', courses: (d) => [c(10, d.at(10, 810, 130), d.at(5, 905, 112))] },
  { id: 'perineal', name: 'Perineal muscles', basis: 'greene', group: 'trunk', note: 'In the floor of the pelvis.', courses: (d) => [c(9, d.at(10, 835, 45), d.at(5, 870, 40))] },
  // Fore limb.
  { id: 'deltoid', name: 'Deltoid', basis: 'greene', group: 'fore limb', note: 'From the scapula over the shoulder to the humerus.', courses: (d) => [c(11, d.off(d.shoulder, 6, 30, 26), d.off(d.mix(d.shoulder, d.elbow, 0.55), 8, 0, 8))] },
  { id: 'supraspinatus', name: 'Supraspinatus', basis: 'greene', group: 'fore limb', note: 'On the scapula, in front of its spine.', courses: (d) => [c(9, d.off(d.shoulder, 0, 10, 18), d.off(d.scapulaEnd, 0, -16, 4))] },
  { id: 'infraspinatus', name: 'Infraspinatus', basis: 'greene', group: 'fore limb', note: 'On the scapula, behind its spine.', courses: (d) => [c(10, d.off(d.shoulder, 8, 20, 12), d.off(d.scapulaEnd, 10, 6, 0))] },
  { id: 'teres', name: 'Teres major', basis: 'greene', group: 'fore limb', note: 'From the lower angle of the scapula to the humerus.', courses: (d) => [c(8, d.off(d.scapulaEnd, 2, 8, -8), d.mix(d.shoulder, d.elbow, 0.35))] },
  { id: 'triceps', name: 'Triceps brachii', basis: 'greene', group: 'fore limb', note: 'Behind the humerus to the olecranon.', courses: (d) => [c(14, d.off(d.shoulder, -5, 26, -6), d.off(d.elbow, 0, 14, 4))] },
  { id: 'biceps-brachii', name: 'Biceps brachii and brachialis', basis: 'greene', group: 'fore limb', note: 'In front of the humerus.', courses: (d) => [c(11, d.off(d.shoulder, 6, -12, -12), d.off(d.elbow, -5, -14, -3))] },
  { id: 'forearm-extensors', name: 'Forearm extensors', basis: 'greene', group: 'fore limb', note: 'On the back of the forearm.', courses: (d) => [c(8, d.off(d.elbow, 6, -12, 7), d.off(d.wrist, 3, 10, 5))] },
  { id: 'forearm-flexors', name: 'Forearm flexors', basis: 'greene', group: 'fore limb', note: 'On the palm side of the forearm.', courses: (d) => [c(8, d.off(d.elbow, -6, -10, -5), d.off(d.wrist, -3, 10, -5))] },
  // Hind limb, with the names in Charles et al.
  { id: 'gluteus', name: 'Gluteus maximus', basis: 'charles', group: 'hind limb', note: 'From the ilium over the hip to the femur.', courses: (d) => [c(17, d.at(38, 700, 150), d.off(d.hip, 26, 0, 14))] },
  { id: 'caudofemoralis', name: 'Caudofemoralis', basis: 'charles', group: 'hind limb', note: 'From the tail base to the femur.', courses: (d) => [c(9, d.at(14, 835, 120), d.off(d.mix(d.hip, d.knee, 0.35), 0, 15, 10))] },
  { id: 'biceps-femoris', name: 'Biceps femoris', basis: 'charles', group: 'hind limb', note: 'From the ischium over the back of the thigh to the knee.', courses: (d) => [c(15, d.at(34, 835, 110), d.off(d.knee, 6, 22, 8))] },
  { id: 'semitendinosus', name: 'Semitendinosus', basis: 'charles', group: 'hind limb', note: 'On the inner back of the thigh.', courses: (d) => [c(9, d.at(24, 850, 85), d.off(d.knee, -14, 32, 0))] },
  { id: 'semimembranosus', name: 'Semimembranosus', basis: 'charles', group: 'hind limb', note: 'On the inner back of the thigh, under the semitendinosus.', courses: (d) => [c(11, d.at(20, 835, 75), d.off(d.knee, -20, 20, -6))] },
  { id: 'gracilis', name: 'Gracilis', basis: 'charles', group: 'hind limb', note: 'A flat muscle on the inner thigh.', courses: (d) => [c(7, d.at(12, 800, 42), d.off(d.knee, -22, 14, -14))] },
  { id: 'adductors', name: 'Adductor magnus and longus', basis: 'charles', group: 'hind limb', note: 'From the pubis to the inner femur.', courses: (d) => [c(13, d.at(16, 790, 55), d.off(d.mix(d.hip, d.knee, 0.75), -14, 10, -12))] },
  { id: 'vasti', name: 'Vastus lateralis, intermedius and medialis', basis: 'charles', group: 'hind limb', note: 'On the front and sides of the femur.', courses: (d) => [c(15, d.off(d.hip, 14, -22, -8), d.off(d.knee, -2, -16, 0))] },
  { id: 'rectus-femoris', name: 'Rectus femoris', basis: 'charles', group: 'hind limb', note: 'On the front of the thigh.', courses: (d) => [c(8, d.off(d.hip, -2, -26, -10), d.off(d.knee, -8, -22, -6))] },
  { id: 'psoas', name: 'Psoas major and iliacus', basis: 'charles', group: 'hind limb', note: 'From under the lumbar column to the femur.', courses: (d) => [c(9, d.at(20, 620, d.spine(620).ventralZ - 8), d.at(30, 700, d.spine(700).ventralZ - 8), d.off(d.hip, -6, -6, -14))] },
  { id: 'gastrocnemius', name: 'Gastrocnemius', basis: 'charles', group: 'hind limb', note: 'On the back of the shank to the heel.', courses: (d) => [c(11, d.off(d.knee, 0, 8, 10), d.off(d.ankle, -1, -30, 6))] },
  { id: 'soleus', name: 'Soleus and plantaris', basis: 'charles', group: 'hind limb', note: 'Under the gastrocnemius.', courses: (d) => [c(8, d.off(d.knee, 4, 28, 6), d.off(d.ankle, 2, -24, 8))] },
  { id: 'tibialis', name: 'Tibialis anterior and extensor digitorum longus', basis: 'charles', group: 'hind limb', note: 'On the front of the shank.', courses: (d) => [c(8, d.off(d.knee, 2, 14, -8), d.off(d.ankle, 1, -24, -5))] },
  { id: 'peroneals', name: 'Peroneus muscles', basis: 'charles', group: 'hind limb', note: 'On the outer side of the shank.', courses: (d) => [c(7, d.off(d.knee, 9, 14, 0), d.off(d.ankle, 6, -26, 0))] },
  { id: 'deep-flexors', name: 'Flexor digitorum longus and tibialis posterior', basis: 'charles', group: 'hind limb', note: 'Deep on the inner side of the shank.', courses: (d) => [c(7, d.off(d.knee, -8, 20, 0), d.off(d.ankle, -5, -26, 2))] },
];

function sideOf(s: -1 | 1, lm: Landmarks): Side {
  const low = s < 0;
  const J = JOINTS;
  const lateral = (x: number) => s * x;
  return {
    s, spine: lm.spineAt,
    shoulder: low ? J.shoulderR : J.shoulderL, elbow: low ? J.elbowR : J.elbowL, wrist: low ? J.wristR : J.wristL,
    scapulaEnd: low ? [120.2, 387.8, 136.1] : [244, 393.5, 145.5],
    hip: low ? J.hipR : J.hipL, knee: low ? J.kneeR : J.kneeL, ankle: low ? J.ankleR : J.ankleL,
    at: (x, y, z) => [M + lateral(x), y, z],
    off: (joint, x, y, z) => [joint[0] + lateral(x), joint[1] + y, joint[2] + z],
    mix: (a, b, t) => add(a, scale(sub(b, a), t)),
  };
}

export interface MusclePartition {
  readonly cells: Grid;
  /** For each cell of two voxels, 0 for no muscle, 1 + index for a named muscle, 255 for tissue far from every course. */
  readonly ids: Uint8Array;
  /** The courses of each muscle on both sides. */
  readonly courses: readonly (readonly MuscleCourse[])[];
  readonly counts: Int32Array;
}

const CELL = 2;
export const UNNAMED = 255;

export function partitionMuscles(grid: Grid, tissue: (index: number) => boolean, lm: Landmarks): MusclePartition {
  const cells: Grid = { nx: Math.floor(grid.nx / CELL), ny: Math.floor(grid.ny / CELL), nz: Math.floor(grid.nz / CELL) };
  const coarse = new Uint8Array(cells.nx * cells.ny * cells.nz);
  for (let z = 0; z < cells.nz * CELL; z++) for (let y = 0; y < cells.ny * CELL; y++) for (let x = 0; x < cells.nx * CELL; x++) {
    if (tissue((z * grid.ny + y) * grid.nx + x)) coarse[voxelIndexOf(cells, x >> 1, y >> 1, z >> 1)]++;
  }
  const sides = [sideOf(-1, lm), sideOf(1, lm)];
  const courses = MUSCLES.map((muscle) => sides.flatMap((side) => muscle.courses(side)));
  // A flat list of segments, each with its muscle, for the nearest search.
  const segments: { muscle: number; a: Vec3; axis: Vec3; lengthSquared: number; radius: number }[] = [];
  courses.forEach((list, muscle) => {
    for (const course of list) for (let i = 0; i + 1 < course.points.length; i++) {
      const axis = sub(course.points[i + 1], course.points[i]);
      segments.push({ muscle, a: course.points[i], axis, lengthSquared: dot(axis, axis) || 1, radius: course.radius });
    }
  });
  const ids = new Uint8Array(coarse.length);
  const counts = new Int32Array(MUSCLES.length + 1);
  const REACH = 3.2;
  for (let z = 0; z < cells.nz; z++) for (let y = 0; y < cells.ny; y++) for (let x = 0; x < cells.nx; x++) {
    const at = voxelIndexOf(cells, x, y, z);
    if (coarse[at] < 4) continue;
    const px = 2 * x + 0.5, py = 2 * y + 0.5, pz = 2 * z + 0.5;
    let best = -1, bestScore = Infinity;
    for (const segment of segments) {
      const rx = px - segment.a[0], ry = py - segment.a[1], rz = pz - segment.a[2];
      const t = Math.max(0, Math.min(1, (rx * segment.axis[0] + ry * segment.axis[1] + rz * segment.axis[2]) / segment.lengthSquared));
      const dx = rx - t * segment.axis[0], dy = ry - t * segment.axis[1], dz = rz - t * segment.axis[2];
      const score = (dx * dx + dy * dy + dz * dz) / (segment.radius * segment.radius);
      if (score < bestScore) { bestScore = score; best = segment.muscle; }
    }
    if (bestScore > REACH * REACH) { ids[at] = UNNAMED; counts[MUSCLES.length]++; continue; }
    ids[at] = best + 1; counts[best]++;
  }
  return { cells, ids, courses, counts };
}

/** The surface of one named muscle, or of the unnamed remainder, in source voxel coordinates. */
export function muscleSurface(partition: MusclePartition, value: number): Surface {
  const { cells, ids } = partition;
  let x0 = cells.nx, x1 = -1, y0 = cells.ny, y1 = -1, z0 = cells.nz, z1 = -1;
  for (let z = 0; z < cells.nz; z++) for (let y = 0; y < cells.ny; y++) for (let x = 0; x < cells.nx; x++) {
    if (ids[voxelIndexOf(cells, x, y, z)] !== value) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const margin = 6;
  const local: Grid = { nx: x1 - x0 + 1 + 2 * margin, ny: y1 - y0 + 1 + 2 * margin, nz: z1 - z0 + 1 + 2 * margin };
  const field = new Float32Array(local.nx * local.ny * local.nz);
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (ids[voxelIndexOf(cells, x, y, z)] === value) field[voxelIndexOf(local, x - x0 + margin, y - y0 + margin, z - z0 + margin)] = 1;
  }
  // A threshold above one half leaves a narrow groove where neighbouring muscles meet.
  return surfaceNets(smoothField(field, local, 1), local, 0.56, [(x0 - margin) * CELL + 0.5, (y0 - margin) * CELL + 0.5, (z0 - margin) * CELL + 0.5], CELL);
}

/** Per-vertex fibre direction along the nearest course, and how far the vertex lies into the tendon at either end. */
export function fibreAttribute(surface: Surface, courses: readonly MuscleCourse[]): { directions: Float32Array; tendon: Float32Array } {
  const count = surface.positions.length / 3;
  const directions = new Float32Array(3 * count), tendon = new Float32Array(count);
  const segments = courses.flatMap((course) => {
    const lengths = course.points.slice(1).map((point, i) => length(sub(point, course.points[i])));
    const total = lengths.reduce((sum, v) => sum + v, 0);
    let before = 0;
    return lengths.map((len, i) => { const start = before; before += len; return { a: course.points[i], b: course.points[i + 1], len, start, total, radius: course.radius }; });
  });
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [surface.positions[3 * i], surface.positions[3 * i + 1], surface.positions[3 * i + 2]];
    let bestDistance = Infinity, beyond = 0, direction: Vec3 = [0, 1, 0], width = 8;
    for (const segment of segments) {
      const axis = sub(segment.b, segment.a);
      const t = Math.max(0, Math.min(1, dot(sub(p, segment.a), axis) / (segment.len * segment.len || 1)));
      const distance = length(sub(p, add(segment.a, scale(axis, t))));
      if (distance < bestDistance) {
        bestDistance = distance; width = segment.radius;
        // Distance along the course from its nearest end, in voxels.
        const from = segment.start + dot(sub(p, segment.a), axis) / (segment.len || 1);
        beyond = Math.min(Math.abs(from), Math.abs(segment.total - from));
        direction = scale(axis, 1 / (segment.len || 1));
      }
    }
    directions.set(direction, 3 * i);
    // A small pale patch at each attachment, narrowing away from the course.
    tendon[i] = Math.exp(-((beyond / 7) ** 2)) * Math.exp(-((bestDistance / (0.8 * width)) ** 2));
  }
  return { directions, tendon };
}
