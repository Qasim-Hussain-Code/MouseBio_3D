/** Numerical connector placement only; these cases do not establish browser rendering. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import type { Atlas } from '../src/domain/types';
import { buildLivingCircuits, type CircuitEdge } from '../src/domain/living-circuits';
import { createLivingCircuitOverlay, regionAnchor, type LivingCircuitOverlayState } from '../src/viewer/living-circuit-overlay';
import { DISPLAY_ROTATION_Z, recenterRegionGeometry } from '../src/viewer/scene-utils';

const atlas = JSON.parse(await readFile(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8')) as Atlas;
const circuits = buildLivingCircuits(atlas);

/** Synthetic box surfaces at distinct positions, recentered under a rotated display group as in the viewer. */
function regions() {
  const display = new THREE.Group(); display.rotation.z = DISPLAY_ROTATION_Z;
  const map = new Map<string, THREE.Mesh>();
  atlas.structures.forEach((structure, index) => {
    const geometry = new THREE.BoxGeometry(0.4, 0.3, 0.2).translate(Math.cos(index) * 3, Math.sin(index * 1.7) * 2, (index % 5) * 0.4);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    display.add(mesh); display.updateWorldMatrix(true, true);
    recenterRegionGeometry(mesh).previousGeometry.dispose();
    map.set(structure.id, mesh);
  });
  display.updateWorldMatrix(true, true);
  return { display, map };
}
function state(overrides: Partial<LivingCircuitOverlayState> = {}): LivingCircuitOverlayState {
  return { timeS: 0.4, circulation: true, neural: true, selectedId: null, selectionOnly: false, isVisible: () => true, clippingPlanes: [], ...overrides };
}
function points(object: THREE.Object3D | undefined) {
  const geometry = (object as THREE.Points).geometry, attribute = geometry.getAttribute('position');
  return Array.from({ length: geometry.drawRange.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(attribute, index));
}
function distanceToPolyline(point: THREE.Vector3, samples: readonly THREE.Vector3[]) {
  let best = Infinity;
  for (let index = 1; index < samples.length; index++) {
    const closest = new THREE.Line3(samples[index - 1], samples[index]).closestPointToPoint(point, true, new THREE.Vector3());
    best = Math.min(best, closest.distanceTo(point));
  }
  return best;
}

test('anchors are existing source vertices in world coordinates and ignore illustrative motion scale', () => {
  const { map } = regions(), heart = map.get('digimouse:3')!;
  const anchor = regionAnchor([heart], ['digimouse:3'])!;
  assert.ok(anchor);
  const position = heart.geometry.getAttribute('position');
  const world = Array.from({ length: position.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(heart.matrixWorld));
  assert.ok(world.some((vertex) => vertex.distanceTo(anchor.point) < 1e-12), 'The anchor must coincide with a source vertex.');
  heart.scale.setScalar(0.965); heart.updateWorldMatrix(true, false);
  assert.ok(regionAnchor([heart], ['digimouse:3'])!.point.distanceTo(anchor.point) < 1e-12);
  assert.equal(regionAnchor([new THREE.Mesh(new THREE.BufferGeometry())], ['empty']), null);
});

test('every bound route receives a connector from its source anchor to its target anchor', () => {
  const { display, map } = regions(), overlay = createLivingCircuitOverlay(circuits.edges, map)!;
  assert.ok(overlay);
  assert.deepEqual(overlay.edgeIds, circuits.edges.map((edge) => edge.id));
  assert.deepEqual(overlay.omittedEdgeIds, []);
  for (const edge of circuits.edges) {
    const samples = overlay.samples(edge.id)!;
    assert.ok(samples[0].distanceTo(overlay.anchor(edge.id, 'from')!.point) < 1e-9);
    assert.ok(samples.at(-1)!.distanceTo(overlay.anchor(edge.id, 'to')!.point) < 1e-9);
  }
  const middle = (id: string) => overlay.samples(id)![24];
  // Supply, return and nerve connectors between the same two regions do not coincide.
  assert.ok(middle('kidney-supply:0').distanceTo(middle('kidney-drainage:0')) > 0.05);
  assert.ok(middle('brain-supply:0').distanceTo(middle('brain-drainage:0')) > 0.05);
  assert.ok(middle('vagal-heart:0').distanceTo(middle('brain-supply:0')) > 0.05);
  assert.equal(overlay.group.userData.isDisplayOverlay, true);
  assert.ok(display.children.every((child) => child instanceof THREE.Mesh), 'Source regions are not modified or reparented.');
  overlay.dispose();
});

test('layers, selection and region visibility filter displayed routes without changing the route table', () => {
  const { map } = regions(), overlay = createLivingCircuitOverlay(circuits.edges, map)!;
  const byId = new Map(circuits.edges.map((edge) => [edge.id, edge]));
  const shown = (overrides: Partial<LivingCircuitOverlayState>) => overlay.update(state(overrides)).visibleEdgeIds.map((id) => byId.get(id)!);
  assert.equal(shown({}).length, circuits.edges.length);
  assert.ok(shown({ neural: false }).every((edge) => edge.layer === 'circulation'));
  assert.ok(shown({ circulation: false }).every((edge) => edge.layer === 'neural'));
  assert.deepEqual(shown({ circulation: false, neural: false }), []);
  const kidney = shown({ selectedId: 'digimouse:7', selectionOnly: true }).map((edge) => edge.routeId);
  assert.deepEqual(kidney, ['kidney-supply', 'kidney-drainage']);
  const withoutHeart = shown({ isVisible: (id) => id !== 'digimouse:3' });
  assert.ok(withoutHeart.length > 0);
  assert.ok(withoutHeart.every((edge: CircuitEdge) => ![...edge.from.structureIds, ...edge.to.structureIds].includes('digimouse:3')));
  const expected = circuits.edges.filter((edge) => ![...edge.from.structureIds, ...edge.to.structureIds].includes('digimouse:3'));
  assert.deepEqual(withoutHeart.map((edge) => edge.id), expected.map((edge) => edge.id));
  assert.deepEqual([...new Set(expected.map((edge) => edge.routeId))],
    ['stomach-portal', 'spleen-portal', 'pancreas-portal', 'vagal-bronchi', 'vagal-stomach', 'vagal-liver', 'vagal-pancreas']);
  overlay.dispose();
});

test('tracers and pulses stay on their connectors and frames update only when state changes', () => {
  const { map } = regions(), overlay = createLivingCircuitOverlay(circuits.edges, map)!;
  const [, tracers, , heads] = overlay.group.children;
  const first = overlay.update(state({ timeS: 0.3 }));
  assert.equal(first.changed, true);
  assert.ok(first.tracers >= circuits.edges.filter((edge) => edge.layer === 'circulation').length * 4);
  const samples = circuits.edges.filter((edge) => edge.layer === 'circulation').map((edge) => overlay.samples(edge.id)!);
  for (const point of points(tracers)) assert.ok(Math.min(...samples.map((line) => distanceToPolyline(point, line))) < 1e-5);
  assert.ok(first.pulses > 0, 'At least one nerve pulse is travelling at this display time.');
  const neural = circuits.edges.filter((edge) => edge.layer === 'neural').map((edge) => overlay.samples(edge.id)!);
  for (const point of points(heads)) assert.ok(Math.min(...neural.map((line) => distanceToPolyline(point, line))) < 1e-5);
  assert.equal(overlay.update(state({ timeS: 0.3 })).changed, false);
  assert.equal(overlay.update(state({ timeS: 0.31 })).changed, true);
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.5);
  assert.equal(overlay.update(state({ timeS: 0.31, clippingPlanes: [plane] })).changed, true);
  for (const child of overlay.group.children) {
    const material = (child as THREE.Points).material as THREE.Material;
    assert.equal(material.clippingPlanes?.length, 1);
    assert.ok(material.clippingPlanes![0].equals(plane) && material.clippingPlanes![0] !== plane);
  }
  overlay.dispose();
  assert.equal(overlay.group.parent, null);
  assert.equal(overlay.update(state({ timeS: 1 })).changed, false);
});

test('routes with an unavailable region are omitted rather than relocated', () => {
  const { map } = regions();
  map.delete('digimouse:12');
  const overlay = createLivingCircuitOverlay(circuits.edges, map)!;
  const liverRoutes = circuits.edges.filter((edge) => [...edge.from.structureIds, ...edge.to.structureIds].includes('digimouse:12')).map((edge) => edge.id);
  assert.deepEqual([...overlay.omittedEdgeIds], liverRoutes);
  assert.ok(liverRoutes.every((id) => overlay.samples(id) === null));
  overlay.dispose();
  assert.equal(createLivingCircuitOverlay(circuits.edges, new Map()), null);
});
