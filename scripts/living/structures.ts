/** The inventory of the living mouse reference. Every structure declares its evidence. */
import type { InternalPart } from './internal';
import { MUSCLES } from './muscles';
import { BONES } from './bones';
import type { TreePart } from './organ-trees';
export type Evidence = 'source' | 'traced' | 'simulated';

export type Plan =
  | { readonly kind: 'skin' }
  | { readonly kind: 'bone'; readonly index: number }
  | { readonly kind: 'tree'; readonly part: TreePart }
  | { readonly kind: 'shell'; readonly membrane: 'pericardium' | 'pleura' | 'meninges' | 'peritoneum'; readonly grow: number; readonly step: number; readonly radius: number }
  | { readonly kind: 'labels'; readonly labels: readonly number[]; readonly step?: number; readonly radius?: number }
  | { readonly kind: 'label-part'; readonly label: number; readonly seeds: readonly (readonly [number, number, number])[]; readonly index: number | readonly number[]; readonly lowX?: number; readonly highX?: number }
  | { readonly kind: 'gut-part'; readonly part: 'caecum' | 'colon' | 'small' }
  | { readonly kind: 'traced'; readonly tissue: 'gut' | 'blood' | 'fat' | 'muscle' | 'airway'; readonly step: number; readonly radius: number; readonly grow?: number }
  | { readonly kind: 'attachment'; readonly part: AttachmentPart }
  | { readonly kind: 'internal'; readonly part: InternalPart }
  | { readonly kind: 'muscle'; readonly index: number }
  | { readonly kind: 'muscle-rest' };

export type AttachmentPart = 'eyes' | 'eyelids' | 'pinnae' | 'nose' | 'vibrissae' | 'forepaws' | 'hindpaws' | 'claws' | 'tail' | 'tail-vertebrae' | 'foot-bones';

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
const COOK = 'Cook MJ. The Anatomy of the Laboratory Mouse. Academic Press, 1965; web edition at https://www.informatics.jax.org/cookbook/';
const DIGIMOUSE = 'Dogdas B, Stout D, Chatziioannou AF, Leahy RM. Digimouse: a 3D whole body mouse atlas from CT and cryosection data. Phys Med Biol 2007. doi:10.1088/0031-9155/52/3/003';
const POSTURE = 'Moved to the simulated standing posture by rotating limb segments about joints read from the source CT.';

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
const HEART: readonly (readonly [number, number, number])[] = [[158, 372, 82], [212, 374, 90], [165, 415, 62], [205, 425, 72]];
const CHAMBER = 'Its boundaries with the other chambers are estimated, after Cook figures 89 to 91; the chambers inside are not modelled.';
const LUNG_R: readonly (readonly [number, number, number])[] = [[140, 385, 105], [122, 420, 80], [135, 455, 125], [162, 450, 85]];
const LOBE = 'The lobes are named in Cook figure 90; their boundaries are estimated.';
const LIVER: readonly (readonly [number, number, number])[] = [[140, 480, 45], [235, 500, 85], [95, 540, 110], [190, 590, 135]];
const LIVER_LOBE = 'The lobes are named in Cook figure 60; their boundaries are estimated.';
const STOMACH: readonly (readonly [number, number, number])[] = [[262, 520, 135], [210, 552, 105]];
const STOMACH_REGION = 'The regions are named in Cook figure 59; their boundary is estimated.';
const MIDDLE_X = 172;
const BRAIN_REST: readonly (readonly [number, number, number])[] = [[189, 165, 105], [189, 215, 118], [189, 208, 94], [160, 225, 135], [218, 225, 135], [189, 243, 132], [189, 246, 110]];
const BRAIN_PART = 'The source label "rest of the brain" holds all of these parts together; their boundaries are estimated from seeds placed by hand after Greene, which describes the rat.';

const traced = (id: string, name: string, tissue: 'gut' | 'blood' | 'fat' | 'muscle' | 'airway', systems: string[], color: string, description: string, step = 2, radius = 1, grow?: number): StructurePlan => ({
  id: `living:${id}`, name, systems, sourceLabel: 'none, traced from the source images', evidence: 'traced', scale: 'organ', color,
  description: `Traced by automatic colour and density rules in the coregistered source photographs and CT, inside the residual label that the source leaves unsegmented. ${description} Not reviewed by an anatomist. ${POSTURE}`,
  basis: [DIGIMOUSE], plan: { kind: 'traced', tissue, step, radius, grow },
});

const CHARLES = 'Charles JP, Cappellari O, Spence AJ, Hutchinson JR, Wells DJ. Musculoskeletal geometry, muscle architecture and functional specialisations of the mouse hindlimb. PLoS One 2016;11(4):e0147669. doi:10.1371/journal.pone.0147669';
const MUSCLE_TONES = ['#a5524a', '#ad5a50', '#9c4c46', '#b0605a', '#a14f4f', '#a85649'];
const GREENE = 'Greene EC. Anatomy of the Rat. Transactions of the American Philosophical Society, New Series, vol. 27. 1935. This describes the rat, not the mouse.';
const inner = (id: string, name: string, part: InternalPart, systems: string[], color: string, description: string, basis: readonly string[] = [COOK, HUMMEL]): StructurePlan => ({
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
    description: `The outer surface of the union of all Digimouse labels, carried into the stance and smoothed. ${POSTURE} The lower hind legs are simulated shapes whose radii are measured from the leg tissue, because the scanned shanks lay pressed flat and the images end at the hind feet. The fur drawn on the surface is simulated, because the specimen is a nude mouse.`,
    basis: [DIGIMOUSE, COOK], plan: { kind: 'skin' },
  },
  ...BONES.map((bone, index): StructurePlan => ({
    id: `living:bone-${bone.id}`, name: bone.name, systems: ['skeletal'], sourceLabel: 'CT bone', evidence: 'traced', division: 'estimated', scale: 'organ', color: '#e9e2d2',
    description: `An isosurface of the source CT near the source skeleton label, which also shows the digits that the label crops. Its division from neighbouring bones and its name are estimates, by the nearest course placed by hand on measured joints. ${bone.note} ${POSTURE}`,
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
  inner('head-arteries', 'Innominate and carotid arteries', 'head-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Arch branches in the order drawn by Cook: innominate, left common carotid, left subclavian, with carotid divisions at the head.'),
  inner('forelimb-arteries', 'Subclavian and fore limb arteries', 'forelimb-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The subclavian, axillary and brachial course to the wrist.'),
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
  inner('visceral-arteries', 'Coeliac, mesenteric, renal and genital arteries', 'visceral-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Abdominal branches in the order given by Hummel et al.: coeliac, superior mesenteric, renal, genital and inferior mesenteric.'),
  inner('hindlimb-arteries', 'Iliac, hind limb and median caudal arteries', 'hindlimb-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the aortic bifurcation to the ankles, and the median artery towards the tail.'),
  inner('caudal-vena-cava', 'Inferior vena cava', 'caudal-vena-cava', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'To the right of the vertebral column and aorta as stated by Hummel et al., passing through the liver to the right atrium. Traced blood-filled lumens lie around the same course.'),
  inner('cranial-veins', 'Superior venae cavae, jugular and azygos veins', 'cranial-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Two superior venae cavae, right and left, each formed by jugular and subclavian veins, as drawn by Cook.'),
  inner('forelimb-veins', 'Fore limb veins', 'forelimb-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Veins alongside the fore limb arteries.'),
  inner('hindlimb-veins', 'Iliac and hind limb veins', 'hindlimb-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'Veins alongside the hind limb arteries.'),
  inner('portal-veins', 'Hepatic portal, hepatic and renal veins', 'portal-veins', ['cardiovascular', 'arterial-venous'], '#3f5a9a', 'The portal system draining the gut to the liver, with hepatic and renal veins.'),
  inner('spinal-cord', 'Spinal cord', 'spinal-cord', ['nervous'], '#efe4cf', 'Its course follows the vertebral canal measured in the source CT; its radius is an estimate, with cervical and lumbar enlargements.', [DIGIMOUSE, GREENE]),
  inner('spinal-nerves', 'Spinal nerves', 'spinal-nerves', ['nervous'], '#e9d98f', 'Paired nerves at cervical, thoracic, lumbar and sacral levels, counted from the vertebral formula in Hummel et al.', [HUMMEL, GREENE]),
  inner('forelimb-nerves', 'Brachial plexus and fore limb nerves', 'forelimb-nerves', ['nervous'], '#e9d98f', 'Roots from the lower neck joining a plexus at the shoulder, with radial, median and ulnar courses.', [GREENE]),
  inner('hindlimb-nerves', 'Lumbosacral plexus, sciatic and femoral nerves', 'hindlimb-nerves', ['nervous'], '#e9d98f', 'Roots joining a plexus at the hip; the sciatic nerve divides above the knee, and the femoral nerve runs in front of the thigh.', [GREENE]),
  inner('vagus-phrenic', 'Vagus and phrenic nerves', 'vagus-phrenic', ['nervous'], '#e9d98f', 'The vagus beside the carotid artery and oesophagus to the stomach, and the phrenic nerve to the diaphragm.', [COOK, GREENE]),
  inner('cranial-nerves', 'Optic, trigeminal and facial nerves', 'cranial-nerves', ['nervous'], '#e9d98f', 'Selected cranial nerves: the optic nerves to their chiasm, the three trigeminal divisions and the facial nerve. Others are not drawn.', [GREENE]),
  inner('trachea', 'Larynx, trachea and bronchi', 'trachea', ['respiratory'], '#dfe6e0', 'A ringed trachea ventral to the oesophagus, dividing into main and lobar bronchi towards the source lung label.'),
  inner('diaphragm', 'Diaphragm', 'diaphragm', ['respiratory', 'muscular'], '#b0605a', 'A thin sheet midway between the source thoracic and abdominal labels, so its position follows this specimen while its thickness is an estimate.'),
  inner('oesophagus', 'Oesophagus', 'oesophagus', ['digestive'], '#d59a8a', 'Dorsal to the trachea and through the diaphragm to the stomach.'),
  inner('tongue', 'Tongue', 'tongue', ['digestive'], '#d98a84', 'In the floor of the mouth, after Cook figure 57.'),
  inner('salivary-glands', 'Salivary glands', 'salivary-glands', ['digestive'], '#dcb7a0', 'The three pairs named by Hummel et al.: parotid, submandibular and sublingual.'),
  inner('gall-bladder', 'Gall bladder', 'gall-bladder', ['digestive'], '#8fa35a', 'On the ventral side of the source liver label, after Cook figure 61.'),
  inner('ureters', 'Ureters and urethra', 'ureters', ['urinary'], '#e1c4a3', 'From the source kidney labels to the source bladder label, and on to the penis.'),
  inner('male-ducts', 'Epididymides and vasa deferentia', 'male-ducts', ['reproductive'], '#e6d6c9', 'On each source testis label, and from there to the urethra, after Cook figures 62 to 66.'),
  inner('seminal-vesicles', 'Seminal vesicles and coagulating glands', 'seminal-vesicles', ['reproductive'], '#e8d9b5', 'Curved paired glands above the bladder, after Cook figures 54 and 67.'),
  inner('prostate', 'Prostate', 'prostate', ['reproductive'], '#dcc2a8', 'At the neck of the source bladder label, after Cook figure 67.'),
  inner('preputial-glands', 'Preputial glands', 'preputial-glands', ['reproductive'], '#e6d3b0', 'Paired flat glands beneath the skin before the penis, after Cook figure 54.'),
  inner('penis', 'Penis', 'penis', ['reproductive'], '#e0a99c', 'After Cook figures 9 and 54.'),
  inner('thyroid', 'Thyroid', 'thyroid', ['endocrine'], '#b0564f', 'Two lobes beside the trachea joined by an isthmus, after Cook figures 46 and 47.'),
  inner('thymus', 'Thymus', 'thymus', ['endocrine', 'immune', 'lymphatic'], '#ece0cf', 'Two lobes over the base of the source heart label, after Cook figures 46 and 92.'),
  inner('pituitary', 'Pituitary', 'pituitary', ['endocrine'], '#d8b18d', 'Under the source brain label.', [GREENE]),
  inner('lymph-nodes', 'Lymph nodes', 'lymph-nodes', ['lymphatic', 'immune'], '#8d6a8c', 'Bodies at the sites listed by Hummel et al.: cervical, axillary, brachial, inguinal, sciatic, mediastinal, pyloric, renal, lumbar, mesenteric and caudal.', [HUMMEL]),
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
  simulated('eyelids', 'Eyelids', 'eyelids', ['integumentary', 'sensory'], '#3f3029', 'A dark rim round the visible part of each globe.'),
  simulated('eyes', 'Eyes', 'eyes', ['sensory'], '#17110f', 'Dark globes placed at the source eye label, sized to bulge through the eyelids as in the living animal.'),
  simulated('pinnae', 'Ear pinnae', 'pinnae', ['integumentary', 'sensory'], '#e7a99b', 'Thin cupped pinnae placed at the ear canals, shaped after the plates of Cook.'),
  simulated('nose', 'Nose pad', 'nose', ['integumentary', 'respiratory'], '#d98a84', 'The bare rhinarium at the tip of the snout.'),
  simulated('vibrissae', 'Vibrissae', 'vibrissae', ['integumentary', 'sensory'], '#6a5a4c', 'The mystacial, superciliary, genal, submental and interramal whisker groups named by Cook, with counts and lengths chosen by eye.'),
  simulated('forepaws', 'Fore paws', 'forepaws', ['integumentary'], '#eab2a4', 'Four digits and a pollex, with walking pads, after Cook. Real digit bones from the CT lie inside.'),
  simulated('hindpaws', 'Hind paws', 'hindpaws', ['integumentary'], '#eab2a4', 'Five digits with walking pads, after Cook, because the source images end at the hind feet.'),
  simulated('claws', 'Claws', 'claws', ['integumentary'], '#d9cdb9', 'Claws on the digits and a flattened nail on the pollex, after Cook.'),
  simulated('tail', 'Tail', 'tail', ['integumentary'], '#e3a896', 'A ringed tail continuing the short length of tail in the source images, with a length chosen to match the body as drawn by Cook.'),
  { ...simulated('tail-vertebrae', 'Caudal vertebrae beyond the scan', 'tail-vertebrae', ['skeletal'], '#e9e2d2', 'Twenty shafts along the simulated tail, which with the vertebrae in the CT approach the 27 to 30 caudal vertebrae counted by Hummel et al.'), exterior: false, basis: [COOK, HUMMEL] },
  { ...simulated('foot-bones', 'Hind foot bones beyond the scan', 'foot-bones', ['skeletal'], '#e9e2d2', 'Tarsals, metatarsals and phalanges by the counts in Hummel et al., drawn as simple shafts, because the source images end at the hind feet.'), exterior: false, basis: [COOK, HUMMEL] },
];
