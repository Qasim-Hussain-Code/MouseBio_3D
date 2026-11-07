import * as THREE from 'three';
import { HINGE_STATIONS } from './life-field';
import { installSurfaceShading } from './surface-shading';

/**
 * A layer drawn back from a straight cut, as a sheet of its own. The meshes of the model are too coarse to fold neatly, so where a layer has been drawn back it is hidden, and this sheet takes its place: it follows the real surface
 * from the cut to the line it folds over, rolls over that line, and lies out away from the body with its inner side up. Its shape is reckoned afresh as it is drawn back. It is a way of showing a reflected layer, and the size of the roll and the fall of the sheet are chosen for viewing.
 */
export interface SheetShape {
  /** The cut, at rest. */
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  /** Away from the cut, and out of the body. Both square to the cut. */
  readonly out: THREE.Vector3;
  readonly up: THREE.Vector3;
  /** How far from the cut the fold can go, in metres of surface. */
  readonly widest: number;
}

export type SheetKind = 'skin' | 'wall';

export interface FlapSheet {
  readonly mesh: THREE.Mesh;
  /** Draw it back to a share of the widest: reckons its shape if that has changed. */
  setOpen(open: number): void;
  /** The animal has moved under it: reckon again. */
  invalidate(): void;
  /** Where the cut edge lies now, in the middle of its length. */
  edge(): THREE.Vector3;
  /** Into a row of the table of fold lines: for each place along the cut, how far out the fold lies at rest, and how high it and the cut lie. */
  writeHinge(table: Float32Array, row: number): void;
  dispose(): void;
}

/** Finding a surface along a short ray quickly, from the triangles of some meshes in a region. */
export interface SurfaceProbe {
  /** How far along the ray the first of the surfaces lies, or -1. */
  along(origin: THREE.Vector3, way: THREE.Vector3, far: number): number;
}

const CELL = 0.002;

export function createSurfaceProbe(meshes: readonly THREE.Mesh[], region: THREE.Box3): SurfaceProbe {
  const size = region.getSize(new THREE.Vector3());
  const nx = Math.max(1, Math.ceil(size.x / CELL)), ny = Math.max(1, Math.ceil(size.y / CELL)), nz = Math.max(1, Math.ceil(size.z / CELL));
  const cells = new Map<number, number[]>();
  const corners: number[] = [];
  const key = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const clampCell = (value: number, count: number) => Math.max(0, Math.min(count - 1, value));
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const total = index ? index.count : position.count;
    for (let t = 0; t + 2 < total; t += 3) {
      a.fromBufferAttribute(position, index ? index.getX(t) : t).applyMatrix4(mesh.matrixWorld);
      if (!region.containsPoint(a)) { b.fromBufferAttribute(position, index ? index.getX(t + 1) : t + 1).applyMatrix4(mesh.matrixWorld); if (!region.containsPoint(b)) { c.fromBufferAttribute(position, index ? index.getX(t + 2) : t + 2).applyMatrix4(mesh.matrixWorld); if (!region.containsPoint(c)) continue; } }
      b.fromBufferAttribute(position, index ? index.getX(t + 1) : t + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(t + 2) : t + 2).applyMatrix4(mesh.matrixWorld);
      const at = corners.length / 9;
      corners.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const low = (axis: 'x' | 'y' | 'z') => (Math.min(a[axis], b[axis], c[axis]) - region.min[axis]) / CELL, high = (axis: 'x' | 'y' | 'z') => (Math.max(a[axis], b[axis], c[axis]) - region.min[axis]) / CELL;
      for (let z = clampCell(Math.floor(low('z')), nz), zEnd = clampCell(Math.floor(high('z')), nz); z <= zEnd; z++) for (let y = clampCell(Math.floor(low('y')), ny), yEnd = clampCell(Math.floor(high('y')), ny); y <= yEnd; y++) for (let x = clampCell(Math.floor(low('x')), nx), xEnd = clampCell(Math.floor(high('x')), nx); x <= xEnd; x++) {
        const k = key(x, y, z);
        const list = cells.get(k);
        if (list) list.push(at); else cells.set(k, [at]);
      }
    }
  }
  const stamps = new Int32Array(corners.length / 9);
  let stamp = 0;
  return {
    along(origin, way, far) {
      stamp++;
      let best = -1;
      for (let walked = 0; walked <= far + CELL * 0.5; walked += CELL * 0.5) {
        const x = Math.floor((origin.x + way.x * walked - region.min.x) / CELL), y = Math.floor((origin.y + way.y * walked - region.min.y) / CELL), z = Math.floor((origin.z + way.z * walked - region.min.z) / CELL);
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
        const list = cells.get(key(x, y, z));
        if (!list) continue;
        for (const at of list) {
          if (stamps[at] === stamp) continue;
          stamps[at] = stamp;
          const o = at * 9;
          const e1x = corners[o + 3] - corners[o], e1y = corners[o + 4] - corners[o + 1], e1z = corners[o + 5] - corners[o + 2];
          const e2x = corners[o + 6] - corners[o], e2y = corners[o + 7] - corners[o + 1], e2z = corners[o + 8] - corners[o + 2];
          const px = way.y * e2z - way.z * e2y, py = way.z * e2x - way.x * e2z, pz = way.x * e2y - way.y * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-16) continue;
          const tx = origin.x - corners[o], ty = origin.y - corners[o + 1], tz = origin.z - corners[o + 2];
          const u = (tx * px + ty * py + tz * pz) / det;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const v = (way.x * qx + way.y * qy + way.z * qz) / det;
          if (v < 0 || u + v > 1) continue;
          const distance = (e2x * qx + e2y * qy + e2z * qz) / det;
          if (distance >= 0 && distance <= far && (best < 0 || distance < best)) best = distance;
        }
        // Nothing nearer can lie further along than a cell beyond this hit.
        if (best >= 0 && walked > best + CELL) break;
      }
      return best;
    },
  };
}

const STEP = 0.00035, RAY_ABOVE = 0.005, STEEPEST = THREE.MathUtils.degToRad(76);

/** The curve of the surface away from the cut at each place along it. x runs along `out` and z along `up`, from the line of the cut. */
export interface SheetSamples {
  readonly stations: number;
  /** Samples at each station. */
  readonly rows: number;
  /** x, z and the slope at each sample, in order of station and then sample. */
  readonly curve: Float32Array;
  /** How far along the surface it can be followed at each station, in metres. */
  readonly reach: Float32Array;
}

/** Follow the surface away from the cut, by short steps, until it turns too steep or rises to something else, such as a leg. */
export function sampleAcross(probe: SurfaceProbe, shape: SheetShape): SheetSamples {
  const length = shape.a.distanceTo(shape.b);
  const stations = Math.max(9, Math.min(72, Math.round(length / 0.0006) + 1)), rows = Math.ceil(shape.widest / STEP) + 2;
  const curve = new Float32Array(stations * rows * 3), reach = new Float32Array(stations);
  const origin = new THREE.Vector3(), way = new THREE.Vector3(), at = new THREE.Vector3();
  for (let station = 0; station < stations; station++) {
    at.lerpVectors(shape.a, shape.b, station / (stations - 1));
    origin.copy(at).addScaledVector(shape.up, RAY_ABOVE * 1.6);
    way.copy(shape.up).negate();
    const first = probe.along(origin, way, RAY_ABOVE * 3);
    let x = 0, z = first >= 0 ? RAY_ABOVE * 1.6 - first : 0, slope = 0, missed = 0, last = rows - 1;
    const base = station * rows * 3;
    curve[base] = x; curve[base + 1] = z; curve[base + 2] = slope;
    for (let row = 1; row < rows; row++) {
      const guessX = x + STEP * Math.cos(slope), guessZ = z - STEP * Math.sin(slope);
      const nx = Math.sin(slope), nz = Math.cos(slope);
      origin.copy(at).addScaledVector(shape.out, guessX + nx * RAY_ABOVE).addScaledVector(shape.up, guessZ + nz * RAY_ABOVE);
      way.copy(shape.out).multiplyScalar(-nx).addScaledVector(shape.up, -nz);
      const hit = probe.along(origin, way, RAY_ABOVE * 1.7);
      let nextX = guessX, nextZ = guessZ;
      if (hit >= 0) { const off = RAY_ABOVE - hit; nextX = guessX + nx * off; nextZ = guessZ + nz * off; missed = 0; }
      else if (++missed * STEP > 0.003) { last = row - 1; break; }
      const along = Math.atan2(-(nextZ - z), nextX - x);
      // A surface that rises to meet this one is another part, a leg or a fold of the body, and one that falls away steeply has gone round the side.
      if (along < slope - 0.9 || along > STEEPEST) { last = row - 1; break; }
      slope += 0.55 * (along - slope);
      x = nextX; z = nextZ;
      const place = base + row * 3;
      curve[place] = x; curve[place + 1] = z; curve[place + 2] = slope;
    }
    for (let row = last + 1; row < rows; row++) {
      // Carried straight on: not reached, but read when reckoning what lies just under the fold.
      const place = base + row * 3, from = base + (row - 1) * 3;
      curve[place] = curve[from] + STEP * Math.cos(curve[from + 2]); curve[place + 1] = curve[from + 1] - STEP * Math.sin(curve[from + 2]); curve[place + 2] = curve[from + 2];
    }
    reach[station] = last * STEP;
  }
  // The body is smooth along the cut, so the curves are smoothed from station to station. A reach is kept to what its neighbours allow, which keeps the fold in one sweep.
  const smoothed = curve.slice();
  for (let pass = 0; pass < 3; pass++) {
    for (let station = 0; station < stations; station++) for (let row = 0; row < rows; row++) {
      const before = Math.max(0, station - 1), after = Math.min(stations - 1, station + 1), here = (station * rows + row) * 3, low = (before * rows + row) * 3, high = (after * rows + row) * 3;
      for (let k = 0; k < 3; k++) smoothed[here + k] = 0.25 * curve[low + k] + 0.5 * curve[here + k] + 0.25 * curve[high + k];
    }
    curve.set(smoothed);
  }
  const lowest = reach.slice();
  for (let station = 0; station < stations; station++) lowest[station] = Math.min(reach[Math.max(0, station - 1)], reach[station], reach[Math.min(stations - 1, station + 1)]);
  for (let pass = 0; pass < 12; pass++) {
    const copy = lowest.slice();
    for (let station = 0; station < stations; station++) lowest[station] = Math.min(copy[station], 0.25 * copy[Math.max(0, station - 1)] + 0.5 * copy[station] + 0.25 * copy[Math.min(stations - 1, station + 1)]);
  }
  reach.set(lowest);
  return { stations, rows, curve, reach };
}

/** How wide a flap is along its cut: it comes to nothing at the ends, as a cut does when it is drawn apart. */
export const flapSpindle = (t: number) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.6);

const ROW_COUNT = 34, TUCKED = 2, ROLL: Readonly<Record<SheetKind, number>> = { skin: 0.00055, wall: 0.00045 };
/** How quickly it falls away as it lies out from the fold, in radians for each metre. */
const FALL = 95;

/** A small wandering of a number along the cut, always the same for one place. */
const wander = (t: number, seed: number) => Math.sin(t * 37.1 + seed) * 0.5 + Math.sin(t * 91.7 + seed * 1.7) * 0.3 + Math.sin(t * 171.3 + seed * 2.3) * 0.2;

export function createFlapSheet(probe: SurfaceProbe, shape: SheetShape, kind: SheetKind, backColour: THREE.ColorRepresentation, nowOf: (rest: THREE.Vector3) => THREE.Vector3, map: THREE.Texture | null): FlapSheet {
  const samples = sampleAcross(probe, shape);
  const { stations, rows, curve, reach } = samples;
  const across = ROW_COUNT + 1 + TUCKED, count = stations * across;
  const length = shape.a.distanceTo(shape.b);
  const along = shape.b.clone().sub(shape.a).normalize();
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2), colour = new Float32Array(count * 3);
  const hingeX = new Float32Array(stations), hingeZ = new Float32Array(stations);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage), normalAttribute = new THREE.BufferAttribute(normal, 3).setUsage(THREE.DynamicDrawUsage), uvAttribute = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage), colourAttribute = new THREE.BufferAttribute(colour, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('normal', normalAttribute);
  geometry.setAttribute('uv', uvAttribute);
  geometry.setAttribute('color', colourAttribute);
  // Its front is the inner side, which faces up once it has been drawn back.
  const flip = new THREE.Vector3().crossVectors(along, shape.out.clone().negate()).dot(shape.up) < 0;
  const indices: number[] = [];
  for (let station = 0; station + 1 < stations; station++) for (let row = 0; row + 1 < across; row++) {
    const p = station * across + row, q = p + across, r = p + 1, s = q + 1;
    if (flip) indices.push(p, r, q, r, s, q); else indices.push(p, q, r, r, q, s);
  }
  geometry.setIndex(indices);
  const material = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map, vertexColors: true, roughness: kind === 'skin' ? 0.46 : 0.38, clearcoat: kind === 'skin' ? 0.5 : 0.8, clearcoatRoughness: 0.28, side: THREE.DoubleSide });
  const own = installSurfaceShading(material);
  own.uInner.value.set(backColour);
  own.uInnerOn.value = 1;
  // It moves as it is reckoned to, and not with the motion of the model.
  own.uLifeTaken.value = 1;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = `flap-of-${kind}`;

  const roll = ROLL[kind];
  const rim = kind === 'skin' ? new THREE.Color('#e3a59a') : new THREE.Color('#b65a52');
  const surfacePoint = (station: number, distance: number, out: { x: number; z: number; slope: number }) => {
    const place = Math.max(0, Math.min(rows - 1.001, distance / STEP)), low = Math.floor(place), share = place - low, base = station * rows * 3 + low * 3;
    out.x = curve[base] + (curve[base + 3] - curve[base]) * share;
    out.z = curve[base + 1] + (curve[base + 4] - curve[base + 1]) * share;
    out.slope = curve[base + 2] + (curve[base + 5] - curve[base + 2]) * share;
  };
  const here = { x: 0, z: 0, slope: 0 };
  const at = new THREE.Vector3(), point = new THREE.Vector3(), hinge = new THREE.Vector3(), tangent = new THREE.Vector3(), upward = new THREE.Vector3(), centre = new THREE.Vector3(), landed = new THREE.Vector3();
  let shownOpen = -1;
  const reckon = (open: number) => {
    shownOpen = open;
    for (let station = 0; station < stations; station++) {
      const t = station / (stations - 1);
      at.lerpVectors(shape.a, shape.b, t);
      const width = Math.min(shape.widest * open * flapSpindle(t), reach[station]);
      surfacePoint(station, width, here);
      hingeX[station] = width > 0 ? here.x : 0;
      hingeZ[station] = here.z;
      const slope = here.slope;
      point.copy(at).addScaledVector(shape.out, here.x).addScaledVector(shape.up, here.z);
      hinge.copy(nowOf(point));
      tangent.copy(shape.out).multiplyScalar(Math.cos(slope)).addScaledVector(shape.up, -Math.sin(slope));
      upward.copy(shape.out).multiplyScalar(Math.sin(slope)).addScaledVector(shape.up, Math.cos(slope));
      centre.copy(hinge).addScaledVector(upward, roll);
      const turn = Math.max(Math.PI / 2, Math.PI - slope), rollLength = roll * turn;
      landed.copy(centre).addScaledVector(upward, -roll * Math.cos(turn)).addScaledVector(tangent, -roll * Math.sin(turn));
      for (let row = 0; row <= ROW_COUNT; row++) {
        const share = 1 - row / ROW_COUNT;
        // Closer rows near the fold, which is where the sheet bends.
        const back = width * Math.pow(share, 1.7), material = width - back;
        const vertex = station * across + row;
        if (back <= rollLength) {
          const phi = back / roll;
          point.copy(centre).addScaledVector(upward, -roll * Math.cos(phi)).addScaledVector(tangent, -roll * Math.sin(phi));
        } else {
          const beyond = back - rollLength, angle = FALL * beyond;
          point.copy(landed).addScaledVector(shape.out, Math.sin(angle) / FALL).addScaledVector(shape.up, -(1 - Math.cos(angle)) / FALL + 0.00022 * wander(t * length * 40, row * 0.11) * Math.min(1, beyond / 0.004));
        }
        point.toArray(position, vertex * 3);
        uv[vertex * 2] = t * length / 0.064;
        uv[vertex * 2 + 1] = material / 0.032;
        // The cut edge itself is raw and darker.
        const fresh = 1 - Math.min(1, material / 0.0009);
        colour[vertex * 3] = 1 + (rim.r - 1) * fresh; colour[vertex * 3 + 1] = 1 + (rim.g - 1) * fresh; colour[vertex * 3 + 2] = 1 + (rim.b - 1) * fresh;
      }
      // Two rows carry on under the layer that stays, so that no gap can open at the fold.
      for (let extra = 1; extra <= TUCKED; extra++) {
        surfacePoint(station, width + extra * 0.0004, here);
        point.copy(at).addScaledVector(shape.out, here.x - Math.sin(here.slope) * 0.00016 * extra).addScaledVector(shape.up, here.z - Math.cos(here.slope) * 0.00016 * extra);
        nowOf(point).toArray(position, (station * across + ROW_COUNT + extra) * 3);
        const vertex = station * across + ROW_COUNT + extra;
        uv[vertex * 2] = t * length / 0.064; uv[vertex * 2 + 1] = width / 0.032;
        colour[vertex * 3] = 1; colour[vertex * 3 + 1] = 1; colour[vertex * 3 + 2] = 1;
      }
    }
    // Its normals, from its own shape, on the side of its front.
    const u = new THREE.Vector3(), v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
    for (let station = 0; station < stations; station++) for (let row = 0; row < across; row++) {
      const vertex = station * across + row;
      a.fromArray(position, (Math.min(stations - 1, station + 1) * across + row) * 3); b.fromArray(position, (Math.max(0, station - 1) * across + row) * 3); u.subVectors(a, b);
      a.fromArray(position, (station * across + Math.min(across - 1, row + 1)) * 3); b.fromArray(position, (station * across + Math.max(0, row - 1)) * 3); v.subVectors(a, b);
      n.crossVectors(u, v);
      if (n.lengthSq() < 1e-20) n.copy(shape.up); else n.normalize();
      if (flip) n.negate();
      n.toArray(normal, vertex * 3);
    }
    positionAttribute.needsUpdate = true; normalAttribute.needsUpdate = true; uvAttribute.needsUpdate = true; colourAttribute.needsUpdate = true;
  };
  reckon(0);
  return {
    mesh,
    setOpen(open) { if (open !== shownOpen) reckon(open); },
    invalidate() { shownOpen = -1; },
    edge() { return new THREE.Vector3().fromArray(position, Math.floor(stations / 2) * across * 3); },
    writeHinge(table, row) {
      for (let column = 0; column < HINGE_STATIONS; column++) {
        const place = column / (HINGE_STATIONS - 1) * (stations - 1), low = Math.min(stations - 2, Math.floor(place)), share = place - low;
        const o = (row * HINGE_STATIONS + column) * 4;
        table[o] = hingeX[low] + (hingeX[low + 1] - hingeX[low]) * share;
        table[o + 1] = hingeZ[low] + (hingeZ[low + 1] - hingeZ[low]) * share;
        const lowBase = low * rows * 3, highBase = (low + 1) * rows * 3;
        table[o + 2] = curve[lowBase + 1] + (curve[highBase + 1] - curve[lowBase + 1]) * share;
        table[o + 3] = 0;
      }
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

/** A generator of numbers that gives the same drawing each time. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const looks = new Map<SheetKind, THREE.Texture | null>();

/**
 * The look of the inner side of a layer: pale skin with small vessels and a little fat, or the wall of the body with its fibres and a shine. The vessels are not those of this animal or of any measured animal. They are drawn from a fixed seed, to show what a reflected layer looks like.
 */
export function flapLook(kind: SheetKind): THREE.Texture | null {
  if (looks.has(kind)) return looks.get(kind)!;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const c = canvas?.getContext?.('2d') ?? null;
  if (!canvas || !c) { looks.set(kind, null); return null; }
  canvas.width = 1024; canvas.height = 512;
  const random = seeded(kind === 'skin' ? 11 : 29);
  c.fillStyle = kind === 'skin' ? '#f4ded4' : '#d39488';
  c.fillRect(0, 0, 1024, 512);
  const blot = (x: number, y: number, size: number, colour: string) => { const g = c.createRadialGradient(x, y, 0, x, y, size); g.addColorStop(0, colour); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - size, y - size, size * 2, size * 2); };
  if (kind === 'skin') {
    for (let index = 0; index < 90; index++) blot(random() * 1024, random() * 512, 18 + random() * 70, random() < 0.55 ? 'rgba(250,240,218,.34)' : 'rgba(236,184,170,.22)');
  } else {
    for (let index = 0; index < 60; index++) blot(random() * 1024, random() * 512, 30 + random() * 90, random() < 0.5 ? 'rgba(232,178,166,.3)' : 'rgba(176,96,88,.2)');
    // The fibres of the muscle, seen through the lining.
    for (let index = 0; index < 5200; index++) {
      const x = random() * 1024, y = random() * 512, reach = 8 + random() * 26, bend = -0.5 + 0.18 * (random() - 0.5);
      c.strokeStyle = random() < 0.5 ? `rgba(120,50,46,${0.05 + random() * 0.1})` : `rgba(246,214,204,${0.05 + random() * 0.1})`;
      c.lineWidth = 0.6 + random() * 0.8;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(bend) * reach, y + Math.sin(bend) * reach); c.stroke();
    }
  }
  // Vessels branch in from the side away from the cut.
  c.lineCap = 'round';
  const vessel = (x: number, y: number, angle: number, width: number, steps: number, colour: string) => {
    let px = x, py = y, heading = angle;
    for (let step = 0; step < steps; step++) {
      heading += (random() - 0.5) * 0.5;
      const nx = px + Math.cos(heading) * 7, ny = py + Math.sin(heading) * 7, w = width * (1 - step / steps * 0.75);
      c.strokeStyle = colour; c.lineWidth = w;
      c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
      if (width > 0.7 && random() < 0.16) vessel(nx, ny, heading + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5), w * 0.68, Math.max(4, Math.floor(steps * 0.55)), colour);
      px = nx; py = ny;
    }
  };
  const trunks = kind === 'skin' ? 11 : 6;
  for (let index = 0; index < trunks; index++) {
    const x = (index + 0.2 + random() * 0.6) / trunks * 1024, colour = random() < 0.6 ? (kind === 'skin' ? 'rgba(176,66,68,.62)' : 'rgba(136,44,44,.42)') : (kind === 'skin' ? 'rgba(122,70,112,.46)' : 'rgba(92,60,110,.34)');
    vessel(x, 512 + 8, -Math.PI / 2 + (random() - 0.5) * 0.7, (kind === 'skin' ? 2.1 : 1.7) + random() * 1.2, 44 + Math.floor(random() * 24), colour);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  looks.set(kind, texture);
  return texture;
}
