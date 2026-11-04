import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { calculatePathFlow, PATH_FLOW_ASSUMED_DEFAULTS, PATH_FLOW_LIMITS,
  type PathFlowParameters, type PathFlowPoint } from '../src/domain/path-flow';

const straight: readonly PathFlowPoint[] = Object.freeze([
  Object.freeze([0, 0, 0] as const), Object.freeze([1000, 0, 0] as const),
]);

function close(actual: number, expected: number, relativeTolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= relativeTolerance * Math.max(Math.abs(expected), 1e-100),
    `Expected ${actual} to agree with ${expected}`);
}

test('pipe flow agrees with an independent SI-unit calculation and signed mean-velocity relation', () => {
  const result = calculatePathFlow(straight, PATH_FLOW_ASSUMED_DEFAULTS);
  // SI calculation is deliberately separate from the module's micrometre expression.
  const radiusM = 3e-6, lengthM = 0.001, viscosity = 0.0035, pressure = 100;
  const flowM3PerS = Math.PI * Math.pow(radiusM, 4) * pressure / (8 * viscosity * lengthM);
  const areaM2 = Math.PI * radiusM * radiusM;
  close(result.flowUm3PerMs, flowM3PerS * 1e15);
  close(result.flowUlPerMin, flowM3PerS * 1e9 * 60);
  close(result.crossSectionAreaUm2, areaM2 * 1e12);
  close(result.meanVelocityUmPerMs, (flowM3PerS / areaM2) * 1000);
  close(result.transitMs!, (lengthM / (flowM3PerS / areaM2)) * 1000);
  assert.equal(result.lengthUm, 1000);
  assert.equal(result.direction, 'source-forward');
  assert.equal(result.classification, 'assumed-parameterized-pipe-flow');
  assert.equal(result.physicalCalibrationVerified, false);
});

test('radius, pressure and viscosity sensitivity follow the stated ideal-pipe model', () => {
  const base = calculatePathFlow(straight, PATH_FLOW_ASSUMED_DEFAULTS);
  const radius = calculatePathFlow(straight, { ...PATH_FLOW_ASSUMED_DEFAULTS, radiusUm: 6 });
  const pressure = calculatePathFlow(straight, { ...PATH_FLOW_ASSUMED_DEFAULTS, pressureDropPa: 200 });
  const viscosity = calculatePathFlow(straight, { ...PATH_FLOW_ASSUMED_DEFAULTS, viscosityPaS: 0.007 });
  close(radius.flowUm3PerMs / base.flowUm3PerMs, 16);
  close(radius.meanVelocityUmPerMs / base.meanVelocityUmPerMs, 4);
  close(radius.crossSectionAreaUm2 / base.crossSectionAreaUm2, 4);
  close(radius.transitMs! / base.transitMs!, 0.25);
  close(pressure.flowUm3PerMs / base.flowUm3PerMs, 2);
  close(pressure.transitMs! / base.transitMs!, 0.5);
  close(viscosity.flowUm3PerMs / base.flowUm3PerMs, 0.5);
  close(viscosity.transitMs! / base.transitMs!, 2);
});

test('all retained adjacent segments determine length, including curvature and coincident records', () => {
  const positions: readonly PathFlowPoint[] = Object.freeze([
    Object.freeze([0, 0, 0] as const), Object.freeze([3, 4, 0] as const),
    Object.freeze([3, 4, 0] as const), Object.freeze([3, 4, 12] as const),
  ]);
  const before = JSON.stringify(positions);
  const result = calculatePathFlow(positions, PATH_FLOW_ASSUMED_DEFAULTS);
  assert.equal(result.lengthUm, 17); assert.equal(result.sourcePointCount, 4);
  assert.equal(result.segmentCount, 3); assert.equal(result.zeroLengthSegmentCount, 1);
  assert.ok(result.lengthUm > Math.hypot(3, 4, 12));
  const twiceLength = calculatePathFlow(positions.map(([x, y, z]) => [2 * x, 2 * y, 2 * z] as const), PATH_FLOW_ASSUMED_DEFAULTS);
  close(twiceLength.flowUm3PerMs / result.flowUm3PerMs, 0.5);
  close(twiceLength.transitMs! / result.transitMs!, 4);
  assert.equal(JSON.stringify(positions), before);
});

test('pressure sign is relative to source order and reversal never infers a biological direction', () => {
  const forward = calculatePathFlow(straight, PATH_FLOW_ASSUMED_DEFAULTS);
  const negative = calculatePathFlow(straight, { ...PATH_FLOW_ASSUMED_DEFAULTS, pressureDropPa: -100 });
  const reversed = calculatePathFlow([...straight].reverse(), { ...PATH_FLOW_ASSUMED_DEFAULTS, pressureDropPa: -100 });
  assert.equal(negative.direction, 'source-reverse');
  assert.equal(negative.flowUm3PerMs, -forward.flowUm3PerMs);
  assert.equal(negative.meanVelocityUmPerMs, -forward.meanVelocityUmPerMs);
  assert.equal(negative.transitMs, forward.transitMs);
  assert.equal(reversed.lengthUm, forward.lengthUm);
  assert.equal(reversed.flowUm3PerMs, -forward.flowUm3PerMs);
  const reversedPositive = calculatePathFlow([...straight].reverse(), PATH_FLOW_ASSUMED_DEFAULTS);
  assert.equal(reversedPositive.direction, 'source-forward');
  assert.equal(reversedPositive.flowUm3PerMs, forward.flowUm3PerMs);
});

test('zero imposed pressure returns finite export values and an explicit absent transit time', () => {
  for (const pressureDropPa of [0, -0]) {
    const result = calculatePathFlow(straight, { ...PATH_FLOW_ASSUMED_DEFAULTS, pressureDropPa });
    assert.equal(result.flowUm3PerMs, 0); assert.equal(result.flowUlPerMin, 0);
    assert.equal(result.meanVelocityUmPerMs, 0); assert.equal(result.transitMs, null);
    assert.equal(result.direction, 'stationary');
    assert.equal(Object.is(result.assumedParameters.pressureDropPa, -0), false);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
});

test('bounded assumptions are copied, frozen and never supplied as measured values', () => {
  const parameters: PathFlowParameters = { radiusUm: 3, pressureDropPa: 100, viscosityPaS: 0.0035 };
  const before = JSON.stringify(parameters);
  const result = calculatePathFlow(straight, parameters);
  assert.equal(JSON.stringify(parameters), before); assert.equal(Object.isFrozen(parameters), false);
  assert.notEqual(result.assumedParameters, parameters);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.assumedParameters));
  assert.deepEqual(PATH_FLOW_ASSUMED_DEFAULTS, parameters);
  for (const radiusUm of [0.1, 100]) for (const pressureDropPa of [-20000, 20000]) for (const viscosityPaS of [0.0001, 0.1]) {
    const edge = calculatePathFlow(straight, { radiusUm, pressureDropPa, viscosityPaS });
    assert.ok(Number.isFinite(edge.flowUm3PerMs) && Number.isFinite(edge.transitMs));
  }
});

test('degenerate, malformed, oversized and numerically unrepresentable inputs fail without partial results', () => {
  const malformed: unknown[] = [null, {}, [], [[0, 0, 0]], [[0, 0, 0], [0, 0, 0]],
    [[0, 0, 0], [1, 2]], [[0, 0, 0], [1, 2, 3, 4]], [[0, 0, 0], ['1', 2, 3]],
    [[0, 0, 0], [1, NaN, 3]], [[0, 0, 0], [1, Infinity, 3]],
    [[-1e308, 0, 0], [1e308, 0, 0]], new Array(PATH_FLOW_LIMITS.maxPoints + 1)];
  for (const positions of malformed) assert.throws(() => calculatePathFlow(positions as readonly PathFlowPoint[], PATH_FLOW_ASSUMED_DEFAULTS), RangeError);
  for (const [key, values] of Object.entries({ radiusUm: [0, -1, 0.099, 100.001, NaN, Infinity, '3'],
    pressureDropPa: [-20000.1, 20000.1, NaN, Infinity, '100'], viscosityPaS: [0, -1, 0.000099, 0.10001, NaN, Infinity, '0.0035'] })) {
    for (const value of values) assert.throws(() => calculatePathFlow(straight, { ...PATH_FLOW_ASSUMED_DEFAULTS, [key]: value } as PathFlowParameters), RangeError);
  }
  assert.throws(() => calculatePathFlow(straight, null as unknown as PathFlowParameters), RangeError);
  assert.throws(() => calculatePathFlow(straight, { ...PATH_FLOW_ASSUMED_DEFAULTS, pressureDropPa: Number.MIN_VALUE }), RangeError);
  assert.throws(() => calculatePathFlow([[0, 0, 0], [Number.MIN_VALUE, 0, 0]], PATH_FLOW_ASSUMED_DEFAULTS), RangeError);
  const largest = new Array<PathFlowPoint>(PATH_FLOW_LIMITS.maxPoints).fill([0, 0, 0]);
  largest[largest.length - 1] = [1, 0, 0];
  const bounded = calculatePathFlow(largest, PATH_FLOW_ASSUMED_DEFAULTS);
  assert.equal(bounded.sourcePointCount, PATH_FLOW_LIMITS.maxPoints);
  assert.equal(bounded.zeroLengthSegmentCount, PATH_FLOW_LIMITS.maxPoints - 2);
});

test('a retained real cortical vascular path can be evaluated without replacing any source coordinate', async () => {
  const body = JSON.parse(await readFile(new URL('../public/atlas-vascular/schmid2021-mvn1-lines.json', import.meta.url), 'utf8')) as {
    points: PathFlowPoint[]; paths: number[][];
  };
  // Source row 0 consists only of coincident points; the solver must reject it rather than repair it.
  assert.throws(() => calculatePathFlow(body.paths[0].map((index) => body.points[index]), PATH_FLOW_ASSUMED_DEFAULTS),
    /noncoincident segment/);
  const row = body.paths.findIndex((candidate) => candidate.slice(1).some((index, i) =>
    body.points[index].some((value, axis) => value !== body.points[candidate[i]][axis])));
  assert.ok(row > 0);
  const path = body.paths[row];
  const positions = Object.freeze(path.map((index) => Object.freeze(body.points[index])));
  const before = JSON.stringify(positions);
  const result = calculatePathFlow(positions, PATH_FLOW_ASSUMED_DEFAULTS);
  assert.ok(result.lengthUm > 0 && result.flowUm3PerMs > 0);
  assert.equal(result.sourcePointCount, path.length);
  assert.equal(result.physicalCalibrationVerified, false);
  assert.equal(JSON.stringify(positions), before);
});
