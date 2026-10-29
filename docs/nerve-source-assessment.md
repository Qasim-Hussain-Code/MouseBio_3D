# Peripheral nerve geometry source assessment

Reviewed 29 October 2026. The MouseMapper regional nerve example supplies actual sampled polylines in an independently identified source frame. It does not supply complete adult whole-body nerves, a calibrated nerve surface or a registration to another application reference. The active application manifests remain the authority for implemented coverage.

## Primary source and exact inputs

Source publication: Kaltenecker D, Horvath I, Al-Maskari R, et al. A deep-learning framework reveals whole-body perturbations at cell level. Nature. 2026;655:1016-1026. [doi:10.1038/s41586-026-10535-2](https://doi.org/10.1038/s41586-026-10535-2). The [official project page](https://www.erturk-lab.com/research/projects/mousemapper/) and [data portal](https://discotechnologies.org/MouseMapper/) describe whole-mouse nerve and immune imaging. This application adaptation concerns one small predicted nerve-graph example, rather than those complete body scans.

The [official repository](https://github.com/erturklab/mouseMapper) was pinned to commit `7fe04a9ccf37664d76fe548ae226147c0023ceb7`, Git tree `3bb40354a6fdaead5fcf2c866e9f1136148da44b`. The exact geometry source is `graph_module/example_data/4x_graph/patch_volume_4X_0_pred/patch_volume_4X_0_pred.vtk`. The [pinned VTK body](https://media.githubusercontent.com/media/erturklab/mouseMapper/7fe04a9ccf37664d76fe548ae226147c0023ceb7/graph_module/example_data/4x_graph/patch_volume_4X_0_pred/patch_volume_4X_0_pred.vtk) is 60,899 bytes, with SHA-256 `b35b59a1056d04e5992a0e463751ceb89a733d80837e66d951be810899ec3c27`. Its recomputed body hash matches the Git LFS declaration. The unchanged original remains in ignored local storage. No upstream program or pickle was executed.

The separately acquired [example_infraorbital_nerve.zip](https://media.githubusercontent.com/media/erturklab/mouseMapper/7fe04a9ccf37664d76fe548ae226147c0023ceb7/graph_module/example_data/example_infraorbital_nerve.zip) is 1,737,695 bytes, with verified SHA-256 `774f238929c37ec07b3525b527e3cfe398cefbfab3e9e07e490dfd8f3337c982`. Its central directory contains 467 TIFF files and one directory, totaling 728,080,086 expanded bytes. This exceeds the 128 MiB expanded-input bound used for its assessment. No archive entry was extracted or decompressed. Its HFD left-sided source directory does not establish the independent graph patch's specimen, diet, laterality or anatomical location. That correspondence remains unverified.

## Geometry and numerical source condition

The acquired VTK is ASCII legacy POLYDATA. It contains 1,940 finite coordinate records and 84 ordered polyline cells, each with 5 to 124 point references. Their declared consecutive pairs yield 1,876 segments. All 1,940 source points are referenced. These are sampled three-dimensional trajectories, rather than only chords between branch endpoints.

The inspected source has no zero-length segment, self-index segment, duplicate undirected edge or graph cycle. It has 64 numerical connected components, with component sizes of 6 to 539 points. Components and polyline cells are not counts of nerves, axons, cells or biological disconnections. Zero-based source point-array and polyline indices remain serialization identities rather than independently annotated anatomical structures.

Source coordinate bounds are `[1, 1, 101]` to `[298, 298, 298]` in unknown units. A numeric bound does not establish voxel units, physical spacing, anatomical axes or a transform. Individual specimen, sex, age, diet, laterality and exact anatomical subregion remain unresolved. The broader study's animal and imaging declarations are not assigned to this file by assumption.

The original radius arrays are inconsistent. POINT_DATA declares 1,940 points but its radius field contains 2,290 tuples. CELL_DATA declares 84 cells but its radius field contains 145 tuples. No mapping is inferred by truncating, reordering or dropping selected values. These fields do not control line thickness, create radius-derived surfaces or supply calibrated measurements. Their discrepancies remain in `sourceAttributesOmitted`, and the unchanged original preserves all source values.

## Deterministic line adaptation

The converter checks the original byte count and SHA-256, parses bounded finite point values and explicit polyline indices, and writes compact JSON with a final LF. The schema is `mousebio.polyline.v1`, with only `points` and `paths` arrays. Every parsed numeric coordinate, source point order, source polyline order, zero-based index and consecutive connection is retained. No merging, smoothing, scaling, repair, missing branch or inferred biological parent is introduced. VTK headers and all inconsistent radius attributes are omitted from the adaptation and recorded as modifications.

The derivative `mousemapper-patch0-lines.json` is 55,658 bytes with SHA-256 `e59fea98d4f41adab6149eee38e28ea6c3737dfa37013d5a2039e89c4c3ef0ce`. Its independent reference is `mousemapper-nerve-patch0-v1`, coordinate frame `mousemapper-nerve-patch0-native-unknown-units-v1`, and single observation-mapping structure `mousemapper-nerve:patch0`. Source and asset units remain unknown and numerical scale is 1. No accepted registration connects it to Digimouse, EMA147, the hindlimb or the neuronal reference.

Positions use Float32 values for display. Initial serialization produces a maximum absolute coordinate difference of approximately `0.000015136718729991117` unknown source units and no collapsed source segments. These diagnostics precede recentering and GPU arithmetic. They do not establish total rendering error, physical accuracy or independent anatomical validation.

With the separately retained original available, regenerate and verify in Linux or WSL:

```bash
python3 scripts/prepare_mousemapper_nerve.py
python3 scripts/prepare_mousemapper_nerve.py --verify-existing
python3 scripts/test_mousemapper_nerve.py
```

The converter performs no download. Its pure JSON validator counts numerical components including isolated points, retains cyclic or zero-length links when present in supported input and never converts a graph to an inferred biological tree. The pinned example itself has no isolated points, cycles or zero-length links. Tests requiring the ignored original are explicitly skipped when that source is absent from a plain distribution.

## License scope and attribution

This repository-distributed example is accompanied by the pinned root [Apache License 2.0](https://github.com/erturklab/mouseMapper/blob/7fe04a9ccf37664d76fe548ae226147c0023ceb7/LICENSE). No additional data license, NOTICE or copyright file was found in the inspected recursive tree. The root, nerve-module and graph-module READMEs contain no separate example-data exclusion or conflicting grant. The acquired VTK body contains no additional license or copyright marker. The [asset notice](../public/atlas-nerve/LICENSE.md) reproduces the complete original repository license and retains scientific attribution and a description of modifications.

This scope is limited to the repository-distributed example. It does not transfer the repository software license to separately hosted Webknossos image collections. The Nature article has its own CC BY 4.0 publication license, which is not substituted for the example's repository notice. Original application processing and viewer code remains MIT. Source geometry and adapted source metadata retain the Apache-2.0 attribution and notice record.

## Verification and remaining limits

The 12 executed Python cases cover exact hashes, every source point and path, omitted radius diagnostics, deterministic regeneration, finite and resource bounds, malformed indices and metadata, cycles, isolated points, Float32 collapse, a 20,000-point path and unchanged original data. These are source and software checks. Runtime loaders, scene tests and interface checks are separate evidence; no browser-rendering or independent anatomical success follows from these Python results.

The broader [whole-body maps](https://discotechnologies.org/MouseMapper/) remain relevant to later complete-system development, but no bounded reusable complete-body mesh or graph package and no separate image-collection redistribution license were verified in this review. The small regional example must not be presented as a complete peripheral nervous system, adult healthy-anatomy reference, measured membrane surface, functional connection map or anatomical overlay. No nerve extension, missing connection, radius association, label or registration is generated.

Original assessment prose is CC BY 4.0 by Qasim Hussain. Cited sources retain their separate applicable licenses.
