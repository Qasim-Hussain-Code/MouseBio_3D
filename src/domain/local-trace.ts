import type { Atlas } from './types';

export type LocalTraceNode = readonly [id: number, type: number, x: number, y: number, z: number, radius: number, parent: number];
export interface LocalTraceAsset {
  readonly atlas: Atlas;
  readonly nodes: readonly LocalTraceNode[];
}
export interface LocalTraceResult {
  readonly ok: boolean;
  readonly asset?: LocalTraceAsset;
  readonly errors: readonly string[];
}

export const MAX_LOCAL_TRACE_BYTES = 2 * 1024 * 1024;
export const MAX_LOCAL_TRACE_NODES = 100_000;
export const MAX_LOCAL_TRACE_LINE_BYTES = 4096;
const parsedAssets = new WeakSet<object>();
const parsedAtlases = new WeakSet<object>();
const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function isLocalTraceAsset(value: unknown): value is LocalTraceAsset {
  return !!value && typeof value === 'object' && parsedAssets.has(value);
}
export function isLocalTraceAtlas(value: unknown): value is Atlas & { readonly assetFormat: 'local-trace-v1' } {
  return !!value && typeof value === 'object' && parsedAtlases.has(value);
}
function failure(message: string): LocalTraceResult {
  return Object.freeze({ ok: false, errors: Object.freeze([message]) });
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function finiteFloat32(value: number): boolean { return Number.isFinite(value) && Number.isFinite(Math.fround(value)); }
function include(bounds: number[][], point: readonly number[]): void {
  for (let axis = 0; axis < 3; axis++) {
    bounds[0][axis] = Math.min(bounds[0][axis], point[axis]);
    bounds[1][axis] = Math.max(bounds[1][axis], point[axis]);
  }
}
const emptyBounds = () => [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];

/** Parse local sample points and parent links without retaining headers or assigning physical units. */
export async function parseLocalTrace(input: ArrayBuffer): Promise<LocalTraceResult> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    if (!(input instanceof ArrayBuffer) || input.byteLength === 0 || input.byteLength > MAX_LOCAL_TRACE_BYTES) {
      return failure('A local trace must contain between 1 byte and 2 MiB.');
    }
    bytes = new Uint8Array(input.slice(0));
  } catch { return failure('The local trace bytes could not be read.'); }
  let start = 0, lineNumber = 1;
  for (let offset = 0; offset <= bytes.length; offset++) {
    if (offset === bytes.length || bytes[offset] === 10 || bytes[offset] === 13) {
      if (offset - start > MAX_LOCAL_TRACE_LINE_BYTES) return failure('Line ' + lineNumber + ' exceeds the 4096-byte limit.');
      if (bytes[offset] === 13 && bytes[offset + 1] === 10) offset++;
      start = offset + 1; lineNumber++;
    }
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return failure('The local trace must be valid UTF-8 text.'); }

  const nodes: LocalTraceNode[] = [], byId = new Map<number, number>(), typeCounts = new Map<string, number>();
  const boundsSourceUnits = emptyBounds();
  let maxFloat32PositionError = 0;
  lineNumber = 0;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    lineNumber++;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (nodes.length >= MAX_LOCAL_TRACE_NODES) return failure('The local trace exceeds 100000 samples.');
    const columns = line.split(/\s+/);
    if (columns.length !== 7) return failure('Line ' + lineNumber + ' must contain exactly seven whitespace-separated columns.');
    if (![0, 1, 6].every((index) => INTEGER.test(columns[index]))
        || ![2, 3, 4, 5].every((index) => DECIMAL.test(columns[index]))) {
      return failure('Line ' + lineNumber + ' contains an invalid numeric field.');
    }
    const values = columns.map(Number);
    const [id, type, x, y, z, radius, parent] = values;
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(type) || type < 0
        || !Number.isSafeInteger(parent) || (parent !== -1 && parent <= 0)) {
      return failure('Line ' + lineNumber + ' has an invalid sample, type or parent identifier.');
    }
    if (![x, y, z].every(finiteFloat32) || !Number.isFinite(radius) || radius < 0) {
      return failure('Line ' + lineNumber + ' has unsupported coordinates or radius.');
    }
    if (byId.has(id)) return failure('Line ' + lineNumber + ' repeats a sample identifier.');
    if (parent === id) return failure('A sample cannot name itself as parent.');
    byId.set(id, nodes.length);
    nodes.push(values as unknown as LocalTraceNode);
    typeCounts.set(String(type), (typeCounts.get(String(type)) ?? 0) + 1);
    include(boundsSourceUnits, [x, y, z]);
    maxFloat32PositionError = Math.max(maxFloat32PositionError, ...[x, y, z].map((value) => Math.abs(Math.fround(value) - value)));
  }
  if (!nodes.length) return failure('The local trace has no sample rows.');
  const parents = new Int32Array(nodes.length), referenced = new Uint8Array(nodes.length);
  const displayBoundsSourceUnits = emptyBounds();
  let roots = 0, parentLinks = 0, zeroLengthEdges = 0, float32CollapsedEdges = 0, drawableLinks = 0;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index], parent = node[6];
    if (parent === -1) { parents[index] = -1; roots++; continue; }
    const parentIndex = byId.get(parent);
    if (parentIndex === undefined) return failure('A parent identifier is missing from the trace.');
    parents[index] = parentIndex; parentLinks++;
    referenced[index] = referenced[parentIndex] = 1;
    const ancestor = nodes[parentIndex];
    const position = [node[2], node[3], node[4]], parentPosition = [ancestor[2], ancestor[3], ancestor[4]];
    const zeroSource = position.every((value, axis) => value === parentPosition[axis]);
    const displayPosition = position.map(Math.fround), displayParent = parentPosition.map(Math.fround);
    const zeroDisplay = displayPosition.every((value, axis) => value === displayParent[axis]);
    if (zeroSource) zeroLengthEdges++;
    else if (zeroDisplay) float32CollapsedEdges++;
    if (!zeroDisplay) drawableLinks++;
    include(displayBoundsSourceUnits, displayPosition); include(displayBoundsSourceUnits, displayParent);
  }
  if (!parentLinks) return failure('The local trace has no parent links to display.');
  const states = new Uint8Array(nodes.length);
  for (let index = 0; index < nodes.length; index++) {
    if (states[index]) continue;
    let current = index;
    while (current >= 0 && states[current] === 0) { states[current] = 1; current = parents[current]; }
    if (current >= 0 && states[current] === 1) return failure('Parent links contain a cycle.');
    current = index;
    while (current >= 0 && states[current] === 1) { states[current] = 2; current = parents[current]; }
  }
  if (!drawableLinks) return failure('The parent links have no nonzero float32 display extent.');
  const radius = Math.hypot(...displayBoundsSourceUnits[0].map((minimum, axis) => displayBoundsSourceUnits[1][axis] - minimum)) / 2;
  const near = Math.fround(radius / 2000), far = Math.fround(radius * 100), maximumOffset = Math.fround(radius * 3.3);
  if (![radius, near, far, maximumOffset].every(Number.isFinite) || near <= 0 || far <= near || maximumOffset <= 0) {
    return failure('The trace exceeds the supported renderer numeric range.');
  }
  let hash: string;
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  } catch { return failure('A local SHA-256 checksum is unavailable in this browser.'); }
  const structureId = 'local-trace:' + hash + ':record';
  const limitations = [
    'User-supplied source identity, specimen characteristics and annotations are unverified.',
    'Coordinates and radii have unknown physical units; anatomical orientation and physical calibration are unverified.',
    'The display represents sample points joined by declared parent links, not measured cell surfaces or biological connectivity.',
    'Radii are retained as source numbers and are not used to draw measured radii.',
    'No registration to another reference or physiological model is supplied.',
    'Comment headers and filenames are not retained; the checksum binds the original local bytes.',
  ];
  const atlas: Atlas = {
    id: 'local-trace-' + hash, title: 'User-supplied morphology trace',
    assetFormat: 'local-trace-v1', assetUrl: 'local-memory:trace',
    coordinateFrame: { id: 'local-trace-native-' + hash, sourceUnits: 'unknown', assetUnits: 'unknown',
      sourceToAssetScale: 1, unitsVerified: false, anatomicalOrientationVerified: false,
      physicalCalibrationVerified: false, registration: null, registrationToDigimouse: null },
    source: { displayName: 'Local morphology', title: 'User-supplied morphology trace',
      citationLabel: 'Local file', license: 'Unknown' },
    structures: [{ id: structureId, name: 'Local morphology trace', systems: [], scale: 'cellular',
      sourceLabel: 'User-supplied trace record', meshNode: structureId,
      description: 'User-supplied sample points and declared parent links. Physical units, source identity and biological interpretation are unverified.',
      defaultOpacity: 1, color: '#aab4b5', limitations: [...limitations] }],
    statistics: { assetBytes: bytes.byteLength, assetSha256: hash, samples: nodes.length, parentLinks, roots,
      components: roots, isolatedSamples: referenced.reduce((count, value) => count + (value === 0 ? 1 : 0), 0),
      zeroLengthEdges, float32CollapsedEdges, typeCounts: Object.fromEntries(typeCounts), boundsSourceUnits,
      displayBoundsSourceUnits, maxFloat32PositionError },
    limitations,
  };
  const asset: LocalTraceAsset = freeze({ atlas, nodes });
  parsedAssets.add(asset);
  parsedAtlases.add(asset.atlas);
  return Object.freeze({ ok: true, asset, errors: Object.freeze([]) });
}
