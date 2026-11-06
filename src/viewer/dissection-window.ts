import * as THREE from 'three';

/**
 * The shape cut out of each layer: all points within a radius of a segment, seen along an outward direction, down to a
 * depth under the segment. A segment of no length gives a round opening. Everything is in world coordinates.
 */
export interface WindowShape {
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  /** Outward from the body, towards the viewer of the opening. */
  readonly normal: THREE.Vector3;
  /** In the plane of the opening, towards the back of the animal. Folded layers turn about a line on this side. */
  readonly up: THREE.Vector3;
  /** Direction of the hinge, along the segment. */
  readonly along: THREE.Vector3;
  /** Radius of the opening in the skin. */
  readonly radius: number;
  /** How far under the segment the cut goes. */
  readonly depth: number;
  /** How far in front of the segment the cut reaches, so that a limb in front of the place is opened too, or left whole. */
  readonly front: number;
  /** Depth of the skin at the top of the opening of a layer, under the segment, given the radius of that opening: folded layers are hinged there. */
  readonly hinge: (radius: number) => number;
}

const scratch = new THREE.Vector3(), across = new THREE.Vector3();

/** Distance from the segment seen along the normal, and depth under the segment, as in the fragment program. */
export function windowCoordinates(shape: WindowShape, point: THREE.Vector3): { rho: number; depth: number } {
  scratch.copy(point).sub(shape.a);
  const depth = -scratch.dot(shape.normal);
  across.copy(scratch).addScaledVector(shape.normal, depth);
  const seg = new THREE.Vector3().subVectors(shape.b, shape.a);
  const lengthSquared = seg.lengthSq();
  const s = lengthSquared > 1e-14 ? Math.max(0, Math.min(1, across.dot(seg) / lengthSquared)) : 0;
  return { rho: across.addScaledVector(seg, -s).length(), depth };
}

export function insideWindow(shape: WindowShape, point: THREE.Vector3, radius: number): boolean {
  if (radius <= 0) return false;
  const { rho, depth } = windowCoordinates(shape, point);
  return rho < radius && depth < shape.depth && depth > -shape.front;
}

/** The rigid turn of a folded layer about a line at the top of its opening, with the lower edge coming towards the viewer. */
export function foldMatrix(shape: WindowShape, radius: number, degrees: number): THREE.Matrix4 {
  const pivot = new THREE.Vector3().addVectors(shape.a, shape.b).multiplyScalar(0.5).addScaledVector(shape.up, radius).addScaledVector(shape.normal, -shape.hinge(radius));
  const axis = shape.along.clone();
  // Turning a point below the hinge must first bring it outwards.
  const sense = new THREE.Vector3().crossVectors(axis, shape.up.clone().negate()).dot(shape.normal) >= 0 ? 1 : -1;
  const turn = new THREE.Matrix4().makeRotationAxis(axis, sense * THREE.MathUtils.degToRad(degrees));
  return new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(turn).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/** Entry and exit of a ray through a closed surface, with the normal at entry. Null if it misses. */
export function throughSurface(mesh: THREE.Mesh, origin: THREE.Vector3, direction: THREE.Vector3): { entry: THREE.Vector3; normal: THREE.Vector3; exit: number } | null {
  const ray = new THREE.Raycaster(origin, direction);
  ray.layers.enableAll();
  const hits = ray.intersectObject(mesh, false);
  if (!hits.length) return null;
  const first = hits[0];
  const normal = first.face ? first.face.normal.clone().transformDirection(mesh.matrixWorld) : direction.clone().negate();
  if (normal.dot(direction) > 0) normal.negate();
  const next = hits.find((hit) => hit.distance > first.distance + 1e-4);
  return { entry: first.point.clone(), normal, exit: next ? next.distance - first.distance : 0 };
}

export interface WindowFinding { readonly id: string; readonly depth: number; readonly count: number }

/**
 * Which meshes have surface inside the opening, and how deep they begin. Reads vertices, so that
 * a small nerve is found as surely as a large muscle. Limited to the visible parts of the shape, and to the given radius.
 */
export function findInWindow(shape: WindowShape, radius: number, meshes: Iterable<readonly [string, THREE.Mesh]>): WindowFinding[] {
  const found: WindowFinding[] = [];
  const point = new THREE.Vector3();
  for (const [id, mesh] of meshes) {
    const position = mesh.geometry.getAttribute('position');
    if (!position) continue;
    mesh.updateWorldMatrix(true, false);
    const stride = position.count > 60000 ? 3 : 1;
    let count = 0, shallowest = Infinity;
    for (let index = 0; index < position.count; index += stride) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      const where = windowCoordinates(shape, point);
      if (where.rho >= radius || where.depth >= shape.depth || where.depth <= -shape.front) continue;
      count++;
      if (where.depth < shallowest) shallowest = where.depth;
    }
    if (count > 0) found.push({ id, depth: shallowest, count });
  }
  return found;
}
