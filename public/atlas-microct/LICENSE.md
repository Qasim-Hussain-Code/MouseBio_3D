# Rosenhain et al. native micro-CT source notice

The surfaces in this directory are adapted from one scan of the native dataset accompanying:

Rosenhain S, Magnuska ZA, Yamoah GG, Al Rawashdeh W, Kiessling F, Gremse F. A preclinical micro-computed tomography database including 3D whole body organ segmentations. *Scientific Data*. 2018;5:180294. [doi:10.1038/sdata.2018.294](https://doi.org/10.1038/sdata.2018.294). Dataset: [doi:10.6084/m9.figshare.c.4224377.v1](https://doi.org/10.6084/m9.figshare.c.4224377.v1), figshare item 7058615, scan `1_nativeCTdata/M01_0.25h`.

The figshare record of the dataset item declares [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The article is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Attribution to the authors is retained as scholarly practice; no endorsement by the authors is implied.

Modifications by Qasim Hussain for MouseBio_3D: binary interface surfaces of the ten classes of the first organ segmentation file (`Organ1`) and of class 1 of the bed segmentation file, identified as the body, on the original 0.28 mm grid; outward winding and area-weighted normals; retention of the source class indices, names and colours; serialization as glTF. The second segmentation file (`Organ2`) is used only to report agreement. No smoothing, new labels, laterality or anatomical registration has been added. See [micro-CT methods](../../docs/microct-geometry.md).
