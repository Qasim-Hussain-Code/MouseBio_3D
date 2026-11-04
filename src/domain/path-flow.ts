/** Original integration code: MIT, Qasim Hussain.
 * Steady Hagen-Poiseuille pipe calculations for retained source-order points.
 * Formula: OpenStax University Physics vol. 1, section 14.7, equation 14.19.
 * This is an assumed-parameter calculation, without physiological validation.
 */

export type PathFlowPoint = readonly [number, number, number];

export interface PathFlowParameters {
  readonly radiusUm: number;
  /** Pressure at the first source point minus pressure at the last source point. */
  readonly pressureDropPa: number;
  readonly viscosityPaS: number;
}

export interface PathFlowResult {
  readonly classification: 'assumed-parameterized-pipe-flow';
  readonly physicalCalibrationVerified: false;
  /** Source-declared micrometres; interpreting these numbers as length is an assumption. */
  readonly lengthUm: number;
  /** Signed relative to source point order, without an arterial or venous classification. */
  readonly flowUm3PerMs: number;
  readonly flowUlPerMin: number;
  readonly meanVelocityUmPerMs: number;
  /** Length divided by absolute mean velocity. Null denotes zero imposed pressure and no flow. */
  readonly transitMs: number | null;
  readonly direction: 'source-forward' | 'source-reverse' | 'stationary';
  readonly crossSectionAreaUm2: number;
  readonly sourcePointCount: number;
  readonly segmentCount: number;
  readonly zeroLengthSegmentCount: number;
  readonly assumedParameters: Readonly<PathFlowParameters>;
}

/** Numerical input bounds, not validated ranges for a mouse or for laminar blood flow. */
export const PATH_FLOW_LIMITS = Object.freeze({
  minPoints: 2,
  maxPoints: 100000,
  minRadiusUm: 0.1,
  maxRadiusUm: 100,
  maxAbsPressureDropPa: 20000,
  minViscosityPaS: 0.0001,
  maxViscosityPaS: 0.1,
});

/** Explicit teaching assumptions, not measured or normal mouse values. */
export const PATH_FLOW_ASSUMED_DEFAULTS: Readonly<PathFlowParameters> = Object.freeze({
  radiusUm: 3,
  pressureDropPa: 100,
  viscosityPaS: 0.0035,
});

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(message);
}

function isPoint(value: unknown): value is PathFlowPoint {
  return Array.isArray(value) && value.length === 3
    && finiteNumber(value[0]) && finiteNumber(value[1]) && finiteNumber(value[2]);
}

/**
 * Calculate one idealized pipe from every adjacent retained source point.
 * Source coordinates, order and coincident segments are never changed. This
 * function accepts neither a display transform nor a clipping or smoothing rule.
 * Curvature contributes to the summed length, without a curvature-loss model.
 *
 * Q_SI = pi r_m^4 DeltaP / (8 mu L_m).
 * In the supplied units, Q_um3/ms = pi r_um^4 DeltaP / (8 mu L_um) / 1000;
 * Q_uL/min = Q_um3/ms * 0.00006; v_um/ms = Q_um3/ms / (pi r_um^2).
 *
 * Invalid inputs, entirely coincident paths and unrepresentable nonzero outputs
 * fail with fixed messages. No Infinity, numeric saturation or radius inference
 * is returned. A caller must bind points to the intended source and disclose its
 * source-declared units and unverified physical calibration.
 */
export function calculatePathFlow(
  positions: readonly PathFlowPoint[],
  parameters: PathFlowParameters,
): PathFlowResult {
  requireCondition(parameters !== null && typeof parameters === 'object', 'Path flow parameters are required.');
  const { radiusUm, pressureDropPa, viscosityPaS } = parameters;
  requireCondition(finiteNumber(radiusUm) && radiusUm >= PATH_FLOW_LIMITS.minRadiusUm
    && radiusUm <= PATH_FLOW_LIMITS.maxRadiusUm, 'Assumed radius is outside the supported range.');
  requireCondition(finiteNumber(pressureDropPa) && Math.abs(pressureDropPa) <= PATH_FLOW_LIMITS.maxAbsPressureDropPa,
    'Assumed pressure drop is outside the supported range.');
  requireCondition(finiteNumber(viscosityPaS) && viscosityPaS >= PATH_FLOW_LIMITS.minViscosityPaS
    && viscosityPaS <= PATH_FLOW_LIMITS.maxViscosityPaS, 'Assumed viscosity is outside the supported range.');
  requireCondition(Array.isArray(positions) && positions.length >= PATH_FLOW_LIMITS.minPoints
    && positions.length <= PATH_FLOW_LIMITS.maxPoints, 'Source path point count is outside the supported range.');

  let previous: PathFlowPoint | undefined;
  let lengthUm = 0;
  let lengthCompensation = 0;
  let zeroLengthSegmentCount = 0;
  for (let index = 0; index < positions.length; index++) {
    const point: unknown = positions[index];
    requireCondition(isPoint(point), 'Source path requires finite coordinate triples.');
    if (previous) {
      const segmentLength = Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]);
      requireCondition(Number.isFinite(segmentLength), 'Source path length is not representable.');
      if (segmentLength === 0) zeroLengthSegmentCount++;
      // Compensated source-order summation retains small segments without reordering them.
      const compensated = segmentLength - lengthCompensation;
      const nextLength = lengthUm + compensated;
      lengthCompensation = (nextLength - lengthUm) - compensated;
      lengthUm = nextLength;
      requireCondition(Number.isFinite(lengthUm), 'Source path length is not representable.');
    }
    previous = point;
  }
  requireCondition(lengthUm > 0, 'Source path must contain a noncoincident segment.');

  const squaredRadius = radiusUm * radiusUm;
  const crossSectionAreaUm2 = Math.PI * squaredRadius;
  const pressure = pressureDropPa === 0 ? 0 : pressureDropPa;
  let flowUm3PerMs = 0;
  let flowUlPerMin = 0;
  let meanVelocityUmPerMs = 0;
  let transitMs: number | null = null;
  if (pressure !== 0) {
    flowUm3PerMs = (Math.PI * squaredRadius * squaredRadius * pressure) / (8 * viscosityPaS * lengthUm) / 1000;
    flowUlPerMin = flowUm3PerMs * 0.00006;
    meanVelocityUmPerMs = flowUm3PerMs / crossSectionAreaUm2;
    transitMs = lengthUm / Math.abs(meanVelocityUmPerMs);
    requireCondition(Number.isFinite(flowUm3PerMs) && flowUm3PerMs !== 0
      && Number.isFinite(flowUlPerMin) && flowUlPerMin !== 0
      && Number.isFinite(meanVelocityUmPerMs) && meanVelocityUmPerMs !== 0
      && Number.isFinite(transitMs) && transitMs > 0,
    'Path flow calculation exceeds the supported numeric range.');
  }

  return Object.freeze({
    classification: 'assumed-parameterized-pipe-flow',
    physicalCalibrationVerified: false,
    lengthUm,
    flowUm3PerMs,
    flowUlPerMin,
    meanVelocityUmPerMs,
    transitMs,
    direction: pressure === 0 ? 'stationary' : pressure > 0 ? 'source-forward' : 'source-reverse',
    crossSectionAreaUm2,
    sourcePointCount: positions.length,
    segmentCount: positions.length - 1,
    zeroLengthSegmentCount,
    assumedParameters: Object.freeze({ radiusUm, pressureDropPa: pressure, viscosityPaS }),
  });
}
