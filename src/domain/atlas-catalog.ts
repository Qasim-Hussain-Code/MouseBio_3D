import { SYSTEMS, type Atlas, type DatasetMetadata, type ExperimentalMeasurement, type SystemId } from './types';
import { exportExperimentalJson, parseExperimentalJson, type ImportOptions } from './experimental';

export const MAX_ANATOMY_REFERENCES = 32;
export type VoxelSpacingMm = readonly [number, number, number];

export interface AnatomyReference {
  readonly id: string;
  readonly title: string;
  readonly manifestUrl: string;
  readonly coordinateFrameId: string;
  readonly assetSha256: string;
  readonly coverage: {
    readonly regionCount: number;
    readonly systems: readonly SystemId[];
    readonly description: string;
  };
  readonly processingResolution: {
    readonly sourceVoxelSpacingMm: VoxelSpacingMm | null;
    readonly processingVoxelSpacingMm: VoxelSpacingMm | null;
    readonly method: string;
    readonly limitations: readonly string[];
  };
  readonly licenses: readonly { readonly identifier: string; readonly url: string }[];
}

export interface ReferenceCatalogResult {
  ok: boolean;
  catalog: readonly AnatomyReference[];
  errors: string[];
}

export interface ReferenceValidationResult { ok: boolean; errors: string[] }
export interface AtlasExperimentalData { rows: ExperimentalMeasurement[]; metadata: DatasetMetadata }

/** Opaque in-memory handle. Dataset contents are held in a private WeakMap. */
export interface AtlasExperimentalBank { readonly kind: 'mousebio.private-experimental-bank.v1' }
export interface AtlasBankWriteResult {
  ok: boolean;
  bank: AtlasExperimentalBank;
  errors: string[];
}
export interface AtlasBankReadResult {
  ok: boolean;
  found: boolean;
  data?: AtlasExperimentalData;
  errors: string[];
}
export interface AtlasBankSwitchResult extends AtlasBankWriteResult {
  data?: AtlasExperimentalData;
  restored: boolean;
}

interface AtlasBinding { atlasId: string; assetSha256: string; coordinateFrameId: string; regionIds: readonly string[] }
interface CachedDataset extends AtlasBinding {
  readonly rows: readonly Readonly<ExperimentalMeasurement>[];
  readonly metadata: Readonly<DatasetMetadata>;
}
const banks = new WeakMap<AtlasExperimentalBank, ReadonlyMap<string, CachedDataset>>();
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SYSTEM_IDS = new Set<string>(SYSTEMS.map((system) => system.id));
const METADATA_FIELDS = ['title', 'sourceReference', 'license', 'notes', 'origin'] as const;

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => !UNSAFE_KEYS.has(field) && fields.includes(field));
}

function text(value: unknown, limit = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
    && value === value.trim() && !/[\u0000-\u001F\u007F]/.test(value);
}

function identifier(value: unknown): value is string {
  return text(value, 256) && /^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(value) && !UNSAFE_KEYS.has(value);
}

function checksum(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function localManifest(value: unknown): value is string {
  if (!text(value, 1024) || !value.startsWith('/') || value.startsWith('//') || !value.endsWith('.json')
      || /[%?#:\\\s]/.test(value)) return false;
  return value.slice(1).split('/').every((part) => /^[A-Za-z0-9_.-]+$/.test(part)
    && part !== '.' && part !== '..' && !UNSAFE_KEYS.has(part));
}

function httpsReference(value: unknown): value is string {
  if (!text(value, 2048)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !!parsed.hostname && !parsed.username && !parsed.password
      && !parsed.hash && !parsed.search && !parsed.port;
  } catch { return false; }
}

function spacing(value: unknown): value is VoxelSpacingMm | null {
  return value === null || Array.isArray(value) && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component) && component > 0);
}

function freezeSpacing(value: VoxelSpacingMm | null): VoxelSpacingMm | null {
  return value === null ? null : Object.freeze([value[0], value[1], value[2]]) as VoxelSpacingMm;
}

/** Validate declarations only. A catalog does not add structures or establish registration. */
export function buildReferenceCatalog(input: unknown): ReferenceCatalogResult {
  const errors: string[] = [];
  const catalog: AnatomyReference[] = [];
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_ANATOMY_REFERENCES) {
    return { ok: false, catalog: Object.freeze([]), errors: ['Provide between one and 32 anatomy references.'] };
  }
  const ids = new Set<string>();
  const manifests = new Set<string>();
  for (let index = 0; index < input.length; index++) {
    const entry = input[index];
    const label = `Reference ${index + 1}`;
    const before = errors.length;
    if (!record(entry) || !exactFields(entry, ['id', 'title', 'manifestUrl', 'coordinateFrameId', 'assetSha256',
      'coverage', 'processingResolution', 'licenses'])) {
      errors.push(`${label} must contain only the supported catalog fields.`);
      continue;
    }
    if (!identifier(entry.id) || !identifier(entry.coordinateFrameId) || !checksum(entry.assetSha256)
        || !text(entry.title, 256) || !localManifest(entry.manifestUrl)) {
      errors.push(`${label} requires stable identity, a checksum, title and an application-local manifest URL.`);
    }
    if (typeof entry.id === 'string') {
      if (ids.has(entry.id)) errors.push(`${label} repeats an atlas identifier.`);
      ids.add(entry.id);
    }
    if (typeof entry.manifestUrl === 'string') {
      if (manifests.has(entry.manifestUrl)) errors.push(`${label} repeats a manifest URL.`);
      manifests.add(entry.manifestUrl);
    }
    const coverage = entry.coverage;
    if (!record(coverage) || !exactFields(coverage, ['regionCount', 'systems', 'description'])
        || typeof coverage.regionCount !== 'number' || !Number.isSafeInteger(coverage.regionCount)
        || coverage.regionCount < 1 || coverage.regionCount > 100_000 || !text(coverage.description)
        || !Array.isArray(coverage.systems) || coverage.systems.length > SYSTEMS.length
        || !coverage.systems.every((system) => typeof system === 'string' && SYSTEM_IDS.has(system))
        || new Set(coverage.systems).size !== coverage.systems.length) {
      errors.push(`${label} requires an explicit region count, unique supported system categories and a coverage description.`);
    }
    const resolution = entry.processingResolution;
    if (!record(resolution) || !exactFields(resolution,
      ['sourceVoxelSpacingMm', 'processingVoxelSpacingMm', 'method', 'limitations'])
        || !spacing(resolution.sourceVoxelSpacingMm) || !spacing(resolution.processingVoxelSpacingMm)
        || !text(resolution.method) || !Array.isArray(resolution.limitations) || !resolution.limitations.length
        || resolution.limitations.length > 32 || !resolution.limitations.every((limitation) => text(limitation))) {
      errors.push(`${label} requires source and processing spacings or explicit nulls, a method and limitations.`);
    }
    const licenses = entry.licenses;
    if (!Array.isArray(licenses) || !licenses.length || licenses.length > 8
        || !licenses.every((license) => record(license) && exactFields(license, ['identifier', 'url'])
          && text(license.identifier, 128) && /^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(license.identifier)
          && httpsReference(license.url))
        || new Set(licenses.map((license) => record(license) ? license.identifier : null)).size !== licenses.length) {
      errors.push(`${label} requires unique license identifiers and HTTPS license references.`);
    }
    if (errors.length !== before) continue;
    const valid = entry as unknown as AnatomyReference;
    catalog.push(Object.freeze({ id: valid.id, title: valid.title, manifestUrl: valid.manifestUrl,
      coordinateFrameId: valid.coordinateFrameId, assetSha256: valid.assetSha256,
      coverage: Object.freeze({ regionCount: valid.coverage.regionCount,
        systems: Object.freeze([...valid.coverage.systems]), description: valid.coverage.description }),
      processingResolution: Object.freeze({ sourceVoxelSpacingMm: freezeSpacing(valid.processingResolution.sourceVoxelSpacingMm),
        processingVoxelSpacingMm: freezeSpacing(valid.processingResolution.processingVoxelSpacingMm),
        method: valid.processingResolution.method, limitations: Object.freeze([...valid.processingResolution.limitations]) }),
      licenses: Object.freeze(valid.licenses.map((license) => Object.freeze({ identifier: license.identifier, url: license.url }))),
    }));
  }
  return errors.length ? { ok: false, catalog: Object.freeze([]), errors }
    : { ok: true, catalog: Object.freeze(catalog), errors };
}

export function getReference(catalog: readonly AnatomyReference[], id: string): AnatomyReference | undefined {
  return catalog.find((reference) => reference.id === id);
}

function atlasBinding(atlas: Atlas): AtlasBinding | null {
  if (!identifier(atlas?.id) || !identifier(atlas?.coordinateFrame?.id) || !checksum(atlas?.statistics?.glbSha256)
      || !Array.isArray(atlas.structures) || !atlas.structures.length
      || atlas.structures.some((structure) => !record(structure) || !identifier(structure.id)
        || !Array.isArray(structure.systems) || !structure.systems.every((system) => typeof system === 'string' && SYSTEM_IDS.has(system)))
      || new Set(atlas.structures.map((structure) => structure.id)).size !== atlas.structures.length) return null;
  return { atlasId: atlas.id, assetSha256: atlas.statistics.glbSha256, coordinateFrameId: atlas.coordinateFrame.id,
    regionIds: Object.freeze(atlas.structures.map((structure) => structure.id).sort()) };
}

export function validateReferenceAtlas(reference: AnatomyReference, atlas: Atlas): ReferenceValidationResult {
  const checked = buildReferenceCatalog([reference]);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const binding = atlasBinding(atlas);
  if (!binding) return { ok: false, errors: ['The loaded atlas has invalid identity, frame, asset checksum or region identifiers.'] };
  const errors: string[] = [];
  if (reference.id !== binding.atlasId) errors.push('The loaded atlas ID does not match the catalog reference.');
  if (reference.coordinateFrameId !== binding.coordinateFrameId) errors.push('The loaded atlas frame does not match the catalog reference.');
  if (reference.assetSha256 !== binding.assetSha256) errors.push('The loaded atlas checksum does not match the catalog reference.');
  if (reference.coverage.regionCount !== atlas.structures.length) errors.push('The loaded region count does not match the declared coverage.');
  const actualSystems = new Set(atlas.structures.flatMap((structure) => structure.systems));
  if (actualSystems.size !== reference.coverage.systems.length
      || reference.coverage.systems.some((system) => !actualSystems.has(system))) {
    errors.push('The loaded system categories do not match the declared coverage.');
  }
  if (typeof atlas.source?.license !== 'string'
      || !reference.licenses.some((license) => license.identifier === atlas.source.license)) {
    errors.push('The loaded source license is not declared in the catalog reference.');
  }
  return { ok: errors.length === 0, errors };
}

function makeBank(datasets: ReadonlyMap<string, CachedDataset>): AtlasExperimentalBank {
  const bank = Object.freeze({ kind: 'mousebio.private-experimental-bank.v1' as const });
  banks.set(bank, datasets);
  return bank;
}

export function createExperimentalBank(): AtlasExperimentalBank { return makeBank(new Map()); }

function copyData(dataset: Pick<CachedDataset, 'rows' | 'metadata'>): AtlasExperimentalData {
  return { rows: dataset.rows.map((row) => ({ ...row })), metadata: { ...dataset.metadata } };
}

function sameBinding(left: AtlasBinding, right: AtlasBinding): boolean {
  return left.atlasId === right.atlasId && left.assetSha256 === right.assetSha256
    && left.coordinateFrameId === right.coordinateFrameId
    && left.regionIds.length === right.regionIds.length
    && left.regionIds.every((id, index) => id === right.regionIds[index]);
}

export function storeAtlasExperimentalData(
  bank: AtlasExperimentalBank, atlas: Atlas, data: AtlasExperimentalData, options: ImportOptions = {},
): AtlasBankWriteResult {
  const datasets = banks.get(bank);
  const binding = atlasBinding(atlas);
  if (!datasets || !binding) return { ok: false, bank, errors: ['Initialize a private bank and use an atlas with valid source binding.'] };
  const existing = datasets.get(binding.atlasId);
  if (existing && !sameBinding(existing, binding)) {
    return { ok: false, bank, errors: ['Cached observations use another asset or frame with this atlas ID; they have been retained.'] };
  }
  if (!existing && datasets.size >= MAX_ANATOMY_REFERENCES) {
    return { ok: false, bank, errors: ['The private bank is full; no existing reference data have been evicted.'] };
  }
  let normalized: AtlasExperimentalData;
  try {
    if (!data || !Array.isArray(data.rows) || !record(data.metadata)) throw new Error('Expected rows and metadata.');
    if (data.rows.some((row) => !record(row) || !exactFields(row,
      ['structureId', 'measurement', 'value', 'unit', 'replicate', 'condition', 'timePoint']))) {
      throw new Error('Measurement records contain unsupported fields.');
    }
    const serialized = exportExperimentalJson(data.rows, data.metadata);
    if (data.rows.length) {
      const checked = parseExperimentalJson(serialized, atlas.structures, options);
      if (!checked.ok) return { ok: false, bank, errors: checked.errors.map((error) => error.message) };
      normalized = { rows: checked.rows, metadata: {} };
    } else normalized = { rows: [], metadata: {} };
    for (const field of METADATA_FIELDS) {
      if (data.metadata[field] !== undefined) Object.assign(normalized.metadata, { [field]: data.metadata[field] });
    }
  } catch {
    return { ok: false, bank, errors: ['The private dataset or declared metadata are invalid; cached data have been retained.'] };
  }
  const cached: CachedDataset = Object.freeze({ ...binding,
    rows: Object.freeze(normalized.rows.map((row) => Object.freeze({ ...row }))),
    metadata: Object.freeze({ ...normalized.metadata }) });
  const next = new Map(datasets);
  next.set(binding.atlasId, cached);
  return { ok: true, bank: makeBank(next), errors: [] };
}

export function readAtlasExperimentalData(bank: AtlasExperimentalBank, atlas: Atlas): AtlasBankReadResult {
  const datasets = banks.get(bank);
  const binding = atlasBinding(atlas);
  if (!datasets || !binding) return { ok: false, found: false, errors: ['Initialize a private bank and use an atlas with valid source binding.'] };
  const cached = datasets.get(binding.atlasId);
  if (!cached) return { ok: true, found: false, data: { rows: [], metadata: { origin: 'user-data' } }, errors: [] };
  if (!sameBinding(cached, binding) || cached.rows.some((row) => !atlas.structures.some((structure) => structure.id === row.structureId))) {
    return { ok: false, found: true, errors: ['Cached observations do not match this asset, coordinate frame or region inventory; they have been retained.'] };
  }
  return { ok: true, found: true, data: copyData(cached), errors: [] };
}

/** Save the current data and retrieve only the target reference's own cached data. */
export function switchAtlasExperimentalData(
  bank: AtlasExperimentalBank, currentAtlas: Atlas, currentData: AtlasExperimentalData,
  nextAtlas: Atlas, options: ImportOptions = {},
): AtlasBankSwitchResult {
  const stored = storeAtlasExperimentalData(bank, currentAtlas, currentData, options);
  if (!stored.ok) return { ...stored, restored: false };
  const target = readAtlasExperimentalData(stored.bank, nextAtlas);
  if (!target.ok) return { ok: false, bank, restored: false, errors: target.errors };
  return { ok: true, bank: stored.bank, data: target.data, restored: target.found, errors: [] };
}

/** Identifiers only; measurements and provenance are deliberately not exposed here. */
export function cachedAtlasIds(bank: AtlasExperimentalBank): readonly string[] {
  return Object.freeze([...(banks.get(bank)?.keys() ?? [])].sort());
}
