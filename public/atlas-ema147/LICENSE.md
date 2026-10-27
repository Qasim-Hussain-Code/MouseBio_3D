# EMA147 developmental surface source notice

The native-coordinate surfaces and source labels in this directory are adapted from:

Ruffins S, Jacobs R, Armit C, Burton N, Hill B, Baldock R. 3D mouse embryo model: EMA147, Stage TS23, Age E15.0 (est). University of Edinburgh, College of Medicine and Veterinary Medicine; 2017. [doi:10.7488/ds/2167](https://doi.org/10.7488/ds/2167). [Repository record](https://datashare.ed.ac.uk/items/5016a5d4-2017-4fdc-a934-964fc2b542ec/full).

The repository explicitly distributes the dataset under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). The source and these adapted surfaces retain that license. Preserve the authors, source, license and description of changes when redistributing them. The dataset record identifies related MRI atlas methods in Dhenain M, Ruffins SW and Jacobs RE, *Three-dimensional digital mouse atlas using high-resolution MRI*, 2001, [doi:10.1006/dbio.2001.0189](https://doi.org/10.1006/dbio.2001.0189).

Modifications by Qasim Hussain for MouseBio_3D: parsing the source ASCII STL surfaces, recording their original filenames and EMAPA-labelled identifiers, encoding the existing surfaces as binary PLY and retaining their numerical coordinates in a separate native frame. Display colours use the source label table only where identifiers match exactly; unmatched surfaces use a disclosed neutral display colour. Display normals are generated from the existing triangles. No physical unit conversion, registration, smoothing, mesh repair or inferred anatomy is introduced.

The archive includes an unannotated `reference.stl` surface. It is not assigned the label-table identity of mouse or any missing anatomical component. Source topological defects and differences between the label table and surface inventory remain documented. See [EMA147 assessment](../../docs/ema147-assessment.md), [geometry methods](../../docs/ema147-geometry.md) and the source metadata in `data/provenance/`.
