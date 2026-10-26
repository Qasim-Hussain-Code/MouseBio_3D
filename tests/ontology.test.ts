import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOntologyCandidates, getOntologyCandidate } from '../src/domain/ontology';
import type { Atlas } from '../src/domain/types';

const source = JSON.parse(readFileSync(new URL('../data/ontology-candidates.json', import.meta.url), 'utf8'));
const atlas = JSON.parse(readFileSync(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8')) as Atlas;
const fresh = () => structuredClone(source);
const rejected = (input: unknown) => {
  const result = parseOntologyCandidates(input, atlas);
  assert.equal(result.ok, false);
  assert.deepEqual(result.candidates, []);
  assert.ok(result.errors.length);
};

test('checked source fixture exposes only proposed organ-label associations', () => {
  const result = parseOntologyCandidates(source, atlas);
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.equal(result.candidates.length, 13);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.termId)).size, 10);
  assert.equal(getOntologyCandidate(result.candidates, 'digimouse:3')?.termId, 'MA:0000072');
  for (const id of ['digimouse:1', 'digimouse:13', 'digimouse:14', 'digimouse:15', 'missing']) {
    assert.equal(getOntologyCandidate(result.candidates, id), undefined);
  }
  for (const candidate of result.candidates) {
    assert.equal(candidate.classification, 'computational-inference');
    assert.equal(candidate.relation, 'related');
    assert.equal(candidate.status, 'proposed');
    assert.equal(candidate.expertReviewed, false);
    assert.ok(candidate.assumptions.length && candidate.limitations.length);
  }
});

test('source binding requires complete unique known region coverage and exact labels', () => {
  for (const mutate of [
    (input: typeof source) => { input.atlasId = 'other-atlas'; },
    (input: typeof source) => { input.candidates[0].structureId = 'unknown:1'; },
    (input: typeof source) => { input.candidates[1].structureId = input.candidates[0].structureId; },
    (input: typeof source) => { input.candidates[0].sourceLabel = 'invented subdivision'; },
    (input: typeof source) => { input.candidates.pop(); },
    (input: typeof source) => { input.unmapped.pop(); },
    (input: typeof source) => { input.unmapped[0].structureId = input.candidates[0].structureId; },
    (input: typeof source) => { input.unmapped[0].termId = 'MA:0000168'; },
  ]) { const input = fresh(); mutate(input); rejected(input); }
});

test('the adapter derives coverage from the source inventory rather than fixed fixture counts', () => {
  const input = fresh();
  input.candidates = input.candidates.slice(0, 2);
  input.unmapped = [];
  const subset = { ...atlas, structures: atlas.structures.filter((structure) =>
    input.candidates.some((candidate: { structureId: string }) => candidate.structureId === structure.id)) };
  const result = parseOntologyCandidates(input, subset);
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.equal(result.candidates.length, 2);
});

test('candidate status and evidence cannot be promoted by imported flags', () => {
  for (const [field, value] of [
    ['relation', 'exact'], ['status', 'validated'], ['expertReviewed', true],
    ['isObsolete', true], ['isDefiningOntology', false], ['laterality', 'left'], ['definition', 'invented'],
  ] as const) { const input = fresh(); input.candidates[0][field] = value; rejected(input); }
  for (const mutate of [
    (input: typeof source) => { input.expertReviewed = true; },
    (input: typeof source) => { input.method.classification = 'observed'; },
    (input: typeof source) => { input.candidates[0].evidence.classification = 'observed'; },
    (input: typeof source) => { input.candidates[0].evidence.assumptions = []; },
    (input: typeof source) => { input.candidates[0].evidence.limitations = []; },
    (input: typeof source) => { input.candidates[0].evidence.methodId = 'unreported-method'; },
  ]) { const input = fresh(); mutate(input); rejected(input); }
});

test('primary links must use safe HTTPS hosts and identify the same MA term', () => {
  for (const value of [
    'javascript:alert(1)', 'http://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000168',
    'https://www.informatics.jax.org.evil.example/vocab/gxd/ma_ontology/MA%3A0000168',
    'https://www.informatics.jax.org@evil.example/vocab/gxd/ma_ontology/MA%3A0000168',
    'https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000072',
    'https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000168?redirect=https://evil.example',
  ]) { const input = fresh(); input.candidates[0].termUrl = value; rejected(input); }
  for (const value of [
    'https://www.ebi.ac.uk.evil.example/ols4/api/ontologies/ma/terms?iri=anything',
    'https://www.ebi.ac.uk/ols4/api/ontologies/ma/terms?iri=http%3A%2F%2Fpurl.obolibrary.org%2Fobo%2FMA_0000072',
    `${source.candidates[0].verificationUrl}&iri=other`,
  ]) { const input = fresh(); input.candidates[0].verificationUrl = value; rejected(input); }
});

test('term identity, recorded source version, retrieval and license remain explicit', () => {
  for (const [field, value] of [
    ['termId', 'UBERON:0000955'], ['termId', 'MA:123'], ['termLabel', 'invented'],
    ['termIri', 'http://evil.example/MA_0000168'], ['ontologyVersion', 'other'],
    ['retrievedOn', '2026-02-30'], ['sourceLicense', 'MIT'], ['ontology', 'UBERON'],
  ]) { const input = fresh(); input.candidates[0][field] = value; rejected(input); }
  const input = fresh(); input.ontology.license = 'MIT'; rejected(input);
});

test('malformed schemas and unrecognized certainty fields fail without partial associations', () => {
  for (const input of [null, [], {}, { ...fresh(), schemaVersion: 'other' }, { ...fresh(), candidates: null }]) rejected(input);
  const unexpected = fresh(); unexpected.candidates[0].validated = true; rejected(unexpected);
  const prototypeKey = fresh();
  Object.defineProperty(prototypeKey.candidates[0], '__proto__', { value: {}, enumerable: true });
  rejected(prototypeKey);
});

test('derived associations are frozen copies and leave anatomy and candidate input unchanged', () => {
  const input = fresh(); const originalInput = structuredClone(input); const originalAtlas = structuredClone(atlas);
  const result = parseOntologyCandidates(input, atlas);
  assert.equal(result.ok, true);
  assert.ok(Object.isFrozen(result.candidates));
  assert.ok(Object.isFrozen(result.candidates[0]));
  assert.ok(Object.isFrozen(result.candidates[0].assumptions));
  assert.ok(Object.isFrozen(result.candidates[0].limitations));
  assert.deepEqual(input, originalInput); assert.deepEqual(atlas, originalAtlas);
  input.candidates[0].termLabel = 'changed after parsing';
  input.candidates[0].evidence.assumptions[0] = 'changed';
  assert.equal(result.candidates[0].termLabel, 'brain');
  assert.notEqual(result.candidates[0].assumptions[0], 'changed');
});
