# Anatomical display groups

`buildAnatomyGroups(atlas)` provides bounded selections of existing anatomical regions for isolation or camera framing. It returns `{ ok, groups, errors }`. Each immutable group contains `id`, `title`, `structureIds`, `description` and `limitations`. These local display-group identifiers are distinct from anatomical source identifiers and ontology terms.

Groups are defined for the reviewed tetrahedral, registered-volume, hindlimb and EMA147 references. The implementation checks the exact reference ID, coordinate-frame ID, complete set of source-region identifiers and original source labels. Hindlimb groups additionally bind the reviewed source PDF checksum and license. Missing, added, duplicate or relabelled regions reject the complete list. An unsupported reference returns an explicit error and no groups. No source IDs are guessed from names or borrowed across references.

| Group ID | Tetrahedral reference | Registered-volume reference |
| --- | --- | --- |
| `whole-mouse` | All 17 source regions | All 21 source regions |
| `brain` | Aggregate brain region 2 | Existing regions 4, 5, 6, 7, 8 and 10 |
| `skeleton` | Aggregate skeleton region 13 | Aggregate skeleton region 2 |
| `muscles` | Unspecified muscle regions 14 and 15 | Masseter-muscles region 11 |
| `organs` | Existing regions except residual body region 1 and skeleton region 13 | Existing regions except residual body region 1 and skeleton region 2 |
| `head-organs` | Unavailable | Eye region 3 and lachrymal-glands region 12 |

Every numeric membership above uses its reference's own source namespace. For example, tetrahedral brain is `digimouse:2`, while volume medulla is `digimouse-volume:4`. The six volume brain labels are explicitly combined as whole brain in the source label file. Selecting them does not create an additional aggregate mesh, improve source resolution or establish cellular detail. The two eye and gland labels are grouped descriptively without asserting comprehensive sensory-system coverage or a new biological relationship.

The muscle group excludes residual body tissue. The tetrahedral labels do not identify named muscles or laterality; they must not be silently called masseter. The volume masseter label provides only that source region, not a complete musculature. Skeleton groups remain aggregate selections without individual bone identifiers. The `organs` group is a convenience that also includes existing muscle regions, rather than an ontology classification.

The hindlimb reference offers all 44 surfaces, 37 source-named muscle regions, six bone or aggregate regions and the source Patellar tendon as separate display groups. `Fabellae`, `Foot` and `Tibia/Fibula` remain aggregate source labels. The paper's count of 39 muscles differs from the figure's 37 muscle-named surfaces; this discrepancy is unresolved. The internal `whole-mouse` group ID retains existing view behavior but is displayed as Whole hindlimb reference for this regional source.

EMA147 groups bind its exact 77 filenames, source archive checksum, frame and license. They select all native surfaces, the 76 EMAPA-labelled surfaces, three source-labelled vessels (basilar artery, vena cava and aorta), two trigeminal-labelled surfaces (ganglion and nerve), or the unannotated reference surface. These are bounded filename-based selections without reviewed system classifications, laterality or connectivity claims. The internal `whole-mouse` ID is displayed as All native source surfaces for this source.

Additional EMA147 selections expose 75 named surfaces without the skin-labelled file and unannotated reference; 15 selected neural-labelled surfaces; six filenames explicitly naming bone or cartilage; and eight filenames naming mesenchyme, a layer, epithelium or urothelium. These are narrow source-label selections. Other skeletal labels are omitted from the explicit bone/cartilage subset, which makes no claim about mineralization or ossification. The tissue/layer subset overlaps the neural subset and supplies no microscopic histological reconstruction or cellular anatomy. The exclusion of skin and reference does not establish that all 75 selected surfaces are anatomically internal or that skin is a closed envelope.

A whole-reference selection means all available source labels, not complete mouse anatomy. The bulk body label must not be interpreted as separately measured skin or muscle. These groups add no geometry, anatomical claims, ontology edges or new spatial registration. Source resolution, missing anatomy, laterality and orientation limitations remain those of the selected reference. Group-based focusing is a camera operation over existing bounds.

The source inventories are preserved in `public/atlas/atlas.json`, `public/atlas-volume/atlas.json`, `public/atlas-hindlimb/atlas.json`, `public/atlas-ema147/atlas.json`, `data/provenance/digimouse-source-labels.txt` and the registered-volume label record in `data/volume-assessment.json`. See [anatomical-inventory.md](anatomical-inventory.md), [volume-geometry.md](volume-geometry.md) and [hindlimb-geometry.md](hindlimb-geometry.md) and [ema147-geometry.md](ema147-geometry.md) for their methods and interpretation limits. Automated membership checks are not independent anatomical review.

The focused acceptance tests in `tests/anatomy-groups.test.ts` use both actual manifests and exercise source membership, exclusions, reference separation, immutable output, unsupported references and altered inventories. These tests do not establish group-isolation behavior or camera interactions in a browser; those require application integration checks.

The application exposes these selections in **Isolate a source group**. Selecting a group hides other regions, gives its members visible opacity, clears clipping, resets optional regional detail to the base surface and requests camera framing. The whole-reference selection restores normal source opacities. **Fit visible regions** reframes the current visible selection. Research observations, background and exploration mode are retained. Manual visibility changes and restored view files use the Current view selector label; saved files still preserve the resulting visibility, opacity and optional camera pose.

The camera helper fits all eight corners of the selected world-space bounds against the current aspect, field of view, zoom, near plane and roll. It retains viewing direction and the camera up vector. Empty, unknown or invalid selections leave the camera unchanged. Camera fitting changes presentation without establishing anatomical orientation or physical measurement.

All seven focused group tests and six new numerical camera-framing cases passed in WSL. Integrated simulated-interface checks cover isolation, source IDs and unchanged observations. These are software and numerical checks; actual browser layout and camera interaction remain separate acceptance work.

Multiple selections can be combined through [source layer composition](source-layers.md). Overlaps are deduplicated by exact source ID without merging meshes or changing their coordinate relationships.
