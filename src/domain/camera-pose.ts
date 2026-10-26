/** Pure camera interchange validation, shared by serialization and rendering. */
export type Vector3Tuple = [number, number, number];
export interface CameraPose {
  position: Vector3Tuple;
  target: Vector3Tuple;
  up: Vector3Tuple;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finiteVector(value: unknown): value is Vector3Tuple {
  return Array.isArray(value) && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component));
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]];
}

function squaredLength(vector: Vector3Tuple): number {
  return vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2];
}

/** Mirror the renderer's squared-length and reciprocal arithmetic, not Math.hypot. */
function safelyNormalize(vector: Vector3Tuple, label: string, errors: string[]): Vector3Tuple | null {
  const square = squaredLength(vector);
  const inverse = 1 / Math.sqrt(square);
  if (!vector.every(Number.isFinite) || square === 0 || !Number.isFinite(square) || !Number.isFinite(inverse)) {
    errors.push(`${label} must have a finite nonzero squared length within the renderer's numerical range.`);
    return null;
  }
  return [vector[0] * inverse, vector[1] * inverse, vector[2] * inverse];
}

export function cameraPoseErrors(pose: unknown): string[] {
  const errors: string[] = [];
  if (!plainRecord(pose)) return ['Camera pose must be an object.'];
  if (Object.keys(pose).some((field) => !['position', 'target', 'up'].includes(field))) {
    errors.push('Camera pose contains unsupported fields.');
  }
  for (const field of ['position', 'target', 'up']) {
    if (!Object.hasOwn(pose, field) || !finiteVector(pose[field])) {
      errors.push(`Camera ${field} must contain exactly three finite numbers.`);
    }
  }
  if (!finiteVector(pose.position) || !finiteVector(pose.target) || !finiteVector(pose.up)) return errors;
  const position = pose.position;
  const target = pose.target;
  const up = pose.up;
  for (const [label, vector] of [['position', position], ['target', target], ['up', up]] as const) {
    if (!vector.every((component) => Number.isFinite(Math.fround(component)))) {
      errors.push(`Camera ${label} must fit finite Float32 renderer coordinates.`);
    }
  }
  const direction: Vector3Tuple = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  const directionUnit = safelyNormalize(direction, 'Camera viewing direction', errors);
  const upUnit = safelyNormalize(up, 'Camera up direction', errors);
  if (directionUnit && upUnit) {
    if (squaredLength(cross(directionUnit, upUnit)) < 1e-24) {
      errors.push('Camera up direction must not be parallel to its viewing direction.');
    } else {
      // Matrix4.lookAt crosses the original up vector with a normalized viewing
      // direction before normalizing the side vector. Check that step as well.
      const sideUnit = safelyNormalize(cross(up, directionUnit), 'Camera side direction', errors);
      if (sideUnit) {
        const verticalUnit = cross(directionUnit, sideUnit);
        const translation = [sideUnit, verticalUnit, directionUnit].map((basis) =>
          basis[0] * position[0] + basis[1] * position[1] + basis[2] * position[2]);
        if (!translation.every((component) => Number.isFinite(Math.fround(component)))) {
          errors.push('Camera view translation must fit finite Float32 renderer coordinates.');
        }
      }
    }
  }
  return errors;
}

/** Reject an invalid pose before mutating a rendered camera or orbit target. */
export function validateCameraPose(pose: unknown): asserts pose is CameraPose {
  const errors = cameraPoseErrors(pose);
  if (errors.length) throw new Error(errors.join(' '));
}
