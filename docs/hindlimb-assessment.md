# Adult hindlimb surface assessment

## Source and scope

Charles JP, Cappellari O, Spence AJ, Hutchinson JR and Wells DJ published [Musculoskeletal Geometry, Muscle Architecture and Functional Specialisations of the Mouse Hindlimb](https://doi.org/10.1371/journal.pone.0147669) in *PLOS ONE* 11(4), e0147669 (2016). Their [S1 Figure](https://doi.org/10.1371/journal.pone.0147669.s002) is an interactive three-dimensional PDF containing segmented surfaces. This assessment concerns that supporting figure, not the separately distributed OpenSim model or a whole-body mouse reference.

The geometry specimen is one female C57BL/6 mouse, aged 117 days and weighing 24.9 g, with right hindlimb and pelvic coverage. The paper reports iodine-enhanced microCT at 12.96 micrometre acquisition resolution and segmentation in Mimics. Muscle architecture measurements use four other mice and must not be assigned to the geometry specimen. Acquisition spacing does not establish the final surface accuracy or tissue-level detail.

The article identifies its supporting information as relevant data and links CC BY 4.0. The [PLOS license policy](https://journals.plos.org/plosone/s/licenses-and-copyright) applies Creative Commons Attribution licensing to published works. No third-party exception for S1 Figure was identified. Any derived surface must retain the authors, figure identifier, applicable license and description of conversion. The source remains distinct from the CC BY-SA 4.0 Digimouse assets.

## Retained source and decoding

The publisher's [supplementary download](https://journals.plos.org/plosone/article/file?id=10.1371%2Fjournal.pone.0147669.s002&type=supplementary) was acquired with a bounded download after checking available storage. The unchanged PDF is 9,782,060 bytes, SHA-256 `aadb7a020f3f9ffc1c8b91f3d8e5f9f2a1eef95d24b0816b69ac4f878637ac47`. It is retained among ignored raw sources.

PDF object 12 contains an unfiltered PRC stream. Its indirect length was resolved from the PDF object stream rather than estimated from byte delimiters. The extracted PRC is 9,776,330 bytes, SHA-256 `c300f38c7888b82b0c2e00548c8d2bb5b879b076872e5e44781da8a8477fc659`.

The standalone [nanoPRC decoder](https://github.com/CascadiaVoxel/nanoPRC), pinned at commit `24bfa43b7c29203c572892662ec8a5a8e8ae7b96`, produced a canonical JSON intermediate. This AGPL-3.0-or-later processing tool and its dependency notices remain separate from the MIT browser application. The decoder is not bundled or linked into the application. Its successful exit is evidence of decoding, not independent anatomical validation. The intermediate is 99,950,221 bytes, SHA-256 `0eda5effc49a460fbc89de070baa5d48c940c5f5b0dab1319f5d4f1342629e8c`.

## Observed inventory and numerical checks

The decoded hierarchy contains 46 products: two grouping nodes and 44 named surface products. Each surface product has one direct representation item, referencing a distinct tessellation numbered 0 through 43. All 44 tessellations are supported three-dimensional triangle surfaces. No nested representation items, textures, unknown tessellations or model-tree transforms were observed. The API count of 88 parts includes representation items and is not a count of 88 anatomical structures.

The named inventory comprises 37 muscle regions, Patellar tendon, and six bony or aggregate regions: Fabellae, Pelvis, Femur, Patella, Foot and Tibia/Fibula. These aggregate names must remain unchanged. The article discusses 39 distinct muscles; the difference from the 37 muscle-named surfaces in this PDF remains unresolved. Missing surfaces must not be invented, inferred from the article count or substituted with muscle paths.

The full decoded surface inventory contains 664,210 triangles and 332,137 distinct exact coordinate triples after position-only welding within each surface. Bounded, per-tessellation checks found finite positions and normals, valid triangle indices, no degenerate or duplicated triangles, no open or nonmanifold edges, and opposite winding across every shared closed edge. Every surface has positive total signed numerical volume. Welding is an assessment operation; source vertices and normal seams remain preserved in the intermediate. Source normal lengths differ from one by up to approximately 0.0254, so an eventual glTF conversion must renormalize normals while retaining their directions. These checks do not establish self-intersection freedom, accurate anatomy, physical calibration or rendered appearance.

## Unit records and proof conversion

A separate probe of the parsed PRC structures found one global model record with its unit-from-CAD flag set and a unit value of 1. All 45 source product occurrences also record unit value 1 and have no placement transform. The file contains no referenced local coordinate systems; all 44 representation items have a zero local-coordinate index. The [HOOPS Exchange unit documentation](https://docs.techsoft3d.com/exchange/2025.4.0/guide/units.html) defines this unit value as a millimetre multiple and gives a valid global record precedence. Thus a uniform factor of 0.001 produces metre-valued asset coordinates while retaining source origin and axes. This is a declared file unit, not an independent physical calibration.

An ignored proof GLB preserves all 44 named surfaces, 540,165 source vertices including normal seams, 664,210 triangles, source tessellation indices and diffuse colours. It introduces no geometric smoothing, repairs, decimation, registration or inferred structures. Source normals were renormalized without changing their directions. The maximum coordinate change from final float32 storage is approximately 1.87 nanometres relative to uniformly scaled decoder coordinates; this is a serialization error bound, not anatomical accuracy or an estimate of decoder error.

The proof occupies 20,981,580 bytes, SHA-256 `9865d2dd376405d5d9e32666d8b0c06c5bc9af9edae0b60592e9657bd0c39f0d`. Repeating conversion produced the same checksum. The source PDF, extracted PRC and decoder JSON hashes are checked before conversion. Further numerical checks of the actual GLB passed for all 44 surfaces, including closed cyclic vertex links after position-only welding. A Three.js GLTFLoader acceptance run loaded all surfaces, retained names, indices, numerical bounds and identity rest transforms, and verified unit normals. No actual browser rendering, hardware performance or independent anatomical review was performed.

## Integration status

The maintained conversion, source-specific notices and independent coordinate frame are documented in [hindlimb geometry methods](hindlimb-geometry.md). The regional reference represents one adult female hindlimb specimen, not general female whole-body anatomy, a population reference or validated muscle dynamics. No accepted registration to Digimouse exists. The application acceptance record distinguishes executed software checks from outstanding browser and independent anatomical review.
