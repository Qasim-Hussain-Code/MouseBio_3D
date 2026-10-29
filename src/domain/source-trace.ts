import { parseLocalTrace, type LocalTraceNode } from './local-trace';
import type { Atlas } from './types';

export interface SourceTraceAsset {
  readonly atlas: Atlas;
  readonly nodes: readonly LocalTraceNode[];
}
export interface SourceTraceResult {
  readonly ok: boolean;
  readonly asset?: SourceTraceAsset;
  readonly errors: readonly string[];
}

const ASSET_SHA256 = '0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5';
const SOURCE_SHA256 = 'a8340628eb02051416ad0607e72b60cba9241eb34c9be10b0c7df01771b5cfce';
const ASSET_BYTES = 424092;
const parsedAssets = new WeakSet<object>();
const expectedStatistics = {
  assetBytes: ASSET_BYTES, assetSha256: ASSET_SHA256, samples: 11650, parentLinks: 11649,
  roots: 1, components: 1, isolatedSamples: 0, zeroLengthEdges: 0, float32CollapsedEdges: 0,
  typeCounts: { '1': 3, '2': 10394, '3': 1253 },
  boundsSourceUnits: [[-204.54, -215.35, -31.03], [280.5, 311.23, 81.68]],
  displayBoundsSourceUnits: [[-204.5399932861328, -215.35000610351562, -31.030000686645508],
    [280.5, 311.2300109863281, 81.68000030517578]],
  maxFloat32PositionError: 1.464843751364242e-05,
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function equalData(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length
    && expected.every((child, index) => equalData(value[index], child));
  if (record(expected)) return record(value) && Object.keys(value).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, child]) => Object.hasOwn(value, key) && equalData(value[key], child));
  return value === expected;
}
function text(value: unknown): boolean { return typeof value === 'string' && value.trim().length > 0; }

/** A pure manifest guard, distinct from the parser-owned asset identity checked by the scene builder. */
export function isSourceTraceAtlas(value: unknown): value is Atlas & { readonly assetFormat: 'swc-native-v1' } {
  try {
    if (!record(value) || value.id !== 'neuromorpho-nmo130632-standardized-v1'
      || value.assetFormat !== 'swc-native-v1' || value.assetUrl !== '/atlas-neuron/nmo130632-standardized.swc.txt'
      || !text(value.title) || !record(value.source) || !record(value.coordinateFrame)
      || !Array.isArray(value.structures) || value.structures.length !== 1
      || !equalData(value.statistics, expectedStatistics)
      || !Array.isArray(value.limitations) || !value.limitations.length || !value.limitations.every(text)) return false;
    const source = value.source, frame = value.coordinateFrame, structure = value.structures[0];
    if (source.id !== 'neuromorpho-nmo130632-cng' || source.sourceSha256 !== SOURCE_SHA256
      || source.sourceBytes !== 448329 || source.license !== 'CC-BY-4.0'
      || source.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/'
      || source.url !== 'https://neuromorpho.org/api/neuron/id/130632' || !text(source.citation)) return false;
    const expectedFrame = {
      id: 'neuromorpho-nmo130632-standardized-unknown-units-v1', sourceUnits: 'unknown', assetUnits: 'unknown',
      sourceToAssetScale: 1, unitsVerified: false, anatomicalOrientationVerified: false,
      physicalCalibrationVerified: false, registration: null, registrationToDigimouse: null,
      origin: 'NeuroMorpho.Org standardized-file origin; anatomical origin unverified',
      axes: { x: 'standardized source x; anatomical direction unverified',
        y: 'standardized source y; anatomical direction unverified', z: 'standardized source z; anatomical direction unverified' },
    };
    if (!Object.entries(expectedFrame).every(([key, child]) => equalData(frame[key], child))
      || !Object.keys(frame).every((key) => Object.hasOwn(expectedFrame, key) || key === 'description')) return false;
    if (!equalData(value.processing, {
      sourceToAssetScale: 1, coordinateConversion: false, radiusConversion: false, parentRepair: false,
      sampleRemoval: false, registration: false, shrinkageCorrection: false, positionStorage: 'float32 for display only',
      sourceNumericTokenSpellingPreserved: true, sourceRowOrderPreserved: true, originalCommentHeadersDistributed: false,
    })) return false;
    if (!record(structure) || structure.id !== 'neuromorpho:130632' || structure.sourceLabel !== 'NMO_130632'
      || structure.meshNode !== 'region_NMO_130632' || structure.scale !== 'cellular'
      || !equalData(structure.systems, ['nervous']) || structure.ontology !== undefined || structure.parentId !== undefined) return false;
    if (value.specimen !== undefined) {
      if (!record(value.specimen) || value.specimen.sex !== 'unknown'
        || value.specimen.age !== undefined || value.specimen.mass !== undefined || value.specimen.strain !== undefined
        || value.specimen.count !== undefined || value.specimen.ageClaims !== undefined) return false;
    }
    return true;
  } catch { return false; }
}
export function isSourceTraceAsset(value: unknown): value is SourceTraceAsset {
  return !!value && typeof value === 'object' && parsedAssets.has(value);
}
function failure(message: string): SourceTraceResult {
  return Object.freeze({ ok: false, errors: Object.freeze([message]) });
}
/** Require plain JSON data before freezing the supplied manifest; accessors are not source metadata. */
function isPlainJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object' || ancestors.has(value) || Object.getOwnPropertySymbols(value).length) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype) && prototype !== null) return false;
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid = Object.entries(descriptors).every(([key, descriptor]) => Array.isArray(value) && key === 'length'
    || 'value' in descriptor && descriptor.enumerable && isPlainJson(descriptor.value, ancestors));
  ancestors.delete(value);
  return valid;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Load the reviewed numeric-only derivative without assigning physical units or reconstructing surfaces. */
export async function parseSourceTrace(input: ArrayBuffer, atlas: Atlas): Promise<SourceTraceResult> {
  try {
    if (!isPlainJson(atlas) || !isSourceTraceAtlas(atlas)) return failure('The bundled trace manifest does not match the reviewed source.');
    const manifestSnapshot = JSON.stringify(atlas);
    if (!(input instanceof ArrayBuffer) || input.byteLength !== ASSET_BYTES) return failure('The bundled trace byte count is inconsistent.');
    const bytes = input.slice(0);
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!/^[0-9eE+. \n-]+$/.test(body) || !body.endsWith('\n')
      || !body.slice(0, -1).split('\n').every((line) => line.split(' ').length === 7 && !line.includes('  '))) {
      return failure('The bundled trace must contain only the reviewed numeric rows.');
    }
    const result = await parseLocalTrace(bytes);
    if (!result.ok || !result.asset || !equalData(result.asset.atlas.statistics, expectedStatistics)) {
      return failure('The bundled trace checksum or graph diagnostics do not match the reviewed source.');
    }
    if (!isPlainJson(atlas) || !isSourceTraceAtlas(atlas) || JSON.stringify(atlas) !== manifestSnapshot) {
      return failure('The bundled trace manifest changed while its bytes were being checked.');
    }
    const asset: SourceTraceAsset = freeze({ atlas, nodes: result.asset.nodes });
    parsedAssets.add(asset);
    return Object.freeze({ ok: true, asset, errors: Object.freeze([]) });
  } catch { return failure('The bundled trace could not be validated.'); }
}
