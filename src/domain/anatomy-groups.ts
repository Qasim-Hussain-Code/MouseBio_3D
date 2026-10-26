import type { Atlas } from './types';

/** Local display selections, not new anatomical identifiers or ontology assertions. */
export interface AnatomyGroup {
  readonly id: string;
  readonly title: string;
  readonly structureIds: readonly string[];
  readonly description: string;
  readonly limitations: readonly string[];
}

export interface AnatomyGroupsResult {
  readonly ok: boolean;
  readonly groups: readonly AnatomyGroup[];
  readonly errors: readonly string[];
}

interface ReferenceDefinition {
  readonly frameId: string;
  readonly prefix: string;
  readonly labels: readonly string[];
  readonly brain: readonly number[];
  readonly skeleton: number;
  readonly muscles: readonly number[];
  readonly headOrgans: readonly number[];
}

/** Source-label tables and memberships retain Digimouse CC BY-SA 4.0 attribution; see LICENSES.md. */
const REFERENCES: Readonly<Record<string, ReferenceDefinition>> = Object.freeze({
  'digimouse-tessellated-v1': Object.freeze({
    frameId: 'digimouse-tessellated-native-v1', prefix: 'digimouse:',
    labels: Object.freeze(['inside skin (muscle)', 'brain', 'heart', 'bladder', 'stomach', 'spleen',
      'kidneys', 'kidneys', 'lungs', 'lungs', 'pancreas', 'liver', 'skeleton', 'muscle', 'muscle', 'testis', 'testis']),
    brain: Object.freeze([2]), skeleton: 13, muscles: Object.freeze([14, 15]), headOrgans: Object.freeze([]),
  }),
  'digimouse-volume-040-v1': Object.freeze({
    frameId: 'digimouse-registered-voxel-native-v1', prefix: 'digimouse-volume:',
    labels: Object.freeze(['skin', 'skeleton', 'eye', 'medulla', 'cerebellum', 'olfactory bulbs', 'external cerebrum',
      'striatum', 'heart', 'rest of the brain', 'masseter muscles', 'lachrymal glands', 'bladder', 'testis', 'stomach',
      'spleen', 'pancreas', 'liver', 'kidneys', 'adrenal glands', 'lungs']),
    brain: Object.freeze([4, 5, 6, 7, 8, 10]), skeleton: 2, muscles: Object.freeze([11]), headOrgans: Object.freeze([3, 12]),
  }),
});

function failure(message: string): AnatomyGroupsResult {
  return Object.freeze({ ok: false, groups: Object.freeze([]), errors: Object.freeze([message]) });
}

function group(id: string, title: string, structureIds: readonly string[], description: string,
  limitations: readonly string[]): AnatomyGroup {
  return Object.freeze({ id, title, structureIds: Object.freeze([...structureIds]), description,
    limitations: Object.freeze([...limitations]) });
}

/**
 * Return source-label display groups only for an exact reviewed reference inventory.
 * A missing, duplicate, added or relabelled region rejects the complete group list;
 * no guessed identifiers or partial associations are returned.
 */
export function buildAnatomyGroups(atlas: Atlas): AnatomyGroupsResult {
  if (!atlas || typeof atlas.id !== 'string' || !Object.hasOwn(REFERENCES, atlas.id)) {
    return failure('No supported anatomical display groups are defined for this reference.');
  }
  const reference = REFERENCES[atlas.id];
  if (atlas.coordinateFrame?.id !== reference.frameId || !Array.isArray(atlas.structures)
      || atlas.structures.length !== reference.labels.length) {
    return failure('The reference frame or source-region inventory does not match the reviewed display-group definition.');
  }
  const expected = reference.labels.map((label, index) => ({ id: `${reference.prefix}${index + 1}`, label }));
  const byId = new Map(atlas.structures.map((structure) => [structure?.id, structure]));
  if (byId.size !== expected.length || expected.some(({ id, label }) => byId.get(id)?.sourceLabel !== label)) {
    return failure('Display groups require every original source identifier and label without duplicates or substitutions.');
  }
  const ids = (numbers: readonly number[]) => numbers.map((number) => `${reference.prefix}${number}`);
  const whole = expected.map(({ id }) => id);
  const envelope = `${reference.prefix}1`;
  const skeleton = `${reference.prefix}${reference.skeleton}`;
  const isVolume = atlas.id === 'digimouse-volume-040-v1';
  const groups: AnatomyGroup[] = [
    group('whole-mouse', 'Whole mouse reference', whole,
      'All source-labelled regions available in the selected reference.',
      ['The available source inventory is incomplete mouse anatomy from one male specimen.',
        'This selection adds no geometry, biological resolution or independently verified anatomical orientation.']),
    group('brain', 'Brain regions', ids(reference.brain),
      isVolume ? 'The six source labels explicitly combined as whole brain in the registered-volume label file.'
        : 'The aggregate brain region provided by the tetrahedral source.',
      isVolume ? ['This selects six existing meshes; it does not create an additional whole-brain mesh or establish cellular detail.']
        : ['Brain subdivisions are not independently identified in this reference.']),
    group('skeleton', 'Aggregate skeleton', [skeleton],
      'The existing source region labelled skeleton.',
      ['Individual bones are not identified by this aggregate label.']),
    group('muscles', 'Source muscle regions', ids(reference.muscles),
      isVolume ? 'The source masseter-muscles region.' : 'The two source regions labelled muscle.',
      isVolume ? ['Other individual muscles are absent, and this label does not assign laterality.']
        : ['Named muscle identity and laterality are unresolved; residual bulk body tissue is excluded.']),
    group('organs', 'Organs and other regions', whole.filter((id) => id !== envelope && id !== skeleton),
      'All existing source regions except the residual body envelope and aggregate skeleton, including the source muscle regions.',
      ['This is a display convenience, not a formal organ classification or a claim of complete internal anatomy.']),
  ];
  if (reference.headOrgans.length) {
    groups.push(group('head-organs', 'Eyes and lachrymal glands', ids(reference.headOrgans),
      'The existing source labels eye and lachrymal glands.',
      ['The shared labels do not establish laterality or comprehensive sensory-system coverage.']));
  }
  return Object.freeze({ ok: true, groups: Object.freeze(groups), errors: Object.freeze([]) });
}
