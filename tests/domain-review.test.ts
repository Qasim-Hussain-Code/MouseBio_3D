import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareConditions,
  EXPERIMENTAL_COLUMNS,
  exportExperimentalJson,
  parseExperimentalCsv,
  parseExperimentalJson,
  summarizeMeasurements,
} from '../src/domain/index';
import type { ExperimentalMeasurement } from '../src/domain/types';

const structures = ['digimouse:3'];
const observation = (value: number, replicate: string, condition = 'control'): ExperimentalMeasurement => ({
  structureId: 'digimouse:3', measurement: 'signal', value, unit: 'AU',
  replicate, condition, timePoint: 'baseline',
});
const selector = {
  structureId: 'digimouse:3', measurement: 'signal', unit: 'AU', timePoint: 'baseline',
  conditionA: 'control', conditionB: 'treatment',
};

test('comparison rejects overflowed dispersion even when its mean contrast is finite', () => {
  const compared = compareConditions([
    observation(-1.7e308, 'control-1'), observation(1.7e308, 'control-2'),
    observation(0, 'treatment-1', 'treatment'), observation(1, 'treatment-2', 'treatment'),
  ], selector);
  assert.equal(compared.ok, false);
  assert.ok(compared.errors.some((issue) => issue.code === 'numeric-overflow'));
  assert.equal(compared.difference, null);
});

test('near-limit finite dispersion remains usable without false overflow rejection', () => {
  const compared = compareConditions([
    observation(-1e308, 'control-1'), observation(1e308, 'control-2'),
    observation(0, 'treatment-1', 'treatment'), observation(1, 'treatment-2', 'treatment'),
  ], selector);
  assert.equal(compared.ok, true);
  assert.ok(Number.isFinite(compared.groups[0].sd));
  assert.equal(compared.difference, 0.5);
});

test('measurement grouping cannot collide through punctuation in metadata labels', () => {
  const a = { ...observation(2, 'subject-a'), measurement: 'signal,control', condition: 'x' };
  const b = { ...observation(4, 'subject-b'), measurement: 'signal', condition: 'control,x' };
  const groups = summarizeMeasurements([a, b]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.n), [1, 1]);
});

test('JSON does not accept coercible string measurement values', () => {
  const document = JSON.parse(exportExperimentalJson([observation(2, 'subject-a')]));
  document.measurements[0].value = '2';
  const result = parseExperimentalJson(JSON.stringify(document), structures);
  assert.equal(result.ok, false);
  assert.deepEqual(result.rows, []);
  assert.ok(result.errors.some((issue) => issue.code === 'invalid-value'));
});

test('import byte limits count UTF-8 bytes rather than UTF-16 characters', () => {
  const csv = `${EXPERIMENTAL_COLUMNS.join(',')}\ndigimouse:3,信号,2,AU,subject-a,control,baseline\n`;
  const result = parseExperimentalCsv(csv, structures, { maxBytes: csv.length });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === 'file-too-large'));
});

test('CSV refuses nonzero values that silently underflow to zero', () => {
  const document = (value: string) => `${EXPERIMENTAL_COLUMNS.join(',')}\ndigimouse:3,signal,${value},AU,subject-a,control,baseline\n`;
  for (const value of ['1e-999', '-1e-999']) {
    const result = parseExperimentalCsv(document(value), structures);
    assert.equal(result.ok, false);
    assert.deepEqual(result.rows, []);
    assert.ok(result.errors.some((issue) => issue.code === 'invalid-value'));
  }
  assert.equal(parseExperimentalCsv(document('0e-999'), structures).rows[0].value, 0);
  assert.equal(parseExperimentalCsv(document('5e-324'), structures).rows[0].value, Number.MIN_VALUE);
});

test('JSON refuses nonzero source numbers that would silently underflow to zero', () => {
  const document = exportExperimentalJson([observation(2, 'subject-a')]);
  for (const value of ['1e-999', '-1e-999']) {
    const result = parseExperimentalJson(document.replace('"value": 2', `"value": ${value}`), structures);
    assert.equal(result.ok, false);
    assert.deepEqual(result.rows, []);
    assert.ok(result.errors.some((issue) => issue.code === 'invalid-value'));
  }
  const metadata = { notes: 'A literal "value": 1e-999 is text; escaped quote \\" and backslash \\ remain text.' };
  const textOnly = parseExperimentalJson(exportExperimentalJson([observation(2, 'subject-a')], metadata), structures);
  assert.equal(textOnly.ok, true);
  assert.equal(textOnly.rows[0].value, 2);
  assert.equal(textOnly.metadata?.notes, metadata.notes);
});

test('bare numeric time labels require units even when their magnitude is unrepresentable', () => {
  for (const timePoint of ['1e999', '1e-999']) {
    const csv = `${EXPERIMENTAL_COLUMNS.join(',')}\ndigimouse:3,signal,2,AU,subject-a,control,${timePoint}\n`;
    const imported = parseExperimentalCsv(csv, structures);
    assert.equal(imported.ok, false);
    assert.ok(imported.errors.some((issue) => issue.code === 'unlabelled-time-point'));
  }
});

test('CSV rejects normalized datasets that could not fit the supported JSON export budget', () => {
  const measurement = 'm'.repeat(100);
  const subjectPrefix = 's'.repeat(100);
  const records = Array.from({ length: 15_000 }, (_, index) =>
    `digimouse:3,${measurement},2,AU,${subjectPrefix}${index},control,baseline`);
  const csv = `${EXPERIMENTAL_COLUMNS.join(',')}\n${records.join('\n')}\n`;
  const imported = parseExperimentalCsv(csv, structures);
  assert.equal(imported.ok, false);
  assert.deepEqual(imported.rows, []);
  assert.ok(imported.errors.some((issue) => issue.code === 'normalized-dataset-too-large'));
});

test('a large accepted dataset roundtrips with the maximum supported metadata fields', () => {
  const measurement = 'm'.repeat(100);
  const subjectPrefix = 's'.repeat(100);
  const records = Array.from({ length: 12_000 }, (_, index) =>
    `digimouse:3,${measurement},2,AU,${subjectPrefix}${index},control,baseline`);
  const csv = `${EXPERIMENTAL_COLUMNS.join(',')}\n${records.join('\n')}\n`;
  const imported = parseExperimentalCsv(csv, structures);
  assert.equal(imported.ok, true);
  const metadata = { title: '\0'.repeat(4096), sourceReference: '\0'.repeat(4096),
    license: '\0'.repeat(4096), notes: '\0'.repeat(4096), origin: 'synthetic-example' as const };
  const exported = exportExperimentalJson(imported.rows, metadata);
  const reimported = parseExperimentalJson(exported, structures);
  assert.equal(reimported.ok, true);
  assert.equal(reimported.rows.length, 12_000);
  assert.deepEqual(reimported.rows[11_999], imported.rows[11_999]);
  assert.deepEqual(reimported.metadata, metadata);
});
