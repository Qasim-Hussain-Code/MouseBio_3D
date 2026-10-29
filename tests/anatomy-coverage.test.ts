import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Atlas } from '../src/domain/types';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';
import { parseLocalTrace } from '../src/domain/local-trace';
import { ANATOMY_COVERAGE_TOPICS, buildAnatomyCoverage, coverageAvailability, coverageRequests, resolveCoverageTarget } from '../src/domain/anatomy-coverage';

const folders = ['atlas', 'atlas-volume', 'atlas-hindlimb', 'atlas-ema147', 'atlas-neuron', 'atlas-nerve', 'atlas-vascular'];
const sources = await Promise.all(folders.map(async (folder) => JSON.parse(await readFile(new URL(`../public/${folder}/atlas.json`, import.meta.url), 'utf8')) as Atlas));
const [tetrahedral, volume, hindlimb, embryo, neuron, nerve, vascular] = sources;

test('coverage routes identify available references without fetching every source or implying a complete adult network', () => {
  assert.deepEqual(ANATOMY_COVERAGE_TOPICS.map((topic) => topic.id), ['vessels', 'nerves', 'brain', 'muscles', 'bones', 'tissue-layers', 'cellular-trace']);
  assert.equal(coverageAvailability('vessels', tetrahedral.id), 'another-reference');
  assert.equal(coverageAvailability('vessels', embryo.id), 'current-reference');
  assert.equal(coverageAvailability('nerves', neuron.id), 'another-reference');
  assert.equal(coverageAvailability('missing-topic', embryo.id), 'unavailable');
  assert.deepEqual(coverageRequests('__proto__'), []);
  for (const topic of ANATOMY_COVERAGE_TOPICS) {
    assert.ok(Object.isFrozen(topic) && Object.isFrozen(topic.limitations));
    const requests = coverageRequests(topic.id);
    assert.ok(Object.isFrozen(requests));
    for (const request of requests) {
      assert.ok(Object.isFrozen(request) && Object.isFrozen(request.limitations));
      assert.ok(sources.some((atlas) => atlas.id === request.referenceId));
      assert.match(request.manifestUrl, /^\/atlas(?:-[a-z0-9]+)?\/atlas\.json$/);
      assert.ok(request.regionCount > 0);
    }
  }
  assert.match(ANATOMY_COVERAGE_TOPICS.find((topic) => topic.id === 'vessels')!.limitations.join(' '), /complete adult whole-body vascular network is not bundled/);
  assert.match(ANATOMY_COVERAGE_TOPICS.find((topic) => topic.id === 'nerves')!.limitations.join(' '), /complete adult peripheral nervous system is not bundled/);
  assert.deepEqual(coverageRequests('vessels').map((request) => request.scope), ['regional-vascular', 'developmental']);
  assert.equal(resolveCoverageTarget(vascular, 'vessels').target?.structureIds[0], 'schmid2021-mvn1:network');
  assert.deepEqual(coverageRequests('nerves').map((request) => request.scope), ['predicted-regional', 'developmental']);
  assert.equal(resolveCoverageTarget(nerve, 'nerves').target?.structureIds[0], 'mousemapper-nerve:patch0');
});

test('vessel and nerve shortcuts resolve only their exact deposited EMA147 source selections', () => {
  const vessels = resolveCoverageTarget(embryo, 'vessels'); assert.ok(vessels.ok && vessels.target);
  assert.equal(vessels.target.groupId, 'vessels');
  assert.deepEqual(vessels.target.structureIds, ['ema147:EMAPA:17307', 'ema147:EMAPA:18415', 'ema147:EMAPA:18601']);
  assert.match(vessels.target.description, /basilar artery, vena cava and aorta/);
  assert.equal(vessels.target.scope, 'developmental');
  const nerves = resolveCoverageTarget(embryo, 'nerves'); assert.ok(nerves.ok && nerves.target);
  assert.equal(nerves.target.groupId, 'trigeminal');
  assert.deepEqual(nerves.target.structureIds, ['ema147:EMAPA:16797', 'ema147:EMAPA:17576']);
  assert.ok(nerves.target.limitations.some((value) => value.includes('incomplete neural coverage')));
  assert.equal(resolveCoverageTarget(neuron, 'nerves').target, null);
  assert.equal(resolveCoverageTarget(volume, 'vessels').target, null);
  assert.equal(resolveCoverageTarget(hindlimb, 'nerves').target, null);
});

test('brain, muscle, bone, tissue and cellular routes retain source group coverage and scope', () => {
  const brain = resolveCoverageTarget(volume, 'brain'); assert.ok(brain.ok && brain.target);
  assert.deepEqual(brain.target.structureIds, [4, 5, 6, 7, 8, 10].map((number) => `digimouse-volume:${number}`));
  const muscles = resolveCoverageTarget(hindlimb, 'muscles'); assert.ok(muscles.ok && muscles.target);
  assert.equal(muscles.target.structureIds.length, 37); assert.equal(muscles.target.scope, 'adult-regional');
  const bone = resolveCoverageTarget(embryo, 'bones'); assert.ok(bone.ok && bone.target);
  assert.equal(bone.target.structureIds.length, 6); assert.equal(bone.target.groupId, 'bone-cartilage');
  const tissue = resolveCoverageTarget(embryo, 'tissue-layers'); assert.ok(tissue.ok && tissue.target);
  assert.equal(tissue.target.structureIds.length, 8);
  const trace = resolveCoverageTarget(neuron, 'cellular-trace'); assert.ok(trace.ok && trace.target);
  assert.deepEqual(trace.target.structureIds, ['neuromorpho:130632']); assert.equal(trace.target.scope, 'single-neuron-source');
  assert.equal(resolveCoverageTarget(neuron, 'brain').target, null);
  assert.equal(resolveCoverageTarget(embryo, 'brain').target, null, 'The broader neural source group is not relabelled as a brain inventory.');
});

test('all reviewed actual source bindings form immutable coverage without merging source inventories', () => {
  const before = structuredClone(sources); const result = buildAnatomyCoverage(sources);
  assert.ok(result.ok, result.errors.join(' ')); assert.equal(result.topics.length, 7);
  assert.equal(result.topics.reduce((sum, topic) => sum + topic.targets.length, 0), 15);
  assert.deepEqual(sources, before);
  assert.ok(Object.isFrozen(result.topics));
  for (const topic of result.topics) {
    assert.ok(Object.isFrozen(topic) && Object.isFrozen(topic.targets));
    for (const target of topic.targets) {
      const source = sources.find((atlas) => atlas.id === target.referenceId)!;
      const group = buildAnatomyGroups(source).groups.find((entry) => entry.id === target.groupId)!;
      assert.deepEqual(target.structureIds, group.structureIds);
      assert.ok(target.structureIds.every((id) => source.structures.some((structure) => structure.id === id)));
      assert.ok(Object.isFrozen(target) && Object.isFrozen(target.structureIds) && Object.isFrozen(target.limitations));
      assert.ok(target.limitations.some((value) => value.includes('no accepted registration')));
      assert.throws(() => (target.structureIds as string[]).push('invented:1'), TypeError);
    }
  }
});

test('substituted source identity, hash, route, namespace, frame or license rejects the entire requested selection', () => {
  const changes: ((atlas: Atlas) => void)[] = [
    (atlas) => { atlas.id = volume.id; }, (atlas) => { atlas.source.id = 'unreviewed-source'; },
    (atlas) => { atlas.statistics.assetSha256 = 'a'.repeat(64); },
    (atlas) => { atlas.statistics.assetBytes = 1; },
    (atlas) => { atlas.assetUrl = 'https://example.org/unreviewed.ply'; },
    (atlas) => { atlas.coordinateFrame.id = 'unreviewed-frame'; },
    (atlas) => { atlas.source.license = 'MIT'; }, (atlas) => { atlas.source.licenseUrl = 'https://example.org/license'; },
    (atlas) => { atlas.structures[0].id = 'digimouse:1'; }, (atlas) => { atlas.assetFormat = 'glb'; },
    (atlas) => { atlas.source.archiveSha256 = 'b'.repeat(64); },
  ];
  for (const change of changes) {
    const altered = structuredClone(embryo); change(altered);
    assert.deepEqual(resolveCoverageTarget(altered, 'vessels').target, null);
    assert.equal(resolveCoverageTarget(altered, 'vessels').ok, false);
    const combined = buildAnatomyCoverage([volume, altered]);
    assert.equal(combined.ok, false); assert.deepEqual(combined.topics, []);
  }
});

test('source inventory corruption never returns a guessed partial group or local-source alias', async () => {
  for (const alter of [(atlas: Atlas) => { atlas.structures.pop(); },
    (atlas: Atlas) => { atlas.structures[1] = structuredClone(atlas.structures[0]); },
    (atlas: Atlas) => { atlas.structures[0].sourceLabel = 'unreviewed renamed region'; },
    (atlas: Atlas) => { atlas.structures.push(structuredClone(atlas.structures[0])); }]) {
    for (const source of sources) {
      const changed = structuredClone(source); alter(changed);
      assert.equal(resolveCoverageTarget(changed, 'brain').ok, false);
      assert.equal(buildAnatomyCoverage([changed]).ok, false);
    }
  }
  const local = await parseLocalTrace(new TextEncoder().encode('1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n').buffer);
  assert.ok(local.ok && local.asset);
  assert.equal(resolveCoverageTarget(local.asset.atlas, 'cellular-trace').ok, false);
  assert.equal(buildAnatomyCoverage([local.asset.atlas]).ok, false);
});

test('unknown physical calibration and source coordinate transforms cannot acquire verified or changed units', () => {
  for (const source of sources) for (const field of ['anatomicalOrientationVerified', 'physicalCalibrationVerified', 'assetUnits']) {
    const altered = structuredClone(source);
    altered.coordinateFrame[field] = field === 'assetUnits' ? 'unreviewed-unit' : true;
    assert.equal(resolveCoverageTarget(altered, 'brain').ok, false);
  }
  const transformed = structuredClone(tetrahedral); transformed.coordinateFrame.sourceToAssetMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.equal(resolveCoverageTarget(transformed, 'brain').ok, false);
  const registered = structuredClone(embryo); registered.coordinateFrame.registrationToDigimouse = { accepted: true };
  assert.equal(resolveCoverageTarget(registered, 'vessels').ok, false);
});

test('invalid topics and malformed or duplicate sources fail atomically with fixed value-free errors', () => {
  assert.equal(resolveCoverageTarget(embryo, 'vascular').ok, false);
  for (const value of [null, [], {}, { id: 'PRIVATE_SYNTHETIC_MARKER' }, { ...embryo, structures: [null] }]) {
    const result = resolveCoverageTarget(value, 'vessels'); assert.equal(result.ok, false); assert.equal(result.target, null);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
  const accessor = { get id(): never { throw new Error('PRIVATE_SYNTHETIC_MARKER'); } };
  assert.equal(resolveCoverageTarget(accessor, 'vessels').ok, false);
  for (const value of [[], [volume, volume], [accessor], null, {}, Array(6).fill(embryo)]) {
    const result = buildAnatomyCoverage(value); assert.equal(result.ok, false); assert.deepEqual(result.topics, []);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
});
