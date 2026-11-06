/**
 * A continuous zoom from the skin of the mouse towards the smallest known structure. It is a separate, representative view and is not part of any anatomical reference.
 * The measured data of the specimen end at about 0.1 mm, and magnification does not create detail, so nothing shown here comes from that specimen.
 * Every level declares what kind of knowledge it shows and on what it is based.
 */
export type JourneyEvidence = 'simulated' | 'measured-elsewhere' | 'calculated' | 'schematic';

export interface JourneyLevel {
  readonly id: string;
  readonly name: string;
  /** The length that one unit of the level's scene stands for, in metres. */
  readonly referenceMetres: number;
  /** The widest and narrowest view at which the level is shown, in metres of view height. */
  readonly startMetres: number;
  readonly endMetres: number;
  readonly evidence: JourneyEvidence;
  readonly caption: string;
  readonly basis: readonly string[];
}

export const JOURNEY_NOTICE = 'Data from this specimen end at about 0.1 mm. Everything in this view is representative and was not seen in this mouse.';

export const EVIDENCE_LABEL: Readonly<Record<JourneyEvidence, string>> = Object.freeze({
  simulated: 'Simulated from published descriptions',
  'measured-elsewhere': 'Measured in a crystal, not in this specimen',
  calculated: 'Calculated from a model of the atom',
  schematic: 'Schematic, with no positions to measure',
});

const HUMMEL = 'Hummel KP, Richardson FL, Fekete E. Anatomy. In: Green EL, ed. Biology of the Laboratory Mouse. 2nd ed. McGraw-Hill, 1966; web edition at https://www.informatics.jax.org/greenbook/';
const SIMPSON = 'Simpson CL, Patel DM, Green KJ. Deconstructing the skin: cytoarchitectural determinants of epidermal morphogenesis. Nat Rev Mol Cell Biol 2011;12(9):565-80. doi:10.1038/nrm3175';
const BECK = 'Beck M, Hurt E. The nuclear pore complex: understanding its function through structural insight. Nat Rev Mol Cell Biol 2017;18(2):73-89. doi:10.1038/nrm.2016.147';
const OU = 'Ou HD, Phan S, Deerinck TJ, et al. ChromEMT: visualizing 3D chromatin structure and compaction in interphase and mitotic cells. Science 2017;357(6349):eaag0025. doi:10.1126/science.aag0025';
const LUGER = 'Luger K, Mader AW, Richmond RK, Sargent DF, Richmond TJ. Crystal structure of the nucleosome core particle at 2.8 A resolution. Nature 1997;389(6648):251-60. doi:10.1038/38444';
const UEDA = 'Ueda J, Harada A, Urahama T, et al. Testis-specific histone variant H3t gene is essential for entry into spermatogenesis. Cell Rep 2017;18(3):593-600. doi:10.1016/j.celrep.2016.12.065. Coordinates from Protein Data Bank entry 5B1M, CC0 1.0.';
const CLEMENTI = 'Clementi E, Raimondi DL. Atomic screening constants from SCF functions. J Chem Phys 1963;38(11):2686-9. doi:10.1063/1.1733573';
const ANGELI = 'Angeli I, Marinova KP. Table of experimental nuclear ground state charge radii: an update. At Data Nucl Data Tables 2013;99(1):69-95. doi:10.1016/j.adt.2011.12.006';
const BURKHOLDER = 'Burkholder TJ, Fingado B, Baron S, Lieber RL. Relationship between muscle fiber types and sizes and muscle architectural properties in the mouse hindlimb. J Morphol 1994;221(2):177-90. doi:10.1002/jmor.1052210207';
const PELTONEN = 'Peltonen S, Alanne M, Peltonen J. Barriers of the peripheral nerve. Tissue Barriers 2013;1(3):e24956. doi:10.4161/tisb.24956. This review describes the human nerve.';
const RIGAUD = 'Rigaud M, Gemes G, Barabas ME, Chernoff DI, Abram SE, Stucky CL, Hogan QH. Species and strain differences in rodent sciatic nerve anatomy: implications for studies of neuropathic pain. Pain 2008;136(1-2):188-201. doi:10.1016/j.pain.2008.01.016';
const KOCHI = 'Kochi T, Imai Y, Takeda A, Watanabe Y, Mori S, Tachi M, Kodama T. Characterization of the arterial anatomy of the murine hindlimb: functional role in the design and understanding of ischemia models. PLoS One 2013;8(12):e84047. doi:10.1371/journal.pone.0084047';
const WAGENSEIL = 'Wagenseil JE, Mecham RP. Vascular extracellular matrix and arterial mechanics. Physiol Rev 2009;89(3):957-89. doi:10.1152/physrev.00041.2008';
const JILKA = 'Jilka RL. The relevance of mouse models for investigating age-related bone loss in humans. J Gerontol A Biol Sci Med Sci 2013;68(10):1209-17. doi:10.1093/gerona/glt046';
const BONEWALD = 'Bonewald LF. The amazing osteocyte. J Bone Miner Res 2011;26(2):229-38. doi:10.1002/jbmr.320';
const CINTI = 'Cinti S. The adipose organ: morphological perspectives of adipose tissues. Proc Nutr Soc 2001;60(3):319-28. doi:10.1079/pns200192';
const HAMMAD = 'Hammad S, Hoehme S, Friebel A, et al. Protocols for staining of bile canalicular and sinusoidal networks of human, mouse and pig livers, three-dimensional reconstruction and quantification of tissue microarchitecture by image processing and analysis. Arch Toxicol 2014;88(5):1161-83. doi:10.1007/s00204-014-1243-5';
const ZHAI = 'Zhai XY, Thomsen JS, Birn H, Kristoffersen IB, Andreasen A, Christensen EI. Three-dimensional reconstruction of the mouse nephron. J Am Soc Nephrol 2006;17(1):77-88. doi:10.1681/ASN.2005080796';
const KNUST = 'Knust J, Ochs M, Gundersen HJ, Nyengaard JR. Stereological estimates of alveolar number and size and capillary length and surface area in mice lungs. Anat Rec (Hoboken) 2009;292(1):113-22. doi:10.1002/ar.20747';
const CLEVERS = 'Clevers H. The intestinal crypt, a prototype stem cell compartment. Cell 2013;154(2):274-84. doi:10.1016/j.cell.2013.07.004';
const PINTO = 'Pinto AR, Ilinykh A, Ivey MJ, et al. Revisiting cardiac cellular composition. Circ Res 2016;118(3):400-9. doi:10.1161/CIRCRESAHA.115.307778';
const KELLER = 'Keller D, Ero C, Markram H. Cell densities in the mouse brain: a systematic review. Front Neuroanat 2018;12:83. doi:10.3389/fnana.2018.00083';
const ZIMMERMAN = 'Zimmerman A, Bai L, Ginty DD. The gentle touch receptors of mammalian skin. Science 2014;346(6212):950-4. doi:10.1126/science.1254229';
const PDG = 'Navas S, et al. (Particle Data Group). Review of Particle Physics. Phys Rev D 2024;110:030001. doi:10.1103/PhysRevD.110.030001';

export const JOURNEY_LEVELS: readonly JourneyLevel[] = [
  {
    id: 'skin', name: 'A block of haired skin', referenceMetres: 1.6e-3, startMetres: 3.4e-3, endMetres: 1.6e-4, evidence: 'simulated',
    caption: 'Epidermis, dermis with hair follicles, sebaceous glands and small vessels, a layer of fat cells, and the thin panniculus carnosus. Hummel et al. name these layers and report no sweat glands. A nerve in the dermis sends a branch to each follicle, ending round its neck, and fine endings towards the epidermis, as reviewed by Zimmerman et al. All thicknesses and counts are estimates, and the specimen itself is a nude mouse.',
    basis: [HUMMEL, ZIMMERMAN],
  },
  {
    id: 'epidermis', name: 'Cells of the epidermis', referenceMetres: 7e-5, startMetres: 3e-4, endMetres: 1.4e-5, evidence: 'simulated',
    caption: 'In haired skin the epidermis rarely exceeds six cell layers, according to Hummel et al.: a basal layer on its basement membrane, spinous and granular layers above, and one or two flattened layers of stratum corneum. It is drawn here at that upper limit. Cell shapes, sizes and positions are estimates.',
    basis: [HUMMEL, SIMPSON],
  },
  {
    id: 'cell', name: 'One keratinocyte', referenceMetres: 1.07e-5, startMetres: 2.6e-5, endMetres: 5e-6, evidence: 'simulated',
    caption: 'A representative cell opened by a cut: nucleus, mitochondria, endoplasmic reticulum, Golgi stack, lysosomes, bundles of keratin filaments and the desmosomes that join them to neighbouring cells. Numbers and positions are illustrative.',
    basis: [SIMPSON],
  },
  {
    id: 'nucleus', name: 'The cell nucleus', referenceMetres: 4.6e-6, startMetres: 9.5e-6, endMetres: 3.2e-7, evidence: 'simulated',
    caption: 'The double nuclear envelope with its pores, a nucleolus, and chromatin fibres lying in separate territories. The paths of the fibres are generated and follow no real chromosome.',
    basis: [BECK, OU],
  },
  {
    id: 'chromatin', name: 'A chromatin fibre', referenceMetres: 3e-7, startMetres: 8e-7, endMetres: 1.6e-8, evidence: 'simulated',
    caption: 'Nucleosomes on a thread of DNA, drawn as an irregular chain as in the imaging of Ou et al., and not as a regular coil. The size of each nucleosome follows the crystal structures; the path is generated.',
    basis: [OU, LUGER],
  },
  {
    id: 'nucleosome', name: 'One mouse nucleosome', referenceMetres: 1.2e-8, startMetres: 3.5e-8, endMetres: 3.5e-9, evidence: 'measured-elsewhere',
    caption: 'Every atom here is at its measured position in a crystal at 2.34 angstrom resolution: Protein Data Bank entry 5B1M, with mouse histones H3, H4, H2A and H2B and DNA of 146 base pairs. This is a purified particle and not from the specimen. Colours mark the chains.',
    basis: [UEDA, LUGER],
  },
  {
    id: 'dna', name: 'Atoms of the DNA', referenceMetres: 3e-9, startMetres: 6.5e-9, endMetres: 5e-10, evidence: 'measured-elsewhere',
    caption: 'Atoms around a base of the DNA in the same crystal structure, coloured by element: carbon grey, nitrogen blue, oxygen red, phosphorus orange. Positions are measured. Hydrogen atoms are too light to be located at this resolution, so they are not in the entry, and the balls are drawn smaller than atoms really are.',
    basis: [UEDA],
  },
  {
    id: 'atom', name: 'A carbon atom', referenceMetres: 3e-10, startMetres: 1.1e-9, endMetres: 1.8e-11, evidence: 'calculated',
    caption: 'Where the six electrons of carbon are likely to be found, calculated from Slater orbitals with the exponents of Clementi and Raimondi: a dense 1s core, a wider 2s shell and two 2p lobes. These dots sample a probability. They are not particles, and an atom has no orbits and no surface.',
    basis: [CLEMENTI],
  },
  {
    id: 'empty', name: 'Inside the atom', referenceMetres: 3e-12, startMetres: 3.5e-11, endMetres: 5e-14, evidence: 'calculated',
    caption: 'Nearly empty at this scale: only a thinning probability of finding an electron. The nucleus at the centre is still far too small to see, with a radius near 2.5 femtometres against about 70 picometres for the atom.',
    basis: [CLEMENTI, ANGELI],
  },
  {
    id: 'atomic-nucleus', name: 'The nucleus of carbon-12', referenceMetres: 1.2e-14, startMetres: 3e-13, endMetres: 2.9e-15, evidence: 'schematic',
    caption: 'Six protons and six neutrons, drawn within the measured charge radius of 2.47 femtometres. Their arrangement is only a sketch, because nucleons do not sit at fixed places.',
    basis: [ANGELI],
  },
  {
    id: 'proton', name: 'A proton', referenceMetres: 2.4e-15, startMetres: 5.5e-15, endMetres: 6e-16, evidence: 'schematic',
    caption: 'A proton has two up quarks and one down quark, held by gluons, within a measured charge radius of 0.84 femtometres. Quarks are drawn far too large, since no size has been measured for them, and they have no fixed places. No smaller structure is known, so the zoom ends here.',
    basis: [PDG],
  },
];

export const JOURNEY_WIDEST = JOURNEY_LEVELS[0].startMetres;
export const JOURNEY_NARROWEST = JOURNEY_LEVELS[JOURNEY_LEVELS.length - 1].endMetres;

/** The tissues that a zoom can start from. Every route joins the shared levels at the cell nucleus. */
export type JourneyTissue = 'skin' | 'muscle' | 'nerve' | 'artery' | 'vein' | 'bone' | 'fat' | 'liver' | 'kidney' | 'lung' | 'gut' | 'heart' | 'brain';

const SHARED_FROM = JOURNEY_LEVELS.findIndex((level) => level.id === 'nucleus');
const SHARED = JOURNEY_LEVELS.slice(SHARED_FROM);
const block = (id: string, name: string, caption: string, basis: readonly string[]): JourneyLevel => ({ id, name, referenceMetres: 1.6e-3, startMetres: 3.4e-3, endMetres: 1.6e-4, evidence: 'simulated', caption: `${caption} Sizes and counts are estimates.`, basis });
const cells = (id: string, name: string, caption: string, basis: readonly string[]): JourneyLevel => ({ id, name, referenceMetres: 7e-5, startMetres: 3e-4, endMetres: 5.5e-6, evidence: 'simulated', caption: `${caption} Sizes, shapes and positions are estimates.`, basis });

const ROUTES: Readonly<Record<Exclude<JourneyTissue, 'skin'>, { readonly label: string; readonly levels: readonly JourneyLevel[] }>> = {
  muscle: { label: 'muscle', levels: [
    block('muscle-block', 'A block of muscle', 'Muscle fibres of different types, cut across, bundled into fascicles by connective tissue. Capillaries lie between the fibres, and a small artery, a vein and a motor nerve run between the fascicles.', [BURKHOLDER]),
    cells('muscle-fibres', 'Muscle fibres', 'Each fibre is one long cell. Its side shows the bands of its sarcomeres, its cut end shows the myofibrils, and its nuclei lie just under its surface. Capillaries run alongside, and an axon ends on the fibre at a motor end plate.', [BURKHOLDER]),
  ] },
  nerve: { label: 'nerve', levels: [
    block('nerve-block', 'A peripheral nerve', 'A nerve cut across, with its compartments as described by Peltonen et al. for the human nerve: an outer epineurium with fat and vessels, a perineurium round the fascicle, and axons in the endoneurium. Rigaud et al. dissected the sciatic nerve of the mouse; it is drawn here with one fascicle for simplicity.', [PELTONEN, RIGAUD]),
    cells('nerve-fibres', 'Axons in a nerve', 'Large axons each wrapped in myelin by Schwann cells, and groups of small axons without myelin in Remak bundles. A capillary runs among them.', [PELTONEN]),
  ] },
  artery: { label: 'artery', levels: [
    block('artery-block', 'A femoral artery and its neighbours', 'The femoral artery, vein and saphenous nerve lie together on the inner side of the thigh, in fat and connective tissue. Kochi et al. dissected these arteries in the mouse. The artery has a thick wall, and the vein a wider channel and a thin wall.', [KOCHI]),
    cells('artery-wall', 'The wall of an artery', 'From the blood outwards: flat endothelial cells, then layers of smooth muscle between elastic laminae, which Wagenseil and Mecham describe as the structure that lets large arteries store energy, then an outer coat of collagen. The number of layers drawn is an estimate.', [WAGENSEIL, KOCHI]),
  ] },
  vein: { label: 'vein', levels: [
    block('vein-block', 'A femoral vein and its neighbours', 'The femoral artery, vein and saphenous nerve lie together on the inner side of the thigh, in fat and connective tissue. The vein has a wider channel and a thinner wall than the artery beside it.', [KOCHI]),
    cells('vein-wall', 'The wall of a vein', 'From the blood outwards: flat endothelial cells, a thin layer of smooth muscle, and an outer coat of collagen. It is drawn with the same scale as the wall of the artery, by contrast with which it is thin. The thickness is an estimate.', [WAGENSEIL]),
  ] },
  bone: { label: 'bone', levels: [
    block('bone-block', 'The wall of a long bone', 'A femur cut across: periosteum, compact bone and marrow. Jilka notes that the mouse skeleton lacks the osteonal remodelling of cortical bone seen in humans, so no osteons are drawn. Lamellae run with the surface, and osteocytes lie between them in lacunae.', [JILKA, BONEWALD]),
    cells('bone-cells', 'Osteocytes in bone', 'Osteocytes make up 90 to 95 percent of the bone cells of the adult, according to Bonewald. Each lies in a lacuna, with fine processes reaching through canaliculi to its neighbours and to the osteoblasts on the bone surface.', [BONEWALD, JILKA]),
  ] },
  fat: { label: 'fat', levels: [
    block('fat-block', 'A block of white fat', 'Close-packed fat cells with capillaries among them, and small vessels in a band of connective tissue. Cinti describes the fat depots of the mouse as white and brown tissue with a rich blood supply to the brown; this block shows white fat.', [CINTI]),
    cells('fat-cells', 'Fat cells', 'In a white fat cell one droplet of fat fills the cell, leaving a thin rim of cytoplasm and a flattened nucleus at its edge. Brown fat cells, not shown here, hold many small droplets.', [CINTI]),
  ] },
  liver: { label: 'liver', levels: [
    block('liver-block', 'A block of liver', 'Lobules cut across, each round a central vein, with a branch of the portal vein, a hepatic artery and a bile duct at its corners, and plates of hepatocytes with sinusoids running between them.', [HAMMAD]),
    cells('liver-cells', 'Hepatocytes and sinusoids', 'Hepatocytes in plates between sinusoids, with bile canaliculi in the grooves between neighbouring cells. Hepatocyte size and sinusoid radius follow the measures of Hammad et al. in adult mice, about 5,100 cubic micrometres and 4.8 micrometres. The regular plates are a simplification of their network.', [HAMMAD]),
  ] },
  kidney: { label: 'kidney', levels: [
    block('kidney-block', 'A block of kidney cortex', 'Tubules of nephrons cut across at many angles, with renal corpuscles among them and a small artery. Zhai et al. reconstructed the course of the nephrons of the mouse in three dimensions.', [ZHAI]),
    cells('kidney-cells', 'A renal corpuscle and a tubule', 'A tuft of capillaries with podocytes on it, inside its capsule, and beside it a tubule cut across, whose cells carry a brush border towards the lumen.', [ZHAI]),
  ] },
  lung: { label: 'lung', levels: [
    block('lung-block', 'A block of lung', 'A foam of alveoli with a bronchiole, a branch of the pulmonary artery beside it, and a branch of the pulmonary vein apart from them. Knust et al. counted about 2.31 million alveoli in the pair of lungs of an adult mouse.', [KNUST]),
    cells('lung-cells', 'The walls between alveoli', 'Thin walls holding capillaries with red cells, lined by flat type I cells, with a cuboidal type II cell in a corner and a macrophage in the air. Knust et al. measured about 1.13 km of capillary in the pair of lungs of an adult mouse.', [KNUST]),
  ] },
  gut: { label: 'small intestine', levels: [
    block('gut-block', 'The wall of the small intestine', 'Cut lengthways: villi with a capillary and a lacteal in each, crypts below them, the submucosa with a vessel, two layers of muscle and the outer serosa. Clevers describes this repeating arrangement of villi and crypts in the mouse.', [CLEVERS]),
    cells('gut-cells', 'Cells on a villus', 'Tall absorptive cells with a brush border, a goblet cell among them, and under them the core of the villus with a capillary and a lacteal.', [CLEVERS]),
  ] },
  heart: { label: 'heart', levels: [
    block('heart-block', 'A block of heart muscle', 'Heart muscle cells cut across, closely packed, with many capillaries among them, a small coronary artery and vein, and a band of connective tissue. Pinto et al. found that endothelial cells are the commonest of the other cells of the mouse heart.', [PINTO]),
    cells('heart-cells', 'Heart muscle cells', 'Short striated cells joined end to end at intercalated discs, each with a central nucleus, with capillaries between the rows and a fibroblast. Branches between the cells are left out. Pinto et al. found fibroblasts to be fewer than once estimated.', [PINTO]),
  ] },
  brain: { label: 'brain', levels: [
    block('brain-block', 'A block of cerebral cortex', 'From the pia at the surface inwards: layers of neurons of differing density, with vessels entering from the surface and white matter below. Keller et al. review the cell densities of the mouse brain and find wide disagreement between sources, so the densities here are only relative.', [KELLER]),
    cells('brain-cells', 'Cells of the cortex', 'A pyramidal neuron with spines on its dendrites and myelin on its axon, an astrocyte with an end foot on a capillary, an oligodendrocyte that makes the myelin, and a microglial cell.', [KELLER]),
  ] },
};

/** The levels of the zoom that starts from a tissue. */
export function journeyLevels(tissue: JourneyTissue = 'skin'): readonly JourneyLevel[] {
  return tissue === 'skin' ? JOURNEY_LEVELS : [...ROUTES[tissue].levels, ...SHARED];
}

/** The tissue a structure of the living mouse is mostly made of, so that zooming into it goes on to its own cells. Null when no route has been made for it. */
export function journeyTissueOf(structure: { readonly id: string; readonly name: string; readonly systems: readonly string[] }): JourneyTissue | null {
  const id = structure.id.replace(/^living:/, ''), has = (system: string) => structure.systems.includes(system);
  if (id === 'fat' || id === 'brown-fat') return 'fat';
  if (id === 'skin' || id === 'pinnae' || id === 'tail' || id === 'forepaws' || id === 'hindpaws') return 'skin';
  if (has('skeletal')) return 'bone';
  if (has('muscular') && !has('respiratory')) return 'muscle';
  if (/-veins?$|venae|vena-cava|vein-stems|portal-vein/.test(id)) return 'vein';
  if (/-arter(y|ies)$|aorta|artery-stems|cerebral-base/.test(id)) return 'artery';
  if (has('nervous') && /nerves?$|plexus|roots|sympathetic|ganglia/.test(id)) return 'nerve';
  if (/^liver-/.test(id)) return 'liver';
  if (/^kidney-|^renal-medullae$/.test(id)) return 'kidney';
  if (/^lung-/.test(id)) return 'lung';
  if (id === 'small-intestine') return 'gut';
  if (/^heart-(lv|rv|la|ra)$/.test(id)) return 'heart';
  if (/^(cerebrum|striatum|brain-|cerebellum|medulla|olfactory)/.test(id) && id !== 'brain-ventricles') return 'brain';
  return null;
}

const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

const fadeMargin = (level: JourneyLevel) => Math.min(0.28, (Math.log10(level.startMetres) - Math.log10(level.endMetres)) / 3);

/** How visible a level is at a view height: it fades in and out over a short range in the logarithm of the height. */
export function levelFade(level: JourneyLevel, viewMetres: number, levels: readonly JourneyLevel[] = JOURNEY_LEVELS): number {
  const at = Math.log10(viewMetres), start = Math.log10(level.startMetres), end = Math.log10(level.endMetres);
  const margin = fadeMargin(level);
  const first = level === levels[0], last = level === levels[levels.length - 1];
  return (first ? (at <= start + 1e-9 ? 1 : 0) : smooth((start - at) / margin)) * (last ? (at >= end - 1e-9 ? 1 : 0) : smooth((at - end) / margin));
}

/** The level that fills the view at a height: the most visible, and of those the deepest. */
export function levelAt(viewMetres: number, levels: readonly JourneyLevel[] = JOURNEY_LEVELS): JourneyLevel {
  let best = levels[0], fade = -1;
  for (const level of levels) { const value = levelFade(level, viewMetres, levels); if (value >= fade) { fade = value; best = level; } }
  return best;
}


export const clampView = (viewMetres: number) => Math.max(JOURNEY_NARROWEST, Math.min(JOURNEY_WIDEST, viewMetres));

/** The view height at which a level is best seen, which is always where it is fully visible. */
export function levelHome(level: JourneyLevel, levels: readonly JourneyLevel[] = JOURNEY_LEVELS): number {
  if (level === levels[0]) return level.referenceMetres * 1.6;
  return Math.min(level.referenceMetres * 1.05, level.startMetres * 10 ** -fadeMargin(level));
}

/**
 * How far the view has moved from the middle of a level towards the point where the next level emerges, from 0 at the level's best view to 1 where the next level starts to appear.
 * Zooming therefore stays on the whole structure until it has been seen, and then moves in on the part that the next level enlarges.
 */
export function levelAim(level: JourneyLevel, viewMetres: number, levels: readonly JourneyLevel[] = JOURNEY_LEVELS): number {
  const next = levels[levels.indexOf(level) + 1];
  if (!next) return 0;
  const home = Math.log10(levelHome(level, levels)), entry = Math.log10(next.startMetres);
  if (home <= entry) return 1;
  return smooth((home - Math.log10(viewMetres)) / (home - entry));
}

const UNITS: readonly (readonly [number, string])[] = [[1e-3, 'mm'], [1e-6, 'um'], [1e-9, 'nm'], [1e-12, 'pm'], [1e-15, 'fm'], [1e-18, 'am']];

/** A length in the unit that suits it, with micro written out as a symbol. */
export function formatLength(metres: number): string {
  const unit = UNITS.find(([size]) => metres >= size * 0.999) ?? UNITS[UNITS.length - 1];
  const value = metres / unit[0];
  const text = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(0) : value >= 1 ? String(Number(value.toFixed(1))) : String(Number(value.toFixed(2)));
  return `${text} ${unit[1] === 'um' ? 'µm' : unit[1]}`;
}

/** A round length for a scale bar, about a fifth of the view: 1, 2 or 5 times a power of ten. */
export function scaleBarLength(viewMetres: number): number {
  const target = viewMetres / 5;
  const power = 10 ** Math.floor(Math.log10(target));
  const step = target / power;
  return power * (step >= 5 ? 5 : step >= 2 ? 2 : 1);
}

/** How many times larger than life the view is, on a screen where it stands the given height. */
export function magnification(viewMetres: number, screenMetres = 0.2): number {
  return screenMetres / viewMetres;
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export function formatMagnification(times: number): string {
  if (times < 1000) return `${Math.round(times)} times`;
  const power = Math.floor(Math.log10(times));
  const lead = times / 10 ** power;
  return `${Number(lead.toFixed(1))} × 10${[...String(power)].map((digit) => SUPERSCRIPT[Number(digit)]).join('')} times`;
}
