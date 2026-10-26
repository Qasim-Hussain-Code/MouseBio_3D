# Acceptance criteria and verification

This record defines the current acceptance criteria and distinguishes software checks, manual visual evidence and scientific review. Test command output is the source for a particular run's result. Overlapping suites must not be added together as independent evidence. Automated tests do not establish anatomical orientation, physical calibration or physiological validation.

## Evidence currently available

The complete JavaScript suite, production build and fresh local HTTP distribution checks have passed for the current application source. The JavaScript checks exercise the experimental domain, numeric boundary cases, illustrative functions, colour mapping, source-bound view serialization, camera arithmetic, scene transforms, actual-GLB loading and ray intersection, ontology consistency and simulated interface workflows. Python checks have exercised mesh preparation, resource accounting and streamed registered-volume inspection. Production checks exercise notices, compilation, bundling and local HTTP delivery.

Focused simulated interface checks passed for Dark and White viewer state across modes, background save and restore, the legacy Dark default, unchanged observations and anatomy, the Organs preset and the Structure details shortcut. These checks do not verify actual pixel colours, responsive layout, physical scrolling or a browser WebGL context.

A user-provided screenshot confirms that three-dimensional mouse views have been displayed in the application. This is manual evidence for the shown views. It does not establish systematic browser interaction, playback timing, all imports and downloads, scientific accuracy or representative hardware performance. The automated DOM harness deliberately exercises the WebGL startup-failure path; numerical Three.js tests load the real asset without browser rendering.

## Feature criteria

| Area | Acceptance criterion | Available checks and remaining limits |
| --- | --- | --- |
| Shared representation | Preserve four modes, 14 system categories, stable source IDs and explicit unavailable coverage. | Domain vocabulary and simulated inventory checks exercise state and disclosure; no completeness claim is supported. |
| Anatomical asset | Load the 17 source regions with independently identified mesh nodes and report loading failure. | Real GLB loading, checksum and stable-ID cases support source consistency. The supplied screenshot supports the shown rendered views. |
| Coordinates | Preserve source relationships under documented transforms; avoid unsupported anatomical directions or calibrated measurements. | Numerical geometry and scene checks exercise coordinates. Anatomical orientation, calibration and cross-dataset registration remain unresolved. |
| Camera and selection | Rotate, zoom, pan, reset, focus, select and synchronize views while preserving camera roll and rejecting unsafe poses. | Scene projection, actual heart-surface ray intersection and serialization cases exercise numerical behavior. Systematic pointer and framing checks in a real browser remain pending. |
| Visibility and sections | Apply labels, hide, isolate, restore, system controls, per-region opacity and consistent clipping half-spaces. | Simulated controls and numerical clipping cases exercise state and picking rules. Occlusion, label placement and section appearance need browser inspection. |
| Viewer backgrounds | Apply Dark or White consistently, including comparison views, and preserve the choice in valid view files. | Focused DOM and view-state checks exercise both values and the supported legacy default. Actual pixel contrast needs visual inspection. |
| Organ visibility and inspector access | Make the body envelope and skeleton translucent without changing geometry; bring the inspector into focus. | Focused DOM cases exercise opacity, observation retention and focus. Responsive scrolling and visual accessibility need browser checks. |
| Illustrative motion | Isolate cardiac and respiratory display deformations, pause and speed without quantitative validation claims. | Domain functions and simulated controls exercise bounded deterministic state. Rendered motion and timing need systematic browser checks. |
| Experimental import | Validate syntax, finite representable values, units, structure mappings, biological subject records, time labels, duplicates and raw and normalized size limits atomically. | Domain boundary and simulated file-input cases exercise validation and latest-attempt ordering. Real browser file interaction remains part of manual acceptance. |
| Summaries and overlays | Preserve grouping variables, means, subject counts, sample SD and readable common legends. | Descriptive calculations, colour functions and DOM legends exercise numeric consistency. Visual colour correspondence and readability need browser inspection. |
| Comparison | Compare compatible conditions on the same anatomy, disclose shared subjects and reject incompatible groups. | Domain and simulated comparisons exercise descriptive differences and common scales. Synchronized rendered views need systematic interaction checks. |
| Provenance and exports | Retain normalized observations and declared provenance in JSON, identify synthetic data and neutralize formula-triggering CSV text. | Domain round trips and captured DOM download blobs exercise exported content. Actual device downloads and source authenticity are separate checks. |
| View save and restore | Bind display settings to atlas ID, GLB checksum and frame, restore atomically and retain private observations separately. | Schema, shared camera and simulated restoration cases exercise source binding and state. A view file does not reproduce animation phase or an entire research session. |
| Privacy | Keep observations in memory, clear locally on request and avoid automatic external transmission. | Source review and controlled DOM requests support local operation. Real browser network inspection remains pending. Publication has its own source and metadata review. |
| Ontology proposals | Retain related, proposed and computational-inference status, attribution and explicit unmapped regions without changing anatomy or data mappings. | Candidate, adapter and inspector cases exercise the current table. Independent expert mapping review remains absent. |
| Registered volume | Inspect source labels without assuming a registration or increasing rendered coverage. | Streamed assessment cases exercise headers, counts, bounds and rejection paths. No accepted transform or volume-derived viewer geometry exists. |
| Resource budget | Include all project files, dependencies, caches, data, intermediates and Git metadata below 10,000,000,000 bytes. | Accounting cases exercise hidden files, hardlinks, symlink boundaries and budget detection. Run a fresh scan after resource changes. |
| Hardware | Operate on representative Linux Mint hardware with 16 GB RAM and integrated graphics. | This remains a design target. Browser memory, frame rate and representative hardware checks are incomplete. |
| Publication hygiene | Review the exact source snapshot, identity metadata, required attribution and possible private data before release. | Synthetic checker cases exercise redacted findings, tracked versus index scope, historical identity detection and unchanged history. Pattern scanning is not a complete security audit. |

## Reproduce the checks

Run the normal project checks from the checkout:

```bash
bash scripts/validate_all.sh
```

Run only the affected checks when a bounded change does not require the complete pipeline:

```bash
bash scripts/npm.sh test
bash scripts/npm.sh run check
bash scripts/npm.sh run build
python3 scripts/test_geometry.py
python3 scripts/test_resources.py
python3 scripts/test_volume_assessment.py
python3 scripts/test_publication.py
python3 scripts/resource_usage.py
```

After building, start `bash scripts/npm.sh run preview` in a separate terminal and check the loopback distribution:

```bash
python3 scripts/test_distribution.py --url http://127.0.0.1:4173
```

Before publication, check the selected source and index snapshot. Include history only in the checkout whose history will actually be distributed:

```bash
python3 scripts/check_publication.py --tracked
python3 scripts/check_publication.py --staged --include-git-metadata
python3 scripts/check_publication.py --tracked --include-history
```

The publication scan is separate from routine scientific acceptance because private local development history can be retained while a sanitized source snapshot is published. See [privacy and publication](privacy-and-publication.md). A real browser acceptance session should record browser and viewport details and exercise model loading, pointer controls, labels, backgrounds, opacity, sections, playback, imports, legends, comparisons, downloads and network behavior. A screenshot, HTTP response or simulated DOM case alone does not complete that session.
