# Acceptance criteria and verification

This record defines the current acceptance criteria and distinguishes software checks, manual visual evidence and scientific review. Test command output is the source for a particular run's result. Overlapping suites must not be added together as independent evidence. Automated tests do not establish anatomical orientation, physical calibration or physiological validation.

## Evidence currently available

Focused registered-volume checks have passed: five Python geometry cases exercise fixtures, the complete 21-label base reference and all 19 finer regional surfaces, and two actual Three.js GLTFLoader cases inspect IDs, bounds and rest transforms. Both conversion commands reproduced identical GLB checksums. These checks establish numerical and loader consistency, not independent anatomical accuracy or browser rendering.

For the integrated source-group work on 2026-10-26, all 128 JavaScript and simulated DOM cases passed with no failures or skips. The 16 interface cases and six regional-loader cases also passed focused reruns after wording and deferred-decoder changes. Coverage includes per-reference observation restoration and clearing, asynchronous cancellation, strict regional loading, registration-preserving replacement, source-group isolation, rolled-camera framing and the Compare base-surface policy. The production TypeScript check, dependency notice check and build passed. During this work, all 41 Python cases passed for the unchanged geometry and release tools: 19 geometry, source-volume and resource-accounting cases, and 22 publication and release cases. These are separate suites; overlapping focused reruns are not added to their totals.

All five production loopback checks passed for the final split build, including every generated code chunk, both references, all finer regional assets and license notices. HTTP delivery is separate from actual browser interaction and rendering.

Focused simulated interface checks passed for Dark and White viewer state across modes, background save and restore, the legacy Dark default, unchanged observations and anatomy, the Organs preset and the Structure details shortcut. These checks do not verify actual pixel colours, responsive layout, physical scrolling or a browser WebGL context.

A user-provided screenshot confirms that three-dimensional mouse views have been displayed in the application. This is manual evidence for the shown views, not validation of the optional volume renderer. It does not establish systematic browser interaction, playback timing, all imports and downloads, scientific accuracy or representative hardware performance. The automated DOM harness deliberately exercises the WebGL startup-failure path; numerical Three.js tests load real assets without browser rendering.

## Feature criteria

| Area | Acceptance criterion | Available checks and remaining limits |
| --- | --- | --- |
| Shared representation | Preserve four modes, 14 system categories, stable source IDs and explicit unavailable coverage. | Domain vocabulary and simulated inventory checks exercise state and disclosure; no completeness claim is supported. |
| Anatomical assets | Preserve the tetrahedral reference's 17 regions and the volume reference's 21 labels as separately identified alternatives; disclose loading failures. | Actual GLB loading, checksums and stable-ID cases support source consistency. The supplied screenshot supports only the shown rendered views. |
| Reference switching | Bind all modes, imports and view files to the selected atlas; retain experimental observations separately without translating IDs. | Source namespaces and frame IDs are explicit. Final integrated switching, restoration and stale-load rejection need coverage; real-browser operation remains pending. |
| Regional detail | Load only requested volume surfaces at 0.2 mm processing, preserving source IDs, frame, visibility and observations; disclose unavailable fine envelope and skeleton. | Numerical and actual-loader checks cover all 19 files. Integrated request, cache, failure and switching behavior must be checked; rendered benefit and resource cost require browser inspection. |
| Coordinates | Preserve each source's relationships under documented transforms; reject assumed registration, anatomical directions or calibrated measurements. | Numerical geometry and scene checks exercise coordinates. Source frames differ, no accepted inter-reference transform exists, and orientation and calibration remain unresolved. |
| Camera and selection | Rotate, zoom, pan, reset, focus, select and synchronize views while preserving camera roll and rejecting unsafe poses. | Scene projection, actual heart-surface ray intersection and serialization cases exercise numerical behavior. Systematic pointer and framing checks in a real browser remain pending. |
| Visibility and sections | Apply labels, hide, isolate, restore, system controls, per-region opacity and consistent clipping half-spaces. | Simulated controls and numerical clipping cases exercise state and picking rules. Occlusion, label placement and section appearance need browser inspection. |
| Viewer backgrounds | Apply Dark or White consistently, including comparison views, and preserve the choice in valid view files. | Focused DOM and view-state checks exercise both values and the supported legacy default. Actual pixel contrast needs visual inspection. |
| Organ visibility and inspector access | Make the body envelope and skeleton translucent without changing geometry; bring the inspector into focus. | Focused DOM cases exercise opacity, observation retention and focus. Responsive scrolling and visual accessibility need browser checks. |
| Illustrative motion | Isolate cardiac and respiratory display deformations, pause and speed without quantitative validation claims. | Domain functions and simulated controls exercise bounded deterministic state. Rendered motion and timing need systematic browser checks. |
| Experimental import | Validate syntax, finite representable values, units, structure mappings, biological subject records, time labels, duplicates and raw and normalized size limits atomically. | Domain boundary and simulated file-input cases exercise validation and latest-attempt ordering. Real browser file interaction remains part of manual acceptance. |
| Summaries and overlays | Preserve grouping variables, means, subject counts, sample SD and readable common legends. | Descriptive calculations, colour functions and DOM legends exercise numeric consistency. Visual colour correspondence and readability need browser inspection. |
| Comparison | Compare compatible conditions on the same anatomy, disclose shared subjects and reject incompatible groups. | Domain and simulated comparisons exercise descriptive differences and common scales. Synchronized rendered views need systematic interaction checks. |
| Provenance and exports | Retain normalized observations and declared provenance in JSON, identify synthetic data and neutralize formula-triggering CSV text. | Domain round trips and captured DOM download blobs exercise exported content. Actual device downloads and source authenticity are separate checks. |
| View save and restore | Bind settings to selected atlas ID, GLB checksum and frame, restore atomically and retain observations separately. | Schema, shared camera and simulated restoration cases exercise source binding and state. Cross-reference files require rejection. A view file does not reproduce animation phase or an entire research session. |
| Local observations | Keep observations in memory per reference, clear locally on request and avoid automatic external transmission. | Source review and controlled DOM requests support local operation. Switching must not cross-map records. Real browser network inspection remains pending. |
| Ontology proposals | Retain related, proposed and computational-inference status, attribution and explicit unmapped regions without changing anatomy or data mappings. | Candidate, adapter and inspector cases exercise the tetrahedral table. Associations do not transfer to the volume namespace; independent expert mapping review remains absent. |
| Registered volume | Preserve all 21 source labels, processing choices, source spacing, limitations and source licensing. | Streamed assessment, geometry and loader checks cover source and generated files. Subsampling can remove small features; neither label presence nor numerical closure establishes anatomical accuracy. |
| Resource budget | Include all project files, dependencies, caches, data, intermediates and Git metadata below 10,000,000,000 bytes. | Accounting cases exercise hidden files, hardlinks, symlink boundaries and budget detection. Run a fresh scan after resource changes. |
| Hardware | Operate on representative Linux Mint hardware with 16 GB RAM and integrated graphics. | This remains a design target. Browser memory, frame rate and representative hardware checks are incomplete. |
| Repository access | Keep repository and release private unless Qasim Hussain chooses otherwise. | Access control is an administrative setting, separate from scientific test results. Local content checks do not authorize a visibility change. |

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
python3 scripts/test_volume_geometry.py
python3 scripts/test_publication.py
python3 scripts/resource_usage.py
```

After building, start `bash scripts/npm.sh run preview` in a separate terminal and check the loopback distribution:

```bash
python3 scripts/test_distribution.py --url http://127.0.0.1:4173
```

A real browser acceptance session should record browser and viewport details and exercise both reference loads, requested finer surfaces, reference switching, pointer controls, labels, backgrounds, opacity, sections, playback, imports, legends, comparisons, view restoration, downloads and network behavior. It should measure memory and frame rate, especially for the volume reference and comparison mode. A screenshot, HTTP response or simulated DOM case alone does not complete that session.
