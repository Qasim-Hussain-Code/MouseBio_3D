import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { bodyCoat, FLANK_LINE, shortCoat, type CoatLandmarks } from '../scripts/living/coat';
import { blob } from '../scripts/living/internal';
import { GROUND_Z, length, stancePose, sub, type Vec3 } from '../scripts/living/rig';
import type { Surface } from '../scripts/living/surface-nets';
import { COATS, createFur, fineHairOptions, FUR_DISPLAY, scatterHairs } from '../src/viewer/fur';
import { coatFragment, coatVertex, installSurfaceShading } from '../src/viewer/surface-shading';

const marks: CoatLandmarks = {
  joints: stancePose().joints,
  eyes: [[150, 150, 130], [212, 150, 130]],
  earRoots: [[130, 250, 170], [232, 250, 170]],
  tip: [181, 60, 90],
  mouth: [[140, 130, 70]],
};

/** Loose vertices: the coat reads only positions and normals. Central points set the outline of the body along y. */
function points(rows: readonly (readonly [Vec3, Vec3])[], top = 200, bottom = 0): { surface: Surface; first: number } {
  const outline: [Vec3, Vec3][] = [];
  for (let y = 0; y <= 1000; y += 6) outline.push([[181, y, top], [0, 0, 1]], [[181, y, bottom], [0, 0, -1]]);
  const all = [...outline, ...rows];
  return {
    first: outline.length,
    surface: { positions: Float32Array.from(all.flatMap(([p]) => p)), normals: Float32Array.from(all.flatMap(([, n]) => n)), indices: new Uint32Array(0) },
  };
}

test('the back of the coat is dark, the belly is pale and the border lies low on the flank', () => {
  const body = blob([181, 400, 100], [60, 300, 80], 40, 60);
  const { coat } = bodyCoat(body, marks);
  for (let i = 0; i < coat.length; i++) {
    const z = body.positions[3 * i + 2];
    if (body.normals[3 * i + 2] > 0.9 && z > 170) assert.ok(coat[i] < -0.5, `back ${coat[i]}`);
    if (body.normals[3 * i + 2] < -0.9 && z < 30) assert.ok(coat[i] > 0, `belly ${coat[i]}`);
  }
  const { surface, first } = points([[[181, 500, FLANK_LINE * 200], [1, 0, 0]], [[181, 500, FLANK_LINE * 200 + 40], [1, 0, 0]], [[181, 500, FLANK_LINE * 200 - 20], [0, 0, -1]]]);
  const flank = bodyCoat(surface, marks).coat;
  assert.ok(Math.abs(flank[first]) < 0.02, `the border ${flank[first]}`);
  assert.ok(flank[first + 1] < 0, 'above the border');
  assert.ok(flank[first + 2] > 0, 'below the border');
});

test('below the flank line the outer side of the thigh stays dark, and the inner side and the paws are pale', () => {
  const { hipR, kneeR, wristR } = marks.joints;
  // The outline is set high, so that the middle of the thigh falls below the flank line.
  const thigh: Vec3 = [(hipR[0] + kneeR[0]) / 2, (hipR[1] + kneeR[1]) / 2, (hipR[2] + kneeR[2]) / 2];
  const { surface, first } = points([[thigh, [-1, 0, 0]], [thigh, [1, 0, 0]], [wristR, [-1, 0, 0]]], 300, 100);
  const { coat } = bodyCoat(surface, marks);
  assert.ok(coat[first] < 0, `outer side ${coat[first]}`);
  assert.ok(coat[first + 1] > 0, `inner side ${coat[first + 1]}`);
  assert.ok(coat[first + 2] > 0, `towards the paw ${coat[first + 2]}`);
});

test('hair is full on the back and short round the eyes, ear roots and mouth and down the limbs', () => {
  const { elbowR, wristR, ankleL, kneeL } = marks.joints;
  const middle = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const rows: [Vec3, Vec3][] = [
    [[181, 450, 200], [0, 0, 1]],
    [marks.eyes[0], [0, 0, 1]], [marks.earRoots[0], [0, 0, 1]], [marks.mouth[0], [-1, 0, 0]],
    [middle(elbowR, wristR), [-1, 0, 0]], [wristR, [-1, 0, 0]], [ankleL, [1, 0, 0]], [middle(kneeL, ankleL), [1, 0, 0]],
  ];
  const { surface, first } = points(rows);
  const { fur } = bodyCoat(surface, marks);
  const hair = (i: number) => fur[4 * (first + i) + 3];
  assert.equal(hair(0), 1);
  assert.equal(hair(1), 0, 'the eye is clear');
  assert.ok(hair(2) <= 0.3, 'short at the ear root');
  assert.ok(hair(3) < hair(0) && hair(3) > 0, 'short at the mouth');
  assert.ok(hair(4) < 0.5 && hair(4) > hair(5), 'shorter towards the wrist');
  assert.ok(hair(5) > 0, 'hair stays on the wrist, where it meets the paw');
  assert.ok(hair(6) > 0 && hair(6) < hair(7), 'shorter towards the ankle');
  for (let i = 0; i < 8; i++) {
    const direction = [fur[4 * (first + i)], fur[4 * (first + i) + 1], fur[4 * (first + i) + 2]] as const;
    const normal = rows[i][1];
    assert.ok(Math.abs(direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2]) < 1e-5, 'combing lies along the skin');
  }
});

test('fine hair grows on the backs of paws, on the ears except their opening, and along the tail, and not on other parts', () => {
  const up: Vec3 = [0, 0, 1], down: Vec3 = [0, 0, -1];
  const { surface } = points([]);
  assert.equal(shortCoat('eyes', surface, marks), undefined);
  assert.equal(shortCoat('claws', surface, marks), undefined);
  const paw: Surface = { positions: Float32Array.from([0, 0, 10, 0, 0, 0]), normals: Float32Array.from([...up, ...down]), indices: new Uint32Array(0) };
  const pawCoat = shortCoat('forepaws', paw, marks)!;
  assert.ok(pawCoat.fur[3] > 0, 'the back of the paw');
  assert.equal(pawCoat.fur[7], 0, 'the sole');
  assert.ok(pawCoat.fur[1] < -0.9, 'hair lies towards the digits');
  const ear: Surface = { positions: Float32Array.from([120, 250, 200, 125, 250, 180]), normals: Float32Array.from([1, 0, 0, 1, 0, 0]), indices: new Uint32Array(0), colors: Float32Array.from([1, 1, 1, 0.1, 0.1, 0.1]) };
  const earCoat = shortCoat('pinnae', ear, marks)!;
  assert.ok(earCoat.fur[3] > 0);
  assert.equal(earCoat.fur[7], 0, 'the dark opening is bare');
  const rings = 3, sides = 14;
  const tailPositions: number[] = [], tailNormals: number[] = [];
  for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
    const angle = 2 * Math.PI * s / sides;
    tailPositions.push(Math.cos(angle), 900 + 10 * r, Math.sin(angle));
    tailNormals.push(Math.cos(angle), 0, Math.sin(angle));
  }
  tailPositions.push(0, 900, 0, 0, 920, 0); tailNormals.push(0, -1, 0, 0, 1, 0);
  const tail: Surface = { positions: Float32Array.from(tailPositions), normals: Float32Array.from(tailNormals), indices: new Uint32Array(0) };
  const tailCoat = shortCoat('tail', tail, marks)!;
  assert.ok(tailCoat.fur[1] > 0.99, 'hair lies along the tail towards its tip');
  assert.ok(tailCoat.fur[3] > 0);
});

test('the hairs carry the coat pattern, and fine hair takes the colour of its part', () => {
  const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const vertices = geometry.getAttribute('position').count;
  const fur = new Float32Array(4 * vertices), coat = new Float32Array(vertices);
  for (let i = 0; i < vertices; i++) { fur.set([0, 1, 0, 1], 4 * i); coat[i] = geometry.getAttribute('position').getZ(i) > 0 ? -0.5 : 0.5; }
  geometry.setAttribute('_fur', new THREE.BufferAttribute(fur, 4));
  geometry.setAttribute('_coat', new THREE.BufferAttribute(coat, 1));
  const hairs = scatterHairs(geometry);
  assert.ok(hairs.coats.some((value) => value < 0) && hairs.coats.some((value) => value > 0));
  assert.ok(hairs.coats.every((value) => value >= -0.5 && value <= 0.5));
  // A plain surface with no pattern is treated as the back.
  geometry.deleteAttribute('_coat');
  assert.ok(scatterHairs(geometry).coats.every((value) => value === 0));

  const options = fineHairOptions('living:tail');
  assert.ok(options.density! < FUR_DISPLAY.density / 2, 'the tail is sparsely haired');
  const layer = createFur(new THREE.Mesh(geometry), options)!;
  const uniforms = (layer.mesh.material as THREE.ShaderMaterial).uniforms;
  for (const id of ['agouti', 'black', 'albino'] as const) {
    layer.setCoat(id);
    const expected = new THREE.Color(COATS[id].parts['living:tail']).multiplyScalar(1.04);
    assert.ok(Math.abs(uniforms.uBand.value.r - expected.r) < 1e-6);
    for (const part of ['living:pinnae', 'living:tail', 'living:forepaws', 'living:hindpaws', 'living:nose']) assert.ok(COATS[id].parts[part], part);
  }
  layer.dispose();
  assert.ok(new THREE.Color(COATS.agouti.parts['living:pinnae']).getHSL({ h: 0, s: 0, l: 0 }).l < new THREE.Color(COATS.albino.parts['living:pinnae']).getHSL({ h: 0, s: 0, l: 0 }).l, 'a pigmented ear is darker than an albino ear');
});

test('the skin under a coat can follow the pattern, and only where it is asked to', () => {
  const vertex = '#include <common>\n#include <begin_vertex>', fragment = '#include <common>\n#include <color_fragment>';
  assert.match(coatVertex(vertex), /attribute float _coat/);
  assert.match(coatFragment(fragment), /uUnderBelly/);
  assert.equal(coatVertex('void main() {}'), 'void main() {}');
  assert.equal(coatFragment('void main() {}'), 'void main() {}');
  const plain = new THREE.MeshPhysicalMaterial(), skin = new THREE.MeshPhysicalMaterial();
  const uniforms = installSurfaceShading(plain);
  installSurfaceShading(skin);
  skin.defines = { ...skin.defines, USE_COAT: 1 };
  assert.equal(uniforms.uCoatOn.value, 0);
  assert.notEqual(plain.customProgramCacheKey(), skin.customProgramCacheKey());
});

test('the stance stands with the knee high and the ankle under the hip', () => {
  const { joints, groundZ } = stancePose();
  assert.equal(groundZ, GROUND_Z);
  for (const [hip, knee, ankle] of [[joints.hipR, joints.kneeR, joints.ankleR], [joints.hipL, joints.kneeL, joints.ankleL]] as const) {
    assert.ok(Math.abs(ankle[1] - hip[1]) < 60, `ankle at ${ankle[1]}, hip at ${hip[1]}`);
    const shank = sub(ankle, knee);
    assert.ok(-shank[2] / length(shank) > 0.45, 'the shank slopes steeply');
  }
  for (const [elbow, wrist] of [[joints.elbowR, joints.wristR], [joints.elbowL, joints.wristL]] as const) {
    const forearm = sub(wrist, elbow);
    assert.ok(-forearm[2] / length(forearm) > 0.6, 'the forearm slopes steeply');
  }
});
