# Cellular morphology source assessment

Updated 28 October 2026 after bounded acquisition of the AA1624 SWC. The original file is checksum-verified and retained in ignored local storage. It is not imported into, bundled with or redistributed through MouseBio_3D. The companion JSON morphology remains undownloaded. The initial metadata-only review is preserved below as a historical record.

## Acquired body and numerical findings

The [Figshare version 1 record](https://api.figshare.com/v2/articles/27766452/versions/1), [doi:10.25378/janelia.27766452.v1](https://doi.org/10.25378/janelia.27766452.v1), identifies file 50605332, AA1624.swc. A subsequent bounded HTTPS GET from the stable source endpoint succeeded with exactly 321,126 bytes. Its locally computed MD5 matches the repository value fcb1e32b3782c0bf8e5dd652cf1630e3. Body SHA-256 is 4a29cccabc630684ff35709b0a367b2582a4069b8da1f04eaa5ee5644b3cd6df. Original bytes were preserved by exclusive creation; no repair, deletion or coordinate conversion was applied.

The body contains 5,665 valid seven-column records and 5,664 node-to-parent links, with one root and one connected component. Original IDs are the unique increasing integers 1 through 5,665. Source type-code counts are 1: one record, 2: 5,442 records and 3: 222 records. These numerical codes are not used to infer cell type. No duplicate IDs, missing parents, cycles or nonfinite coordinate or radius values were found. Two zero-length source edges remain present.

All 5,665 recorded radii equal 1. Physical units and the biological meaning of this constant value are unknown. It must not be represented as a measured cell radius or converted to a calibrated diameter.

## Header declarations and remaining unknowns

The acquired header declares strain C57BL/6J and annotation space CCFv3.0. It gives source axis strings X: Anterior-Posterior; Y: Inferior-Superior; Z: Left-Right. These are source declarations, not independently verified anatomical orientation, physical calibration or an accepted transform. The exact CCF data package and dated release remain unknown.

The source field Sample Date contains Thu, 23 Feb 2023 05:00:00 GMT. Its biological event meaning is not resolved and it supplies no specimen age. Individual specimen identity, sex, age, cell type, physical coordinate units and a file-specific transform remain unknown. No registration to Digimouse, EMA147, the hindlimb reference or another application reference is established.

## License conflict and deferred use

The versioned Figshare deposit declares [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), but the SWC header directs readers to project Terms-of-Use at [mouselight.janelia.org](https://mouselight.janelia.org). The header itself does not spell out a license. The [official NeuronBrowser terms](https://www.janelia.org/project-team/mouselight/neuronbrowser) declare [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) for MouseLight database and Browser material. Applicable source-specific scope is unresolved. Asset import and redistribution are deferred pending clarification.

A line or centerline representation is structurally supportable in a separate source-native frame with unknown physical units, retaining original coordinates and every parent link, including zero-length edges. Display line width would be a presentation setting, not measured neuronal diameter. This does not justify reconstructed membrane surfaces, anatomical overlays, synapses or functional connectivity. Structural suitability does not resolve the licensing conflict.

## Historical metadata-only review

The following preserves the initial preflight before SWC acquisition. Statements about uninspected bodies and subsequent acquisition describe that earlier stage. The successful bounded GET and current findings above supersede those earlier access and body-status observations.

Reviewed 28 October 2026. This is a metadata assessment for subsequent development. No morphology body, reconstructed surface or cellular coverage has been added to MouseBio_3D.

### Identified source and attribution

The [official Figshare API](https://api.figshare.com/v2/articles/27766452) identifies MouseLight Neuron AA1624, version 1. Its [version history](https://api.figshare.com/v2/articles/27766452/versions) lists only version 1 at review. Preserve the [version-specific endpoint](https://api.figshare.com/v2/articles/27766452/versions/1) and [doi:10.25378/janelia.27766452.v1](https://doi.org/10.25378/janelia.27766452.v1) before subsequent acquisition.

The declared creators are Mary Lay, Tiago Ferreira and MouseLight Project Team.

Citation: Lay M, Ferreira T and MouseLight Project Team. MouseLight Neuron AA1624. Janelia Research Campus; 2024. Dataset version 1. Published 19 November 2024 at 22:35:39 UTC. This publication date does not establish specimen age or acquisition date.

### File declarations and access

The API declares two files totaling 1,157,661 bytes. File formats and media types below are metadata declarations; neither body has been inspected.

| File and repository ID | Declared bytes and media type | Repository-reported supplied/computed MD5 | Stable endpoint |
| --- | --- | --- | --- |
| AA1624.swc, 50605332 | 321,126; text/plain | Both fcb1e32b3782c0bf8e5dd652cf1630e3 | [SWC file](https://ndownloader.figshare.com/files/50605332) |
| AA1624.json, 50605335 | 836,535; application/json | Both 58e5cb6bae425601235262a87e1e9b09 | [JSON file](https://ndownloader.figshare.com/files/50605335) |

Repository MD5 values were read from metadata, not recomputed locally. Body SHA-256 values remain unknown. The landing page returned HTTP 403 and the web-reading service could not retrieve the API, but a bounded WSL metadata request succeeded.

A HEAD-only request to the stable SWC endpoint returned 302. Following its temporary storage redirect with HEAD returned 403. This does not establish an ordinary GET failure; method-specific signed-storage behavior remains unresolved. No morphology GET was attempted. Temporary signed redirect URLs are not retained as provenance or publication links.

### Source-specific licensing

The identified Figshare deposit explicitly declares [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This declaration is recorded for that particular deposit and version.

The separate [official NeuronBrowser terms](https://www.janelia.org/project-team/mouselight/neuronbrowser) state [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) for material found or downloaded from the MouseLight database and NeuronBrowser. These declarations differ. The Figshare declaration must not be transferred to files from another Browser endpoint. Any subsequent deposit-file acquisition still requires inspection of its header and accompanying terms for conflicts before import or redistribution. An uninspected conflicting file-level notice is not resolved by this assessment.

### Scientific limits

The deposit identifies a neuron reconstruction. The inspected metadata do not declare an individual specimen, sex, age, cell type, physical coordinate units, exact Allen CCF release or a file-specific transform. These fields remain null in the [resource registry](../data/resource-registry.json).

The [MouseLight resources page](https://www.janelia.org/project-team/mouselight/resources) describes light-microscopic neuron reconstruction and Allen-reference registration at project level. It does not establish those missing attributes for AA1624 or any transform to Digimouse, EMA147 or the hindlimb reference. Filenames do not establish anatomical identity, measured radii, complete cellular coverage, observed synapses or functional connectivity. No morphology geometry or surface is inferred from the file list.

### Bounded subsequent acquisition

After current resource accounting and rechecking version-specific metadata, a later acquisition can target only AA1624.swc at its stable endpoint. Enforce the declared 321,126-byte size and the same maximum body bound, verify MD5 fcb1e32b3782c0bf8e5dd652cf1630e3, compute body SHA-256 and retain the unchanged original. The JSON morphology is outside this first acquisition plan.

Before import, inspect header licensing, coordinate and radius declarations and SWC structure. Preserve original node IDs and parent references. Check finite values, field meaning, duplicate IDs, missing parents, cycles and disconnected components without silently repairing or completing the reconstruction. Units, specimen metadata and CCF release remain unknown unless file-specific evidence resolves them. A separate morphology reference would require its own documented frame and attribution; matching names or numerical bounds cannot authorize an anatomical overlay.

Original review prose is CC BY 4.0 by Qasim Hussain. Source-declared metadata retain the attributed deposit's terms and the unresolved source-specific licensing distinctions described above.
