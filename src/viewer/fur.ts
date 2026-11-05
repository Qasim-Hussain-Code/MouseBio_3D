import * as THREE from 'three';

/**
 * A simulated coat drawn by shell texturing: the body surface is repeated at growing
 * offsets along its normals, combed along a per-vertex direction, and each layer keeps
 * only the pixels inside a hair. Hair length, density and colour are display estimates.
 * The Digimouse specimen is a nude mouse and has no measured coat.
 */
export type CoatId = 'agouti' | 'black' | 'albino' | 'none';

export const COATS: Readonly<Record<Exclude<CoatId, 'none'>, { root: string; band: string; tip: string; belly: string }>> = Object.freeze({
  agouti: { root: '#3a3531', band: '#6f5f4e', tip: '#2b2521', belly: '#b3a896' },
  black: { root: '#2a2624', band: '#231f1d', tip: '#141211', belly: '#2b2725' },
  albino: { root: '#f1ece2', band: '#f8f4ec', tip: '#fffdf8', belly: '#fbf8f1' },
});

export const FUR_DISPLAY = Object.freeze({ shells: 28, lengthMetres: 0.003, cellMetres: 0.00012 });

const VERTEX = `
attribute vec4 _fur;
attribute float aShell;
uniform float uLength;
varying vec3 vBase;
varying float vShell;
varying float vHair;
varying vec3 vNormal;
varying vec3 vView;
#include <clipping_planes_pars_vertex>
void main() {
  vec3 comb = _fur.xyz;
  float s = aShell;
  // Hairs rise from the skin and lean further along the combing direction towards their tips.
  vec3 direction = normalize(normal * (1.0 - 0.55 * s) + comb * (0.55 + 0.75 * s));
  vec3 transformed = position + direction * uLength * _fur.w * s;
  vBase = position;
  vShell = s;
  vHair = _fur.w;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vView = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;

const FRAGMENT = `
#include <common>
#include <clipping_planes_pars_fragment>
uniform float uCell;
uniform vec3 uRoot;
uniform vec3 uBand;
uniform vec3 uTip;
uniform vec3 uBelly;
uniform vec3 uUp;
varying vec3 vBase;
varying float vShell;
varying float vHair;
varying vec3 vNormal;
varying vec3 vView;
float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  #include <clipping_planes_fragment>
  if (vHair < 0.04) discard;
  vec3 q = vBase / uCell;
  vec3 cell = floor(q);
  vec3 f = q - cell;
  vec3 centre = vec3(hash(cell), hash(cell + 11.0), hash(cell + 23.0));
  float hairLength = 0.55 + 0.45 * hash(cell + 31.0);
  float t = vShell / hairLength;
  if (t > 1.0) discard;
  float d = length(f - centre);
  float radius = 0.86 * (1.0 - t * t * 0.92) + 0.08;
  float soft = max(fwidth(d), 0.02);
  float coverage = smoothstep(radius + soft, radius - soft, d);
  if (coverage < 0.04) discard;
  // Banded hair: dark root, pale band, dark tip.
  float tone = hash(cell + 47.0);
  vec3 colour = mix(uRoot, uBand, smoothstep(0.25, 0.62, t));
  colour = mix(colour, uTip, smoothstep(0.76 + 0.12 * tone, 0.98, t));
  float ventral = smoothstep(0.1, 0.62, -dot(normalize(vNormal), uUp));
  colour = mix(colour, uBelly * mix(0.82, 1.0, smoothstep(0.1, 0.8, t)), ventral);
  colour *= 0.86 + 0.28 * tone;
  // Darker along the back and paler towards the flanks, as in the wild-type coat.
  colour *= mix(1.0, 0.8, smoothstep(0.35, 0.95, dot(normalize(vNormal), uUp)));
  // Roots sit in the shade of the hair above them, and the light wraps round the coat.
  vec3 n = normalize(vNormal);
  vec3 light = normalize(uUp * 0.85 + vec3(0.25, -0.35, 0.0));
  float wrap = 0.55 + 0.45 * dot(n, light);
  float occlusion = mix(0.42, 1.0, smoothstep(0.0, 0.8, vShell));
  vec3 view = normalize(vView);
  float rim = pow(1.0 - abs(dot(normalize(mat3(viewMatrix) * n), view)), 2.5);
  gl_FragColor = vec4(colour * (0.34 + 0.86 * wrap) * occlusion + colour * rim * 0.35, coverage);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface FurLayer {
  readonly mesh: THREE.Mesh;
  setCoat(id: Exclude<CoatId, 'none'>): void;
  setClipping(planes: THREE.Plane[]): void;
  dispose(): void;
}

/** Whether a body surface carries the per-vertex combing and length attribute. */
export function hasFurAttribute(geometry: THREE.BufferGeometry): boolean {
  return geometry.getAttribute('_fur')?.itemSize === 4;
}

/** Fur shells as a child of the skin mesh. The skin geometry stays owned by the skin mesh. */
export function createFur(skin: THREE.Mesh, up: THREE.Vector3): FurLayer | null {
  const source = skin.geometry;
  if (!hasFurAttribute(source)) return null;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(source.getIndex());
  for (const name of ['position', 'normal', '_fur']) geometry.setAttribute(name, source.getAttribute(name));
  const shells = new Float32Array(FUR_DISPLAY.shells);
  for (let i = 0; i < shells.length; i++) shells[i] = (i + 1) / shells.length;
  geometry.setAttribute('aShell', new THREE.InstancedBufferAttribute(shells, 1));
  geometry.instanceCount = shells.length;
  const uniforms = {
    uLength: { value: FUR_DISPLAY.lengthMetres }, uCell: { value: FUR_DISPLAY.cellMetres },
    uRoot: { value: new THREE.Color() }, uBand: { value: new THREE.Color() }, uTip: { value: new THREE.Color() }, uBelly: { value: new THREE.Color() },
    uUp: { value: up.clone().normalize() },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, side: THREE.FrontSide, clipping: true, alphaToCoverage: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'simulated-coat';
  skin.add(mesh);
  const layer: FurLayer = {
    mesh,
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
