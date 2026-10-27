# EMA147 native surface geometry

## Representation and interpretation

The EMA147 reference converts the [Edinburgh source surface archive](https://doi.org/10.7488/ds/2167) to a binary PLY representation with an accompanying manifest. It preserves 77 source surfaces: 76 EMAPA-labelled filenames and the unannotated `reference.stl`. The archive contains 374,725 triangles. Source attribution, stage uncertainty, source-index differences and numerical condition are documented in [the assessment](ema147-assessment.md) and [asset notice](../public/atlas-ema147/LICENSE.md).

The PLY contains 185,779 indexed vertices and all 374,725 source triangles. It occupies 10,079,275 bytes, with SHA-256 `8593f83eb1ebf05f17203b9b3b3257adcf04195b7d117ab312efa4ed1a38a75f`. Its ASCII header is 6,038 bytes; the remaining data uses binary little-endian encoding.

The reference identifier is `ema147-native-v1`; its frame is `emouseatlas-ema147-stl-native-v1`. Physical coordinate units are unknown. The converter applies numerical scale 1 and preserves the source origin and axes. It does not apply the MRI image's 80 micrometre voxel spacing to the STL coordinates. The PLY is explicitly a source-native visualization, without a metric glTF interpretation, calibrated measurements, anatomical direction claims or accepted registration to another reference.

The developmental stage is TS23. Estimated E15.0 in the deposition, 15 dpc in the official viewer and 14.5 dpc in the legacy model summary are retained as separate source claims. A single numerical age is not selected. Strain is recorded exactly as `C57BL6`; sex, mass and an explicit source specimen count remain unknown.

## Conversion and identifiers

The converter checks the archive's exact size and SHA-256 and verifies the required source text metadata. It reads the reviewed ASCII STL inventory without changing the raw archive. All source triangles and their winding remain present. Only exactly equal positions are reused within a surface; no vertices are merged between different surfaces. No spatial smoothing, hole filling, mesh repair, decimation or anatomical registration is performed.

Coordinates are stored as float32 values in the binary PLY. Numerical scale is unchanged; final serialization can introduce a small rounding difference measured in unknown source units. The maximum observed difference from parsed source coordinates is approximately 0.00000757 source units. The manifest records the conversion statistics and asset checksum. Serialization precision must not be presented as anatomical accuracy or physical calibration.

Display normals are generated as area-weighted unit vertex normals from the existing triangles. They replace the source STL facet normals for rendering, rather than being claimed as unchanged measurements. Averaging these contributions changes shading without moving geometry. If contributions cancel, a deterministic first incident nonzero triangle supplies the display direction; fallback counts are recorded. No vertex required this fallback in the executed conversion. This procedure does not repair source topology or establish an anatomical surface normal.

The PLY stores six float32 values and a uint32 surface-region index for each vertex, followed by triangle lists with an unsigned-byte count and three uint32 vertex indices. The manifest binds each surface-region index to its original filename, checksum and source annotation. The serialization index follows sorted source filenames and is distinct from the deposited label-volume index.

IDs `ema147:EMAPA:<source digits>` preserve the EMAPA-labelled filename identity. `ema147:reference` denotes only the unannotated source reference surface. The source anatomy index shares 68 identifiers with the surface inventory. Only those exact matches use the table's colours; eight unmatched EMAPA-labelled surfaces and the reference surface use a disclosed neutral display colour. No annotation, colour correspondence or ontology certainty is inferred from file order, geometry or a similar name.

## Reproduction

The checked-in PLY, manifest, source notice and sanitized provenance are sufficient for application use. Reproduction requires the unchanged source archive at `data/raw/emouseatlas-ema147-surfaces.zip` and the three verified source text files in `.publication/ema147-source/`. These raw inputs remain local and ignored. Obtain them through the [repository record](https://datashare.ed.ac.uk/items/5016a5d4-2017-4fdc-a934-964fc2b542ec/full), preserving their exact bytes. The [sanitized provenance record](../data/provenance/ema147-metadata.json) records their checksums and the distinction between image and mesh coordinates.

```bash
python3 scripts/import_ema147.py
python3 scripts/import_ema147.py --verify-existing
python3 scripts/test_ema147_geometry.py
```

The converter accepts `--archive`, `--metadata` and `--output` for controlled local input and output locations. `--verify-existing` requires the regenerated asset to reproduce its existing checksum. Original raw data must be retained. Check the project storage budget before acquisition or generation; all sources, dependencies, intermediates and release artifacts count toward the 10 GB project limit.

## Numerical checks and limits

The source assessment found no nonfinite coordinates, degenerate triangles or duplicate triangles. Exact-position topology checks classified 23 of the 77 surfaces as closed under the executed conditions. The remaining surfaces retain recorded boundary, nonmanifold, winding or vertex-link defects. The representation does not silently remove these defects. Source-native signed volume or length has unknown physical units and is not a calibrated biological measurement.

Asset checks verify the binary layout, source inventory, per-region counts, coordinate bounds, finite positions and display normals, valid indices and the declared source-native frame. They distinguish preservation of known source defects from an assertion that every mesh is closed. Actual browser rendering, representative GPU performance, self-intersection freedom, independent anatomical review and physiological validation require separate evidence. Camera magnification adds no biological resolution.

## Selected-surface inspection

The structure inspector exposes the exact source filename, zero-based serialization index, source EMAPA identifier and exact anatomy-index match separately. The unannotated reference surface receives no inferred identity. Index-unmatched source filenames do not acquire an anatomy-index label by array order or name similarity.

Indexed vertex and triangle counts and expandable topology diagnostics come from the reviewed manifest. Boundary edges, nonmanifold edges, winding conflicts, noncyclic vertex links, degenerate triangles, duplicate triangles and mesh components retain their source-condition meaning. A closed classification refers only to the executed numerical conditions; it does not establish self-intersection freedom or anatomical accuracy. Components describe the indexed mesh rather than biological connectivity. No physical length, area or volume is reported.

The domain summary requires the reviewed asset checksum, archive, frame and source inventory and rejects malformed records. The displayed summary and nested topology are immutable copies. The record updates with selection and is unavailable for other references. This interface adds no geometry, repair, coordinate conversion, ontology certainty or external transmission.
