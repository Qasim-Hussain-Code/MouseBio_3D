import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Atlas } from '../src/domain/types';
import { bloodTracerFraction, buildLivingCircuits, CIRCUIT_DISPLAY_TIMING, circuitConnectionsForStructure,
  LIVING_CIRCUIT_ATLAS_IDS, LIVING_CIRCUIT_LIMITATIONS, LIVING_CIRCUIT_REFERENCES, nervePulseFractions } from '../src/domain/living-circuits';

const read = async (path: string) => JSON.parse(await readFile(new URL(`../public/${path}`, import.meta.url), 'utf8')) as Atlas;
const tetrahedral = await read('atlas/atlas.json');
const volume = await read('atlas-volume/atlas.json');
const others = await Promise.all(['atlas-hindlimb/atlas.json', 'atlas-ema147/atlas.json', 'atlas-neuron/atlas.json',
  'atlas-nerve/atlas.json', 'atlas-vascular/atlas.json'].map(read));

test('both Digimouse references bind every route endpoint to existing source IDs', () => {
  assert.deepEqual([...LIVING_CIRCUIT_ATLAS_IDS].sort(), [tetrahedral.id, volume.id].sort());
  for (const atlas of [tetrahedral, volume]) {
    const result = buildLivingCircuits(atlas), ids = new Set(atlas.structures.map((structure) => structure.id));
    assert.equal(result.ok, true, result.errors.join(' '));
    assert.equal(result.classification, 'illustrative');
    assert.equal(result.evidence, 'educational-simplification');
    for (const edge of result.edges) {
      for (const id of [...edge.from.structureIds, ...edge.to.structureIds]) assert.ok(ids.has(id), `${edge.id} uses ${id}`);
      assert.notDeepEqual(edge.from.structureIds, edge.to.structureIds);
    }
    assert.equal(new Set(result.edges.map((edge) => edge.id)).size, result.edges.length);
  }
});

test('tetrahedral regions receive one connector per paired region and omit unsegmented organs', () => {
  const result = buildLivingCircuits(tetrahedral);
  assert.equal(result.edges.length, 30);
  assert.deepEqual(result.omittedRoutes.map((route) => route.routeId), ['eye-supply', 'trigeminal-masseter', 'optic-visual']);
  assert.ok(result.omittedRoutes.every((route) => /No source region is bound/.test(route.reason)));
  const kidneySupply = result.edges.filter((edge) => edge.routeId === 'kidney-supply');
  assert.deepEqual(kidneySupply.map((edge) => edge.to.structureIds[0]), ['digimouse:7', 'digimouse:8']);
  assert.ok(result.edges.filter((edge) => edge.layer === 'neural').every((edge) => edge.bindingInferences.length === 1));
  assert.ok(result.edges.filter((edge) => edge.layer === 'circulation').every((edge) => edge.bindingInferences.length === 0));
});

test('the volume reference binds the brain as one union anchor and records nucleus-level inferences', () => {
  const result = buildLivingCircuits(volume);
  assert.equal(result.edges.length, 26);
  assert.deepEqual(result.omittedRoutes, []);
  const brain = result.edges.find((edge) => edge.routeId === 'brain-supply')!;
  assert.deepEqual(brain.to.structureIds, ['digimouse-volume:4', 'digimouse-volume:5', 'digimouse-volume:6',
    'digimouse-volume:7', 'digimouse-volume:8', 'digimouse-volume:10']);
  const vagal = result.edges.filter((edge) => edge.routeId.startsWith('vagal-'));
  assert.equal(vagal.length, 5);
  assert.ok(vagal.every((edge) => edge.from.structureIds[0] === 'digimouse-volume:4' && /Medulla/.test(edge.bindingInferences[0])));
  const optic = result.edges.find((edge) => edge.routeId === 'optic-visual')!;
  assert.equal(optic.kind, 'neural-afferent');
  assert.deepEqual([optic.from.structureIds, optic.to.structureIds], [['digimouse-volume:3'], ['digimouse-volume:10']]);
  assert.match(optic.bindingInferences[0], /assumed/);
});

test('relationships use the organ as subject, retain verified references and stay educational simplifications', () => {
  const references = new Map(LIVING_CIRCUIT_REFERENCES.map((reference) => [reference.id, reference]));
  for (const atlas of [tetrahedral, volume]) for (const edge of buildLivingCircuits(atlas).edges) {
    const { relationship } = edge;
    assert.equal(relationship.evidence.classification, 'educational-simplification');
    assert.ok(relationship.evidence.references.length > 0);
    for (const reference of relationship.evidence.references) {
      assert.equal(references.get(reference.id)?.url, reference.url);
      assert.match(reference.url, /^https:\/\/openstax\.org\/books\/anatomy-and-physiology-2e\/pages\//);
    }
    const target = edge.to.structureIds.join('+'), source = edge.from.structureIds.join('+');
    if (edge.kind === 'systemic-arterial' || edge.kind === 'pulmonary-arterial' || edge.kind === 'neural-efferent') {
      assert.deepEqual([relationship.subjectId, relationship.objectId], [target, source]);
    } else assert.deepEqual([relationship.subjectId, relationship.objectId], [source, target]);
    assert.equal(relationship.predicate, edge.layer === 'neural' ? 'innervated-by' : edge.kind.endsWith('arterial') ? 'blood-supply' : 'venous-drainage');
    assert.equal(edge.blood, edge.layer === 'neural' ? undefined
      : edge.kind === 'systemic-arterial' || edge.kind === 'pulmonary-venous' ? 'oxygen-rich' : 'oxygen-poor');
  }
});

test('connections list incoming and outgoing routes for the inspected region only', () => {
  const result = buildLivingCircuits(tetrahedral);
  const kidney = circuitConnectionsForStructure(result, 'digimouse:7');
  assert.deepEqual(kidney.map((connection) => [connection.edge.routeId, connection.direction]),
    [['kidney-supply', 'incoming'], ['kidney-drainage', 'outgoing']]);
  const liver = circuitConnectionsForStructure(result, 'digimouse:12').map((connection) => connection.edge.routeId);
  assert.deepEqual(liver, ['liver-arterial-supply', 'stomach-portal', 'spleen-portal', 'pancreas-portal', 'liver-drainage', 'vagal-liver']);
  assert.equal(circuitConnectionsForStructure(result, 'digimouse:1').length, 0);
  assert.equal(circuitConnectionsForStructure(buildLivingCircuits(others[0]), 'digimouse:7').length, 0);
});

test('references without bindings, and substituted or duplicated source IDs, produce no routes', () => {
  for (const atlas of others) {
    const result = buildLivingCircuits(atlas);
    assert.equal(result.ok, false); assert.deepEqual(result.edges, []);
  }
  const missing = { ...tetrahedral, structures: tetrahedral.structures.filter((structure) => structure.id !== 'digimouse:12') };
  assert.equal(buildLivingCircuits(missing).ok, false);
  const duplicated = { ...tetrahedral, structures: [...tetrahedral.structures, tetrahedral.structures[2]] };
  assert.equal(buildLivingCircuits(duplicated).ok, false);
  assert.equal(buildLivingCircuits({ id: 'digimouse-tessellated-v1', structures: null } as never).ok, false);
  assert.equal(buildLivingCircuits({ id: 'toString', structures: [] }).ok, false);
});

test('route results are immutable', () => {
  const result = buildLivingCircuits(volume);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.edges) && Object.isFrozen(result.edges[0])
    && Object.isFrozen(result.edges[0].relationship.evidence.references) && Object.isFrozen(result.edges[0].from.structureIds));
  assert.throws(() => { (result.edges as unknown[]).push({}); }, TypeError);
});

test('arterial tracers advance monotonically and fastest at the illustrative contraction phase', () => {
  const step = 0.001;
  const unwrap = (kind: 'systemic-arterial' | 'systemic-venous' | 'hepatic-portal', t: number) => {
    const delta = bloodTracerFraction(kind, t + step, 0) - bloodTracerFraction(kind, t, 0);
    return delta < -0.5 ? delta + 1 : delta;
  };
  for (let t = 0; t < 3; t += 0.01) {
    const value = bloodTracerFraction('systemic-arterial', t, 0.3);
    assert.ok(value >= 0 && value < 1);
    assert.ok(unwrap('systemic-arterial', t) > 0, `Arterial tracers must not reverse at ${t}.`);
  }
  const peak = CIRCUIT_DISPLAY_TIMING.ejectionPhase;
  assert.ok(unwrap('systemic-arterial', peak) > unwrap('systemic-arterial', peak + 0.5) * 2);
  assert.ok(Math.abs(unwrap('systemic-venous', 0.1) - unwrap('systemic-venous', 0.6)) < 1e-9);
  assert.ok(Math.abs(unwrap('systemic-venous', 0.1) / step - CIRCUIT_DISPLAY_TIMING.venousPathsPerS) < 1e-6);
  assert.ok(Math.abs(unwrap('hepatic-portal', 0.1) / step - CIRCUIT_DISPLAY_TIMING.portalPathsPerS) < 1e-6);
  assert.throws(() => bloodTracerFraction('neural-efferent', 1, 0), RangeError);
  assert.throws(() => bloodTracerFraction('systemic-arterial', -1, 0), RangeError);
  assert.throws(() => bloodTracerFraction('systemic-arterial', NaN, 0), RangeError);
});

test('nerve pulses start each interval, travel origin to target and then disappear', () => {
  const { nervePulseIntervalS: interval, nerveTravelS: travel } = CIRCUIT_DISPLAY_TIMING;
  assert.ok(travel < interval);
  assert.deepEqual(nervePulseFractions(0.2, 0.2), [0]);
  assert.deepEqual(nervePulseFractions(0.2 + travel / 2, 0.2), [0.5]);
  assert.deepEqual(nervePulseFractions(0.2 + travel * 1.5, 0.2), []);
  const next = nervePulseFractions(0.2 + interval + travel / 4, 0.2);
  assert.equal(next.length, 1); assert.ok(Math.abs(next[0] - 0.25) < 1e-12);
  assert.deepEqual(nervePulseFractions(0.1, 0.2), []);
  assert.throws(() => nervePulseFractions(Infinity, 0), RangeError);
});

test('route wording follows the documentation conventions', () => {
  const text = [...LIVING_CIRCUIT_LIMITATIONS, ...buildLivingCircuits(volume).edges.flatMap((edge) => [edge.basis, ...edge.bindingInferences]),
    ...buildLivingCircuits(tetrahedral).edges.flatMap((edge) => edge.bindingInferences)].join('\n');
  assert.doesNotMatch(text, /[–—]/);
  assert.doesNotMatch(text, /\b(?:validated|measured flow|conduction velocity of)\b/i);
});
