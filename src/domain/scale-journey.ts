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
  /** The file of measured atoms that this level shows, and how. */
  readonly molecule?: string;
  readonly moleculeView?: 'whole' | 'atoms';
}

export const JOURNEY_NOTICE = 'Data from this specimen end at about 0.1 mm. Everything in this view is representative and was not seen in this mouse.';

export const EVIDENCE_LABEL: Readonly<Record<JourneyEvidence, string>> = Object.freeze({
  simulated: 'Simulated from published descriptions',
  'measured-elsewhere': 'Measured in a crystal, not in this specimen',
  calculated: 'Calculated from a model of the atom',
  schematic: 'Schematic, with no positions to measure',
});

/** The shortest word for the kind of evidence, beside the name of a level. */
export const EVIDENCE_SHORT: Readonly<Record<JourneyEvidence, string>> = Object.freeze({ simulated: 'sim', 'measured-elsewhere': 'measured', calculated: 'calculated', schematic: 'schematic' });

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
const KANNUS = 'Kannus P. Structure of the tendon connective tissue. Scand J Med Sci Sports 2000;10(6):312-20. doi:10.1034/j.1600-0838.2000.010006312.x';
const MUTSAERS = 'Mutsaers SE. The mesothelial cell. Int J Biochem Cell Biol 2004;36(1):9-16. doi:10.1016/s1357-2725(03)00242-5';
const MEBIUS = 'Mebius RE, Kraal G. Structure and function of the spleen. Nat Rev Immunol 2005;5(8):606-16. doi:10.1038/nri1669';
const KHANDELWAL = 'Khandelwal P, Abraham SN, Apodaca G. Cell biology and physiology of the uroepithelium. Am J Physiol Renal Physiol 2009;297(6):F1477-501. doi:10.1152/ajprenal.00327.2009';
const ROCK = 'Rock JR, Randell SH, Hogan BL. Airway basal stem cells: a perspective on their roles in epithelial homeostasis and remodeling. Dis Model Mech 2010;3(9-10):545-56. doi:10.1242/dmm.006031';
const MILLS = 'Mills JC, Shivdasani RA. Gastric epithelial stem cells. Gastroenterology 2011;140(2):412-24. doi:10.1053/j.gastro.2010.12.001';
const CARTER_DAWSON = 'Carter-Dawson LD, LaVail MM. Rods and cones in the mouse retina. I. Structural analysis using light and electron microscopy. J Comp Neurol 1979;188(2):245-62. doi:10.1002/cne.901880204';
const GRISWOLD = 'Griswold MD. Spermatogenesis: the commitment to meiosis. Physiol Rev 2016;96(1):1-17. doi:10.1152/physrev.00013.2015';
const ARCHER = 'Archer CW, Francis-West P. The chondrocyte. Int J Biochem Cell Biol 2003;35(4):401-4. doi:10.1016/s1357-2725(02)00301-1';
const OCONNELL = "O'Connell KE, Mikkola AM, Stepanek AM, et al. Practical murine hematopathology: a comparative review and implications for research. Comp Med 2015;65(2):96-113. PMID 25926395";
const NILSSON = 'Nilsson M, Fagman H. Development of the thyroid gland. Development 2017;144(12):2123-40. doi:10.1242/dev.145615';
const DENNY = 'Denny PC, Ball WD, Redman RS. Salivary glands: a paradigm for diversity of gland development. Crit Rev Oral Biol Med 1997;8(1):51-75. doi:10.1177/10454411970080010301';
const BALIC = 'Balic A, Thesleff I. Tissue interactions regulating tooth development and renewal. Curr Top Dev Biol 2015;115:157-86. doi:10.1016/bs.ctdb.2015.07.006';
const HENRIKSSON = 'Henriksson JT, McDermott AM, Bergmanson JP. Dimensions and morphology of the cornea in three strains of mice. Invest Ophthalmol Vis Sci 2009;50(8):3648-54. doi:10.1167/iovs.08-2941';
const BASSNETT = 'Bassnett S, Shi Y, Vrensen GF. Biological glass: structural determinants of eye lens transparency. Philos Trans R Soc Lond B Biol Sci 2011;366(1568):1250-64. doi:10.1098/rstb.2010.0302';
const JOHANSSON = 'Johansson ME, Phillipson M, Petersson J, Velcich A, Holm L, Hansson GC. The inner of the two Muc2 mucin-dependent mucus layers in colon is devoid of bacteria. Proc Natl Acad Sci U S A 2008;105(39):15064-9. doi:10.1073/pnas.0803124105';
const NGUYEN = 'Nguyen TL, Vieira-Silva S, Liston A, Raes J. How informative is the mouse for human gut microbiota research? Dis Model Mech 2015;8(1):1-16. doi:10.1242/dmm.017400';
const SUNDARESAN = 'Sundaresan SS, Ramesh P, Shobana N, Vinuchakkaravarthy T, Yasien S, Ponnuswamy MNG. Crystal structure of hemoglobin from mouse (Mus musculus) compared with those from other small animals and humans. Acta Crystallogr F Struct Biol Commun 2021;77(Pt 4):113-20. doi:10.1107/S2053230X2100306X';
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
    id: 'proton', name: 'A proton and its quarks', referenceMetres: 2.4e-15, startMetres: 5.5e-15, endMetres: 6e-16, evidence: 'schematic',
    caption: 'A proton has two up quarks and one down quark, held by gluons, within a measured charge radius of 0.84 femtometres. Quarks are drawn far too large, since no size has been measured for them, and they have no fixed places. No smaller structure is known, so the zoom ends here.',
    basis: [PDG],
  },
];

export const JOURNEY_WIDEST = JOURNEY_LEVELS[0].startMetres;
export const JOURNEY_NARROWEST = JOURNEY_LEVELS[JOURNEY_LEVELS.length - 1].endMetres;

/** The tissues that a zoom can start from. Every route joins the shared levels at the cell nucleus. */
export type JourneyTissue = 'skin' | 'muscle' | 'nerve' | 'artery' | 'vein' | 'bone' | 'fat' | 'liver' | 'kidney' | 'lung' | 'gut' | 'heart' | 'brain'
  | 'cartilage' | 'tendon' | 'membrane' | 'gland' | 'endocrine' | 'thyroid' | 'lymphoid' | 'colon' | 'stomach' | 'urothelium' | 'airway' | 'retina' | 'cornea' | 'lens' | 'tooth' | 'testis' | 'blood' | 'cochlea' | 'whisker' | 'pancreas';

/** Where a zoom goes below the cells of a tissue. A cell nucleus unless the pointer chooses another way. */
export type JourneyTail = 'nucleus' | 'blood' | 'microbiota' | 'importer' | 'mitochondrion' | 'sarcomere' | 'collagen' | 'synapse' | 'axon' | 'antibody' | 'droplet' | 'disc' | 'crystallin' | 'water' | 'secretion' | 'surfactant' | 'cilium' | 'pump' | 'keratin' | 'ribosome' | 'thyroglobulin' | 'junction' | 'proteasome' | 'tiplink' | 'touch' | 'mhc' | 'insulin';

const SHARED_FROM = JOURNEY_LEVELS.findIndex((level) => level.id === 'nucleus');
const SHARED = JOURNEY_LEVELS.slice(SHARED_FROM);
const block = (id: string, name: string, caption: string, basis: readonly string[]): JourneyLevel => ({ id, name, referenceMetres: 1.6e-3, startMetres: 3.4e-3, endMetres: 1.6e-4, evidence: 'simulated', caption: `${caption} Sizes and counts are estimates.`, basis });
const cells = (id: string, name: string, caption: string, basis: readonly string[]): JourneyLevel => ({ id, name, referenceMetres: 7e-5, startMetres: 3e-4, endMetres: 5.5e-6, evidence: 'simulated', caption: `${caption} Sizes, shapes and positions are estimates.`, basis });

const PALADE = 'Palade G. Intracellular aspects of the process of protein synthesis. Science 1975;189(4200):347-58. doi:10.1126/science.1096303';
const CABRERA = 'Cabrera O, Berman DM, Kenyon NS, Ricordi C, Berggren PO, Caicedo A. The unique cytoarchitecture of human pancreatic islets has implications for islet cell function. Proc Natl Acad Sci U S A 2006;103(7):2334-9. doi:10.1073/pnas.0510790103';
const EBARA = 'Ebara S, Kumamoto K, Matsuura T, Mazurkiewicz JE, Rice FL. Similarities and differences in the innervation of mystacial vibrissal follicle-sinus complexes in the rat and cat: a confocal microscopic study. J Comp Neurol 2002;449(2):103-19. doi:10.1002/cne.10277';
const SCHWANDER = 'Schwander M, Kachar B, Muller U. Review series: The cell biology of hearing. J Cell Biol 2010;190(1):9-20. doi:10.1083/jcb.201001138';
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
  cartilage: { label: 'cartilage', levels: [
    block('cartilage-block', 'A block of cartilage', 'Cells isolated in a large matrix, under a perichondrium.', [ARCHER]),
    cells('cartilage-cells', 'Chondrocytes', 'Each chondrocyte lies in a lacuna in a matrix that has neither vessels nor nerves, as Archer and Francis-West describe, so food and waste reach it by diffusion.', [ARCHER]),
  ] },
  tendon: { label: 'tendon', levels: [
    block('tendon-block', 'A tendon cut across', 'Bundles of bundles of collagen fibres, each wrapped in a fine sheath, in the hierarchy that Kannus describes.', [KANNUS]),
    cells('tendon-cells', 'Collagen and tenocytes', 'Long thin tenocytes lie between collagen fibres, which Kannus describes as the basic unit of a tendon. This review is mainly of human tendon.', [KANNUS]),
  ] },
  membrane: { label: 'serous membrane', levels: [
    block('membrane-block', 'A serous membrane', 'One layer of flat cells on a little connective tissue, lining a body cavity or the organ in it.', [MUTSAERS]),
    cells('membrane-cells', 'Mesothelial cells', 'A single layer of pavement-like cells with microvilli, which Mutsaers describes as giving a slippery, protective surface. The membranes round the brain are of another kind and are drawn the same way.', [MUTSAERS]),
  ] },
  gland: { label: 'gland', levels: [
    block('gland-block', 'A block of gland', 'Lobules of secreting acini round their ducts. The salivary glands are the model for this drawing, and other glands of the mouse differ in their details.', [DENNY]),
    cells('gland-cells', 'Secreting cells', 'Cells in rings round a small lumen, with their nuclei to the outside and their secretory granules towards the middle.', [DENNY]),
  ] },
  endocrine: { label: 'endocrine gland', levels: [
    block('endocrine-block', 'A block of endocrine gland', 'Cords of secreting cells among wide capillaries, with no ducts, under a capsule. The adrenal, pituitary and others differ in their details.', [HUMMEL]),
    cells('endocrine-cells', 'Hormone-making cells', 'Cells holding hormone granules, each close to a capillary that carries its product away.', [HUMMEL]),
  ] },
  thyroid: { label: 'thyroid', levels: [
    block('thyroid-block', 'A block of thyroid', 'Follicles of cells, each round its stored colloid, which Nilsson and Fagman describe as the hormone-making unit of the gland.', [NILSSON]),
    cells('thyroid-cells', 'A thyroid follicle', 'A ring of follicular cells round colloid, with a capillary outside it.', [NILSSON]),
  ] },
  lymphoid: { label: 'lymphoid tissue', levels: [
    block('lymphoid-block', 'A block of spleen', 'White pulp, dense with lymphocytes round small arteries, in red pulp full of blood, as Mebius and Kraal describe. Lymph nodes and the thymus are arranged differently and hold the same kinds of cell.', [MEBIUS]),
    cells('lymphoid-cells', 'Lymphocytes and a macrophage', 'Closely packed lymphocytes, each with a large nucleus, and a macrophage that has taken up old red cells, which the spleen removes from the circulation.', [MEBIUS]),
  ] },
  colon: { label: 'colon', levels: [
    block('colon-block', 'The wall of the colon', 'Crypts, with no villi, under two layers of mucus. Johansson et al. found that in the mouse colon these extend 150 micrometres above the cells, that the inner layer is free of bacteria, and that the outer layer is colonized.', [JOHANSSON, CLEVERS]),
    cells('colon-cells', 'Colon cells and their mucus', 'Absorptive cells and many goblet cells that make the mucus. Bacteria stay beyond the inner layer. Point at them to go on into the gut bacteria.', [JOHANSSON]),
  ] },
  stomach: { label: 'stomach', levels: [
    block('stomach-block', 'The wall of the stomach', 'Pits from the surface, leading to glands with acid-making parietal cells and, deeper, enzyme-making chief cells, as Mills and Shivdasani review. The front part of the stomach of the mouse and its oesophagus have a horny lining instead, which is not drawn.', [MILLS]),
    cells('stomach-cells', 'Cells of a gastric gland', 'Parietal cells, full of mitochondria, and chief cells with enzyme granules, on either side of the narrow lumen of a gland.', [MILLS]),
  ] },
  urothelium: { label: 'urinary lining', levels: [
    block('urothelium-block', 'The wall of the bladder', 'A folded lining over connective tissue and smooth muscle, facing the urine. The ureters and renal pelvis have the same lining.', [KHANDELWAL]),
    cells('urothelium-cells', 'Urothelium', 'Basal and intermediate cells under large umbrella cells, which Khandelwal et al. describe as forming the barrier to urine.', [KHANDELWAL]),
  ] },
  airway: { label: 'airway', levels: [
    block('airway-block', 'The wall of the trachea', 'A lining of cells with cilia over connective tissue, glands and cartilage. Rock et al. describe this lining in the mouse trachea. Other airways differ in their details.', [ROCK]),
    cells('airway-cells', 'Cells of the airway lining', 'Ciliated cells, secretory cells and basal cells, with the beating of the cilia shown as an illustration.', [ROCK]),
  ] },
  retina: { label: 'retina', levels: [
    block('retina-block', 'The back of the eye', 'Sclera, choroid, pigment layer and retina. Rod and cone outer segments lie against the pigment, and their nuclei form the thick outer nuclear layer.', [CARTER_DAWSON]),
    cells('retina-cells', 'Rods and cones', 'Carter-Dawson and LaVail count about 3 percent of the photoreceptor nuclei of the mouse as cones. Most of what is drawn is therefore rods, with their stacked discs.', [CARTER_DAWSON]),
  ] },
  cornea: { label: 'cornea', levels: [
    block('cornea-block', 'The cornea', 'A layered outer epithelium, a thick stroma, and a single inner layer. Henriksson et al. find that in the mouse the stroma makes up about two thirds of the thickness and the epithelium about one third.', [HENRIKSSON]),
    cells('cornea-cells', 'Epithelium and stroma of the cornea', 'Layers of epithelial cells flattening towards the surface, over the lamellae of the stroma with its thin keratocytes. Henriksson et al. count about 13 layers of epithelium at the centre, and fewer are drawn here.', [HENRIKSSON]),
  ] },
  lens: { label: 'lens', levels: [
    block('lens-block', 'The lens', 'Long fibres in ordered rows, under a capsule and one layer of cells at the front.', [BASSNETT]),
    cells('lens-cells', 'Lens fibres', 'Bassnett et al. describe the ordered packing of the fibres, cut across here. The nuclei of the fibres are lost as they mature, so the zoom goes on from a cell at the front.', [BASSNETT]),
  ] },
  tooth: { label: 'tooth', levels: [
    block('tooth-block', 'A block of tooth', 'Enamel, dentine with fine tubules, and pulp with its vessels. Balic and Thesleff review how ameloblasts and odontoblasts make enamel and dentine, and how the teeth of the mouse can grow continuously.', [BALIC]),
    cells('tooth-cells', 'Odontoblasts', 'A row of odontoblasts at the edge of the pulp, each with a process running into a tubule of the dentine.', [BALIC]),
  ] },
  testis: { label: 'testis', levels: [
    block('testis-block', 'A block of testis', 'Seminiferous tubules cut across, with hormone-making Leydig cells between them.', [GRISWOLD]),
    cells('testis-cells', 'Forming sperm', 'From the edge of a tubule towards its middle: spermatogonia, spermatocytes, round spermatids and the tails of forming sperm, among Sertoli cells, in the sequence that Griswold reviews.', [GRISWOLD]),
  ] },
  pancreas: { label: 'pancreas', levels: [
    block('pancreas-block', 'A block of pancreas', 'Lobules of acini that secrete into ducts, as in the cells Palade describes, with an islet of hormone cells among them. Most of the gland is acini, and the share of islets here is not measured.', [PALADE, CABRERA]),
    cells('pancreas-cells', 'An islet', 'Beta cells round capillaries, with cells of another kind together at one edge. Cabrera et al. find proportionally more beta cells in the islets of mice than in those of humans, whose islets show no such subdivisions.', [CABRERA]),
  ] },
  whisker: { label: 'whisker', levels: [
    block('whisker-block', 'A whisker follicle', 'A follicle cut along its length: the whisker in its sheaths, a blood sinus round them, a capsule outside, and a bundle of nerve fibres coming in from below. Ebara et al. describe these follicle-sinus complexes in the rat and the cat, and the mouse has not been measured here.', [EBARA]),
    cells('whisker-cells', 'Merkel cells', 'Merkel cells against the edge of the outer sheath, beside the sinus, each with a nerve ending. Ebara et al. describe Merkel endings at this level in the rat and the cat.', [EBARA]),
  ] },
  cochlea: { label: 'inner ear', levels: [
    block('cochlea-block', 'The cochlea', 'Turns of a spiral canal round a central core of bone and nerve, each cut across to show its chambers of fluid and the organ of Corti on a thin membrane. The canals of balance also have hair cells, and are not drawn here.', [SCHWANDER]),
    cells('cochlea-cells', 'Hair cells', 'The organ of Corti cut across: a row of inner hair cells and three of outer hair cells among supporting cells, with stereocilia below a tectorial membrane and nerve fibres beneath. Schwander et al. review how hair cells turn the vibrations of sound into electrical signals.', [SCHWANDER]),
  ] },
  blood: { label: 'blood', levels: [
    block('blood-block', 'Blood in a vessel', 'A vessel cut across and filled with blood.', [OCONNELL]),
    cells('blood-cells', 'Blood cells', "Red cells, a white cell and platelets in plasma. O'Connell et al. note that mice have smaller and more numerous red cells than humans and a higher share of lymphocytes among the white cells. Point at a red cell to go on into hemoglobin.", [OCONNELL]),
  ] },
  brain: { label: 'brain', levels: [
    block('brain-block', 'A block of cerebral cortex', 'From the pia at the surface inwards: layers of neurons of differing density, with vessels entering from the surface and white matter below. Keller et al. review the cell densities of the mouse brain and find wide disagreement between sources, so the densities here are only relative.', [KELLER]),
    cells('brain-cells', 'Cells of the cortex', 'A pyramidal neuron with spines on its dendrites and myelin on its axon, an astrocyte with an end foot on a capillary, an oligodendrocyte that makes the myelin, and a microglial cell.', [KELLER]),
  ] },
};

const levelOf = (id: string) => JOURNEY_LEVELS.find((level) => level.id === id)!;
const AGIP = 'Agip AA, Blaza JN, Bridges HR, et al. Cryo-EM structures of complex I from mouse heart mitochondria in two biochemically defined states. Nat Struct Mol Biol 2018;25(7):548-556. doi:10.1038/s41594-018-0073-1';
const DAVIES = 'Davies KM, Strauss M, Daum B, et al. Macromolecular organization of ATP synthase and complex I in whole mitochondria. Proc Natl Acad Sci U S A 2011;108(34):14121-6. doi:10.1073/pnas.1103621108';
const VON_DER_ECKEN = 'von der Ecken J, Muller M, Lehman W, et al. Structure of the F-actin-tropomyosin complex. Nature 2015;519(7541):114-7. doi:10.1038/nature14033';
const GAUTEL = 'Gautel M, Djinovic-Carugo K. The sarcomeric cytoskeleton: from molecules to motion. J Exp Biol 2016;219(Pt 2):135-45. doi:10.1242/jeb.124941';
const BELLA = 'Bella J, Eaton M, Brodsky B, Berman HM. Crystal and molecular structure of a collagen-like peptide at 1.9 A resolution. Science 1994;266(5182):75-81. doi:10.1126/science.7695699';
const ORGEL = 'Orgel JP, Irving TC, Miller A, Wess TJ. Microfibrillar structure of type I collagen in situ. Proc Natl Acad Sci U S A 2006;103(24):9001-5. doi:10.1073/pnas.0502718103';
const YU = 'Yu J, Rao P, Clark S, et al. Hippocampal AMPA receptor assemblies and mechanism of allosteric inhibition. Nature 2021;594(7863):448-453. doi:10.1038/s41586-021-03540-0';
const HARRIS_WEINBERG = 'Harris KM, Weinberg RJ. Ultrastructure of synapses in the mammalian brain. Cold Spring Harb Perspect Biol 2012;4(5):a005587. doi:10.1101/cshperspect.a005587';
const LONG = 'Long SB, Campbell EB, MacKinnon R. Crystal structure of a mammalian voltage-dependent Shaker family K+ channel. Science 2005;309(5736):897-903. doi:10.1126/science.1116269';
const RASBAND = 'Rasband MN, Peles E. The nodes of Ranvier: molecular assembly and maintenance. Cold Spring Harb Perspect Biol 2015;8(3):a020495. doi:10.1101/cshperspect.a020495';
const ARROYO = 'Arroyo EJ, Xu T, Poliak S, et al. Internodal specializations of myelinated axons in the central nervous system. Cell Tissue Res 2001;305(1):53-66. doi:10.1007/s004410100403';
const HARRIS_ANTIBODY = 'Harris LJ, Larson SB, Hasel KW, McPherson A. Refined structure of an intact IgG2a monoclonal antibody. Biochemistry 1997;36(7):1581-97. doi:10.1021/bi962514+';
const NUTT = 'Nutt SL, Hodgkin PD, Tarlinton DM, Corcoran LM. The generation of antibody-secreting plasma cells. Nat Rev Immunol 2015;15(3):160-71. doi:10.1038/nri3795';
const XU = 'Xu Z, Bernlohr DA, Banaszak LJ. The adipocyte lipid-binding protein at 1.6-A resolution. Crystal structures of the apoprotein and with bound saturated and unsaturated fatty acids. J Biol Chem 1993;268(11):7874-84. PMID 8463311';
const WALTHER = 'Walther TC, Farese RV. Lipid droplets and cellular lipid metabolism. Annu Rev Biochem 2012;81:687-714. doi:10.1146/annurev-biochem-061009-102430';
const PALCZEWSKI = 'Palczewski K, Kumasaka T, Hori T, et al. Crystal structure of rhodopsin: a G protein-coupled receptor. Science 2000;289(5480):739-45. doi:10.1126/science.289.5480.739';
const FOTIADIS = 'Fotiadis D, Liang Y, Filipek S, et al. Atomic-force microscopy: rhodopsin dimers in native disc membranes. Nature 2003;421(6919):127-8. doi:10.1038/421127a';
const WU = 'Wu Z, Delaglio F, Wyatt K, Wistow G, Bax A. Solution structure of gammaS-crystallin by molecular fragment replacement NMR. Protein Sci 2005;14(12):3101-14. doi:10.1110/ps.051635205';
const SUI = 'Sui H, Han BG, Lee JK, Walian P, Jap BK. Structural basis of water-specific transport through the AQP1 water channel. Nature 2001;414(6866):872-8. doi:10.1038/414872a';
const NIELSEN = 'Nielsen S, Smith BL, Christensen EI, Knepper MA, Agre P. CHIP28 water channels are localized in constitutively water-permeable segments of the nephron. J Cell Biol 1993;120(2):371-83. doi:10.1083/jcb.120.2.371';
const TIMM = 'Timm DE, Baker LJ, Mueller H, Zidek L, Novotny MV. Structural basis of pheromone binding to mouse major urinary protein (MUP-I). Protein Sci 2001;10(5):997-1004. doi:10.1110/ps.52201';
const SEVER = 'Sever N, Milicic G, Bodnar NO, Wu X, Rapoport TA. Mechanism of lamellar body formation by lung surfactant protein B. Mol Cell 2021;81(1):49-66.e8. doi:10.1016/j.molcel.2020.10.042';
const LOWE = 'Lowe J, Li H, Downing KH, Nogales E. Refined structure of alpha beta-tubulin at 3.5 A resolution. J Mol Biol 2001;313(5):1045-57. doi:10.1006/jmbi.2001.5077';
const SATIR = 'Satir P, Christensen ST. Overview of structure and function of mammalian cilia. Annu Rev Physiol 2007;69:377-400. doi:10.1146/annurev.physiol.69.040705.141236';
const ABE = 'Abe K, Irie K, Nakanishi H, Suzuki H, Fujiyoshi Y. Crystal structures of the gastric proton pump. Nature 2018;556(7700):214-218. doi:10.1038/s41586-018-0003-8';
const FORTE = 'Forte JG, Zhu L. Apical recycling of the gastric parietal cell H,K-ATPase. Annu Rev Physiol 2010;72:273-96. doi:10.1146/annurev-physiol-021909-135744';
const GLENWRIGHT = 'Glenwright AJ, Pothula KR, Bhamidimarri SP, et al. Structural basis for nutrient acquisition by dominant members of the human gut microbiota. Nature 2017;541(7637):407-411. doi:10.1038/nature20828';
const ELDIRANY = 'Eldirany SA, Ho M, Hinbest AJ, Lomakin IB, Bunick CG. Human keratin 1/10-1B tetramer structures reveal a knob-pocket mechanism in intermediate filament assembly. EMBO J 2019;38(11):e100741. doi:10.15252/embj.2018100741';

const BAKER = 'Baker EN, Blundell TL, Cutfield JF, et al. The structure of 2Zn pig insulin crystals at 1.5 A resolution. Philos Trans R Soc Lond B Biol Sci 1988;319(1195):369-456. doi:10.1098/rstb.1988.0058';
const DODSON = 'Dodson G, Steiner D. The role of assembly in insulin\'s biosynthesis. Curr Opin Struct Biol 1998;8(2):189-94. doi:10.1016/s0959-440x(98)80037-7';
const WOO = 'Woo SH, Ranade S, Weyer AD, et al. Piezo2 is required for Merkel-cell mechanotransduction. Nature 2014;509(7502):622-6. doi:10.1038/nature13251';
const WANG_PIEZO = 'Wang L, Zhou H, Zhang M, et al. Structure and mechanogating of the mammalian tactile channel PIEZO2. Nature 2019;573(7773):225-229. doi:10.1038/s41586-019-1505-8';
const FREMONT = 'Fremont DH, Matsumura M, Stura EA, Peterson PA, Wilson IA. Crystal structures of two viral peptides in complex with murine MHC class I H-2Kb. Science 1992;257(5072):919-27. doi:10.1126/science.1323877';
const SOTOMAYOR = 'Sotomayor M, Weihofen WA, Gaudet R, Corey DP. Structure of a force-conveying cadherin bond essential for inner-ear mechanotransduction. Nature 2012;492(7427):128-32. doi:10.1038/nature11590';
const KAZMIERCZAK = 'Kazmierczak P, Sakaguchi H, Tokita J, et al. Cadherin 23 and protocadherin 15 interact to form tip-link filaments in sensory hair cells. Nature 2007;449(7158):87-91. doi:10.1038/nature06091';
const SUZUKI = 'Suzuki H, Nishizawa T, Tani K, et al. Crystal structure of a claudin provides insight into the architecture of tight junctions. Science 2014;344(6181):304-7. doi:10.1126/science.1248571';
const TAMURA = 'Tamura A, Hayashi H, Imasato M, et al. Loss of claudin-15, but not claudin-2, causes Na+ deficiency and glucose malabsorption in mouse small intestine. Gastroenterology 2011;140(3):913-23. doi:10.1053/j.gastro.2010.08.006';
const ACHARYA = 'Acharya P, Beckel J, Ruiz WG, et al. Distribution of the tight junction proteins ZO-1, occludin, and claudin-4, -8, and -12 in bladder epithelium. Am J Physiol Renal Physiol 2004;287(2):F305-18. doi:10.1152/ajprenal.00341.2003';
const PITARAKI = 'Pitaraki E, Jagirdar RM, Rouka E, et al. 2-Deoxy-glucose ameliorates the peritoneal mesothelial and endothelial barrier function perturbation occurring due to Peritoneal Dialysis fluids exposure. Biochem Biophys Res Commun 2023;693:149376. doi:10.1016/j.bbrc.2023.149376';
const LI_RIBOSOME = 'Li H, Huo Y, He X, et al. A male germ-cell-specific ribosome controls male fertility. Nature 2022;612(7941):725-731. doi:10.1038/s41586-022-05508-0';
const KIM_THYROGLOBULIN = 'Kim K, Kopylov M, Bobe D, Kelley K, Eng ET, Arvan P, Clarke OB. The structure of natively iodinated bovine thyroglobulin. Acta Crystallogr D Struct Biol 2021;77(Pt 11):1451-1459. doi:10.1107/S2059798321010056';
const HUBER = 'Huber EM, Basler M, Schwab R, Heinemeyer W, Kirk CJ, Groettrup M, Groll M. Immuno- and constitutive proteasome crystal structures reveal differences in substrate and inhibitor specificity. Cell 2012;148(4):727-38. doi:10.1016/j.cell.2011.12.030';
const GOLDBERG = 'Goldberg M, Kulkarni AB, Young M, Boskey A. Dentin: structure, composition and mineralization. Front Biosci (Elite Ed) 2011;3(2):711-35. doi:10.2741/e281';

const FROM_ATOM = JOURNEY_LEVELS.slice(JOURNEY_LEVELS.findIndex((level) => level.id === 'atom'));
/** The same view heights as the nucleus, the chromatin and the atoms of DNA, so that a level leads to the next the same way on every route. */
const closeLevel = (id: string, name: string, caption: string, basis: readonly string[]): JourneyLevel => ({ id, name, referenceMetres: 5e-6, startMetres: 9.5e-6, endMetres: 3.2e-7, evidence: 'simulated', caption: `${caption} Sizes, shapes and positions are estimates.`, basis });
const fineLevel = (id: string, name: string, caption: string, basis: readonly string[], endMetres = 1.6e-8): JourneyLevel => ({ id, name, referenceMetres: 3e-7, startMetres: 8e-7, endMetres, evidence: 'simulated', caption: `${caption} Sizes, counts and positions are estimates.`, basis });

/** A molecule whole and then the atoms round one chosen atom, at the same view heights as hemoglobin and the heme, so that they lead to the atom the same way on every route. */
const moleculeLevels = (molecule: string, whole: string, wholeCaption: string, atoms: string, atomsCaption: string, basis: readonly string[], referenceMetres = 1.2e-8): readonly JourneyLevel[] => [
  { id: `${molecule}-whole`, name: whole, referenceMetres, startMetres: referenceMetres * 3, endMetres: 3.5e-9, evidence: 'measured-elsewhere', caption: wholeCaption, basis, molecule, moleculeView: 'whole' },
  { id: `${molecule}-atoms`, name: atoms, referenceMetres: 3e-9, startMetres: 6.5e-9, endMetres: 5e-10, evidence: 'measured-elsewhere', caption: `${atomsCaption} Positions come from the same entry, coloured by element, and bonds are inferred from the distances between them.`, basis, molecule, moleculeView: 'atoms' },
];
const NOT_THIS_MOUSE = 'It was not measured in this mouse.';

/** Below the cells of a tissue, the way that leads to a measured molecule of its own. */
const MOLECULE_TAILS = {
  mitochondrion: [
    closeLevel('mitochondrion-close', 'A mitochondrion', 'Mitochondria of a cell, each with an outer membrane and an inner membrane folded into cristae. Agip et al. describe complex I as working in this inner membrane.', [AGIP]),
    fineLevel('mitochondrion-fine', 'A fold of the inner membrane', 'Davies et al. find long rows of ATP synthase dimers on the tightly curved edges of the folds, and complex I on their flat parts, in mitochondria from bovine heart, potato and fungi. Mouse mitochondria were not among those they examined.', [DAVIES], 3.4e-8),
    ...moleculeLevels('complex-i', 'Mouse complex I', `Every atom is at its modelled position in Protein Data Bank entry 6G2J, from a map at 3.3 angstrom resolution by electron microscopy, of complex I from mouse heart mitochondria in the active state, with its 45 chains, cofactors and lipids. ${NOT_THIS_MOUSE}`, 'Atoms round an iron-sulfur cluster', 'The iron-sulfur cluster farthest from the flavin and what lies against it.', [AGIP], 2.6e-8),
  ],
  sarcomere: [
    closeLevel('sarcomere-close', 'Sarcomeres', 'Sarcomeres in line along myofibrils, with the Z discs and M bands that Gautel and Djinovic-Carugo review, and mitochondria between the myofibrils. One sarcomere is drawn about 2 micrometres long.', [GAUTEL]),
    fineLevel('sarcomere-fine', 'Thick and thin filaments', 'Half a sarcomere: thin filaments anchored at the Z disc overlap thick filaments of myosin, whose heads reach across. The sliding shown is an illustration, in time with the simulated heartbeat.', [GAUTEL, VON_DER_ECKEN]),
    ...moleculeLevels('thin-filament', 'A thin filament', 'Every atom is at its modelled position in Protein Data Bank entry 3J8A, by electron microscopy, with actin at 3.7 angstrom and tropomyosin at 6.5 angstrom resolution. The actin is of rabbit skeletal muscle and the tropomyosin of mouse, so this is not wholly a mouse molecule.', 'Atoms round ADP', 'The ADP held in one actin and what lies against it.', [VON_DER_ECKEN]),
  ],
  collagen: [
    closeLevel('collagen-close', 'Collagen fibrils', 'Fibrils side by side in ground substance. Orgel et al. note that fibrous collagens form the structural basis of the connective tissues of the heart, vessels, skin, cornea, bone and tendon, and Goldberg et al. describe the type I collagen fibrils that odontoblasts secrete in dentine. Collagens differ in type and in the thickness of their fibrils from tissue to tissue, and this view shows no particular one.', [ORGEL, GOLDBERG]),
    fineLevel('collagen-fine', 'One fibril and its bands', 'A fibril with its repeating bands, from long molecules offset along it. Orgel et al. measure a repeat of about 67.8 nanometres in type I collagen of the rat, whose molecules pack quasi-hexagonally.', [ORGEL]),
    ...moleculeLevels('collagen', 'A collagen triple helix', 'Every atom is at its measured position in a crystal at 1.85 angstrom resolution: Protein Data Bank entry 1CAG, three chains wound together as Bella et al. describe. It is a short synthetic peptide with the repeating pattern of collagen, standing in for the much longer molecules of the tissue, and it is not collagen from a mouse.', 'Atoms at the alanine', 'The alanine that replaces one glycine of the pattern in this peptide, where Bella et al. find the helix locally untwisted, and what lies against it.', [BELLA]),
  ],
  synapse: [
    closeLevel('synapse-close', 'A synapse', 'An excitatory synapse on a dendritic spine among the crowded fibres of the brain, with the bouton, cleft and postsynaptic density that Harris and Weinberg review from the rodent brain.', [HARRIS_WEINBERG]),
    fineLevel('synapse-fine', 'The synaptic cleft', 'Vesicles at the active zone across a narrow cleft from receptors in the postsynaptic density, which Harris and Weinberg describe as containing ligand-gated channels and a network of signalling molecules.', [HARRIS_WEINBERG]),
    ...moleculeLevels('ampa-receptor', 'A mouse glutamate receptor', `Every atom is at its modelled position in Protein Data Bank entry 7LEP, from a map at 3.25 angstrom resolution by electron microscopy: an AMPA receptor purified from mouse hippocampus by Yu et al., with auxiliary subunits and bound inhibitors. It is a composite of the receptor types found there and does not include the outermost domains. ${NOT_THIS_MOUSE}`, 'Atoms round a bound inhibitor', 'A bound inhibitor and what lies against it.', [YU]),
  ],
  axon: [
    closeLevel('axon-close', 'A node of Ranvier', 'A gap in the myelin along an axon. Rasband and Peles review the clustering of sodium and potassium channels that conduction depends on, and Arroyo et al. place the Shaker-type channels Kv1.1 and Kv1.2 in the juxtaparanodal membrane, beside the node, in mice and rats.', [RASBAND, ARROYO]),
    fineLevel('axon-fine', 'The membrane of the axon', 'Potassium channels in the membrane of the axon where it lies under the myelin, with neurofilaments inside the axon.', [ARROYO, LONG]),
    ...moleculeLevels('potassium-channel', 'A potassium channel', 'Every atom is at its measured position in a crystal at 2.9 angstrom resolution: Protein Data Bank entry 2A79, the channel Kv1.2 with its beta subunits, of the rat and not of the mouse. The four copies of the chain come from the biological assembly of the entry. Parts of the voltage sensors were built only as chains of unknown sequence.', 'Atoms round a potassium ion', 'A potassium ion in the pore and what lies against it. An ion on the axis of the pore belongs to all four copies and is shown once.', [LONG]),
  ],
  antibody: [
    closeLevel('antibody-close', 'A plasma cell', 'A plasma cell, the antibody-secreting cell that Nutt et al. review, with the nucleus to one side and much of the cell taken up by rough endoplasmic reticulum.', [NUTT]),
    fineLevel('antibody-fine', 'Inside the endoplasmic reticulum', 'A sheet of rough endoplasmic reticulum with ribosomes on its outer faces and antibodies in the space inside.', [NUTT]),
    ...moleculeLevels('antibody', 'A mouse antibody', `Every atom is at its measured position in a crystal at 2.8 angstrom resolution: Protein Data Bank entry 1IGT, a whole mouse IgG2a antibody with its sugars, from a cultured line raised against a canine lymphoma, as Harris et al. report. ${NOT_THIS_MOUSE}`, 'Atoms round a sugar', 'The first sugar on a heavy chain and what lies against it.', [HARRIS_ANTIBODY]),
  ],
  droplet: [
    closeLevel('droplet-close', 'The edge of a fat droplet', 'The cell membrane, a thin rim of cytoplasm and the edge of the large droplet. Walther and Farese describe a droplet as a core of neutral lipids in the cytoplasm.', [WALTHER]),
    fineLevel('droplet-fine', 'The surface of a droplet', 'A single layer of lipid over the neutral lipid of the droplet, with small lipid-binding proteins in the cytoplasm beside it.', [WALTHER, XU]),
    ...moleculeLevels('fatty-acid-protein', 'A protein carrying a fatty acid', `Every atom is at its measured position in a crystal at 1.6 angstrom resolution: Protein Data Bank entry 1LID, the adipocyte lipid-binding protein of mouse, made in bacteria, with oleic acid bound inside it, as Xu et al. report. ${NOT_THIS_MOUSE}`, 'Atoms of the fatty acid', 'The middle of the oleic acid and what lies against it.', [XU]),
  ],
  disc: [
    closeLevel('disc-close', 'A rod outer segment', 'Stacks of discs on a stalk above an inner segment full of mitochondria, for the rods that Carter-Dawson and LaVail count as most of the photoreceptors of the mouse. Far fewer discs are drawn than exist, so that they can be told apart.', [CARTER_DAWSON]),
    fineLevel('disc-fine', 'Discs and rhodopsin', 'Discs seen from the side, with rhodopsin crowded in their membranes. Fotiadis et al. saw rhodopsin as dimers in native disc membranes by atomic force microscopy.', [FOTIADIS]),
    ...moleculeLevels('rhodopsin', 'Rhodopsin', 'Every atom is at its measured position in a crystal at 2.8 angstrom resolution: Protein Data Bank entry 1F88, rhodopsin of the cow and not of the mouse, in the dark, as Palczewski et al. report, with seven helices round its retinal. The two molecules are those of the crystal.', 'Atoms round retinal', 'The end of the retinal that is joined to the protein and what lies against it.', [PALCZEWSKI]),
  ],
  crystallin: [
    closeLevel('crystallin-close', 'Inside a lens fibre', 'Flattened fibres in ordered rows, as Bassnett et al. describe, seen cut across. Mature fibres have lost their nuclei and other large organelles.', [BASSNETT]),
    fineLevel('crystallin-fine', 'Crystallins', 'Proteins crowded closely in the cytoplasm of a fibre. The jostling is an illustration.', [BASSNETT, WU]),
    ...moleculeLevels('crystallin', 'A mouse crystallin', `Atoms at their positions in Protein Data Bank entry 1ZWM, the first of twenty models of mouse gamma-S crystallin in solution by nuclear magnetic resonance, as Wu et al. report: two similar domains, with flexible parts that differ most between the models. It is a recombinant protein. ${NOT_THIS_MOUSE}`, 'Atoms in the middle of the protein', 'The carbon nearest the centre of the molecule and what lies against it.', [WU]),
  ],
  water: [
    closeLevel('water-close', 'The brush border', 'Long microvilli of a kidney tubule cell facing the fluid of the tubule. Nielsen et al. find the water channel now called aquaporin 1 in the microvilli of the proximal tubule of the rat, at 3.8 percent of the protein of the brush border.', [NIELSEN]),
    fineLevel('water-fine', 'A microvillus', 'A microvillus with a core of actin and water channels in its membrane. Their number is an estimate.', [NIELSEN]),
    ...moleculeLevels('aquaporin', 'Aquaporin 1', 'Every atom is at its measured position in a crystal at 2.2 angstrom resolution: Protein Data Bank entry 1J4N, of the cow and not of the mouse. The four copies come from the biological assembly of the entry, and each has its own pore, as Sui et al. report.', 'Atoms at the narrowest part of a pore', 'Histidine 182, which Sui et al. find critical to letting only water through, and what lies against it.', [SUI]),
  ],
  secretion: [
    closeLevel('secretion-close', 'The way out of a liver cell', 'Rough endoplasmic reticulum, a Golgi stack and vesicles on the way to the surface that faces the blood, among mitochondria and glycogen.', [TIMM]),
    fineLevel('secretion-fine', 'A vesicle', 'A vesicle full of protein. Timm et al. purify major urinary protein from mouse liver, and passage through vesicles is the general way out for a secreted protein and was not studied by them.', [TIMM]),
    ...moleculeLevels('urinary-protein', 'Mouse major urinary protein', `Every atom is at its measured position in a crystal at 2.0 angstrom resolution: Protein Data Bank entry 1I04, major urinary protein I purified from mouse liver. Timm et al. describe these proteins as carriers of volatile pheromones. ${NOT_THIS_MOUSE}`, 'Atoms inside the barrel', 'The carbon nearest the centre of the molecule and what lies against it.', [TIMM]),
  ],
  surfactant: [
    closeLevel('surfactant-close', 'A lamellar body', 'Lamellar bodies in a type II cell. Sever et al. describe them as organelles of densely packed concentric membranes that store surfactant for secretion.', [SEVER]),
    fineLevel('surfactant-fine', 'Layers of a lamellar body', 'Layers of membrane with protein between them. Sever et al. find that the mature middle domain of surfactant protein B generates these layers.', [SEVER]),
    ...moleculeLevels('surfactant-protein', 'A domain of surfactant protein B', `Every atom is at its measured position in a crystal at 1.75 angstrom resolution: Protein Data Bank entry 6VZ0, a recombinant domain of the precursor of mouse surfactant protein B, and not the mature protein. The two molecules are those of the crystal. ${NOT_THIS_MOUSE}`, 'Atoms in the middle of the domain', 'The carbon nearest the centre of the two molecules and what lies against it.', [SEVER]),
  ],
  cilium: [
    closeLevel('cilium-close', 'Cilia of the airway', 'Cilia rooted in basal bodies at the surface of a cell of the airway. Their beating is an illustration.', [SATIR, ROCK]),
    fineLevel('cilium-fine', 'Across a cilium', 'Nine outer doublets of microtubules round a central pair, with dynein arms, the 9 + 2 pattern that Satir and Christensen describe for the motile cilia of mammalian epithelia.', [SATIR]),
    ...moleculeLevels('tubulin', 'A dimer of tubulin', 'Every atom is at its modelled position in Protein Data Bank entry 1JFF, by electron crystallography at 3.5 angstrom resolution: alpha and beta tubulin of the cow and not of the mouse, in flat sheets and not a microtubule, held with the drug taxol, as Lowe et al. report.', 'Atoms round GTP', 'The GTP held by alpha tubulin and what lies against it.', [LOWE]),
  ],
  pump: [
    closeLevel('pump-close', 'A parietal cell', 'A secretory canaliculus among mitochondria and tubulovesicles. Forte and Zhu review how, on stimulation, the tubulovesicle membranes carry the pumps to the secretory surface.', [FORTE]),
    fineLevel('pump-fine', 'A membrane full of pumps', 'The membrane of a tubulovesicle, crowded with proton pumps. Their number is an estimate.', [FORTE, ABE]),
    ...moleculeLevels('proton-pump', 'The gastric proton pump', 'Every atom is at its measured position in a crystal at 2.8 angstrom resolution: Protein Data Bank entry 5YLU, of the pig and not of the mouse, held by the drug vonoprazan. Abe et al. describe it as acidifying the gastric juice down to pH 1.', 'Atoms round the drug', 'The vonoprazan in the conduit of the pump and what lies against it.', [ABE]),
  ],
  keratin: [
    closeLevel('keratin-close', 'Keratin filaments', 'Bundles of keratin filaments in a cell of the skin, running to the desmosomes that join it to the next. Simpson et al. review their part in the epidermis.', [SIMPSON]),
    fineLevel('keratin-fine', 'One keratin filament', 'Filaments, each a rope of finer strands. How the strands are wound here is a sketch.', [ELDIRANY]),
    ...moleculeLevels('keratin', 'Part of a keratin', 'Every atom is at its measured position in a crystal at 3.0 angstrom resolution: Protein Data Bank entry 6EC0, the coil 1B part of keratin 1 and keratin 10 of humans and not of the mouse, as Eldirany et al. report, assembled as a tetramer. It is a short part of a much longer filament.', 'Atoms in the middle of the coils', 'The carbon nearest the centre of the tetramer and what lies against it.', [ELDIRANY]),
  ],
  ribosome: [
    closeLevel('ribosome-close', 'Rough reticulum', 'Flat sheets of endoplasmic reticulum with ribosomes on their outer faces, and other ribosomes free between them. Palade describes how secreting cells of the pancreas make their proteins on such ribosomes and pass them into the sheets. Every cell has ribosomes, and the sheets are most developed in cells that secrete.', [PALADE]),
    fineLevel('ribosome-fine', 'Ribosomes on the membrane', 'Ribosomes along a strand of messenger RNA on the membrane of the reticulum, each passing a new protein through it, with others free in the cytoplasm.', [PALADE], 4.2e-8),
    ...moleculeLevels('ribosome', 'One mouse ribosome', `Every atom is at its modelled position in Protein Data Bank entry 7CPV, from a map at 3.03 angstrom resolution by electron microscopy, of a ribosome from the testis of mice, with its ribosomal RNA, 73 protein chains and a transfer RNA. Li et al. find that ribosomes of male germ cells hold RPL39L, a relative of the RPL39 of other tissues, in the tunnel by which a new protein leaves. So this one stands for the ribosomes of other cells, and differs from them there. ${NOT_THIS_MOUSE}`, 'Atoms of RPL39L', 'Part of RPL39L, the protein of male germ cells, and what lies against it.', [LI_RIBOSOME], 3.2e-8),
  ],
  thyroglobulin: [
    closeLevel('thyroglobulin-close', 'The edge of the colloid', 'The top of a follicular cell, with microvilli reaching into the colloid. Kim et al. describe thyroglobulin as secreted into the lumen of the follicle, where its tyrosines become iodinated, and Nilsson and Fagman describe the follicle as the unit that makes the hormone.', [KIM_THYROGLOBULIN, NILSSON]),
    fineLevel('thyroglobulin-fine', 'Inside the colloid', 'Thyroglobulin crowded in the colloid, each drawn as a pair of parts because Kim et al. describe it as a dimer.', [KIM_THYROGLOBULIN], 3.4e-8),
    ...moleculeLevels('thyroglobulin', 'Thyroglobulin', 'Every atom is at its modelled position in Protein Data Bank entry 7N4Y, from a map at 2.6 angstrom resolution by electron microscopy, of the two chains of naturally iodinated thyroglobulin, with its sugars. It is of the cow and not of the mouse.', 'Atoms of thyroxine', 'Thyroxine at residue 24, a thyroid hormone still joined to the chain of the protein, with its four atoms of iodine. Kim et al. describe this as an acceptor site, reached by the coupling of two iodinated tyrosines.', [KIM_THYROGLOBULIN], 2.6e-8),
  ],
  junction: [
    closeLevel('junction-close', 'Where two cells meet', 'Two cells of a lining side by side, closed near their free surface by a tight junction. Suzuki et al. describe tight junctions as regulating what passes through the space between the cells of a sheet. Tamura et al. study them in the small intestine of the mouse and Acharya et al. in its bladder, and Pitaraki et al. study the claudins of a human mesothelial cell line.', [SUZUKI, TAMURA, ACHARYA, PITARAKI]),
    fineLevel('junction-fine', 'Strands of a tight junction', 'The face of a cell membrane at a tight junction, with claudins in rows. Suzuki et al. describe claudins as the main part of these junctions, forming strands. The pattern of the strands is drawn as a net, and it is not measured here.', [SUZUKI]),
    ...moleculeLevels('claudin', 'One mouse claudin', `Every atom is at its measured position in a crystal at 2.4 angstrom resolution: Protein Data Bank entry 4P79, one recombinant claudin-15, with selenomethionine in place of methionine to solve the crystal. Tamura et al. find this claudin in the small intestine of the mouse. Other linings use other members of the family, such as claudin-4, -8 and -12 in the bladder in Acharya et al., and for them it stands for its family. ${NOT_THIS_MOUSE}`, 'Atoms inside a claudin', 'Atoms at the middle of the chain and what lies against them.', [SUZUKI, TAMURA, ACHARYA]),
  ],
  insulin: [
    closeLevel('insulin-close', 'A beta cell', 'Granules of a beta cell near a capillary, each a dense core in a pale space under its membrane. Dodson and Steiner describe insulin as stored in the cell as microcrystals.', [DODSON]),
    fineLevel('insulin-fine', 'Inside a granule', 'The dense core as a crystal of insulin hexamers, each about 5 nanometres across. Dodson and Steiner describe the storage of insulin as microcrystals, built on the hexamer that holds zinc. The order of a real granule is drawn here and not measured.', [DODSON, BAKER], 1.06e-8),
    ...moleculeLevels('insulin', 'An insulin hexamer', 'Every atom is at its measured position in a crystal at 1.5 angstrom resolution: Protein Data Bank entry 4INS, six molecules of insulin, each of two chains, round two atoms of zinc, as Baker et al. describe. The three copies of the asymmetric unit are placed by the operators stated in the entry. It is of the pig and not of the mouse.', 'Atoms round the zinc', 'One atom of zinc on the axis of the hexamer and the three histidines that lie against it. The water that completes its shell is left out.', [BAKER], 8e-9),
  ],
  touch: [
    closeLevel('touch-close', 'A Merkel cell', 'A Merkel cell and the nerve ending against it, with dense granules near the nerve. Woo et al. find that Merkel cells of mice respond to touch, and that this depends on Piezo2.', [WOO]),
    fineLevel('touch-fine', 'Membrane of a Merkel cell', 'Piezo2 as shallow domes in the membrane, each about 28 nanometres across, the size that Wang et al. report. How many lie in a real cell, and how they are spread, are estimates.', [WANG_PIEZO, WOO], 4.2e-8),
    ...moleculeLevels('piezo2', 'Mouse Piezo2', `Every atom is at its modelled position in Protein Data Bank entry 6KG7, from a map at 3.8 angstrom resolution by electron microscopy, of the recombinant channel of the mouse: three curved blades round a central pore, as Wang et al. describe. Parts of the blades could not be modelled and are absent. ${NOT_THIS_MOUSE}`, 'Atoms at the middle of the channel', 'The carbon atom nearest the middle of the three chains and what lies against it. It was chosen by position, and it is not a named site.', [WANG_PIEZO], 3.2e-8),
  ],
  mhc: [
    closeLevel('mhc-close', 'The surface of a lymphocyte', 'The membrane of a lymphocyte with its many surface proteins. Huber et al. describe how proteasomes shape the peptides that class I molecules present on this surface.', [HUBER]),
    fineLevel('mhc-fine', 'Class I molecules on the membrane', 'Class I molecules standing on the membrane, each holding out a peptide in a groove, about 7 nanometres tall. Their number and spacing are estimates.', [FREMONT, HUBER]),
    ...moleculeLevels('mhc-class-i', 'A mouse class I molecule', `Every atom is at its measured position in a crystal at 2.3 angstrom resolution: Protein Data Bank entry 2VAA, the mouse molecule H-2Kb with beta-2 microglobulin, holding a peptide of a virus, as Fremont et al. describe. It is without its part in the membrane. ${NOT_THIS_MOUSE}`, 'Atoms of the peptide', 'Part of the viral peptide and what holds it in the groove.', [FREMONT]),
  ],
  tiplink: [
    closeLevel('tiplink-close', 'A bundle of stereocilia', 'Rows of stereocilia that rise like a staircase from the top of a hair cell, joined at their tips by fine links. Kazmierczak et al. describe tip-link filaments between stereocilia, near which force is turned into an electrical signal.', [KAZMIERCZAK, SCHWANDER]),
    fineLevel('tiplink-fine', 'One tip link', 'Kazmierczak et al. find cadherin 23 in the upper part of a tip link and protocadherin 15 in the lower, each as a pair, meeting at their ends. The repeats and the winding of the strands are drawn to suggest them.', [KAZMIERCZAK]),
    ...moleculeLevels('tip-link', 'The bond of a tip link', `Every atom is at its measured position in a crystal at 2.63 angstrom resolution: Protein Data Bank entry 4AQ8, the first two repeats of cadherin 23 and of protocadherin 15, which Sotomayor et al. find overlapped and antiparallel, with calcium. The crystal holds two copies and this is one of them. These proteins are of the mouse and are recombinant. ${NOT_THIS_MOUSE}`, 'Atoms where they meet', 'Serine 144 of cadherin 23, where it lies against protocadherin 15, and what lies round it.', [SOTOMAYOR]),
  ],
  proteasome: [
    closeLevel('proteasome-close', 'Cytoplasm of a lymphocyte', 'The thin rim of cytoplasm beside the large nucleus of a lymphocyte, with proteasomes scattered through it. Huber et al. describe how proteasomes shape the peptides that a cell presents to the immune system.', [HUBER]),
    fineLevel('proteasome-fine', 'Among proteasomes', 'Barrels of four rings, each about 15 nanometres long, among other contents of the cytoplasm.', [HUBER], 2.1e-8),
    ...moleculeLevels('immunoproteasome', 'A mouse immunoproteasome', `Every atom is at its measured position in a crystal at 3.2 angstrom resolution: Protein Data Bank entry 3UNH, the 20S immunoproteasome, with its 28 chains in four rings, and without the ions of the crystal. Three of the subunits of each half differ from those of the proteasome of other cells. ${NOT_THIS_MOUSE}`, 'Atoms at a cutting site', 'The threonine at the start of the subunit beta 5i, the site that Huber et al. study, and what lies against it.', [HUBER], 1.6e-8),
  ],
} as const;

/** The way that a tissue's own molecule lies on, which playing takes from that tissue. A tissue with none goes to a cell nucleus. */
const OWN_WAYS: Partial<Readonly<Record<JourneyTissue, JourneyTail>>> = Object.freeze({
  skin: 'keratin', muscle: 'sarcomere', heart: 'sarcomere', nerve: 'axon', artery: 'blood', vein: 'blood', blood: 'blood', bone: 'collagen', tendon: 'collagen', cartilage: 'collagen', cornea: 'collagen',
  fat: 'droplet', liver: 'secretion', kidney: 'water', lung: 'surfactant', gut: 'microbiota', colon: 'microbiota', brain: 'synapse', lymphoid: 'antibody', retina: 'disc', lens: 'crystallin', airway: 'cilium', stomach: 'pump', cochlea: 'tiplink', whisker: 'touch', pancreas: 'insulin', thyroid: 'thyroglobulin', testis: 'ribosome', gland: 'ribosome', urothelium: 'junction', membrane: 'junction', tooth: 'collagen',
});
export const ownWayOf = (tissue: JourneyTissue): JourneyTail => OWN_WAYS[tissue] ?? 'nucleus';

const MICROBES = closeLevel('microbes', 'Bacteria of the gut', 'Nguyen et al. report that the gut microbiota of mice and humans is dominated by two phyla, Bacteroidetes and Firmicutes. Johansson et al. place the bacteria of the colon in its outer mucus. Which bacteria these are is not stated, since no species was drawn from data.', [NGUYEN, JOHANSSON]);
const BACTERIUM = fineLevel('bacterium', 'Inside a bacterium', 'A bacterium cut open, with an outer and an inner membrane and a thin wall between them, as in Gram-negative bacteria, many ribosomes, and DNA with no nucleus round it. Point at the outer membrane to go on to a molecule that sits in it.', [NGUYEN]);

const TAILS: Readonly<Record<Exclude<JourneyTail, 'nucleus'>, readonly JourneyLevel[]>> = {
  blood: [
    closeLevel('red-cell', 'A red cell', "A red cell, with no nucleus, thinner at its middle than at its rim, among others in plasma. O'Connell et al. note that the red cells of mice are smaller than those of humans.", [OCONNELL]),
    fineLevel('hemoglobin-crowd', 'Inside a red cell', 'Molecules of hemoglobin fill the cell, under a membrane held by its skeleton. The jostling is an illustration.', [OCONNELL]),
    { id: 'hemoglobin', name: 'One mouse hemoglobin', referenceMetres: 1.2e-8, startMetres: 3.5e-8, endMetres: 3.5e-9, evidence: 'measured-elsewhere', caption: 'Every atom here is at its measured position in a crystal at 2.8 angstrom resolution: Protein Data Bank entry 3HRW, hemoglobin purified from mouse blood, with two alpha and two beta chains and four hemes. The hemes carry no oxygen in this crystal. It is not from the specimen, and colours mark the chains and are not real.', basis: [SUNDARESAN] },
    { id: 'heme', name: 'Atoms round the iron', referenceMetres: 3e-9, startMetres: 6.5e-9, endMetres: 5e-10, evidence: 'measured-elsewhere', caption: 'The atoms of one heme and of what lies against it, at their measured positions in the same crystal, coloured by element: iron orange, carbon grey, nitrogen blue, oxygen red. Positions at this resolution are less exact than the size of an atom suggests, and bonds are inferred from distances.', basis: [SUNDARESAN] },
    ...FROM_ATOM,
  ],
  microbiota: [
    MICROBES,
    BACTERIUM,
    { id: 'bacterial-dna', name: 'Bacterial DNA', referenceMetres: 1.2e-8, startMetres: 3.5e-8, endMetres: 3.5e-9, evidence: 'schematic', caption: 'A double helix, with no histones as in a cell nucleus. It is a sketch and follows no sequence.', basis: [NGUYEN] },
    { ...levelOf('dna'), caption: 'Atoms of DNA at their measured positions, coloured by element. They come from the crystal of a mouse nucleosome, Protein Data Bank entry 5B1M, and not from a bacterium, because the chemistry of DNA is the same in both.' },
    ...FROM_ATOM,
  ],
  importer: [
    MICROBES,
    BACTERIUM,
    ...moleculeLevels('nutrient-importer', 'A nutrient importer of a gut bacterium', 'Every atom is at its measured position in a crystal at 2.75 angstrom resolution: Protein Data Bank entry 5FQ8, from Bacteroides thetaiotaomicron, a bacterium of the human gut. Glenwright et al. show SusC-like barrels in the outer membrane capped by SusD-like proteins, with a peptide bound between them. It is an example of the Bacteroidetes, and no claim is made that this species is in this mouse.', 'Atoms of the bound peptide', 'The peptide bound in the importer and what lies against it.', [GLENWRIGHT]),
    ...FROM_ATOM,
  ],
  mitochondrion: [...MOLECULE_TAILS.mitochondrion, ...FROM_ATOM],
  sarcomere: [...MOLECULE_TAILS.sarcomere, ...FROM_ATOM],
  collagen: [...MOLECULE_TAILS.collagen, ...FROM_ATOM],
  synapse: [...MOLECULE_TAILS.synapse, ...FROM_ATOM],
  axon: [...MOLECULE_TAILS.axon, ...FROM_ATOM],
  antibody: [...MOLECULE_TAILS.antibody, ...FROM_ATOM],
  droplet: [...MOLECULE_TAILS.droplet, ...FROM_ATOM],
  disc: [...MOLECULE_TAILS.disc, ...FROM_ATOM],
  crystallin: [...MOLECULE_TAILS.crystallin, ...FROM_ATOM],
  water: [...MOLECULE_TAILS.water, ...FROM_ATOM],
  secretion: [...MOLECULE_TAILS.secretion, ...FROM_ATOM],
  surfactant: [...MOLECULE_TAILS.surfactant, ...FROM_ATOM],
  cilium: [...MOLECULE_TAILS.cilium, ...FROM_ATOM],
  pump: [...MOLECULE_TAILS.pump, ...FROM_ATOM],
  keratin: [...MOLECULE_TAILS.keratin, ...FROM_ATOM],
  ribosome: [...MOLECULE_TAILS.ribosome, ...FROM_ATOM],
  thyroglobulin: [...MOLECULE_TAILS.thyroglobulin, ...FROM_ATOM],
  junction: [...MOLECULE_TAILS.junction, ...FROM_ATOM],
  proteasome: [...MOLECULE_TAILS.proteasome, ...FROM_ATOM],
  tiplink: [...MOLECULE_TAILS.tiplink, ...FROM_ATOM],
  touch: [...MOLECULE_TAILS.touch, ...FROM_ATOM],
  insulin: [...MOLECULE_TAILS.insulin, ...FROM_ATOM],
  mhc: [...MOLECULE_TAILS.mhc, ...FROM_ATOM],
};

/** The levels of the zoom that starts from a tissue and goes on by a given way. */
/** Orders of magnitude of the height of the view that pass in a second of playing, so that the whole way down takes about three quarters of a minute. */
export const JOURNEY_PLAY = Object.freeze({
  /** Seconds from one level to the next at the usual speed, whatever the orders of magnitude between them. */
  levelSeconds: 8,
  /** How slowly the view moves at a level, as a share of how it moves half way to the next. It never quite stops, so that it never seems to have ended. */
  slowest: 0.1,
  /** The speeds that can be chosen. */
  speeds: [0.5, 1, 2] as readonly number[],
});

/** What a level takes in the units of playStep's rate: the integral over a level of one over the rate of moving, reckoned once. */
const LEVEL_INTEGRAL = (() => {
  let sum = 0;
  const parts = 2000;
  for (let i = 0; i < parts; i++) sum += 1 / (JOURNEY_PLAY.slowest + Math.sin(Math.PI * (i + 0.5) / parts));
  return sum / parts;
})();

/** The view heights at which Play slows, from the widest to the narrowest: where the route starts, each level at its best view, and where the route ends. */
export function playStops(route: readonly JourneyLevel[]): readonly number[] {
  // The route starts at the first level and ends at the last, so these are not stops of their own unless they lie well apart from where those levels are best seen.
  const stops = [route[0].startMetres];
  route.forEach((level, index) => {
    const home = levelHome(level, route);
    if (home < stops[stops.length - 1] * (index === 0 ? 0.5 : 0.999)) stops.push(home);
  });
  const end = route[route.length - 1].endMetres;
  if (end < stops[stops.length - 1] * 0.5) stops.push(end);
  else stops[stops.length - 1] = end;
  return stops;
}

/**
 * One step of playing the zoom. Each level takes about the same time, and the view slows at each so that it can be looked at, however many orders of magnitude lie between them.
 * It ends only by reaching the end it is going to, however small or odd the time step.
 */
export function playStep(view: number, direction: 'in' | 'out', seconds: number, route: readonly JourneyLevel[], speed = 1): { readonly view: number; readonly ended: boolean } {
  const stops = playStops(route).map(Math.log10);
  const narrow = stops[stops.length - 1], wide = stops[0];
  let at = Math.max(narrow, Math.min(wide, Math.log10(view)));
  let left = Math.max(seconds, 0) * speed;
  const pace = LEVEL_INTEGRAL / JOURNEY_PLAY.levelSeconds;
  // Long steps are taken in short pieces, so that a slow frame does not skip a level.
  while (left > 1e-9) {
    if (direction === 'in' ? at <= narrow : at >= wide) break;
    let index = 0;
    while (index < stops.length - 2 && (direction === 'in' ? at <= stops[index + 1] : at < stops[index + 1])) index++;
    const high = stops[index], low = stops[index + 1], span = high - low;
    const share = Math.max(0, Math.min(1, (high - at) / span));
    const piece = Math.min(left, 0.05);
    const move = pace * (JOURNEY_PLAY.slowest + Math.sin(Math.PI * share)) * piece * span;
    at = direction === 'in' ? Math.max(low, at - move) : Math.min(high, at + move);
    left -= piece;
  }
  // The two ends are given exactly, so that the view rests at the same place as the route says it ends.
  if (at <= narrow) return { view: route[route.length - 1].endMetres, ended: direction === 'in' };
  if (at >= wide) return { view: route[0].startMetres, ended: direction === 'out' };
  return { view: 10 ** at, ended: false };
}

export function journeyLevels(tissue: JourneyTissue = 'skin', tail: JourneyTail = 'nucleus'): readonly JourneyLevel[] {
  if (tail === 'nucleus') return tissue === 'skin' ? JOURNEY_LEVELS : [...ROUTES[tissue].levels, ...SHARED];
  return [...(tissue === 'skin' ? JOURNEY_LEVELS.slice(0, SHARED_FROM) : ROUTES[tissue].levels), ...TAILS[tail]];
}

/** Every level of every way down, once each, for the list of sources. */
export function everyJourneyLevel(): readonly JourneyLevel[] {
  const levels = new Map<string, JourneyLevel>();
  for (const level of [...JOURNEY_LEVELS, ...Object.values(ROUTES).flatMap((route) => route.levels), ...Object.values(TAILS).flat()]) if (!levels.has(level.id)) levels.set(level.id, level);
  return [...levels.values()];
}

/** Every way down that has a level of its own, for checks. */
export const JOURNEY_TAILS: readonly JourneyTail[] = Object.freeze(['nucleus', ...Object.keys(TAILS)] as JourneyTail[]);

/** The tissue a structure of the living mouse is mostly made of, so that zooming into it goes on to its own cells. */
export function journeyTissueOf(structure: { readonly id: string; readonly name: string; readonly systems: readonly string[] }): JourneyTissue | null {
  const id = structure.id.replace(/^living:/, ''), has = (system: string) => structure.systems.includes(system);
  if (id === 'fat' || id === 'brown-fat') return 'fat';
  if (id === 'marrow') return 'blood';
  if (id === 'articular-cartilage' || id === 'menisci') return 'cartilage';
  if (id === 'patellar-tendons') return 'tendon';
  if (id === 'peyers-patches') return 'lymphoid';
  if (id === 'meibomian-glands') return 'gland';
  if (id === 'vomeronasal-organs') return 'airway';
  if (['skin', 'pinnae', 'tail', 'forepaws', 'hindpaws', 'claws', 'nose', 'lips', 'eyelids', 'openings', 'penis'].includes(id)) return 'skin';
  if (['intervertebral-discs', 'xiphoid-cartilage', 'tracheal-rings'].includes(id)) return 'cartilage';
  if (id === 'calcaneal-tendons') return 'tendon';
  if (['pleura', 'peritoneum', 'pericardium', 'meninges'].includes(id)) return 'membrane';
  if (['veins', 'left-heart-spaces', 'right-heart-spaces'].includes(id)) return 'blood';
  if (id === 'heart-valves') return 'heart';
  if (['incisors', 'molars'].includes(id)) return 'tooth';
  if (['corneas'].includes(id)) return 'cornea';
  if (['lenses'].includes(id)) return 'lens';
  if (['eyes', 'irises', 'retinas'].includes(id)) return 'retina';
  if (id === 'pancreas') return 'pancreas';
  if (id === 'vibrissae' || id === 'whisker-follicles') return 'whisker';
  if (id === 'inner-ears') return 'cochlea';
  if (id === 'middle-ears') return 'bone';
  if (id === 'thyroid') return 'thyroid';
  if (['adrenals', 'adrenal-medullae', 'parathyroids', 'pituitary', 'pineal'].includes(id)) return 'endocrine';
  if (id === 'spleen' || id === 'thymus' || id.endsWith('lymph-nodes') || id.endsWith('lymph-node')) return 'lymphoid';
  if (id === 'lymph-vessels' || id === 'meningeal-lymphatics' || id === 'dural-venous-sinuses') return 'vein';
  if (['caecum', 'colon'].includes(id)) return 'colon';
  if (id.startsWith('stomach-') || ['limiting-ridge', 'oesophagus'].includes(id)) return 'stomach';
  if (['bladder', 'bladder-lumen', 'ureters', 'renal-pelves'].includes(id)) return 'urothelium';
  if (['airways', 'bronchi', 'trachea', 'larynx', 'nasal-cavities', 'pharynx', 'soft-palate'].includes(id)) return 'airway';
  if (id.startsWith('testis-')) return 'testis';
  if (['submandibular-glands', 'sublingual-glands', 'parotid-glands', 'pancreas', 'gall-bladder', 'bile-ducts', 'pancreatic-ducts', 'lachrymal', 'harderian-glands', 'intraorbital-glands', 'male-ducts', 'seminal-vesicles', 'prostate', 'preputial-glands', 'accessory-glands'].includes(id)) return 'gland';
  if (id === 'tongue' || id === 'diaphragm') return 'muscle';
  if (has('skeletal')) return 'bone';
  if (has('muscular') && !has('respiratory')) return 'muscle';
  if (/-veins?$|venae|vena-cava|vein-stems|portal-vein|portal-branches/.test(id)) return 'vein';
  if (/-arter(y|ies)$|aorta|artery-stems|cerebral-base|tail-vessels|^(cervical|costocervical)-trunks$/.test(id)) return 'artery';
  if (has('nervous') && /nerves?$|plexus|roots|sympathetic|ganglia/.test(id)) return 'nerve';
  if (/^liver-/.test(id)) return 'liver';
  if (/^kidney-|^renal-medullae$/.test(id)) return 'kidney';
  if (/^lung-/.test(id)) return 'lung';
  if (id === 'small-intestine') return 'gut';
  if (/^heart-(lv|rv|la|ra)$/.test(id)) return 'heart';
  if (/^(cerebrum|striatum|brain-|cerebellum|medulla|olfactory|spinal-cord)/.test(id)) return 'brain';
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
