# Source path inspection

Source path explorer reads the parser-owned regional derivatives for [MVN1 cortical vessels](vascular-source-assessment.md) and the [MouseMapper predicted nerve patch](nerve-source-assessment.md). It adds no geometry, registration, anatomical labels, calibration or physiological model.

## Source identities

Nerve polylines use their original zero-based path-array index. Vascular paths use original graph edge IDs, separately from path-array row, serialized edge-local point index and original graph vertex ID. These identities are not anatomical structures or experimental observation IDs. Exact numeric lookup accepts ID 0; previous and next follow source array order. Original point coordinates and indices appear in pages of at most 20.

Only the vascular source has a separate deposited endpoint graph. Endpoint order preserves original connectivity even where it disagrees with path order. At most 20 incident source path IDs appear per page in source row order, with a self-loop counted once. No parent tree, flow direction, missing link or connection between coincident coordinates is inferred. Nerve units remain unknown; vascular micrometres remain source-declared without independent calibration. Coordinates are source numbers rather than physical measurements or recentered display positions.

## Local reading and memory

Inspect source paths uses the checked same-origin derivative with exact byte size, SHA-256, source identity, license and frame. No observations or imported files are transmitted. A weak reference can reuse a still-live parser-owned asset for the exact manifest object without holding an extra strong source copy. Garbage collection can require a later checked read. No persistent browser storage is introduced.

Indexing occurs once per accepted asset in the mounted session. Selection and pagination do not refetch, reparse or copy the complete source. Source identity maps and a compact incident table support bounded immutable record pages. Invalid identities, offsets or forged inspection capabilities reject without a guessed record. Failed reads use fixed messages. Source changes and unmounting cancel pending reads and exclude stale results.

## Focus and persistence

Focus source path frames visible retained portions of existing consecutive segments using current indexed Float32 positions, path tables, draw range, world transforms and clipping planes. Segment-start entries are ordinals; index-buffer offsets are twice those entries. Camera direction and roll remain unchanged. Hidden, transparent, fully clipped or coincident-only paths leave the camera unchanged. Focus does not alter source geometry, experimental structure selection, background, opacity, visibility, clipping or observations. It adds no markers, radius-derived surfaces or completed branches.

Inspection selection and point or topology records are transient. Saved views can retain the resulting validated camera pose but contain no inspected records. Observation exports remain bound to the complete source structure ID, without graph inspection state. Reference switches retain separate observation banks and never transfer graph IDs or anatomy between frames.

## Verification limits

Acceptance cases cover identities, source order, bounded pages, source ownership, cancellation, fixed errors, unchanged observations and numerical focus behavior. Execution records belong in release notes and development status. Numerical and simulated DOM checks do not establish browser pixels, pointer behavior, GPU performance, physical accuracy, tracing accuracy or independent anatomical review. Numeric paths and topology do not establish individual vessels, nerves, cells, synapses or functional connectivity.

Original documentation is CC BY 4.0 by Qasim Hussain. Source derivatives retain their separate notices and licenses.
