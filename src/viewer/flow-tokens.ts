import * as THREE from 'three';
import { flowKindOf, type FlowTokenKind } from '../domain/living-simulation';
import type { Atlas } from '../domain';
import { LIFE_DECLARATIONS, LIFE_MOVE, createLifeMeshUniforms, lifeUniforms } from './life-field';

/**
 * Tokens moving along the centre lines of the vessels and nerves. The positions are worked out in the vertex program from a table of the lines, so that moving
 * thousands of them takes no work on the main thread. A token is far larger than a cell and far slower than real flow or a real nerve impulse: it shows which way things go, and nothing else.
 */
export const FLOW_FILE_FORMAT = 'mousebio-flow-paths-v1';

export interface FlowPathFile {
  readonly format: string;
  readonly referenceId: string;
  readonly evidence: 'simulated';
  /** Metres per unit of the numbers in points. */
  readonly unitMetres: number;
  readonly lines: readonly { readonly structure: string; readonly points: readonly number[] }[];
}

/** A valid file only, so that a damaged one shows no flow rather than a wrong one. */
export function isFlowPathFile(value: unknown): value is FlowPathFile {
  const file = value as FlowPathFile | null;
  return !!file && file.format === FLOW_FILE_FORMAT && file.evidence === 'simulated' && typeof file.unitMetres === 'number' && file.unitMetres > 0 && Array.isArray(file.lines)
    && file.lines.every((line) => typeof line.structure === 'string' && Array.isArray(line.points) && line.points.length >= 8 && line.points.length % 4 === 0);
}

export interface FlowLine {
  readonly structure: string;
  readonly kind: FlowTokenKind;
  readonly oxygenated: boolean;
  /** Along the line from start to end is the way things move. */
  readonly forward: boolean;
  /** x, y, z, radius at each step, in metres. */
  readonly samples: Float32Array;
  readonly length: number;
  /** Distance of the start of the line from the heart. */
  readonly fromHeart: number;
}

/** The distance between samples of a line in the table. */
export const FLOW_STEP = 0.00025;
/** The largest number of tokens drawn. */
export const FLOW_BUDGET = 22000;

/** Resample a line at even steps, so that a position along it is a position in the table. */
function resample(points: readonly number[], unit: number, toWorld: THREE.Matrix4): { samples: Float32Array; length: number } {
  const count = points.length / 4;
  const world: THREE.Vector3[] = [], radii: number[] = [];
  for (let i = 0; i < count; i++) {
    world.push(new THREE.Vector3(points[4 * i] * unit, points[4 * i + 1] * unit, points[4 * i + 2] * unit).applyMatrix4(toWorld));
    radii.push(points[4 * i + 3] * unit);
  }
  let length = 0;
  const lengths = [0];
  for (let i = 1; i < count; i++) { length += world[i].distanceTo(world[i - 1]); lengths.push(length); }
  const steps = Math.max(1, Math.round(length / FLOW_STEP));
  const samples = new Float32Array(4 * (steps + 1));
  let segment = 0;
  const point = new THREE.Vector3();
  for (let s = 0; s <= steps; s++) {
    const wanted = length * s / steps;
    while (segment < count - 2 && lengths[segment + 1] < wanted) segment++;
    const span = lengths[segment + 1] - lengths[segment];
    const t = span > 0 ? (wanted - lengths[segment]) / span : 0;
    point.lerpVectors(world[segment], world[segment + 1], t);
    samples.set([point.x, point.y, point.z, radii[segment] + (radii[segment + 1] - radii[segment]) * t], 4 * s);
  }
  return { samples, length };
}

/** Turn the file into lines in world coordinates, each going the way things move, and leave out what the atlas does not know. */
export function flowLinesFrom(file: FlowPathFile, atlas: Pick<Atlas, 'structures'>, toWorld: THREE.Matrix4, heart: THREE.Vector3): FlowLine[] {
  const counts = new Map<string, number>();
  const lines: FlowLine[] = [];
  const known = new Map(atlas.structures.map((item) => [item.id, item]));
  for (const line of file.lines) {
    const structure = known.get(line.structure);
    if (!structure) continue;
    const order = counts.get(line.structure) ?? 0;
    counts.set(line.structure, order + 1);
    const kind = flowKindOf(structure, order);
    if (!kind) continue;
    const { samples, length } = resample(line.points, file.unitMetres, toWorld);
    if (length < 0.0003) continue;
    const startFromHeart = heart.distanceTo(new THREE.Vector3(samples[0], samples[1], samples[2]));
    const end = samples.length - 4;
    const endFromHeart = heart.distanceTo(new THREE.Vector3(samples[end], samples[end + 1], samples[end + 2]));
    // A line is drawn from whichever end it was given; what moves away from the heart goes from its nearer end, and what returns goes to it.
    const startsNearer = startFromHeart <= endFromHeart;
    lines.push({ structure: line.structure, kind: kind.kind, oxygenated: kind.oxygenated, forward: kind.away === startsNearer, samples, length, fromHeart: Math.min(startFromHeart, endFromHeart) });
  }
  return lines;
}

/** Speed of a token, in metres per second shown at one tenth of the real rate. A choice for viewing. */
export function tokenSpeed(kind: FlowTokenKind, radius: number): number {
  const wide = Math.min(1, radius / 0.0006);
  if (kind === 'artery') return 0.0032 + 0.0105 * wide;
  if (kind === 'vein') return 0.002 + 0.0055 * wide;
  if (kind === 'lymph') return 0.0009;
  return 0.03;
}

/** How many tokens a line carries: closer together in wider vessels, with the whole limited to the budget. */
export function tokenCounts(lines: readonly Pick<FlowLine, 'kind' | 'samples' | 'length'>[], budget: number = FLOW_BUDGET): number[] {
  const gapOf = (kind: FlowTokenKind, radius: number) => kind === 'nerve' ? 0.0022 : kind === 'lymph' ? 0.0012 : radius > 0.0003 ? 0.00022 : radius > 0.00012 ? 0.00036 : radius > 0.00008 ? 0.0009 : 0.0016;
  const wanted = lines.map((line) => line.length / gapOf(line.kind, line.samples[3]));
  const total = wanted.reduce((sum, value) => sum + value, 0);
  const scale = total > budget ? budget / total : 1;
  let carry = 0;
  return wanted.map((value) => { carry += value * scale; const whole = Math.floor(carry); carry -= whole; return whole; });
}

const COLOURS: Record<string, THREE.Color> = {
  oxygenated: new THREE.Color('#d6332b'), deoxygenated: new THREE.Color('#6d2236'), lymph: new THREE.Color('#e7dcae'), nerve: new THREE.Color('#ffd66b'),
};

const VERTEX = `
attribute vec4 aLine;
attribute vec4 aFlow;
attribute vec4 aLane;
attribute vec3 aColour;
uniform sampler2D uTable;
uniform vec2 uTableSize;
uniform float uClock;
uniform float uStep;
uniform float uBeatRate;
uniform vec4 uShown;
uniform float uWinNear;
varying vec2 vCorner;
varying vec3 vColour;
${LIFE_DECLARATIONS}
${LIFE_MOVE}
vec4 mbSample(float index) {
  float row = floor(index / uTableSize.x);
  return texture2D(uTable, (vec2(index - row * uTableSize.x, row) + 0.5) / uTableSize);
}
void main() {
  float count = aLine.y;
  float span = (count - 1.0) * uStep;
  // aFlow: speed along the line, pulse delay in cycles, kind (0 artery, 1 vein, 2 lymph, 3 nerve), size share.
  float travel = aLine.z * span + aFlow.x * uClock;
  if (aFlow.z < 0.5 && uBeatRate > 0.0) travel += aFlow.x / (6.2831853 * uBeatRate) * 0.8 * sin(6.2831853 * (uLifeBeats - aFlow.y));
  travel = mod(travel, span);
  float at = travel / uStep;
  float first = floor(at);
  vec4 behind = mbSample(aLine.x + first);
  vec4 ahead = mbSample(aLine.x + min(first + 1.0, count - 1.0));
  vec4 here = mix(behind, ahead, at - first);
  vec3 along = ahead.xyz - behind.xyz;
  along /= max(length(along), 1e-9);
  vec3 lane = aLane.xyz - along * dot(aLane.xyz, along);
  vec3 world = here.xyz + lane * here.w * aLane.w;
  world += mbLifeMove(world, along);
  // Tokens appear and fade at the ends of a line, so that none jumps from end to start. The kind that is turned off has no size.
  float ends = smoothstep(0.0, 0.0008, min(travel, span - travel) + 0.0002);
  float shown = aFlow.z < 0.5 ? uShown.x : aFlow.z < 1.5 ? uShown.y : aFlow.z < 2.5 ? uShown.z : uShown.w;
  float size = max(here.w * aFlow.w, 0.000014) * ends * shown;
  if (uWinNear > 0.0 && distance(world, cameraPosition) < uWinNear) size = 0.0;
  vCorner = position.xy;
  vColour = aColour;
  vec4 inView = viewMatrix * vec4(world, 1.0);
  inView.xy += position.xy * size;
  gl_Position = projectionMatrix * inView;
}`;

const FRAGMENT = `
#include <common>
varying vec2 vCorner;
varying vec3 vColour;
void main() {
  float reach = dot(vCorner, vCorner);
  if (reach > 1.0) discard;
  vec3 facing = vec3(vCorner, sqrt(1.0 - reach));
  float light = 0.62 + 0.42 * dot(facing, normalize(vec3(-0.35, 0.5, 0.8)));
  gl_FragColor = vec4(vColour * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface FlowTokens {
  readonly mesh: THREE.Mesh;
  readonly count: number;
  readonly lines: readonly FlowLine[];
  /** Move on by the seconds shown, at a share of real time. */
  advance(seconds: number, rate: number): void;
  /** Which kinds are shown. */
  show(blood: boolean, nerves: boolean): void;
  /** Only what is inside the removed part of the skin is drawn, as for the other inner parts. */
  setMasked(masked: boolean): void;
  setNear(distance: number): void;
  dispose(): void;
}

export function createFlowTokens(lines: readonly FlowLine[]): FlowTokens | null {
  const counts = tokenCounts(lines);
  const count = counts.reduce((sum, value) => sum + value, 0);
  if (!count) return null;
  const texels = lines.reduce((sum, line) => sum + line.samples.length / 4, 0);
  const width = Math.min(1024, Math.ceil(Math.sqrt(texels)) + 1), height = Math.ceil(texels / width);
  const table = new Float32Array(4 * width * height);
  const starts: number[] = [];
  let written = 0;
  for (const line of lines) { starts.push(written); table.set(line.samples, 4 * written); written += line.samples.length / 4; }
  const texture = new THREE.DataTexture(table, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter; texture.needsUpdate = true;

  const aLine = new Float32Array(4 * count), aFlow = new Float32Array(4 * count), aLane = new Float32Array(4 * count), aColour = new Float32Array(3 * count);
  let state = 19650610;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  let token = 0;
  lines.forEach((line, lineIndex) => {
    const radius = line.samples[3];
    const kindIndex = line.kind === 'artery' ? 0 : line.kind === 'vein' ? 1 : line.kind === 'lymph' ? 2 : 3;
    const colour = line.kind === 'nerve' ? COLOURS.nerve : line.kind === 'lymph' ? COLOURS.lymph : line.oxygenated ? COLOURS.oxygenated : COLOURS.deoxygenated;
    for (let n = 0; n < counts[lineIndex]; n++, token++) {
      const place = (n + next()) / counts[lineIndex];
      const speed = tokenSpeed(line.kind, radius) * (0.86 + 0.28 * next()) * (line.forward ? 1 : -1);
      aLine.set([starts[lineIndex], line.samples.length / 4, place, 0], 4 * token);
      aFlow.set([speed, (line.fromHeart + place * line.length) / 0.3, kindIndex, line.kind === 'nerve' ? 0.9 : line.kind === 'lymph' ? 0.55 : 0.5 + 0.14 * next()], 4 * token);
      const x = next() * 2 - 1, angle = next() * 6.2831853, flat = Math.sqrt(1 - x * x);
      aLane.set([x, flat * Math.cos(angle), flat * Math.sin(angle), line.kind === 'nerve' ? 0.3 : 0.58 * Math.sqrt(next())], 4 * token);
      const tone = 0.86 + 0.28 * next();
      aColour.set([colour.r * tone, colour.g * tone, colour.b * tone], 3 * token);
    }
  });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aLine', new THREE.InstancedBufferAttribute(aLine, 4));
  geometry.setAttribute('aFlow', new THREE.InstancedBufferAttribute(aFlow, 4));
  geometry.setAttribute('aLane', new THREE.InstancedBufferAttribute(aLane, 4));
  geometry.setAttribute('aColour', new THREE.InstancedBufferAttribute(aColour, 3));
  geometry.instanceCount = count;
  const uniforms = {
    uTable: { value: texture }, uTableSize: { value: new THREE.Vector2(width, height) }, uClock: { value: 0 }, uStep: { value: FLOW_STEP }, uBeatRate: { value: 1 },
    uShown: { value: new THREE.Vector4(1, 1, 1, 1) }, uWinNear: { value: 0 }, ...lifeUniforms(createLifeMeshUniforms()),
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'simulated-flow-tokens';
  mesh.raycast = () => undefined;
  // After the skin and its mark, and before the walls of the vessels, which are drawn over the tokens inside them.
  mesh.renderOrder = 0.5;
  return {
    mesh, count, lines,
    advance(seconds, rate) {
      uniforms.uClock.value += seconds * rate / 0.1;
      uniforms.uBeatRate.value = 10 * rate;
    },
    show(blood, nerves) { uniforms.uShown.value.set(blood ? 1 : 0, blood ? 1 : 0, blood ? 1 : 0, nerves ? 1 : 0); },
    setMasked(masked) {
      material.stencilWrite = masked;
      material.stencilFunc = THREE.EqualStencilFunc;
      material.stencilRef = 1;
    },
    setNear(distance) { uniforms.uWinNear.value = distance; },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
