# Trace sample inspection

Source sample explorer inspects the retained numeric records of an opened local SWC trace or the approved NMO_130632 reference. Original sample IDs remain graph identities. They do not become experimental structure IDs, ontology mappings, cell counts or physiological models.

## Source loading and identity

Local traces use the parser-owned asset already in browser memory, with no request for the original file. For NMO_130632, Inspect source samples explicitly reads the same bundled numeric derivative used for geometry. The bounded same-origin loader checks its byte count, SHA-256, source, graph statistics, unknown-unit frame and processing declarations. This read can occur even if WebGL failed. Inspection and rendering can hold separate parsed copies of that small reference. No imported research file or observation is attached to a request.

The index accepts only parser-produced assets. Its private ID and child-row maps are not a serializable copy of the sample records. Index construction is linear in sample count. Child pages contain at most 20 IDs in original source-row order. Opening another source cancels pending reads and releases the inspector state. An older request cannot populate the replacement reference. Read failures use fixed messages without source filenames, comment text or arbitrary error details.

## Navigation and numerical meaning

Enter an exact positive, safely representable sample ID, then choose Inspect sample. An absent or invalid ID leaves the inspected record intact. Previous source row and Next source row follow original file order, including nonconsecutive or forward-referenced IDs. They do not imply anatomical direction or parent order. Inspect parent follows the explicit parent ID. Child controls show only samples that explicitly name the selected ID as parent, with bounded pagination.

The inspector displays original parsed ID, source type code, X, Y, Z, radius field and parent ID. Source row numbers are one-based display positions, distinct from sample IDs. Numeric presentation does not preserve original token spelling, which remains available in the bundled derivative or separately retained original. Coordinates and radius have unknown physical units. Radius fields do not create measured diameters, cell surfaces or display thickness. Type codes retain source numbers without an independently reviewed compartment or cell-type interpretation.

Numerical graph counts include roots, isolated samples, samples without children and samples with multiple children. A root has parent -1. An isolated sample is a root without children. Samples without children include isolated roots, and samples with multiple children include roots. These categories describe the declared graph only. They do not establish cells, specimens, synapses, biological completeness or functional connectivity.

## Focus existing incident links

Focus incident links frames the selected sample's existing parent link and every declared child link, including children outside the current page. It reads current rendered Float32 positions after recentering and applies their world transforms. It retains only segment portions on the displayed side of the active clipping plane. Hidden, zero-opacity, fully clipped, isolated or coincident-only selections have no focusable extent and leave the camera unchanged. No point glyph, reconstructed membrane, missing branch or extra geometry is added.

The numerical camera fit retains the viewing direction and roll. It does not change clipping, visibility, background or observations. Compare continues sharing the camera pose between panels. Framing rendered coordinates is a display operation, not a physical measurement or accepted anatomical registration. Additional recentering and rendering roundoff still apply.

## State and verification limits

Inspection selection, child pages and graph records are transient and are not included in saved views or observation exports. A focused camera pose can be saved through the existing source-bound view workflow. A local trace still requires its identical original file to restore that view after reloading.

Domain, numerical camera and simulated interface tests provide software evidence. They do not establish actual WebGL pixels, pointer behavior, readable layout, representative GPU performance or independent anatomical review. The attempted Windows visual check stopped when the computer-use runtime could not determine the current browser URL for policy enforcement. No rendered acceptance success is claimed.

See [local morphology](local-morphology.md) and [neuronal morphology](neuronal-morphology.md) for original source binding, licensing, physical-unit uncertainty and rendering precision limits. Original documentation is CC BY 4.0 by Qasim Hussain.
