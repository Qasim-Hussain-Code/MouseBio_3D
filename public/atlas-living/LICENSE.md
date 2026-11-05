# Living mouse model

This reference is adapted from Digimouse by Belma Dogdas, David Stout, Arion F. Chatziioannou and Richard M. Leahy, USC Biomedical Imaging Group and UCLA collaborators.

Source: <https://neuroimage.usc.edu/neuro/Digimouse>

Publication: Dogdas B, Stout D, Chatziioannou AF, Leahy RM. Digimouse: a 3D whole body mouse atlas from CT and cryosection data. *Physics in Medicine and Biology*. 2007;52:577-587. <https://doi.org/10.1088/0031-9155/52/3/003>

The source data and this adaptation are licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). Preserve attribution, indicate further changes and comply with ShareAlike when redistributing adaptations. No endorsement by the source authors is implied.

Adaptation by Qasim Hussain for MouseBio_3D. Surfaces were extracted from smoothed masks of the source labels, from CT values and from tissue classes traced in the coregistered images. All of them were then moved to a simulated standing posture. The coat and every structure marked simulated in `atlas.json` are simulated: they are constructed and not measured, and they follow anatomical descriptions in Cook MJ, *The Anatomy of the Laboratory Mouse*, Academic Press, 1965, without reproducing its figures. See [the methods](../../docs/living-mouse.md).
