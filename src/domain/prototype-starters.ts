import type { Atlas } from './types';
import { atlasAssetBytes } from './atlas-asset';
import { buildAnatomyGroups, type AnatomyGroup } from './anatomy-groups';
import { coverageRequests, resolveCoverageTarget, type AnatomyCoverageTopicId } from './anatomy-coverage';

export type PrototypeStarterGroupId = 'anatomy' | 'vessels-and-nerves' | 'neuronal-detail';
export interface PrototypeStarter {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly referenceId: string;
  readonly manifestUrl: string;
  readonly groupId: string;
  readonly scopeLabel: string;
  /** Bytes of the complete base reference asset, before separately loaded optional detail. */
  readonly assetBytes: number;
  readonly costText: string;
  readonly limitations: readonly string[];
}
export interface PrototypeStarterGroup {
  readonly id: PrototypeStarterGroupId;
  readonly title: string;
  readonly description: string;
  readonly starters: readonly PrototypeStarter[];
}
export interface PrototypeStarterResolution {
  readonly ok: boolean;
  readonly target: AnatomyGroup | null;
  readonly errors: readonly string[];
}
interface Definition {
  readonly id: string;
  readonly section: PrototypeStarterGroupId;
  readonly title: string;
  readonly description: string;
  readonly referenceId: string;
  readonly validationTopic: AnatomyCoverageTopicId;
  readonly groupOverride?: string;
  readonly regionCountOverride?: number;
  readonly limitationsOverride?: readonly string[];
  readonly additionalLimitations?: readonly string[];
}

const COMMON_LIMITATIONS = Object.freeze([
  'Complete anatomy, validated physiology and cellular access throughout the body remain unavailable.',
  'Each source keeps its own coordinate frame. No accepted registration combines these references into one mouse.',
  'Anatomical directions and physical calibration remain independently unverified.',
  'Asset sizes describe the complete base reference, not rendering speed or memory use. Representative browser and GPU performance remains unverified.',
]);
const COSTS: Readonly<Record<string, { readonly bytes: number; readonly text: string }>> = Object.freeze({
  'digimouse-tessellated-v1': Object.freeze({ bytes: 3083672, text: '3.1 MB base surface asset' }),
  'digimouse-volume-040-v1': Object.freeze({ bytes: 27648532, text: '27.6 MB base surface asset; optional finer surfaces load separately' }),
  'charles2016-hindlimb-v1': Object.freeze({ bytes: 20981512, text: '21.0 MB base surface asset' }),
  'ema147-native-v1': Object.freeze({ bytes: 10079275, text: '10.1 MB complete developmental surface asset' }),
  'schmid2021-mvn1-v1': Object.freeze({ bytes: 38356364, text: '38.4 MB line asset; 575,722 stored points' }),
  'mousemapper-nerve-patch0-v1': Object.freeze({ bytes: 55658, text: '56 kB line asset; 1,940 stored points' }),
  'neuromorpho-nmo130632-standardized-v1': Object.freeze({ bytes: 424092, text: '424 kB line asset; 11,650 stored samples' }),
});
const DEFINITIONS: readonly Definition[] = [
  { id: 'whole-body-organs', section: 'anatomy', title: 'Whole-body organ overview',
    description: 'Start with the lightweight mouse reference and its existing organ and other regions.',
    referenceId: 'digimouse-tessellated-v1', validationTopic: 'brain', groupOverride: 'organs', regionCountOverride: 15,
    limitationsOverride: ['This is incomplete anatomy from one male source specimen, not a population or a complete organ inventory.',
      'The 15 selected source labels include broad muscle regions. The residual body envelope and aggregate skeleton are excluded from this starting view.'] },
  { id: 'brain-regions', section: 'anatomy', title: 'Six brain regions',
    description: 'Inspect the six existing brain labels in the registered-volume source.',
    referenceId: 'digimouse-volume-040-v1', validationTopic: 'brain' },
  { id: 'female-hindlimb-muscles', section: 'anatomy', title: 'Female hindlimb muscles',
    description: 'Explore the 37 muscle-named surfaces of the separate right hindlimb and pelvic source.',
    referenceId: 'charles2016-hindlimb-v1', validationTopic: 'muscles' },
  { id: 'developmental-vessels', section: 'vessels-and-nerves', title: 'Developmental vessel surfaces',
    description: 'View the source surfaces named aorta, vena cava and basilar artery in EMA147.',
    referenceId: 'ema147-native-v1', validationTopic: 'vessels',
    additionalLimitations: ['EMA147 native mesh units are unknown. TS23 is source-declared; conflicting age estimates remain unresolved.'] },
  { id: 'developmental-trigeminal', section: 'vessels-and-nerves', title: 'Developmental trigeminal nerve and ganglion',
    description: 'Inspect the two separate EMA147 surfaces named trigeminal V nerve and ganglion.',
    referenceId: 'ema147-native-v1', validationTopic: 'nerves',
    additionalLimitations: ['EMA147 native mesh units are unknown. TS23 is source-declared; conflicting age estimates remain unresolved.'] },
  { id: 'cortical-vessels', section: 'vessels-and-nerves', title: 'Regional cortical vessels',
    description: 'Explore the MVN1 sampled cortical vessel paths and their separately retained source connectivity.',
    referenceId: 'schmid2021-mvn1-v1', validationTopic: 'vessels',
    additionalLimitations: ['MVN1 coordinates retain source-declared micrometres without independent calibration. This regional network supplies no vessel surface or observed blood flow.'] },
  { id: 'predicted-nerve', section: 'vessels-and-nerves', title: 'Predicted nerve graph',
    description: 'Inspect the small MouseMapper regional prediction example as retained polylines.',
    referenceId: 'mousemapper-nerve-patch0-v1', validationTopic: 'nerves',
    additionalLimitations: ['MouseMapper coordinates have unknown units. Inconsistent source radius fields are omitted and do not create nerve surfaces.'] },
  { id: 'single-neuron', section: 'neuronal-detail', title: 'Single neuronal trace',
    description: 'Explore NMO_130632, then inspect its original source samples and parent links.',
    referenceId: 'neuromorpho-nmo130632-standardized-v1', validationTopic: 'cellular-trace' },
];

function makeStarter(definition: Definition): PrototypeStarter | null {
  const route = coverageRequests(definition.validationTopic).find((request) => request.referenceId === definition.referenceId);
  const cost = COSTS[definition.referenceId];
  if (!route || !cost || !route.manifestUrl) return null;
  return Object.freeze({ id: definition.id, title: definition.title, description: definition.description,
    referenceId: route.referenceId, manifestUrl: route.manifestUrl, groupId: definition.groupOverride ?? route.groupId,
    scopeLabel: route.scopeLabel, assetBytes: cost.bytes, costText: cost.text,
    limitations: Object.freeze([...new Set([...(definition.limitationsOverride ?? route.limitations), ...(definition.additionalLimitations ?? []), ...COMMON_LIMITATIONS])]) });
}
const starters = Object.freeze(DEFINITIONS.map(makeStarter).filter((starter): starter is PrototypeStarter => starter !== null));
const sections = [
  { id: 'anatomy' as const, title: 'Whole-body and regional anatomy', description: 'Begin with available organ regions, brain labels or hindlimb muscles.' },
  { id: 'vessels-and-nerves' as const, title: 'Vessels and nerves', description: 'Choose regional graphs or developmental surfaces in their separate source frames.' },
  { id: 'neuronal-detail' as const, title: 'Neuronal morphology', description: 'Inspect a single source reconstruction without assigning cellular coverage elsewhere.' },
];
/** Guided entry points contain routing metadata only. They perform no source read or data modification. */
export const PROTOTYPE_STARTER_GROUPS: readonly PrototypeStarterGroup[] = Object.freeze(sections.map((section) =>
  Object.freeze({ ...section, starters: Object.freeze(starters.filter((starter) => DEFINITIONS.find((definition) => definition.id === starter.id)?.section === section.id)) })));

export function getPrototypeStarter(id: unknown): PrototypeStarter | undefined {
  return typeof id === 'string' ? starters.find((starter) => starter.id === id) : undefined;
}
function rejected(): PrototypeStarterResolution {
  return Object.freeze({ ok: false, target: null, errors: Object.freeze(['The starting view does not match the reviewed source reference.']) });
}
/** Load a reference separately, then resolve its exact existing group before changing the displayed view. */
export function resolvePrototypeStarter(value: unknown, starterId: unknown): PrototypeStarterResolution {
  try {
    const starter = getPrototypeStarter(starterId), definition = DEFINITIONS.find((entry) => entry.id === starterId);
    if (!starter || !definition || !value || typeof value !== 'object' || Array.isArray(value)) return rejected();
    const atlas = value as Atlas;
    if (atlas.id !== starter.referenceId || atlasAssetBytes(atlas) !== starter.assetBytes) return rejected();
    // The coverage resolver supplies the existing strict source, checksum,
    // coordinate-frame, license and complete inventory checks. For the organ
    // overview it validates the same source through its reviewed brain route.
    const coverage = resolveCoverageTarget(atlas, definition.validationTopic);
    if (!coverage.ok || !coverage.target) return rejected();
    const group = definition.groupOverride
      ? buildAnatomyGroups(atlas).groups.find((entry) => entry.id === definition.groupOverride)
      : coverage.target;
    const expectedCount = definition.regionCountOverride ?? coverage.target.regionCount;
    if (!group || group.id !== starter.groupId || group.structureIds.length !== expectedCount) return rejected();
    const target: AnatomyGroup = Object.freeze({ id: group.id, title: group.title, description: group.description,
      structureIds: Object.freeze([...group.structureIds]), limitations: Object.freeze([...new Set([...group.limitations, ...starter.limitations])]) });
    return Object.freeze({ ok: true, target, errors: Object.freeze([]) });
  } catch { return rejected(); }
}
