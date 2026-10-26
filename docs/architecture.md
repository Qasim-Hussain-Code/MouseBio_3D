# Technical architecture

MouseBio_3D uses one versioned anatomical reference across four exploration modes. Its initial implementation is a static browser application. The local server serves application code and public reference assets; imported research files are read by browser JavaScript and are not uploaded to that server.

## Stack decisions

| Component | Current purpose and reason |
| --- | --- |
| React | Coordinates the anatomical navigator, inspector, mode controls and local data workflow. State remains in memory. No account service or remote application backend is needed. |
| TypeScript | Defines anatomical, experimental, evidence and physiological interfaces. Runtime validators separately check file contents, because static types cannot validate imported scientific data. |
| Three.js | Loads the source-derived GLB, renders independently selectable regions and supplies orbit controls, ray picking and surface clipping. Direct Three.js avoids another rendering abstraction in this small prototype. |
| Vite | Builds the static distribution and supplies local development and preview servers. The renderer is loaded separately from the interface so the inventory and data tools can start independently. |
| Python standard library | Converts the fixed, checksum-reviewed MATLAB mesh and inspects the registered volume. The current algorithms do not require a scientific Python environment or Blender installation. |
| Node test runner and tsx | Execute the TypeScript acceptance tests against the same source modules used by the application. |
| Happy DOM and Testing Library | Exercise React controls and local file workflows. These tools do not implement WebGL; the tests explicitly exercise the real renderer's failure path rather than claiming visual browser verification. |

Exact JavaScript versions and package integrity records are retained in `package-lock.json`. Runtime dependency license notices are generated from installed packages by `scripts/third_party_notices.mjs`; the production build rejects stale notices. Blender remains a suitable future mesh preparation tool when an actual dataset requires manual review or an operation not supplied by the current converter. No such operation is currently claimed.

## Module boundaries

`src/domain/types.ts` defines all 14 anatomical system categories, source structures, specimen metadata, model classifications and evidence-bearing biological relationships. `experimental.ts` validates local observations, groups biological subjects and computes descriptive summaries. It neither verifies biological truth nor converts units implicitly. `view-state.ts` serializes display controls with an exact atlas, asset checksum and coordinate-frame binding. `camera-pose.ts` supplies shared numerical guards without importing the renderer. `ontology.ts` checks the proposed term associations while preserving their computational-inference classification.

`src/viewer/ViewerCanvas.tsx` owns the Three.js scene and its lifecycle. `scene-utils.ts` contains tested camera, clipping, display-transform and mesh-pivot operations. Anatomy selection, hidden regions, opacity, clipping and camera pose are shared by the modes. Comparison uses the same reference geometry in two synchronized viewports, with a common measurement scale. It does not substitute unobserved treatment, sex or disease anatomy.

The application components expose source annotation, scientific limitations, proposed ontology context and user-declared dataset provenance. These declarations remain distinct: a source segmentation label is not an expert-reviewed ontology crosswalk, and a user-supplied citation is not evidence that the application has verified an observation.

## Anatomical asset pipeline

The Digimouse tetrahedral importer preserves numerical source region IDs, extracts region boundaries, orients surfaces outward, calculates normals and writes one mesh per region. It performs no smoothing, anatomical subdivision or invented completion. The common asset coordinate frame is retained under a documented uniform scale. Viewer centering, display rotation and local animation pivots preserve resting spatial relationships.

The initial asset is a single small GLB. Per-system streaming, mesh levels of detail and progressive high-resolution assets are future work, rather than implemented loading features. A future asset needs its own source version, license, checksum, specimen, resolution, frame and transformation history. It must not be silently mixed with another specimen or reconstruction. The registered-volume assessment demonstrates this requirement: its nominal organ labels do not establish coordinate identity with the tetrahedral model.

## Physiology and biological scale

The physiological registry binds implemented illustrative processes to explicit atlas and structure IDs. Other systems have extension records with no implemented model. Quantitative models must additionally supply equations, parameter sources, units, numerical methods, assumptions, uncertainty and appropriate independent validation before stronger classifications can be justified. An equation used for display motion is not itself a quantitative physiological model.

The current biological detail is the source segmented region. Focusing or magnifying a mesh does not create tissue or cellular information. Future increases in detail require corresponding source data, explicit anatomical associations and separate provenance. The typed relationship framework can hold observed evidence, computational inference and educational simplification; the prototype does not claim a comprehensive curated connectivity graph.

## Privacy, reproducibility and resource limits

Experimental records and display settings live in browser memory. Dataset and view exports are separate, initiated by the user, and bounded by their validators. Asynchronous file reads cannot overwrite a more recent import, and clearing observations invalidates pending reads. No automatic upload, remote analysis, analytics or browser persistence is implemented. External scientific reference links are ordinary user-initiated navigation.

The reproducible workflow includes pinned dependencies, source checksums, deterministic geometry generation, explicit acceptance tests and complete project storage accounting. Counts include ignored raw data, tools, dependencies, caches, build outputs and Git metadata. Resource reports are snapshots, not guarantees about later downloads or browser memory. Representative Linux Mint and integrated-graphics benchmarks, independent anatomical review and actual browser WebGL acceptance remain separate requirements.

Original documentation is licensed CC BY 4.0 by Qasim Hussain. Third-party data retain their separate source licenses.
