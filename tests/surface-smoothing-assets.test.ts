/**
 * Display smoothing applied to the actual Digimouse surfaces. These bounds record
 * how far the display copy departs from the source triangles; they are not an
 * anatomical accuracy claim for either surface.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DISPLAY_SMOOTHING_COARSE, DISPLAY_SMOOTHING_VOLUME, smoothSurfaceGeometry, type SmoothingOptions } from '../src/viewer/surface-smoothing';

const VOXEL_M = 0.0004; // base processing grid of both Digimouse references

async function regions(path: string): Promise<THREE.Mesh[]> {
  const bytes = await readFile(new URL(path, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
  return meshes;
}

function signedVolume(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position'), index = geometry.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let corner = 0; corner < index.count; corner += 3) {
    a.fromBufferAttribute(position, index.getX(corner)); b.fromBufferAttribute(position, index.getX(corner + 1)); c.fromBufferAttribute(position, index.getX(corner + 2));
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

function maxDisplacement(before: THREE.BufferGeometry, after: THREE.BufferGeometry): number {
  const source = before.getAttribute('position'), target = after.getAttribute('position');
  let largest = 0;
  for (let vertex = 0; vertex < source.count; vertex++) {
    largest = Math.max(largest, Math.hypot(target.getX(vertex) - source.getX(vertex), target.getY(vertex) - source.getY(vertex), target.getZ(vertex) - source.getZ(vertex)));
  }
  return largest;
}

interface Departure { name: string; volumeChange: number; shift: number; boundsChange: number; triangles: number }

function departure(mesh: THREE.Mesh, options: SmoothingOptions): Departure {
  const source = mesh.geometry;
  const before = { index: source.index!.array, positions: Float32Array.from(source.getAttribute('position').array as Float32Array) };
  const smoothed = smoothSurfaceGeometry(source, options);
  assert.equal(smoothed.index!.count, source.index!.count, mesh.name);
  assert.deepEqual(smoothed.index!.array, before.index, `${mesh.name} keeps its triangle list`);
  assert.deepEqual(source.getAttribute('position').array, before.positions, `${mesh.name} source positions are untouched`);
  assert.equal(smoothed.getAttribute('position').count, source.getAttribute('position').count);
  const sourceVolume = signedVolume(source);
  assert.ok(Math.abs(sourceVolume) > 0, `${mesh.name} has a nonzero signed volume`);
  const normals = smoothed.getAttribute('normal');
  for (let vertex = 0; vertex < normals.count; vertex += 97) {
    assert.ok(Math.abs(Math.hypot(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)) - 1) < 1e-5);
  }
  source.computeBoundingBox(); smoothed.computeBoundingBox();
  const boundsChange = Math.max(...[0, 1, 2].flatMap((axis) => [
    Math.abs(source.boundingBox!.min.getComponent(axis) - smoothed.boundingBox!.min.getComponent(axis)),
    Math.abs(source.boundingBox!.max.getComponent(axis) - smoothed.boundingBox!.max.getComponent(axis))]));
  const result = { name: mesh.name, volumeChange: Math.abs(signedVolume(smoothed) / sourceVolume - 1), shift: maxDisplacement(source, smoothed), boundsChange, triangles: source.index!.count / 3 };
  smoothed.dispose();
  return result;
}

const describe = (row: Departure) => `${row.name} volume ${(row.volumeChange * 100).toFixed(2)}% shift ${(row.shift * 1000).toFixed(3)} mm bounds ${(row.boundsChange * 1000).toFixed(3)} mm triangles ${row.triangles}`;

test('smoothing every tetrahedral region keeps topology, size and position within the recorded bounds', async (t) => {
  const meshes = await regions('../public/atlas/digimouse.glb');
  assert.equal(meshes.length, 17);
  const rows = meshes.map((mesh) => departure(mesh, DISPLAY_SMOOTHING_COARSE));
  for (const row of rows) {
    t.diagnostic(describe(row));
    // Thin muscle slivers lose the most enclosed volume; the bound records the measured ceiling.
    assert.ok(row.volumeChange < 0.05, `${row.name} enclosed volume changed by ${(row.volumeChange * 100).toFixed(2)} percent`);
    assert.ok(row.shift < 1.5 * VOXEL_M, `${row.name} moved a vertex by ${row.shift} m`);
    assert.ok(row.boundsChange <= VOXEL_M, `${row.name} bounds moved by ${row.boundsChange} m`);
  }
  t.diagnostic(`tetrahedral: largest volume change ${(Math.max(...rows.map((row) => row.volumeChange)) * 100).toFixed(3)} percent, largest vertex shift ${(Math.max(...rows.map((row) => row.shift)) * 1000).toFixed(3)} mm, largest bounds shift ${(Math.max(...rows.map((row) => row.boundsChange)) * 1000).toFixed(3)} mm`);
});

test('the volume base heart, liver and lungs smooth within the recorded bounds at 0.4 mm', async (t) => {
  const meshes = await regions('../public/atlas-volume/digimouse-volume-040.glb');
  assert.equal(meshes.length, 21);
  const selected = meshes.filter((mesh) => ['digimouse-volume:9', 'digimouse-volume:18', 'digimouse-volume:21'].includes(mesh.userData.structureId));
  assert.equal(selected.length, 3);
  for (const mesh of selected) {
    const row = departure(mesh, DISPLAY_SMOOTHING_VOLUME);
    t.diagnostic(describe(row));
    assert.ok(row.volumeChange < 0.03, `${row.name} enclosed volume changed by ${(row.volumeChange * 100).toFixed(2)} percent`);
    assert.ok(row.shift < 2 * VOXEL_M, `${row.name} moved a vertex by ${row.shift} m`);
    assert.ok(row.boundsChange <= VOXEL_M, `${row.name} bounds moved by ${row.boundsChange} m`);
  }
});

test('a finer regional surface smooths under the same bounds at 0.2 mm', async (t) => {
  const [mesh] = await regions('../public/atlas-volume/detail/region-20.glb');
  const row = departure(mesh, DISPLAY_SMOOTHING_VOLUME);
  t.diagnostic(describe(row));
  assert.ok(row.volumeChange < 0.03, `volume changed by ${(row.volumeChange * 100).toFixed(2)} percent`);
  assert.ok(row.shift < 2 * 0.0002, `vertex moved by ${row.shift} m at 0.2 mm processing`);
});
