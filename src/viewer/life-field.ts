import * as THREE from 'three';

/**
 * The motion of the living mouse as a displacement of every point in world coordinates, the same for skin, hairs, muscles, bones, organs and tokens,
 * so that what lies together moves together and nothing tears. It is an illustration: the sizes of all movements are chosen for viewing.
 *
 * Shared values change every frame and are held once. A mesh has its own kind of motion, on top of what its place in the body gives it.
 */
export const LIFE_KIND = Object.freeze({ none: 0, beat: 1, artery: 2, gut: 3, whisker: 4, ear: 5, tail: 6 });

/** How many flaps can be open at one time. */
export const FLAP_SLOTS = 8;

export const LIFE_SHARED = Object.freeze({
  uLifeOn: { value: 0 },
  /** The middle of the first neck bones, from which the coordinates along the body are taken. */
  uLifeOrigin: { value: new THREE.Vector3() },
  uLifeAxis: { value: new THREE.Vector3(1, 0, 0) },
  uLifeDorsal: { value: new THREE.Vector3(0, 0, 1) },
  uLifeLateral: { value: new THREE.Vector3(0, 1, 0) },
  /** Along the body: start of the chest, the diaphragm, the end of the loin, the sacrum. */
  uLifeBody: { value: new THREE.Vector4() },
  /** Height of the spine at the start of the chest, at the diaphragm and at the end of the loin. */
  uLifeSpine: { value: new THREE.Vector3() },
  /** Half the height and half the width of the trunk. */
  uLifeTrunk: { value: new THREE.Vector2(0.018, 0.013) },
  /** Height of the ground under the origin. */
  uLifeGround: { value: 0 },
  /** How far the chest and abdomen are expanded now, as a share of their size. */
  uLifeBreath: { value: 0 },
  /** How far the organs under the diaphragm are pushed along the body now, in metres. */
  uLifePush: { value: 0 },
  uLifeHeadYaw: { value: 0 },
  uLifeHeadNod: { value: 0 },
  /** The heart, and how many cycles have passed. */
  uLifeHeart: { value: new THREE.Vector3() },
  uLifeBeats: { value: 0 },
  /** Length along the arteries of one cycle of the pulse. */
  uLifePulseLength: { value: 0.1 },
  uLifeGutPhase: { value: 0 },
  uLifeWhisk: { value: 0 },
  uLifeEar: { value: 0 },
  uLifeTailPhase: { value: 0 },
  /** The base of the tail, and the line from there to its tip. */
  uLifeTailBase: { value: new THREE.Vector3() },
  uLifeTailLine: { value: new THREE.Vector3(1, 0, 0) },
  uLifeTailLength: { value: 0.06 },
  /** The tip of the nose, and how far it moves now. */
  uLifeNose: { value: new THREE.Vector3() },
  uLifeNoseMove: { value: 0 },
  /** Stepping: where each leg starts and ends, how far it swings and lifts, and how far the body rises. */
  uLifeWalk: { value: 0 },
  uLifeHip: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uLifeFoot: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uLifeSwing: { value: [0, 0, 0, 0] },
  uLifeLift: { value: [0, 0, 0, 0] },
  /** The middle joint of each leg, and how far the leg bends there. */
  uLifeKnee: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uLifeBend: { value: [0, 0, 0, 0] },
  uLifeBob: { value: 0 },
  /** How far the middle of the trunk moves to the side. */
  uLifeSway: { value: 0 },
  /** A poke: where, in which direction and how far the surface is pressed, and how far the whole animal starts. */
  uLifePoke: { value: new THREE.Vector3() },
  uLifePokeBy: { value: new THREE.Vector3() },
  uLifeStart: { value: 0 },
  /** Sitting up: how far the trunk has come up about the hips, in radians, and the height of the hips under the origin. */
  uLifeRear: { value: 0 },
  uLifeRearAt: { value: 0 },
  /** How far the legs have been laid out to the sides, for an animal lying on its back, from 0 to 1. */
  uLifeSplay: { value: 0 },
  /** How much further a leg has been drawn out and taped down, for surgery on its inner side, in radians. */
  uLifeLegOut: { value: [0, 0, 0, 0] },
  /**
   * Layers drawn back from a cut as flaps. Each flap lies on one side of a straight cut from A to B. Out runs along the surface away from the cut, and Up out of the body at the cut.
   * In its shape, x is how far from the cut it has been drawn back or, for a lid, how far it has turned; y is how far a lid reaches from A to its far end; z is which kind of layer it is; and w is 0 for a layer that folds, as skin does when a cut is drawn apart. A lid, such as the front of the rib cage or a half of the top of the skull, has for w how deep it goes under the cut, in millimetres.
   */
  uFlapCount: { value: 0 },
  uFlapA: { value: Array.from({ length: FLAP_SLOTS }, () => new THREE.Vector3()) },
  uFlapB: { value: Array.from({ length: FLAP_SLOTS }, () => new THREE.Vector3()) },
  uFlapOut: { value: Array.from({ length: FLAP_SLOTS }, () => new THREE.Vector3(1, 0, 0)) },
  uFlapUp: { value: Array.from({ length: FLAP_SLOTS }, () => new THREE.Vector3(0, 0, 1)) },
  uFlapShape: { value: Array.from({ length: FLAP_SLOTS }, () => new THREE.Vector4()) },
  /** Forceps holding a layer: where they hold, how far they lift it, and how far round the point the layer follows. */
  uLifeHoldAt: { value: new THREE.Vector3() },
  uLifeHoldBy: { value: new THREE.Vector3() },
  uLifeHoldReach: { value: 0.006 },
});

/** Points along a cut at which the line that a flap folds over is held, in a small table of which each row is a flap. See mbFlapOver. */
export const HINGE_STATIONS = 33;
/**
 * Whether a point of a layer, as it lay, is where a flap of one of these kinds has been drawn back from. A row of the table holds, for places along the cut, how far out the fold lies and how high it and the cut lie, all measured from the start of the cut:
 * under a straight line between those two heights lies what goes with the flap, for the depth of its layer. The rest stays. Needs the table `uFlapHinge`.
 */
export const FLAP_OVER = `
uniform highp sampler2D uFlapHinge;
bool mbFlapOver(vec3 p, vec3 kinds) {
  for (int i = 0; i < ${FLAP_SLOTS}; i++) {
    if (float(i) >= uFlapCount) break;
    vec4 mbShape = uFlapShape[i];
    if (mbShape.w > 0.5 || mbShape.x <= 0.00001) continue;
    if ((mbShape.z < 0.5 ? kinds.x : kinds.y) < 0.5) continue;
    vec3 mbAB = uFlapB[i] - uFlapA[i], mbFromA = p - uFlapA[i];
    float mbT = dot(mbFromA, mbAB) / dot(mbAB, mbAB);
    if (mbT <= 0.0 || mbT >= 1.0) continue;
    float mbOutward = dot(mbFromA, uFlapOut[i]);
    if (mbOutward < -0.0002) continue;
    float mbAt = mbT * ${HINGE_STATIONS - 1}.0;
    int mbCell = int(mbAt);
    vec4 mbHinge = mix(texelFetch(uFlapHinge, ivec2(mbCell, i), 0), texelFetch(uFlapHinge, ivec2(mbCell + 1, i), 0), mbAt - float(mbCell));
    if (mbHinge.x <= 0.0 || mbOutward > mbHinge.x) continue;
    float mbLevel = mix(mbHinge.z, mbHinge.y, max(mbOutward, 0.0) / mbHinge.x), mbHigh = dot(mbFromA, uFlapUp[i]);
    if (mbHigh < mbLevel - (mbShape.z < 0.5 ? 0.0032 : 0.0026) || mbHigh > mbLevel + 0.003) continue;
    return true;
  }
  return false;
}`;

/** A mesh's own part of the motion. */
export interface LifeMeshUniforms {
  readonly uLifeKind: { value: number };
  /** How far this mesh moves in its own motion: a share or a length, by kind. */
  readonly uLifeAmount: { value: number };
  readonly uLifePivot: { value: THREE.Vector3 };
  /** 1 if this mesh is pushed along the body by the diaphragm. */
  readonly uLifeAxial: { value: number };
  /** How far this mesh has been moved as a whole, by a hand. */
  readonly uLifeShift: { value: THREE.Vector3 };
  /** 1 if this mesh has been taken out of the body, and so moves only as it has been moved. */
  readonly uLifeTaken: { value: number };
  /** 1 if this mesh is the layer that forceps are holding. */
  readonly uLifeHeld: { value: number };
  /** Which kinds of flap this mesh goes with: the skin, the wall of the body, and the front of the rib cage. */
  readonly uLifeFlapOf: { value: THREE.Vector3 };
  /** 1 if this mesh belongs to the trunk, and stays where it is when a leg beside it is laid out. */
  readonly uLifeStays: { value: number };
}

export const createLifeMeshUniforms = (): LifeMeshUniforms => ({ uLifeKind: { value: 0 }, uLifeAmount: { value: 0 }, uLifePivot: { value: new THREE.Vector3() }, uLifeAxial: { value: 0 }, uLifeShift: { value: new THREE.Vector3() }, uLifeTaken: { value: 0 }, uLifeHeld: { value: 0 }, uLifeFlapOf: { value: new THREE.Vector3() }, uLifeStays: { value: 0 } });

const FOUR: Readonly<Record<string, string>> = { uLifeHip: 'vec3', uLifeFoot: 'vec3', uLifeKnee: 'vec3', uLifeSwing: 'float', uLifeLift: 'float', uLifeBend: 'float', uLifeLegOut: 'float' };
const FLAPS: Readonly<Record<string, string>> = { uFlapA: 'vec3', uFlapB: 'vec3', uFlapOut: 'vec3', uFlapUp: 'vec3', uFlapShape: 'vec4' };
const TYPES: Readonly<Record<string, string>> = { uLifeOrigin: 'vec3', uLifeAxis: 'vec3', uLifeDorsal: 'vec3', uLifeLateral: 'vec3', uLifeBody: 'vec4', uLifeSpine: 'vec3', uLifeTrunk: 'vec2', uLifeHeart: 'vec3', uLifeTailBase: 'vec3', uLifeTailLine: 'vec3', uLifeNose: 'vec3', uLifePoke: 'vec3', uLifePokeBy: 'vec3', uLifeHoldAt: 'vec3', uLifeHoldBy: 'vec3' };

export const LIFE_DECLARATIONS = [
  ...Object.keys(LIFE_SHARED).map((name) => FLAPS[name] ? `uniform ${FLAPS[name]} ${name}[${FLAP_SLOTS}];` : FOUR[name] ? `uniform ${FOUR[name]} ${name}[4];` : `uniform ${TYPES[name] ?? 'float'} ${name};`),
  'uniform float uLifeKind;', 'uniform float uLifeAmount;', 'uniform vec3 uLifePivot;', 'uniform float uLifeAxial;', 'uniform vec3 uLifeShift;', 'uniform float uLifeTaken;', 'uniform float uLifeHeld;', 'uniform vec3 uLifeFlapOf;', 'uniform float uLifeStays;',
].join('\n');

/**
 * The displacement of a point p with normal n. In order: a mesh's own motion; the chest and abdomen widening about the line of the spine, which itself keeps still, and
 * fading out towards the limbs; the organs pushed along by the diaphragm; the nose; and the head turning on the neck, with the ground holding the fore paws in place.
 */
export const LIFE_MOVE = `
vec3 mbTurn(vec3 r, vec3 k, float angle) {
  float c = cos(angle);
  return r * c + cross(k, r) * sin(angle) + k * dot(k, r) * (1.0 - c);
}
/** How much of the turn of the head reaches a point: all of it in the skull, none at the shoulders, and nothing near the ground, where the fore paws stay. */
float mbHeadShare(float a, float h) {
  if (uLifeHeadYaw == 0.0 && uLifeHeadNod == 0.0) return 0.0;
  return (1.0 - smoothstep(-0.003, 0.018, a)) * smoothstep(uLifeGround + 0.005, uLifeGround + 0.01, h);
}
float mbLeg(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return (1.0 - smoothstep(0.0045, 0.0085, length(p - a - ab * t))) * smoothstep(0.0, 0.22, t);
}
/**
 * A leg laid out to the side, for an animal lying on its back. The angle grows down the leg, from nothing at its top to all of it at the wrist or ankle, because the top of a leg is held in the skin of the trunk and only the lower part hangs free, and the paw beyond goes along without turning, sole up.
 * It reaches only what lies to the outer side of the groove between the leg and the trunk, and only as far along the body as the leg goes, so that the chest, the flank and the middle of the rump stay where they are. Each returns the angle for a point, and the part of the leg's end that the point follows.
 */
float mbLegOut(vec3 q, int i, out float paw) {
  paw = 0.0;
  if (uLifeStays > 0.5) return 0.0;
  vec3 mbHip = uLifeHip[i] - uLifeOrigin, mbFoot = uLifeFoot[i] - uLifeOrigin;
  float mbA = dot(q, uLifeAxis), mbL = dot(q, uLifeLateral), mbH = dot(q, uLifeDorsal);
  float mbOut = dot(mbHip, uLifeLateral) < 0.0 ? -1.0 : 1.0, mbInFrom = mbOut * (mbL - dot(mbFoot, uLifeLateral));
  float mbHere = i < 2 ? smoothstep(-0.0042, -0.0016, mbInFrom) * smoothstep(-0.0135, -0.0105, mbA) * (1.0 - smoothstep(0.009, 0.014, mbA))
    : smoothstep(-0.0072, -0.0022, mbInFrom) * smoothstep(0.029, 0.033, mbA);
  if (mbHere <= 0.0) return 0.0;
  float mbEnd = uLifeGround + 0.0025, mbTop = dot(mbHip, uLifeDorsal);
  float mbDown = clamp((mbTop - mbH) / (mbTop - mbEnd), 0.0, 1.0);
  paw = 1.0 - smoothstep(uLifeGround + 0.0022, uLifeGround + 0.0044, mbH);
  return -mbOut * (uLifeSplay * (i < 2 ? 1.25 : 0.62) * pow(mbDown, 1.6) + uLifeLegOut[i] * smoothstep(0.0, 0.003, mbTop - mbH)) * mbHere;
}
/**
 * A lid of bone, such as the front of the rib cage, lifted: a part of it between two cuts turns as one piece about the far end. Layers that fold, the skin and the wall of the body, are drawn apart as sheets of their own (see lab-flap-sheet.ts). It returns the place, and the turn that a direction there has made.
 */
bool mbFlap(vec3 p, out vec3 moved, out vec3 axis, out float turned) {
  if (uFlapCount < 0.5 || uLifeFlapOf.z < 0.5) return false;
  for (int i = 0; i < ${FLAP_SLOTS}; i++) {
    if (float(i) >= uFlapCount) break;
    vec4 mbShape = uFlapShape[i];
    if (mbShape.w < 0.5 || mbShape.x <= 0.00001) continue;
    vec3 mbAB = uFlapB[i] - uFlapA[i], mbFromA = p - uFlapA[i];
    float mbT = dot(mbFromA, mbAB) / dot(mbAB, mbAB);
    if (mbT <= 0.0 || mbT >= 1.0) continue;
    float mbOutward = dot(mbFromA, uFlapOut[i]);
    // A leaf of the skull is rounded, and the front of the rib cage is square.
    float mbReach = mbShape.z > 2.5 ? mbShape.y * sqrt(max(0.0, 1.0 - (2.0 * mbT - 1.0) * (2.0 * mbT - 1.0))) : mbShape.y;
    if (mbOutward < -0.0006 || mbOutward > mbReach) continue;
    if (dot(mbFromA, uFlapUp[i]) < -0.001 * mbShape.w) continue;
    axis = normalize(cross(uFlapUp[i], uFlapOut[i]));
    vec3 mbHinge = uFlapA[i] + uFlapOut[i] * mbShape.y;
    moved = mbHinge + mbTurn(p - mbHinge, axis, mbShape.x);
    turned = mbShape.x;
    return true;
  }
  return false;
}
/** How much of sitting up reaches a point: all of it in front of the loin, none behind the hips, and none in the hind legs, which stay on the ground. */
float mbRearShare(vec3 p, float a) {
  if (uLifeRear == 0.0) return 0.0;
  float mbHind = max(mbLeg(p, uLifeHip[2], uLifeFoot[2]), mbLeg(p, uLifeHip[3], uLifeFoot[3]));
  return (1.0 - smoothstep(uLifeBody.y, uLifeBody.w + 0.002, a)) * (1.0 - mbHind);
}
vec3 mbLifeMove(vec3 p, vec3 n) {
  if (uLifeOn < 0.5 || uLifeTaken > 0.5) return uLifeShift;
  vec3 q = p - uLifeOrigin;
  float a = dot(q, uLifeAxis), h = dot(q, uLifeDorsal), l = dot(q, uLifeLateral);
  vec3 d = vec3(0.0);
  vec3 mbFlapped, mbFlapAxis; float mbFlapTurned;
  if (mbFlap(p, mbFlapped, mbFlapAxis, mbFlapTurned)) d += mbFlapped - p;
  if (uLifeKind > 0.5) {
    float side = l < 0.0 ? -1.0 : 1.0;
    if (uLifeKind < 1.5) d += (uLifePivot - p) * uLifeAmount;
    else if (uLifeKind < 2.5) {
      float mbPhase = fract(uLifeBeats - length(p - uLifeHeart) / uLifePulseLength);
      d += n * uLifeAmount * smoothstep(0.0, 0.16, mbPhase) * (1.0 - smoothstep(0.16, 0.6, mbPhase));
    }
    else if (uLifeKind < 3.5) d += n * uLifeAmount * sin(dot(p, vec3(913.0, 677.0, 541.0)) - uLifeGutPhase) * sin(dot(p, vec3(-487.0, 821.0, 390.0)) - 0.7 * uLifeGutPhase + 1.3);
    else if (uLifeKind < 4.5) d += cross(uLifeDorsal, p - uLifePivot - side * uLifeAmount * uLifeLateral) * uLifeWhisk * side;
    else if (uLifeKind < 5.5) d += cross(uLifeAxis, p - uLifePivot - side * uLifeAmount * uLifeLateral) * uLifeEar * side;
    else {
      float mbAlong = max(dot(p - uLifeTailBase, uLifeTailLine), 0.0) / uLifeTailLength;
      d += cross(uLifeDorsal, uLifeTailLine) * uLifeAmount * mbAlong * mbAlong * sin(uLifeTailPhase - 5.0 * mbAlong);
    }
  }
  if (uLifeBreath != 0.0 || uLifePush != 0.0) {
    float mbMid = uLifeBody.y;
    float mbSpine = a < mbMid ? mix(uLifeSpine.x, uLifeSpine.y, clamp((a - uLifeBody.x) / (mbMid - uLifeBody.x), 0.0, 1.0)) : mix(uLifeSpine.y, uLifeSpine.z, clamp((a - mbMid) / (uLifeBody.z - mbMid), 0.0, 1.0));
    float mbRise = smoothstep(uLifeBody.x, uLifeBody.x + 0.006, a) * (1.0 - smoothstep(uLifeBody.z, uLifeBody.w, a));
    float mbReach = length(vec2((h - mbSpine) / uLifeTrunk.x, l / uLifeTrunk.y));
    d += ((h - mbSpine) * uLifeDorsal + l * uLifeLateral) * uLifeBreath * mbRise * (1.0 - smoothstep(1.0, 1.45, mbReach));
    d += uLifeAxis * uLifeAxial * uLifePush * smoothstep(uLifeBody.x, mbMid, a) * (1.0 - smoothstep(mbMid, uLifeBody.w, a));
  }
  if (uLifeNoseMove != 0.0) {
    float mbNear = 1.0 - smoothstep(0.0015, 0.005, length(p - uLifeNose));
    d += uLifeDorsal * uLifeNoseMove * mbNear;
  }
  if (uLifeWalk > 0.0) {
    for (int i = 0; i < 4; i++) {
      float mbOnLeg = mbLeg(p, uLifeHip[i], uLifeFoot[i]);
      if (mbOnLeg > 0.0) {
        d += (cross(uLifeLateral, p - uLifeHip[i]) * uLifeSwing[i] + uLifeDorsal * uLifeLift[i]) * mbOnLeg;
        // Below the middle joint the leg turns about that joint as well, so that it folds as it comes forward.
        vec3 mbJoint = p - uLifeKnee[i];
        float mbBelow = smoothstep(-0.0015, 0.0025, dot(mbJoint, uLifeKnee[i] - uLifeFoot[i]) / -length(uLifeKnee[i] - uLifeFoot[i]));
        if (mbBelow > 0.0) d += (mbTurn(mbJoint, uLifeLateral, uLifeBend[i]) - mbJoint) * mbOnLeg * mbBelow;
      }
    }
    float mbAboveLegs = smoothstep(uLifeGround + 0.008, uLifeGround + 0.016, h);
    d += uLifeDorsal * uLifeBob * mbAboveLegs;
    // The middle of the trunk and the two ends go opposite ways, as a slight curve along the back.
    d += uLifeLateral * uLifeSway * mbAboveLegs * cos(3.14159 * clamp((a - uLifeBody.y) / max(uLifeBody.w - uLifeBody.x, 0.01), -1.0, 1.0));
  }
  if (uLifeStart != 0.0) {
    d += uLifeDorsal * uLifeStart * smoothstep(uLifeGround + 0.003, uLifeGround + 0.01, h);
    d += uLifePokeBy * (1.0 - smoothstep(0.0, 0.008, length(p - uLifePoke)));
  }
  if (uLifeHeld > 0.5) d += uLifeHoldBy * (1.0 - smoothstep(0.0, uLifeHoldReach, length(p - uLifeHoldAt)));
  if (uLifeSplay != 0.0 && (uLifeKind < 3.5 || uLifeKind > 4.5)) {
    // Lying on its back, the legs lie out to the sides. Each turns about the line of the body through its top, and what lies further down the leg follows its end.
    for (int i = 0; i < 4; i++) {
      float mbPaw, mbAngle = mbLegOut(q, i, mbPaw);
      if (mbAngle == 0.0) continue;
      vec3 mbFromHip = p - uLifeHip[i];
      vec3 mbEnd = (uLifeFoot[i] - uLifeHip[i]) + uLifeDorsal * ((uLifeGround + 0.0025) - dot(uLifeFoot[i] - uLifeOrigin, uLifeDorsal));
      vec3 mbLever = mix(mbFromHip, mbEnd, mbPaw);
      d += mbTurn(mbLever, uLifeAxis, mbAngle) - mbLever;
    }
  }
  // Sitting up carries the neck, about which the head turns.
  vec3 mbNeckGone = vec3(0.0);
  if (uLifeRear != 0.0) {
    vec3 mbPivot = uLifeBody.w * uLifeAxis + uLifeRearAt * uLifeDorsal;
    mbNeckGone = mbTurn(-mbPivot, uLifeLateral, -uLifeRear) + mbPivot;
    float mbRear = mbRearShare(p, a);
    if (mbRear > 0.0) {
      vec3 mbFromPivot = q + d - mbPivot;
      d += mbTurn(mbFromPivot, uLifeLateral, -uLifeRear * mbRear) - mbFromPivot;
    }
  }
  float mbHead = mbHeadShare(a, h);
  if (mbHead > 0.0) {
    // The angle grows along the neck and is not a blend of two positions, which would squeeze the skin on the inside of the turn and stretch it on the outside.
    vec3 mbFrom = q + d - mbNeckGone;
    d += mbTurn(mbTurn(mbFrom, uLifeDorsal, uLifeHeadYaw * mbHead), uLifeLateral, uLifeHeadNod * mbHead) - mbFrom;
  }
  return d + uLifeShift;
}
/** A direction at the point p, turned as the head turns it: a hair or the normal of the skin goes round with the skin it belongs to. */
vec3 mbLifeTurnVector(vec3 p, vec3 v) {
  if (uLifeOn < 0.5 || uLifeTaken > 0.5) return v;
  vec3 q = p - uLifeOrigin;
  vec3 mbFlapped, mbFlapAxis; float mbFlapTurned;
  if (mbFlap(p, mbFlapped, mbFlapAxis, mbFlapTurned)) v = mbTurn(v, mbFlapAxis, mbFlapTurned);
  if (uLifeSplay != 0.0 && (uLifeKind < 3.5 || uLifeKind > 4.5)) {
    for (int i = 0; i < 4; i++) {
      float mbPaw, mbAngle = mbLegOut(q, i, mbPaw);
      if (mbAngle != 0.0) v = mbTurn(v, uLifeAxis, mbAngle * (1.0 - mbPaw));
    }
  }
  float mbRear = mbRearShare(p, dot(q, uLifeAxis));
  if (mbRear > 0.0) v = mbTurn(v, uLifeLateral, -uLifeRear * mbRear);
  float mbHead = mbHeadShare(dot(q, uLifeAxis), dot(q, uLifeDorsal));
  if (mbHead <= 0.0) return v;
  return mbTurn(mbTurn(v, uLifeDorsal, uLifeHeadYaw * mbHead), uLifeLateral, uLifeHeadNod * mbHead);
}`;

/** Give a material's program the shared values and the mesh's own. */
export function lifeUniforms(own: LifeMeshUniforms): Record<string, { value: unknown }> {
  return { ...LIFE_SHARED, uLifeKind: own.uLifeKind, uLifeAmount: own.uLifeAmount, uLifePivot: own.uLifePivot, uLifeAxial: own.uLifeAxial, uLifeShift: own.uLifeShift, uLifeTaken: own.uLifeTaken, uLifeHeld: own.uLifeHeld, uLifeFlapOf: own.uLifeFlapOf, uLifeStays: own.uLifeStays };
}
