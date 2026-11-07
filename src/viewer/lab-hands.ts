import * as THREE from 'three';
import { BONE_COUNT, boneOf, buildHandSurface, FINGER_PLANS, GLOVE_END, mirrorHandSurface, WRIST_HALF, type FingerName, type HandSide, type HandSurface } from './lab-hand-model';
import type { GripKind, GripTargets, Instrument } from './lab-instruments';

/**
 * Two gloved hands that hold the instruments. A hand takes its place from the instrument it holds, so that wherever the tip is put, the hand and forearm follow, and each finger is bent until it
 * reaches its place on the instrument. The way each instrument is held follows ordinary practice at the bench: rings under the thumb and ring finger with the index along the shank, and forceps, probes and blades
 * held as a pen. This shows how a hand moves and is not a model of force, dexterity or fatigue. Sizes are those of an adult hand beside a mouse, so a hand looks large, as it does at the bench.
 */
const FLEX_LIMITS: Readonly<Record<FingerName, readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]]>> = {
  // Sideways, then the three bends, in radians.
  thumb: [[-0.5, 0.75], [-0.25, 0.75], [-0.1, 0.9], [-0.15, 1.2]],
  index: [[-0.3, 0.3], [-0.15, 1.5], [0, 1.8], [0, 1.2]],
  middle: [[-0.2, 0.2], [-0.15, 1.55], [0, 1.85], [0, 1.2]],
  ring: [[-0.2, 0.25], [-0.15, 1.6], [0, 1.9], [0, 1.25]],
  little: [[-0.25, 0.35], [-0.15, 1.65], [0, 1.9], [0, 1.25]],
};

/** How a hand lies for each way of holding: the frame of the right hand in the coordinates of the instrument, and how the fingers with no place of their own lie, as the bend at the knuckle and at the next joint. */
interface HandFrame {
  /** Along the fingers and out of the back of the hand. */
  readonly along: readonly [number, number, number];
  readonly back: readonly [number, number, number];
  readonly wrist: readonly [number, number, number];
  readonly idle: Partial<Record<FingerName, readonly [number, number]>>;
}

export const HAND_FRAMES: Readonly<Record<GripKind, HandFrame>> = Object.freeze({
  rings: { along: [-0.03, -0.05, -0.99], back: [0, -0.99, 0.05], wrist: [-0.0075, -0.0532, 0.1956], idle: { little: [1.15, 1.25] } },
  pen: { along: [-0.7735, -0.1294, -0.62], back: [-0.6254, -0.0012, 0.78], wrist: [0.0345, 0.0461, 0.1649], idle: { ring: [1.05, 1.15], little: [1.15, 1.2] } },
  pinch: { along: [-0.7735, -0.1294, -0.62], back: [-0.6254, -0.0012, 0.78], wrist: [0.0345, 0.0461, 0.1174], idle: { middle: [1, 1.1], ring: [1.1, 1.2], little: [1.15, 1.25] } },
});

const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
const turnA = new THREE.Quaternion(), turnB = new THREE.Quaternion();

/** One finger of the rig: where its joints lie in the frame of the hand with everything straight, the axes it turns about, and its present angles. */
interface FingerRig {
  readonly name: FingerName;
  readonly points: readonly THREE.Vector3[];
  readonly sideAxis: THREE.Vector3;
  readonly bendAxis: THREE.Vector3;
  readonly angles: [number, number, number, number];
  readonly bones: readonly THREE.Bone[];
  /** The last two joints bend together, as they do in a finger, except in the thumb. */
  readonly coupled: boolean;
}

/** The place of the far end of a finger for its present angles, and of every joint on the way, in the frame of the hand. */
function fingerChain(finger: FingerRig, pivots: THREE.Vector3[], rotations: THREE.Quaternion[]) {
  const [side, first, second, third] = finger.angles;
  const base = new THREE.Quaternion().setFromAxisAngle(finger.sideAxis, side).multiply(turnA.setFromAxisAngle(finger.bendAxis, first));
  const middle = base.clone().multiply(turnA.setFromAxisAngle(finger.bendAxis, second));
  const end = middle.clone().multiply(turnA.setFromAxisAngle(finger.bendAxis, finger.coupled ? second * 0.68 : third));
  const [p0, p1, p2, p3] = finger.points;
  pivots[0] = p0.clone();
  pivots[1] = pivots[0].clone().add(p1.clone().sub(p0).applyQuaternion(base));
  pivots[2] = pivots[1].clone().add(p2.clone().sub(p1).applyQuaternion(middle));
  // The pad of the fingertip, a little short of the very end.
  pivots[3] = pivots[2].clone().add(p3.clone().sub(p2).multiplyScalar(0.72).applyQuaternion(end));
  rotations[0] = base; rotations[1] = middle; rotations[2] = end;
}

/** Bend a finger until its pad comes to a target in the frame of the hand. Returns how far off it stays. */
export function reachFor(finger: FingerRig, target: THREE.Vector3, rounds = 16): number {
  const limits = FLEX_LIMITS[finger.name];
  const pivots: THREE.Vector3[] = [], rotations: THREE.Quaternion[] = [];
  const toEnd = new THREE.Vector3(), toTarget = new THREE.Vector3(), axis = new THREE.Vector3(), cross = new THREE.Vector3();
  const joints = finger.coupled ? [2, 1, 0] : [3, 2, 1, 0];
  for (let round = 0; round < rounds; round++) {
    for (const joint of joints) {
      fingerChain(finger, pivots, rotations);
      const pivot = joint === 3 ? pivots[2] : joint === 2 ? pivots[1] : pivots[0];
      if (joint === 0) axis.copy(finger.sideAxis);
      else if (joint === 1) axis.copy(finger.bendAxis).applyQuaternion(turnB.setFromAxisAngle(finger.sideAxis, finger.angles[0]));
      else axis.copy(finger.bendAxis).applyQuaternion(rotations[joint - 2]);
      toEnd.subVectors(pivots[3], pivot); toTarget.subVectors(target, pivot);
      const along = toEnd.clone().addScaledVector(axis, -toEnd.dot(axis)), wanted = toTarget.clone().addScaledVector(axis, -toTarget.dot(axis));
      if (along.lengthSq() < 1e-10 || wanted.lengthSq() < 1e-10) continue;
      cross.crossVectors(along, wanted);
      const angle = Math.atan2(cross.dot(axis), along.dot(wanted));
      const [low, high] = limits[joint];
      finger.angles[joint] = Math.max(low, Math.min(high, finger.angles[joint] + angle * 0.8));
    }
  }
  fingerChain(finger, pivots, rotations);
  return pivots[3].distanceTo(target);
}

/** A sleeve: rings of an oval that widens along the forearm, with a few soft folds. */
function sleeveGeometry(mirror: number): THREE.BufferGeometry {
  const rings = 26, around = 28, start = GLOVE_END + 0.008, length = 0.42;
  const positions: number[] = [], indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings, y = start - length * t;
    const width = WRIST_HALF.width * (0.92 + 0.42 * t), thickness = WRIST_HALF.thickness * (0.92 + 0.72 * t);
    for (let step = 0; step < around; step++) {
      const a = step / around * Math.PI * 2;
      const fold = 1 + 0.035 * Math.sin(y * 170 + 2.1 * Math.sin(a * 2 + 1.3)) * Math.sin(a * 3 + y * 40);
      positions.push(mirror * Math.cos(a) * width * fold, y, Math.sin(a) * thickness * fold);
      if (ring < rings) {
        const next = (step + 1) % around;
        const here = ring * around;
        if (mirror > 0) indices.push(here + step, here + next, here + around + step, here + next, here + around + next, here + around + step);
        else indices.push(here + step, here + around + step, here + next, here + next, here + around + step, here + around + next);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The rolled edge of the glove round the wrist. */
function rimGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let step = 0; step < 48; step++) { const a = step / 48 * Math.PI * 2; points.push(new THREE.Vector3(Math.cos(a) * WRIST_HALF.width, GLOVE_END + 0.0008, Math.sin(a) * WRIST_HALF.thickness)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 72, 0.0017, 8, true);
}

/** Small wrinkles and the dull shine of a nitrile glove. They depend on the place on the hand, so that they stay on it as it moves. */
function gloveMaterial(): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({ color: '#4a6db5', roughness: 0.44, metalness: 0, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color('#c9d8f5'), clearcoat: 0.22, clearcoatRoughness: 0.5 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGloveAt;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGloveAt = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGloveAt;').replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
    {
      vec3 g = vGloveAt * 900.0;
      vec3 wrinkle = vec3(sin(g.y * 1.1 + 1.7 * sin(g.x * 0.9)) * cos(g.z * 0.7), sin(g.x * 1.3 + 1.3 * sin(g.y * 0.6)), cos(g.y * 0.9 + g.z * 0.5));
      normal = normalize(normal + 0.018 * wrinkle);
    }`);
  };
  material.customProgramCacheKey = () => 'mousebio-glove-v1';
  return material;
}

export interface LabHand {
  readonly side: HandSide;
  readonly holder: THREE.Group;
  /** How far the last fingers placed stayed from their places, in metres, by finger. */
  readonly misses: () => Readonly<Partial<Record<FingerName, number>>>;
  /** Take up the instrument, placed where it is now, with the fingers on it and the forearm going towards a point in the room. */
  hold(instrument: Instrument, kind: GripKind, elbow: THREE.Vector3): void;
  /** Lie out of the way, with no instrument. */
  rest(): void;
  dispose(): void;
}

let sharedSurface: { right: HandSurface; left: HandSurface } | null = null;
const surfaces = () => {
  if (!sharedSurface) { const right = buildHandSurface(); sharedSurface = { right, left: mirrorHandSurface(right) }; }
  return sharedSurface;
};

export function createHand(side: HandSide): LabHand {
  const mirror = side === 'right' ? 1 : -1;
  const surface = surfaces()[side];
  const holder = new THREE.Group();
  holder.name = `${side}-hand`;
  const flip = (x: number, y: number, z: number) => new THREE.Vector3(mirror * x, y, z);
  const forearm = new THREE.Bone(), back = new THREE.Bone();
  holder.add(forearm, back);
  const bones: THREE.Bone[] = new Array(BONE_COUNT);
  bones[0] = forearm; bones[1] = back;
  const fingers: FingerRig[] = FINGER_PLANS.map((plan, finger) => {
    const points = plan.joints.map(([x, y, z]) => flip(x, y, z));
    const own = [0, 1, 2].map((part) => { const bone = new THREE.Bone(); bones[boneOf(finger, part)] = bone; return bone; });
    own[0].position.copy(points[0]); back.add(own[0]);
    own[1].position.copy(points[1]).sub(points[0]); own[0].add(own[1]);
    own[2].position.copy(points[2]).sub(points[1]); own[1].add(own[2]);
    const along = points[1].clone().sub(points[0]).normalize();
    let sideAxis: THREE.Vector3, bendAxis: THREE.Vector3;
    if (plan.name === 'thumb') {
      // The thumb comes across and under the palm, at an angle to the plane of the fingers.
      const inPlane = flip(0.7, 0.7, 0).normalize();
      sideAxis = inPlane.clone().multiplyScalar(-1 * mirror);
      bendAxis = new THREE.Vector3(0, 0, -mirror).addScaledVector(inPlane, -0.7 * mirror).normalize();
    } else {
      // Bending a finger turns it towards the palm.
      bendAxis = new THREE.Vector3(0, 0, 1).cross(along).normalize();
      sideAxis = new THREE.Vector3(0, 0, mirror);
    }
    return { name: plan.name, points, sideAxis, bendAxis, angles: [0, 0.2, 0.3, 0.2], bones: own, coupled: plan.name !== 'thumb' };
  });
  holder.updateWorldMatrix(true, true);
  const skeleton = new THREE.Skeleton(bones);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(surface.boneIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(surface.boneWeights, 4));
  geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
  const glove = gloveMaterial();
  const skin = new THREE.SkinnedMesh(geometry, glove);
  skin.frustumCulled = false;
  skin.bind(skeleton);
  holder.add(skin);
  const rim = new THREE.Mesh(rimGeometry(), glove);
  rim.frustumCulled = false;
  forearm.add(rim);
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: '#c8d4df', roughness: 0.92 });
  const sleeve = new THREE.Mesh(sleeveGeometry(mirror), sleeveMaterial);
  sleeve.frustumCulled = false;
  forearm.add(sleeve);

  let misses: Partial<Record<FingerName, number>> = {}, solved = '';
  const applyAngles = () => {
    const part = new THREE.Quaternion();
    for (const finger of fingers) {
      const [sideways, first, second, third] = finger.angles;
      finger.bones[0].quaternion.setFromAxisAngle(finger.sideAxis, sideways).multiply(part.setFromAxisAngle(finger.bendAxis, first));
      finger.bones[1].quaternion.setFromAxisAngle(finger.bendAxis, second);
      finger.bones[2].quaternion.setFromAxisAngle(finger.bendAxis, finger.coupled ? second * 0.68 : third);
    }
  };
  const frame = new THREE.Matrix4(), toHand = new THREE.Matrix4(), direction = new THREE.Vector3(), turn = new THREE.Quaternion(), down = new THREE.Vector3(0, -1, 0);
  return {
    side,
    holder,
    misses: () => misses,
    hold(instrument, kind, elbow) {
      holder.visible = true;
      const plan = HAND_FRAMES[kind];
      // The instrument's own frame, and a left hand on it as the mirror image of a right hand.
      Y.fromArray(plan.along as unknown as number[]).normalize();
      Z.fromArray(plan.back as unknown as number[]);
      Y.x *= mirror; Z.x *= mirror;
      X.crossVectors(Y, Z).normalize();
      Z.crossVectors(X, Y).normalize();
      frame.makeBasis(X, Y, Z).setPosition(mirror * plan.wrist[0], plan.wrist[1], plan.wrist[2]);
      instrument.group.updateWorldMatrix(true, false);
      const placed = new THREE.Matrix4().multiplyMatrices(instrument.group.matrixWorld, frame);
      if (holder.parent) { holder.parent.updateWorldMatrix(true, false); placed.premultiply(toHand.copy(holder.parent.matrixWorld).invert()); }
      placed.decompose(holder.position, holder.quaternion, holder.scale);
      // The fingers go to their places on the instrument.
      toHand.copy(frame).invert();
      const targets: GripTargets = instrument.holds();
      // The fingers keep their places on an instrument as it moves, and need setting only when the grip or the opening of the jaws has changed.
      const signature = kind + JSON.stringify(targets);
      if (signature !== solved) {
        const fresh = !solved.startsWith(kind);
        solved = signature;
        misses = {};
        for (const finger of fingers) {
          const target = targets[finger.name];
          if (target) {
            const local = new THREE.Vector3(mirror * target[0], target[1], target[2]).applyMatrix4(toHand);
            misses[finger.name] = reachFor(finger, local, fresh ? 16 : 4);
          } else {
            const idle = plan.idle[finger.name] ?? [0.7, 0.9];
            finger.angles[0] = 0; finger.angles[1] = idle[0]; finger.angles[2] = idle[1]; finger.angles[3] = idle[1] * 0.68;
          }
        }
        applyAngles();
      }
      // The forearm runs back from the wrist towards the elbow, bending no further at the wrist than a wrist bends.
      holder.updateWorldMatrix(true, false);
      direction.copy(elbow).applyMatrix4(toHand.copy(holder.matrixWorld).invert()).normalize();
      const angle = down.angleTo(direction), most = 0.95;
      turn.setFromUnitVectors(down, direction);
      if (angle > most) turn.slerp(new THREE.Quaternion(), 1 - most / angle);
      forearm.quaternion.copy(turn);
    },
    rest() { holder.visible = false; },
    dispose() { geometry.dispose(); glove.dispose(); rim.geometry.dispose(); sleeve.geometry.dispose(); sleeveMaterial.dispose(); skeleton.dispose(); },
  };
}
