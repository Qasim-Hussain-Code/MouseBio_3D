import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { WindowShape } from '../src/viewer/dissection-window';
import { createZoomUnfold, type ZoomUnfold } from '../src/viewer/zoom-unfold';

const BODY_RADIUS = 0.02;

/** A round animal with one layer inside it, a camera and a clock that this test turns by hand. */
function scene(options: { readonly from?: THREE.Vector3; readonly target?: THREE.Vector3 } = {}) {
  const skin = new THREE.Mesh(new THREE.SphereGeometry(BODY_RADIUS, 16, 12));
  const organ = new THREE.Mesh(new THREE.SphereGeometry(BODY_RADIUS * 0.6, 16, 12));
  for (const mesh of [skin, organ]) mesh.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.0001, 10);
  camera.position.copy(options.from ?? new THREE.Vector3(0, -0.2, 0));
  camera.up.set(0, 0, 1);
  const target = (options.target ?? new THREE.Vector3()).clone();
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const controls = { target, update() { camera.lookAt(target); camera.updateMatrixWorld(true); } } as unknown as OrbitControls;
  const through: { x: number; y: number; playing: boolean }[] = [];
  const unfolder = createZoomUnfold({
    camera, controls,
    allowed: () => true,
    outerSurfaces: () => [skin],
    surfaces: () => [['skin', skin], ['organ', organ]],
    tierOf: () => 'skin-fat' as never,
    shapeAt: (point, outward) => {
      const normal = outward.clone().normalize();
      const up = new THREE.Vector3(0, 0, 1).addScaledVector(normal, -normal.z).normalize();
      const shape: WindowShape = { a: point.clone(), b: point.clone(), normal, up, along: new THREE.Vector3().crossVectors(up, normal).normalize(), radius: 0.012, depth: BODY_RADIUS * 1.2, front: 0.006, hinge: () => 0 };
      return { shape, thickness: BODY_RADIUS * 2 };
    },
    closest: () => 0.0036, furthest: () => 0.7,
    onOpen: () => {}, onClose: () => {},
    onThrough: (x, y, playing) => { through.push({ x, y, playing }); },
  });
  return { camera, controls, unfolder, through };
}

function run(unfolder: ZoomUnfold, through: readonly unknown[], fps: number, longest: number) {
  const delta = 1 / fps;
  let seconds = 0;
  while (!through.length && seconds < longest) { unfolder.update(delta); seconds += delta; }
  return seconds;
}

for (const fps of [5, 15, 30, 60, 144]) {
  test(`one press of Play goes on past the last layer by itself at ${fps} frames a second`, () => {
    const { unfolder, through } = scene();
    unfolder.play('in');
    const seconds = run(unfolder, through, fps, 90);
    assert.equal(through.length, 1, `Play had not gone on after ${seconds.toFixed(1)} s`);
    assert.equal((through[0] as { playing: boolean }).playing, true, 'the next part is told that it is still playing');
    assert.equal(unfolder.playing(), null);
    assert.ok(seconds < 45, `Play took ${seconds.toFixed(1)} s to pass through the layers`);
  });
}

test('the pace of Play does not depend on the frame rate', () => {
  const times = [10, 30, 60, 144].map((fps) => {
    const { unfolder, through } = scene();
    unfolder.play('in');
    return run(unfolder, through, fps, 90);
  });
  assert.ok(Math.max(...times) - Math.min(...times) < 2, `times differ: ${times.map((time) => time.toFixed(1)).join(', ')}`);
});

test('the view keeps narrowing through every moment of Play, so that it never seems to have stopped', () => {
  const { camera, controls, unfolder, through } = scene();
  unfolder.play('in');
  let last = camera.position.distanceTo(controls.target), frames = 0, flat = 0;
  while (!through.length && frames < 6000) {
    unfolder.update(1 / 30);
    const now = camera.position.distanceTo(controls.target);
    if (now >= last) flat += 1;
    last = now;
    frames += 1;
  }
  assert.equal(through.length, 1);
  assert.equal(flat, 0, `the distance stood still in ${flat} of ${frames} frames`);
});

test('Play from a view that has drifted off the animal comes to the animal and goes on', () => {
  const { unfolder, through } = scene({ from: new THREE.Vector3(0.09, -0.2, 0.05), target: new THREE.Vector3(0.09, 0, 0.05) });
  unfolder.play('in');
  const seconds = run(unfolder, through, 30, 90);
  assert.equal(through.length, 1, `Play had not gone on after ${seconds.toFixed(1)} s: the opening never happened`);
  assert.ok(unfolder.open());
});

test('Play stops when the wheel takes over, and the wheel does not then go on by itself', () => {
  const { unfolder, through } = scene();
  unfolder.play('in');
  for (let frame = 0; frame < 30; frame += 1) unfolder.update(1 / 30);
  unfolder.wheel(-30, 0, 0);
  assert.equal(unfolder.playing(), null);
  for (let frame = 0; frame < 600; frame += 1) unfolder.update(1 / 30);
  assert.equal(through.length, 0);
});

test('Stop halts Play where it is', () => {
  const { camera, controls, unfolder, through } = scene();
  unfolder.play('in');
  for (let frame = 0; frame < 300; frame += 1) unfolder.update(1 / 30);
  unfolder.play(null);
  const here = camera.position.distanceTo(controls.target);
  for (let frame = 0; frame < 300; frame += 1) unfolder.update(1 / 30);
  assert.equal(through.length, 0);
  assert.ok(Math.abs(camera.position.distanceTo(controls.target) - here) < 1e-9);
});
