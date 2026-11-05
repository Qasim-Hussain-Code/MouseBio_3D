/** Numerical checks of display smoothing. They establish geometric behaviour, not anatomical accuracy. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothSurfaceGeometries, smoothSurfaceGeometry } from '../src/viewer/surface-smoothing';
import { buildSurfaceAdjacency, DISPLAY_SMOOTHING, DISPLAY_SMOOTHING_COARSE, DISPLAY_SMOOTHING_VOLUME, smoothingAppliesTo, smoothingOptionsFor,
  smoothSurfacePositions, validateSmoothingOptions } from '../src/domain/display-smoothing';

function noise(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32 - 0.5; };
}
function radii(geometry: THREE.BufferGeometry): number[] {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, vertex) => new THREE.Vector3().fromBufferAttribute(position, vertex).length());
}
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
function rms(values: number[], target: number): number {
  return Math.sqrt(values.reduce((total, value) => total + (value - target) ** 2, 0) / values.length);
}
function noisySphere(): THREE.BufferGeometry {
  const sphere = mergeVertices(new THREE.IcosahedronGeometry(1, 5));
  const position = sphere.getAttribute('position');
  const random = noise(7);
  for (let vertex = 0; vertex < position.count; vertex++) {
    const scale = 1 + 0.06 * random();
    position.setXYZ(vertex, position.getX(vertex) * scale, position.getY(vertex) * scale, position.getZ(vertex) * scale);
  }
  return sphere;
}

test('smoothing a noisy closed sphere reduces roughness while keeping its size, topology and the input', () => {
  const source = noisySphere();
  const before = { positions: [...source.getAttribute('position').array], index: [...source.index!.array] };
  const roughBefore = rms(radii(source), 1);
  const smoothed = smoothSurfaceGeometry(source);
  assert.notEqual(smoothed, source);
  assert.deepEqual([...source.getAttribute('position').array], before.positions);
  assert.deepEqual([...source.index!.array], before.index);
  assert.deepEqual([...smoothed.index!.array], before.index);
  assert.equal(smoothed.getAttribute('position').count, source.getAttribute('position').count);
  const after = radii(smoothed), roughAfter = rms(after, 1);
  assert.ok(roughAfter < roughBefore * 0.7, `roughness ${roughBefore} -> ${roughAfter}`);
  assert.ok(Math.abs(mean(after) - 1) < 0.005, `mean radius ${mean(after)} drifted`);
  const normals = smoothed.getAttribute('normal'), position = smoothed.getAttribute('position');
  let alignment = 0;
  for (let vertex = 0; vertex < normals.count; vertex++) {
    const normal = new THREE.Vector3().fromBufferAttribute(normals, vertex);
    assert.ok(Math.abs(normal.length() - 1) < 1e-5);
    alignment += normal.dot(new THREE.Vector3().fromBufferAttribute(position, vertex).normalize());
  }
  assert.ok(alignment / normals.count > 0.99, 'normals point outward along the smoothed sphere');
  assert.ok(smoothed.boundingSphere && smoothed.boundingSphere.radius < 1.05);
});

test('long runs with the coarse parameters inflate low-frequency shape, which the volume parameters avoid', () => {
  const source = noisySphere();
  const roughBefore = rms(radii(source), 1);
  const roughTen = rms(radii(smoothSurfaceGeometry(source, DISPLAY_SMOOTHING_COARSE)), 1);
  // The pass-band gain of lambda 0.5, mu -0.53 exceeds one slightly, so forty passes drift outward.
  const long = radii(smoothSurfaceGeometry(source, { iterations: 40, lambda: 0.5, mu: -0.53 }));
  assert.ok(mean(long) > 1.005 && mean(long) < 1.05, `40 coarse iterations drift the mean radius to ${mean(long)}`);
  assert.ok(rms(long, 1) > roughTen, `the long coarse run (${rms(long, 1)}) departs further from the unit sphere than ten passes (${roughTen})`);
  // mu only slightly beyond -lambda keeps the gain near one: forty stronger passes stay within
  // half a percent of the unit radius. The uniform umbrella operator leaves a small imprint of the
  // irregular icosphere valences, so the residual is compared with the original noise rather than
  // with ten passes.
  const volume = radii(smoothSurfaceGeometry(source, DISPLAY_SMOOTHING_VOLUME));
  assert.ok(Math.abs(mean(volume) - 1) < 0.006, `volume parameters drift the mean radius to ${mean(volume)}`);
  assert.ok(rms(volume, mean(volume)) < roughBefore * 0.85, `volume parameters (${rms(volume, mean(volume))} about the mean radius) reduce the original roughness (${roughBefore})`);
});

test('plain Laplacian steps shrink the sphere, which the Taubin mu step counteracts', () => {
  const source = noisySphere();
  const taubin = radii(smoothSurfaceGeometry(source, { iterations: 30, lambda: 0.5, mu: -0.53 }));
  assert.ok(Math.abs(mean(taubin) - 1) < 0.02, `Taubin mean radius ${mean(taubin)}`);
  // A far weaker inverse step approximates Laplacian smoothing and visibly shrinks the surface.
  const shrunk = radii(smoothSurfaceGeometry(source, { iterations: 30, lambda: 0.5, mu: -0.5001 }));
  assert.ok(mean(shrunk) < mean(taubin) - 0.005, `near-Laplacian mean radius ${mean(shrunk)} should fall below ${mean(taubin)}`);
});

test('open boundary vertices stay fixed and interior bumps flatten', () => {
  const plane = new THREE.PlaneGeometry(10, 10, 20, 20);
  const position = plane.getAttribute('position');
  const centre = Math.floor(position.count / 2);
  position.setZ(centre, 1);
  const { boundary } = buildSurfaceAdjacency(plane.index!.array, position.count);
  const boundaryCount = boundary.reduce((total, flag) => total + flag, 0);
  assert.equal(boundaryCount, 4 * 20, 'all rim vertices of the grid are boundary vertices');
  assert.equal(boundary[centre], 0);
  const smoothed = smoothSurfaceGeometry(plane);
  const result = smoothed.getAttribute('position');
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (!boundary[vertex]) continue;
    assert.deepEqual([result.getX(vertex), result.getY(vertex), result.getZ(vertex)], [position.getX(vertex), position.getY(vertex), position.getZ(vertex)]);
  }
  assert.ok(result.getZ(centre) < 0.5, `bump ${result.getZ(centre)} should flatten`);
  assert.ok(result.getZ(centre) > 0, 'the bump keeps its sign');
});

test('zero iterations copy the surface and still recompute normals and bounds', () => {
  const plane = new THREE.PlaneGeometry(2, 2, 2, 2);
  plane.deleteAttribute('normal');
  const copy = smoothSurfaceGeometry(plane, { iterations: 0, lambda: 0.5, mu: -0.53 });
  assert.deepEqual([...copy.getAttribute('position').array], [...plane.getAttribute('position').array]);
  assert.equal(copy.getAttribute('normal').count, plane.getAttribute('position').count);
  assert.ok(copy.boundingBox && copy.boundingSphere);
});

test('the batch entry point falls back to the calling thread without a worker and matches the single-surface result', async () => {
  assert.equal(typeof Worker, 'undefined', 'Node has no Worker global, so the fallback path runs');
  const sphere = noisySphere(), plane = new THREE.PlaneGeometry(3, 3, 6, 6);
  const [first, second] = await smoothSurfaceGeometries([sphere, plane], DISPLAY_SMOOTHING_VOLUME);
  assert.deepEqual([...first.getAttribute('position').array], [...smoothSurfaceGeometry(sphere, DISPLAY_SMOOTHING_VOLUME).getAttribute('position').array]);
  assert.deepEqual([...second.getAttribute('position').array], [...smoothSurfaceGeometry(plane, DISPLAY_SMOOTHING_VOLUME).getAttribute('position').array]);
  assert.deepEqual(await smoothSurfaceGeometries([]), []);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(smoothSurfaceGeometries([plane], DISPLAY_SMOOTHING, aborted.signal), { name: 'AbortError' });
});

test('adjacency lists each undirected edge once per endpoint', () => {
  const { offsets, neighbours, boundary } = buildSurfaceAdjacency([0, 1, 2, 0, 2, 3], 4);
  const list = (vertex: number) => [...neighbours.subarray(offsets[vertex], offsets[vertex + 1])].sort();
  assert.deepEqual(list(0), [1, 2, 3]); assert.deepEqual(list(2), [0, 1, 3]); assert.deepEqual(list(1), [0, 2]); assert.deepEqual(list(3), [0, 2]);
  assert.deepEqual([...boundary], [1, 1, 1, 1]);
});

test('invalid surfaces and options are rejected before any geometry is produced', () => {
  const triangle = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  assert.throws(() => smoothSurfaceGeometry(triangle), /indexed triangle surface/);
  triangle.setIndex([0, 1]);
  assert.throws(() => smoothSurfaceGeometry(triangle), /indexed triangle surface/);
  triangle.setIndex([0, 1, 5]);
  assert.throws(() => smoothSurfaceGeometry(triangle), /exceed the vertex count/);
  triangle.setIndex([0, 1, 1]);
  assert.throws(() => smoothSurfaceGeometry(triangle), /Degenerate/);
  const broken = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, NaN, 0, 1, 0], 3)).setIndex([0, 1, 2]);
  assert.throws(() => smoothSurfaceGeometry(broken), /finite/);
  assert.throws(() => smoothSurfacePositions([0, 0, 0, 1], [0, 1, 2], 3, DISPLAY_SMOOTHING), /three coordinates/);
  for (const options of [{ iterations: -1, lambda: 0.5, mu: -0.53 }, { iterations: 1.5, lambda: 0.5, mu: -0.53 }, { iterations: 201, lambda: 0.5, mu: -0.53 },
    { iterations: 1, lambda: 0, mu: -0.53 }, { iterations: 1, lambda: 1, mu: -0.53 }, { iterations: 1, lambda: 0.5, mu: -0.5 },
    { iterations: 1, lambda: 0.5, mu: 0.1 }, { iterations: 1, lambda: 0.5, mu: -1 }, { iterations: 1, lambda: NaN, mu: -0.53 }]) {
    assert.throws(() => validateSmoothingOptions(options));
  }
  assert.doesNotThrow(() => validateSmoothingOptions(DISPLAY_SMOOTHING));
  assert.doesNotThrow(() => validateSmoothingOptions(DISPLAY_SMOOTHING_VOLUME));
});

test('smoothing applies only to the voxel-derived Digimouse references, each with its own parameters', () => {
  assert.equal(smoothingOptionsFor({ id: 'digimouse-tessellated-v1' }), DISPLAY_SMOOTHING_COARSE);
  assert.equal(smoothingOptionsFor({ id: 'digimouse-volume-040-v1' }), DISPLAY_SMOOTHING_VOLUME);
  assert.equal(smoothingAppliesTo({ id: 'digimouse-volume-040-v1' }), true);
  for (const id of ['charles2016-hindlimb-v1', 'ema147-native-v1', 'neuromorpho-nmo130632-v1', 'schmid2021-mvn1-v1', 'mousemapper-nerve-patch0-v1', 'local-trace']) {
    assert.equal(smoothingOptionsFor({ id }), null, id);
    assert.equal(smoothingAppliesTo({ id }), false, id);
  }
});

test('display normal diffusion matches area-weighted normals at zero passes and aligns noisy normals with the true surface', async () => {
  const { displayVertexNormals, MAX_NORMAL_ITERATIONS, normalPassesFor } = await import('../src/domain/display-smoothing');
  const sphere = noisySphere();
  const position = sphere.getAttribute('position'), index = sphere.index!.array;
  const reference = sphere.clone(); reference.computeVertexNormals();
  const plain = displayVertexNormals(position.array, index, position.count, 0);
  const expected = reference.getAttribute('normal');
  for (let vertex = 0; vertex < position.count; vertex++) {
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(plain[vertex * 3 + axis] - expected.array[vertex * 3 + axis]) < 1e-5);
  }
  // Mean angle between each normal and the radial direction, the normal of the underlying sphere.
  const deviation = (normals: Float32Array) => {
    let total = 0;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const radial = new THREE.Vector3().fromBufferAttribute(position, vertex).normalize();
      const normal = new THREE.Vector3(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]);
      assert.ok(Math.abs(normal.length() - 1) < 1e-5);
      total += radial.angleTo(normal);
    }
    return total / position.count;
  };
  // Many passes on this coarse sphere spread each normal over a large arc and bend it away from the surface.
  assert.ok(deviation(displayVertexNormals(position.array, index, position.count, 20)) > deviation(plain));
  // The size rule limits this surface to a few passes, which remove most of the noise.
  const passes = normalPassesFor(position.array, index, 40);
  assert.ok(passes >= 1 && passes <= 4, `passes ${passes}`);
  const diffused = displayVertexNormals(position.array, index, position.count, passes);
  assert.ok(deviation(diffused) < deviation(plain) * 0.6, `${deviation(plain)} -> ${deviation(diffused)}`);
  // A finely tessellated sphere of the same size receives the full limit.
  const fine = mergeVertices(new THREE.IcosahedronGeometry(1, 60));
  assert.equal(normalPassesFor(fine.getAttribute('position').array, fine.index!.array, 40), 40);
  assert.equal(normalPassesFor(fine.getAttribute('position').array, fine.index!.array, 0), 0);
  assert.deepEqual([...sphere.getAttribute('position').array], [...position.array]);
  assert.throws(() => displayVertexNormals(position.array, index, position.count, MAX_NORMAL_ITERATIONS + 1), /Normal smoothing passes/);
  assert.throws(() => validateSmoothingOptions({ ...DISPLAY_SMOOTHING_VOLUME, normalIterations: -1 }), /Normal smoothing passes/);
  assert.equal(DISPLAY_SMOOTHING_COARSE.normalIterations, undefined);
  // The geometry wrapper stores exactly the size-limited display normals of its smoothed positions.
  const smoothed = smoothSurfaceGeometry(sphere, DISPLAY_SMOOTHING_VOLUME);
  const smoothedPositions = smoothed.getAttribute('position').array;
  const expectedNormals = displayVertexNormals(smoothedPositions, index, position.count, normalPassesFor(smoothedPositions, index, DISPLAY_SMOOTHING_VOLUME.normalIterations!));
  assert.deepEqual([...smoothed.getAttribute('normal').array], [...expectedNormals]);
});
