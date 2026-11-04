// Original implementation: MIT, Qasim Hussain. No third-party code is copied.

export interface ExcitableCableOptions {
  a?: number; b?: number; tau?: number; diffusion?: number;
  nodes?: number; length?: number; duration?: number; timeStep?: number;
  stimulusStart?: number; stimulusEnd?: number; stimulusAmplitude?: number; stimulusNodes?: number;
}
export interface ExcitableCableParameters {
  readonly a: number; readonly b: number; readonly tau: number; readonly diffusion: number;
  readonly nodes: number; readonly length: number; readonly duration: number; readonly timeStep: number;
  readonly stimulusStart: number; readonly stimulusEnd: number; readonly stimulusAmplitude: number; readonly stimulusNodes: number;
}
export interface ExcitableCableSnapshot { readonly time: number; readonly v: readonly number[]; readonly w: readonly number[]; }
export interface ExcitableCableProgress { readonly fraction: number; readonly steps: number; }
export interface ExcitableCableResult {
  readonly schemaVersion: 'mousebio.excitable-cable.v1';
  readonly classification: 'generic-phenomenological';
  readonly source: typeof EXCITABLE_CABLE_SOURCE;
  readonly parameters: ExcitableCableParameters;
  readonly units: { readonly time: 'dimensionless'; readonly x: 'dimensionless'; readonly v: 'dimensionless'; readonly w: 'dimensionless' };
  readonly nodeCoordinates: readonly number[];
  readonly equilibrium: { readonly v: number; readonly w: number; readonly residual: number; readonly method: 'bisection'; readonly linearlyStable: true };
  readonly solver: { readonly method: 'forward-euler'; readonly timeStep: number; readonly diffusionCfl: number;
    readonly outputInterval: 1; readonly steps: number; readonly cellUpdates: number; readonly boundary: 'zero-flux-reflecting-ghost-nodes';
    readonly stimulusEdgeSplitting: true; readonly stateClipping: false };
  readonly snapshots: readonly ExcitableCableSnapshot[];
  /** First upward crossing of v=0, linearly interpolated within one Euler step. */
  readonly thresholdArrivalTimes: readonly (number | null)[];
  readonly diagnostics: { readonly threshold: 0; readonly minimumV: number; readonly maximumV: number;
    readonly minimumW: number; readonly maximumW: number; readonly allNodesCrossedThreshold: boolean };
  readonly limitations: readonly string[];
}

export const EXCITABLE_CABLE_SOURCE = Object.freeze({
  title: 'FitzHugh (1961), Impulses and Physiological States in Theoretical Models of Nerve Membrane',
  citation: 'FitzHugh R. Biophysical Journal. 1961;1(6):445-466.',
  doi: '10.1016/S0006-3495(61)86902-6',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1366333/',
  relationship: 'Generic normalized FitzHugh-Nagumo equation family with an ideal one-dimensional diffusion term; not an exact reproduction of the publication.',
  implementationLicense: 'MIT',
  mouseCalibrated: false,
  anatomicalRegistration: null,
} as const);

export const DEFAULT_EXCITABLE_CABLE_PARAMETERS: ExcitableCableParameters = Object.freeze({
  a: 0.7, b: 0.8, tau: 12.5, diffusion: 1, nodes: 128, length: 80, duration: 160, timeStep: 0.02,
  stimulusStart: 2, stimulusEnd: 6, stimulusAmplitude: 1, stimulusNodes: 4,
});
export const EXCITABLE_CABLE_LIMITATIONS = Object.freeze([
  'This generic phenomenological excitable cable is not calibrated to mouse nerve recordings, a specific cell, axon, specimen or source anatomical path.',
  'Space, time, activator v and recovery variable w are dimensionless. The result supplies no millivolts, measured membrane potential, physical conduction velocity or synapse identity.',
  'Parameters, stimulus and one-dimensional diffusion are illustrative model choices rather than measured source-path properties or an exact reproduction of the 1961 publication.',
  'A normalized path-length display mapping does not establish anatomical registration, continuity between source paths, measured nerve activity or validated physiology.',
  'Threshold arrival is a numerical diagnostic of v crossing zero. Numerical propagation and timestep convergence do not establish biological validation.',
]);

const MAX_STEPS = 300000, MAX_CELL_UPDATES = 64000000, OUTPUT_INTERVAL = 1, THRESHOLD = 0;
function requireCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new RangeError(message); }
function finiteRange(value: number, minimum: number, maximum: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function parameters(options: ExcitableCableOptions): ExcitableCableParameters {
  requireCondition(options !== null && typeof options === 'object' && !Array.isArray(options), 'Cable options must be an object.');
  const allowed = Object.keys(DEFAULT_EXCITABLE_CABLE_PARAMETERS);
  requireCondition(Object.keys(options).every((key) => allowed.includes(key)), 'Cable options contain unsupported fields.');
  const value = { ...DEFAULT_EXCITABLE_CABLE_PARAMETERS, ...options };
  requireCondition(finiteRange(value.a, 0.001, 2) && finiteRange(value.b, 0.1, 1)
    && finiteRange(value.tau, 1, 100) && finiteRange(value.diffusion, 0, 10), 'Cable reaction or diffusion parameters are outside computational bounds.');
  requireCondition(Number.isInteger(value.nodes) && finiteRange(value.nodes, 16, 256)
    && finiteRange(value.length, 1, 1000), 'Cable spatial grid is outside computational bounds.');
  requireCondition(Number.isInteger(value.duration) && finiteRange(value.duration, 1, 250)
    && finiteRange(value.timeStep, 0.001, 0.02), 'Cable duration or integration step is outside computational bounds.');
  requireCondition(finiteRange(value.stimulusStart, 0, 250) && finiteRange(value.stimulusEnd, 0, 250)
    && value.stimulusEnd > value.stimulusStart && finiteRange(value.stimulusAmplitude, 0, 3)
    && Number.isInteger(value.stimulusNodes) && finiteRange(value.stimulusNodes, 1, Math.min(16, value.nodes - 1)),
    'Cable stimulus is outside computational bounds.');
  const dx = value.length / (value.nodes - 1), cfl = value.diffusion * value.timeStep / (dx * dx);
  requireCondition(Number.isFinite(cfl) && cfl <= 0.4, 'Cable diffusion CFL must not exceed 0.4.');
  const steps = Math.ceil(value.duration / value.timeStep) + value.duration + 3;
  requireCondition(steps <= MAX_STEPS && steps * value.nodes <= MAX_CELL_UPDATES, 'Cable calculation exceeds its bounded solver budget.');
  return Object.freeze(value);
}

/** Negative resting root of v-v^3/3-(v+a)/b=0; b<=1 makes it unique. */
function equilibrium(value: ExcitableCableParameters) {
  const residual = (v: number) => v - v * v * v / 3 - (v + value.a) / value.b;
  let left = -5, right = 0;
  requireCondition(residual(left) > 0 && residual(right) < 0, 'Cable resting root is not bracketed.');
  for (let iteration = 0; iteration < 100; iteration++) {
    const middle = (left + right) / 2;
    if (middle === left || middle === right) break;
    if (residual(middle) > 0) left = middle; else right = middle;
  }
  const v = (left + right) / 2, w = (v + value.a) / value.b;
  const trace = 1 - v * v - value.b / value.tau;
  const determinant = (1 - value.b * (1 - v * v)) / value.tau;
  requireCondition(Number.isFinite(v) && Number.isFinite(w) && trace < 0 && determinant > 0,
    'Cable parameters do not provide a linearly stable resting state.');
  return Object.freeze({ v, w, residual: residual(v), method: 'bisection' as const, linearlyStable: true as const });
}

/** Euler finite differences on an ideal cable. No source geometry or physical units enter. */
export function* integrateExcitableCable(options: ExcitableCableOptions = {}): Generator<ExcitableCableProgress, ExcitableCableResult, void> {
  const value = parameters(options), rest = equilibrium(value), dx = value.length / (value.nodes - 1);
  const inverseDxSquared = 1 / (dx * dx), diffusionCfl = value.diffusion * value.timeStep * inverseDxSquared;
  let v = new Float64Array(value.nodes).fill(rest.v), w = new Float64Array(value.nodes).fill(rest.w);
  let nextV = new Float64Array(value.nodes), nextW = new Float64Array(value.nodes);
  const snapshots: ExcitableCableSnapshot[] = [], arrivals: (number | null)[] = Array(value.nodes).fill(null);
  let time = 0, steps = 0, outputTime = OUTPUT_INTERVAL;
  let minimumV = rest.v, maximumV = rest.v, minimumW = rest.w, maximumW = rest.w;
  const append = () => snapshots.push(Object.freeze({ time, v: Object.freeze(Array.from(v)), w: Object.freeze(Array.from(w)) }));
  append();
  while (time < value.duration) {
    requireCondition(++steps <= MAX_STEPS && steps * value.nodes <= MAX_CELL_UPDATES, 'Cable calculation exceeded its bounded solver budget.');
    let boundary = Math.min(outputTime, value.duration);
    if (value.stimulusStart > time) boundary = Math.min(boundary, value.stimulusStart);
    if (value.stimulusEnd > time) boundary = Math.min(boundary, value.stimulusEnd);
    const remaining = boundary - time, step = Math.min(value.timeStep, remaining);
    requireCondition(Number.isFinite(step) && step > 0 && time + step > time, 'Cable integration cannot advance its time grid.');
    const nextTime = remaining <= value.timeStep ? boundary : time + step;
    const current = time >= value.stimulusStart && time < value.stimulusEnd ? value.stimulusAmplitude : 0;
    for (let index = 0; index < value.nodes; index++) {
      // Reflecting ghosts: v[-1]=v[1], v[n]=v[n-2], so the end derivative is zero.
      const left = v[index === 0 ? 1 : index - 1], right = v[index === value.nodes - 1 ? value.nodes - 2 : index + 1];
      const laplacian = (left - 2 * v[index] + right) * inverseDxSquared;
      nextV[index] = v[index] + step * (value.diffusion * laplacian + v[index] - v[index] * v[index] * v[index] / 3 - w[index]
        + (index < value.stimulusNodes ? current : 0));
      nextW[index] = w[index] + step * (v[index] + value.a - value.b * w[index]) / value.tau;
      requireCondition(Number.isFinite(nextV[index]) && Number.isFinite(nextW[index]), 'Cable state became nonfinite; no partial result was retained.');
      if (arrivals[index] === null && v[index] < THRESHOLD && nextV[index] >= THRESHOLD) {
        arrivals[index] = time + step * (THRESHOLD - v[index]) / (nextV[index] - v[index]);
      }
      minimumV = Math.min(minimumV, nextV[index]); maximumV = Math.max(maximumV, nextV[index]);
      minimumW = Math.min(minimumW, nextW[index]); maximumW = Math.max(maximumW, nextW[index]);
    }
    [v, nextV] = [nextV, v]; [w, nextW] = [nextW, w]; time = nextTime;
    if (time === outputTime) { append(); outputTime += OUTPUT_INTERVAL; }
    if (steps % 256 === 0) yield Object.freeze({ fraction: time / value.duration, steps });
  }
  requireCondition(snapshots.length === value.duration + 1 && snapshots.length <= 251, 'Cable snapshot grid is inconsistent.');
  return Object.freeze({ schemaVersion: 'mousebio.excitable-cable.v1', classification: 'generic-phenomenological',
    source: EXCITABLE_CABLE_SOURCE, parameters: value,
    units: Object.freeze({ time: 'dimensionless', x: 'dimensionless', v: 'dimensionless', w: 'dimensionless' } as const),
    nodeCoordinates: Object.freeze(Array.from({ length: value.nodes }, (_, index) => index * value.length / (value.nodes - 1))),
    equilibrium: rest,
    solver: Object.freeze({ method: 'forward-euler', timeStep: value.timeStep, diffusionCfl, outputInterval: 1,
      steps, cellUpdates: steps * value.nodes, boundary: 'zero-flux-reflecting-ghost-nodes', stimulusEdgeSplitting: true, stateClipping: false } as const),
    snapshots: Object.freeze(snapshots), thresholdArrivalTimes: Object.freeze(arrivals),
    diagnostics: Object.freeze({ threshold: 0, minimumV, maximumV, minimumW, maximumW, allNodesCrossedThreshold: arrivals.every((arrival) => arrival !== null) } as const),
    limitations: EXCITABLE_CABLE_LIMITATIONS });
}

export function simulateExcitableCable(options: ExcitableCableOptions = {}): ExcitableCableResult {
  const iterator = integrateExcitableCable(options);
  while (true) { const next = iterator.next(); if (next.done) return next.value; }
}

/** Yield bounded chunks to the UI and stop before advancing another chunk after cancellation. */
export async function runExcitableCable(options: ExcitableCableOptions = {}, progress?: (value: ExcitableCableProgress) => void,
  signal?: AbortSignal): Promise<ExcitableCableResult> {
  const iterator = integrateExcitableCable(options);
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const next = iterator.next(); if (next.done) return next.value;
    progress?.(next.value);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
