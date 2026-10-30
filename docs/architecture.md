# Technical architecture

MouseBio_3D uses one selected versioned anatomical reference at a time across four exploration modes. Its initial implementation is a static browser application. The local server serves application code and public reference assets; imported research files are read by browser JavaScript and are not uploaded to that server.

## Stack decisions

| Component | Current purpose and reason |
| --- | --- |
| React | Coordinates the anatomical navigator, inspector, mode controls and local data workflow. State remains in memory. No account service or remote application backend is needed. |
| TypeScript | Defines anatomical, experimental, evidence and physiological interfaces. Runtime validators separately check file contents, because static types cannot validate imported scientific data. |
| Three.js | Loads source-derived GLB or registered native PLY assets and constructs browser-local SWC lines, renders independently selectable records and supplies orbit controls, ray picking and surface clipping. Direct Three.js avoids another rendering abstraction in this small prototype. |
| Vite | Builds the static distribution and supplies local development and preview servers. The renderer is loaded separately from the interface so the inventory and data tools can start independently. |
| Python standard library | Converts the fixed, checksum-reviewed MATLAB mesh and inspects the registered volume. The current algorithms do not require a scientific Python environment or Blender installation. |
| Node test runner and tsx | Execute the TypeScript acceptance tests against the same source modules used by the application. |
| Happy DOM and Testing Library | Exercise React controls and local file workflows. These tools do not implement WebGL; the tests explicitly exercise the real renderer's failure path rather than claiming visual browser verification. |

Exact JavaScript versions and package integrity records are retained in `package-lock.json`. Runtime dependency license notices are generated from installed packages by `scripts/third_party_notices.mjs`; the production build rejects stale notices. Blender remains a suitable future mesh preparation tool when an actual dataset requires manual review or an operation not supplied by the current converter. No such operation is currently claimed.

## Module boundaries

`src/domain/types.ts` defines all 14 anatomical system categories, source structures, specimen metadata, model classifications and evidence-bearing biological relationships. `experimental.ts` validates local observations, groups biological subjects and computes descriptive summaries. It neither verifies biological truth nor converts units implicitly. `view-state.ts` serializes display controls with an exact atlas, asset checksum and coordinate-frame binding. `camera-pose.ts` supplies shared numerical guards without importing the renderer. `ontology.ts` checks the proposed term associations while preserving their computational-inference classification.

`src/viewer/ViewerCanvas.tsx` owns the Three.js scene and its lifecycle. `scene-utils.ts` contains tested camera, clipping, display-transform and mesh or line display operations. Anatomy selection, hidden regions, opacity, clipping and camera pose are shared by the modes. Comparison uses the same reference geometry in two synchronized viewports, with a common measurement scale. It does not substitute unobserved treatment, sex or disease anatomy.

The application components expose source annotation, scientific limitations, proposed ontology context and user-declared dataset provenance. These declarations remain distinct: a source segmentation label is not an expert-reviewed ontology crosswalk, and a user-supplied citation is not evidence that the application has verified an observation.

`anatomy-groups.ts` defines display selections only for exact reviewed source inventories. Group IDs are not anatomical identifiers or ontology edges. The application isolates existing members while retaining observations, background and exploration mode. The viewer fits their world-space bounds using the camera aspect, field of view, zoom and roll. Invalid or empty selections leave the camera unchanged; these operations do not alter source coordinates or establish anatomical measurements.

## Anatomical asset pipeline

The Digimouse tetrahedral importer preserves numerical source region IDs, extracts region boundaries, orients surfaces outward, calculates normals and writes one mesh per region. It performs no smoothing, anatomical subdivision or invented completion. The common asset coordinate frame is retained under a documented uniform scale. Viewer centering, display rotation and local animation pivots preserve resting spatial relationships.

The application offers a lightweight 17-region GLB, a separate 21-region volume reference, a 44-surface hindlimb GLB and a 77-surface EMA147 native PLY reference. A user-selected SWC file can supply a separate local line reference without extending the downloadable asset catalog. `atlas-catalog.ts` validates declared source coverage, licenses, checksums and frames. Its private in-memory bank binds observations to the exact reference, asset, frame and region inventory. Switching references saves current observations and retrieves only the chosen reference's own data, with no ID conversion. Reference switching invalidates pending dataset and view reads before loading and again when the switch commits.

The volume importer streams the compressed source, samples an explicitly declared processing grid and extracts categorical interfaces without smoothing or adding labels. A complete 0.4 mm processing reference and 19 optional 0.2 mm regional files have separate checksums. Fine envelope and skeleton surfaces are deliberately unavailable. These spacings describe processing; they do not establish anatomical accuracy. No spatial registration to the tetrahedral reference is accepted.

`region-detail-registry.ts` validates detail declarations without importing Three.js into the initial application bundle. The renderer loads a requested asset with bounded same-origin reads, byte and SHA-256 checks, and self-contained GLB metadata validation. `RegionDetailController` retains at most one finer region per viewer, restores its base on selection changes and discards stale results. A stored source-to-local rest transform preserves registration while leaving the mesh pivot, material and camera unchanged. Compare uses base geometry in both panels. Per-system streaming and further source-supported anatomy remain future work.

`atlas-loader.ts` dispatches a bundled asset to GLTFLoader or the strict native PLY decoder. Its local-trace branch requires the original parser-produced in-memory asset and exact atlas object and performs no file fetch. `asset-fetch.ts` enforces bounded same-origin reads and rejects redirects. `native-ply.ts` validates the registered binary schema, source identities, per-region ranges, finite positions, generated normals, triangles and bounds without assigning metric units. EMA147 coordinates retain numerical scale 1; its image spacing is not an accepted mesh transform. Developmental source ages remain separate attributed claims in `DevelopmentalContext`.

`source-layers.ts` composes trusted source-group memberships into immutable visibility and opacity settings. `SourceLayerControls` stages group choices without changing anatomical metadata. The application resets clipping and regional detail before fitting the resulting source-bound selection. The saved-view schema retains its display result without storing a layer hierarchy.

`local-trace.ts` parses bounded UTF-8 SWC rows, validates the parent forest without recursive traversal, and hashes a copied snapshot of the original bytes. Its immutable result retains numeric source rows without filenames or comment text. Separate private WeakSet guards identify parser-produced assets and atlases; a cloned or constructed manifest cannot obtain a local scene without opening its source file. `local-trace-scene.ts` creates indexed line segments for declared parent links, with no surfaces or radius-derived geometry. Isolated samples remain in the numeric asset but have no display vertices or point glyphs. Source and Float32 display bounds and coincident-link diagnostics remain separate.

The application caches one local geometry asset. Observation banks bind to the exact original-byte checksum, coordinate frame and single trace-record ID. Replacing the geometry does not translate its observations to another trace. The reader checks the latest-request sequence after both file reading and asynchronous digest; reference adoption invalidates pending observation and view reads. A failed import retains the current reference and data. See [local morphology methods](local-morphology.md).

## Physiology and biological scale

The physiological registry binds implemented illustrative processes to explicit atlas and structure IDs. Other systems have extension records with no implemented model. Quantitative models must additionally supply equations, parameter sources, units, numerical methods, assumptions, uncertainty and appropriate independent validation before stronger classifications can be justified. An equation used for display motion is not itself a quantitative physiological model.

Bundled biological detail follows each source's segmented regions. A local SWC supplies user-provided sample points and parent links without independent verification of biological identity, units or cell structure. Focusing or magnifying a mesh does not create tissue or cellular information. Future increases in detail require corresponding source data, explicit anatomical associations and separate provenance. The typed relationship framework can hold observed evidence, computational inference and educational simplification; the prototype does not claim a comprehensive curated connectivity graph.

The separate cardiac-cell worker integrates a parameterized Bondarenko apical model without reading anatomical coordinates or imported observations. Its archived and balanced-transition variants preserve distinct provenance. Numerical reference agreement is integration evidence only. Guided source views validate existing coverage groups before reference adoption; the fictional comparison selects and reveals its existing mapped records without replacing accepted observations or an active read. See [model methods](cardiac-cell-model.md) and [prototype guide](prototype-guide.md).

## Privacy, reproducibility and resource limits

Experimental records, display settings and the single cached local trace live in browser memory. Reloading clears them. Local-trace view exports contain binding and presentation settings, not sample rows; the original file must be reopened to recreate its scene. Dataset and view exports are separate, initiated by the user, and bounded by their validators. Asynchronous file reads cannot overwrite a more recent import, and clearing observations invalidates pending reads. No automatic upload, remote analysis, analytics or browser persistence is implemented. External scientific reference links are ordinary user-initiated navigation.

The reproducible workflow includes pinned dependencies, source checksums, deterministic geometry generation, explicit acceptance tests and complete project storage accounting. Counts include ignored raw data, tools, dependencies, caches, build outputs and Git metadata. Resource reports are snapshots, not guarantees about later downloads or browser memory. Representative Linux Mint and integrated-graphics benchmarks, independent anatomical review and actual browser WebGL acceptance remain separate requirements.

Original documentation is licensed CC BY 4.0 by Qasim Hussain. Third-party data retain their separate source licenses.
