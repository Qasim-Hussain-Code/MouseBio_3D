import * as THREE from 'three';

/**
 * A simulated coat of individual hairs. Hair roots are scattered over the body surface in proportion to
 * area, with a fixed seed, and each hair is a tapered ribbon that turns to face the camera and curves along
 * a stored combing direction. Hair length, density, width and colour are display estimates. The Digimouse
 * specimen is a nude mouse and has no measured coat.
 */
export type CoatId = 'agouti' | 'black' | 'albino' | 'none';

export const COATS: Readonly<Record<Exclude<CoatId, 'none'>, { root: string; band: string; tip: string; belly: string; under: string }>> = Object.freeze({
  agouti: { root: '#4a4239', band: '#857360', tip: '#2e2720', belly: '#c6bba9', under: '#3d362f' },
  black: { root: '#26221f', band: '#1f1b19', tip: '#121010', belly: '#2b2623', under: '#191614' },
  albino: { root: '#e9e3d6', band: '#f6f1e7', tip: '#fffdf8', belly: '#fbf8f0', under: '#e6dfd0' },
});

export const FUR_DISPLAY = Object.freeze({
  /** Hairs per square metre of skin, far fewer than a real coat, each drawn wider than a real hair. */
  density: 46e6,
  maximumHairs: 340000,
  lengthMetres: 0.0029,
  widthMetres: 0.00011,
  segments: 5,
  seed: 19650607,
});

const VERTEX = `
attribute vec3 aRoot;
attribute vec3 aNormal;
attribute vec4 aComb;
attribute float aRandom;
uniform float uLength;
uniform float uWidth;
uniform float uPixel;
varying float vAlong;
varying float vTone;
varying vec3 vTangent;
varying vec3 vNormal;
varying vec3 vView;
#include <clipping_planes_pars_vertex>
void main() {
  float t = position.y;
  float side = position.x;
  float tone = fract(aRandom * 7.13);
  // Guard hairs are longer and fewer than the undercoat.
  float scale = aComb.w * (fract(aRandom * 3.77) > 0.9 ? 1.32 : 0.82 + 0.3 * tone);
  float reach = uLength * scale;
  vec3 lean = normalize(aComb.xyz);
  // The hair leaves the skin at a steep angle and lies down along the coat towards its tip.
  vec3 start = normalize(aNormal * 0.62 + lean * 0.8);
  vec3 end = normalize(aNormal * 0.07 + lean);
  vec3 local = aRoot + reach * (start * t * (1.0 - 0.5 * t) + end * 0.5 * t * t);
  vec3 tangent = normalize(start * (1.0 - t) + end * t);
  vec4 world = modelMatrix * vec4(local, 1.0);
  vec3 worldTangent = normalize(mat3(modelMatrix) * tangent);
  vec3 toCamera = cameraPosition - world.xyz;
  float distanceToCamera = length(toCamera);
  vec3 across = normalize(cross(worldTangent, toCamera));
  float width = max(uWidth, distanceToCamera * uPixel * 0.75) * (1.0 - t * t * 0.85);
  world.xyz += across * side * width * 0.5;
  vAlong = t;
  vTone = tone;
  vTangent = worldTangent;
  vNormal = normalize(mat3(modelMatrix) * aNormal);
  vView = toCamera;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;

const FRAGMENT = `
#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 uRoot;
uniform vec3 uBand;
uniform vec3 uTip;
uniform vec3 uBelly;
uniform vec3 uUp;
varying float vAlong;
varying float vTone;
varying vec3 vTangent;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  #include <clipping_planes_fragment>
  float t = vAlong;
  // Banded hair: dark root, pale band, dark tip.
  vec3 colour = mix(uRoot, uBand, smoothstep(0.2, 0.55, t));
  colour = mix(colour, uTip, smoothstep(0.74 + 0.14 * vTone, 0.98, t));
  vec3 n = normalize(vNormal);
  float ventral = smoothstep(0.08, 0.6, -dot(n, uUp));
  colour = mix(colour, uBelly * mix(0.84, 1.0, smoothstep(0.1, 0.7, t)), ventral);
  colour *= 0.82 + 0.36 * vTone;
  // Darker along the back and paler towards the flanks, as in the wild-type coat.
  colour *= mix(1.0, 0.82, smoothstep(0.35, 0.95, dot(n, uUp)));
  // Light along a hair: strong across it and weak along it, with a soft highlight, in the manner of Kajiya and Kay.
  vec3 tangent = normalize(vTangent);
  vec3 view = normalize(vView);
  vec3 keyLight = normalize(vec3(-0.34, 0.5, 0.8));
  vec3 fillLight = normalize(vec3(0.45, -0.3, 0.45));
  float key = sqrt(max(0.0, 1.0 - pow(dot(tangent, keyLight), 2.0)));
  float fill = sqrt(max(0.0, 1.0 - pow(dot(tangent, fillLight), 2.0)));
  float highlight = pow(sqrt(max(0.0, 1.0 - pow(dot(tangent, normalize(keyLight + view)), 2.0))), 40.0);
  float wrap = 0.5 + 0.5 * dot(n, keyLight);
  // Hairs near the skin sit in the shade of those above them.
  float shade = mix(0.5, 1.0, smoothstep(0.0, 0.6, t));
  vec3 lit = colour * shade * (0.34 + 0.62 * key * wrap + 0.22 * fill) + vec3(0.13) * highlight * wrap * t;
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface FurLayer {
  readonly mesh: THREE.Mesh;
  readonly hairs: number;
  setCoat(id: Exclude<CoatId, 'none'>): void;
  setClipping(planes: THREE.Plane[]): void;
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

export interface HairRoots { readonly roots: Float32Array; readonly normals: Float32Array; readonly combs: Float32Array; readonly randoms: Float32Array; readonly count: number }

/** Scatter hair roots over a surface, in proportion to area, weighted by hair length so that bare skin receives none. */
export function scatterHairs(geometry: THREE.BufferGeometry, density = FUR_DISPLAY.density, maximum = FUR_DISPLAY.maximumHairs, seed = FUR_DISPLAY.seed): HairRoots {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), fur = geometry.getAttribute('_fur');
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
  const roots = new Float32Array(3 * count), normals = new Float32Array(3 * count), combs = new Float32Array(4 * count), randoms = new Float32Array(count);
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
      // A little scatter in the combing direction keeps the coat from looking brushed flat.
      combs[4 * written] = blend(fur, 'getX') + (rng() - 0.5) * 0.34;
      combs[4 * written + 1] = blend(fur, 'getY') + (rng() - 0.5) * 0.34;
      combs[4 * written + 2] = blend(fur, 'getZ') + (rng() - 0.5) * 0.34;
      combs[4 * written + 3] = blend(fur, 'getW');
      randoms[written] = rng();
      written++;
    }
  }
  return { roots, normals, combs, randoms, count: written };
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
export function createFur(skin: THREE.Mesh, up: THREE.Vector3): FurLayer | null {
  const source = skin.geometry;
  if (!hasFurAttribute(source)) return null;
  const hairs = scatterHairs(source);
  const ribbon = hairRibbon(FUR_DISPLAY.segments);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(ribbon.positions, 3));
  geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(hairs.roots, 3));
  geometry.setAttribute('aNormal', new THREE.InstancedBufferAttribute(hairs.normals, 3));
  geometry.setAttribute('aComb', new THREE.InstancedBufferAttribute(hairs.combs, 4));
  geometry.setAttribute('aRandom', new THREE.InstancedBufferAttribute(hairs.randoms, 1));
  geometry.instanceCount = hairs.count;
  // The ribbon's own coordinates say nothing about where hairs lie, so the bounds are those of the skin.
  source.computeBoundingBox();
  source.computeBoundingSphere();
  geometry.boundingBox = source.boundingBox!.clone();
  geometry.boundingSphere = source.boundingSphere!.clone();
  const uniforms = {
    uLength: { value: FUR_DISPLAY.lengthMetres }, uWidth: { value: FUR_DISPLAY.widthMetres }, uPixel: { value: 0.001 },
    uRoot: { value: new THREE.Color() }, uBand: { value: new THREE.Color() }, uTip: { value: new THREE.Color() }, uBelly: { value: new THREE.Color() },
    uUp: { value: up.clone().normalize() },
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
  const layer: FurLayer = {
    mesh,
    hairs: hairs.count,
    setCoat(id) {
      const coat = COATS[id];
      uniforms.uRoot.value.set(coat.root); uniforms.uBand.value.set(coat.band); uniforms.uTip.value.set(coat.tip); uniforms.uBelly.value.set(coat.belly);
    },
    setClipping(planes) { material.clippingPlanes = planes; },
    dispose() { skin.remove(mesh); geometry.dispose(); material.dispose(); },
  };
  layer.setCoat('agouti');
  return layer;
}
