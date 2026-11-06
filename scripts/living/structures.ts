/** The inventory of the living mouse reference. Every structure declares its evidence. */
import type { InternalPart } from './internal';
import type { InteriorPart } from './interiors';
import type { LimbPart } from './limb-routes';
import { MUSCLES } from './muscles';
import { BONES } from './bones';
import type { TreePart } from './organ-trees';
export type Evidence = 'source' | 'traced' | 'simulated';

export type Plan =
  | { readonly kind: 'skin' }
  | { readonly kind: 'panniculus' }
  | { readonly kind: 'bone'; readonly index: number }
  | { readonly kind: 'tree'; readonly part: TreePart }
  | { readonly kind: 'shell'; readonly membrane: 'pericardium' | 'pleura' | 'meninges' | 'peritoneum'; readonly grow: number; readonly step: number; readonly radius: number }
  | { readonly kind: 'labels'; readonly labels: readonly number[]; readonly step?: number; readonly radius?: number }
  | { readonly kind: 'label-part'; readonly label: number; readonly seeds: readonly (readonly [number, number, number])[]; readonly index: number | readonly number[]; readonly lowX?: number; readonly highX?: number }
  | { readonly kind: 'gut-part'; readonly part: 'caecum' | 'colon' | 'small' }
  | { readonly kind: 'traced'; readonly tissue: 'gut' | 'blood' | 'fat' | 'muscle' | 'airway'; readonly step: number; readonly radius: number; readonly grow?: number }
  | { readonly kind: 'attachment'; readonly part: AttachmentPart }
  | { readonly kind: 'internal'; readonly part: InternalPart | InteriorPart | LimbPart }
  | { readonly kind: 'muscle'; readonly index: number }
  | { readonly kind: 'muscle-rest' };

export type AttachmentPart = 'paw-arteries' | 'paw-veins' | 'paw-nerves' | 'calcaneal-tendons' | 'extraocular-muscles' | 'patellae' | 'eyes' | 'eyelids' | 'corneas' | 'irises' | 'lenses' | 'retinas' | 'harderian-glands' | 'intraorbital-glands' | 'tail-vessels' | 'openings' | 'pinnae' | 'nose' | 'lips' | 'vibrissae' | 'forepaws' | 'hindpaws' | 'claws' | 'tail' | 'tail-vertebrae' | 'foot-bones';

export interface StructurePlan {
  readonly id: string;
  readonly name: string;
  readonly systems: readonly string[];
  readonly sourceLabel: string;
  readonly evidence: Evidence;
  readonly description: string;
  readonly basis: readonly string[];
  readonly color: string;
  readonly defaultOpacity?: number;
  readonly exterior?: boolean;
  readonly division?: 'estimated';
  readonly scale: string;
  readonly plan: Plan;
}

const HUMMEL = 'Hummel KP, Richardson FL, Fekete E. Anatomy. In: Green EL, ed. Biology of the Laboratory Mouse. 2nd ed. McGraw-Hill, 1966; web edition at https://www.informatics.jax.org/greenbook/';
const MARQUES = 'Marques MJ, Pertille A, Carvalho CLT, Santo Neto H. Acetylcholine receptor organization at the dystrophic extraocular muscle neuromuscular junction. Anat Rec (Hoboken) 2007;290(7):846-54. doi:10.1002/ar.20525';
const STUELSATZ = 'Stuelsatz P, Yablonka-Reuveni Z. Isolation of mouse periocular tissue for histological and immunostaining analyses of the extraocular muscles and their satellite cells. Methods Mol Biol 2016;1460:101-27. doi:10.1007/978-1-4939-3810-0_9';
const SAKABE = 'Sakabe T, Sakai K, Maeda T, et al. Transcription factor scleraxis vitally contributes to progenitor lineage direction in wound healing of adult tendon in mice. J Biol Chem 2018;293(16):5766-80. doi:10.1074/jbc.RA118.001987';
const COOK = 'Cook MJ. The Anatomy of the Laboratory Mouse. Academic Press, 1965; web edition at https://www.informatics.jax.org/cookbook/';
const DIGIMOUSE = 'Dogdas B, Stout D, Chatziioannou AF, Leahy RM. Digimouse: a 3D whole body mouse atlas from CT and cryosection data. Phys Med Biol 2007. doi:10.1088/0031-9155/52/3/003';
const POSTURE = 'Moved to the simulated standing posture by rotating limb segments about joints read from the source CT. Soft parts that would then stand outside the simulated skin are drawn in under it.';

const labelled = (id: string, name: string, label: number, sourceLabel: string, systems: string[], color: string, step?: number): StructurePlan => ({
  id: `living:${id}`, name, systems, sourceLabel, evidence: 'source', scale: 'organ', color,
  description: `The source label "${sourceLabel}" of the Digimouse image, resurfaced from a smoothed mask. ${POSTURE}`,
  basis: [DIGIMOUSE], plan: { kind: 'labels', labels: [label], step },
});

/**
 * One part of a source label. The parts of a divided label go to the nearest of hand-placed seeds, following the plates of Cook.
 * `side` keeps only voxels on one side of the midline.
 */
const part = (id: string, name: string, label: number, sourceLabel: string, systems: string[], color: string, seeds: readonly (readonly [number, number, number])[], index: number | readonly number[], note: string, side: { lowX?: number; highX?: number } = {}): StructurePlan => ({
  id: `living:${id}`, name, systems, sourceLabel, evidence: 'source', division: seeds.length > 1 ? 'estimated' : undefined, scale: 'organ', color,
  description: `Part of the source label "${sourceLabel}" of the Digimouse image. ${note} ${POSTURE}`,
  basis: [DIGIMOUSE, COOK], plan: { kind: 'label-part', label, seeds, index, ...side },
});
const LATERALITY = 'Left and right are named from the inference that high native x is the left of the animal, which is not verified.';
export const HEART: readonly (readonly [number, number, number])[] = [[158, 372, 82], [212, 374, 90], [165, 415, 62], [205, 425, 72]];
const CHAMBER = 'Its boundaries with the other chambers are estimated, after Cook figures 89 to 91. Simulated spaces and valves lie inside it.';
const LUNG_R: readonly (readonly [number, number, number])[] = [[140, 385, 105], [122, 420, 80], [135, 455, 125], [162, 450, 85]];
const LOBE = 'The lobes are named in Cook figure 90; their boundaries are estimated.';
const LIVER: readonly (readonly [number, number, number])[] = [[140, 480, 45], [235, 500, 85], [95, 540, 110], [190, 590, 135]];
const LIVER_LOBE = 'The lobes are named in Cook figure 60; their boundaries are estimated.';
export const STOMACH: readonly (readonly [number, number, number])[] = [[262, 520, 135], [210, 552, 105]];
const STOMACH_REGION = 'The regions are named in Cook figure 59; their boundary is estimated.';
export const MIDDLE_X = 172;
const BRAIN_REST: readonly (readonly [number, number, number])[] = [[189, 165, 105], [189, 215, 118], [189, 208, 94], [160, 225, 135], [218, 225, 135], [189, 243, 132], [189, 246, 110]];
const BRAIN_PART = 'The source label "rest of the brain" holds all of these parts together; their boundaries are estimated from seeds placed by hand after Greene, which describes the rat.';

const traced = (id: string, name: string, tissue: 'gut' | 'blood' | 'fat' | 'muscle' | 'airway', systems: string[], color: string, description: string, step = 2, radius = 1, grow?: number): StructurePlan => ({
  id: `living:${id}`, name, systems, sourceLabel: 'none, traced from the source images', evidence: 'traced', scale: 'organ', color,
  description: `Traced by automatic colour and density rules in the coregistered source photographs and CT, inside the residual label that the source leaves unsegmented. ${description} Not reviewed by an anatomist. ${POSTURE}`,
  basis: [DIGIMOUSE], plan: { kind: 'traced', tissue, step, radius, grow },
});

const CHARLES = 'Charles JP, Cappellari O, Spence AJ, Hutchinson JR, Wells DJ. Musculoskeletal geometry, muscle architecture and functional specialisations of the mouse hindlimb. PLoS One 2016;11(4):e0147669. doi:10.1371/journal.pone.0147669';
const MUSCLE_TONES = ['#a5524a', '#ad5a50', '#9c4c46', '#b0605a', '#a14f4f', '#a85649'];
const OCONNELL = "O'Connell GD, Vresilovic EJ, Elliott DM. Comparison of animals used in disc research to human lumbar disc geometry. Spine 2007;32(3):328-33. doi:10.1097/01.brs.0000253961.40910.c1";
const FULLER = 'Fuller JL, Wimer RE. Neural, sensory, and motor functions. In: Green EL, ed. Biology of the Laboratory Mouse. 2nd ed. McGraw-Hill, 1966; web edition at https://www.informatics.jax.org/greenbook/';
const KOCHI = 'Kochi T, Imai Y, Takeda A, Watanabe Y, Mori S, Tachi M, Kodama T. Characterization of the arterial anatomy of the murine hindlimb: functional role in the design and understanding of ischemia models. PLoS One 2013;8(12):e84047. doi:10.1371/journal.pone.0084047';
const RIGAUD = 'Rigaud M, Gemes G, Barabas ME, Chernoff DI, Abram SE, Stucky CL, Hogan QH. Species and strain differences in rodent sciatic nerve anatomy: implications for studies of neuropathic pain. Pain 2008;136(1-2):188-201. doi:10.1016/j.pain.2008.01.016';
const SHIELDS = 'Shields SD, Eckert WA, Basbaum AI. Spared nerve injury model of neuropathic pain in the mouse: a behavioral and anatomic analysis. J Pain 2003;4(8):465-70. doi:10.1067/s1526-5900(03)00781-8';
const GREENE = 'Greene EC. Anatomy of the Rat. Transactions of the American Philosophical Society, New Series, vol. 27. 1935. This describes the rat, not the mouse.';
const inner = (id: string, name: string, part: InternalPart | InteriorPart | LimbPart, systems: string[], color: string, description: string, basis: readonly string[] = [COOK, HUMMEL]): StructurePlan => ({
  id: `living:${id}`, name, systems, sourceLabel: 'none, simulated', evidence: 'simulated', scale: 'organ', color,
  description: `Simulated. ${description} The course, size and shape are estimates placed on landmarks of this specimen, and they are not measured. ${POSTURE}`,
  basis, plan: { kind: 'internal', part },
});

const simulated = (id: string, name: string, part: AttachmentPart, systems: string[], color: string, description: string): StructurePlan => ({
  id: `living:${id}`, name, systems, sourceLabel: 'none, simulated', evidence: 'simulated', scale: 'organ', color, exterior: true,
  description: `Simulated. ${description} Not measured from this specimen.`, basis: [COOK], plan: { kind: 'attachment', part },
});

export const STRUCTURES: readonly StructurePlan[] = [
  {
    id: 'living:skin', name: 'Skin, with simulated coat', systems: ['integumentary'], sourceLabel: 'outer surface of all source labels', evidence: 'traced', scale: 'organism', color: '#e8b9a8', defaultOpacity: 1,
    description: `The outer surface of the union of all Digimouse labels, carried into the stance and smoothed. ${POSTURE} The shanks and forearms are simulated shapes whose radii are measured from the limb tissue and limited to a slender limb, because the scanned shanks lay pressed flat, the scanned forearms end in a blunt mass round the wrists, and the images end at the hind feet. The fur drawn on the surface is simulated, because the specimen is a nude mouse, and so are the colours of the skin under it and of the ears, tail, paws and nose that go with each coat.`,
    basis: [DIGIMOUSE, COOK], plan: { kind: 'skin' },
  },
  {
    id: 'living:panniculus', name: 'Panniculus carnosus', systems: ['muscular', 'integumentary'], sourceLabel: 'none, simulated', evidence: 'simulated', scale: 'organ', color: '#a9574f', defaultOpacity: 0.3,
    description: 'Simulated. A thin sheet of muscle just under the skin of the head, neck and trunk, as Hummel et al. describe, drawn as a faint surface taken from the body surface. Its depth is an estimate, and it is not measured.',
    basis: [HUMMEL], plan: { kind: 'panniculus' },
  },
  ...BONES.map((bone, index): StructurePlan => ({
    id: `living:bone-${bone.id}`, name: bone.name, systems: ['skeletal'], sourceLabel: 'CT bone', evidence: 'traced', division: 'estimated', scale: 'organ', color: '#ddd4c0',
    description: `${bone.surface ?? 'An isosurface of the source CT near the source skeleton label, which also shows the digits that the label crops.'} ${bone.division} ${bone.surface ? '' : 'Its name is also an estimate. '}${bone.note} ${POSTURE}`,
    basis: [DIGIMOUSE, COOK, HUMMEL], plan: { kind: 'bone', index },
  })),
  labelled('cerebrum', 'External cerebrum', 7, 'external cerebrum', ['nervous'], '#dcc0ba'),
  labelled('striatum', 'Striatum', 8, 'striatum', ['nervous'], '#d3b0ab'),
  part('brain-forebrain', 'Basal forebrain', 10, 'rest of the brain', ['nervous'], '#d9bcb6', BRAIN_REST, 0, BRAIN_PART),
  part('brain-thalamus', 'Thalamus', 10, 'rest of the brain', ['nervous'], '#d6b7b3', BRAIN_REST, 1, BRAIN_PART),
  part('brain-hypothalamus', 'Hypothalamus', 10, 'rest of the brain', ['nervous', 'endocrine'], '#d3b1ad', BRAIN_REST, 2, BRAIN_PART),
  part('brain-hippocampus', 'Hippocampus', 10, 'rest of the brain', ['nervous'], '#dcc2bb', BRAIN_REST, [3, 4], BRAIN_PART),
  part('brain-midbrain', 'Midbrain', 10, 'rest of the brain', ['nervous'], '#d1aca7', BRAIN_REST, 5, BRAIN_PART),
  part('brain-pons', 'Pons', 10, 'rest of the brain', ['nervous'], '#d5b5ae', BRAIN_REST, 6, BRAIN_PART),
  labelled('cerebellum', 'Cerebellum', 5, 'cerebellum', ['nervous'], '#cfa89f'),
  labelled('medulla', 'Medulla', 4, 'medulla', ['nervous'], '#d9bdb4'),
  labelled('olfactory', 'Olfactory bulbs', 6, 'olfactory bulbs', ['nervous'], '#e1c6b8'),
  part('heart-lv', 'Left ventricle', 9, 'heart', ['cardiovascular'], '#a7343b', HEART, 3, CHAMBER),
  part('heart-rv', 'Right ventricle', 9, 'heart', ['cardiovascular'], '#ad3f45', HEART, 2, CHAMBER),
  part('heart-la', 'Left atrium', 9, 'heart', ['cardiovascular'], '#9c3a4a', HEART, 1, CHAMBER),
  part('heart-ra', 'Right atrium', 9, 'heart', ['cardiovascular'], '#8f3a52', HEART, 0, CHAMBER),
  part('lung-left', 'Left lung', 21, 'lungs', ['respiratory'], '#d4877f', [[209, 420, 121]], 0, `The left lung has a single lobe in Cook figure 90. ${LATERALITY}`, { lowX: MIDDLE_X }),
  part('lung-r-superior', 'Right lung, superior lobe', 21, 'lungs', ['respiratory'], '#d68a82', LUNG_R, 0, LOBE, { highX: MIDDLE_X }),
  part('lung-r-middle', 'Right lung, middle lobe', 21, 'lungs', ['respiratory'], '#cf8078', LUNG_R, 1, LOBE, { highX: MIDDLE_X }),
  part('lung-r-inferior', 'Right lung, inferior lobe', 21, 'lungs', ['respiratory'], '#d88e86', LUNG_R, 2, LOBE, { highX: MIDDLE_X }),
  part('lung-r-postcaval', 'Right lung, post-caval lobe', 21, 'lungs', ['respiratory'], '#cc7c74', LUNG_R, 3, LOBE, { highX: MIDDLE_X }),
  part('liver-median', 'Liver, median lobe', 18, 'liver', ['digestive'], '#7d3330', LIVER, 0, LIVER_LOBE),
  part('liver-left', 'Liver, left lobe', 18, 'liver', ['digestive'], '#823632', LIVER, 1, LIVER_LOBE),
  part('liver-right', 'Liver, right lobe', 18, 'liver', ['digestive'], '#78302d', LIVER, 2, LIVER_LOBE),
  part('liver-caudate', 'Liver, caudate lobe', 18, 'liver', ['digestive'], '#853a35', LIVER, 3, LIVER_LOBE),
  part('stomach-cardiac', 'Stomach, cardiac region', 15, 'stomach', ['digestive'], '#d0957e', STOMACH, 0, STOMACH_REGION),
  part('stomach-pyloric', 'Stomach, pyloric region', 15, 'stomach', ['digestive'], '#c98a73', STOMACH, 1, STOMACH_REGION),
  labelled('spleen', 'Spleen', 16, 'spleen', ['lymphatic', 'immune'], '#5f2b45'),
  labelled('pancreas', 'Pancreas', 17, 'pancreas', ['digestive', 'endocrine'], '#dfb88a'),
  part('kidney-right', 'Right kidney', 19, 'kidneys', ['urinary'], '#8f3b3b', [[114, 595, 146]], 0, LATERALITY, { highX: MIDDLE_X }),
  part('kidney-left', 'Left kidney', 19, 'kidneys', ['urinary'], '#8f3b3b', [[229, 606, 150]], 0, LATERALITY, { lowX: MIDDLE_X }),
  labelled('adrenals', 'Adrenal glands', 20, 'adrenal glands', ['endocrine'], '#e0b86d', 1),
  labelled('bladder', 'Bladder', 13, 'bladder', ['urinary'], '#d9a98f'),
  part('testis-right', 'Right testis', 14, 'testis', ['reproductive'], '#e3cfc8', [[149, 809, 37]], 0, LATERALITY, { highX: 190 }),
  part('testis-left', 'Left testis', 14, 'testis', ['reproductive'], '#e3cfc8', [[219, 757, 51]], 0, LATERALITY, { lowX: 190 }),
  labelled('masseter', 'Masseter muscles', 11, 'masseter muscles', ['muscular'], '#9c4d47'),
  labelled('lachrymal', 'Lachrymal glands', 12, 'lachrymal glands', ['sensory'], '#d7b3a4'),
  ...MUSCLES.map((muscle, index): StructurePlan => ({
    id: `living:muscle-${muscle.id}`, name: muscle.name, systems: ['muscular'], sourceLabel: 'none, traced tissue with an estimated division', evidence: 'traced', division: 'estimated', scale: 'organ', color: MUSCLE_TONES[index % MUSCLE_TONES.length],
    description: `The tissue is traced from the source images by automatic rules, not reviewed by an anatomist. Its division and name are estimates: each cell goes to the muscle whose course, placed by hand on measured joints, is nearest. ${muscle.note} Paired muscles are not separated. ${POSTURE}`,
    basis: muscle.basis === 'charles' ? [CHARLES] : [GREENE], plan: { kind: 'muscle', index },
  })),
  {
    id: 'living:muscle-rest', name: 'Other muscle tissue', systems: ['muscular'], sourceLabel: 'none, traced from the source images', evidence: 'traced', scale: 'organ', color: '#9a4f48',
    description: `Traced by automatic colour and density rules in the coregistered source photographs and CT. Red tissue of muscle density that lies far from the course of every named muscle. Not reviewed by an anatomist. ${POSTURE}`,
    basis: [DIGIMOUSE], plan: { kind: 'muscle-rest' },
  },
  { ...traced('small-intestine', 'Small intestine', 'gut', ['digestive'], '#c7a071', 'Yellow-green and tan gut contents and wall within the abdominal cavity, closed slightly to include the wall. Division from the large intestine is estimated by thickness and position.', 2, 1, 2), division: 'estimated', plan: { kind: 'gut-part', part: 'small' } },
  { ...traced('caecum', 'Caecum', 'gut', ['digestive'], '#b99560', 'The thickest part of the traced gut, on the left of the abdomen as in Cook figure 54. Division from the rest of the gut is estimated by thickness and position.', 2, 1, 2), division: 'estimated', plan: { kind: 'gut-part', part: 'caecum' } },
  { ...traced('colon', 'Colon and rectum', 'gut', ['digestive'], '#a98754', 'Traced gut behind the bladder, near the midline. Division from the rest of the gut is estimated by position.', 2, 1, 2), division: 'estimated', plan: { kind: 'gut-part', part: 'colon' } },
  traced('veins', 'Blood-filled vessels', 'blood', ['cardiovascular', 'arterial-venous'], '#47202f', 'Very dark blood-filled lumens, mainly large veins such as the caudal vena cava and jugular veins. Arteries are empty after death and do not appear.', 2, 1),
  traced('fat', 'Adipose and connective tissue', 'fat', ['integumentary'], '#ecdcae', 'Tissue of low CT density or pale colour, such as the fat pads around the testes and under the skin.', 3, 1),
  traced('airways', 'Air spaces', 'airway', ['respiratory'], '#cfe3e8', 'Voxels of very low CT density, such as the nasal passages and gas in the gut.', 2, 1),
  inner('aorta', 'Aorta', 'aorta', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the left ventricle it ascends, arches to the left and descends along the ventral side of the vertebral column to its bifurcation.'),
  inner('innominate-artery', 'Innominate artery', 'innominate-artery', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The first branch of the arch of the aorta, as drawn by Cook, giving the right common carotid and right subclavian arteries.', [COOK, HUMMEL]),
  inner('common-carotid-arteries', 'Common carotid arteries', 'common-carotid-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Up the neck beside the trachea. The left leaves the arch of the aorta directly, as drawn by Cook.', [COOK, HUMMEL]),
  inner('internal-carotid-arteries', 'Internal carotid arteries', 'internal-carotid-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the division of the common carotid artery towards the base of the brain.', [COOK, HUMMEL]),
  inner('external-carotid-arteries', 'External carotid arteries', 'external-carotid-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the division of the common carotid artery to the face and jaw.', [COOK, HUMMEL]),
  ...([
    ['bronchi', 'Bronchial tree', ['respiratory'], '#e4e2d6', 'Airways filling the source lung label.'],
    ['pulmonary-arteries', 'Pulmonary arteries', ['cardiovascular', 'arterial-venous', 'respiratory'], '#c8333a', 'From the outflow of the heart to fill the source lung label.'],
    ['pulmonary-veins', 'Pulmonary veins', ['cardiovascular', 'arterial-venous', 'respiratory'], '#3f5a9a', 'From the source lung label to the left atrium.'],
    ['hepatic-arteries', 'Hepatic artery branches', ['cardiovascular', 'arterial-venous', 'digestive'], '#c8333a', 'Filling the source liver label.'],
    ['portal-branches', 'Portal vein branches', ['cardiovascular', 'arterial-venous', 'digestive'], '#3f5a9a', 'Filling the source liver label.'],
    ['hepatic-veins', 'Hepatic vein branches', ['cardiovascular', 'arterial-venous', 'digestive'], '#4a66a8', 'Filling the source liver label.'],
    ['renal-arteries', 'Renal artery branches', ['cardiovascular', 'arterial-venous', 'urinary'], '#c8333a', 'Filling the source kidney label.'],
    ['renal-veins', 'Renal vein branches', ['cardiovascular', 'arterial-venous', 'urinary'], '#3f5a9a', 'Filling the source kidney label.'],
    ['cerebral-arteries', 'Cerebral arteries', ['cardiovascular', 'arterial-venous', 'nervous'], '#c8333a', 'Filling the source brain labels from the base of the brain.'],
    ['mesenteric-arteries', 'Mesenteric artery branches', ['cardiovascular', 'arterial-venous', 'digestive'], '#c8333a', 'Filling the traced gut from the superior mesenteric artery.'],
    ['mesenteric-veins', 'Mesenteric vein branches', ['cardiovascular', 'arterial-venous', 'digestive'], '#3f5a9a', 'Filling the traced gut towards the portal vein.'],
  ] as const).map(([id, name, systems, color, note]): StructurePlan => ({
    id: `living:${id}`, name, systems: [...systems], sourceLabel: 'none, simulated', evidence: 'simulated', scale: 'organ', color,
    description: `Simulated. ${note} The branches are generated to fill the measured volume by a space colonization rule; they show what lies there, not where any real branch runs. ${POSTURE}`,
    basis: [COOK], plan: { kind: 'tree', part: id },
  })),
  inner('coronary-arteries', 'Coronary arteries', 'coronary-arteries', ['cardiovascular', 'arterial-venous'], '#d0434a', 'Vessels drawn on the surface of the source heart label.'),
  inner('coeliac-arteries', 'Coeliac artery with hepatic, splenic and gastric branches', 'coeliac-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The first of the abdominal branches in the order given by Hummel et al.', [COOK, HUMMEL]),
  inner('superior-mesenteric-artery', 'Superior mesenteric artery and its fan', 'superior-mesenteric-artery', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The second of the abdominal branches, fanning out in the mesentery of the gut.', [COOK, HUMMEL]),
  inner('renal-artery-stems', 'Renal arteries, from the aorta to the kidneys', 'renal-artery-stems', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The stems that lead to the branching arteries inside each kidney.', [COOK, HUMMEL]),
  inner('testicular-arteries', 'Testicular arteries', 'testicular-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The genital branches of the aorta in this male, running back to the testes.', [COOK, HUMMEL]),
  inner('inferior-mesenteric-artery', 'Inferior mesenteric artery', 'inferior-mesenteric-artery', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The last abdominal branch before the end of the aorta.', [COOK, HUMMEL, KOCHI]),
  inner('common-iliac-arteries', 'Common iliac arteries', 'common-iliac-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The aorta ends by dividing into the two common iliac arteries and the median coccygeal artery, just after the caudal mesenteric artery, and each common iliac artery runs back and outwards.', [KOCHI]),
  inner('median-coccygeal-artery', 'Median coccygeal artery', 'median-coccygeal-artery', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The third branch at the end of the aorta, running towards the tail under the vertebrae.', [KOCHI]),
  inner('internal-iliac-arteries', 'Internal iliac arteries', 'internal-iliac-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'One of the two divisions of the common iliac artery, entering the pelvis.', [KOCHI]),
  inner('external-iliac-arteries', 'External iliac arteries', 'external-iliac-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The other division, running back to the inguinal ligament, where its name changes to femoral artery.', [KOCHI]),
  inner('gluteal-arteries', 'Cranial and caudal gluteal arteries', 'gluteal-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Running back and up side by side from the iliac arteries, with branches to the gluteal muscles and the top of the biceps femoris. The caudal gluteal artery ends as the internal pudendal and lateral coccygeal arteries.', [KOCHI]),
  inner('iliacofemoral-arteries', 'Iliacofemoral arteries', 'iliacofemoral-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the end of the common iliac artery, across behind the iliopsoas and into the top of the quadriceps.', [KOCHI]),
  inner('pudendoepigastric-arteries', 'Pudendoepigastric trunks with caudal epigastric and external pudendal arteries', 'pudendoepigastric-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'A short trunk from the external iliac artery just before the inguinal ligament. The caudal epigastric artery goes to the abdominal wall, and the external pudendal artery runs inwards, parallel to the ligament, and ends in the perineum.', [KOCHI]),
  inner('femoral-arteries', 'Femoral arteries', 'femoral-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the inguinal ligament along the inner side of the thigh, dividing into the popliteal and saphenous arteries above the knee.', [KOCHI]),
  inner('lateral-circumflex-femoral-arteries', 'Lateral circumflex femoral arteries', 'lateral-circumflex-femoral-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the middle of the femoral artery into the middle of the quadriceps, beside a branch of the femoral nerve.', [KOCHI]),
  inner('caudal-femoral-arteries', 'Proximal caudal femoral and superficial caudal epigastric arteries', 'caudal-femoral-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Both leave the femoral artery in the middle of the thigh. The first runs on the surface of the adductors, under the gracilis. The second runs outwards through the inguinal fat.', [KOCHI]),
  inner('deep-femoral-arteries', 'Deep femoral arteries', 'deep-femoral-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'On the deep adductors, behind the femur, with branches to the external obturator and the hamstrings, whose ends reach the biceps femoris. Kochi et al. found its origin to vary; it is drawn from the internal iliac artery, the commonest origin, in five of their eleven limbs.', [KOCHI]),
  inner('obturator-arteries', 'Obturator arteries', 'obturator-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Under the external obturator muscle, at the opening in the hip bone. Its origin as drawn is an estimate.', [KOCHI]),
  inner('saphenous-arteries', 'Saphenous arteries', 'saphenous-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Down the inner side of the leg, dividing into cranial and caudal branches. It is drawn close under the skin.', [KOCHI]),
  inner('popliteal-arteries', 'Popliteal arteries with genicular and distal caudal femoral branches', 'popliteal-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Outwards between the quadriceps and the adductors to the back of the knee. The medial proximal genicular artery leaves near its start for the bottom of the quadriceps, and the distal caudal femoral artery goes to the bottom of the biceps femoris and gives the lateral proximal genicular artery.', [KOCHI]),
  inner('tibial-arteries', 'Tibial arteries', 'tibial-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The continuation of the popliteal artery in the shank, deep at the back and through to the front. Kochi et al. do not describe this part, so it follows the rat.', [GREENE]),
  inner('common-iliac-veins', 'Common iliac veins', 'common-iliac-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'From the end of the inferior vena cava, beside the common iliac arteries.', [KOCHI]),
  inner('femoral-veins', 'External iliac and femoral veins', 'femoral-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Beside their arteries, along the inner side of the thigh.', [KOCHI]),
  inner('saphenous-veins', 'Saphenous veins', 'saphenous-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Beside the saphenous artery on the inner side of the leg.', [KOCHI]),
  inner('popliteal-veins', 'Popliteal veins', 'popliteal-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Beside the popliteal artery behind the knee, and on into the back of the shank.', [KOCHI]),
  inner('lateral-saphenous-veins', 'Lateral saphenous veins', 'lateral-saphenous-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'One of the two large veins that Kochi et al. saw on the outer side of the hind limb, where they saw no large artery.', [KOCHI]),
  inner('ischial-veins', 'Ischial veins', 'ischial-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'The other large vein on the outer side of the thigh, as Kochi et al. saw it.', [KOCHI]),
  inner('lumbosacral-plexus', 'Lumbar roots of the sciatic nerves', 'lumbosacral-plexus', ['nervous'], '#e9d98f', 'The third and fourth lumbar nerves, which Rigaud et al. found to be the main origins of the sciatic nerve in mice, joining behind the hip.', [RIGAUD]),
  inner('sciatic-nerves', 'Sciatic nerves', 'sciatic-nerves', ['nervous'], '#e9d98f', 'From behind the hip down the back of the thigh, behind the femur and under the biceps femoris, to its division above the knee.', [RIGAUD, SHIELDS, GREENE]),
  inner('tibial-nerves', 'Tibial nerves', 'tibial-nerves', ['nervous'], '#e9d98f', 'One of the three branches of the sciatic nerve, between the heads of the gastrocnemius, down the back of the shank to the sole.', [SHIELDS, GREENE]),
  inner('common-peroneal-nerves', 'Common peroneal nerves', 'common-peroneal-nerves', ['nervous'], '#e9d98f', 'One of the three branches of the sciatic nerve, outwards round the head of the fibula and down the front of the shank.', [SHIELDS, GREENE]),
  inner('sural-nerves', 'Sural nerves', 'sural-nerves', ['nervous'], '#e9d98f', 'The smallest of the three branches of the sciatic nerve, close under the skin at the back of the shank.', [SHIELDS, GREENE]),
  inner('femoral-nerves', 'Femoral nerves', 'femoral-nerves', ['nervous'], '#e9d98f', 'From the lumbar nerves through the psoas to the front of the thigh, with a branch into the quadriceps beside the lateral circumflex femoral artery.', [KOCHI, GREENE]),
  inner('saphenous-nerves', 'Saphenous nerves', 'saphenous-nerves', ['nervous'], '#e9d98f', 'The long branch of the femoral nerve, beside the saphenous vessels on the inner side of the leg.', [GREENE]),
  inner('obturator-nerves', 'Obturator nerves', 'obturator-nerves', ['nervous'], '#e9d98f', 'From the lumbar nerves through the opening in the hip bone to the adductors.', [GREENE]),
  inner('gluteal-nerves', 'Gluteal nerves', 'gluteal-nerves', ['nervous'], '#e9d98f', 'Short branches near the start of the sciatic nerve, to the gluteal muscles.', [GREENE]),
  inner('subclavian-arteries', 'Subclavian arteries', 'subclavian-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The right from the innominate artery and the left from the arch of the aorta, out over the first rib.', [COOK, GREENE]),
  inner('axillary-arteries', 'Axillary arteries', 'axillary-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The continuation of the subclavian artery in the armpit, with branches towards the wall of the chest and round the top of the humerus.', [GREENE]),
  inner('brachial-arteries', 'Brachial arteries', 'brachial-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Along the inner side of the upper fore limb to the elbow, beside the median nerve.', [GREENE]),
  inner('forearm-arteries', 'Arteries of the forearm', 'forearm-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The continuation of the brachial artery beyond the elbow. They are not divided into named arteries here, because no source for the mouse was checked.', [GREENE]),
  inner('subclavian-veins', 'Subclavian and axillary veins', 'subclavian-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'From the armpit to the junction with the jugular vein, beside their arteries.', [COOK, GREENE]),
  inner('brachial-veins', 'Brachial veins', 'brachial-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Beside the brachial artery and on into the forearm.', [GREENE]),
  inner('cephalic-veins', 'Cephalic veins', 'cephalic-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Close under the skin on the outer side of the fore limb, and on to the armpit.', [GREENE]),
  inner('brachial-plexus', 'Roots of the brachial plexus', 'brachial-plexus', ['nervous'], '#e9d98f', 'Roots from the lower neck and first thoracic levels joining at the shoulder.', [GREENE]),
  inner('musculocutaneous-nerves', 'Musculocutaneous nerves', 'musculocutaneous-nerves', ['nervous'], '#e9d98f', 'From the plexus to the biceps brachii and on towards the forearm.', [GREENE]),
  inner('axillary-nerves', 'Axillary nerves', 'axillary-nerves', ['nervous'], '#e9d98f', 'From the plexus round the back of the humerus towards the deltoid.', [GREENE]),
  inner('radial-nerves', 'Radial nerves', 'radial-nerves', ['nervous'], '#e9d98f', 'From the plexus round the back of the humerus under the triceps, then along the outer side of the forearm among the extensors.', [GREENE]),
  inner('median-nerves', 'Median nerves', 'median-nerves', ['nervous'], '#e9d98f', 'From the plexus beside the brachial artery, then down the middle of the forearm to the palm.', [GREENE]),
  inner('ulnar-nerves', 'Ulnar nerves', 'ulnar-nerves', ['nervous'], '#e9d98f', 'From the plexus behind the inner side of the elbow, then along the ulnar side of the forearm.', [GREENE]),
  inner('caudal-vena-cava', 'Inferior vena cava', 'caudal-vena-cava', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'To the right of the vertebral column and aorta as stated by Hummel et al., passing through the liver to the right atrium. Traced blood-filled lumens lie around the same course.'),
  inner('superior-venae-cavae', 'Superior venae cavae', 'superior-venae-cavae', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Two, right and left, as drawn in Cook figures 90 and 95, each formed by jugular and subclavian veins.', [COOK, HUMMEL]),
  inner('external-jugular-veins', 'External jugular veins', 'external-jugular-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Close under the skin of the neck.', [COOK, HUMMEL]),
  inner('internal-jugular-veins', 'Internal jugular veins', 'internal-jugular-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Deep in the neck, beside the common carotid arteries.', [COOK, HUMMEL]),
  inner('azygos-vein', 'Azygos vein', 'azygos-vein', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'On the left of the aorta, joining the left superior vena cava, as drawn in Cook figure 95.', [COOK, HUMMEL]),
  inner('portal-vein', 'Hepatic portal vein with mesenteric and splenic tributaries', 'portal-vein', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Draining the gut and spleen to the liver.', [COOK, HUMMEL]),
  inner('renal-vein-stems', 'Renal veins, from the kidneys to the inferior vena cava', 'renal-vein-stems', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Beside the renal arteries.', [COOK, HUMMEL]),
  inner('hepatic-vein-stems', 'Hepatic veins, from the liver to the inferior vena cava', 'hepatic-vein-stems', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'The stems that lead from the branching veins inside the liver.', [COOK, HUMMEL]),
  inner('spinal-cord', 'Spinal cord', 'spinal-cord', ['nervous'], '#efe4cf', 'Its course follows the vertebral canal measured in the source CT; its radius is an estimate, with cervical and lumbar enlargements.', [DIGIMOUSE, GREENE]),
  inner('cervical-nerves', 'Cervical spinal nerves', 'cervical-nerves', ['nervous'], '#e9d98f', 'Paired nerves of the neck, counted from the vertebral formula in Hummel et al.', [HUMMEL, GREENE]),
  inner('thoracic-nerves', 'Thoracic spinal and intercostal nerves', 'thoracic-nerves', ['nervous'], '#e9d98f', 'Paired nerves of the chest, running round the wall between the ribs, counted from the vertebral formula in Hummel et al.', [HUMMEL, GREENE]),
  inner('lumbar-nerves', 'Lumbar spinal nerves', 'lumbar-nerves', ['nervous'], '#e9d98f', 'Paired nerves of the loin, counted from the vertebral formula in Hummel et al.', [HUMMEL, GREENE]),
  inner('sacral-nerves', 'Sacral spinal nerves', 'sacral-nerves', ['nervous'], '#e9d98f', 'Paired nerves of the sacrum, counted from the vertebral formula in Hummel et al.', [HUMMEL, GREENE]),
  inner('vagus-nerves', 'Vagus nerves', 'vagus-nerves', ['nervous'], '#e9d98f', 'From the base of the skull beside the carotid artery and oesophagus to the stomach.', [COOK, GREENE]),
  inner('phrenic-nerves', 'Phrenic nerves', 'phrenic-nerves', ['nervous'], '#e9d98f', 'From the neck through the chest to the diaphragm.', [COOK, GREENE]),
  inner('optic-nerves', 'Optic nerves and chiasm', 'optic-nerves', ['nervous'], '#e9d98f', 'From each eye to their crossing under the brain.', [GREENE]),
  inner('trigeminal-roots', 'Trigeminal roots and ganglia', 'trigeminal-roots', ['nervous'], '#e9d98f', 'Where the trigeminal nerve leaves the brain stem and forms its ganglion.', [GREENE]),
  inner('ophthalmic-nerves', 'Ophthalmic nerves', 'ophthalmic-nerves', ['nervous'], '#e9d98f', 'The first division of the trigeminal nerve, towards the eye and the front of the head.', [GREENE]),
  inner('maxillary-nerves', 'Maxillary and infraorbital nerves', 'maxillary-nerves', ['nervous'], '#e9d98f', 'The second division of the trigeminal nerve, under the eye to the whisker pad.', [GREENE]),
  inner('mandibular-nerves', 'Mandibular nerves', 'mandibular-nerves', ['nervous'], '#e9d98f', 'The third division of the trigeminal nerve, to the jaw.', [GREENE]),
  inner('facial-nerves', 'Facial nerves', 'facial-nerves', ['nervous'], '#e9d98f', 'From the brain stem round the ear to the muscles of the face.', [GREENE]),
  inner('trachea', 'Trachea and bronchi', 'trachea', ['respiratory'], '#dfe6e0', 'A tube ventral to the oesophagus, dividing into main and lobar bronchi towards the source lung label. The trachea is collapsed in this specimen and cannot be followed in its images.'),
  inner('tracheal-rings', 'Tracheal rings', 'tracheal-rings', ['respiratory'], '#eef1ea', 'Cartilage rings, incomplete dorsally as Hummel et al. describe, after Cook figure 46. Their number here follows the spacing in that figure.'),
  inner('larynx', 'Larynx and epiglottis', 'larynx', ['respiratory'], '#e6e2d3', 'The thyroid and cricoid cartilages, paired arytenoids and triangular epiglottis named by Hummel et al., placed behind the hyoid. Small calcified patches in the CT at this level support the position.', [HUMMEL, COOK]),
  inner('diaphragm', 'Diaphragm', 'diaphragm', ['respiratory', 'muscular'], '#b0605a', 'A thin sheet midway between the source thoracic and abdominal labels, so its position follows this specimen while its thickness is an estimate.'),
  inner('oesophagus', 'Oesophagus', 'oesophagus', ['digestive'], '#d59a8a', 'Dorsal to the trachea and through the diaphragm to the stomach. In the neck its course follows a small tube seen in sections of the specimen.'),
  inner('tongue', 'Tongue', 'tongue', ['digestive'], '#d98a84', 'In the floor of the mouth, after Cook figure 57.'),
  inner('submandibular-glands', 'Submandibular glands', 'submandibular-glands', ['digestive'], '#dcb7a0', 'Large compact glands in the ventral neck, as Hummel et al. describe. Size and place are estimates.', [HUMMEL]),
  inner('sublingual-glands', 'Sublingual glands', 'sublingual-glands', ['digestive'], '#c99a88', 'Small flattened glands pressed against the ventral anterolateral surfaces of the submandibular glands, as Hummel et al. describe. Size and place are estimates.', [HUMMEL]),
  inner('parotid-glands', 'Parotid glands', 'parotid-glands', ['digestive'], '#e6c9ad', 'Diffuse lobulated glands extending from the ears to the clavicles, as Hummel et al. describe. The lobules are drawn with a fixed pattern, and their places are estimates.', [HUMMEL]),
  inner('nasal-cavities', 'Nasal cavities and nasopharynx', 'nasal-cavities', ['respiratory'], '#d7c6cf', 'A cavity on each side of a septum, from near the nostrils back above the palate to the pharynx. Hummel et al. describe the cavities. Their size at each level is read from colour sections of the specimen, where the passages appear dark, but the CT does not resolve them well enough to trace, so the shape is an estimate.', [HUMMEL, DIGIMOUSE]),
  inner('turbinals', 'Dorsal and lateral turbinals', 'turbinals', ['respiratory', 'skeletal'], '#e9dfc9', 'Two sets of bony ridges that reduce the size of each nasal cavity, as Hummel et al. describe. They are too fine to separate in the CT at this resolution, so they are drawn as simple ridges with estimated courses.', [HUMMEL]),
  inner('soft-palate', 'Soft palate', 'soft-palate', ['digestive', 'respiratory'], '#d99a93', 'A boneless, flexible sheet over the back of the oral cavity, as Hummel et al. describe, continuing the bony palate from where it ends in the CT. Its size is an estimate.', [HUMMEL, DIGIMOUSE]),
  inner('pharynx', 'Pharynx', 'pharynx', ['digestive', 'respiratory'], '#c98f88', 'A small chamber behind the oral cavity, common to the digestive and respiratory tracts, as Hummel et al. describe. Size and place are estimates.', [HUMMEL]),
  inner('gall-bladder', 'Gall bladder', 'gall-bladder', ['digestive'], '#8fa35a', 'On the ventral side of the source liver label, after Cook figure 61.'),
  inner('bile-ducts', 'Bile ducts', 'bile-ducts', ['digestive'], '#9fae62', 'The hepatic and cystic ducts forming the common bile duct, which crosses part of the pancreas to the duodenum, after Cook figure 61 and Hummel et al.'),
  inner('pancreatic-ducts', 'Pancreatic ducts', 'pancreatic-ducts', ['digestive'], '#e6cfa0', 'Several excretory ducts, some joining the bile duct and one entering the duodenum by itself, as Hummel et al. describe.', [HUMMEL]),
  inner('stomach-lumen', 'Stomach lumen', 'stomach-lumen', ['digestive'], '#cdb98d', 'The space inside the source stomach label, leaving a thin wall on the left and a thick wall on the right, as Hummel et al. describe. The thicknesses are estimates.', [HUMMEL]),
  inner('limiting-ridge', 'Limiting ridge of the stomach', 'limiting-ridge', ['digestive'], '#e7d8c3', 'A ridge in the wall where the two estimated regions of the source stomach label meet. Hummel et al. describe a U-shaped ridge round the entrance of the oesophagus; this one follows the estimated boundary.', [HUMMEL, COOK]),
  inner('ureters', 'Ureters and urethra', 'ureters', ['urinary'], '#e1c4a3', 'From the source kidney labels to the source bladder label, and through the pelvis above the pubic bone seen in the CT to the penis.'),
  inner('male-ducts', 'Epididymides and vasa deferentia', 'male-ducts', ['reproductive'], '#e6d6c9', 'On each source testis label, and from there to the urethra, after Cook figures 62 to 66.'),
  inner('seminal-vesicles', 'Seminal vesicles and coagulating glands', 'seminal-vesicles', ['reproductive'], '#e8d9b5', 'Curved paired glands above the bladder, after Cook figures 54 and 67.'),
  inner('prostate', 'Prostate', 'prostate', ['reproductive'], '#dcc2a8', 'At the neck of the source bladder label, after Cook figure 67.'),
  inner('preputial-glands', 'Preputial glands', 'preputial-glands', ['reproductive'], '#e6d3b0', 'Paired flat glands, lying close together beneath the skin in front of the penis, after Hummel et al. and Cook figures 54 and 63.'),
  inner('penis', 'Penis', 'penis', ['reproductive'], '#e0a99c', 'A hairpin: the body runs forward below the pubic bone to a flexure, and the glans turns back along the os penis seen in the CT, whose broad base lies forward. After Cook figures 9, 54 and 63.'),
  inner('accessory-glands', 'Bulbourethral and ampullary glands', 'accessory-glands', ['reproductive'], '#e3cfae', 'Bulbourethral glands lateral to the junction of the urethra and penis, and ampullary glands at the ends of the ductus deferens, as Hummel et al. describe.', [HUMMEL]),
  inner('left-heart-spaces', 'Spaces of the left heart', 'left-heart-spaces', ['cardiovascular'], '#c23a3f', 'The left atrium and left ventricle, inside the source heart label, leaving a thin wall to the atrium and a thick wall to the ventricle, as Hummel et al. describe. The thicknesses are estimates. The source images do not separate them.', [HUMMEL, COOK]),
  inner('right-heart-spaces', 'Spaces of the right heart', 'right-heart-spaces', ['cardiovascular'], '#54406f', 'The right atrium and right ventricle, inside the source heart label, with a wall to the ventricle thinner than that of the left, as Hummel et al. describe. The thicknesses are estimates. The source images do not separate them.', [HUMMEL, COOK]),
  inner('heart-valves', 'Heart valves', 'heart-valves', ['cardiovascular'], '#efe6d6', 'The tricuspid and bicuspid mitral valves at the boundaries of the estimated chambers, and the semilunar valves at the bases of the aorta and pulmonary artery, named by Hummel et al. Their shape is a simple sketch.', [HUMMEL]),
  inner('renal-medullae', 'Renal medullae', 'renal-medullae', ['urinary'], '#6e262e', 'A broad pyramid inside each source kidney label with its apex at the papilla towards the hilus, leaving the cortex round the convex border, as Hummel et al. describe. The source label holds both layers without a boundary.', [HUMMEL]),
  inner('renal-pelves', 'Renal pelves', 'renal-pelves', ['urinary'], '#e2c9a6', 'A funnel round each papilla that narrows towards the ureter, as Hummel et al. describe.', [HUMMEL]),
  inner('bladder-lumen', 'Bladder lumen', 'bladder-lumen', ['urinary'], '#e9dd9f', 'The space inside the source bladder label. The thickness of the wall is an estimate.', [HUMMEL]),
  inner('brown-fat', 'Brown fat', 'brown-fat', ['integumentary', 'endocrine'], '#b77f4f', 'Lobes at the sites named by Hummel et al.: between the scapulae, in the axillae, along the jugular veins, near the thymus, along the thoracic aorta, at the hilus of the kidney and beside the urethra. Traced fat may overlap them.', [HUMMEL]),
  inner('brain-ventricles', 'Ventricles of the brain', 'brain-ventricles', ['nervous'], '#cfe0e6', 'Lateral, third and fourth ventricles with the cerebral aqueduct, placed on the source brain labels after the description of the rat.', [GREENE]),
  inner('olfactory-nerves', 'Olfactory nerves', 'olfactory-nerves', ['nervous'], '#e9d98f', 'From the nose to the olfactory bulb, simplified.', [GREENE]),
  inner('oculomotor-nerves', 'Oculomotor nerves', 'oculomotor-nerves', ['nervous'], '#e9d98f', 'From the midbrain to the muscles of the eye, simplified.', [GREENE]),
  inner('trochlear-nerves', 'Trochlear nerves', 'trochlear-nerves', ['nervous'], '#e9d98f', 'From the back of the midbrain to a muscle of the eye, simplified.', [GREENE]),
  inner('abducens-nerves', 'Abducens nerves', 'abducens-nerves', ['nervous'], '#e9d98f', 'From the brain stem to a muscle of the eye, simplified.', [GREENE]),
  inner('vestibulocochlear-nerves', 'Vestibulocochlear nerves', 'vestibulocochlear-nerves', ['nervous'], '#e9d98f', 'From the brain stem to the inner ear, simplified.', [GREENE]),
  inner('glossopharyngeal-nerves', 'Glossopharyngeal nerves', 'glossopharyngeal-nerves', ['nervous'], '#e9d98f', 'From the brain stem to the throat, simplified.', [GREENE]),
  inner('accessory-nerves', 'Accessory nerves', 'accessory-nerves', ['nervous'], '#e9d98f', 'From the brain stem down the neck to the sternomastoid and trapezius, simplified.', [GREENE]),
  inner('hypoglossal-nerves', 'Hypoglossal nerves', 'hypoglossal-nerves', ['nervous'], '#e9d98f', 'From the brain stem to the tongue, simplified.', [GREENE]),
  inner('adrenal-medullae', 'Adrenal medullae', 'adrenal-medullae', ['endocrine'], '#8c5a3c', 'The inner part of each source adrenal label, leaving a cortex round it. Hummel et al. describe the gland as two parts, cortex and medulla. The depth of the cortex is an estimate.', [HUMMEL]),
  inner('parathyroids', 'Parathyroid glands', 'parathyroids', ['endocrine'], '#c9a26b', 'One near the dorsolateral border of each thyroid lobe, the usual arrangement in Hummel et al., who add that their number and position vary.', [HUMMEL]),
  inner('pineal', 'Pineal gland', 'pineal', ['endocrine', 'nervous'], '#d9b48f', 'A very small cone on the dorsal surface of the brain between cerebrum and cerebellum, as Hummel et al. describe.', [HUMMEL]),
  inner('middle-ears', 'Ear canals, tympanic membranes and ossicles', 'middle-ears', ['sensory'], '#e8dcc2', 'An ear canal from the external auditory meatus seen in the CT, a tympanic membrane in the tympanic bulla and a chain of three ossicles towards the cochlea. Cook figures 12 and 13 show the meatus and bulla; the middle ear itself follows the description of the rat, and its small bones are not resolved in this CT.', [COOK, GREENE]),
  inner('mammary-arteries', 'Internal mammary arteries', 'mammary-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Beside the sternum on each side, after Cook figures 91 and 95.', [COOK]),
  inner('mammary-veins', 'Internal mammary veins', 'mammary-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Beside the internal mammary arteries, after Cook figures 91 and 95.', [COOK]),
  inner('thyroid', 'Thyroid', 'thyroid', ['endocrine'], '#b0564f', 'Two lobes beside the trachea joined by an isthmus, after Cook figures 46 and 47.'),
  inner('thymus', 'Thymus', 'thymus', ['endocrine', 'immune', 'lymphatic'], '#ece0cf', 'Two lobes over the base of the source heart label, after Cook figures 46 and 92.'),
  inner('pituitary', 'Pituitary', 'pituitary', ['endocrine'], '#d8b18d', 'Under the source brain label.', [GREENE]),
  inner('cervical-lymph-nodes', 'Cervical lymph nodes', 'cervical-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('axillary-lymph-nodes', 'Axillary lymph nodes', 'axillary-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('brachial-lymph-nodes', 'Brachial lymph nodes', 'brachial-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('inguinal-lymph-nodes', 'Inguinal lymph nodes', 'inguinal-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('sciatic-lymph-nodes', 'Sciatic lymph nodes', 'sciatic-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('mediastinal-lymph-nodes', 'Mediastinal lymph nodes', 'mediastinal-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('pyloric-lymph-nodes', 'Pyloric lymph nodes', 'pyloric-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('renal-lymph-nodes', 'Renal lymph nodes', 'renal-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('lumbar-lymph-nodes', 'Lumbar lymph nodes', 'lumbar-lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('mesenteric-lymph-node', 'Mesenteric lymph node', 'mesenteric-lymph-node', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  inner('caudal-lymph-node', 'Caudal lymph node', 'caudal-lymph-node', ['lymphatic', 'immune'], '#8d6a8c', 'At a site listed by Hummel et al. Each is an estimated body at the described location.', [HUMMEL]),
  ...([
    ['pericardium', 'Pericardium', ['cardiovascular'], '#e8d6cf', 'Round the source heart label.', 4, 2, 1],
    ['pleura', 'Pleura', ['respiratory'], '#e8d6cf', 'Round the source lung label.', 3, 2, 1],
    ['meninges', 'Meninges', ['nervous'], '#e8d6cf', 'Round the source brain labels.', 3, 2, 1],
    ['peritoneum', 'Peritoneum', ['digestive'], '#e8d6cf', 'At the edge of the mask of the abdominal cavity used in tracing.', 0, 4, 2],
  ] as const).map(([id, name, systems, color, note, grow, step, radius]): StructurePlan => ({
    id: `living:${id}`, name, systems: [...systems], sourceLabel: 'none, simulated', evidence: 'simulated', scale: 'organ', color, defaultOpacity: 0.16,
    description: `Simulated. A thin membrane, drawn as a faint surface. ${note} Its distance from the label and its form are estimates, and it is not measured. ${POSTURE}`,
    basis: [COOK], plan: { kind: 'shell', membrane: id, grow, step, radius },
  })),
  inner('lymph-vessels', 'Thoracic duct and lymph trunks', 'lymph-vessels', ['lymphatic', 'immune'], '#b58fb0', 'Trunks joining the lymph node sites listed by Hummel et al. to a thoracic duct that ends at the left venous angle. The routes are estimates.', [HUMMEL, GREENE]),
  inner('cerebral-base', 'Basilar artery and arterial circle', 'cerebral-base', ['cardiovascular', 'arterial-venous', 'nervous'], '#c8333a', 'The vertebral and basilar arteries and a ring at the base of the brain, after Cook figures 87 and 88.'),
  inner('incisors', 'Incisors', 'incisors', ['digestive'], '#e6bd62', 'Upper and lower incisors in the jaws seen in the CT, after Cook figures 11 to 15. The CT does not separate teeth from bone.'),
  inner('molars', 'Molars', 'molars', ['digestive'], '#efe7d3', 'Three molars in each quarter of the jaw, after Cook figures 11 to 15. The CT does not separate teeth from bone.'),
  inner('root-ganglia', 'Dorsal root ganglia', 'root-ganglia', ['nervous'], '#e2cf8a', 'A ganglion on each dorsal root, at the levels of the spinal nerves.', [HUMMEL, GREENE]),
  inner('sympathetic-trunks', 'Sympathetic trunks', 'sympathetic-trunks', ['nervous'], '#dcc87e', 'Beaded chains beside the vertebral column.', [GREENE]),
  inner('inner-ears', 'Cochleae and semicircular canals', 'inner-ears', ['sensory', 'nervous'], '#e7dcc4', 'A coiled tube and three loops in each temporal region. Only their rough position is estimated.', [GREENE]),
  inner('intervertebral-discs', 'Intervertebral discs', 'intervertebral-discs', ['skeletal'], '#d5e1dc', 'A disc in each gap between vertebrae in the CT, except between the atlas and axis and between fused sacral vertebrae. Discs are not visible in this CT, so their size follows the gap and the width of the column.', [OCONNELL, COOK]),
  inner('xiphoid-cartilage', 'Xiphoid cartilage', 'xiphoid-cartilage', ['skeletal'], '#dbe5df', 'A thin rounded plate at the end of the xiphisternum, after Cook figures 30 and 32. Cartilage is not visible in this CT.', [COOK]),
  inner('intercostal-arteries', 'Intercostal arteries', 'intercostal-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Vessels along the caudal border of each rib from the second back, after Cook figure 95: from the fifth rib they leave the aorta, and the second to fourth are supplied by a highest intercostal artery. Each follows the course of its rib measured in the CT, offset by an estimate.', [COOK]),
  inner('intercostal-veins', 'Intercostal veins', 'intercostal-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Veins beside the intercostal arteries, after Cook figures 95 and 96, joining the azygos vein from the fifth rib back. Each follows the course of its rib measured in the CT, offset by an estimate.', [COOK]),
  simulated('eyelids', 'Eyelids', 'eyelids', ['integumentary', 'sensory'], '#3f3029', 'A dark rim round the visible part of each globe.'),
  simulated('eyes', 'Eyes', 'eyes', ['sensory'], '#17110f', 'Dark globes placed at the source eye label, sized to bulge through the eyelids as in the living animal.'),
  { ...simulated('corneas', 'Corneas', 'corneas', ['sensory'], '#dfe9ee', 'A clear cap on each globe. Fuller and Wimer state that the cornea covers about half the surface of the eyeball.'), defaultOpacity: 0.18, basis: [FULLER] },
  { ...simulated('irises', 'Irises', 'irises', ['sensory'], '#3a2a22', 'A ring inside each globe, in front of the lens. Its size is an estimate.'), exterior: false, basis: [FULLER] },
  { ...simulated('extraocular-muscles', 'Muscles of the eye', 'extraocular-muscles', ['muscular', 'sensory'], '#a8443c', 'Four rectus muscles, two oblique muscles and a retractor bulbi round each globe. Marques et al. name rectus, oblique and retractor bulbi muscles in the mouse. Four and two are the usual mammalian numbers, which those sources were not read to confirm. Courses and sizes are estimates.'), exterior: false, basis: [MARQUES, STUELSATZ] },
  { ...simulated('calcaneal-tendons', 'Calcaneal (Achilles) tendons', 'calcaneal-tendons', ['muscular'], '#e6dfcf', 'A tendon from the gastrocnemius to the heel on each side. Sakabe et al. work on this tendon in adult mice and describe tendon as carrying force from muscle to bone. Its course and size are estimates.'), exterior: false, basis: [SAKABE, COOK] },
  { ...simulated('lenses', 'Lenses', 'lenses', ['sensory'], '#e9e4cf', 'Inside each globe. Fuller and Wimer state that the lens nearly fills the globe and is almost spherical.'), exterior: false, basis: [FULLER] },
  { ...simulated('retinas', 'Retinas and choroid', 'retinas', ['sensory', 'nervous'], '#6a2f2c', 'A dark inner coat of each globe. Its thickness is an estimate.'), exterior: false, basis: [FULLER] },
  { ...simulated('harderian-glands', 'Harderian glands', 'harderian-glands', ['sensory'], '#c58a7a', 'A large horseshoe-shaped gland deep in each orbit, as Hummel et al. describe. The source label named lachrymal glands lies in the same region and is not divided from it.'), exterior: false, basis: [HUMMEL] },
  { ...simulated('intraorbital-glands', 'Intraorbital lacrimal glands', 'intraorbital-glands', ['sensory'], '#d7b3a4', 'At the outer corner of each eye, as Hummel et al. describe.'), exterior: false, basis: [HUMMEL] },
  simulated('pinnae', 'Ear pinnae', 'pinnae', ['integumentary', 'sensory'], '#e7a99b', 'Thin cupped pinnae placed at the ear canals, shaped after Cook figures 4 and 5, with a dark opening low on the front of the bowl. Their fine hair and colour are display estimates.'),
  simulated('nose', 'Nose pad', 'nose', ['integumentary', 'respiratory'], '#d98a84', 'The bare rhinarium at the tip of the snout, with nostrils and a groove down its middle.'),
  simulated('lips', 'Mouth line', 'lips', ['integumentary', 'digestive'], '#2f2422', 'A dark line along the lip, on the side of the snout, as drawn in Cook figure 5. The source images do not separate the lips.'),
  simulated('vibrissae', 'Vibrissae', 'vibrissae', ['integumentary', 'sensory'], '#6a5a4c', 'The mystacial, superciliary, genal, submental and interramal whisker groups named by Cook, with counts and lengths chosen by eye.'),
  simulated('forepaws', 'Fore paws', 'forepaws', ['integumentary'], '#eab2a4', 'Four digits and a pollex, with walking pads, after Cook. Real digit bones from the CT lie inside. The fine hair on the back of the paw is a display estimate.'),
  simulated('hindpaws', 'Hind paws', 'hindpaws', ['integumentary'], '#eab2a4', 'Five digits with walking pads, after Cook, because the source images end at the hind feet. The fine hair on the back of the paw is a display estimate.'),
  simulated('claws', 'Claws', 'claws', ['integumentary'], '#d9cdb9', 'Claws on the digits and a flattened nail on the pollex, after Cook.'),
  simulated('tail', 'Tail', 'tail', ['integumentary'], '#e3a896', 'A ringed tail continuing the short length of tail in the source images, with a length chosen to match the body as drawn by Cook. Its sparse hair is a display estimate.'),
  { ...simulated('tail-vessels', 'Middle caudal artery and vein in the tail', 'tail-vessels', ['cardiovascular', 'arterial-venous'], '#b5394f', 'The middle caudal vessels, which Hummel et al. say continue the course of the aorta into the tail, under the simulated tail vertebrae. Cook figure 117 shows their origin.'), exterior: false, basis: [HUMMEL, COOK] },
  simulated('openings', 'Anus and preputial opening', 'openings', ['integumentary', 'digestive', 'reproductive'], '#3d2a29', 'A dark ring at each opening on the body surface, after Cook figure 9. Sections of the specimen place the anal canal, and the os penis in the CT places the tip of the penis.'),
  { ...simulated('tail-vertebrae', 'Caudal vertebrae beyond the scan', 'tail-vertebrae', ['skeletal'], '#ddd4c0', 'Twenty-three shafts along the simulated tail, which with the five vertebrae in the CT make the 28 caudal vertebrae within the 27 to 30 counted by Hummel et al.'), exterior: false, basis: [COOK, HUMMEL] },
  { ...simulated('patellae', 'Patellae and medial fabellae', 'patellae', ['skeletal'], '#ddd4c0', 'A patella in front of each knee and a small medial fabella behind it, after Cook figure 41. The CT does not separate them from the femur and tibia in this specimen.'), exterior: false, basis: [COOK] },
  { ...simulated('paw-arteries', 'Arteries of the paws and digits', 'paw-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'One along each digit from the middle of the paw, on the side of the sole. These are simple courses, and they are not divided into named arteries.'), basis: [GREENE, KOCHI] },
  { ...simulated('paw-veins', 'Veins of the paws and digits', 'paw-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'One along each digit from the middle of the paw, beside the artery. These are simple courses.'), basis: [GREENE] },
  { ...simulated('paw-nerves', 'Nerves of the paws and digits', 'paw-nerves', ['nervous'], '#e9d98f', 'One along each digit from the middle of the paw, beside the vessels. These are simple courses, and they are not divided into named nerves.'), basis: [GREENE] },
  { ...simulated('foot-bones', 'Hind foot bones beyond the scan', 'foot-bones', ['skeletal'], '#ddd4c0', 'Tarsals, metatarsals and phalanges by the counts in Hummel et al., drawn as simple shafts, because the source images end at the hind feet.'), exterior: false, basis: [COOK, HUMMEL] },
];
