import * as THREE from 'three';
import { FLAP_OVER, FLAP_SLOTS, HINGE_STATIONS } from './life-field';

/** The table of fold lines: a row for each flap, with four numbers at each place along the cut. See FLAP_OVER. */
export const FLAP_HINGES = new Float32Array(FLAP_SLOTS * HINGE_STATIONS * 4);
const hingeTable = new THREE.DataTexture(FLAP_HINGES, HINGE_STATIONS, FLAP_SLOTS, THREE.RGBAFormat, THREE.FloatType);
hingeTable.minFilter = THREE.NearestFilter;
hingeTable.magFilter = THREE.NearestFilter;
hingeTable.needsUpdate = true;

/**
 * The cuts of a practice dissection, as seen by the programs that draw the model. Everything is off until a dissection begins, and costs one test per drawn point while it is on.
 * The values are in the coordinates of the model at rest, as the openings of the layers are, so that a cut stays on the tissue. See domain/cut-field.ts.
 */
export const CUT_SHARED = Object.freeze({
  uCutOn: { value: 0 },
  /** From the model at rest to the texture of the grid, where the grid runs from 0 to 1 along each axis. */
  uCutToTexture: { value: new THREE.Matrix4() },
  uFlapHinge: { value: hingeTable },
  /** Whether a lid of bone stands open, and what a pixel of the view measures at unit distance. */
  uLidsOpen: { value: 0 },
  uCutPixel: { value: 0 },
});

/** A mesh's part: which texture and which channel of it hold the cuts of its layer, and, for the mark that lets the inside be seen, whether to keep only what is cut. */
export interface CutMeshUniforms {
  readonly uCutVolume: { value: THREE.Data3DTexture | null };
  readonly uCutChannel: { value: THREE.Vector4 };
  readonly uCutInvert: { value: number };
}

export const createCutMeshUniforms = (): CutMeshUniforms => ({ uCutVolume: { value: null }, uCutChannel: { value: new THREE.Vector4(1, 0, 0, 0) }, uCutInvert: { value: 0 } });

/** In the fragment program, once the point at rest is known. `mbCutEdge` tells how near the edge of a cut it lies, for shading. */
export const CUT_DECLARATIONS = `uniform float uCutOn;
uniform float uLidsOpen;
uniform float uCutPixel;
uniform mat4 uCutToTexture;
uniform highp sampler3D uCutVolume;
uniform vec4 uCutChannel;
uniform float uCutInvert;
uniform float uFlapCount;
uniform vec3 uFlapA[${FLAP_SLOTS}];
uniform vec3 uFlapB[${FLAP_SLOTS}];
uniform vec3 uFlapOut[${FLAP_SLOTS}];
uniform vec3 uFlapUp[${FLAP_SLOTS}];
uniform vec4 uFlapShape[${FLAP_SLOTS}];
uniform vec3 uLifeFlapOf;
float mbCutEdge = 0.0;
${FLAP_OVER}`;

export const CUT_TEST = `if (uCutOn > 0.5) {
  vec3 mbCutAt = (uCutToTexture * vec4(vWinWorld, 1.0)).xyz;
  bool mbInGrid = all(greaterThan(mbCutAt, vec3(0.0))) && all(lessThan(mbCutAt, vec3(1.0)));
  mbCutEdge = mbInGrid ? dot(texture(uCutVolume, mbCutAt), uCutChannel) : 0.0;
  if (uCutInvert > 0.5) { if (mbCutEdge <= 0.5 && !mbFlapOver(vWinWorld, vec3(1.0, 0.0, 0.0))) discard; }
  else if (mbCutEdge > 0.5 || mbFlapOver(vWinWorld, uLifeFlapOf)) discard;
  // Where a lid of bone has been lifted, a triangle with corners on both sides of its edge is drawn out into a long strip. Such a triangle covers far less of the model than of the view, and it is not drawn.
  if (uLidsOpen > 0.5 && uLifeFlapOf.z > 0.5) {
    float mbPixel = uCutPixel / gl_FragCoord.w;
    if (length(cross(dFdx(vWinWorld), dFdy(vWinWorld))) < 0.12 * mbPixel * mbPixel) discard;
  }
}`;
