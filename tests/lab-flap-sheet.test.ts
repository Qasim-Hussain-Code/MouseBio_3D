import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HINGE_STATIONS } from '../src/viewer/life-field';
import { createFlapSheet, createSurfaceProbe, flapSpindle, sampleAcross, type SheetShape } from '../src/viewer/lab-flap-sheet';

/** A body lying along x, as a round bar of radius 12 mm. Its top runs along z = 12 mm. */
const RADIUS = 0.012;
const bar = () => {
  const geometry = new THREE.CylinderGeometry(RADIUS, RADIUS, 0.09, 180, 90, true);
  geometry.rotateZ(Math.PI / 2);
  // Standing as it does with x along the bar, its top is +z once it is turned about x.
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
};
const region = () => new THREE.Box3(new THREE.Vector3(-0.05, -0.03, -0.03), new THREE.Vector3(0.05, 0.03, 0.03));
const shape = (side: 1 | -1 = 1): SheetShape => ({ a: new THREE.Vector3(-0.015, 0, RADIUS), b: new THREE.Vector3(0.015, 0, RADIUS), out: new THREE.Vector3(0, side, 0), up: new THREE.Vector3(0, 0, 1), widest: 0.012 });

test('the surface is found along a ray', () => {
  const probe = createSurfaceProbe([bar()], region());
  const distance = probe.along(new THREE.Vector3(0, 0, 0.018), new THREE.Vector3(0, 0, -1), 0.012);
  assert.ok(Math.abs(distance - (0.018 - RADIUS)) < 0.0002, `distance ${distance}`);
  assert.equal(probe.along(new THREE.Vector3(0, 0, 0.03), new THREE.Vector3(0, 0, 1), 0.005), -1, 'nothing that way');
});

test('a sheet follows the curve of the body away from the cut', () => {
  const samples = sampleAcross(createSurfaceProbe([bar()], region()), shape());
  const middle = Math.floor(samples.stations / 2);
  for (const row of [0, 10, 20]) {
    const at = (middle * samples.rows + row) * 3, x = samples.curve[at], z = samples.curve[at + 1];
    const distance = Math.hypot(x, z + RADIUS);
    assert.ok(Math.abs(distance - RADIUS) < 0.00035, `row ${row}: ${x} ${z} is ${distance} from the centre`);
  }
  assert.ok(samples.reach[middle] >= 0.0118, `it can be followed the whole width: ${samples.reach[middle]}`);
});

test('it stops where the surface has gone round the side', () => {
  const samples = sampleAcross(createSurfaceProbe([bar()], region()), { ...shape(), widest: 0.024 });
  const middle = Math.floor(samples.stations / 2);
  const angle = samples.reach[middle] / RADIUS;
  assert.ok(angle < THREE.MathUtils.degToRad(84), `stopped at ${THREE.MathUtils.radToDeg(angle)} degrees`);
  assert.ok(angle > THREE.MathUtils.degToRad(60), `not too soon: ${THREE.MathUtils.radToDeg(angle)} degrees`);
});

const sheetOf = (side: 1 | -1 = 1) => createFlapSheet(createSurfaceProbe([bar()], region()), shape(side), 'skin', '#775544', (rest) => rest.clone(), null);

test('drawn back, its edge lies out beyond the fold, above the body, and its inner side faces up', () => {
  for (const side of [1, -1] as const) {
    const sheet = sheetOf(side);
    sheet.setOpen(0.9);
    const edge = sheet.edge();
    const widthNow = 0.012 * 0.9, hingeOut = RADIUS * Math.sin(widthNow / RADIUS);
    assert.ok(edge.y * side > hingeOut, `edge ${edge.y} beyond the fold at ${hingeOut}`);
    assert.ok(Math.hypot(edge.y, edge.z) > RADIUS, 'outside the body');
    const position = sheet.mesh.geometry.getAttribute('position'), normal = sheet.mesh.geometry.getAttribute('normal');
    const across = position.count / (Math.round(position.count / 37));
    const middleEdge = Math.floor(position.count / across / 2) * across;
    assert.ok(normal.getZ(middleEdge) > 0.5, `the free part faces up: ${normal.getZ(middleEdge)}`);
    // In the order the triangles are wound, the free part shows its front to someone above it.
    const index = sheet.mesh.geometry.getIndex()!;
    const faces = (start: number) => {
      const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(start)), b = new THREE.Vector3().fromBufferAttribute(position, index.getX(start + 1)), c = new THREE.Vector3().fromBufferAttribute(position, index.getX(start + 2));
      return b.sub(a).cross(c.sub(a)).z;
    };
    const perStation = (across - 1) * 6, station = Math.floor(index.count / perStation / 2);
    assert.ok(faces(station * perStation) > 0, 'its front is upward');
    sheet.dispose();
  }
});

test('it is unbroken: each row meets the next, and the fold is rounded', () => {
  const sheet = sheetOf();
  sheet.setOpen(1);
  const position = sheet.mesh.geometry.getAttribute('position');
  const across = 37, stations = position.count / across, station = Math.floor(stations / 2);
  let longest = 0;
  for (let row = 0; row + 1 < across; row++) {
    const p = new THREE.Vector3().fromBufferAttribute(position, station * across + row), q = new THREE.Vector3().fromBufferAttribute(position, station * across + row + 1);
    longest = Math.max(longest, p.distanceTo(q));
  }
  assert.ok(longest < 0.0012, `longest step ${longest}`);
  sheet.dispose();
});

test('the table of fold lines says where the layer stops being drawn', () => {
  const sheet = sheetOf();
  sheet.setOpen(0.5);
  const table = new Float32Array(HINGE_STATIONS * 4 * 2);
  sheet.writeHinge(table, 1);
  const middle = (HINGE_STATIONS + (HINGE_STATIONS - 1) / 2) * 4;
  const width = 0.012 * 0.5, expected = RADIUS * Math.sin(width / RADIUS);
  assert.ok(Math.abs(table[middle] - expected) < 0.0004, `fold at ${table[middle]}, expected ${expected}`);
  assert.ok(table[middle + 1] < table[middle + 2] + 1e-5, 'the fold lies lower than the cut, on the curve');
  assert.equal(table[HINGE_STATIONS * 4], 0, 'nothing at the end of the cut');
  assert.equal(table[0], 0, 'other rows are left alone');
  sheet.dispose();
});

test('a flap narrows to nothing at the ends of the cut', () => {
  assert.equal(flapSpindle(0), 0);
  assert.ok(Math.abs(flapSpindle(0.5) - 1) < 1e-9);
  assert.ok(flapSpindle(0.1) < flapSpindle(0.3));
  assert.ok(flapSpindle(1) < 0.001);
});
