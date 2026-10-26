import type { Atlas, ExplorationMode } from './types';
import { cameraPoseErrors, type CameraPose, type Vector3Tuple } from './camera-pose';

export const VIEW_STATE_SCHEMA_VERSION = 'mousebio.view.v1' as const;
export const MAX_VIEW_STATE_BYTES = 1024 * 1024;

export type ViewVector3 = Vector3Tuple;
export type ViewCameraPose = CameraPose;
export type ViewBackground = 'dark' | 'white';

/** Display settings only. Research observations never belong in this record. */
export interface ViewState {
  mode: ExplorationMode;
  selected: string | null;
  hidden: string[];
  opacity: Record<string, number>;
  clipAxis: 'off' | 'x' | 'y' | 'z';
  clipPosition: number;
  labels: boolean;
  background: ViewBackground;
  cameraPose?: ViewCameraPose;
  living: {
    playing: boolean;
    speed: number;
    cardiac: boolean;
    respiratory: boolean;
  };
}

export interface ViewStateDocument extends ViewState {
  schemaVersion: typeof VIEW_STATE_SCHEMA_VERSION;
  atlasId: string;
  assetSha256: string;
  coordinateFrameId: string;
}

export interface ViewStateResult {
  ok: boolean;
  state?: ViewState;
  errors: string[];
}

const SETTINGS_FIELDS = [
  'mode', 'selected', 'hidden', 'opacity', 'clipAxis', 'clipPosition', 'labels', 'background', 'cameraPose', 'living',
] as const;
const BINDING_FIELDS = ['schemaVersion', 'atlasId', 'assetSha256', 'coordinateFrameId'] as const;
const UNSAFE_FIELDS = new Set(['__proto__', 'prototype', 'constructor']);
const MODES = new Set(['anatomical', 'living', 'experimental', 'comparative']);
const owns = (record: Record<string, unknown>, field: string) => Object.hasOwn(record, field);

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function allowedFields(
  record: Record<string, unknown>, fields: readonly string[], label: string, errors: string[],
): void {
  if (Object.keys(record).some((field) => UNSAFE_FIELDS.has(field) || !fields.includes(field))) {
    errors.push(`${label} contains unsupported fields.`);
  }
}

function requiredFields(
  record: Record<string, unknown>, fields: readonly string[], label: string, errors: string[],
): void {
  for (const field of fields) if (!owns(record, field)) errors.push(`${label}.${field} is required.`);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

/** Serialization and the renderer share this pure validator without importing Three.js. */
function validCameraPose(value: unknown, errors: string[]): value is ViewCameraPose {
  const issues = cameraPoseErrors(value);
  errors.push(...issues.map((issue) => `cameraPose: ${issue}`));
  return issues.length === 0;
}

function binding(atlas: Atlas): Omit<ViewStateDocument, keyof ViewState> {
  const hash = atlas.statistics.glbSha256;
  const frame = atlas.coordinateFrame.id;
  if (typeof atlas.id !== 'string' || !atlas.id || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)
      || typeof frame !== 'string' || !frame) {
    throw new Error('The atlas requires a stable ID, lowercase SHA-256 asset checksum and coordinate-frame ID.');
  }
  return { schemaVersion: VIEW_STATE_SCHEMA_VERSION, atlasId: atlas.id, assetSha256: hash, coordinateFrameId: frame };
}

function validateSettings(input: unknown, atlas: Atlas, document: boolean): ViewStateResult {
  const errors: string[] = [];
  if (!plainRecord(input)) return { ok: false, errors: ['View state must be an object.'] };
  allowedFields(input, document ? [...SETTINGS_FIELDS, ...BINDING_FIELDS] : SETTINGS_FIELDS, 'View state', errors);
  // Earlier v1 documents predate the background control. Only that absent field
  // is migrated; source binding and every other required field remain strict.
  requiredFields(input, SETTINGS_FIELDS.filter((field) => field !== 'cameraPose'
    && !(document && field === 'background')), 'View state', errors);
  let expected: ReturnType<typeof binding>;
  try { expected = binding(atlas); }
  catch (error) { return { ok: false, errors: [(error as Error).message] }; }
  if (document) {
    requiredFields(input, BINDING_FIELDS, 'View state', errors);
    if (input.schemaVersion !== expected.schemaVersion) errors.push(`Unsupported view-state schema. Expected ${VIEW_STATE_SCHEMA_VERSION}.`);
    if (input.atlasId !== expected.atlasId) errors.push('The saved view belongs to a different atlas.');
    if (input.assetSha256 !== expected.assetSha256) errors.push('The saved view asset checksum does not match the loaded anatomy.');
    if (input.coordinateFrameId !== expected.coordinateFrameId) errors.push('The saved view coordinate frame does not match the loaded anatomy.');
  }
  const knownIds = new Set(atlas.structures.map((structure) => structure.id));
  if (typeof input.mode !== 'string' || !MODES.has(input.mode)) errors.push('mode must name one of the four exploration modes.');
  if (input.selected !== null && (typeof input.selected !== 'string' || !knownIds.has(input.selected))) {
    errors.push('selected must be null or a known anatomical identifier.');
  }
  if (!Array.isArray(input.hidden)) errors.push('hidden must be an array of unique known anatomical identifiers.');
  else {
    if (input.hidden.length > knownIds.size) errors.push('hidden contains more entries than the atlas inventory.');
    const seen = new Set<string>();
    for (const value of input.hidden.slice(0, knownIds.size)) {
      if (typeof value !== 'string' || !knownIds.has(value)) errors.push('hidden contains an unknown anatomical identifier.');
      else if (seen.has(value)) errors.push('hidden must not contain duplicate anatomical identifiers.');
      else seen.add(value);
    }
  }
  if (!plainRecord(input.opacity)) errors.push('opacity must be an object keyed by known anatomical identifiers.');
  else {
    const entries = Object.entries(input.opacity);
    if (entries.length > knownIds.size) errors.push('opacity contains more entries than the atlas inventory.');
    for (const [id, value] of entries.slice(0, knownIds.size)) {
      if (UNSAFE_FIELDS.has(id) || !knownIds.has(id)) errors.push('opacity contains an unknown or unsafe anatomical identifier.');
      if (!finiteInRange(value, 0, 1)) errors.push('Each opacity must be a finite number between 0 and 1.');
    }
  }
  if (!['off', 'x', 'y', 'z'].includes(input.clipAxis as string)) errors.push('clipAxis must be off, x, y or z.');
  if (!finiteInRange(input.clipPosition, 0, 100)) errors.push('clipPosition must be a finite percentage between 0 and 100.');
  if (typeof input.labels !== 'boolean') errors.push('labels must be a boolean.');
  const background = document && !owns(input, 'background') ? 'dark' : input.background;
  if (background !== 'dark' && background !== 'white') errors.push('background must be dark or white.');
  if (owns(input, 'cameraPose')) validCameraPose(input.cameraPose, errors);
  if (!plainRecord(input.living)) errors.push('living must contain the physiological display controls.');
  else {
    allowedFields(input.living, ['playing', 'speed', 'cardiac', 'respiratory'], 'living', errors);
    requiredFields(input.living, ['playing', 'speed', 'cardiac', 'respiratory'], 'living', errors);
    for (const field of ['playing', 'cardiac', 'respiratory']) {
      if (typeof input.living[field] !== 'boolean') errors.push(`living.${field} must be a boolean.`);
    }
    if (!finiteInRange(input.living.speed, 0.25, 4)) errors.push('living.speed must be a finite number between 0.25 and 4.');
  }
  if (errors.length) return { ok: false, errors };
  const validated = input as unknown as ViewState;
  const state: ViewState = {
    mode: validated.mode, selected: validated.selected, hidden: [...validated.hidden].sort(),
    opacity: Object.fromEntries(Object.entries(validated.opacity).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)),
    clipAxis: validated.clipAxis, clipPosition: validated.clipPosition, labels: validated.labels,
    background: background as ViewBackground,
    living: { playing: validated.living.playing, speed: validated.living.speed,
      cardiac: validated.living.cardiac, respiratory: validated.living.respiratory },
  };
  if (validated.cameraPose) state.cameraPose = {
    position: [...validated.cameraPose.position], target: [...validated.cameraPose.target], up: [...validated.cameraPose.up],
  };
  return { ok: true, state, errors };
}

/** Create an anatomy-bound document without persisting or transmitting any data. */
export function exportViewState(state: ViewState, atlas: Atlas): string {
  const result = validateSettings(state, atlas, false);
  if (!result.ok || !result.state) throw new Error(result.errors.join(' '));
  const document: ViewStateDocument = { ...binding(atlas), ...result.state };
  const text = `${JSON.stringify(document, null, 2)}\n`;
  if (new TextEncoder().encode(text).byteLength > MAX_VIEW_STATE_BYTES) throw new Error('View-state files must not exceed 1 MiB.');
  return text;
}

/** Reject the complete file on any error; no partial settings are returned. */
export function parseViewState(text: string, atlas: Atlas): ViewStateResult {
  if (new TextEncoder().encode(text).byteLength > MAX_VIEW_STATE_BYTES) {
    return { ok: false, errors: ['View-state files must not exceed 1 MiB.'] };
  }
  let document: unknown;
  try { document = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { return { ok: false, errors: ['The view-state file is not valid JSON.'] }; }
  return validateSettings(document, atlas, true);
}
