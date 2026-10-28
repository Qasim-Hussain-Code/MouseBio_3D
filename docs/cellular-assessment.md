# Cellular morphology source assessment

Reviewed 28 October 2026. This is a metadata assessment for subsequent development. No morphology body, reconstructed surface or cellular coverage has been added to MouseBio_3D.

## Identified source and attribution

The [official Figshare API](https://api.figshare.com/v2/articles/27766452) identifies MouseLight Neuron AA1624, version 1. Its [version history](https://api.figshare.com/v2/articles/27766452/versions) lists only version 1 at review. Preserve the [version-specific endpoint](https://api.figshare.com/v2/articles/27766452/versions/1) and [doi:10.25378/janelia.27766452.v1](https://doi.org/10.25378/janelia.27766452.v1) before subsequent acquisition.

The declared creators are Mary Lay, Tiago Ferreira and MouseLight Project Team.

Citation: Lay M, Ferreira T and MouseLight Project Team. MouseLight Neuron AA1624. Janelia Research Campus; 2024. Dataset version 1. Published 19 November 2024 at 22:35:39 UTC. This publication date does not establish specimen age or acquisition date.

## File declarations and access

The API declares two files totaling 1,157,661 bytes. File formats and media types below are metadata declarations; neither body has been inspected.

| File and repository ID | Declared bytes and media type | Repository-reported supplied/computed MD5 | Stable endpoint |
| --- | --- | --- | --- |
| AA1624.swc, 50605332 | 321,126; text/plain | Both fcb1e32b3782c0bf8e5dd652cf1630e3 | [SWC file](https://ndownloader.figshare.com/files/50605332) |
| AA1624.json, 50605335 | 836,535; application/json | Both 58e5cb6bae425601235262a87e1e9b09 | [JSON file](https://ndownloader.figshare.com/files/50605335) |

Repository MD5 values were read from metadata, not recomputed locally. Body SHA-256 values remain unknown. The landing page returned HTTP 403 and the web-reading service could not retrieve the API, but a bounded WSL metadata request succeeded.

A HEAD-only request to the stable SWC endpoint returned 302. Following its temporary storage redirect with HEAD returned 403. This does not establish an ordinary GET failure; method-specific signed-storage behavior remains unresolved. No morphology GET was attempted. Temporary signed redirect URLs are not retained as provenance or publication links.

## Source-specific licensing

The identified Figshare deposit explicitly declares [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This declaration is recorded for that particular deposit and version.

The separate [official NeuronBrowser terms](https://www.janelia.org/project-team/mouselight/neuronbrowser) state [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) for material found or downloaded from the MouseLight database and NeuronBrowser. These declarations differ. The Figshare declaration must not be transferred to files from another Browser endpoint. Any subsequent deposit-file acquisition still requires inspection of its header and accompanying terms for conflicts before import or redistribution. An uninspected conflicting file-level notice is not resolved by this assessment.

## Scientific limits

The deposit identifies a neuron reconstruction. The inspected metadata do not declare an individual specimen, sex, age, cell type, physical coordinate units, exact Allen CCF release or a file-specific transform. These fields remain null in the [resource registry](../data/resource-registry.json).

The [MouseLight resources page](https://www.janelia.org/project-team/mouselight/resources) describes light-microscopic neuron reconstruction and Allen-reference registration at project level. It does not establish those missing attributes for AA1624 or any transform to Digimouse, EMA147 or the hindlimb reference. Filenames do not establish anatomical identity, measured radii, complete cellular coverage, observed synapses or functional connectivity. No morphology geometry or surface is inferred from the file list.

## Bounded subsequent acquisition

After current resource accounting and rechecking version-specific metadata, a later acquisition can target only AA1624.swc at its stable endpoint. Enforce the declared 321,126-byte size and the same maximum body bound, verify MD5 fcb1e32b3782c0bf8e5dd652cf1630e3, compute body SHA-256 and retain the unchanged original. The JSON morphology is outside this first acquisition plan.

Before import, inspect header licensing, coordinate and radius declarations and SWC structure. Preserve original node IDs and parent references. Check finite values, field meaning, duplicate IDs, missing parents, cycles and disconnected components without silently repairing or completing the reconstruction. Units, specimen metadata and CCF release remain unknown unless file-specific evidence resolves them. A separate morphology reference would require its own documented frame and attribution; matching names or numerical bounds cannot authorize an anatomical overlay.

Original review prose is CC BY 4.0 by Qasim Hussain. Source-declared metadata retain the attributed deposit's terms and the unresolved source-specific licensing distinctions described above.
