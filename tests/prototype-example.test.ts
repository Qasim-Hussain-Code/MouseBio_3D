import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Atlas } from '../src/domain/types';
import { compareConditions, exportExperimentalCsv, exportExperimentalJson, parseExperimentalCsv, parseExperimentalJson,
  summarizeMeasurements, validateExperimentalRows } from '../src/domain/experimental';
import { parseLocalTrace } from '../src/domain/local-trace';
import { createPrototypeExample } from '../src/domain/prototype-example';

const folders = ['atlas', 'atlas-volume', 'atlas-hindlimb', 'atlas-ema147', 'atlas-neuron', 'atlas-nerve', 'atlas-vascular'];
const sources = await Promise.all(folders.map(async (folder) => JSON.parse(await readFile(new URL(`../public/${folder}/atlas.json`, import.meta.url), 'utf8')) as Atlas));
const expectedIds: Readonly<Record<string, readonly string[]>> = {
  'digimouse-tessellated-v1': ['digimouse:3', 'digimouse:7'],
  'digimouse-volume-040-v1': ['digimouse-volume:9', 'digimouse-volume:19'],
  'charles2016-hindlimb-v1': ['charles2016-hindlimb:0', 'charles2016-hindlimb:1'],
  'ema147-native-v1': ['ema147:EMAPA:17307', 'ema147:EMAPA:18415'],
  'neuromorpho-nmo130632-standardized-v1': ['neuromorpho:130632'],
  'mousemapper-nerve-patch0-v1': ['mousemapper-nerve:patch0'],
  'schmid2021-mvn1-v1': ['schmid2021-mvn1:network'],
};

test('all seven bundled sources receive only one or two exact existing observation target IDs', () => {
  const before = structuredClone(sources);
  for (const source of sources) {
    const result = createPrototypeExample(source);
    assert.ok(result.ok && result.data, result.errors.join(' '));
    assert.equal(result.errors.length, 0);
    assert.ok(Object.isFrozen(result.errors));
    const ids = [...new Set(result.data.rows.map((row) => row.structureId))];
    assert.deepEqual(ids, expectedIds[source.id]);
    assert.equal(result.data.rows.length, ids.length * 12);
    assert.ok(ids.every((id) => source.structures.some((structure) => structure.id === id)));
    assert.deepEqual(createPrototypeExample(source), result, 'Values and identities are deterministic.');
    assert.ok(result.data.rows.every((row) => row.measurement === 'fictional walkthrough signal' && row.unit === 'AU'));
    assert.ok(result.data.rows.every((row) => Number.isFinite(row.value)));
  }
  assert.deepEqual(sources, before);
});

test('each condition has three distinct fictional subject IDs repeated across two explicitly labelled time points', () => {
  for (const source of sources) {
    const result = createPrototypeExample(source); assert.ok(result.ok && result.data);
    const { rows } = result.data;
    assert.deepEqual([...new Set(rows.map((row) => row.condition))], ['control-example', 'treatment-example']);
    assert.deepEqual([...new Set(rows.map((row) => row.timePoint))], ['baseline', '24 h']);
    for (const condition of ['control-example', 'treatment-example']) {
      assert.deepEqual([...new Set(rows.filter((row) => row.condition === condition).map((row) => row.replicate))],
        [1, 2, 3].map((number) => `${condition}-subject-${number}`));
    }
    assert.equal(new Set(rows.map((row) => row.replicate)).size, 6);
    const summaries = summarizeMeasurements(rows);
    assert.equal(summaries.length, expectedIds[source.id].length * 4);
    assert.ok(summaries.every((summary) => summary.n === 3 && summary.sd !== null && summary.sd > 0));
    const identities = rows.map((row) => JSON.stringify([row.structureId, row.measurement, row.condition, row.timePoint, row.replicate]));
    assert.equal(new Set(identities).size, rows.length);
  }
});

test('fictional provenance is explicit and preserved by normal JSON import and export', () => {
  for (const source of sources) {
    const result = createPrototypeExample(source); assert.ok(result.ok && result.data);
    const { rows, metadata } = result.data;
    assert.equal(metadata.origin, 'synthetic-example');
    assert.equal(metadata.title, 'Fictional software walkthrough');
    assert.match(metadata.sourceReference!, /not a source experiment/);
    assert.match(metadata.notes!, /All values, condition labels and subject identifiers are fictional/);
    assert.match(metadata.notes!, /not observed biology, physiological validation or evidence of a treatment effect/);
    assert.match(metadata.notes!, /not derived from their source publications/);
    assert.match(metadata.notes!, /AU denotes arbitrary walkthrough units/);
    const validated = validateExperimentalRows(rows, source.structures);
    assert.equal(validated.ok, true); assert.equal(validated.errors.length, 0); assert.equal(validated.warnings.length, 0);
    const imported = parseExperimentalJson(exportExperimentalJson(rows, metadata), source.structures);
    assert.equal(imported.ok, true); assert.deepEqual(imported.rows, rows); assert.deepEqual(imported.metadata, metadata);
    assert.deepEqual(parseExperimentalJson(exportExperimentalJson(imported.rows, imported.metadata), source.structures).metadata, metadata);
    const csvImported = parseExperimentalCsv(exportExperimentalCsv(rows), source.structures);
    assert.equal(csvImported.ok, true); assert.deepEqual(csvImported.rows, rows);
  }
});

test('normal comparison accepts the fictional groups without shared subject IDs between conditions', () => {
  for (const source of sources) {
    const result = createPrototypeExample(source); assert.ok(result.ok && result.data);
    for (const structureId of expectedIds[source.id]) for (const timePoint of ['baseline', '24 h']) {
      const compared = compareConditions(result.data.rows, { structureId, measurement: 'fictional walkthrough signal',
        unit: 'AU', timePoint, conditionA: 'control-example', conditionB: 'treatment-example' });
      assert.equal(compared.ok, true);
      assert.equal(compared.errors.length, 0); assert.equal(compared.warnings.length, 0);
      assert.equal(compared.sharedReplicates.length, 0);
      assert.ok(compared.groups.every((group) => group.n === 3));
      assert.ok(compared.difference !== null && Math.abs(compared.difference - 20) < 1e-10);
    }
  }
});

test('every result owns its mutable rows and metadata without changing sources or later results', () => {
  const before = structuredClone(sources);
  for (const source of sources) {
    const first = createPrototypeExample(source), second = createPrototypeExample(source);
    assert.ok(first.ok && first.data && second.ok && second.data);
    assert.notStrictEqual(first.data, second.data);
    assert.notStrictEqual(first.data.rows, second.data.rows);
    assert.notStrictEqual(first.data.rows[0], second.data.rows[0]);
    assert.notStrictEqual(first.data.metadata, second.data.metadata);
    const original = structuredClone(second);
    first.data.rows[0].structureId = 'PRIVATE_SYNTHETIC_MARKER';
    first.data.rows[0].value = -999;
    first.data.rows.pop();
    first.data.metadata.title = 'PRIVATE_SYNTHETIC_MARKER';
    assert.deepEqual(second, original);
    assert.deepEqual(createPrototypeExample(source), original);
  }
  assert.deepEqual(sources, before);
});

test('changed source identity, namespace, inventory, checksum, units or license rejects without partial data', () => {
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
  for (const source of sources) for (const change of changes) {
    const changed = structuredClone(source); change(changed);
    const result = createPrototypeExample(changed);
    assert.equal(result.ok, false); assert.equal(result.data, undefined);
    assert.deepEqual(result.errors, ['The example requires an unchanged reviewed bundled source reference.']);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
});

test('unknown, local and malformed references reject with a fixed value-free error', async () => {
  const getter = { get id(): never { throw new Error('PRIVATE_SYNTHETIC_MARKER'); } };
  const cases = [null, undefined, [], {}, 1, 'PRIVATE_SYNTHETIC_MARKER', { id: '__proto__' }, getter,
    { ...sources[0], structures: [null] }, { ...sources[0], source: null }];
  for (const value of cases) {
    const result = createPrototypeExample(value);
    assert.equal(result.ok, false); assert.equal(result.data, undefined);
    assert.deepEqual(result.errors, ['The example requires an unchanged reviewed bundled source reference.']);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_MARKER'), false);
  }
  const local = await parseLocalTrace(new TextEncoder().encode('1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n').buffer);
  assert.ok(local.ok && local.asset);
  const rejected = createPrototypeExample(local.asset.atlas);
  assert.equal(rejected.ok, false); assert.equal(rejected.data, undefined);
});

test('example creation performs no network read', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls += 1; throw new Error('Unexpected network read'); }) as typeof fetch;
  try {
    for (const source of sources) assert.equal(createPrototypeExample(source).ok, true);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
