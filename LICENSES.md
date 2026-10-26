# License records

Copyright in original project work is held by Qasim Hussain. Qasim Hussain is the sole owner and maintainer. Third-party rights and source attribution remain with their respective holders.

| Material | License | Scope and record |
| --- | --- | --- |
| Original application code, scripts and tests | MIT | [LICENSE](LICENSE). Preserve the copyright and permission notice when redistributing covered software. |
| Original project documentation | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Original prose in the root Markdown documentation and `docs/`, excluding quoted source material, third-party notices and adapted atlas metadata. Attribution: Qasim Hussain, MouseBio_3D. Indicate modifications. |
| Digimouse-derived anatomical geometry and atlas metadata | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | `public/atlas/digimouse.glb` and `public/atlas/atlas.json`. See [the asset notice](public/atlas/LICENSE.md) for attribution and modifications, and the [upstream license statement](https://neuroimage.usc.edu/neuro/Digimouse_license). Preserve attribution, identify modifications and satisfy ShareAlike for adaptations. |
| Retained Digimouse source archive and source labels | Upstream CC BY-SA 4.0 | The archive is kept locally under ignored `data/raw/`; label and license evidence are recorded in `data/provenance/`. The original source license remains applicable. |
| Proposed ontology association table | CC BY-SA 4.0 for the combined table | `data/ontology-candidates.json` preserves Digimouse source-label attribution. MA identifiers and labels retain CC BY 4.0 attribution to Mouse Genome Informatics, The Jackson Laboratory. These are proposed label associations without expert review. |
| Registered-volume assessment and source-label inventory | CC BY-SA 4.0 | `data/volume-assessment.json` records inspected Digimouse labels and derived numerical metadata. The bundled source license is preserved in `data/provenance/digimouse-volume-license.txt`; the assessment generates no anatomical geometry. The processing scripts remain MIT. |
| External scientific resources evaluated but not imported | Source-specific | [data/resource-registry.json](data/resource-registry.json) records review status. A publication's open-access license does not establish the license of a separate dataset. |
| Installed JavaScript dependencies | Respective package licenses | Exact versions are recorded in `package-lock.json`; distribution license files remain in their installed packages. They are not relicensed by the project's MIT license. |
| User-imported experimental data | User or source permissions | Importing or exporting observations does not change their ownership or license. No permission to publish confidential research data is inferred. |

The Digimouse source is attributed to Belma Dogdas, David Stout, Arion F. Chatziioannou and Richard M. Leahy, USC Biomedical Imaging Group and UCLA collaborators. Its source publication is [Dogdas et al. (2007)](https://doi.org/10.1088/0031-9155/52/3/003). The checked-in anatomical adaptation extracts source-region boundaries, orients faces, calculates display normals, converts to glTF and applies a uniform coordinate scale and nonquantitative colours. No endorsement by the source authors is implied.

Documentation licensing does not replace third-party licenses in embedded source descriptions, attribution notices or evidence files. The text of each Creative Commons license is available through the linked official license page. License notices summarize the material included here; they do not grant rights in resources that have not been obtained under compatible terms.
