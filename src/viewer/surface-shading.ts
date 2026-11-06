import * as THREE from 'three';
import { createLifeMeshUniforms, LIFE_DECLARATIONS, LIFE_MOVE, LIFE_SHARED, type LifeMeshUniforms } from './life-field';

/**
 * Display shading hooks for source surfaces. The hooks change pixel appearance
 * only: a view-angle dependent transparency for the body envelope, and a rim
 * highlight for the selected region. Geometry, source identifiers and colours
 * are not modified, and the hooks carry no anatomical or optical measurement.
 */
export interface SurfaceShadingUniforms extends LifeMeshUniforms {
  /** 0 keeps the material's plain opacity; 1 fades surfaces facing the camera to their rims. */
  readonly uGhost: { value: number };
  /** Exponent of the view-angle term used by the ghost fade. */
  readonly uGhostPower: { value: number };
  /** 0 or 1; adds a rim light in uRimColor to mark the selected region. */
  readonly uRim: { value: number };
  readonly uRimColor: { value: THREE.Color };
  /** 0 or 1; draws the inner side of a surface in flat colour, so that an opened surface reads as solid when cut. */
  readonly uSolidCut: { value: number };
  /** 0 or 1; under a simulated coat, the skin of the belly takes uUnderBelly and the rest keeps the display colour. */
  readonly uCoatOn: { value: number };
  readonly uUnderBelly: { value: THREE.Color };
  /** Opening of the layers: see dissection-window.ts. uWinInvert keeps only the removed part, for a folded layer, and uWinBack returns it to where it lay. */
  readonly uWinOn: { value: number };
  readonly uWinA: { value: THREE.Vector3 };
  readonly uWinB: { value: THREE.Vector3 };
  readonly uWinN: { value: THREE.Vector3 };
  readonly uWinDepth: { value: number };
  readonly uWinFront: { value: number };
  readonly uWinRadius: { value: number };
  readonly uWinInvert: { value: number };
  readonly uWinBack: { value: THREE.Matrix4 };
  /** Nothing nearer to the camera than this is drawn, while the view is going in through the opened layers. Zero turns it off. */
  readonly uWinNear: { value: number };
  /** Colour of the inner side of a surface where it has been opened, if it is not to take the display colour. */
  readonly uInner: { value: THREE.Color };
  readonly uInnerOn: { value: number };
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
    uSolidCut: { value: 0 },
    uCoatOn: { value: 0 }, uUnderBelly: { value: new THREE.Color('#ffffff') },
    uWinOn: { value: 0 }, uWinA: { value: new THREE.Vector3() }, uWinB: { value: new THREE.Vector3() }, uWinN: { value: new THREE.Vector3(0, 0, 1) },
    uWinDepth: { value: 0 }, uWinFront: { value: 0 }, uWinRadius: { value: 0 }, uWinInvert: { value: 0 }, uWinBack: { value: new THREE.Matrix4() }, uWinNear: { value: 0 },
    uInner: { value: new THREE.Color('#ffffff') }, uInnerOn: { value: 0 },
    ...createLifeMeshUniforms(),
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, LIFE_SHARED);
    shader.fragmentShader = windowFragment(shadeFragment(shader.fragmentShader));
    shader.vertexShader = windowVertex(shader.vertexShader);
    if (material.defines?.USE_FIBRE) { shader.vertexShader = fibreVertex(shader.vertexShader); shader.fragmentShader = fibreFragment(shader.fragmentShader); }
    if (material.defines?.USE_COAT) { shader.vertexShader = coatVertex(shader.vertexShader); shader.fragmentShader = coatFragment(shader.fragmentShader); }
  };
  material.customProgramCacheKey = () => SHADING_KEY + (material.defines?.USE_FIBRE ? '-fibre' : '') + (material.defines?.USE_COAT ? '-coat' : '');
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

export function coatVertex(vertexShader: string): string {
  const markers = ['#include <common>', '#include <begin_vertex>'];
  if (!markers.every((marker) => vertexShader.includes(marker))) return vertexShader;
  return vertexShader
    .replace('#include <common>', '#include <common>\nattribute float _coat;\nvarying float vCoat;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoat = _coat;');
}

export function coatFragment(fragmentShader: string): string {
  const markers = ['#include <common>', '#include <color_fragment>'];
  if (!markers.every((marker) => fragmentShader.includes(marker))) return fragmentShader;
  return fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vCoat;\nuniform float uCoatOn;\nuniform vec3 uUnderBelly;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uUnderBelly, uCoatOn * smoothstep(-0.03, 0.03, vCoat));');
}

/** The opening as program text, shared with the drawing that records what is seen. */
export const WINDOW_DECLARATIONS = 'uniform float uWinOn;\nuniform vec3 uWinA;\nuniform vec3 uWinB;\nuniform vec3 uWinN;\nuniform float uWinDepth;\nuniform float uWinFront;\nuniform float uWinRadius;\nuniform float uWinInvert;\nuniform mat4 uWinBack;\nuniform float uWinNear;';
export const WINDOW_TEST = [
  'if (uWinNear > 0.0 && distance(vWinWorld, cameraPosition) < uWinNear) discard;',
  'if (uWinOn > 0.5) {',
  '  vec3 mbFrom = (uWinBack * vec4(vWinWorld, 1.0)).xyz - uWinA;',
  '  float mbDeep = -dot(mbFrom, uWinN);',
  '  vec3 mbAcross = mbFrom + mbDeep * uWinN;',
  '  vec3 mbSeg = uWinB - uWinA;',
  '  float mbAlong = clamp(dot(mbAcross, mbSeg) / max(dot(mbSeg, mbSeg), 1e-14), 0.0, 1.0);',
  '  float mbRho = length(mbAcross - mbSeg * mbAlong);',
  '  bool mbInside = mbRho < uWinRadius && mbDeep < uWinDepth && mbDeep > -uWinFront;',
  '  if (mbInside != (uWinInvert > 0.5)) discard;',
  '  mbWinDistance = abs(mbRho - uWinRadius);',
  '}',
].join('\n');

export function windowVertex(vertexShader: string): string {
  const markers = ['#include <common>', '#include <begin_vertex>'];
  if (!markers.every((marker) => vertexShader.includes(marker))) return vertexShader;
  return vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWinWorld;\n' + LIFE_DECLARATIONS + LIFE_MOVE)
    // The cut belongs to the tissue, so that an opening moves with what it was made in: it is tested where the point lies at rest.
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWinWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\ntransformed += transpose(mat3(modelMatrix)) * mbLifeMove(vWinWorld, normalize(mat3(modelMatrix) * objectNormal));');
}

/** The test of dissection-window.ts in the fragment program. A thin dark line along the cut keeps one layer apart from the next. */
export function windowFragment(fragmentShader: string): string {
  const markers = ['#include <common>', '#include <clipping_planes_fragment>', '#include <color_fragment>'];
  if (!markers.every((marker) => fragmentShader.includes(marker))) return fragmentShader;
  return fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWinWorld;\nfloat mbWinDistance = 1.0;\n' + WINDOW_DECLARATIONS)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + WINDOW_TEST)
    .replace('#include <color_fragment>', '#include <color_fragment>\nif (uWinOn > 0.5) diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.00022, mbWinDistance));');
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
    .replace('#include <common>', '#include <common>\nuniform float uGhost;\nuniform float uGhostPower;\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform float uSolidCut;\nuniform vec3 uInner;\nuniform float uInnerOn;')
    .replace('#include <color_fragment>', '#include <color_fragment>\nif (uInnerOn > 0.5 && !gl_FrontFacing) diffuseColor.rgb = uInner;')
    .replace('#include <normal_fragment_begin>', [
      '#include <normal_fragment_begin>',
      'float mbFacing = clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);',
      'diffuseColor.a *= mix(1.0, pow(mbFacing, uGhostPower), uGhost);',
    ].join('\n'))
    .replace('#include <opaque_fragment>', 'outgoingLight += uRimColor * pow(mbFacing, 3.0) * uRim;\nif (uSolidCut > 0.5 && uInnerOn < 0.5 && !gl_FrontFacing) outgoingLight = diffuseColor.rgb * 0.86;\n#include <opaque_fragment>');
}
