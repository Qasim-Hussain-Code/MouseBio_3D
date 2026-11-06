# The zoom from skin to the proton

## What it is

The Living mouse reference has a separate view, opened with "Zoom from skin to atoms" or by zooming on to the skin of the standing animal. It continues the zoom from a block of skin 1.6 mm across to the inside of a proton, about thirteen orders of magnitude in the height of the view. Scrolling moves through eleven levels without a break, and a list of the levels moves directly to any of them. Zooming back out past the block of skin, the Escape key and a button all return to the mouse.

The view is static apart from the zoom and turning. It simulates no movement or process.

## Starting from a tissue

Zooming into a selected structure with **Zoom in**, or zooming right on to a structure in the middle of the view with [all layers together](all-layers.md) open, starts from the tissue that the structure is mostly made of. The first two levels then show that tissue, and the route joins the shared levels at the cell nucleus. A notice names the structure and says that the view is a representative example of its tissue, and not that part of this mouse.

| Starting from | First level, 1.6 mm per unit | Second level, 70 µm per unit | Basis |
| --- | --- | --- | --- |
| Muscle | Fibres in fascicles, capillaries, a small artery, a vein and a motor nerve | Sarcomeres, myofibrils, nuclei under the surface, a motor end plate | Burkholder et al. 1994 |
| Nerve | Epineurium with fat and vessels, perineurium, axons in the endoneurium | Myelinated axons, Remak bundles, a Schwann cell nucleus | Peltonen et al. 2013, on the human nerve; Rigaud et al. 2008 |
| Artery | A femoral artery, vein and saphenous nerve together | Endothelium, smooth muscle between elastic laminae, collagen | Kochi et al. 2013; Wagenseil and Mecham 2009 |
| Vein | The same three together | Endothelium, a thin layer of smooth muscle, collagen | Kochi et al. 2013; Wagenseil and Mecham 2009 |
| Bone | A femur cut across: periosteum, compact bone without osteons, marrow | Osteocytes in lacunae, canaliculi, osteoblasts on the surface | Jilka 2013; Bonewald 2011 |
| Fat | White fat cells, capillaries and small vessels | One droplet in each cell, a rim of cytoplasm, a flattened nucleus | Cinti 2001 |
| Liver | Lobules, central veins, portal triads, plates and sinusoids | Hepatocytes, sinusoids, bile canaliculi | Hammad et al. 2014 |
| Kidney | Tubules cut across, renal corpuscles, a small artery | A corpuscle with podocytes, a tubule with a brush border | Zhai et al. 2006 |
| Lung | Alveoli, a bronchiole, branches of the pulmonary artery and vein | Thin walls, capillaries, type I and II cells, a macrophage | Knust et al. 2009 |
| Small intestine | Villi, crypts, submucosa, two layers of muscle | Absorptive cells with a brush border, a goblet cell, a capillary and a lacteal | Clevers 2013 |
| Heart | Muscle cells cut across, many capillaries, a coronary artery and vein | Striated cells, intercalated discs, capillaries, a fibroblast | Pinto et al. 2016 |
| Brain | Layers of the cortex, entering vessels, white matter | A pyramidal neuron, an astrocyte, an oligodendrocyte, a microglial cell | Keller et al. 2018 |

Every one of these levels is simulated. All positions and counts are generated with a fixed seed, and sizes are estimates, except where a caption gives a measure and its source. The sources support the arrangement that each caption attributes to them. They do not support the generated drawing in detail. Structures for which no route has been made, such as the colon, the spleen and the bladder, say so, and no route of another tissue stands in for them. All routes join the same nucleus level, which was drawn for a keratinocyte, so its size and shape are not specific to the tissue.

## What it is not

The measured data of the Digimouse specimen end at about 0.1 mm. Magnification does not create tissue or cellular detail, so nothing in this view comes from that specimen, and a notice saying so stays on the screen at every level. The view adds nothing to any anatomical reference: no level appears in a manifest, a structure list or a layer of an atlas, and no reference depends on it. The specimen is also a nude mouse, whereas the block of skin carries hair.

## Kinds of evidence

Every level shows its kind of evidence beside its name, with its caption and sources.

| Level | One unit of the scene | Evidence | Basis |
| --- | --- | --- | --- |
| A block of haired skin | 1.6 mm | Simulated | Hummel et al. 1966; Zimmerman et al. 2014 |
| Cells of the epidermis | 70 µm | Simulated | Hummel et al. 1966; Simpson et al. 2011 |
| One keratinocyte | 10.7 µm | Simulated | Simpson et al. 2011 |
| The cell nucleus | 4.6 µm | Simulated | Beck and Hurt 2017; Ou et al. 2017 |
| A chromatin fibre | 300 nm | Simulated | Ou et al. 2017; Luger et al. 1997 |
| One mouse nucleosome | 12 nm | Measured in a crystal | Protein Data Bank 5B1M, Ueda et al. 2017; Luger et al. 1997 |
| Atoms of the DNA | 3 nm | Measured in a crystal | Protein Data Bank 5B1M, Ueda et al. 2017 |
| A carbon atom | 300 pm | Calculated | Clementi and Raimondi 1963 |
| Inside the atom | 3 pm | Calculated | Clementi and Raimondi 1963; Angeli and Marinova 2013 |
| The nucleus of carbon-12 | 12 fm | Schematic | Angeli and Marinova 2013 |
| A proton | 2.4 fm | Schematic | Particle Data Group, Navas et al. 2024 |

**Simulated** means generated with a fixed seed to illustrate a published description. The layers of the skin, the rule of one sebaceous gland to each hair follicle, the upper limit of six layers of cells and the kinds of organelle follow the cited descriptions. Thicknesses, counts, shapes and positions are estimates and were not measured.

**Measured in a crystal** means that each atom lies where the deposited structure places it. The file `public/scale-journey/nucleosome-5b1m.json` holds the 11,986 atoms of the histone and DNA chains of entry 5B1M, resolved at 2.34 angstroms, with coordinates rounded to 0.01 angstrom and water and ions left out. The histones are from mouse, the entry records the DNA as human in origin, and the crystal was grown from a purified particle. Hydrogen atoms are not located at this resolution. The radii of the balls are standard values and are not part of the measurement, and bonds are inferred from distances between atoms.

**Calculated** means dots sampled from a model. The radial distance of each dot is drawn from the density of a Slater orbital, with the effective nuclear charges for carbon given by Clementi and Raimondi (5.673 for 1s, 3.217 for 2s and 3.136 for 2p), and the dots of each orbital are in proportion to the electrons it holds. Slater orbitals are an approximation. They have no radial nodes, so this density is not a full solution for the atom. The dots sample a probability and are not particles.

**Schematic** means a drawing of what is known. Six protons and six neutrons are drawn within the measured charge radius of carbon-12, but nucleons do not sit at fixed places. Two up quarks, one down quark and gluons are drawn within the measured charge radius of the proton, but no size has been measured for a quark, and they are drawn far too large. The sea of gluons and quark pairs is marked only by scattered dots. No smaller structure is known, so the zoom ends there.

## How sizes agree between levels

Neighbouring levels describe the same object at two scales, so that one can fade into the other. The epidermis of the block and the six layers of the next level are both about 30 µm thick. A spinous cell of the epidermis and the keratinocyte of the next level are both about 9 µm across, and both have a nucleus of about 2.1 µm in radius, which is also the nucleus of the level after that. These values are estimates chosen to agree with one another. They are not measurements of a mouse.

## How it works

Each level is built in its own coordinates, in units of its reference length, and is scaled to the height of the view when it is drawn. No single coordinate has to span the whole range, so numerical precision does not limit it. Each level fades over about 0.28 of an order of magnitude and overlaps its neighbours, and the height of the view always shows at least one level. Between its best view and the start of the next level, the view moves to the point that the next level enlarges: the epidermis on the cut face of the block, a spinous cell, the centre of the nucleus, a nucleosome, a carbon atom of the DNA, and a proton. The scale bar is drawn to true length in the plane of that point.

The scenes are in `src/viewer/scale-journey-scenes.ts`, the levels, their sources and the arithmetic of the zoom are in `src/domain/scale-journey.ts`, and the view is in `src/components/ScaleJourney.tsx`. The scene for each level is built only when it first comes near. If the file of atoms cannot be read or is not valid, the two levels that need it stay empty and say so, and nothing is drawn in their place.

`scripts/journey/prepare_nucleosome.py` reduces the deposited file to the file used here. The deposited file is not kept in the repository, and the script refuses any file with a different checksum.

## Sources

- Hummel KP, Richardson FL, Fekete E. Anatomy. In: Green EL, ed. Biology of the Laboratory Mouse. 2nd ed. McGraw-Hill, 1966. <https://www.informatics.jax.org/greenbook/>
- Simpson CL, Patel DM, Green KJ. Deconstructing the skin: cytoarchitectural determinants of epidermal morphogenesis. Nat Rev Mol Cell Biol 2011;12(9):565-80. doi:10.1038/nrm3175
- Beck M, Hurt E. The nuclear pore complex: understanding its function through structural insight. Nat Rev Mol Cell Biol 2017;18(2):73-89. doi:10.1038/nrm.2016.147
- Ou HD, Phan S, Deerinck TJ, et al. ChromEMT: visualizing 3D chromatin structure and compaction in interphase and mitotic cells. Science 2017;357(6349):eaag0025. doi:10.1126/science.aag0025
- Luger K, Mader AW, Richmond RK, Sargent DF, Richmond TJ. Crystal structure of the nucleosome core particle at 2.8 A resolution. Nature 1997;389(6648):251-60. doi:10.1038/38444
- Ueda J, Harada A, Urahama T, et al. Testis-specific histone variant H3t gene is essential for entry into spermatogenesis. Cell Rep 2017;18(3):593-600. doi:10.1016/j.celrep.2016.12.065. Coordinates from Protein Data Bank entry 5B1M, CC0 1.0.
- Clementi E, Raimondi DL. Atomic screening constants from SCF functions. J Chem Phys 1963;38(11):2686-9. doi:10.1063/1.1733573
- Angeli I, Marinova KP. Table of experimental nuclear ground state charge radii: an update. At Data Nucl Data Tables 2013;99(1):69-95. doi:10.1016/j.adt.2011.12.006
- Navas S, et al. (Particle Data Group). Review of Particle Physics. Phys Rev D 2024;110:030001. doi:10.1103/PhysRevD.110.030001

## Limits

No anatomist, cell biologist, structural biologist or physicist has reviewed this view. Its rendering has been checked in software rendering only, by inspecting images at each level and across the changes between levels, and not on a graphics processor. The charge radius of carbon-12 is taken from a search result quoting the table of Angeli and Marinova, because the table itself could not be opened during this work, and the Slater charges come from a secondary table attributed to Clementi and Raimondi. Both should be compared with the original tables.
