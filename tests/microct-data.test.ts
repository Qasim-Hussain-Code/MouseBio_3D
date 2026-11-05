/**
 * The micro-CT reference of Rosenhain et al. (2018) as shipped: inventory, frame,
 * the dorsal inference used for its display posture and the departure of its
 * display-smoothed surfaces. Numerical checks, not anatomical review.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Atlas } from '../src/domain/types';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';
import { buildReferenceCatalog, getReference, validateReferenceAtlas } from '../src/domain/atlas-catalog';
import { bodySurfaceIdFor, displayPostureFor } from '../src/domain/display-pose';
import { smoothingOptionsFor } from '../src/domain/display-smoothing';
import { displayColour } from '../src/domain/tissue-palette';
import { smoothSurfaceGeometry } from '../src/viewer/surface-smoothing';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-microct/atlas.json', import.meta.url), 'utf8')) as Atlas;
const bytes = await readFile(new URL(`../public${atlas.assetUrl}`, import.meta.url));
const VOXEL_M = 0.00028;

async function regions(): Promise<Map<string, THREE.Mesh>> {
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const result = new Map<string, THREE.Mesh>();
  gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) result.set(String(object.userData.structureId), object); });
  return result;
}

test('the micro-CT manifest binds its catalog entry, checksum, inventory and source classes', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), atlas.statistics.glbSha256);
  assert.equal(bytes.length, atlas.statistics.glbBytes);
  assert.equal(atlas.structures.length, 11);
  assert.deepEqual(atlas.structures.map((region) => region.sourceLabel),
    ['1', 'Bone', 'Lung', 'Heart', 'Liver', 'Intestine', 'Bladder', 'Spleen', 'Stomach', 'Muscle', 'Kidneys']);
  assert.equal(atlas.structures[0].id, 'rosenhain2018-m01:Bed:1');
  assert.ok(atlas.structures.slice(1).every((region, index) => region.id === `rosenhain2018-m01:Organ1:${index + 1}`));
  assert.equal(atlas.source.license, 'CC0-1.0');
  assert.equal(atlas.coordinateFrame.physicalCalibrationVerified, false);
  assert.equal(atlas.coordinateFrame.anatomicalOrientationVerified, false);
  assert.equal(atlas.coordinateFrame.registrationToDigimouse, null);
  assert.equal(atlas.specimen?.sex, 'female');
  assert.equal(atlas.specimen?.age, undefined);
  assert.equal(atlas.specimen?.mass, undefined);
  const evidence = atlas.bodyEvidence as { fractionOfOrgan1VoxelsInside: number; medianCtValue: number };
  assert.ok(evidence.fractionOfOrgan1VoxelsInside > 0.99 && evidence.medianCtValue > 0);
  const agreement = (atlas.interSegmentationAgreement as { values: Record<string, number> }).values;
  assert.deepEqual(Object.keys(agreement).sort(), ['Bladder', 'Bone', 'Heart', 'Intestine', 'Kidneys', 'Liver', 'Lung', 'Muscle', 'Spleen', 'Stomach']);
  assert.ok(Object.values(agreement).every((value) => value > 0 && value < 1));
});

test('the shipped catalog validates the micro-CT reference without merging it with Digimouse', async () => {
  const catalog = buildReferenceCatalog(JSON.parse(await readFile(new URL('../data/anatomy-references.json', import.meta.url), 'utf8')));
  assert.equal(catalog.ok, true, catalog.errors.join(' '));
  const reference = getReference(catalog.catalog, atlas.id)!;
  assert.deepEqual(validateReferenceAtlas(reference, atlas), { ok: true, errors: [] });
  assert.deepEqual(reference.processingResolution.sourceVoxelSpacingMm, [0.28, 0.28, 0.28]);
  const groups = buildAnatomyGroups(atlas);
  assert.equal(groups.ok, true, groups.errors.join(' '));
  assert.deepEqual(groups.groups.map((group) => group.id), ['whole-mouse', 'skeleton', 'organs', 'digestive']);
  assert.equal(groups.groups.find((group) => group.id === 'organs')!.structureIds.length, 9);
  const relabelled = structuredClone(atlas); relabelled.structures[5].sourceLabel = 'Pancreas';
  assert.equal(buildAnatomyGroups(relabelled).ok, false);
  assert.equal(bodySurfaceIdFor(atlas), 'rosenhain2018-m01:Bed:1');
  assert.equal(displayColour(atlas.structures[0]), '#e3b5a4');
  assert.equal(displayColour(atlas.structures[0], 'source'), atlas.structures[0].color);
});

test('every region loads untransformed in metres on the 0.28 mm grid with its declared counts and bounds', async () => {
  const meshes = await regions();
  assert.equal(meshes.size, atlas.structures.length);
  for (const region of atlas.structures) {
    const mesh = meshes.get(region.id)!;
    const geometry = (region as unknown as { geometry: { triangles: number; vertices: number; boundsMeters: number[][] } }).geometry;
    assert.ok(mesh, region.id);
    assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
    assert.deepEqual(mesh.quaternion.toArray(), [0, 0, 0, 1]);
    assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
    assert.equal(mesh.geometry.index!.count / 3, geometry.triangles);
    assert.equal(mesh.geometry.getAttribute('position').count, geometry.vertices);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(box.min.getComponent(axis) - geometry.boundsMeters[0][axis]) < 1e-7);
      assert.ok(Math.abs(box.max.getComponent(axis) - geometry.boundsMeters[1][axis]) < 1e-7);
      // Vertices lie on voxel-centre or half-voxel positions of the declared grid.
      const half = box.min.getComponent(axis) / (VOXEL_M / 2);
      assert.ok(Math.abs(half - Math.round(half)) < 1e-3, `${region.id} axis ${axis}`);
    }
    assert.ok(box.max.x < 142 * VOXEL_M && box.max.y < 105 * VOXEL_M && box.max.z < 200 * VOXEL_M);
  }
});

test('kidneys, spleen and trunk bone lie towards native -y and the heart and bladder towards native +y', async () => {
  const meshes = await regions();
  const box = (id: string) => { const geometry = meshes.get(id)!.geometry; geometry.computeBoundingBox(); return geometry.boundingBox!; };
  const centre = (id: string) => box(id).getCenter(new THREE.Vector3());
  const organ = (index: number) => `rosenhain2018-m01:Organ1:${index}`;
  const [kidneys, spleen, heart, bladder] = [10, 7, 3, 6].map((index) => centre(organ(index)));
  for (const dorsal of [kidneys, spleen]) for (const ventral of [heart, bladder]) assert.ok(dorsal.y < ventral.y);
  assert.ok(heart.z > bladder.z, 'the head lies towards native +z');
  const kidneyBox = box(organ(10));
  const bone = meshes.get(organ(1))!.geometry.getAttribute('position'), body = meshes.get('rosenhain2018-m01:Bed:1')!.geometry.getAttribute('position');
  const ys = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const values: number[] = [];
    for (let vertex = 0; vertex < attribute.count; vertex++) {
      const z = attribute.getZ(vertex);
      if (z >= kidneyBox.min.z && z <= kidneyBox.max.z) values.push(attribute.getY(vertex));
    }
    return values.sort((left, right) => left - right);
  };
  const boneY = ys(bone), bodyY = ys(body);
  const relative = (boneY[Math.floor(boneY.length / 2)] - bodyY[0]) / (bodyY[bodyY.length - 1] - bodyY[0]);
  assert.ok(relative < 0.4, `trunk bone median relative native y ${relative.toFixed(3)}`);
  const posture = displayPostureFor(atlas)!;
  assert.deepEqual(posture.up, [1, 0, 0]);
  // Native -y becomes display +x under the presentation rotation of 90 degrees about display z.
  const dorsal = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  assert.ok(dorsal.distanceTo(new THREE.Vector3(...posture.up)) < 1e-12);
  assert.ok(posture.view[0] > 0, 'the default view is raised above the inferred ground');
  assert.ok(posture.view[2] > 0, 'the default view leans towards the head');
});

test('display smoothing of the micro-CT surfaces keeps triangles and moves vertices less than two voxels', async () => {
  const options = smoothingOptionsFor(atlas)!;
  assert.ok(options);
  const meshes = await regions();
  for (const id of ['rosenhain2018-m01:Organ1:3', 'rosenhain2018-m01:Organ1:10', 'rosenhain2018-m01:Organ1:6']) {
    const source = meshes.get(id)!.geometry;
    const smoothed = smoothSurfaceGeometry(source, options);
    assert.deepEqual(smoothed.index!.array, source.index!.array);
    const a = source.getAttribute('position'), b = smoothed.getAttribute('position');
    let largest = 0;
    for (let vertex = 0; vertex < a.count; vertex++) largest = Math.max(largest, Math.hypot(a.getX(vertex) - b.getX(vertex), a.getY(vertex) - b.getY(vertex), a.getZ(vertex) - b.getZ(vertex)));
    assert.ok(largest < 2 * VOXEL_M, `${id} largest displacement ${(largest * 1000).toFixed(3)} mm`);
  }
});
