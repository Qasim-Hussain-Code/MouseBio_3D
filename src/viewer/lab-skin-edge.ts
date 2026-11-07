import * as THREE from 'three';
import type { CutField } from '../domain/cut-field';
import { installSurfaceShading, surfaceShadingOf } from './surface-shading';

/**
 * The cut edge of the skin, drawn as a low rolled lip of the pink inner side along every edge of a cut, whatever its shape, because a cut surface by itself has no thickness and skin rolls back from a cut.
 * Its line is found on the triangles of the skin, where the grid of cuts crosses the middle of its range, and followed along them, then smoothed. It is a way of showing the edge, and its height and width are chosen for viewing.
 * A long straight cut has flaps instead, each with a rolled edge of its own, and no lip is drawn along it.
 */
export interface SkinEdge {
  readonly mesh: THREE.Mesh;
  /** Find the edge again from the grid. No lip is drawn near these lengths, which are the lines of flaps. */
  refresh(without?: readonly (readonly [THREE.Vector3, THREE.Vector3])[]): void;
  dispose(): void;
}

const MOST_SEGMENTS = 9000, PROFILE = 4, threshold = 128, CLEAR_OF_FLAPS = 0.0032;
/** Across the lip, from under the skin at the cut to where it lies down on the fur: how far out and how high, as shares of its width and height, how bright, and which way its surface faces. */
const ACROSS: readonly (readonly [number, number, number, number, number])[] = [[0, -0.15, 0.5, -0.8, 0.6], [0.22, 0.9, 0.86, -0.25, 0.97], [0.62, 1, 1, 0.35, 0.94], [1, 0.34, 0.86, 0.9, 0.44]];

export function createSkinEdge(skin: THREE.Mesh, field: CutField, width = 0.0019, height = 0.0011): SkinEdge {
  const geometry = skin.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.getIndex()!;
  skin.updateWorldMatrix(true, false);
  const count = position.count;
  const points = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const point = new THREE.Vector3(), turn = new THREE.Matrix3().getNormalMatrix(skin.matrixWorld);
  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(skin.matrixWorld).toArray(points, 3 * i);
    point.fromBufferAttribute(normal, i).applyMatrix3(turn).normalize().toArray(normals, 3 * i);
  }
  // Where each vertex lies among the boxes of the grid, so that reading the grid at every vertex takes little time.
  const { origin, cell, nx, ny, nz } = field.shape;
  const base = new Int32Array(count), weights = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const fx = (points[3 * i] - origin[0]) / cell - 0.5, fy = (points[3 * i + 1] - origin[1]) / cell - 0.5, fz = (points[3 * i + 2] - origin[2]) / cell - 0.5;
    const x = Math.floor(fx), y = Math.floor(fy), z = Math.floor(fz);
    if (x < 0 || y < 0 || z < 0 || x >= nx - 1 || y >= ny - 1 || z >= nz - 1) { base[i] = -1; continue; }
    base[i] = (x + nx * (y + ny * z)) * 4;
    weights[3 * i] = fx - x; weights[3 * i + 1] = fy - y; weights[3 * i + 2] = fz - z;
  }
  const stepY = nx * 4, stepZ = nx * ny * 4, data = field.data[0];
  const values = new Float32Array(count);
  const read = () => {
    let any = false;
    for (let i = 0; i < count; i++) {
      const b = base[i];
      if (b < 0) { values[i] = 0; continue; }
      const tx = weights[3 * i], ty = weights[3 * i + 1], tz = weights[3 * i + 2];
      const low = (data[b] * (1 - tx) + data[b + 4] * tx) * (1 - ty) + (data[b + stepY] * (1 - tx) + data[b + stepY + 4] * tx) * ty;
      const high = (data[b + stepZ] * (1 - tx) + data[b + stepZ + 4] * tx) * (1 - ty) + (data[b + stepZ + stepY] * (1 - tx) + data[b + stepZ + stepY + 4] * tx) * ty;
      const value = low * (1 - tz) + high * tz;
      values[i] = value;
      if (value > 128) any = true;
    }
    return any;
  };
  const vertices = MOST_SEGMENTS * (PROFILE - 1) * 6;
  const outPosition = new Float32Array(vertices * 3), outNormal = new Float32Array(vertices * 3), outColor = new Float32Array(vertices * 3);
  const built = new THREE.BufferGeometry();
  const positionOut = new THREE.BufferAttribute(outPosition, 3).setUsage(THREE.DynamicDrawUsage), normalOut = new THREE.BufferAttribute(outNormal, 3).setUsage(THREE.DynamicDrawUsage), colorOut = new THREE.BufferAttribute(outColor, 3).setUsage(THREE.DynamicDrawUsage);
  built.setAttribute('position', positionOut);
  built.setAttribute('normal', normalOut);
  built.setAttribute('color', colorOut);
  built.setDrawRange(0, 0);
  const material = new THREE.MeshPhysicalMaterial({ color: '#e7b5a5', roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.4, vertexColors: true, side: THREE.DoubleSide });
  const own = installSurfaceShading(material);
  const mesh = new THREE.Mesh(built, material);
  mesh.frustumCulled = false;
  mesh.name = 'cut-edge-of-skin';
  const skinShading = surfaceShadingOf(skin.material as THREE.Material);
  mesh.onBeforeRender = () => { if (skinShading) own.uLifeHeld.value = skinShading.uLifeHeld.value; };

  // Reused for every piece of the edge.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), g = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const across = new THREE.Vector3(), up = new THREE.Vector3(), corner = new THREE.Vector3(), facing = new THREE.Vector3(), along = new THREE.Vector3(), here = new THREE.Vector3(), there = new THREE.Vector3();
  // The points of the edge: where it crosses a side of a triangle of the skin. A piece of the edge joins two of them, and the pieces that share one make an unbroken line.
  const MOST_POINTS = MOST_SEGMENTS * 2;
  const placeOf = new Float64Array(MOST_POINTS * 3), awayOf = new Float64Array(MOST_POINTS * 3), upOf = new Float64Array(MOST_POINTS * 3), linked = new Int32Array(MOST_POINTS * 2);
  const pointOn = new Map<number, number>();
  let used = 0, written = 0;
  const pointAt = (from: number, to: number, vf: number, vt: number) => {
    const key = Math.min(from, to) * count + Math.max(from, to);
    const known = pointOn.get(key);
    if (known !== undefined) return known;
    if (used >= MOST_POINTS) return -1;
    const share = (threshold - vf) / (vt - vf), at = used++;
    for (let k = 0; k < 3; k++) { placeOf[3 * at + k] = points[3 * from + k] + (points[3 * to + k] - points[3 * from + k]) * share; awayOf[3 * at + k] = 0; upOf[3 * at + k] = 0; }
    linked[2 * at] = -1; linked[2 * at + 1] = -1;
    pointOn.set(key, at);
    return at;
  };
  const link = (from: number, to: number) => {
    if (linked[2 * from] < 0) linked[2 * from] = to;
    else if (linked[2 * from + 1] < 0) linked[2 * from + 1] = to;
  };
  /** One smoothing pass along a line of values, three to a point. */
  const smooth = (values: Float64Array, length: number, closed: boolean, scratch: Float64Array) => {
    for (let i = 0; i < length; i++) {
      const before = i > 0 ? i - 1 : closed ? length - 1 : 0, after = i + 1 < length ? i + 1 : closed ? 0 : length - 1;
      for (let k = 0; k < 3; k++) scratch[3 * i + k] = 0.25 * values[3 * before + k] + 0.5 * values[3 * i + k] + 0.25 * values[3 * after + k];
    }
    values.set(scratch.subarray(0, 3 * length));
  };
  let lineAt = new Float64Array(3 * 2048), lineAway = new Float64Array(3 * 2048), lineUp = new Float64Array(3 * 2048), lineScratch = new Float64Array(3 * 2048);
  const put = (at: number, row: readonly [number, number, number, number, number]) => {
    here.fromArray(lineAt, 3 * at); across.fromArray(lineAway, 3 * at); up.fromArray(lineUp, 3 * at);
    corner.copy(here).addScaledVector(across, row[0] * width).addScaledVector(up, row[1] * height);
    facing.copy(across).multiplyScalar(row[3]).addScaledVector(up, row[4]).normalize();
    corner.toArray(outPosition, 3 * written);
    facing.toArray(outNormal, 3 * written);
    outColor[3 * written] = row[2]; outColor[3 * written + 1] = row[2] * (0.86 + 0.14 * row[2]); outColor[3 * written + 2] = row[2] * (0.84 + 0.16 * row[2]);
    written++;
  };
  let keepClear: readonly (readonly [THREE.Vector3, THREE.Vector3])[] = [];
  const nearAFlap = (at: number) => {
    for (const [from, to] of keepClear) {
      here.fromArray(lineAt, 3 * at); along.subVectors(to, from);
      const t = Math.max(0, Math.min(1, there.subVectors(here, from).dot(along) / along.lengthSq()));
      if (there.copy(from).addScaledVector(along, t).distanceTo(here) < CLEAR_OF_FLAPS) return true;
    }
    return false;
  };
  const drawLine = (line: readonly number[], closed: boolean) => {
    const length = line.length;
    if (length < 3) return;
    if (lineAt.length < 3 * length) { lineAt = new Float64Array(3 * length * 2); lineAway = new Float64Array(3 * length * 2); lineUp = new Float64Array(3 * length * 2); lineScratch = new Float64Array(3 * length * 2); }
    for (let i = 0; i < length; i++) for (let k = 0; k < 3; k++) { lineAt[3 * i + k] = placeOf[3 * line[i] + k]; lineAway[3 * i + k] = awayOf[3 * line[i] + k]; lineUp[3 * i + k] = upOf[3 * line[i] + k]; }
    // The grid and the triangles give a stepped line and a direction that wavers from piece to piece; a cut has neither.
    for (let pass = 0; pass < 4; pass++) smooth(lineAt, length, closed, lineScratch);
    for (let pass = 0; pass < 10; pass++) { smooth(lineAway, length, closed, lineScratch); smooth(lineUp, length, closed, lineScratch); }
    for (let i = 0; i < length; i++) {
      here.fromArray(lineAt, 3 * Math.max(0, i - 1)); there.fromArray(lineAt, 3 * Math.min(length - 1, i + 1));
      along.subVectors(there, here).normalize();
      up.fromArray(lineUp, 3 * i).normalize();
      across.fromArray(lineAway, 3 * i).addScaledVector(up, -across.dot(up)).addScaledVector(along, -across.dot(along)).normalize();
      if (!Number.isFinite(across.x)) across.set(0, 0, 0);
      up.toArray(lineUp, 3 * i); across.toArray(lineAway, 3 * i);
    }
    const pieces = closed ? length : length - 1;
    for (let i = 0; i < pieces && written + (PROFILE - 1) * 6 <= vertices; i++) {
      const j = (i + 1) % length;
      if (keepClear.length && (nearAFlap(i) || nearAFlap(j))) continue;
      for (let k = 0; k + 1 < PROFILE; k++) {
        put(i, ACROSS[k]); put(j, ACROSS[k]); put(j, ACROSS[k + 1]);
        put(i, ACROSS[k]); put(j, ACROSS[k + 1]); put(i, ACROSS[k + 1]);
      }
    }
  };
  return {
    mesh,
    refresh(without = []) {
      written = 0;
      keepClear = without;
      if (read()) {
        pointOn.clear();
        used = 0;
        for (let t = 0; t + 2 < index.count; t += 3) {
          const i0 = index.getX(t), i1 = index.getX(t + 1), i2 = index.getX(t + 2);
          const v0 = values[i0], v1 = values[i1], v2 = values[i2];
          const in0 = v0 > threshold, in1 = v1 > threshold, in2 = v2 > threshold;
          if (in0 === in1 && in1 === in2) continue;
          // The two places where the edge crosses this triangle.
          const start = in0 !== in1 ? pointAt(i0, i1, v0, v1) : pointAt(i1, i2, v1, v2);
          const finish = in0 !== in2 ? pointAt(i2, i0, v2, v0) : pointAt(i1, i2, v1, v2);
          if (start < 0 || finish < 0 || start === finish) continue;
          a.fromArray(points, 3 * i0); b.fromArray(points, 3 * i1); c.fromArray(points, 3 * i2);
          // Away from the cut, along the skin: down the slope of the grid across this triangle. These two products give the slope with its sign turned, pointing out of the cut.
          e1.subVectors(b, a); e2.subVectors(c, a);
          n.crossVectors(e1, e2);
          if (n.lengthSq() < 1e-18) continue;
          g.copy(t1.crossVectors(n, e2).multiplyScalar(v1 - v0)).add(t2.crossVectors(e1, n).multiplyScalar(v2 - v0));
          if (g.lengthSq() < 1e-18) continue;
          g.normalize();
          up.fromArray(normals, 3 * i0).add(t1.fromArray(normals, 3 * i1)).add(t2.fromArray(normals, 3 * i2)).normalize();
          for (const point of [start, finish]) for (let k = 0; k < 3; k++) { awayOf[3 * point + k] += g.getComponent(k); upOf[3 * point + k] += up.getComponent(k); }
          link(start, finish); link(finish, start);
        }
        // Follow each line from one end, then whatever is left, which are the closed lines round a cut.
        const walked = new Uint8Array(used), line: number[] = [];
        const follow = (first: number) => {
          line.length = 0;
          let current = first;
          while (current >= 0 && !walked[current]) {
            walked[current] = 1;
            line.push(current);
            const one = linked[2 * current], two = linked[2 * current + 1];
            current = one >= 0 && !walked[one] ? one : two >= 0 && !walked[two] ? two : -1;
          }
          const last = line[line.length - 1];
          drawLine(line, line.length > 3 && (linked[2 * last] === first || linked[2 * last + 1] === first));
        };
        for (let point = 0; point < used; point++) if (!walked[point] && linked[2 * point + 1] < 0) follow(point);
        for (let point = 0; point < used; point++) if (!walked[point]) follow(point);
      }
      built.setDrawRange(0, written);
      positionOut.needsUpdate = true; normalOut.needsUpdate = true; colorOut.needsUpdate = true;
    },
    dispose() { built.dispose(); material.dispose(); },
  };
}
