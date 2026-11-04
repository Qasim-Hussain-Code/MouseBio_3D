import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EXCITABLE_CABLE_PARAMETERS, EXCITABLE_CABLE_LIMITATIONS, runExcitableCable,
  simulateExcitableCable } from '../src/domain/excitable-cable';

test('default stimulus propagates one activation wave along the ideal cable in model coordinates', () => {
  const result = simulateExcitableCable();
  assert.equal(result.classification, 'generic-phenomenological');
  assert.equal(result.source.mouseCalibrated, false);
  assert.equal(result.source.anatomicalRegistration, null);
  assert.deepEqual(result.units, { time: 'dimensionless', x: 'dimensionless', v: 'dimensionless', w: 'dimensionless' });
  assert.equal(result.diagnostics.allNodesCrossedThreshold, true);
  const arrivals = result.thresholdArrivalTimes as number[];
  // Beyond the stimulated nodes, threshold arrival must increase with distance from x = 0.
  for (let node = DEFAULT_EXCITABLE_CABLE_PARAMETERS.stimulusNodes + 1; node < arrivals.length; node++) {
    assert.ok(arrivals[node] > arrivals[node - 1], `Arrival at node ${node} must follow node ${node - 1}.`);
  }
  // A travelling wave has a roughly constant spacing of arrivals away from both ends.
  const quarter = Math.floor(arrivals.length / 4);
  const early = arrivals[2 * quarter] - arrivals[quarter], late = arrivals[3 * quarter] - arrivals[2 * quarter];
  assert.ok(Math.abs(early - late) / late < 0.05, 'Mid-cable arrival spacing should be steady.');
  assert.equal(result.snapshots.length, DEFAULT_EXCITABLE_CABLE_PARAMETERS.duration + 1);
  assert.equal(result.snapshots[0].time, 0);
  assert.ok(result.snapshots[0].v.every((value) => value === result.equilibrium.v));
  assert.ok(Math.abs(result.equilibrium.residual) < 1e-12);
  assert.ok(result.solver.diffusionCfl <= 0.4);
  assert.equal(result.solver.stateClipping, false);
  assert.deepEqual(result.limitations, EXCITABLE_CABLE_LIMITATIONS);
});

test('without stimulus the stable resting state persists and no threshold arrival is reported', () => {
  const result = simulateExcitableCable({ stimulusAmplitude: 0, duration: 60 });
  assert.ok(result.thresholdArrivalTimes.every((value) => value === null));
  assert.equal(result.diagnostics.allNodesCrossedThreshold, false);
  assert.ok(Math.abs(result.diagnostics.maximumV - result.equilibrium.v) < 1e-9);
});

test('halving the integration step leaves the far-end arrival within one percent', () => {
  const coarse = simulateExcitableCable({ duration: 120 });
  const fine = simulateExcitableCable({ duration: 120, timeStep: 0.01 });
  const last = coarse.parameters.nodes - 1;
  const coarseArrival = coarse.thresholdArrivalTimes[last]!, fineArrival = fine.thresholdArrivalTimes[last]!;
  assert.ok(Number.isFinite(coarseArrival) && Number.isFinite(fineArrival));
  assert.ok(Math.abs(coarseArrival - fineArrival) / fineArrival < 0.01,
    `Arrival changed from ${coarseArrival} to ${fineArrival} with a halved step.`);
});

test('unsupported options, unstable grids and unstable resting states are rejected before integration', () => {
  for (const options of [{ nodes: 15 }, { nodes: 12.5 }, { timeStep: 0.05 }, { diffusion: 11 }, { duration: 0 },
    { stimulusEnd: 1, stimulusStart: 2 }, { stimulusNodes: 0 }, { a: Number.NaN }, { tau: Infinity }, { b: 1.5 },
    // Diffusion number D dt / dx^2 above 0.4.
    { diffusion: 10, nodes: 256, length: 10 }] as const) {
    assert.throws(() => simulateExcitableCable(options as never), RangeError);
  }
  assert.throws(() => simulateExcitableCable({ unexpected: 1 } as never), RangeError);
  assert.throws(() => simulateExcitableCable(null as never), RangeError);
});

test('results are immutable and repeat exactly for identical options', () => {
  const first = simulateExcitableCable({ duration: 40 }), second = simulateExcitableCable({ duration: 40 });
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.snapshots) && Object.isFrozen(first.snapshots[3].v));
  assert.throws(() => { (first.thresholdArrivalTimes as (number | null)[])[0] = 1; }, TypeError);
});

test('cancellation stops the chunked runner before a result is produced', async () => {
  const controller = new AbortController();
  let chunks = 0;
  await assert.rejects(runExcitableCable({ duration: 200 }, () => { if (++chunks === 2) controller.abort(); }, controller.signal),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(chunks, 2);
});
