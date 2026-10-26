# Anatomical inventory

This inventory separates the scope of MouseBio_3D from the actual anatomical coverage of its initial dataset. All 14 requested systems belong in the architecture. Availability of one representative organ does not establish system completeness. The source reference for every entry below is the [Digimouse tetrahedral atlas](https://neuroimage.usc.edu/neuro/Digimouse_Download), its bundled `labels_4_tetrahedrons.txt`, and the [resource registry](../data/resource-registry.json).

## Imported source labels

The distributed tetrahedral atlas contains 17 numeric region labels. Project identifiers are `digimouse:1` through `digimouse:17`; the suffix preserves the original numeric label. These identifiers are not reviewed MA, EMAPA or UBERON mappings. The [asset manifest](../public/atlas/atlas.json) provides per-structure metadata, and [the import script](../scripts/import_digimouse.py) documents the conversion. Bilateral pairs remain separate selectable regions without an assigned side until laterality can be established from documented orientation or other reliable evidence.

| Source label | Source wording | Interpretation permitted in this prototype |
| --- | --- | --- |
| 1 | inside skin (muscle) | Bulk body tissue region. It is not an inventory of individual muscles and must not be named as a segmented skin layer. |
| 2 | brain | Aggregate brain region. No separate brain subdivisions or peripheral nerves. |
| 3 | heart | Aggregate heart region. No chambers, valves, coronary circulation or conduction system. |
| 4 | bladder | Aggregate urinary bladder. No urethra or ureters. |
| 5 | stomach | Aggregate stomach. No histological layers. |
| 6 | spleen | Aggregate spleen with lymphatic and immune relevance. No internal splenic microanatomy. |
| 7, 8 | kidneys | Two source kidney regions. Laterality is not asserted. No nephron detail. |
| 9, 10 | lungs | Two source lung regions. Laterality and lobar identity are not asserted. No bronchial tree or alveoli. |
| 11 | pancreas | Aggregate pancreas. Endocrine and exocrine tissue are not separately resolved. |
| 12 | liver | Aggregate liver. No lobes, bile ducts or internal vascular tree. |
| 13 | skeleton | Aggregate skeleton. Individual bones are not separately identified. |
| 14, 15 | muscle | Two source muscle regions. Specific muscle names and laterality are not asserted. |
| 16, 17 | testis | Two source testicular regions. Laterality is not asserted. No ductal or microscopic detail. |

The supplied exterior hull can provide a body envelope for orientation and transparency. It does not create an independently segmented anatomical skin layer. Surface extraction and display colors are technical adaptations of the source geometry, not new anatomical observations.

## Required systems and current gaps

| System | Initial source coverage | Explicitly unavailable in the imported mesh |
| --- | --- | --- |
| Skeletal | Label 13, aggregate skeleton | Independent bones, joints, cartilage and bone microarchitecture |
| Muscular | Labels 1, 14, 15, bulk tissue and unnamed muscle regions | Named individual muscles, insertions, tendons, muscle fibers and validated function |
| Central and peripheral nervous | Label 2, aggregate brain | Spinal cord as an independent region, named brain subdivisions, peripheral nerves and ganglia |
| Cardiovascular | Label 3, aggregate heart | Heart chambers, valves, conduction system, coronary vessels and validated hemodynamics |
| Arterial and venous circulation | No separate source vessel labels | Arteries, veins, capillary beds and documented vascular connectivity |
| Respiratory | Labels 9 and 10, aggregate lung regions | Airways, independent trachea, bronchi, alveoli and diaphragm |
| Digestive | Labels 5, 11, 12, stomach, pancreas and liver | Esophagus, intestine, salivary glands, gallbladder, ducts and organ wall layers |
| Urinary | Labels 4, 7, 8, bladder and kidney regions | Ureters, urethra, renal subdivisions and nephrons |
| Male and female reproductive | Labels 16 and 17, testicular regions from a male specimen | Remaining male reproductive structures and all female reproductive geometry |
| Endocrine | Label 11 contains pancreatic tissue; endocrine compartment unresolved | Independent pancreatic islets, pituitary, thyroid, parathyroids, adrenal glands and endocrine connectivity |
| Lymphatic | Label 6, spleen | Lymph nodes, lymphatic vessels and drainage paths |
| Immune | Label 6, spleen | Independently identified thymus, marrow, immune cell populations and molecular activity |
| Integumentary | Exterior body envelope only; label 1 is inside-skin bulk tissue | Independently segmented skin, epidermis, dermis, hair follicles and cutaneous glands |
| Sensory organs | No separate labels in this tetrahedral archive | Independently identified eyes, ears, olfactory organs and sensory microstructures |

The broader Digimouse website describes structures that are not separate regions in this archive, including eyes, lacrimal glands, adrenal glands and brain subdivisions. Those descriptions do not justify inventing mesh boundaries or treating the selected archive as if it contained them.

## Extending coverage

A future structure needs a stable project identifier, original source identifier, system memberships, source asset and version, source-specific license, coordinate frame, specimen metadata, resolution, processing history, and evidence status. A term-level ontology crosswalk should name the reviewed mapping and record uncertainty. An unreviewed match must not be represented as an established anatomical identity.

At organism and organ scales, navigation uses the available source surfaces. Tissue, cellular and molecular detail requires additional datasets or explicitly identified associations. Camera zoom does not change the available biological resolution. Histology, cell types and molecular associations are not supplied by this mesh.

No imported geometry has yet received independent expert anatomical review. Numerical topology and coordinate checks test the implementation and source consistency; they do not establish anatomical completeness or physiological validity.

Original documentation is licensed CC BY 4.0 by Qasim Hussain. Digimouse source data and adapted anatomical material retain CC BY-SA 4.0 obligations.
