import assert from 'node:assert/strict';
import test from 'node:test';
import reviewedManifest from '../public/atlas-ema147/atlas.json';
import { buildNativeSurfaceSummary } from '../src/domain/native-surface-summary';
import type { Atlas } from '../src/domain/types';

function manifest(): typeof reviewedManifest { return structuredClone(reviewedManifest); }
function summarize(atlas: unknown, id = 'ema147:EMAPA:16098') {
  return buildNativeSurfaceSummary(atlas as Atlas, id);
}

test('a closed source diagnostic retains components and the separate label-volume index', () => {
  assert.deepEqual(summarize(manifest(), 'ema147:EMAPA:16678'), {
    sourceFile: 'Surfaces/EMAPA16678_optic_stalk.stl', sourceRegionIndex: 4,
    sourceEMAPAId: 'EMAPA:16678', sourceVolumeLabelIndex: 39, vertices: 50, triangles: 92,
    topology: { boundaryEdges: 0, nonmanifoldEdges: 0, inconsistentWindingEdges: 0,
      noncyclicVertexLinks: 0, degenerateTriangles: 0, duplicateTriangles: 0, components: 2, closed: true },
  });
});

test('defective surfaces retain recorded numerical defects without repair', () => {
  assert.deepEqual(summarize(manifest()), {
    sourceFile: 'Surfaces/EMAPA16098_head_mesenchyme.stl', sourceRegionIndex: 0,
    sourceEMAPAId: 'EMAPA:16098', sourceVolumeLabelIndex: 16, vertices: 9854, triangles: 19999,
    topology: { boundaryEdges: 71, nonmanifoldEdges: 194, inconsistentWindingEdges: 0,
      noncyclicVertexLinks: 296, degenerateTriangles: 0, duplicateTriangles: 0, components: 6, closed: false },
  });
});

test('reference and all eight index-unmatched surfaces acquire no volume identity', () => {
  const atlas = manifest();
  const reference = summarize(atlas, 'ema147:reference');
  assert.ok(reference);
  assert.equal(reference.sourceFile, 'Surfaces/reference.stl');
  assert.equal(reference.sourceRegionIndex, 76);
  assert.equal(reference.sourceEMAPAId, null);
  assert.equal(reference.sourceVolumeLabelIndex, null);
  assert.equal(reference.topology.inconsistentWindingEdges, 1);
  for (const identifier of atlas.sourceInventoryComparison.surfaceOnlyIdentifiers) {
    const id = `ema147:${identifier}`;
    const summary = summarize(atlas, id);
    assert.ok(summary, id);
    assert.equal(summary.sourceEMAPAId, identifier);
    assert.equal(summary.sourceVolumeLabelIndex, null);
    const modified = manifest();
    Object.assign(modified.structures.find((structure) => structure.id === id)!, { sourceVolumeLabelIndex: 1 });
    assert.equal(summarize(modified, id), null);
  }
  Object.assign(atlas.structures[76], { sourceVolumeLabelIndex: 1 });
  assert.equal(summarize(atlas, 'ema147:reference'), null);
});

test('all reviewed surfaces are available and immutable summaries retain no mutable aliases', () => {
  const atlas = manifest();
  const before = JSON.stringify(atlas);
  let closed = 0;
  for (const structure of atlas.structures) {
    const summary = summarize(atlas, structure.id);
    assert.ok(summary, structure.id);
    assert.ok(Object.isFrozen(summary));
    assert.ok(Object.isFrozen(summary.topology));
    assert.equal('measurement' in summary, false);
    assert.equal('ontology' in summary, false);
    closed += Number(summary.topology.closed);
  }
  assert.equal(closed, 23);
  assert.equal(JSON.stringify(atlas), before);
  const summary = summarize(atlas)!;
  assert.throws(() => { (summary as unknown as Record<string, unknown>).triangles = 0; }, TypeError);
  assert.throws(() => { (summary.topology as unknown as Record<string, unknown>).boundaryEdges = 0; }, TypeError);
  atlas.structures[0].geometry.sourceTopology.boundaryEdges = 0;
  assert.equal(summary.topology.boundaryEdges, 71);
  assert.equal(summarize(atlas), null);
});

test('unknown references and changed source, frame or asset bindings fail closed', () => {
  const changes: ((atlas: ReturnType<typeof manifest>) => void)[] = [
    (a) => { a.id = 'unknown-reference'; }, (a) => { a.assetFormat = 'glb'; },
    (a) => { a.assetUrl = '/elsewhere.ply'; }, (a) => { a.coordinateFrame.id = 'another-frame'; },
    (a) => { a.coordinateFrame.sourceUnits = 'mm'; }, (a) => { a.coordinateFrame.assetUnits = 'm'; },
    (a) => { a.coordinateFrame.sourceToAssetScale = 0.08; }, (a) => { a.coordinateFrame.unitsVerified = true; },
    (a) => { a.coordinateFrame.anatomicalOrientationVerified = true; },
    (a) => { a.coordinateFrame.physicalCalibrationVerified = true; },
    (a) => { Object.assign(a.coordinateFrame, { registrationToDigimouse: [1, 0, 0] }); },
    (a) => { a.source.id = 'another-source'; }, (a) => { a.source.archiveSha256 = '0'.repeat(64); },
    (a) => { a.source.anatomyIndexSha256 = '0'.repeat(64); }, (a) => { a.source.license = 'MIT'; },
    (a) => { a.source.licenseUrl = 'https://example.org/license'; },
    (a) => { a.statistics.assetSha256 = '0'.repeat(64); }, (a) => { a.statistics.assetBytes++; },
    (a) => { Object.assign(a.statistics, { glbSha256: a.statistics.assetSha256 }); },
    (a) => { Object.assign(a.statistics, { glbBytes: a.statistics.assetBytes }); },
  ];
  for (const [index, change] of changes.entries()) {
    const atlas = manifest(); change(atlas);
    assert.equal(summarize(atlas), null, `binding mutation ${index}`);
  }
  for (const value of [null, undefined, {}, [], { ...manifest(), structures: null }]) assert.equal(summarize(value), null);
  assert.equal(summarize(manifest(), 'ema147:mouse'), null);
  assert.equal(summarize(manifest(), 'ema147:EMAPA:16057'), null);
});

test('source files, serialization indices and exact source-index matches cannot be reassigned', () => {
  const changes: ((atlas: ReturnType<typeof manifest>) => void)[] = [
    (a) => { a.structures[0].sourceFile = 'Surfaces/reference.stl'; },
    (a) => { a.structures[0].sourceRegionIndex = 1; }, (a) => { a.structures[0].sourceLabel = 'head'; },
    (a) => { a.structures[0].id = 'ema147:EMAPA:99999'; },
    (a) => { Object.assign(a.structures[0], { sourceEMAPAId: 'EMAPA:99999' }); },
    (a) => { Object.assign(a.structures[0], { sourceVolumeLabelIndex: 1 }); },
    (a) => { Object.assign(a.structures[76], { sourceEMAPAId: 'EMAPA:16057' }); },
    (a) => { Object.assign(a.structures[0], { systems: ['nervous'] }); },
    (a) => { [a.structures[0], a.structures[1]] = [a.structures[1], a.structures[0]]; },
    (a) => { a.structures.pop(); },
  ];
  for (const [index, change] of changes.entries()) {
    const atlas = manifest(); change(atlas);
    assert.equal(summarize(atlas), null, `identity mutation ${index}`);
  }
});

test('invalid and compensating count or topology changes are rejected', () => {
  for (const key of ['vertices', 'triangles'] as const) for (const value of [-1, 0, 1.5, NaN, Infinity, '1', null, undefined]) {
    const atlas = manifest(); Object.assign(atlas.structures[0].geometry, { [key]: value });
    assert.equal(summarize(atlas), null, `${key}: ${String(value)}`);
  }
  for (const key of ['boundaryEdges', 'nonmanifoldEdges', 'inconsistentWindingEdges', 'noncyclicVertexLinks',
    'degenerateTriangles', 'duplicateTriangles', 'components'] as const) {
    for (const value of [-1, 1.5, NaN, Infinity, '0', null, undefined]) {
      const atlas = manifest(); Object.assign(atlas.structures[0].geometry.sourceTopology, { [key]: value });
      assert.equal(summarize(atlas), null, `${key}: ${String(value)}`);
    }
  }
  const changes: ((atlas: ReturnType<typeof manifest>) => void)[] = [
    (a) => { a.structures[0].geometry.sourceTopology.components = 0; },
    (a) => { a.structures[0].geometry.sourceTopology.boundaryEdges--; a.structures[1].geometry.sourceTopology.boundaryEdges++; },
    (a) => { a.structures[0].geometry.vertices--; a.structures[1].geometry.vertices++; },
    (a) => { a.structures[76].geometry.triangles--; },
    (a) => { a.structures[0].geometry.vertexOffset++; }, (a) => { a.structures[0].geometry.triangleOffset++; },
    (a) => { a.statistics.vertices++; }, (a) => { a.statistics.triangles++; }, (a) => { a.statistics.structures--; },
    (a) => { a.statistics.closedManifoldSourceRegions++; }, (a) => { a.statistics.sourceTopology.boundaryEdges = 0; },
  ];
  for (const [index, change] of changes.entries()) {
    const atlas = manifest(); change(atlas);
    assert.equal(summarize(atlas), null, `count mutation ${index}`);
  }
});

test('metadata accessors are not executed as source declarations', () => {
  const atlas = manifest();
  let calls = 0;
  Object.defineProperty(atlas.structures[0].geometry.sourceTopology, 'boundaryEdges', {
    get() { calls++; return 71; },
  });
  assert.equal(summarize(atlas), null);
  assert.equal(calls, 0);
  Object.defineProperty(atlas, 'source', { get() { calls++; return reviewedManifest.source; } });
  assert.equal(summarize(atlas), null);
  assert.equal(calls, 0);
  const arrayAccessor = manifest();
  Object.defineProperty(arrayAccessor.structures, '0', { get() { calls++; return reviewedManifest.structures[0]; } });
  assert.equal(summarize(arrayAccessor), null);
  assert.equal(calls, 0);
});
