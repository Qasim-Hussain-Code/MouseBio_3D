import * as THREE from 'three';

/**
 * Display shading hooks for source surfaces. The hooks change pixel appearance
 * only: a view-angle dependent transparency for the body envelope, and a rim
 * highlight for the selected region. Geometry, source identifiers and colours
 * are not modified, and the hooks carry no anatomical or optical measurement.
 */
export interface SurfaceShadingUniforms {
  /** 0 keeps the material's plain opacity; 1 fades surfaces facing the camera to their rims. */
  readonly uGhost: { value: number };
  /** Exponent of the view-angle term used by the ghost fade. */
  readonly uGhostPower: { value: number };
  /** 0 or 1; adds a rim light in uRimColor to mark the selected region. */
  readonly uRim: { value: number };
  readonly uRimColor: { value: THREE.Color };
}

export const SURFACE_PRESENTATION = Object.freeze({
  roughness: 0.52,
  metalness: 0,
  clearcoat: 0.22,
  clearcoatRoughness: 0.4,
  envMapIntensity: 0.9,
  ghostStrength: 0.72,
  ghostPower: 2.2,
  rimColor: '#f3c98c',
});

/**
 * The body surface of a reference is shown as skin: a softer, less glossy
 * response with a pale sheen at grazing angles. These are display values, not
 * measured optical properties of skin.
 */
export const SKIN_PRESENTATION = Object.freeze({
  roughness: 0.62,
  clearcoat: 0.08,
  sheen: 0.55,
  sheenRoughness: 0.5,
  sheenColor: '#ffe2d4',
});

const SHADING_KEY = 'mousebio-surface-shading-v1';

/** Install the shading uniforms on a physically based material. Returns the uniforms for later updates. */
export function installSurfaceShading(material: THREE.MeshStandardMaterial): SurfaceShadingUniforms {
  const existing = surfaceShadingOf(material);
  if (existing) return existing;
  const uniforms: SurfaceShadingUniforms = Object.freeze({
    uGhost: { value: 0 }, uGhostPower: { value: SURFACE_PRESENTATION.ghostPower },
    uRim: { value: 0 }, uRimColor: { value: new THREE.Color(SURFACE_PRESENTATION.rimColor) },
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shadeFragment(shader.fragmentShader);
    if (material.defines?.USE_FIBRE) { shader.vertexShader = fibreVertex(shader.vertexShader); shader.fragmentShader = fibreFragment(shader.fragmentShader); }
  };
  material.customProgramCacheKey = () => SHADING_KEY + (material.defines?.USE_FIBRE ? '-fibre' : '');
  material.userData.surfaceShading = uniforms;
  return uniforms;
}

/**
 * Muscle fibres are suggested by fine stripes along a stored direction, and tendons by a pale colour at the ends of a muscle.
 * The stripes fade before they alias. This is a display convention, not a measured fibre orientation.
 */
export const FIBRE_DISPLAY = Object.freeze({ periodMetres: 0.00017, depth: 0.3, tendon: '#ece4d2' });

export function fibreVertex(vertexShader: string): string {
  const markers = ['#include <common>', '#include <begin_vertex>'];
  if (!markers.every((marker) => vertexShader.includes(marker))) return vertexShader;
  return vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 _fiber;\nvarying vec4 vFibre;\nvarying vec3 vFibrePosition;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFibre = _fiber;\nvFibrePosition = position;');
}

export function fibreFragment(fragmentShader: string): string {
  const markers = ['#include <common>', '#include <color_fragment>'];
  if (!markers.every((marker) => fragmentShader.includes(marker))) return fragmentShader;
  const tendon = new THREE.Color(FIBRE_DISPLAY.tendon);
  return fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec4 vFibre;\nvarying vec3 vFibrePosition;')
    .replace('#include <color_fragment>', [
      '#include <color_fragment>',
      'vec3 mbAlong = normalize(vFibre.xyz);',
      'vec3 mbAcross = normalize(cross(mbAlong, vec3(0.31, 0.57, 0.76)));',
      'vec3 mbOther = cross(mbAlong, mbAcross);',
      `float mbStripe = (dot(vFibrePosition, mbAcross) + 0.6 * dot(vFibrePosition, mbOther)) / ${FIBRE_DISPLAY.periodMetres.toFixed(6)};`,
      'float mbWidth = fwidth(mbStripe);',
      'float mbWave = 0.5 + 0.5 * sin(mbStripe * 6.2831853);',
      `diffuseColor.rgb *= mix(1.0, 1.0 - ${FIBRE_DISPLAY.depth.toFixed(2)} + 2.0 * ${FIBRE_DISPLAY.depth.toFixed(2)} * mbWave * 0.5, 1.0 - smoothstep(0.3, 0.8, mbWidth));`,
      `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${tendon.r.toFixed(3)}, ${tendon.g.toFixed(3)}, ${tendon.b.toFixed(3)}), clamp(vFibre.w, 0.0, 1.0) * 0.85);`,
    ].join('\n'));
}

export function surfaceShadingOf(material: THREE.Material): SurfaceShadingUniforms | null {
  const value = material.userData.surfaceShading;
  return value && typeof value === 'object' && 'uGhost' in value && 'uRim' in value ? value as SurfaceShadingUniforms : null;
}

/**
 * Insert the view-angle terms into the standard fragment program. Both include
 * directives must exist; an unexpected program is returned unchanged so the
 * surface still renders with plain shading.
 */
export function shadeFragment(fragmentShader: string): string {
  const markers = ['#include <common>', '#include <normal_fragment_begin>', '#include <opaque_fragment>'];
  if (!markers.every((marker) => fragmentShader.includes(marker))) return fragmentShader;
  return fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uGhost;\nuniform float uGhostPower;\nuniform float uRim;\nuniform vec3 uRimColor;')
    .replace('#include <normal_fragment_begin>', [
      '#include <normal_fragment_begin>',
      'float mbFacing = clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);',
      'diffuseColor.a *= mix(1.0, pow(mbFacing, uGhostPower), uGhost);',
    ].join('\n'))
    .replace('#include <opaque_fragment>', 'outgoingLight += uRimColor * pow(mbFacing, 3.0) * uRim;\n#include <opaque_fragment>');
}
