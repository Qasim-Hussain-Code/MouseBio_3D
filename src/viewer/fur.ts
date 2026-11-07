import * as THREE from 'three';
import { createLifeMeshUniforms, FLAP_OVER, LIFE_DECLARATIONS, LIFE_MOVE, lifeUniforms, type LifeMeshUniforms } from './life-field';
import { CUT_SHARED } from './cut-uniforms';

/** How many straight lengths of the coat can be parted at one time. */
const BARE_LINES = 4;

/**
 * A simulated coat of individual hairs. Hair roots are scattered over the body surface in proportion to
 * area, with a fixed seed, and each hair is a tapered ribbon that turns to face the camera and curves along
 * a stored combing direction. Hair length, density, width and colour are display estimates. The Digimouse
 * specimen is a nude mouse and has no measured coat. The skin colours that go with each coat are also estimates:
 * pigmented mice have darker ears and tails than albino mice, whose skin is pink.
 */
export type CoatId = 'agouti' | 'black' | 'albino' | 'none';

interface CoatColours {
  readonly root: string; readonly band: string; readonly tip: string; readonly belly: string;
  /** The skin seen between hairs, on the back and flanks and on the belly. */
  readonly under: string; readonly underBelly: string;
  /** Bare or thinly haired parts, by structure id. */
  readonly parts: Readonly<Record<string, string>>;
}

export const COATS: Readonly<Record<Exclude<CoatId, 'none'>, CoatColours>> = Object.freeze({
  agouti: {
    root: '#4f4840', band: '#8e7c66', tip: '#2f2820', belly: '#c9bfae', under: '#74675a', underBelly: '#b4a999',
    parts: { 'living:pinnae': '#a08a7e', 'living:tail': '#8f796c', 'living:forepaws': '#d3b6a9', 'living:hindpaws': '#d0b3a6', 'living:nose': '#b58a80' },
  },
  black: {
    root: '#2a2623', band: '#211d1b', tip: '#141211', belly: '#2e2926', under: '#1c1917', underBelly: '#26211e',
    parts: { 'living:pinnae': '#453d3a', 'living:tail': '#3f3734', 'living:forepaws': '#645853', 'living:hindpaws': '#645853', 'living:nose': '#4d413d' },
  },
  albino: {
    root: '#efe9dc', band: '#f8f3ea', tip: '#fffdf9', belly: '#fcf9f2', under: '#efe3d6', underBelly: '#f3e7db',
    parts: { 'living:pinnae': '#f0bdb1', 'living:tail': '#f0bcae', 'living:forepaws': '#f3c3b6', 'living:hindpaws': '#f3c3b6', 'living:nose': '#f0a9a0' },
  },
});

export const FUR_DISPLAY = Object.freeze({
  /**
   * Hairs per square metre of skin, far fewer than a real coat, each drawn wider than a real hair.
   * The roots are shuffled by the order of their random values, so that drawing a share of them still covers the whole body.
   */
  density: 70e6,
  maximumHairs: 520000,
  lengthMetres: 0.0029,
  widthMetres: 0.000085,
  segments: 5,
  seed: 19650607,
});

export interface FurOptions {
  readonly density?: number;
  readonly width?: number;
  readonly seed?: number;
  /** Fine hair takes the colour that the coat gives this structure, and not the bands of the coat. */
  readonly part?: string;
  /** The motion of the part of the body that this hair grows on. */
  readonly life?: LifeMeshUniforms;
}

/** Fine hair on parts other than the body. The tail is sparsely haired. These are display estimates. */
const FINE_HAIR: Readonly<Record<string, FurOptions>> = Object.freeze({
  'living:pinnae': { density: 40e6, width: 0.6, seed: 19650608, part: 'living:pinnae' },
  'living:forepaws': { density: 60e6, width: 0.55, seed: 19650609, part: 'living:forepaws' },
  'living:hindpaws': { density: 60e6, width: 0.55, seed: 19650610, part: 'living:hindpaws' },
  'living:tail': { density: 7e6, width: 0.7, seed: 19650611, part: 'living:tail' },
});
export const fineHairOptions = (id: string): FurOptions => FINE_HAIR[id] ?? { density: 30e6, width: 0.7 };

const VERTEX = `
attribute vec3 aRoot;
attribute vec3 aNormal;
attribute vec4 aComb;
attribute float aRandom;
attribute float aCoat;
uniform float uLength;
uniform float uWidth;
uniform float uPixel;
uniform float uWinOn;
uniform vec3 uWinA;
uniform vec3 uWinB;
uniform vec3 uWinN;
uniform float uWinDepth;
uniform float uWinFront;
uniform float uWinRadius;
uniform float uCutOn;
uniform mat4 uCutToTexture;
uniform highp sampler3D uCutSkin;
uniform float uBareCount;
uniform vec3 uBareA[${BARE_LINES}];
uniform vec3 uBareB[${BARE_LINES}];
uniform vec3 uBareOut[${BARE_LINES}];
uniform float uBareWidth;
${LIFE_DECLARATIONS}
${FLAP_OVER}
${LIFE_MOVE}
varying float vAlong;
varying float vTone;
varying float vVentral;
varying float vDorsal;
varying float vShort;
varying vec3 vTangent;
varying vec3 vNormal;
varying vec3 vView;
#include <clipping_planes_pars_vertex>
void main() {
  float t = position.y;
  float side = position.x;
  float tone = fract(aRandom * 7.13);
  // Guard hairs are longer and fewer than the undercoat.
  float scale = aComb.w * (fract(aRandom * 3.77) > 0.9 ? 1.2 : 0.82 + 0.26 * tone);
  float reach = uLength * scale;
  vec3 lean = normalize(aComb.xyz);
  // The hair leaves the skin at a steep angle and lies down along the coat towards its tip.
  vec3 start = normalize(aNormal * 0.46 + lean * 0.88);
  vec3 end = normalize(aNormal * 0.03 + lean);
  // With the skin opened its inner side can be seen, and a hair root lying exactly on the surface would show through it.
  vec3 local = aRoot + aNormal * (uWinOn > 0.5 ? 0.00006 : 0.0) + reach * (start * t * (1.0 - 0.5 * t) + end * 0.5 * t * t);
  vec3 tangent = normalize(start * (1.0 - t) + end * t);
  vec4 world = modelMatrix * vec4(local, 1.0);
  vec3 rootWorld = (modelMatrix * vec4(aRoot, 1.0)).xyz;
  vec3 restNormal = normalize(mat3(modelMatrix) * aNormal);
  // Each point of a hair moves as the tissue at that point moves, so that a hair turns with the skin it grows from and does not sink into it or stand off it.
  world.xyz += mbLifeMove(world.xyz, restNormal);
  vec3 worldTangent = normalize(mbLifeTurnVector(rootWorld, mat3(modelMatrix) * tangent));
  vec3 toCamera = cameraPosition - world.xyz;
  float distanceToCamera = length(toCamera);
  vec3 across = normalize(cross(worldTangent, toCamera));
  float width = max(uWidth, distanceToCamera * uPixel * 0.75) * pow(1.0 - t, 0.7);
  world.xyz += across * side * width * 0.5;
  vAlong = t;
  vTone = tone;
  // Each hair is pale or dark on its own, so that the border along the flank is diffuse and has no line.
  vVentral = smoothstep(-0.012, 0.012, aCoat + (fract(aRandom * 5.31) - 0.5) * 0.09);
  vDorsal = smoothstep(0.1, 0.42, -aCoat);
  vShort = 1.0 - smoothstep(0.25, 0.7, aComb.w);
  vTangent = worldTangent;
  vNormal = normalize(mbLifeTurnVector(rootWorld, restNormal));
  vView = toCamera;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  // A hair rooted in an opened part of the skin goes with it.
  if (uWinOn > 0.5) {
    vec3 from = (modelMatrix * vec4(aRoot, 1.0)).xyz - uWinA;
    float deep = -dot(from, uWinN);
    vec3 flatFrom = from + deep * uWinN;
    vec3 seg = uWinB - uWinA;
    float along = clamp(dot(flatFrom, seg) / max(dot(seg, seg), 1e-14), 0.0, 1.0);
    if (length(flatFrom - seg * along) < uWinRadius && deep < uWinDepth && deep > -uWinFront) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
  // Along a line that is to be cut, the fur is parted to show the skin. It is only moved out of the way here, and the coat itself stays as it is.
  for (int i = 0; i < ${BARE_LINES}; i++) {
    if (float(i) >= uBareCount) break;
    vec3 mbAlong = uBareB[i] - uBareA[i];
    float mbK = clamp(dot(rootWorld - uBareA[i], mbAlong) / dot(mbAlong, mbAlong), 0.0, 1.0);
    // Over a curved body a straight line runs under the skin, so the distance is taken across the skin. The far side of the body is not parted. The edge is uneven, as hair parts.
    vec3 mbFrom = rootWorld - uBareA[i] - mbAlong * mbK;
    float mbOutward = dot(mbFrom, uBareOut[i]);
    if (mbOutward > -0.007 && length(mbFrom - uBareOut[i] * mbOutward) < uBareWidth * (0.72 + 0.56 * fract(aRoot.x * 91173.0 + aRoot.y * 37411.0))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
  // A hair on skin that has been drawn back lies under it, and is not drawn. Nor is one rooted in skin that has been cut away.
  if (uCutOn > 0.5 && mbFlapOver(rootWorld, vec3(1.0, 0.0, 0.0))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  if (uCutOn > 0.5) {
    vec3 mbCutAt = (uCutToTexture * vec4(rootWorld, 1.0)).xyz;
    if (all(greaterThan(mbCutAt, vec3(0.0))) && all(lessThan(mbCutAt, vec3(1.0))) && textureLod(uCutSkin, mbCutAt, 0.0).r > 0.42) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
  #include <clipping_planes_vertex>
}`;

const FRAGMENT = `
#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 uRoot;
uniform vec3 uBand;
uniform vec3 uTip;
uniform vec3 uBelly;
uniform vec3 uFurKey;
uniform vec3 uFurFill;
varying float vAlong;
varying float vTone;
varying float vVentral;
varying float vDorsal;
varying float vShort;
varying vec3 vTangent;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  #include <clipping_planes_fragment>
  float t = vAlong;
  // Banded hair: dark root, pale band, dark tip.
  vec3 colour = mix(uRoot, uBand, smoothstep(0.22, 0.52, t));
  colour = mix(colour, uTip, smoothstep(0.72 + 0.16 * vTone, 0.97, t));
  vec3 pale = mix(uRoot * 1.15, uBelly, smoothstep(0.12, 0.55, t));
  // Short hair shows no dark root or tip.
  colour = mix(colour, uBand, vShort * 0.85);
  pale = mix(pale, uBelly, vShort);
  vec3 n = normalize(vNormal);
  colour = mix(colour, pale, vVentral);
  colour *= 0.84 + 0.32 * vTone;
  // Darker along the back and paler towards the flanks, as in the wild-type coat.
  colour *= mix(1.0, 0.8, vDorsal);
  // Light along a hair: strong across it and weak along it, with a soft highlight, in the manner of Kajiya and Kay.
  vec3 tangent = normalize(vTangent);
  vec3 view = normalize(vView);
  vec3 keyLight = uFurKey;
  vec3 fillLight = uFurFill;
  float key = sqrt(max(0.0, 1.0 - pow(dot(tangent, keyLight), 2.0)));
  float fill = sqrt(max(0.0, 1.0 - pow(dot(tangent, fillLight), 2.0)));
  float highlight = pow(sqrt(max(0.0, 1.0 - pow(dot(tangent, normalize(keyLight + view)), 2.0))), 10.0);
  float wrap = 0.5 + 0.5 * dot(n, keyLight);
  // Hairs near the skin sit in the shade of those above them.
  float shade = mix(mix(0.5, 0.86, vShort), 1.0, smoothstep(0.0, 0.6, t));
  // Fine tips against the light soften the outline.
  float rim = pow(1.0 - abs(dot(n, view)), 3.0);
  vec3 lit = colour * shade * (0.34 + 0.62 * key * wrap + 0.22 * fill) + vec3(0.06) * highlight * wrap * t + (colour + vec3(0.16)) * rim * 0.24 * t;
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const KEY_LIGHT = new THREE.Vector3(-0.34, 0.5, 0.8).normalize(), FILL_LIGHT = new THREE.Vector3(0.45, -0.3, 0.45).normalize();
const FUR_LIGHTS = Object.freeze({ uFurKey: { value: KEY_LIGHT.clone() }, uFurFill: { value: FILL_LIGHT.clone() } });

/** The lights stand in the room, so as the mouse turns on the floor they turn about it the other way, in the model's own coordinates. */
export function turnFurLights(turn: THREE.Quaternion) {
  FUR_LIGHTS.uFurKey.value.copy(KEY_LIGHT).applyQuaternion(turn);
  FUR_LIGHTS.uFurFill.value.copy(FILL_LIGHT).applyQuaternion(turn);
}

const FUR_BARE = Object.freeze({ uBareCount: { value: 0 }, uBareA: { value: Array.from({ length: BARE_LINES }, () => new THREE.Vector3()) }, uBareB: { value: Array.from({ length: BARE_LINES }, () => new THREE.Vector3()) }, uBareOut: { value: Array.from({ length: BARE_LINES }, () => new THREE.Vector3(0, 0, 1)) }, uBareWidth: { value: 0.0022 } });

/** A straight length to part the fur along, as points of the model at rest, and the way out of the skin there. */
export type PartedLine = readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];

/** Part the fur along these lengths. Those beyond the fourth are left out. */
export function partFur(lines: readonly PartedLine[]) {
  const count = Math.min(lines.length, BARE_LINES);
  for (let index = 0; index < count; index++) { FUR_BARE.uBareA.value[index].copy(lines[index][0]); FUR_BARE.uBareB.value[index].copy(lines[index][1]); FUR_BARE.uBareOut.value[index].copy(lines[index][2]); }
  FUR_BARE.uBareCount.value = count;
}

export interface FurLayer {
  readonly mesh: THREE.Mesh;
  readonly hairs: number;
  /** The share of hairs drawn, from above zero to one. Fewer hairs are drawn wider so that the coat stays closed. */
  setDetail(fraction: number): void;
  readonly detail: () => number;
  setCoat(id: Exclude<CoatId, 'none'>): void;
  setClipping(planes: THREE.Plane[]): void;
  /** Hairs rooted where the skin has been cut are not drawn. The first channel of this texture holds the cuts in the skin. */
  setCut(texture: THREE.Data3DTexture | null): void;
  /** Hairs rooted in the opened part of the skin are not drawn. */
  setWindow(window: { a: THREE.Vector3; b: THREE.Vector3; normal: THREE.Vector3; depth: number; front: number; radius: number } | null): void;
  dispose(): void;
}

/** Whether a body surface carries the per-vertex combing and length attribute. */
export function hasFurAttribute(geometry: THREE.BufferGeometry): boolean {
  return geometry.getAttribute('_fur')?.itemSize === 4 && geometry.getIndex() !== null;
}

/** Deterministic numbers, so that the coat is the same on every load. */
function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
}

export interface HairRoots { readonly roots: Float32Array; readonly normals: Float32Array; readonly combs: Float32Array; readonly randoms: Float32Array; readonly coats: Float32Array; readonly count: number }

/** A smooth field over the skin, about 1.6 mm across, so that neighbouring hairs lean together in small tufts. */
function tuft(x: number, y: number, z: number, phase: number): number {
  return Math.sin(3900 * y + phase + 1.3 * Math.sin(5300 * z + phase)) * Math.cos(3100 * x - phase + 1.1 * Math.sin(4700 * y));
}

/** Scatter hair roots over a surface, in proportion to area, weighted by hair length so that bare skin receives none. */
export function scatterHairs(geometry: THREE.BufferGeometry, density: number = FUR_DISPLAY.density, maximum: number = FUR_DISPLAY.maximumHairs, seed: number = FUR_DISPLAY.seed): HairRoots {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), fur = geometry.getAttribute('_fur'), coat = geometry.getAttribute('_coat');
  const index = geometry.getIndex()!;
  const rng = random(seed);
  const triangles = index.count / 3;
  const areas = new Float32Array(triangles);
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < triangles; t++) {
    const i0 = index.getX(3 * t), i1 = index.getX(3 * t + 1), i2 = index.getX(3 * t + 2);
    a.fromBufferAttribute(position, i0); b.fromBufferAttribute(position, i1); c.fromBufferAttribute(position, i2);
    const lengthFactor = (fur.getW(i0) + fur.getW(i1) + fur.getW(i2)) / 3;
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    areas[t] = lengthFactor < 0.03 ? 0 : area;
    total += areas[t];
  }
  const count = Math.min(maximum, Math.round(total * density));
  const roots = new Float32Array(3 * count), normals = new Float32Array(3 * count), combs = new Float32Array(4 * count), randoms = new Float32Array(count), coats = new Float32Array(count);
  const rate = count / (total || 1);
  let written = 0, carry = 0;
  for (let t = 0; t < triangles && written < count; t++) {
    carry += areas[t] * rate;
    const i0 = index.getX(3 * t), i1 = index.getX(3 * t + 1), i2 = index.getX(3 * t + 2);
    while (carry >= 1 && written < count) {
      carry -= 1;
      let u = rng(), v = rng();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w = 1 - u - v;
      const blend = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, component: 'getX' | 'getY' | 'getZ' | 'getW') => w * attribute[component](i0) + u * attribute[component](i1) + v * attribute[component](i2);
      roots[3 * written] = blend(position, 'getX'); roots[3 * written + 1] = blend(position, 'getY'); roots[3 * written + 2] = blend(position, 'getZ');
      normals[3 * written] = blend(normal, 'getX'); normals[3 * written + 1] = blend(normal, 'getY'); normals[3 * written + 2] = blend(normal, 'getZ');
      // Tufts and a little scatter in the combing direction keep the coat from looking brushed flat.
      const rx = roots[3 * written], ry = roots[3 * written + 1], rz = roots[3 * written + 2];
      combs[4 * written] = blend(fur, 'getX') + 0.24 * tuft(rx, ry, rz, 0.7) + (rng() - 0.5) * 0.18;
      combs[4 * written + 1] = blend(fur, 'getY') + 0.24 * tuft(rx, ry, rz, 2.1) + (rng() - 0.5) * 0.18;
      combs[4 * written + 2] = blend(fur, 'getZ') + 0.24 * tuft(rx, ry, rz, 4.3) + (rng() - 0.5) * 0.18;
      combs[4 * written + 3] = blend(fur, 'getW') * (1 + 0.1 * tuft(rx, ry, rz, 5.2));
      coats[written] = coat ? blend(coat, 'getX') : 0;
      randoms[written] = rng();
      written++;
    }
  }
  // Shuffle with the same numbers, so that the first hairs drawn are spread over the whole body.
  for (let i = written - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    for (let k = 0; k < 3; k++) { let t = roots[3 * i + k]; roots[3 * i + k] = roots[3 * j + k]; roots[3 * j + k] = t; t = normals[3 * i + k]; normals[3 * i + k] = normals[3 * j + k]; normals[3 * j + k] = t; }
    for (let k = 0; k < 4; k++) { const t = combs[4 * i + k]; combs[4 * i + k] = combs[4 * j + k]; combs[4 * j + k] = t; }
    const t = randoms[i]; randoms[i] = randoms[j]; randoms[j] = t;
    const c = coats[i]; coats[i] = coats[j]; coats[j] = c;
  }
  return { roots, normals, combs, randoms, coats, count: written };
}

/** The ribbon every hair shares: x is the side, from -1 to 1, and y runs from root to tip. */
function hairRibbon(segments: number): { positions: Float32Array; indices: Uint16Array } {
  const positions = new Float32Array(3 * 2 * (segments + 1));
  const indices = new Uint16Array(6 * segments);
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    positions.set([-1, t, 0, 1, t, 0], 6 * s);
    if (s < segments) indices.set([2 * s, 2 * s + 1, 2 * s + 2, 2 * s + 1, 2 * s + 3, 2 * s + 2], 6 * s);
  }
  return { positions, indices };
}

/** Hairs as a child of the skin mesh. The skin geometry stays owned by the skin mesh. */
export function createFur(skin: THREE.Mesh, options: FurOptions = {}): FurLayer | null {
  const source = skin.geometry;
  if (!hasFurAttribute(source)) return null;
  const hairs = scatterHairs(source, options.density ?? FUR_DISPLAY.density, FUR_DISPLAY.maximumHairs, options.seed ?? FUR_DISPLAY.seed);
  const baseWidth = FUR_DISPLAY.widthMetres * (options.width ?? 1);
  const ribbon = hairRibbon(FUR_DISPLAY.segments);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(ribbon.positions, 3));
  geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(hairs.roots, 3));
  geometry.setAttribute('aNormal', new THREE.InstancedBufferAttribute(hairs.normals, 3));
  geometry.setAttribute('aComb', new THREE.InstancedBufferAttribute(hairs.combs, 4));
  geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(hairs.randoms, 1));
  geometry.setAttribute('aCoat', new THREE.InstancedBufferAttribute(hairs.coats, 1));
  geometry.instanceCount = hairs.count;
  // The ribbon's own coordinates say nothing about where hairs lie, so the bounds are those of the skin.
  source.computeBoundingBox();
  source.computeBoundingSphere();
  geometry.boundingBox = source.boundingBox!.clone();
  geometry.boundingSphere = source.boundingSphere!.clone();
  const uniforms = {
    uLength: { value: FUR_DISPLAY.lengthMetres }, uWidth: { value: baseWidth as number }, uPixel: { value: 0.001 },
    uRoot: { value: new THREE.Color() }, uBand: { value: new THREE.Color() }, uTip: { value: new THREE.Color() }, uBelly: { value: new THREE.Color() },
    uWinOn: { value: 0 }, uWinA: { value: new THREE.Vector3() }, uWinB: { value: new THREE.Vector3() }, uWinN: { value: new THREE.Vector3(0, 0, 1) }, uWinDepth: { value: 0 }, uWinFront: { value: 0 }, uWinRadius: { value: 0 },
    ...lifeUniforms(options.life ?? createLifeMeshUniforms()), ...FUR_LIGHTS, ...CUT_SHARED, ...FUR_BARE, uCutSkin: { value: null as THREE.Data3DTexture | null },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, side: THREE.DoubleSide, clipping: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'simulated-coat';
  // The width of a pixel at unit distance, so that distant hairs stay at least about a pixel wide.
  const size = new THREE.Vector2();
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getSize(size);
    if (camera instanceof THREE.PerspectiveCamera) uniforms.uPixel.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, size.y);
  };
  skin.add(mesh);
  let detail = 1;
  const layer: FurLayer = {
    mesh,
    hairs: hairs.count,
    detail: () => detail,
    setDetail(fraction) {
      detail = Math.max(0.05, Math.min(1, fraction));
      geometry.instanceCount = Math.round(hairs.count * detail);
      uniforms.uWidth.value = baseWidth / Math.sqrt(detail);
    },
    setCoat(id) {
      const coat = COATS[id];
      const fine = options.part ? coat.parts[options.part] : undefined;
      if (fine) {
        // The fine hair of a paw is pale, like the fur of the limb it runs on from, more than it is the colour of the skin under it.
        const base = new THREE.Color(fine);
        if (options.part === 'living:forepaws' || options.part === 'living:hindpaws') base.lerp(new THREE.Color(coat.belly), 0.62);
        uniforms.uRoot.value.copy(base).multiplyScalar(0.82); uniforms.uBand.value.copy(base).multiplyScalar(1.04);
        uniforms.uTip.value.copy(base).multiplyScalar(0.92); uniforms.uBelly.value.copy(base).multiplyScalar(1.08);
      } else {
        uniforms.uRoot.value.set(coat.root); uniforms.uBand.value.set(coat.band); uniforms.uTip.value.set(coat.tip); uniforms.uBelly.value.set(coat.belly);
      }
    },
    setClipping(planes) { material.clippingPlanes = planes; },
    setCut(texture) { uniforms.uCutSkin.value = texture; },
    setWindow(window) {
      uniforms.uWinOn.value = window ? 1 : 0;
      if (window) { uniforms.uWinA.value.copy(window.a); uniforms.uWinB.value.copy(window.b); uniforms.uWinN.value.copy(window.normal); uniforms.uWinDepth.value = window.depth; uniforms.uWinFront.value = window.front; uniforms.uWinRadius.value = window.radius; }
    },
    dispose() { skin.remove(mesh); geometry.dispose(); material.dispose(); },
  };
  layer.setCoat('agouti');
  return layer;
}
