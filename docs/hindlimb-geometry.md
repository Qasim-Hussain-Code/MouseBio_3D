# Adult mouse hindlimb surface geometry

## Source and coverage

This regional reference derives from the [S1 Figure](https://doi.org/10.1371/journal.pone.0147669.s002) accompanying Charles JP, Cappellari O, Spence AJ, Hutchinson JR and Wells DJ, [Musculoskeletal Geometry, Muscle Architecture and Functional Specialisations of the Mouse Hindlimb](https://doi.org/10.1371/journal.pone.0147669), *PLOS ONE*, 2016. The source and adapted surfaces are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with attribution and modifications recorded in the [asset notice](../public/atlas-hindlimb/LICENSE.md).

The specimen is one adult female C57BL/6 mouse, aged 117 days and weighing 24.9 g. The source covers its right hindlimb and pelvis. It is not a whole-body or population-average reference. The authors report iodine-enhanced microCT acquisition at 12.96 micrometres and subsequent segmentation; acquisition spacing is not a guarantee of surface accuracy or a cellular representation. Published muscle architecture measurements from other animals are not assigned to this geometry.

The source PDF contains 44 named surface products: 37 muscle-named regions, Patellar tendon and six bony or aggregate regions. The paper reports 39 muscles; the difference from the PDF's 37 muscle-named surfaces remains unresolved. Fabellae, Foot and Tibia/Fibula retain their source names and may contain multiple structures. No additional bones, muscle subdivisions, ontology identities or inferred anatomy are introduced.

## Coordinate frame and processing

The original PDF has SHA-256 `aadb7a020f3f9ffc1c8b91f3d8e5f9f2a1eef95d24b0816b69ac4f878637ac47`. Its object 12 contains an unfiltered PRC stream with SHA-256 `c300f38c7888b82b0c2e00548c8d2bb5b879b076872e5e44781da8a8477fc659`. A standalone nanoPRC decoder at commit `24bfa43b7c29203c572892662ec8a5a8e8ae7b96` exported the checksum-pinned JSON intermediate with SHA-256 `0eda5effc49a460fbc89de070baa5d48c940c5f5b0dab1319f5d4f1342629e8c`. The reviewed hierarchy has 44 direct triangle-surface representations with no product placement transforms or referenced local coordinate systems.

A probe of the source PRC records found a valid global unit value of one millimetre, and matching product unit values. Positions are multiplied by 0.001 for metre-valued glTF coordinates. The source origin, axes, names, tessellation indices and triangle indices are retained. This declared source unit does not establish independent physical calibration. The frame `charles2016-hindlimb-prc-native-v1` is separate from both Digimouse frames. There is no accepted registration between them.

The converter preserves 540,165 source vertices including normal seams and 664,210 triangles. Existing source normal directions are retained and renormalized to unit length for glTF. Source diffuse material values remain in the asset; the manifest also records sRGB display colours rounded to eight bits for the viewer. No mesh repair, smoothing, decimation, anatomical registration or fabricated tissue is performed. The maximum float32 position-serialization difference from the scaled decoder coordinates is recorded in the manifest; it measures serialization only, not decoder or anatomical accuracy.

IDs `charles2016-hindlimb:0` through `charles2016-hindlimb:43` are derived from the source tessellation indices and are specific to this reference. Each glTF node carries its index, source name and ID. Experimental observations use those exact IDs and remain separate from observations attached to other references.

## Reproduction

The checked-in GLB and manifest are sufficient for application use. Reproduction requires the original licensed PDF and the specific standalone decoder; neither is bundled with the browser application. Keep the PDF at `data/raw/charles2016-hindlimb-s1.pdf`, which is ignored by Git. Obtain it from the publisher's [S1 Figure download](https://journals.plos.org/plosone/article/file?id=10.1371%2Fjournal.pone.0147669.s002&type=supplementary). Check disk space and the project resource budget before acquiring or compiling tools.

Build the nanoPRC JSON export utility from the pinned revision using its upstream instructions. nanoPRC is separately licensed under AGPL-3.0-or-later; the processing tool is not bundled or linked into the MIT browser application. With the binary available at `.tools/nanoprc-source/local-build/nano_prc_json_export`, run:

```bash
python3 scripts/import_hindlimb.py --extract-source
cd .publication/hindlimb-source
LC_ALL=C ../../.tools/nanoprc-source/local-build/nano_prc_json_export charles2016-hindlimb.prc charles2016-hindlimb.json
cd ../..
python3 scripts/import_hindlimb.py --verify-existing
python3 scripts/test_hindlimb_geometry.py
```

The relative input filename is significant because the decoder records it in JSON. The converter checks exact PDF, PRC and decoder JSON sizes and hashes before processing and rejects unreviewed input. It accepts explicit `--pdf`, `--prc`, `--json` and `--output` paths for controlled local processing. `--verify-existing` compares regenerated GLB bytes by SHA-256 without overwriting the existing asset. Normal conversion writes the GLB and manifest while leaving the original source files unchanged.

## Validation and limitations

The source assessment checked all 44 decoded surfaces for finite positions and normals, valid indices, nondegenerate and nonduplicated triangles, closed edges and consistent winding after exact-position welding. The preliminary generated GLB additionally passed closed cyclic vertex-link checks and was loaded with Three.js GLTFLoader. These are software and numerical checks, not independent anatomical review, clinical calibration, physiological validation, browser rendering or representative hardware performance. See [source assessment](hindlimb-assessment.md) and the project acceptance record for executed integration checks.
