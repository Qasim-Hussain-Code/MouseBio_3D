import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { DISSECTION_NOTICE, DISSECTION_PLACES, DISSECTION_TIERS, dissectionAppliesTo, dissectionTier, namesToShow, orderHere, placeNameFromBone, tierFold, tierProgress, tierRadius, type HereItem } from '../src/domain/dissection';
import type { Atlas } from '../src/domain/types';
import { layoutPlate } from '../src/viewer/label-layout';
import { findInWindow, foldMatrix, insideWindow, windowCoordinates, type WindowShape } from '../src/viewer/dissection-window';
import { createOpeningMark } from '../src/viewer/id-pass';
import { windowFragment, windowVertex, WINDOW_TEST } from '../src/viewer/surface-shading';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const tierOf = (id: string) => dissectionTier(atlas.structures.find((structure) => structure.id === `living:${id}`)!);
const open = { opening: 1, folded: true, cutOrgans: false };

test('all layers together applies to the living mouse only, and every structure has a layer', () => {
  assert.ok(dissectionAppliesTo(atlas));
  assert.ok(!dissectionAppliesTo({ id: 'digimouse-volume-040-v1' }));
  const known = new Set(DISSECTION_TIERS.map((tier) => tier.id));
  for (const structure of atlas.structures) assert.ok(known.has(dissectionTier(structure)), structure.id);
  for (const tier of DISSECTION_TIERS) assert.ok(atlas.structures.some((structure) => dissectionTier(structure) === tier.id), tier.id);
});

test('structures fall in the layer an anatomist would meet them in', () => {
  assert.equal(tierOf('skin'), 'skin');
  assert.equal(tierOf('fat'), 'fat');
  assert.equal(tierOf('brown-fat'), 'fat');
  assert.equal(tierOf('panniculus'), 'panniculus');
  assert.equal(tierOf('muscle-biceps-femoris'), 'outer-muscle');
  assert.equal(tierOf('muscle-semimembranosus'), 'inner-muscle');
  assert.equal(tierOf('pleura'), 'lining');
  assert.equal(tierOf('bone-femur-r'), 'skeleton');
  for (const id of ['heart-lv', 'liver-median', 'cerebrum', 'eyes', 'small-intestine']) assert.equal(tierOf(id), 'organs', id);
  for (const id of ['sciatic-nerves', 'femoral-arteries', 'lateral-saphenous-veins', 'spinal-cord', 'lymph-vessels']) assert.equal(tierOf(id), 'vessels-nerves', id);
});

test('each layer opens less than the one above it, so that all can be seen, and vessels and nerves are never cut', () => {
  const cut = DISSECTION_TIERS.filter((tier) => tier.width > 0);
  for (let i = 1; i < cut.length; i++) assert.ok(tierRadius(cut[i].id, 0.01, open) < tierRadius(cut[i - 1].id, 0.01, open), cut[i].id);
  assert.equal(tierRadius('vessels-nerves', 0.01, open), 0);
  assert.equal(tierRadius('vessels-nerves', 0.01, { ...open, cutOrgans: true }), 0);
  assert.equal(tierRadius('organs', 0.01, open), 0);
  assert.ok(tierRadius('organs', 0.01, { ...open, cutOrgans: true }) > 0);
});

test('opening runs from closed to open, outer layers first', () => {
  for (const tier of DISSECTION_TIERS) {
    assert.equal(tierProgress(tier.id, 0), 0, tier.id);
    if (tier.width > 0) assert.equal(tierProgress(tier.id, 1), 1, tier.id);
  }
  for (const opening of [0.1, 0.3, 0.5]) assert.ok(tierProgress('skin', opening) >= tierProgress('inner-muscle', opening));
  assert.equal(tierRadius('skin', 0.01, { ...open, opening: 0 }), 0);
  assert.equal(tierFold('skin', { ...open, folded: false }), 0);
  assert.ok(tierFold('skin', open) > 90);
  assert.equal(tierFold('skeleton', open), 0);
});

test('the display is declared as a display, and each place names bones that exist', () => {
  assert.match(DISSECTION_NOTICE, /not a dissection of an animal/);
  const ids = new Set(atlas.structures.map((structure) => structure.id.replace(/^living:/, '')));
  for (const place of DISSECTION_PLACES) {
    for (const bone of place.bones) assert.ok(ids.has(bone) || ids.has(`${bone}-r`), `${place.id} ${bone}`);
    if (place.surface) assert.ok(ids.has(place.surface), `${place.id} opens ${place.surface}`);
  }
});

test('what lies at a place is listed from the outside inwards', () => {
  const item = (id: string, tier: HereItem['tier'], depth: number): HereItem => ({ id, name: id, tier, depth });
  const order = orderHere([item('bone', 'skeleton', 1), item('deep', 'outer-muscle', 3), item('near', 'outer-muscle', 1), item('skin', 'skin', 0), item('nerve', 'vessels-nerves', 0.5)]);
  assert.deepEqual(order.map((value) => value.id), ['skin', 'near', 'deep', 'bone', 'nerve']);
});

test('names go to every layer in turn, the selection first, and specks get none', () => {
  const seen = [{ id: 'skin', tier: 'skin', pixels: 9000 }, { id: 'muscle-a', tier: 'outer-muscle', pixels: 500 }, { id: 'muscle-b', tier: 'outer-muscle', pixels: 400 }, { id: 'nerve', tier: 'vessels-nerves', pixels: 20 }, { id: 'speck', tier: 'organs', pixels: 2 }] as const;
  const names = namesToShow(seen, 'nerve');
  assert.equal(names[0].id, 'nerve');
  assert.ok(!names.some((item) => item.id === 'speck'));
  assert.deepEqual(names.slice(1, 3).map((item) => item.id), ['skin', 'muscle-a']);
  assert.ok(names.findIndex((item) => item.id === 'muscle-b') > names.findIndex((item) => item.id === 'muscle-a'));
});

test('a place takes a plain name from its nearest bone', () => {
  assert.equal(placeNameFromBone('living:bone-femur-r'), 'Right thigh');
  assert.equal(placeNameFromBone('living:bone-tibia-l'), 'Left shank');
  assert.equal(placeNameFromBone('living:bone-rib-4-l'), 'Left chest wall');
  assert.equal(placeNameFromBone('living:bone-frontal'), 'Head');
  assert.equal(placeNameFromBone('living:bone-c3'), 'Neck');
  assert.equal(placeNameFromBone('living:tail-vertebrae'), 'Tail');
});

test('names on the plate stand in two columns, without overlap, and keep their anchors', () => {
  const candidates = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: i % 4 ? `Short ${i}` : `A much longer name that takes two lines of the column ${i}`, x: i % 2 ? 200 : 800, y: 60 + i * 20, depth: 0, priority: 30 - i }));
  const placed = layoutPlate(candidates, { width: 1000, height: 700, columnWidth: 200, topLeft: 100, topRight: 170, bottomLeft: 200, bottomRight: 190 });
  assert.ok(placed.length > 10);
  for (const label of placed) {
    assert.ok(label.left === 8 || label.left === 792, String(label.left));
    assert.ok(label.top >= 100 && label.top + label.height <= 510, `${label.top} ${label.height}`);
    const source = candidates.find((candidate) => candidate.id === label.id)!;
    assert.equal(label.anchorX, source.x);
    assert.equal(label.anchorY, source.y);
  }
  for (const a of placed) for (const b of placed) if (a !== b && a.left === b.left) assert.ok(a.top + a.height <= b.top || b.top + b.height <= a.top, `${a.id} ${b.id}`);
  assert.deepEqual(layoutPlate(candidates, { width: 300, height: 700, columnWidth: 200, topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 }), []);
});

const shape: WindowShape = {
  a: new THREE.Vector3(0, -0.01, 0), b: new THREE.Vector3(0, 0.01, 0), normal: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1), along: new THREE.Vector3(0, 1, 0),
  radius: 0.005, depth: 0.01, front: 0.002, hinge: () => 0.001,
};

test('the opening is a band round a segment, seen along its normal, down to a depth', () => {
  const inside = (x: number, y: number, z: number) => insideWindow(shape, new THREE.Vector3(x, y, z), 0.005);
  assert.ok(inside(-0.001, 0, 0.004));
  assert.ok(inside(-0.009, 0.01, 0));
  assert.ok(!inside(-0.011, 0, 0), 'too deep');
  assert.ok(!inside(0.003, 0, 0), 'too far in front');
  assert.ok(!inside(-0.001, 0, 0.006), 'too far across');
  assert.ok(!inside(-0.001, 0.016, 0), 'beyond the end');
  assert.ok(inside(-0.001, 0.014, 0), 'round the end');
  assert.ok(!insideWindow(shape, new THREE.Vector3(-0.001, 0, 0), 0));
  const where = windowCoordinates(shape, new THREE.Vector3(-0.002, 0.02, 0.003));
  assert.ok(Math.abs(where.depth - 0.002) < 1e-12);
  assert.ok(Math.abs(where.rho - Math.hypot(0.01, 0.003)) < 1e-12);
});

test('a folded layer turns rigidly about the top of its opening, with its lower edge coming outwards first', () => {
  const pivot = new THREE.Vector3(0, 0, 0.005).addScaledVector(shape.normal, -shape.hinge(0.005));
  assert.ok(pivot.clone().applyMatrix4(foldMatrix(shape, 0.005, 90)).distanceTo(pivot) < 1e-12);
  const low = new THREE.Vector3(-0.001, 0, -0.005), other = new THREE.Vector3(-0.002, 0.004, 0.001);
  const turn = foldMatrix(shape, 0.005, 40);
  assert.ok(Math.abs(low.clone().applyMatrix4(turn).distanceTo(other.clone().applyMatrix4(turn)) - low.distanceTo(other)) < 1e-12, 'rigid');
  assert.ok(low.clone().applyMatrix4(turn).x > low.x, 'outwards');
  const back = foldMatrix(shape, 0.005, 170);
  assert.ok(low.clone().applyMatrix4(back).z > 0.005, 'folded over, above the hinge');
});

test('finding what lies in the opening reads the vertices, so a thin nerve is found', () => {
  const mesh = (points: number[]) => new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3)));
  const found = findInWindow(shape, 0.005, [['nerve', mesh([-0.002, 0, 0, -0.004, 0.002, 0])], ['outside', mesh([-0.002, 0, 0.02])], ['deep', mesh([-0.02, 0, 0])]]);
  assert.deepEqual(found.map((item) => item.id), ['nerve']);
  assert.ok(Math.abs(found[0].depth - 0.002) < 1e-6);
  assert.equal(found[0].count, 2);
});

test('the mark of an opening leaves no colour and no depth, only a stencil where the skin was taken out', () => {
  const uniforms = { uWinOn: { value: 1 }, uWinInvert: { value: 0 } };
  const mark = createOpeningMark(new THREE.BufferGeometry(), uniforms);
  const made = mark.material as THREE.ShaderMaterial;
  assert.equal(made.colorWrite, false);
  assert.equal(made.depthWrite, false);
  assert.equal(made.stencilWrite, true);
  assert.equal(made.stencilZPass, THREE.ReplaceStencilOp);
  assert.equal(made.stencilRef, 1);
  assert.equal(made.uniforms.uWinInvert.value, 1, 'it keeps the part taken out');
  assert.equal(uniforms.uWinInvert.value, 0, 'the display of the skin is not changed');
  assert.equal(made.uniforms.uWinOn, uniforms.uWinOn, 'it follows the same opening');
  assert.ok(mark.renderOrder < 0);
});

test('the drawing programs test the opening, and an unknown program is left alone', () => {
  assert.equal(windowFragment('void main(){}'), 'void main(){}');
  assert.equal(windowVertex('void main(){}'), 'void main(){}');
  const fragment = windowFragment('#include <common>\nvoid main(){\n#include <clipping_planes_fragment>\n#include <color_fragment>\n}');
  assert.ok(fragment.includes(WINDOW_TEST));
  assert.match(WINDOW_TEST, /discard/);
  assert.match(windowVertex('#include <common>\nvoid main(){\n#include <begin_vertex>\n}'), /vWinWorld = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz/);
});
