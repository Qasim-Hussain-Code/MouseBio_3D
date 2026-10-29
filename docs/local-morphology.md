# Browser-local SWC morphology

The application can open a user-selected SWC trace as a separate local reference through **Open local SWC**. It displays declared node-to-parent links as lines. No AA1624 morphology or other measured trace is bundled with this feature. The [cellular source assessment](cellular-assessment.md) records a separately retained source whose import and redistribution remain deferred.

## Input and graph rules

The simultaneous input limits are 2 MiB (2,097,152 bytes), 100,000 sample records and 4,096 input UTF-8 bytes per line, excluding the line ending. The line bound also applies to comments. Input must be valid UTF-8. Blank lines and lines beginning with `#` after trimming are ignored. Each remaining row must contain exactly seven whitespace-separated numeric fields.

| Column | Reader interpretation |
| --- | --- |
| 1 | Positive, safely representable integer sample ID |
| 2 | Nonnegative integer source type code |
| 3, 4, 5 | Finite X, Y and Z coordinate values within the supported display range |
| 6 | Finite, nonnegative radius field retained as source metadata |
| 7 | Positive parent sample ID, or `-1` for a root |

The [primary SWC specification](https://swc-specification.readthedocs.io/en/latest/swc.html) describes coordinate and radius fields using a micrometre convention and ordinarily places a parent before its children. Those conventions do not independently verify the units or export history of a user file. This reader resolves parents by their explicit IDs after parsing all rows. It accepts forward references, nonconsecutive IDs and acyclic forests with multiple roots.

Duplicate IDs, missing parents, self-parent links, cycles, invalid fields and unsupported numeric ranges reject the import. At least one parent link with nonzero Float32 display extent is required. Some finite coordinate sets cannot be supported by the renderer or camera arithmetic and are rejected. Failure leaves the previous reference, observations and display intact; no partial trace replaces them. A newer file-open or reference-switch request supersedes older pending reads.

## Retained values and scientific limits

The immutable local asset retains sample IDs, type codes, parsed coordinate and radius values, parent IDs and original row order. It does not renumber IDs, infer missing links, repair geometry or apply a physical-unit conversion. Parsing uses JavaScript numeric values and does not preserve the original textual formatting.

Every local trace is assigned unknown physical units. Comment headers are not interpreted as calibration, species, sex, cell type, source attribution, license or CCF registration. Neither a filename extension nor conformity to the numeric format verifies these characteristics. Source type codes are retained without becoming reviewed biological classifications or separate painted compartments.

Radius fields do not determine display thickness. The line material uses linewidth 1 as a presentation setting, with browser-dependent rasterization. It is not a physical radius, measured diameter or reconstructed cell surface. Root-component counts describe the numerical forest; they establish neither cell counts nor specimen counts. Parent links do not establish synapses, functional connectivity or physiological behavior. No physiological animation is implemented for a local trace.

## Display, rounding and selection

Positions are initially serialized into Float32 values for rendering while parsed source values remain in the local asset. The recorded maximum absolute coordinate difference and collapsed-link count describe this initial Float32 serialization only, before display preparation. The coordinate difference is expressed in unknown source units. Source links with coincident endpoints and distinct source links that collapse during initial serialization are counted separately. Their source identities and parent relations remain retained; no repair is applied.

An isolated sample has no incident parent link. It remains in the numeric asset but acquires no point glyph. Zero-length or collapsed links likewise do not become point markers or pickable thickness. The Local trace record reports samples, parent links, root components, isolated samples, zero-length source links and the initial Float32 serialization diagnostics.

The scene is recentered and given the viewer's display rotation for presentation. Compensating the geometry translation with its local transform preserves resting world positions in exact arithmetic. Storing the translated positions in Float32 introduces another rounding step, which can make additional display links coincident. For example, synthetic X coordinates 0, 1 and 1,000,000,000 have zero initial serialization difference; after recentering around 500,000,000, the first two centered vertex-buffer X values both become -500,000,000. The immutable source values and parent links remain unchanged. The recorded initial diagnostics therefore do not measure complete display-preparation or GPU error, and they are not physical accuracy estimates.

These presentation operations establish no anatomical orientation, calibration or registration to another reference. Labels use displayed bounds rather than an inferred soma or anatomical centroid.

Line picking uses an allowance of approximately five CSS pixels at the current camera target depth. This is a selection tolerance, not physical thickness or calibrated distance. Picking selects the local trace record rather than an individual sample ID. Perspective and browser behavior still require actual interaction checks.

## Memory and observation isolation

Trace parsing and display stay on the device. No trace upload, remote analysis or automatic browser persistence is implemented. SWC filenames and comment text are not retained in the parsed asset. SHA-256 binds the complete original file bytes, including comments and line endings, so different headers can produce a different reference even when parsed coordinates agree.

The application caches one local geometry asset. Opening trace B replaces cached trace A geometry. Observation banks remain separate and bind to the exact file checksum, frame and trace record. Switching A to B stores A's current observations and loads only B's own observations. Reopening A from identical original bytes restores A's observations during the same browser session. A previously cached trace must be reopened after another trace replaces its geometry. Reloading clears local geometry and all in-memory observation banks.

Each local file is represented by one trace record for observation mapping. Sample IDs belong to its parent graph; they are not automatically separate experimental structure IDs. Compare mode applies compatible observations to the same selected reference geometry and does not register two different traces.

## Saved views and source responsibility

A saved view contains source binding, display settings and an optional camera pose, with no trace samples or parent-row arrays. It cannot recreate the trace by itself. Reopen the identical original file, select its local reference and then load the view. A view bound to another checksum or selected reference is rejected. Renaming unchanged file bytes does not create a different binding because filenames are discarded.

The application records source license and biological identity as unknown. Numeric validation does not verify provenance, permissions or scientific accuracy. Preserve the original source and its attribution and licensing information separately; opening it locally does not supply redistribution rights.

## Inspect source samples

Source sample explorer exposes original IDs, numeric fields, explicit parents and paginated children without adding experimental structure IDs or physical-unit claims. Focus incident links frames retained portions of the existing geometry. Inspection remains transient and observations stay separate. See [trace sample inspection](trace-sample-inspection.md) for navigation, graph categories, clipping, privacy and verification limits.

## Verification scope

Parser checks, numerical scene checks and simulated DOM workflows provide software evidence. Synthetic fixtures used for these checks do not establish biological accuracy. These results are distinct from actual WebGL pixels, file dialogs, pointer selection, camera interaction, memory use and representative GPU performance. Systematic browser and hardware verification remains incomplete.

Original documentation is CC BY 4.0 by Qasim Hussain. The cited SWC specification and any user-provided source retain their separate applicable terms.
