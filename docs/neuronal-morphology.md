# NeuroMorpho.Org neuronal morphology reference

The NMO_130632 reference provides an independently selectable mouse neuronal reconstruction as source samples joined by their declared parent links. It retains 11,650 sample records and 11,649 parent links in a separate coordinate frame. It supplies neither whole-brain cellular coverage nor an accepted registration to Digimouse, EMA147 or the hindlimb reference. One selectable reconstruction record is not a count of specimens or cells inferred from the graph.

## Source and attribution

The exact source is the [NeuroMorpho.Org standardized SWC download](https://neuromorpho.org/dableFiles/tolias/CNG%20version/2016-01-06-slice-D-cell-7-rotated.CNG.swc), reconstruction NMO_130632, Tolias archive, with [record-specific metadata](https://neuromorpho.org/api/neuron/id/130632). The associated source publication is Scala F, Kobak D, Shan S, et al. Layer 4 of mouse neocortex differs in cell types and circuit organization between sensory areas. *Nature Communications*. 2019;10:4174. [doi:10.1038/s41467-019-12058-z](https://doi.org/10.1038/s41467-019-12058-z).

The [repository terms](https://neuromorpho.org/useterm.jsp) grant CC BY 4.0 for downloaded material and request the original publication, NeuroMorpho.Org (RRID:SCR_002145), and Tecuatl C, Ljungquist B, Ascoli GA. Accelerating the continuous community sharing of digital neuromorphology data. *FASEB Bioadv*. 2024;6(7):207-221. [doi:10.1096/fba.2024-00048](https://doi.org/10.1096/fba.2024-00048). These attributions remain in the manifest and [asset notice](../public/atlas-neuron/LICENSE.md).

The related [original study deposit](https://zenodo.org/records/3336165), doi:10.5281/zenodo.3336165, identifies an original morphology archive. That archive was not downloaded. A similarly named original SWC appears in its archive preview, but original-to-standardized byte correspondence and the actual transformation have not been verified. The distributed adaptation therefore binds specifically to the NeuroMorpho.Org standardized file.

## Deterministic numeric adaptation

The unchanged original is retained locally under ignored `data/raw/`. It is 448,329 bytes with SHA-256 `a8340628eb02051416ad0607e72b60cba9241eb34c9be10b0c7df01771b5cfce`. Its comment header includes contact and machine metadata, so the original is excluded from source snapshots and release archives. The required scientific and licensing attribution is preserved separately.

The preparation script checks this exact original byte count and checksum before conversion. It removes comments and blank lines, joins the seven original numeric tokens with one ASCII space, retains original token spelling and row order, and terminates each row with LF. The result is 424,092 bytes with SHA-256 `0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5`. No sample, parent link, type code or radius value is removed or repaired. No physical scaling or shrinkage correction is performed.

With the separately retained original available, regenerate or verify from a Linux or WSL terminal:

```bash
python3 scripts/prepare_neuromorpho.py
python3 scripts/prepare_neuromorpho.py --verify-existing
python3 -m unittest discover -s scripts -p test_neuromorpho.py
```

These commands perform no network request. The bundled adaptation and manifest suffice for application loading and numerical checks. Tests that require the ignored original are explicitly skipped in a plain source distribution.

## Graph identity and numerical findings

The adaptation retains source sample IDs 1 through 11,650 and every explicit parent ID. Its graph has one root and one component, with no isolated samples, missing parents, duplicate IDs, self-parent links or cycles. Source type-code counts are 1: 3 samples, 2: 10,394 samples and 3: 1,253 samples. These are source numerical classifications, not reviewed cell-type counts or separately reconstructed compartments.

Source bounds are X -204.54 to 280.5, Y -215.35 to 311.23 and Z -31.03 to 81.68 in unknown source units. The source has no zero-length links, and no distinct source link collapses during initial Float32 position serialization. The maximum initial absolute coordinate difference is approximately 0.00001464843751364242 in unknown source units. These diagnostics precede display recentering and do not bound total display-preparation or GPU error. They are not measurements of physical accuracy. The [local morphology methods](local-morphology.md) explain the shared line representation and later rounding limitation.

The runtime uses the checksum-bound numeric adaptation and source manifest. Its single observation-mapping structure ID is `neuromorpho:130632`; sample IDs remain within the source graph and do not become experimental structure IDs. Line thickness is a presentation setting. Source radius fields are retained without creating measured diameters, reconstructed membranes or cell surfaces.

## Source declarations and unresolved interpretation

The source metadata declare mouse, adult, primary visual cortex layer 4. They also list interneuron, basket, Large, Fast-spiking and Parvalbumin (PV)-positive classifications. Those source declarations are retained without independent biological review. The combined sex string Male/Female and age limits of 50 and 330 days do not establish an individual sex or exact age. Sex, scalar age, strain, mass and explicit specimen count remain unknown.

The source reports 15 percent shrinkage and states that it is not corrected. The application does not apply a correction. Source completeness declarations are not independent evidence of biological completeness, especially for an in vitro reconstruction. No physiological behavior, synapse, functional connectivity or quantitative network is inferred from parent links.

The original header's unitless SCALE 1.0 1.0 1.0 does not establish physical units. The generic SWC micrometre convention likewise does not independently verify this file's export history or calibration. Source and asset units remain unknown, their numeric scale is 1, and physical calibration and anatomical directions remain unverified. The metadata's pia-axis note explicitly refers to the original morphology file. It is not transferred to the standardized frame without a verified transformation. No overlay or coordinate matching to another anatomical reference is provided.

## Inspect source samples

Source sample explorer exposes original IDs, numeric fields, explicit parents and paginated children without adding experimental structure IDs or physical-unit claims. Focus incident links frames retained portions of the existing geometry. Inspection remains transient and observations stay separate. See [trace sample inspection](trace-sample-inspection.md) for navigation, graph categories, clipping, privacy and verification limits.

## Verification scope

Preparation checks validate original and derived hashes, preserved numeric tokens, finite supported coordinates, explicit graph identities, parent completeness, acyclicity, bounded input and numerical diagnostics. Runtime and simulated DOM tests provide separate software evidence. They do not establish actual WebGL pixels, pointer selection, representative GPU performance or independent anatomical accuracy. Systematic browser interaction and hardware acceptance remain incomplete.

Original documentation is CC BY 4.0 by Qasim Hussain. Adapted source data retain the separately attributed CC BY 4.0 notice above.
