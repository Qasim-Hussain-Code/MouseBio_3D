/** The inventory of the living mouse reference. Every structure declares its evidence. */
import type { InternalPart } from './internal';
export type Evidence = 'source' | 'traced' | 'simulated';

export type Plan =
  | { readonly kind: 'skin' }
  | { readonly kind: 'ct-bone'; readonly threshold: number }
  | { readonly kind: 'labels'; readonly labels: readonly number[]; readonly step?: number; readonly radius?: number }
  | { readonly kind: 'traced'; readonly tissue: 'gut' | 'blood' | 'fat' | 'muscle' | 'airway'; readonly step: number; readonly radius: number; readonly grow?: number }
  | { readonly kind: 'attachment'; readonly part: AttachmentPart }
  | { readonly kind: 'internal'; readonly part: InternalPart };

export type AttachmentPart = 'eyes' | 'pinnae' | 'nose' | 'vibrissae' | 'forepaws' | 'hindpaws' | 'claws' | 'tail' | 'tail-vertebrae' | 'foot-bones';

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

const traced = (id: string, name: string, tissue: 'gut' | 'blood' | 'fat' | 'muscle' | 'airway', systems: string[], color: string, description: string, step = 2, radius = 1, grow?: number): StructurePlan => ({
  id: `living:${id}`, name, systems, sourceLabel: 'none, traced from the source images', evidence: 'traced', scale: 'organ', color,
  description: `Traced by automatic colour and density rules in the coregistered source photographs and CT, inside the residual label that the source leaves unsegmented. ${description} Not reviewed by an anatomist. ${POSTURE}`,
  basis: [DIGIMOUSE], plan: { kind: 'traced', tissue, step, radius, grow },
});

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
  {
    id: 'living:skeleton', name: 'Skeleton', systems: ['skeletal'], sourceLabel: 'CT bone', evidence: 'traced', scale: 'organ', color: '#e9e2d2',
    description: `An isosurface of the source CT, which shows the digits that the source skeleton label crops. Bones are not separated by name. ${POSTURE}`,
    basis: [DIGIMOUSE], plan: { kind: 'ct-bone', threshold: 172 },
  },
  labelled('cerebrum', 'External cerebrum', 7, 'external cerebrum', ['nervous'], '#dcc0ba'),
  labelled('striatum', 'Striatum', 8, 'striatum', ['nervous'], '#d3b0ab'),
  labelled('brain-rest', 'Rest of the brain', 10, 'rest of the brain', ['nervous'], '#d6b7b3'),
  labelled('cerebellum', 'Cerebellum', 5, 'cerebellum', ['nervous'], '#cfa89f'),
  labelled('medulla', 'Medulla', 4, 'medulla', ['nervous'], '#d9bdb4'),
  labelled('olfactory', 'Olfactory bulbs', 6, 'olfactory bulbs', ['nervous'], '#e1c6b8'),
  labelled('heart', 'Heart', 9, 'heart', ['cardiovascular'], '#a7343b'),
  labelled('lungs', 'Lungs', 21, 'lungs', ['respiratory'], '#d4877f'),
  labelled('liver', 'Liver', 18, 'liver', ['digestive'], '#7d3330'),
  labelled('stomach', 'Stomach', 15, 'stomach', ['digestive'], '#c98a73'),
  labelled('spleen', 'Spleen', 16, 'spleen', ['lymphatic', 'immune'], '#5f2b45'),
  labelled('pancreas', 'Pancreas', 17, 'pancreas', ['digestive', 'endocrine'], '#dfb88a'),
  labelled('kidneys', 'Kidneys', 19, 'kidneys', ['urinary'], '#8f3b3b'),
  labelled('adrenals', 'Adrenal glands', 20, 'adrenal glands', ['endocrine'], '#e0b86d', 1),
  labelled('bladder', 'Bladder', 13, 'bladder', ['urinary'], '#d9a98f'),
  labelled('testes', 'Testes', 14, 'testis', ['reproductive'], '#e3cfc8'),
  labelled('masseter', 'Masseter muscles', 11, 'masseter muscles', ['muscular'], '#9c4d47'),
  labelled('lachrymal', 'Lachrymal glands', 12, 'lachrymal glands', ['sensory'], '#d7b3a4'),
  traced('muscles', 'Skeletal muscle', 'muscle', ['muscular'], '#a5524a', 'Red tissue of muscle density outside the abdominal cavity, including the trunk, neck and limbs. Individual muscles are not separated or named.', 3, 1),
  traced('intestines', 'Intestines', 'gut', ['digestive'], '#c7a071', 'Yellow-green and tan gut contents and wall within the abdominal cavity, closed slightly to include the wall. Loops are not separated into named segments.', 2, 1, 2),
  traced('veins', 'Blood-filled vessels', 'blood', ['cardiovascular', 'arterial-venous'], '#47202f', 'Very dark blood-filled lumens, mainly large veins such as the caudal vena cava and jugular veins. Arteries are empty after death and do not appear.', 2, 1),
  traced('fat', 'Adipose and connective tissue', 'fat', ['integumentary'], '#ecdcae', 'Tissue of low CT density or pale colour, such as the fat pads around the testes and under the skin.', 2, 1),
  traced('airways', 'Air spaces', 'airway', ['respiratory'], '#cfe3e8', 'Voxels of very low CT density, such as the nasal passages and gas in the gut.', 2, 1),
  inner('aorta', 'Aorta', 'aorta', ['cardiovascular', 'arterial-venous'], '#c8333a', 'From the left ventricle it ascends, arches to the left and descends along the ventral side of the vertebral column to its bifurcation.'),
  inner('head-arteries', 'Innominate and carotid arteries', 'head-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'Arch branches in the order drawn by Cook: innominate, left common carotid, left subclavian, with carotid divisions at the head.'),
  inner('forelimb-arteries', 'Subclavian and fore limb arteries', 'forelimb-arteries', ['cardiovascular', 'arterial-venous'], '#c8333a', 'The subclavian, axillary and brachial course to the wrist.'),
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
