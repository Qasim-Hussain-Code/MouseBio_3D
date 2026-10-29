import type { Atlas } from './types';
import { buildEma147Groups } from './ema147-groups';
import { isLocalTraceAtlas } from './local-trace';
import { isSourceTraceAtlas } from './source-trace';
import { isSourcePolylineAtlas } from './source-polyline';

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

/**
 * Source names and display memberships derive from Charles JP, Cappellari O,
 * Spence AJ, Hutchinson JR and Wells DJ (2016), S1 Figure,
 * https://doi.org/10.1371/journal.pone.0147669.s002, CC BY 4.0.
 * The source labels have been adapted as display selections, not ontology
 * associations. See public/atlas-hindlimb/LICENSE.md for attribution.
 */
const HINDLIMB_LABELS = Object.freeze([
  'Peroneus digiti quinti', 'Peroneus longus', 'Tibialis posterior', 'Flexor digitorum longus',
  'Peroneus brevis', 'Peroneus digiti quarti', 'Peroneus tertius', 'Soleus', 'Lateral gastrocnemius',
  'Plantaris', 'Medial gastrocnemius', 'Extensor hallucis longus', 'Extensor digitorum longus',
  'Tibialis anterior', 'Fabellae', 'Patellar tendon', 'Pelvis', 'Femur', 'Patella', 'Foot', 'Tibia/Fibula',
  'Pectineus', 'Obturator externus', 'Psoas minor', 'Iliacus', 'Gemellus', 'Obturator internus',
  'Gluteus maximus', 'Quadratus femoris', 'Psoas major', 'Vastus lateralis', 'Vastus intermedius',
  'Vastus medialis', 'Adductor longus', 'Rectus femoris', 'Biceps femoris (posterior)',
  'Biceps femoris (anterior)', 'Popliteus', 'Caudofemoralis', 'Gracilis (anterior)',
  'Semitendinosus', 'Adductor magnus', 'Semimembranosus', 'Gracilis (posterior)',
]);
const HINDLIMB_BONES = Object.freeze([14, 16, 17, 18, 19, 20]);
const HINDLIMB_TENDON = Object.freeze([15]);
const HINDLIMB_MUSCLES = Object.freeze([...Array.from({ length: 14 }, (_, index) => index),
  ...Array.from({ length: 23 }, (_, index) => index + 21)]);

function failure(message: string): AnatomyGroupsResult {
  return Object.freeze({ ok: false, groups: Object.freeze([]), errors: Object.freeze([message]) });
}

function group(id: string, title: string, structureIds: readonly string[], description: string,
  limitations: readonly string[]): AnatomyGroup {
  return Object.freeze({ id, title, structureIds: Object.freeze([...structureIds]), description,
    limitations: Object.freeze([...limitations]) });
}

/** The PDF's zero-based tessellation indices and names are the complete reviewed inventory. */
function hindlimbGroups(atlas: Atlas): AnatomyGroupsResult {
  if (atlas.coordinateFrame?.id !== 'charles2016-hindlimb-prc-native-v1'
      || atlas.source?.id !== 'charles2016-hindlimb-s1-2016' || atlas.source?.license !== 'CC-BY-4.0'
      || atlas.source?.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/'
      || atlas.source?.pdfSha256 !== 'aadb7a020f3f9ffc1c8b91f3d8e5f9f2a1eef95d24b0816b69ac4f878637ac47'
      || !Array.isArray(atlas.structures) || atlas.structures.length !== HINDLIMB_LABELS.length) {
    return failure('The reference frame, source provenance or source-region inventory does not match the reviewed display-group definition.');
  }
  const prefix = 'charles2016-hindlimb:';
  const expected = HINDLIMB_LABELS.map((label, index) => ({ id: `${prefix}${index}`, label }));
  const byId = new Map(atlas.structures.map((structure) => [structure?.id, structure]));
  if (byId.size !== expected.length || expected.some(({ id, label }) => byId.get(id)?.sourceLabel !== label)) {
    return failure('Display groups require every original source identifier and label without duplicates or substitutions.');
  }
  const ids = (numbers: readonly number[]) => numbers.map((number) => `${prefix}${number}`);
  const groups = [
    group('whole-mouse', 'Whole hindlimb reference', expected.map(({ id }) => id),
      'All named surfaces in the right hindlimb and pelvic source figure.',
      ['This regional reference represents one adult female specimen, not a complete mouse or a population.',
        'This selection adds no geometry, biological resolution or independently verified anatomical orientation.']),
    group('muscles', 'Source muscle regions', ids(HINDLIMB_MUSCLES),
      'The 37 surfaces named as muscle regions in the source figure.',
      ['The source paper reports 39 muscles; the difference from these 37 muscle-named surfaces remains unresolved.',
        'Selection retains the source labels and does not provide muscle dynamics or additional structures.']),
    group('bones', 'Bone and aggregate regions', ids(HINDLIMB_BONES),
      'The six source-labelled bone or aggregate surfaces.',
      ['Fabellae, Foot and Tibia/Fibula remain their original aggregate labels; individual bones are not inferred.']),
    group('tendon', 'Patellar tendon', ids(HINDLIMB_TENDON),
      'The existing source-labelled Patellar tendon surface.',
      ['This selection does not add other tendons or validate muscle and tendon mechanics.']),
  ];
  return Object.freeze({ ok: true, groups: Object.freeze(groups), errors: Object.freeze([]) });
}

/**
 * Return source-label display groups only for an exact reviewed reference inventory.
 * A missing, duplicate, added or relabelled region rejects the complete group list;
 * no guessed identifiers or partial associations are returned.
 */
export function buildAnatomyGroups(atlas: Atlas): AnatomyGroupsResult {
  if (isLocalTraceAtlas(atlas)) return Object.freeze({ ok: true, groups: Object.freeze([
    group('whole-mouse', 'Whole local trace', atlas.structures.map((region) => region.id),
      'All parent-linked samples in the locally opened trace record.',
      ['Units, biological identity and provenance remain unverified. This display group adds no surfaces, registration or physiological model.']),
  ]), errors: Object.freeze([]) });

  if (isSourceTraceAtlas(atlas)) return Object.freeze({ ok: true, groups: Object.freeze([
    group('whole-mouse', 'Whole neuronal source trace', atlas.structures.map((region) => region.id),
      'The source samples and explicit parent links of NeuroMorpho.Org NMO_130632.',
      ['This separate reconstruction is not registered to a whole-body reference. Physical units remain unverified.',
        'Graph components do not establish cell counts; radius fields do not create measured surfaces.']),
  ]), errors: Object.freeze([]) });

  if (isSourcePolylineAtlas(atlas)) return Object.freeze({ ok: true, groups: Object.freeze([
    group('whole-mouse', 'Complete source graph', atlas.structures.map((region) => region.id),
      'Every polyline in this separately identified source graph.',
      ['This regional graph is not whole-body anatomy and has no accepted registration to another reference.',
        'Polyline cells, line width and numerical components do not establish cell counts, measured surfaces or physiology.']),
  ]), errors: Object.freeze([]) });

  if (atlas?.id === 'ema147-native-v1') return buildEma147Groups(atlas);
  if (atlas?.id === 'charles2016-hindlimb-v1') return hindlimbGroups(atlas);
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
