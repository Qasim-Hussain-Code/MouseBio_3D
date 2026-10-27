# EMA147 developmental source assessment

## Source, attribution and reuse

The [University of Edinburgh deposition](https://datashare.ed.ac.uk/items/5016a5d4-2017-4fdc-a934-964fc2b542ec/full), [doi:10.7488/ds/2167](https://doi.org/10.7488/ds/2167), distributes EMA147 under CC BY 4.0. Its 2017 citation names Seth Ruffins, Russell Jacobs, Chris Armit, Nick Burton, Bill Hill and Richard Baldock. The source-specific license applies to the deposited data; the license of a separate publication is not used as a substitute. Adaptations retain the citation, license and description of modifications in the [asset notice](../public/atlas-ema147/LICENSE.md).

The retained `Surfaces.zip` is 11,393,742 bytes, with repository MD5 `a05d23a90e7ff8368bfaa77238a897d8` and inspected SHA-256 `efd5df6df9b69cf21a62d1f4245ecc5419ee4e5c4c72635f444ce3fba5b7971c`. It contains 77 ASCII STL files occupying 71,761,523 bytes when expanded and 374,725 triangles. The raw archive remains unchanged in ignored local storage. No CT, MRI or histological volume is implied to be present merely because surfaces are available.

The related publication identified by the deposit is Dhenain M, Ruffins SW and Jacobs RE, *Three-dimensional digital mouse atlas using high-resolution MRI*, *Developmental Biology* 232(2):458-470, 2001, [doi:10.1006/dbio.2001.0189](https://doi.org/10.1006/dbio.2001.0189). It describes the broader MRI atlas methodology and is not independent validation of each deposited surface or annotation.

## Declared developmental metadata

The verified `model_info.txt` declares Theiler stage TS23, model EMA147, strain `C57BL6`, full three-dimensional anatomical delineation and MRI at 11.7 Tesla. It records 80 by 80 by 80 micrometre image voxels, 4 percent PFA preparation and Fomblin embedding. These are image and preparation declarations, not measurements of surface accuracy or proof of a metric STL frame.

The source age claims disagree. The deposition title and citation use estimated E15.0; the [official EMA147 viewer](https://www.emouseatlas.org/eAtlasViewer_ema/application/ema/anatomy/EMA147.php) displays 15 dpc; the [legacy model summary](https://emouseatlas.org/emap/ema/modelsummary/modelsummary.html) lists 14.5 dpc. TS23 is retained as the consistent stage. A single numerical age is not selected. Sex, mass and an explicit specimen count are absent from the inspected text metadata. The presence of an ovary-labelled surface does not supply a verified sex declaration.

## Surface and label inventories

The archive contains 76 filenames with source EMAPA identifiers and one unannotated `reference.stl`. The deposited anatomy index also contains 76 nonbackground labels, but its inventory differs from the surface files. Only 68 EMAPA identifiers match exactly. Eight identifiers occur only in the index and eight only in surface filenames. Neither archive order nor label-table order establishes a mapping.

| Inventory difference | Source identifiers |
| --- | --- |
| Index only | EMAPA:16057, EMAPA:16978, EMAPA:17023, EMAPA:19134, EMAPA:25765, EMAPA:32710, EMAPA:32718, EMAPA:32740 |
| Surface only | EMAPA:16979, EMAPA:17296, EMAPA:17533, EMAPA:17535, EMAPA:17674, EMAPA:17795, EMAPA:17888, EMAPA:18143 |

The index-only mouse label is not assigned to `reference.stl`. Source file identities and names are preserved independently of the table. The 68 exact matches can retain their source-table colours; unmatched surfaces require an explicitly identified display fallback. Source EMAPA-labelled filenames are retained as source annotations, not upgraded to independently reviewed ontology mappings. The [preserved index](../data/provenance/ema147-source-index.txt) and [metadata record](../data/provenance/ema147-metadata.json) record the distinction.

## Coordinates and numerical condition

No source text inspected declares the physical unit or an accepted image-to-STL transform for the deposited meshes. The [official viewer configuration](https://www.emouseatlas.org/eAtlasViewer_ema/application/ema/anatomy/EMA147/tiledImageModelData.jso) declares image voxel size, disables voxel scaling and provides presentation transforms. The [surface viewer code](https://www.emouseatlas.org/eAtlasViewer_ema/javascript/utils/threeDAnatomy.js) loads surface data without a declared physical-unit conversion. These observations do not establish a metric STL scale. Matching bounds or expected embryo dimensions would not supply the missing evidence.

Numerical inspection found no nonfinite coordinates, degenerate triangles or duplicate triangles. Only 23 of the 77 surfaces meet the executed closed-manifold conditions. Across the source files, checks found 1,411 boundary edges, 2,285 nonmanifold edges, 11 inconsistent-winding edges and 4,139 noncyclic vertex links. These counts are source-condition diagnostics; they do not establish self-intersection freedom or independent anatomical accuracy. No silent repair closes, reorients or fills these surfaces.

The application treats EMA147 as a visualization in a separate native-coordinate frame, with unknown physical units and identity numerical scale. It provides no calibrated measurements, cross-reference registration or physiological validation. [Geometry methods](ema147-geometry.md) describe the representation and executed software checks.
