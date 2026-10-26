# Geometry preparation and coordinate conventions

## Source and scope

The initial model uses the [official Digimouse tessellated archive](https://neuroimage.usc.edu/neuro/Digimouse_Download). Its 306,773 tetrahedra use 58,244 source nodes and 17 numerical region labels. The distributed label file is preserved verbatim in `data/provenance/digimouse-source-labels.txt`. The anatomical model is licensed separately under CC BY-SA 4.0; see `public/atlas/LICENSE.md` and the [upstream license](https://neuroimage.usc.edu/neuro/Digimouse_license).

The mesh derives from a downsampled 0.4 mm atlas used for the optical simulation in [Dogdas et al. (2007), section 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC3006167/). The registered source images have 0.1 mm isotropic voxels. Neither nominal image spacing establishes mesh accuracy. This distinction matters when assessing small structures.

The broad residual tissue label is displayed as "Body envelope / residual tissue". It contains the outer body boundary and internal organ cavities. It does not resolve skin independently from muscle. The skeleton and brain are aggregate regions. Numbered paired regions retain their source numbers because the label file does not establish laterality. Missing vessels, nerves, tissues and cells are not represented with invented geometry.

## Reproduction

Use Python 3.10 or later in WSL or Linux. The converter has no third-party Python dependencies.

```bash
python3 scripts/import_digimouse.py --download
python3 scripts/test_geometry.py
```

The optional download performs a size check, limits the archive to 50 MiB, and preserves any existing raw archive. The reviewed 4,163,774-byte archive is pinned by SHA-256. A different checksum requires review before the importer is changed. Archive extraction is not performed: two known members are read directly, with a bound on uncompressed size. The MATLAB reader supports only the dense numerical array layout in this reviewed source; unsupported layouts fail explicitly.

For each region, triangles shared by two same-region tetrahedra are removed. Remaining triangles are oriented away from their adjacent tetrahedron. Shared interfaces between different regions appear in each region independently. Source nodes are compacted to surface nodes, area-weighted vertex normals are calculated, and one indexed glTF 2.0 mesh is written per region. No smoothing, mesh decimation, interpolation, spatial registration, or anatomical subdivision is applied. Display colours convey identity only.

The output has 127,784 triangles, 63,958 vertices including repeated interfaces between regions, and a 3,083,672-byte GLB. `public/atlas/atlas.json` records input and output checksums, source labels, region counts, bounding boxes, attribution, and limitations. Repeated conversion with unchanged input is deterministic.

## Coordinates

The source array `r` contains Cartesian coordinates without explicit anatomical orientation or unit tags. The numerical extents are consistent with millimetres in the registered atlas. The conversion interprets them as millimetres and scales all coordinates by 0.001 to metre-valued glTF positions. Native axis order, origin, and all relationships between regions are preserved. The resulting extents along native x, y and z are approximately 0.0324, 0.0872 and 0.0192 m.

This physical scale is an interpretation rather than independent calibration. Native anatomical axis directions have not been independently verified. The application must not infer laterality, offer calibrated measurements, or label anatomical directions from this convention alone. Viewer rotations and translations are display operations; they do not change the registered source frame. Future frames require explicit, versioned transformations. Source tetrahedra and converted surfaces must remain associated with the same frame identifier.

Mesh node names and `extras.structureId` use `digimouse:1` through `digimouse:17`. glTF loaders can sanitize punctuation in object names, so selection should use `extras.structureId`, exposed as `Object3D.userData.structureId` in Three.js. Each node has no translation or rotation; its positions remain in the common source coordinate frame after scaling. Animation pivots must preserve the resting geometry.

## Executed geometry checks

`scripts/test_geometry.py` checks a single tetrahedron's outward winding, removal of a known shared face, stable source IDs, GLB headers and buffers, checksums, inventory counts, finite coordinates, valid indices, unit normals, duplicate triangles, nonzero triangle areas, positive signed volume, closed edges, and consistent edge winding. The initial conversion passed all seven tests in WSL.

These tests establish numerical and topological consistency under the implemented checks. They do not establish anatomical accuracy, correct named orientation, physiological validity, or independent expert review. The source registration and segmentation limitations remain relevant.

The Node acceptance tests in `tests/viewer-data.test.ts` load the actual GLB through Three.js, verify all region identifiers and documented bounds, check all 63,958 loaded surface vertices after display and animation-pivot preparation, and ray cast against the actual heart triangles. `tests/scene-utils.test.ts` exercises camera up-vector synchronization, display transformations, shared geometry, rotated and scaled parents, manually maintained local matrices, clipping half-spaces, and rejection of invalid inputs. The twelve tests across these two files passed in WSL. These are numerical tests without a WebGL context. Browser rendering, mouse and touch controls, visual transparency, and user-interface layout require separate browser acceptance checks and are not established by these results.
