import * as THREE from 'three';

/**
 * The motion of the living mouse as a displacement of every point in world coordinates, the same for skin, hairs, muscles, bones, organs and tokens,
 * so that what lies together moves together and nothing tears. It is an illustration: the sizes of all movements are chosen for viewing.
 *
 * Shared values change every frame and are held once. A mesh has its own kind of motion, on top of what its place in the body gives it.
 */
export const LIFE_KIND = Object.freeze({ none: 0, beat: 1, artery: 2, gut: 3, whisker: 4, ear: 5, tail: 6 });

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
  uLifeBob: { value: 0 },
  /** A poke: where, in which direction and how far the surface is pressed, and how far the whole animal starts. */
  uLifePoke: { value: new THREE.Vector3() },
  uLifePokeBy: { value: new THREE.Vector3() },
  uLifeStart: { value: 0 },
});

/** A mesh's own part of the motion. */
export interface LifeMeshUniforms {
  readonly uLifeKind: { value: number };
  /** How far this mesh moves in its own motion: a share or a length, by kind. */
  readonly uLifeAmount: { value: number };
  readonly uLifePivot: { value: THREE.Vector3 };
  /** 1 if this mesh is pushed along the body by the diaphragm. */
  readonly uLifeAxial: { value: number };
}

export const createLifeMeshUniforms = (): LifeMeshUniforms => ({ uLifeKind: { value: 0 }, uLifeAmount: { value: 0 }, uLifePivot: { value: new THREE.Vector3() }, uLifeAxial: { value: 0 } });

const FOUR: Readonly<Record<string, string>> = { uLifeHip: 'vec3', uLifeFoot: 'vec3', uLifeSwing: 'float', uLifeLift: 'float' };
const TYPES: Readonly<Record<string, string>> = { uLifeOrigin: 'vec3', uLifeAxis: 'vec3', uLifeDorsal: 'vec3', uLifeLateral: 'vec3', uLifeBody: 'vec4', uLifeSpine: 'vec3', uLifeTrunk: 'vec2', uLifeHeart: 'vec3', uLifeTailBase: 'vec3', uLifeTailLine: 'vec3', uLifeNose: 'vec3', uLifePoke: 'vec3', uLifePokeBy: 'vec3' };

export const LIFE_DECLARATIONS = [
  ...Object.keys(LIFE_SHARED).map((name) => FOUR[name] ? `uniform ${FOUR[name]} ${name}[4];` : `uniform ${TYPES[name] ?? 'float'} ${name};`),
  'uniform float uLifeKind;', 'uniform float uLifeAmount;', 'uniform vec3 uLifePivot;', 'uniform float uLifeAxial;',
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
float mbLeg(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return (1.0 - smoothstep(0.0045, 0.0085, length(p - a - ab * t))) * smoothstep(0.0, 0.22, t);
}
vec3 mbLifeMove(vec3 p, vec3 n) {
  if (uLifeOn < 0.5) return vec3(0.0);
  vec3 q = p - uLifeOrigin;
  float a = dot(q, uLifeAxis), h = dot(q, uLifeDorsal), l = dot(q, uLifeLateral);
  vec3 d = vec3(0.0);
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
      if (mbOnLeg > 0.0) d += (cross(uLifeLateral, p - uLifeHip[i]) * uLifeSwing[i] + uLifeDorsal * uLifeLift[i]) * mbOnLeg;
    }
    d += uLifeDorsal * uLifeBob * smoothstep(uLifeGround + 0.008, uLifeGround + 0.016, h);
  }
  if (uLifeStart != 0.0) {
    d += uLifeDorsal * uLifeStart * smoothstep(uLifeGround + 0.003, uLifeGround + 0.01, h);
    d += uLifePokeBy * (1.0 - smoothstep(0.0, 0.008, length(p - uLifePoke)));
  }
  if (uLifeHeadYaw != 0.0 || uLifeHeadNod != 0.0) {
    float mbHead = (1.0 - smoothstep(-0.006, 0.007, a)) * smoothstep(uLifeGround + 0.005, uLifeGround + 0.01, h);
    if (mbHead > 0.0) {
      vec3 mbFrom = q + d;
      d += (mbTurn(mbTurn(mbFrom, uLifeDorsal, uLifeHeadYaw), uLifeLateral, uLifeHeadNod) - mbFrom) * mbHead;
    }
  }
  return d;
}`;

/** Give a material's program the shared values and the mesh's own. */
export function lifeUniforms(own: LifeMeshUniforms): Record<string, { value: unknown }> {
  return { ...LIFE_SHARED, uLifeKind: own.uLifeKind, uLifeAmount: own.uLifeAmount, uLifePivot: own.uLifePivot, uLifeAxial: own.uLifeAxial };
}
