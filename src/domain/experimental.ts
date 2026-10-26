import type {
  DatasetMetadata,
  ExperimentalMeasurement,
  ImportResult,
  MeasurementSummary,
  Structure,
  ValidationIssue,
} from './types';

export const EXPERIMENTAL_SCHEMA_VERSION = 'mousebio.experimental.v1' as const;
export const EXPERIMENTAL_COLUMNS = [
  'structure_id', 'measurement', 'value', 'unit', 'replicate', 'condition', 'time_point',
] as const;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;
const MAX_FIELD_LENGTH = 4096;
const DECIMAL_SYNTAX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A conservative syntax vocabulary, not a claim of dimensional equivalence or conversion. */
export const SUPPORTED_UNITS = [
  '1', '%', 'count', 'counts', 'copies', 'AU', 'a.u.', 'TPM', 'CPM', 'FPKM', 'RPKM',
  'kg', 'g', 'mg', 'ug', 'µg', 'ng', 'pg', 'm', 'cm', 'mm', 'um', 'µm', 'nm',
  'L', 'mL', 'uL', 'µL', 'nL', 's', 'ms', 'min', 'h', 'day', 'Hz', 'bpm',
  'Pa', 'kPa', 'mmHg', 'K', 'degC', 'mV', 'V', 'A', 'mA', 'pA',
  'mol/L', 'mmol/L', 'umol/L', 'µmol/L', 'nmol/L', 'g/L', 'mg/L',
  'mg/mL', 'ug/mL', 'µg/mL', 'ng/mL', 'pg/mL', 'mL/min', 'uL/min', 'µL/min',
] as const;

type StructureInput = readonly Pick<Structure, 'id'>[] | readonly string[];
export interface ImportOptions {
  /** Extra explicitly declared units are accepted without automatic conversion. */
  allowedUnits?: readonly string[];
  maxBytes?: number;
  maxRows?: number;
}

const fail = (errors: ValidationIssue[], warnings: ValidationIssue[] = []): ImportResult => ({
  ok: false, rows: [], errors, warnings,
});

function inputLimit(text: string, options: ImportOptions): ValidationIssue | null {
  if (new TextEncoder().encode(text).byteLength > (options.maxBytes ?? MAX_IMPORT_BYTES)) {
    return { code: 'file-too-large', message: 'The file exceeds the local import size limit.' };
  }
  return null;
}

/** Strict RFC 4180-style records, including escaped quotes and quoted newlines. */
export function readCsvRecords(text: string, maxRows = MAX_IMPORT_ROWS + 1): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let started = false;
  const appendField = () => {
    if (field.length > MAX_FIELD_LENGTH) throw new Error('A CSV field exceeds 4096 characters.');
    record.push(field);
    field = '';
    closedQuote = false;
    started = false;
  };
  const appendRecord = () => {
    appendField();
    records.push(record);
    record = [];
    if (records.length > maxRows) throw new Error('The CSV exceeds the row limit.');
  };
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '\0') throw new Error('NUL characters are not accepted.');
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closedQuote = true; }
      } else field += char;
    } else if (char === ',') appendField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      appendRecord();
    } else if (char === '"') {
      if (started || closedQuote) throw new Error('A quote appears inside an unquoted CSV field.');
      quoted = true;
      started = true;
    } else {
      if (closedQuote) throw new Error('Unexpected characters after a closing CSV quote.');
      field += char;
      started = true;
    }
    if (field.length > MAX_FIELD_LENGTH) throw new Error('A CSV field exceeds 4096 characters.');
  }
  if (quoted) throw new Error('A quoted CSV field is not closed.');
  if (field.length || record.length || started || closedQuote) appendRecord();
  return records;
}

function key(parts: readonly string[]): string {
  return JSON.stringify(parts);
}

function normalizedMeasurements(rows: readonly ExperimentalMeasurement[]): ExperimentalMeasurement[] {
  return rows.map((row) => ({ structureId: row.structureId, measurement: row.measurement,
    value: row.value, unit: row.unit, replicate: row.replicate, condition: row.condition, timePoint: row.timePoint }));
}

function formatDataset(rows: readonly ExperimentalMeasurement[], metadata: DatasetMetadata): string {
  return `${JSON.stringify({ schemaVersion: EXPERIMENTAL_SCHEMA_VERSION,
    dataset: { origin: 'user-data', ...metadata }, measurements: normalizedMeasurements(rows) }, null, 2)}\n`;
}

// Reserve the largest supported metadata envelope, including worst-case JSON
// escaping. An accepted CSV can then acquire a filename or other valid provenance
// fields without producing an export that its own default importer refuses.
const MAXIMUM_EXPORT_METADATA: DatasetMetadata = {
  title: '\0'.repeat(MAX_FIELD_LENGTH), sourceReference: '\0'.repeat(MAX_FIELD_LENGTH),
  license: '\0'.repeat(MAX_FIELD_LENGTH), notes: '\0'.repeat(MAX_FIELD_LENGTH), origin: 'synthetic-example',
};

function canonicalExportFits(rows: readonly ExperimentalMeasurement[], options: ImportOptions): boolean {
  const limit = Math.min(options.maxBytes ?? MAX_IMPORT_BYTES, MAX_IMPORT_BYTES);
  return new TextEncoder().encode(formatDataset(rows, MAXIMUM_EXPORT_METADATA)).byteLength <= limit;
}

/** Native JSON.parse loses a nonzero underflowed number's lexical representation. */
function hasUnderflowingJsonNumber(text: string): boolean {
  const numericToken = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let insideString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (insideString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') insideString = false;
    } else if (character === '"') insideString = true;
    else if (character === '-' || (character >= '0' && character <= '9')) {
      numericToken.lastIndex = index;
      const match = numericToken.exec(text);
      if (match) {
        if (Number(match[0]) === 0 && /[1-9]/.test(match[0].split(/[eE]/)[0])) return true;
        index = numericToken.lastIndex - 1;
      }
    }
  }
  return false;
}

function structureIds(structures: StructureInput): Set<string> {
  return new Set(structures.map((structure) => typeof structure === 'string' ? structure : structure.id));
}

function normalizeValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!DECIMAL_SYNTAX.test(trimmed)) return null;
  const numeric = Number(trimmed);
  // Do not replace a nonzero submitted decimal with zero through underflow.
  if (numeric === 0 && /[1-9]/.test(trimmed.split(/[eE]/)[0])) return null;
  return Number.isFinite(numeric) ? numeric : null;
}

function label(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_FIELD_LENGTH || /[\u0000-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
}

/** Validate entire data atomically. Any error yields zero accepted measurements. */
export function validateExperimentalRows(
  input: readonly unknown[], structures: StructureInput, options: ImportOptions = {},
): ImportResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!input.length) return fail([{ code: 'empty-data', message: 'Provide at least one measurement.' }]);
  if (input.length > (options.maxRows ?? MAX_IMPORT_ROWS)) {
    return fail([{ code: 'too-many-rows', message: 'The dataset exceeds the local row limit.' }]);
  }
  const knownStructures = structureIds(structures);
  const units = new Set<string>([...SUPPORTED_UNITS, ...(options.allowedUnits ?? [])]);
  const rows: ExperimentalMeasurement[] = [];
  const identities = new Set<string>();
  const measurementUnits = new Map<string, string>();
  for (let index = 0; index < input.length; index++) {
    const entry = input[index];
    const rowNumber = index + 2;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push({ code: 'invalid-record', row: rowNumber, message: 'Each measurement must be an object.' });
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const mappings = [
      ['structureId', 'structure_id'], ['measurement', 'measurement'], ['unit', 'unit'],
      ['replicate', 'replicate'], ['condition', 'condition'], ['timePoint', 'time_point'],
    ] as const;
    const fields: Record<string, string> = {};
    let invalid = false;
    for (const [property, column] of mappings) {
      const normalized = label(raw[property]);
      if (normalized === null) {
        errors.push({ code: 'missing-or-invalid-field', row: rowNumber, column,
          message: `${column} must contain a nonempty text label without control characters.` });
        invalid = true;
      } else fields[property] = normalized;
    }
    const value = normalizeValue(raw.value);
    if (value === null) {
      errors.push({ code: 'invalid-value', row: rowNumber, column: 'value',
        message: 'value must be a finite decimal number, including optional scientific notation.' });
      invalid = true;
    }
    if (invalid) continue;
    if (DECIMAL_SYNTAX.test(fields.timePoint)) {
      errors.push({ code: 'unlabelled-time-point', row: rowNumber, column: 'time_point',
        message: 'Numeric time points require a time unit, for example 24 h, or an explicit categorical label.' });
    }
    if (!knownStructures.has(fields.structureId)) {
      errors.push({ code: 'unknown-structure', row: rowNumber, column: 'structure_id',
        message: `Unknown anatomical identifier: ${fields.structureId}.` });
    }
    if (!units.has(fields.unit)) {
      errors.push({ code: 'unsupported-unit', row: rowNumber, column: 'unit',
        message: `Unit ${fields.unit} is not declared in the supported unit vocabulary.` });
    }
    const previousUnit = measurementUnits.get(fields.measurement);
    if (previousUnit && previousUnit !== fields.unit) {
      errors.push({ code: 'incompatible-unit', row: rowNumber, column: 'unit',
        message: `Measurement ${fields.measurement} uses both ${previousUnit} and ${fields.unit}. Convert explicitly before import.` });
    } else measurementUnits.set(fields.measurement, fields.unit);
    const identity = key([fields.structureId, fields.measurement, fields.condition, fields.timePoint, fields.replicate]);
    if (identities.has(identity)) {
      errors.push({ code: 'duplicate-biological-replicate', row: rowNumber, column: 'replicate',
        message: 'A biological replicate occurs more than once for the same structure, measurement, condition and time point.' });
    }
    identities.add(identity);
    rows.push({
      structureId: fields.structureId, measurement: fields.measurement, value: value!, unit: fields.unit,
      replicate: fields.replicate, condition: fields.condition, timePoint: fields.timePoint,
    });
  }
  if (errors.length) return fail(errors, warnings);
  const summaries = summarizeMeasurements(rows);
  const singleReplicateGroups = summaries.filter((group) => group.n < 2).length;
  if (summaries.some((group) => !Number.isFinite(group.mean)
      || (group.sd !== null && !Number.isFinite(group.sd)))) {
    return fail([{ code: 'numeric-overflow', message: 'Group statistics exceed the finite numeric range. Rescale measurement units before import.' }]);
  }
  if (!canonicalExportFits(rows, options)) {
    return fail([{ code: 'normalized-dataset-too-large',
      message: 'Normalized JSON with the reserved provenance envelope exceeds the 5 MiB limit. Split the dataset before import.' }]);
  }
  if (singleReplicateGroups) warnings.push({ code: 'single-replicate',
    message: `${singleReplicateGroups} group(s) contain one biological replicate; sample standard deviation is unavailable.` });
  return { ok: true, rows, errors, warnings };
}

export function parseExperimentalCsv(
  text: string, structures: StructureInput, options: ImportOptions = {},
): ImportResult {
  const limit = inputLimit(text, options);
  if (limit) return fail([limit]);
  let records: string[][];
  try { records = readCsvRecords(text, (options.maxRows ?? MAX_IMPORT_ROWS) + 1); }
  catch (error) { return fail([{ code: 'invalid-csv', message: (error as Error).message }]); }
  if (!records.length) return fail([{ code: 'empty-data', message: 'The CSV file is empty.' }]);
  const headers = records[0].map((header) => header.trim());
  const errors: ValidationIssue[] = [];
  for (const column of EXPERIMENTAL_COLUMNS) {
    if (!headers.includes(column)) errors.push({ code: 'missing-column', column, message: `Missing required column: ${column}.` });
  }
  if (new Set(headers).size !== headers.length) errors.push({ code: 'duplicate-column', message: 'CSV header names must be unique.' });
  const extras = headers.filter((header) => !EXPERIMENTAL_COLUMNS.includes(header as typeof EXPERIMENTAL_COLUMNS[number]));
  if (extras.length) errors.push({ code: 'unexpected-column', message: `Unexpected CSV column(s): ${extras.join(', ')}. Preserve provenance in the dataset metadata when exporting JSON.` });
  if (errors.length) return fail(errors);
  const recordsAsObjects: Record<string, unknown>[] = [];
  for (let index = 1; index < records.length; index++) {
    const record = records[index];
    if (record.length !== headers.length) {
      errors.push({ code: 'column-count', row: index + 1, message: 'The CSV record has a different column count from its header.' });
      continue;
    }
    const read = (name: string) => record[headers.indexOf(name)];
    recordsAsObjects.push({ structureId: read('structure_id'), measurement: read('measurement'), value: read('value'),
      unit: read('unit'), replicate: read('replicate'), condition: read('condition'), timePoint: read('time_point') });
  }
  if (errors.length) return fail(errors);
  return validateExperimentalRows(recordsAsObjects, structures, options);
}

const METADATA_FIELDS = ['title', 'sourceReference', 'license', 'notes', 'origin'] as const;
function validateMetadata(input: unknown): DatasetMetadata | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((name) => !METADATA_FIELDS.includes(name as typeof METADATA_FIELDS[number]))) return null;
  const output: DatasetMetadata = {};
  for (const name of METADATA_FIELDS) {
    if (record[name] === undefined) continue;
    if (typeof record[name] !== 'string' || (record[name] as string).length > MAX_FIELD_LENGTH) return null;
    if (name === 'origin' && record[name] !== 'user-data' && record[name] !== 'synthetic-example') return null;
    Object.assign(output, { [name]: record[name] });
  }
  return output;
}

export function parseExperimentalJson(
  text: string, structures: StructureInput, options: ImportOptions = {},
): ImportResult {
  const limit = inputLimit(text, options);
  if (limit) return fail([limit]);
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { return fail([{ code: 'invalid-json', message: 'The file is not valid JSON.' }]); }
  if (hasUnderflowingJsonNumber(text)) {
    return fail([{ code: 'invalid-value', message: 'A nonzero JSON number underflows to zero. Rescale measurement units before import.' }]);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail([{ code: 'invalid-json-schema', message: 'The JSON document must be an experimental dataset object.' }]);
  }
  const dataset = parsed as Record<string, unknown>;
  if (dataset.schemaVersion !== EXPERIMENTAL_SCHEMA_VERSION || !Array.isArray(dataset.measurements)
      || Object.keys(dataset).some((name) => !['schemaVersion', 'dataset', 'measurements'].includes(name))) {
    return fail([{ code: 'invalid-json-schema', message: `Expected ${EXPERIMENTAL_SCHEMA_VERSION}, dataset metadata and measurements.` }]);
  }
  const metadata = validateMetadata(dataset.dataset);
  if (!metadata) return fail([{ code: 'invalid-metadata', message: 'Dataset metadata contains an invalid field or value.' }]);
  const measurementFields = ['structureId', 'measurement', 'value', 'unit', 'replicate', 'condition', 'timePoint'];
  if (dataset.measurements.some((entry) => entry && typeof entry === 'object'
      && Object.keys(entry).some((name) => !measurementFields.includes(name)))) {
    return fail([{ code: 'unexpected-field', message: 'Measurement records contain unexpected fields.' }]);
  }
  if (dataset.measurements.some((entry) => entry && typeof entry === 'object'
      && typeof (entry as Record<string, unknown>).value !== 'number')) {
    return fail([{ code: 'invalid-value', message: 'JSON measurement values must be finite numbers.' }]);
  }
  return { ...validateExperimentalRows(dataset.measurements, structures, options), metadata };
}

export function summarizeMeasurements(rows: readonly ExperimentalMeasurement[]): MeasurementSummary[] {
  const groups = new Map<string, ExperimentalMeasurement[]>();
  for (const row of rows) {
    const identity = key([row.structureId, row.measurement, row.unit, row.condition, row.timePoint]);
    const group = groups.get(identity) ?? [];
    group.push(row);
    groups.set(identity, group);
  }
  return [...groups.values()].map((group) => {
    // Scale first so the difference of very large finite values does not overflow.
    const scale = group.reduce((largest, row) => Math.max(largest, Math.abs(row.value)), 0) || 1;
    let mean = 0;
    let secondMoment = 0;
    let minimum = Infinity;
    let maximum = -Infinity;
    group.forEach((row, index) => {
      const normalizedValue = row.value / scale;
      const delta = normalizedValue - mean;
      mean += delta / (index + 1);
      secondMoment += delta * (normalizedValue - mean);
      minimum = Math.min(minimum, row.value);
      maximum = Math.max(maximum, row.value);
    });
    const first = group[0];
    return {
      structureId: first.structureId, measurement: first.measurement, unit: first.unit,
      condition: first.condition, timePoint: first.timePoint, n: group.length, mean: mean * scale,
      sd: group.length > 1 ? scale * Math.sqrt(Math.max(0, secondMoment / (group.length - 1))) : null,
      minimum, maximum, replicates: group.map((row) => row.replicate),
    };
  }).sort((a, b) => key([a.structureId, a.measurement, a.unit, a.timePoint, a.condition])
    .localeCompare(key([b.structureId, b.measurement, b.unit, b.timePoint, b.condition])));
}

export interface ComparisonSelector {
  structureId: string;
  measurement: string;
  unit: string;
  timePoint: string;
  conditionA: string;
  conditionB: string;
}
export interface ConditionComparison {
  ok: boolean;
  groups: MeasurementSummary[];
  /** Mean B minus mean A in the declared unit; no inferential claim. */
  difference: number | null;
  sharedReplicates: string[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function compareConditions(
  rows: readonly ExperimentalMeasurement[], selector: ComparisonSelector,
): ConditionComparison {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const groups: MeasurementSummary[] = [];
  const result = (): ConditionComparison => ({ ok: false, groups, difference: null, sharedReplicates: [], errors, warnings });
  if (selector.conditionA === selector.conditionB) {
    errors.push({ code: 'identical-conditions', message: 'Choose two distinct experimental conditions.' });
    return result();
  }
  const selected = rows.filter((row) => row.structureId === selector.structureId
    && row.measurement === selector.measurement && row.timePoint === selector.timePoint
    && (row.condition === selector.conditionA || row.condition === selector.conditionB));
  if (selected.some((row) => row.unit !== selector.unit)) {
    errors.push({ code: 'incompatible-unit', message: 'Comparison groups use incompatible units. Explicit conversion is required.' });
    return result();
  }
  const identities = new Set<string>();
  for (const row of selected) {
    const identity = key([row.condition, row.replicate]);
    if (identities.has(identity)) errors.push({ code: 'duplicate-biological-replicate',
      message: 'Comparison contains repeated biological replicate records.' });
    identities.add(identity);
    if (!Number.isFinite(row.value)) errors.push({ code: 'invalid-value', message: 'Comparison contains a nonfinite value.' });
  }
  if (errors.length) return result();
  const summaries = summarizeMeasurements(selected);
  if (summaries.some((group) => !Number.isFinite(group.mean)
      || (group.sd !== null && !Number.isFinite(group.sd)))) {
    errors.push({ code: 'numeric-overflow',
      message: 'Comparison group statistics exceed the finite numeric range. Rescale units before comparison.' });
    return result();
  }
  for (const condition of [selector.conditionA, selector.conditionB]) {
    const summary = summaries.find((entry) => entry.condition === condition);
    if (!summary) errors.push({ code: 'missing-comparison-group', message: `No compatible observations for condition ${condition}.` });
    else groups.push(summary);
  }
  if (errors.length) return result();
  const sharedReplicates = groups[0].replicates.filter((replicate) => groups[1].replicates.includes(replicate));
  if (sharedReplicates.length) warnings.push({ code: 'shared-biological-subjects',
    message: 'Conditions share biological subject identifiers. These observations are not independent groups.' });
  if (groups.some((group) => group.n < 2)) warnings.push({ code: 'single-replicate',
    message: 'At least one group has one biological replicate; its sample standard deviation is unavailable.' });
  const difference = groups[1].mean - groups[0].mean;
  if (!Number.isFinite(difference)) {
    errors.push({ code: 'numeric-overflow', message: 'The mean difference exceeds the finite numeric range. Rescale units before comparison.' });
    return { ...result(), sharedReplicates };
  }
  return { ok: true, groups, difference, sharedReplicates, errors, warnings };
}

export function exportExperimentalJson(
  rows: readonly ExperimentalMeasurement[], metadata: DatasetMetadata = {},
): string {
  const checked = validateMetadata(metadata);
  if (!checked) throw new Error('Dataset metadata contains unsupported fields or values.');
  for (const row of rows) if (!Number.isFinite(row.value)) throw new Error('Nonfinite values cannot be exported.');
  const exported = formatDataset(rows, checked);
  if (new TextEncoder().encode(exported).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('Normalized JSON exceeds the 5 MiB export limit. Split the dataset before export.');
  }
  return exported;
}

/** Escape spreadsheet formula triggers without changing genuine numeric measurements. */
export function escapeCsvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportExperimentalCsv(rows: readonly ExperimentalMeasurement[]): string {
  const records = rows.map((row) => {
    if (!Number.isFinite(row.value)) throw new Error('Nonfinite values cannot be exported.');
    return [escapeCsvCell(row.structureId), escapeCsvCell(row.measurement), String(row.value),
      escapeCsvCell(row.unit), escapeCsvCell(row.replicate), escapeCsvCell(row.condition), escapeCsvCell(row.timePoint)].join(',');
  });
  return `${EXPERIMENTAL_COLUMNS.join(',')}\r\n${records.join('\r\n')}${records.length ? '\r\n' : ''}`;
}
