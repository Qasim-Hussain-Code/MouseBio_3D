import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEMS, PHYSIOLOGY_PROCESSES, EXPERIMENTAL_COLUMNS, MAX_IMPORT_BYTES,
  parseExperimentalCsv, parseExperimentalJson, validateExperimentalRows,
  summarizeMeasurements, compareConditions, exportExperimentalJson, exportExperimentalCsv,
  escapeCsvCell, readCsvRecords, evaluateIllustrativePhysiology,
} from '../src/domain/index';
import type { ExperimentalMeasurement } from '../src/domain/types';

const structures = [{ id: 'digimouse:3' }, { id: 'digimouse:4' }];
const header = EXPERIMENTAL_COLUMNS.join(',');
const row = (overrides: Partial<ExperimentalMeasurement> = {}): ExperimentalMeasurement => ({
  structureId: 'digimouse:3', measurement: 'signal', value: 2, unit: 'AU',
  replicate: 'mouse-01', condition: 'control', timePoint: 'baseline', ...overrides,
});
const csv = (records: string[] = ['digimouse:3,signal,2,AU,mouse-01,control,baseline']) => `${header}\n${records.join('\n')}\n`;
const hasError = (result: ReturnType<typeof parseExperimentalCsv>, code: string) => result.errors.some((error) => error.code === code);

test('all required systems have a physiology extension or an explicit illustrative process', () => {
  assert.equal(SYSTEMS.length, 14);
  assert.equal(new Set(SYSTEMS.map((system) => system.id)).size, 14);
  for (const system of SYSTEMS) assert.ok(PHYSIOLOGY_PROCESSES.some((process) => process.system === system.id));
  for (const process of PHYSIOLOGY_PROCESSES) {
    assert.equal(process.classification, 'illustrative');
    assert.ok(process.limitations.length);
    if (process.implementation === 'illustrative-deformation') assert.ok(process.equations?.length);
  }
});

test('CSV import accepts explicitly mapped finite measurements and flags one biological subject', () => {
  const parsed = parseExperimentalCsv(csv(), structures);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rows, [row()]);
  assert.equal(parsed.warnings[0].code, 'single-replicate');
});

test('CSV supports BOM, CRLF, quoted commas and escaped quotes', () => {
  const parsed = parseExperimentalCsv(`\uFEFF${header}\r\ndigimouse:3,"signal, \"\"fluorescence\"\"",2,AU,mouse-01,control,baseline\r\n`, structures);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows[0].measurement, 'signal, "fluorescence"');
});

test('CSV syntax accepts quoted newlines but rejects them in scientific identifiers', () => {
  assert.deepEqual(readCsvRecords('a,b\n"line\none",two\n'), [['a', 'b'], ['line\none', 'two']]);
  const parsed = parseExperimentalCsv(csv(['digimouse:3,"signal\nname",2,AU,mouse-01,control,baseline']), structures);
  assert.equal(parsed.ok, false);
  assert.ok(hasError(parsed, 'missing-or-invalid-field'));
});

test('CSV rejects malformed quotes and NUL without partial imports', () => {
  for (const contents of ['"unterminated', 'ab"cd', '"closed"extra', 'abc\0']) {
    const parsed = parseExperimentalCsv(`${header}\n${contents}`, structures);
    assert.equal(parsed.ok, false);
    assert.ok(hasError(parsed, 'invalid-csv'));
    assert.deepEqual(parsed.rows, []);
  }
});

test('CSV rejects missing, duplicated and unexpected columns', () => {
  assert.ok(hasError(parseExperimentalCsv('structure_id,value\ndigimouse:3,2\n', structures), 'missing-column'));
  assert.ok(hasError(parseExperimentalCsv(`${header},unit\n`, structures), 'duplicate-column'));
  assert.ok(hasError(parseExperimentalCsv(`${header},secret\n`, structures), 'unexpected-column'));
});

test('CSV checks shape and empty records', () => {
  assert.ok(hasError(parseExperimentalCsv(csv(['digimouse:3,signal,2']), structures), 'column-count'));
  assert.ok(hasError(parseExperimentalCsv(`${csv()}\n`, structures), 'column-count'));
  assert.ok(hasError(parseExperimentalCsv('', structures), 'empty-data'));
  assert.ok(hasError(parseExperimentalCsv(`${header}\n`, structures), 'empty-data'));
});

test('CSV checks UTF-8 byte size, field size and row limits', () => {
  assert.ok(hasError(parseExperimentalCsv('a'.repeat(MAX_IMPORT_BYTES + 1), structures), 'file-too-large'));
  assert.ok(hasError(parseExperimentalCsv(csv(), structures, { maxBytes: 10 }), 'file-too-large'));
  assert.ok(hasError(parseExperimentalCsv(csv(), structures, { maxRows: 0 }), 'invalid-csv'));
  assert.ok(hasError(parseExperimentalCsv(csv([`digimouse:3,${'a'.repeat(4097)},2,AU,m,control,baseline`]), structures), 'invalid-csv'));
});

test('missing measurements and unknown anatomy are rejected atomically', () => {
  const parsed = parseExperimentalCsv(csv([
    'digimouse:3,signal,2,AU,mouse-01,control,baseline',
    'digimouse:999,signal,,AU,mouse-02,control,baseline',
  ]), structures);
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.rows, []);
  assert.ok(hasError(parsed, 'invalid-value'));
  assert.ok(hasError(parseExperimentalCsv(csv(['digimouse:999,signal,2,AU,m,control,baseline']), structures), 'unknown-structure'));
});

test('measurement numbers reject nonfinite values, hex, formulas and blanks', () => {
  for (const value of ['NaN', 'Infinity', '-Infinity', '1e999', '0x10', '=2+2', '']) {
    const parsed = parseExperimentalCsv(csv([`digimouse:3,signal,${value},AU,m,control,baseline`]), structures);
    assert.ok(hasError(parsed, 'invalid-value'), value);
  }
  assert.equal(parseExperimentalCsv(csv(['digimouse:3,signal,-2.5e-3,AU,m,control,baseline']), structures).rows[0].value, -0.0025);
});

test('units must be declared and never converted silently', () => {
  assert.ok(hasError(parseExperimentalCsv(csv(['digimouse:3,mass,2,arbitrary,m,control,baseline']), structures), 'unsupported-unit'));
  assert.equal(parseExperimentalCsv(csv(['digimouse:3,mass,2,custom-unit,m,control,baseline']), structures,
    { allowedUnits: ['custom-unit'] }).ok, true);
  assert.ok(hasError(parseExperimentalCsv(csv([
    'digimouse:3,mass,2,g,m1,control,baseline', 'digimouse:3,mass,2000,mg,m2,control,baseline',
  ]), structures), 'incompatible-unit'));
});

test('numeric time points require explicit units', () => {
  assert.ok(hasError(parseExperimentalCsv(csv(['digimouse:3,signal,2,AU,m,control,24']), structures), 'unlabelled-time-point'));
  assert.equal(parseExperimentalCsv(csv(['digimouse:3,signal,2,AU,m,control,24 h']), structures).ok, true);
});

test('duplicate biological replicates are rejected within the complete experimental grouping', () => {
  const parsed = validateExperimentalRows([row(), row({ value: 3 })], structures);
  assert.ok(hasError(parsed, 'duplicate-biological-replicate'));
  assert.equal(validateExperimentalRows([row(), row({ timePoint: '24 h' })], structures).ok, true);
  assert.equal(validateExperimentalRows([row(), row({ structureId: 'digimouse:4' })], structures).ok, true);
});

test('summary preserves groups, distinct subject counts and sample standard deviation', () => {
  const summary = summarizeMeasurements([row({ value: 1 }), row({ value: 3, replicate: 'mouse-02' }), row({ condition: 'treatment', value: 10 })]);
  const control = summary.find((group) => group.condition === 'control')!;
  assert.equal(control.n, 2);
  assert.equal(control.mean, 2);
  assert.ok(Math.abs(control.sd! - Math.sqrt(2)) < 1e-12);
  assert.equal(control.minimum, 1);
  assert.equal(control.maximum, 3);
  assert.equal(summary.find((group) => group.condition === 'treatment')!.sd, null);
});

test('statistics handle large finite values without intermediate squared-sum overflow', () => {
  const summary = summarizeMeasurements([row({ value: 1e200 }), row({ value: 2e200, replicate: 'mouse-02' })])[0];
  assert.ok(Number.isFinite(summary.mean));
  assert.ok(Number.isFinite(summary.sd));
  assert.ok(Math.abs(summary.mean / 1e200 - 1.5) < 1e-12);
  assert.ok(hasError(validateExperimentalRows([row({ value: -1.7e308 }), row({ value: 1.7e308, replicate: 'mouse-02' })], structures), 'numeric-overflow'));
});

const selector = { structureId: 'digimouse:3', measurement: 'signal', unit: 'AU', timePoint: 'baseline', conditionA: 'control', conditionB: 'treatment' };
test('comparison reports B minus A without inferential statistics', () => {
  const result = compareConditions([row({ value: 2 }), row({ condition: 'treatment', value: 5, replicate: 'mouse-02' })], selector);
  assert.equal(result.ok, true);
  assert.equal(result.difference, 3);
  assert.equal(result.groups[0].condition, 'control');
  assert.equal(result.groups[1].condition, 'treatment');
  assert.equal(result.warnings[0].code, 'single-replicate');
});

test('comparison refuses mismatched units, missing time points and identical conditions', () => {
  assert.equal(compareConditions([row(), row({ condition: 'treatment', unit: 'g' })], selector).errors[0].code, 'incompatible-unit');
  assert.equal(compareConditions([row(), row({ condition: 'treatment', timePoint: '24 h' })], selector).errors[0].code, 'missing-comparison-group');
  assert.equal(compareConditions([row()], { ...selector, conditionB: 'control' }).errors[0].code, 'identical-conditions');
});

test('comparison reports shared subjects and refuses duplicate or nonfinite values', () => {
  const paired = compareConditions([row(), row({ condition: 'treatment', value: 4 })], selector);
  assert.deepEqual(paired.sharedReplicates, ['mouse-01']);
  assert.ok(paired.warnings.some((warning) => warning.code === 'shared-biological-subjects'));
  assert.equal(compareConditions([row(), row(), row({ condition: 'treatment' })], selector).ok, false);
  assert.equal(compareConditions([row(), row({ condition: 'treatment', value: NaN })], selector).ok, false);
});

test('JSON export preserves individual measurements, provenance and explicit synthetic origin', () => {
  const original = [row(), row({ value: 4, replicate: 'mouse-02' })];
  const text = exportExperimentalJson(original, { title: 'Parser fixture', origin: 'synthetic-example', sourceReference: 'Unit test only' });
  const result = parseExperimentalJson(text, structures);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, original);
  assert.equal(result.metadata?.origin, 'synthetic-example');
  assert.equal(result.metadata?.sourceReference, 'Unit test only');
});

test('JSON rejects unexpected schemas, fields, prototype keys and malformed measurements', () => {
  for (const contents of [
    '[]', '{}', '{',
    '{"schemaVersion":"other","dataset":{},"measurements":[]}',
    '{"schemaVersion":"mousebio.experimental.v1","dataset":{"__proto__":{}},"measurements":[]}',
    '{"schemaVersion":"mousebio.experimental.v1","dataset":{},"measurements":[{"unexpected":"x"}]}',
  ]) assert.equal(parseExperimentalJson(contents, structures).ok, false);
  assert.equal(parseExperimentalJson(exportExperimentalJson([row()]), structures).ok, true);
  assert.equal(parseExperimentalJson(exportExperimentalJson([row()]), structures, { maxBytes: 3 }).ok, false);
  assert.throws(() => exportExperimentalJson([row({ value: NaN })]), /Nonfinite/);
});

test('CSV export quotes commas and neutralizes spreadsheet formulas without altering numeric values', () => {
  assert.equal(escapeCsvCell('=cmd()'), "'=cmd()");
  assert.equal(escapeCsvCell(' +1'), "' +1");
  assert.equal(escapeCsvCell('@formula'), "'@formula");
  assert.equal(escapeCsvCell('\tformula'), "'\tformula");
  const exported = exportExperimentalCsv([row({ measurement: 'signal, "test"', value: -2, replicate: '=formula' })]);
  const records = readCsvRecords(exported);
  assert.equal(records[1][1], 'signal, "test"');
  assert.equal(records[1][2], '-2');
  assert.equal(records[1][4], "'=formula");
  assert.throws(() => exportExperimentalCsv([row({ value: Infinity })]), /Nonfinite/);
});

test('illustrative physiology is deterministic, bounded and individually isolated', () => {
  for (let index = 0; index <= 120; index++) {
    const time = index / 10;
    const state = evaluateIllustrativePhysiology(time);
    assert.ok(state.cardiacScale >= 0.965 && state.cardiacScale <= 1);
    assert.ok(state.respiratoryScale >= 0.975 && state.respiratoryScale <= 1.025);
    assert.deepEqual(evaluateIllustrativePhysiology(time), state);
  }
  assert.equal(evaluateIllustrativePhysiology(0.25, { cardiac: false }).cardiacScale, 1);
  assert.equal(evaluateIllustrativePhysiology(0.25, { respiratory: false }).respiratoryScale, 1);
  assert.deepEqual(evaluateIllustrativePhysiology(2, { speed: 0 }), evaluateIllustrativePhysiology(0));
  assert.deepEqual(evaluateIllustrativePhysiology(0.5, { speed: 2 }), evaluateIllustrativePhysiology(1));
});

test('illustrative physiology rejects invalid playback inputs', () => {
  for (const time of [-1, NaN, Infinity]) assert.throws(() => evaluateIllustrativePhysiology(time));
  for (const speed of [-1, NaN, Infinity, 9]) assert.throws(() => evaluateIllustrativePhysiology(1, { speed }));
});
