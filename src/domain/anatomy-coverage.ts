import catalogData from '../../data/anatomy-references.json';
import type { Atlas } from './types';
import { buildReferenceCatalog, validateReferenceAtlas } from './atlas-catalog';
import { atlasAssetBytes, atlasAssetFormat } from './atlas-asset';
import { buildAnatomyGroups, type AnatomyGroup } from './anatomy-groups';

export type AnatomyCoverageTopicId = 'vessels' | 'nerves' | 'brain' | 'muscles' | 'bones' | 'tissue-layers' | 'cellular-trace';
export type AnatomyCoverageScope = 'body-reference' | 'adult-regional' | 'developmental' | 'single-neuron-source' | 'predicted-regional' | 'regional-vascular';
export interface AnatomyCoverageTopic {
  readonly id: AnatomyCoverageTopicId;
  readonly title: string;
  readonly description: string;
  readonly limitations: readonly string[];
}
export interface AnatomyCoverageRequest {
  readonly topicId: AnatomyCoverageTopicId;
  readonly referenceId: string;
  readonly manifestUrl: string;
  readonly groupId: string;
  readonly label: string;
  readonly scope: AnatomyCoverageScope;
  readonly scopeLabel: string;
  readonly regionCount: number;
  readonly limitations: readonly string[];
}
/** An exact source-group selection, never a cross-reference overlay or ontology assertion. */
export interface AnatomyCoverageTarget extends AnatomyGroup, AnatomyCoverageRequest {}
export interface AnatomyCoverageResolution {
  readonly ok: boolean;
  readonly target: AnatomyCoverageTarget | null;
  readonly errors: readonly string[];
}
export interface AnatomyCoverageEntry extends AnatomyCoverageTopic {
  readonly targets: readonly AnatomyCoverageTarget[];
}
export interface AnatomyCoverageResult {
  readonly ok: boolean;
  readonly topics: readonly AnatomyCoverageEntry[];
  readonly errors: readonly string[];
}

const EMPTY_ERRORS: readonly string[] = Object.freeze([]);
const NO_REQUESTS: readonly AnatomyCoverageRequest[] = Object.freeze([]);
const COMMON_LIMIT = 'References retain separate source coordinates. This shortcut supplies no accepted registration, anatomical overlay or independently verified physical calibration.';
const definitions: AnatomyCoverageTopic[] = [
  { id: 'vessels', title: 'Blood vessels',
    description: 'A separate mouse cortical microvascular network and selected developmental vessel-labelled surfaces are available.',
    limitations: ['A complete adult whole-body vascular network is not bundled.',
      'The available aorta, vena cava and basilar artery surfaces do not establish connected vessels or blood flow.'] },
  { id: 'nerves', title: 'Nerves',
    description: 'EMA147 includes developmental trigeminal V nerve and ganglion surfaces. MouseMapper supplies a separate predicted regional nerve graph.',
    limitations: ['A complete adult peripheral nervous system is not bundled.',
      'The developmental selection covers trigeminal nerve and ganglion only. The predicted graph has unresolved specimen and anatomical subregion; neither supplies complete peripheral nerve connectivity.'] },
  { id: 'brain', title: 'Brain',
    description: 'Digimouse supplies an aggregate brain region or six source-labelled brain regions, depending on the reference.',
    limitations: ['The source inventory is incomplete brain anatomy; no cellular atlas, tract connectivity or accepted registration between references is supplied.'] },
  { id: 'muscles', title: 'Muscles',
    description: 'Source muscle regions range from broad Digimouse labels to the separately identified right hindlimb and pelvis.',
    limitations: ['The hindlimb source has 37 muscle-named surfaces while its paper reports 39 muscles; the difference remains unresolved.',
      'No complete adult whole-body muscle inventory or quantitative muscle dynamics is supplied.'] },
  { id: 'bones', title: 'Bones',
    description: 'Available source selections include an aggregate skeleton, hindlimb bone or aggregate regions and narrow developmental bone/cartilage labels.',
    limitations: ['The selections do not supply every individual adult bone. Aggregate regions, source primordium labels and cartilage condensations retain their original scope.'] },
  { id: 'tissue-layers', title: 'Tissue layers',
    description: 'EMA147 supplies selected filenames explicitly naming a layer, epithelium, urothelium or mesenchyme.',
    limitations: ['These developmental surfaces are not microscopic histology, a complete tissue inventory or cellular reconstruction.'] },
  { id: 'cellular-trace', title: 'Neuron trace',
    description: 'NMO_130632 provides an independent source-declared mouse neuronal reconstruction as samples and parent links.',
    limitations: ['A single neuronal reconstruction is not a peripheral nerve or a complete nervous system.',
      'Physical units, cell-surface radius, synapses, physiological behavior and registration to whole-body anatomy remain unverified.'] },
];
export const ANATOMY_COVERAGE_TOPICS: readonly AnatomyCoverageTopic[] = Object.freeze(definitions.map((value) =>
  Object.freeze({ ...value, limitations: Object.freeze([...value.limitations]) })));

// Pinned source bindings complement the existing exact group inventories. The
// actual structure lists come only from buildAnatomyGroups, avoiding a second
// competing anatomy inventory.
const PINS: Readonly<Record<string, { sourceId: string; assetUrl: string; format: string; bytes: number; hash: string; frame: string }>> = Object.freeze({
  'schmid2021-mvn1-v1': { sourceId: 'schmid2021-zenodo5115640-mvn1', assetUrl: '/atlas-vascular/schmid2021-mvn1-lines.json', format: 'polyline-native-v1', bytes: 38356364, hash: '8d9fb19e943a126562ab5a439d83590b5694d58b208f064a8140d556ed3e4652', frame: 'schmid2021-mvn1-source-micrometres-v1' },
  'mousemapper-nerve-patch0-v1': { sourceId: 'mousemapper-7fe04a9c-graph-patch0', assetUrl: '/atlas-nerve/mousemapper-patch0-lines.json', format: 'polyline-native-v1', bytes: 55658, hash: 'e59fea98d4f41adab6149eee38e28ea6c3737dfa37013d5a2039e89c4c3ef0ce', frame: 'mousemapper-nerve-patch0-native-unknown-units-v1' },
  'digimouse-tessellated-v1': { sourceId: 'digimouse-2007', assetUrl: '/atlas/digimouse.glb', format: 'glb', bytes: 3083672,
    hash: '28a1957d1c44512d648bc671008a7d17ef648e99338d516b9afb3f8ed806b685', frame: 'digimouse-tessellated-native-v1' },
  'digimouse-volume-040-v1': { sourceId: 'digimouse-registered-volume-2007', assetUrl: '/atlas-volume/digimouse-volume-040.glb', format: 'glb', bytes: 27648532,
    hash: 'f6715d698b929a28c57e9bcb72f452afd18d00b4561c84f66a237cdee7a2cbc2', frame: 'digimouse-registered-voxel-native-v1' },
  'charles2016-hindlimb-v1': { sourceId: 'charles2016-hindlimb-s1-2016', assetUrl: '/atlas-hindlimb/charles2016-hindlimb.glb', format: 'glb', bytes: 20981512,
    hash: '6cd797bb8b09c80760c3a4c0fa1a682b880aaabccba0e0a6663f7e936abdee63', frame: 'charles2016-hindlimb-prc-native-v1' },
  'ema147-native-v1': { sourceId: 'emouseatlas-ema147-2017', assetUrl: '/atlas-ema147/ema147-native.ply', format: 'ply-native-v1', bytes: 10079275,
    hash: '8593f83eb1ebf05f17203b9b3b3257adcf04195b7d117ab312efa4ed1a38a75f', frame: 'emouseatlas-ema147-stl-native-v1' },
  'neuromorpho-nmo130632-standardized-v1': { sourceId: 'neuromorpho-nmo130632-cng', assetUrl: '/atlas-neuron/nmo130632-standardized.swc.txt', format: 'swc-native-v1', bytes: 424092,
    hash: '0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5', frame: 'neuromorpho-nmo130632-standardized-unknown-units-v1' },
});
const catalog = buildReferenceCatalog(catalogData);
type Route = readonly [AnatomyCoverageTopicId, string, string, number, string, AnatomyCoverageScope, string];
const routes: readonly Route[] = [
  ['vessels', 'schmid2021-mvn1-v1', 'whole-mouse', 1, 'Show cortical vessel network', 'regional-vascular', 'MVN1 mouse cortical microvascular source; individual specimen unresolved'],
  ['nerves', 'mousemapper-nerve-patch0-v1', 'whole-mouse', 1, 'Show predicted regional nerve graph', 'predicted-regional', 'MouseMapper predicted regional nerve graph; specimen and subregion unresolved'],
  ['vessels', 'ema147-native-v1', 'vessels', 3, 'Show developmental vessel surfaces', 'developmental', 'EMA147 TS23 developmental source'],
  ['nerves', 'ema147-native-v1', 'trigeminal', 2, 'Show developmental trigeminal nerve and ganglion', 'developmental', 'EMA147 TS23 developmental source'],
  ['brain', 'digimouse-volume-040-v1', 'brain', 6, 'Show six source brain regions', 'body-reference', 'Male Digimouse source specimen'],
  ['brain', 'digimouse-tessellated-v1', 'brain', 1, 'Show aggregate brain region', 'body-reference', 'Male Digimouse source specimen'],
  ['muscles', 'charles2016-hindlimb-v1', 'muscles', 37, 'Show hindlimb muscle regions', 'adult-regional', 'Adult female right hindlimb and pelvis'],
  ['muscles', 'digimouse-volume-040-v1', 'muscles', 1, 'Show source masseter region', 'body-reference', 'Male Digimouse source specimen'],
  ['muscles', 'digimouse-tessellated-v1', 'muscles', 2, 'Show broadly labelled muscle regions', 'body-reference', 'Male Digimouse source specimen'],
  ['bones', 'charles2016-hindlimb-v1', 'bones', 6, 'Show hindlimb bone and aggregate regions', 'adult-regional', 'Adult female right hindlimb and pelvis'],
  ['bones', 'digimouse-volume-040-v1', 'skeleton', 1, 'Show volume aggregate skeleton', 'body-reference', 'Male Digimouse source specimen'],
  ['bones', 'digimouse-tessellated-v1', 'skeleton', 1, 'Show lightweight aggregate skeleton', 'body-reference', 'Male Digimouse source specimen'],
  ['bones', 'ema147-native-v1', 'bone-cartilage', 6, 'Show explicit developmental bone and cartilage labels', 'developmental', 'EMA147 TS23 developmental source'],
  ['tissue-layers', 'ema147-native-v1', 'tissue-layers', 8, 'Show developmental tissue and layer labels', 'developmental', 'EMA147 TS23 developmental source'],
  ['cellular-trace', 'neuromorpho-nmo130632-standardized-v1', 'whole-mouse', 1, 'Show independent neuronal trace', 'single-neuron-source', 'Source-declared adult mouse V1 layer 4 reconstruction'],
];
const requests: readonly AnatomyCoverageRequest[] = Object.freeze(routes.map(([topicId, referenceId, groupId, regionCount, label, scope, scopeLabel]) => {
  const definition = ANATOMY_COVERAGE_TOPICS.find((value) => value.id === topicId)!;
  const reference = catalog.catalog.find((value) => value.id === referenceId);
  return Object.freeze({ topicId, referenceId, manifestUrl: reference?.manifestUrl ?? '', groupId, regionCount, label, scope, scopeLabel,
    limitations: Object.freeze([...definition.limitations, COMMON_LIMIT]) });
}));

function topic(value: unknown): AnatomyCoverageTopic | undefined {
  return typeof value === 'string' ? ANATOMY_COVERAGE_TOPICS.find((definition) => definition.id === value) : undefined;
}
/** Source routes can be displayed without fetching or embedding every manifest. */
export function coverageRequests(topicId: unknown): readonly AnatomyCoverageRequest[] {
  if (!topic(topicId) || !catalog.ok) return NO_REQUESTS;
  return Object.freeze(requests.filter((request) => request.topicId === topicId));
}
export function coverageAvailability(topicId: unknown, activeReferenceId: unknown): 'current-reference' | 'another-reference' | 'unavailable' {
  const available = coverageRequests(topicId);
  return available.some((request) => request.referenceId === activeReferenceId) ? 'current-reference'
    : available.length ? 'another-reference' : 'unavailable';
}
function reviewedFrame(atlas: Atlas): boolean {
  const frame = atlas.coordinateFrame;
  if (frame.anatomicalOrientationVerified !== false || frame.physicalCalibrationVerified !== false) return false;
  if (atlas.id === 'schmid2021-mvn1-v1') return frame.sourceUnits === 'micrometres' && frame.assetUnits === 'micrometres' && frame.sourceToAssetScale === 1 && frame.unitsVerified === false && frame.registrationToDigimouse === null && frame.registration === null;
  if (atlas.id === 'digimouse-tessellated-v1') return frame.sourceUnits === 'interpreted millimetres' && frame.assetUnits === 'metres'
    && frame.sourceToAssetScale === 0.001 && JSON.stringify(frame.sourceToAssetMatrix) === '[0.001,0,0,0,0,0.001,0,0,0,0,0.001,0,0,0,0,1]';
  if (atlas.id === 'digimouse-volume-040-v1') return frame.sourceUnits === 'zero-based voxel indices' && frame.assetUnits === 'metres'
    && frame.voxelIndexToAssetScale === 0.0001 && JSON.stringify(frame.sourceVoxelSpacingMm) === '[0.1,0.1,0.1]' && frame.voxelToTetrahedralAffine === null;
  if (atlas.id === 'charles2016-hindlimb-v1') return frame.sourceUnits === 'PRC global millimetre multiple' && frame.assetUnits === 'metres'
    && frame.sourceToAssetScale === 0.001 && frame.sourceUnitMillimetres === 1 && frame.registrationToDigimouse === null;
  return frame.sourceUnits === 'unknown' && frame.assetUnits === 'unknown' && frame.sourceToAssetScale === 1
    && frame.unitsVerified === false && frame.registrationToDigimouse === null;
}
function rejected(): AnatomyCoverageResolution {
  return Object.freeze({ ok: false, target: null, errors: Object.freeze(['The source reference or requested coverage does not match the reviewed anatomy.']) });
}
/** Resolve only after loading the requested source; no partial or guessed selection is returned. */
export function resolveCoverageTarget(value: unknown, topicId: unknown): AnatomyCoverageResolution {
  try {
    if (!topic(topicId) || !catalog.ok || !value || typeof value !== 'object' || Array.isArray(value)) return rejected();
    const atlas = value as Atlas;
    const pin = typeof atlas.id === 'string' && Object.hasOwn(PINS, atlas.id) ? PINS[atlas.id] : null;
    const reference = catalog.catalog.find((entry) => entry.id === atlas.id);
    if (!pin || !reference || !validateReferenceAtlas(reference, atlas).ok || reference.assetSha256 !== pin.hash
      || reference.coordinateFrameId !== pin.frame || atlas.source.id !== pin.sourceId || atlas.assetUrl !== pin.assetUrl
      || atlasAssetFormat(atlas) !== pin.format || atlasAssetBytes(atlas) !== pin.bytes || !reviewedFrame(atlas) || atlas.source.licenseUrl !== reference.licenses.find((license) => license.identifier === atlas.source.license)?.url) return rejected();
    const groups = buildAnatomyGroups(atlas);
    if (!groups.ok) return rejected();
    const request = requests.find((entry) => entry.topicId === topicId && entry.referenceId === atlas.id);
    if (!request) return Object.freeze({ ok: true, target: null, errors: EMPTY_ERRORS });
    const group = groups.groups.find((entry) => entry.id === request.groupId);
    if (!group || group.structureIds.length !== request.regionCount || !group.structureIds.length) return rejected();
    const limitations = Object.freeze([...new Set([...request.limitations, ...group.limitations])]);
    const target: AnatomyCoverageTarget = Object.freeze({ ...request, id: group.id, title: group.title,
      structureIds: Object.freeze([...group.structureIds]), description: group.description, limitations });
    return Object.freeze({ ok: true, target, errors: EMPTY_ERRORS });
  } catch { return rejected(); }
}
/** Validate the supplied bundled inventories atomically and collect their exact source selections. */
export function buildAnatomyCoverage(atlases: unknown): AnatomyCoverageResult {
  const failure = (): AnatomyCoverageResult => Object.freeze({ ok: false, topics: Object.freeze([]),
    errors: Object.freeze(['Coverage requires distinct reviewed bundled source references.']) });
  try {
    if (!Array.isArray(atlases) || !atlases.length || atlases.length > Object.keys(PINS).length) return failure();
    const ids = new Set<string>();
    const targets = new Map<AnatomyCoverageTopicId, AnatomyCoverageTarget[]>();
    for (const atlas of atlases) {
      if (!atlas || typeof atlas.id !== 'string' || ids.has(atlas.id)) return failure();
      ids.add(atlas.id);
      for (const definition of ANATOMY_COVERAGE_TOPICS) {
        const result = resolveCoverageTarget(atlas, definition.id);
        if (!result.ok) return failure();
        if (result.target) targets.set(definition.id, [...(targets.get(definition.id) ?? []), result.target]);
      }
    }
    return Object.freeze({ ok: true, topics: Object.freeze(ANATOMY_COVERAGE_TOPICS.map((definition) =>
      Object.freeze({ ...definition, targets: Object.freeze(targets.get(definition.id) ?? []) }))), errors: EMPTY_ERRORS });
  } catch { return failure(); }
}
