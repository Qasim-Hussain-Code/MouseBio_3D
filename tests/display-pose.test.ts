/**
 * The display posture of the Digimouse references is inferred from the positions
 * of their own source regions. These checks repeat that inference on the shipped
 * surfaces; they do not verify the source axes or assign laterality.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bodySurfaceIdFor, displayPostureFor } from '../src/domain/display-pose';
import { createContactShadow, CONTACT_SHADOW, shadowFragment } from '../src/viewer/contact-shadow';
import type { Atlas } from '../src/domain/types';

async function surfaces(path: string): Promise<Map<string, THREE.BufferGeometry>> {
  const bytes = await readFile(new URL(path, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
  const result = new Map<string, THREE.BufferGeometry>();
  // Loaders sanitize node names; the source structure ID is kept in the node extras.
  gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) result.set(String(object.userData.structureId ?? object.name), object.geometry); });
  return result;
}

function centreZ(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  return (geometry.boundingBox!.min.z + geometry.boundingBox!.max.z) / 2;
}

/** Median native z of the skeleton within the kidneys' rostrocaudal range, relative to the body extent there. */
function trunkSkeletonHeight(skeleton: THREE.BufferGeometry, body: THREE.BufferGeometry, kidneys: THREE.BufferGeometry): number {
  kidneys.computeBoundingBox();
  const { min, max } = kidneys.boundingBox!;
  const values = (geometry: THREE.BufferGeometry) => {
    const position = geometry.getAttribute('position'), result: number[] = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      const y = position.getY(vertex);
      if (y >= min.y && y <= max.y) result.push(position.getZ(vertex));
    }
    return result.sort((left, right) => left - right);
  };
  const bone = values(skeleton), envelope = values(body);
  assert.ok(bone.length > 100 && envelope.length > 100);
  const low = envelope[0], high = envelope[envelope.length - 1];
  return (bone[Math.floor(bone.length / 2)] - low) / (high - low);
}

test('only the Digimouse references receive an inferred dorsal posture and a body surface', async () => {
  for (const path of ['atlas', 'atlas-volume', 'atlas-hindlimb', 'atlas-ema147', 'atlas-neuron', 'atlas-vascular', 'atlas-nerve']) {
    const atlas = JSON.parse(await readFile(new URL(`../public/${path}/atlas.json`, import.meta.url), 'utf8')) as Atlas;
    const posture = displayPostureFor(atlas), skin = bodySurfaceIdFor(atlas);
    assert.equal(!!posture, path === 'atlas' || path === 'atlas-volume', path);
    assert.equal(skin, path === 'atlas' ? 'digimouse:1' : path === 'atlas-volume' ? 'digimouse-volume:1' : null, path);
    if (posture) {
      assert.deepEqual(posture.up, [0, 0, 1]);
      assert.ok(Math.abs(Math.hypot(...posture.view) - 1) < 1e-12);
      assert.ok(posture.view[2] > 0, 'the default view is raised above the inferred ground');
      assert.match(posture.basis, /Laterality and calibration remain unverified/);
    }
  }
  assert.equal(bodySurfaceIdFor({ id: 'digimouse-volume-040-v1', structures: [] }), null);
});

test('in both Digimouse references the trunk skeleton and kidneys lie towards native +z and the heart and bladder towards native -z', async () => {
  for (const [file, prefix, labels] of [
    ['../public/atlas/digimouse.glb', 'digimouse', { body: 1, skeleton: 13, kidneys: [7, 8], heart: 3, bladder: 4 }],
    ['../public/atlas-volume/digimouse-volume-040.glb', 'digimouse-volume', { body: 1, skeleton: 2, kidneys: [19], heart: 9, bladder: 13 }],
  ] as const) {
    const regions = await surfaces(file);
    const get = (label: number) => { const geometry = regions.get(`${prefix}:${label}`); assert.ok(geometry, `${prefix}:${label} in ${[...regions.keys()].slice(0, 3)}`); return geometry; };
    const kidneyZ = labels.kidneys.map((label) => centreZ(get(label)));
    for (const z of kidneyZ) assert.ok(z > centreZ(get(labels.heart)) && z > centreZ(get(labels.bladder)), file);
    const height = trunkSkeletonHeight(get(labels.skeleton), get(labels.body), get(labels.kidneys[0]));
    assert.ok(height > 0.6, `${file}: trunk skeleton median relative height ${height.toFixed(3)}`);
  }
});

test('the contact shadow lies just under the displayed bounds and its program edit is guarded', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-2, -1, -0.5), new THREE.Vector3(2, 1, 0.5));
  const shadow = createContactShadow(bounds)!;
  assert.ok(shadow);
  assert.equal(shadow.group.position.z, -0.5 - 0.01);
  const plane = shadow.group.children.find((child) => child instanceof THREE.Mesh && child.visible) as THREE.Mesh<THREE.PlaneGeometry>;
  assert.equal(plane.geometry.parameters.width, 4 * CONTACT_SHADOW.margin);
  assert.equal(plane.geometry.parameters.height, 2 * CONTACT_SHADOW.margin);
  assert.equal(plane.scale.x, -1);
  shadow.dispose();
  assert.equal(createContactShadow(new THREE.Box3()), null);
  const edited = shadowFragment('void main() {\n\tgl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );\n}');
  assert.match(edited, /^uniform float darkness;/);
  assert.match(edited, /\( 1\.0 - fragCoordZ \) \* darkness/);
  assert.equal(shadowFragment('void main() {}'), 'void main() {}');
});
