import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Atlas } from '../src/domain/types';
import { DISPLAY_ROTATION_Z, recenterMeshGeometry } from '../src/viewer/scene-utils';

const atlas = JSON.parse(await readFile(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8')) as Atlas;
const bytes = await readFile(new URL('../public/atlas/digimouse.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const meshes: THREE.Mesh[] = [];
gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });

test('Three.js loads every region with its stable anatomical identifier', () => {
  assert.equal(meshes.length, atlas.structures.length);
  const ids = meshes.map((mesh) => mesh.userData.structureId);
  assert.equal(new Set(ids).size, atlas.structures.length);
  assert.deepEqual([...ids].sort(), atlas.structures.map((structure) => structure.id).sort());
  for (const mesh of meshes) {
    const structure = atlas.structures.find((entry) => entry.id === mesh.userData.structureId);
    assert.ok(structure, `Unmapped mesh ${mesh.name}`);
    assert.ok(mesh.geometry.index, `Region ${structure.id} must retain indexed triangles`);
    assert.ok(mesh.geometry.attributes.normal, `Region ${structure.id} requires surface normals`);
  }
});

test('Three.js preserves the documented common coordinate frame while loading GLB', () => {
  for (const mesh of meshes) {
    const structure = atlas.structures.find((entry) => entry.id === mesh.userData.structureId)!;
    const geometry = (structure as unknown as { geometry: { boundsMeters: [number[], number[]] } }).geometry;
    assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
    assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
    assert.deepEqual(mesh.quaternion.toArray(), [0, 0, 0, 1]);
    const box = new THREE.Box3().setFromObject(mesh);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(box.min.getComponent(axis) - geometry.boundsMeters[0][axis]) < 1e-8, `${structure.id} minimum axis ${axis}`);
      assert.ok(Math.abs(box.max.getComponent(axis) - geometry.boundsMeters[1][axis]) < 1e-8, `${structure.id} maximum axis ${axis}`);
    }
  }
});

test('all imported surface vertices retain their resting display coordinates after pivot preparation', () => {
  const center = new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3());
  const display = new THREE.Group();
  display.rotation.z = DISPLAY_ROTATION_Z;
  const centered = new THREE.Group();
  centered.position.copy(center).negate();
  display.add(centered);
  let checked = 0;
  for (const source of meshes) {
    const mesh = source.clone();
    centered.add(mesh);
    recenterMeshGeometry(mesh);
    display.updateMatrixWorld(true);
    const originalPositions = source.geometry.getAttribute('position');
    const preparedPositions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < originalPositions.count; index++) {
      const actual = new THREE.Vector3().fromBufferAttribute(preparedPositions, index).applyMatrix4(mesh.matrixWorld);
      // Independently calculated +90 degree display rotation about the centred asset.
      const expected = new THREE.Vector3(
        -(originalPositions.getY(index) - center.y),
        originalPositions.getX(index) - center.x,
        originalPositions.getZ(index) - center.z,
      );
      assert.ok(actual.distanceTo(expected) < 1e-8, `${mesh.userData.structureId} vertex ${index}`);
      checked++;
    }
    mesh.geometry.dispose();
    centered.remove(mesh);
  }
  assert.equal(checked, atlas.statistics.surfaceVerticesIncludingRegionBoundaries);
});

test('a ray cast against the imported heart surface resolves its stable region ID', () => {
  const heart = meshes.find((mesh) => mesh.userData.structureId === 'digimouse:3')!;
  const positions = heart.geometry.getAttribute('position');
  const index = heart.geometry.index!;
  const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(0));
  const b = new THREE.Vector3().fromBufferAttribute(positions, index.getX(1));
  const c = new THREE.Vector3().fromBufferAttribute(positions, index.getX(2));
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  const centroid = a.clone().add(b).add(c).divideScalar(3);
  const ray = new THREE.Raycaster(centroid.clone().addScaledVector(normal, 0.001), normal.clone().negate());
  const intersections = ray.intersectObject(heart, false);
  assert.ok(intersections.length > 0, 'Expected an intersection with the actual heart triangles');
  assert.equal(intersections[0].object.userData.structureId, 'digimouse:3');
});
