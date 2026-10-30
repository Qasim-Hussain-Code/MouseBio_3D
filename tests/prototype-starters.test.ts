import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Atlas } from '../src/domain/types';
import { atlasAssetBytes } from '../src/domain/atlas-asset';
import { buildAnatomyGroups } from '../src/domain/anatomy-groups';
import { coverageRequests, type AnatomyCoverageTopicId } from '../src/domain/anatomy-coverage';
import { parseLocalTrace } from '../src/domain/local-trace';
import { getPrototypeStarter, PROTOTYPE_STARTER_GROUPS, resolvePrototypeStarter } from '../src/domain/prototype-starters';

const folders = ['atlas', 'atlas-volume', 'atlas-hindlimb', 'atlas-ema147', 'atlas-neuron', 'atlas-nerve', 'atlas-vascular'];
const sources = await Promise.all(folders.map(async (folder) => JSON.parse(await readFile(new URL(`../public/${folder}/atlas.json`, import.meta.url), 'utf8')) as Atlas));
const starters = PROTOTYPE_STARTER_GROUPS.flatMap((group) => group.starters);
const sourceFor = (referenceId: string): Atlas => sources.find((source) => source.id === referenceId)!;

test('eight immutable starters provide three source-specific entry groups', () => {
  assert.ok(Object.isFrozen(PROTOTYPE_STARTER_GROUPS));
  assert.deepEqual(PROTOTYPE_STARTER_GROUPS.map((group) => [group.id, group.starters.length]), [
    ['anatomy', 3], ['vessels-and-nerves', 4], ['neuronal-detail', 1],
  ]);
  assert.deepEqual(starters.map((starter) => starter.id), ['whole-body-organs', 'brain-regions', 'female-hindlimb-muscles',
    'developmental-vessels', 'developmental-trigeminal', 'cortical-vessels', 'predicted-nerve', 'single-neuron']);
  assert.equal(new Set(starters.map((starter) => starter.id)).size, 8);
  assert.equal(new Set(starters.map((starter) => starter.referenceId)).size, 7);
  for (const group of PROTOTYPE_STARTER_GROUPS) {
    assert.ok(Object.isFrozen(group) && Object.isFrozen(group.starters));
    assert.throws(() => (group.starters as unknown[]).pop(), TypeError);
  }
  for (const starter of starters) {
    assert.strictEqual(getPrototypeStarter(starter.id), starter);
    assert.ok(Object.isFrozen(starter) && Object.isFrozen(starter.limitations));
    assert.throws(() => (starter.limitations as string[]).push('unreviewed claim'), TypeError);
    assert.ok(starter.title && starter.description && starter.scopeLabel && starter.costText);
    assert.match(starter.limitations.join(' '), /Complete anatomy, validated physiology and cellular access throughout the body remain unavailable/);
    assert.match(starter.limitations.join(' '), /No accepted registration/);
    assert.match(starter.limitations.join(' '), /rendering speed or memory use/);
    assert.equal('structureIds' in starter, false, 'Selections are resolved from the exact loaded source instead of duplicating inventories.');
    for (const field of ['camera', 'background', 'observations', 'mode', 'physiology', 'overlay']) assert.equal(field in starter, false);
  }
});

test('all actual starter bindings resolve existing source groups without changing the inputs', () => {
  const before = structuredClone(sources);
  const counts = [15, 6, 37, 3, 2, 1, 1, 1];
  starters.forEach((starter, index) => {
    const source = sourceFor(starter.referenceId);
    const group = buildAnatomyGroups(source).groups.find((candidate) => candidate.id === starter.groupId)!;
    const result = resolvePrototypeStarter(source, starter.id);
    assert.ok(result.ok && result.target, result.errors.join(' '));
    assert.equal(result.errors.length, 0);
    assert.equal(result.target.id, group.id);
    assert.equal(result.target.title, group.title);
    assert.equal(result.target.description, group.description);
    assert.deepEqual(result.target.structureIds, group.structureIds);
    assert.equal(result.target.structureIds.length, counts[index]);
    assert.ok(result.target.structureIds.every((id) => source.structures.some((structure) => structure.id === id)));
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.errors) && Object.isFrozen(result.target));
    assert.ok(Object.isFrozen(result.target.structureIds) && Object.isFrozen(result.target.limitations));
    assert.throws(() => (result.target!.structureIds as string[]).push('invented:1'), TypeError);
    assert.ok(starter.limitations.every((limitation) => result.target!.limitations.includes(limitation)));
    assert.ok(group.limitations.every((limitation) => result.target!.limitations.includes(limitation)));
  });
  assert.deepEqual(sources, before);
});

test('the whole-body starter selects the source organs convenience group rather than a brain or complete anatomy claim', () => {
  const starter = getPrototypeStarter('whole-body-organs')!;
  const result = resolvePrototypeStarter(sourceFor(starter.referenceId), starter.id);
  assert.ok(result.ok && result.target);
  assert.equal(starter.groupId, 'organs');
  assert.equal(result.target.structureIds.length, 15);
  assert.equal(result.target.structureIds.includes('digimouse:1'), false);
  assert.equal(result.target.structureIds.includes('digimouse:13'), false);
  assert.ok(result.target.structureIds.includes('digimouse:2'));
  assert.ok(result.target.structureIds.includes('digimouse:14') && result.target.structureIds.includes('digimouse:15'));
  assert.match(starter.limitations.join(' '), /one male source specimen/);
  assert.match(starter.limitations.join(' '), /broad muscle regions/);
});

test('seven starters reuse the reviewed coverage route and preserve regional, developmental and single-trace limits', () => {
  const routes: readonly (readonly [string, AnatomyCoverageTopicId])[] = [
    ['brain-regions', 'brain'], ['female-hindlimb-muscles', 'muscles'], ['developmental-vessels', 'vessels'],
    ['developmental-trigeminal', 'nerves'], ['cortical-vessels', 'vessels'], ['predicted-nerve', 'nerves'], ['single-neuron', 'cellular-trace'],
  ];
  for (const [id, topic] of routes) {
    const starter = getPrototypeStarter(id)!;
    const route = coverageRequests(topic).find((candidate) => candidate.referenceId === starter.referenceId)!;
    assert.equal(starter.groupId, route.groupId);
    assert.equal(starter.manifestUrl, route.manifestUrl);
    assert.equal(starter.scopeLabel, route.scopeLabel);
    assert.ok(route.limitations.every((limitation) => starter.limitations.includes(limitation)));
  }
  assert.match(getPrototypeStarter('female-hindlimb-muscles')!.scopeLabel, /female right hindlimb/);
  assert.match(getPrototypeStarter('developmental-vessels')!.scopeLabel, /TS23 developmental/);
  assert.match(getPrototypeStarter('developmental-vessels')!.limitations.join(' '), /complete adult whole-body vascular network is not bundled/);
  assert.match(getPrototypeStarter('developmental-trigeminal')!.limitations.join(' '), /complete adult peripheral nervous system is not bundled/);
  assert.match(getPrototypeStarter('cortical-vessels')!.scopeLabel, /cortical microvascular source; individual specimen unresolved/);
  assert.match(getPrototypeStarter('predicted-nerve')!.scopeLabel, /predicted regional nerve graph; specimen and subregion unresolved/);
  assert.match(getPrototypeStarter('single-neuron')!.limitations.join(' '), /single neuronal reconstruction is not a peripheral nerve/);
  assert.match(getPrototypeStarter('single-neuron')!.limitations.join(' '), /Physical units.*remain unverified/);
  assert.match(getPrototypeStarter('developmental-vessels')!.limitations.join(' '), /native mesh units are unknown/);
  assert.match(getPrototypeStarter('developmental-trigeminal')!.limitations.join(' '), /native mesh units are unknown/);
  assert.match(getPrototypeStarter('predicted-nerve')!.limitations.join(' '), /coordinates have unknown units/);
  assert.match(getPrototypeStarter('cortical-vessels')!.limitations.join(' '), /source-declared micrometres without independent calibration/);
});

test('reported cost is the complete base source asset, excluding optional detail and duplicate source aggregation', () => {
  for (const starter of starters) assert.equal(starter.assetBytes, atlasAssetBytes(sourceFor(starter.referenceId)));
  assert.equal(getPrototypeStarter('developmental-vessels')!.assetBytes, 10079275);
  assert.equal(getPrototypeStarter('developmental-trigeminal')!.assetBytes, 10079275);
  assert.equal(getPrototypeStarter('brain-regions')!.assetBytes, 27648532);
  assert.match(getPrototypeStarter('brain-regions')!.costText, /optional finer surfaces load separately/);
  assert.equal(getPrototypeStarter('cortical-vessels')!.assetBytes, 38356364);
  assert.equal(getPrototypeStarter('predicted-nerve')!.assetBytes, 55658);
});

test('wrong references and altered source identity, inventory, units, checksum or license reject atomically', () => {
  const changes: ((atlas: Atlas) => void)[] = [
    (atlas) => { atlas.id = 'PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { atlas.source.id = 'PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { atlas.assetUrl = 'https://example.org/PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { atlas.coordinateFrame.id = 'PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { atlas.coordinateFrame.physicalCalibrationVerified = true; },
    (atlas) => { atlas.coordinateFrame.assetUnits = 'PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { atlas.source.license = 'PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { atlas.source.licenseUrl = 'https://example.org/PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { if (atlas.statistics.glbSha256) atlas.statistics.glbSha256 = 'a'.repeat(64); else atlas.statistics.assetSha256 = 'a'.repeat(64); },
    (atlas) => { if (atlas.statistics.glbBytes) atlas.statistics.glbBytes = 1; else atlas.statistics.assetBytes = 1; },
    (atlas) => { atlas.structures.pop(); },
    (atlas) => { atlas.structures.push(structuredClone(atlas.structures[0])); },
    (atlas) => { atlas.structures[0].id = 'PRIVATE_SYNTHETIC_MARKER'; },
    (atlas) => { atlas.structures[0].sourceLabel = 'PRIVATE_SYNTHETIC_MARKER'; },
  ];
  for (const starter of starters) {
    for (const source of sources.filter((atlas) => atlas.id !== starter.referenceId)) {
      assert.equal(resolvePrototypeStarter(source, starter.id).ok, false);
    }
    for (const change of changes) {
      const changed = structuredClone(sourceFor(starter.referenceId)); change(changed);
      const result = resolvePrototypeStarter(changed, starter.id);
      assert.equal(result.ok, false); assert.equal(result.target, null);
      assert.deepEqual(result.errors, ['The starting view does not match the reviewed source reference.']);
      assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_MARKER'), false);
    }
  }
});

test('unknown starter IDs, malformed sources and local morphology aliases return fixed value-free errors', async () => {
  const invalidIds = [null, undefined, 0, {}, [], '__proto__', 'constructor', 'PRIVATE_SYNTHETIC_MARKER'];
  for (const id of invalidIds) {
    assert.equal(getPrototypeStarter(id), undefined);
    assert.equal(resolvePrototypeStarter(sources[0], id).ok, false);
  }
  const getter = { get id(): never { throw new Error('PRIVATE_SYNTHETIC_MARKER'); } };
  for (const source of [null, undefined, [], {}, getter, { ...sources[0], structures: [null] }]) {
    const result = resolvePrototypeStarter(source, 'whole-body-organs');
    assert.equal(result.ok, false); assert.equal(result.target, null);
    assert.deepEqual(result.errors, ['The starting view does not match the reviewed source reference.']);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
  const local = await parseLocalTrace(new TextEncoder().encode('1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n').buffer);
  assert.ok(local.ok && local.asset);
  assert.equal(resolvePrototypeStarter(local.asset.atlas, 'single-neuron').ok, false);
});

test('starter lookup and resolution perform no network reads or input changes', () => {
  const before = structuredClone(sources);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls += 1; throw new Error('Unexpected network read'); }) as typeof fetch;
  try {
    for (const starter of starters) {
      assert.strictEqual(getPrototypeStarter(starter.id), starter);
      assert.equal(resolvePrototypeStarter(sourceFor(starter.referenceId), starter.id).ok, true);
    }
    assert.equal(calls, 0);
    assert.deepEqual(sources, before);
  } finally { globalThis.fetch = originalFetch; }
});
