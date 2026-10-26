# Development status

MouseBio_3D is a local scientific exploration prototype. Qasim Hussain is the sole owner and maintainer. The [README](../README.md) is the complete current setup and usage guide. The repository and release remain private unless Qasim Hussain chooses to make them public.

## Implemented representation

The React, TypeScript and Three.js application provides two explicitly selected Digimouse references across four exploration modes. Both derive from one postmortem 28 g normal nude male mouse. The architecture includes 14 system categories, with unavailable anatomy disclosed rather than inferred.

| Asset | Source coverage | Generated geometry |
| --- | --- | --- |
| Lightweight tetrahedral reference | 17 source regions, with aggregate brain and skeleton. | 127,784 triangles; 3,083,672 bytes. |
| Registered-volume base reference | All 21 nonbackground source labels, including six CNS regions, eye, lachrymal and adrenal glands and named masseter muscles. | 0.4 mm processing; 1,152,516 triangles; 27,648,532 bytes. |
| Optional volume regional detail | 19 selectable surfaces for source labels 3 through 21; finer residual envelope and skeleton unavailable. | 0.2 mm processing; 1,050,980 triangles and 25,249,496 bytes combined. |

The volume source has 0.1 mm isotropic sample spacing. Processing spacing is a documented subsampling choice and does not establish anatomical accuracy. Deterministic Python converters retain source IDs, checksums, attribution and processing assumptions. They use the standard library, keep raw archives compressed and avoid writing the expanded volume image to disk. See [volume geometry](volume-geometry.md).

References have distinct atlas identifiers, source-label namespaces and frames. No accepted transform relates the volume frame to the tetrahedral frame. They cannot be overlaid or joined by matching numerical labels or bounding boxes. Optional finer regional surfaces preserve the volume base frame and IDs, and load selectively in Anatomy, Living and Experiment. Compare restores the same base surfaces in both panels. Experimental observations are held separately for each reference in memory; switching references does not remap them.

## Implemented controls and interpretation

Anatomy mode supports rotation, zoom, pan, selection, search, labels, system visibility, hiding, isolation, opacity, display-axis clipping, reset and focus. Dark and White control the background. Organs makes the existing envelope and skeleton translucent. Structure details brings the selected-region inspector into focus. These controls add no anatomical structures.

Living mode provides separate illustrative cardiac and respiratory surface deformations, pause and display speed. Periods and amplitudes are arbitrary display parameters. Experimental and comparative modes validate local observations, calculate descriptive summaries and compare compatible conditions on the same selected reference with a common quantitative scale. Dataset provenance controls preserve user-declared title, source, license, sampling notes and origin.

View files preserve display settings, including background, and optionally a validated camera pose. Atlas ID, GLB checksum and frame must match before restoration. Supported older files missing only background default to Dark after strict binding. Rejected imports leave current settings intact; research observations remain separate. Asynchronous file reads use a latest-attempt rule.

The tetrahedral reference has 13 proposed associations with ten MA terms and four explicitly unmapped regions. They retain related, proposed, computational-inference status, references and limitations. They have no independent expert review and do not transfer to volume IDs, alter geometry or map experimental observations automatically.

## Verification and its limits

Focused volume checks passed for topology, source inventory, checksums, coordinates, numerical bounds and deterministic regeneration. Five Python geometry cases inspect synthetic fixtures, the complete base model and all regional details. Two actual Three.js GLTFLoader cases load those assets and check source IDs, bounds and rest transforms. These are numerical and loader checks, not browser-rendering evidence.

The integrated v0.3.0 WSL checks passed 113 JavaScript and simulated DOM cases, 41 Python cases, the TypeScript production build and all five loopback distribution cases. Coverage includes observation restoration and clearing across references, asynchronous switch cancellation, strict regional loading, stale-result disposal and rest-coordinate preservation. Distribution checks inspect both complete references, every regional GLB and notices. The executed scope is recorded in [acceptance criteria](acceptance.md). These results do not establish browser rendering, hardware performance or independent anatomical accuracy.

A user-provided screenshot confirms displayed three-dimensional mouse views. It supports the shown views, not the optional volume renderer or all controls. The simulated DOM harness exercises the expected WebGL startup-failure path. Neither it nor loading a GLB in Node establishes actual browser pixels, camera interactions, playback, downloads, responsive scrolling, network behavior or frame rate. Systematic browser and representative hardware checks remain incomplete.

## Scientific and resource limits

The tetrahedral brain is aggregate; the volume separates medulla, cerebellum, olfactory bulbs, external cerebrum, striatum and rest of brain. Skeleton remains aggregate in both. Individual bones, most individual muscles, peripheral nerves, arteries, veins, histological layers and cells remain absent. Source skin labels describe residual bulk tissue, not independent skin layers. Paired source labels establish no laterality. Female anatomy, developmental stages, population variation and disease-specific geometry are unavailable.

Native anatomical directions and physical calibration remain independently unverified. Display axes and clipping are not calibrated measurements or reconstructed sections. Subsampling can remove thin structures and small components. Separate binary region surfaces can leave gaps at junctions involving several labels. Numerical closure and signed volume do not establish anatomical accuracy. Magnification adds no biological resolution.

Cardiac and respiratory motions are not parameterized or validated physiology. Major-vessel circulation, blood flow, gas exchange and other quantitative processes are unavailable. No comprehensive biological connectivity graph is supplied. Experimental validation checks structure and consistency, not source authenticity, biological truth, independence, causal effects or statistical significance. Technical replicates require documented processing before import.

Generated GLBs occupy approximately 56 MB across both references and all details. The conservative project cap is 10,000,000,000 bytes, including dependencies, caches, archives, intermediates, generated assets and Git metadata. Run resource accounting after changes. Full CT, PET and cryosection image collections have not been acquired. Linux Mint with 16 GB RAM and integrated graphics is the target; the more detailed reference has higher rendering cost, and browser memory and frame rate remain unmeasured on representative hardware.

## Remaining work

Complete integrated acceptance, systematic browser checks and hardware measurement. Establish anatomical orientation and accepted registration before combining source frames. Review proposed ontology associations before increasing their certainty. Add anatomy only from documented, legally reusable sources with explicit IDs and coverage. Any quantitative physiological model requires equations, parameters, units, assumptions, numerical methods, uncertainty and appropriate independent validation.
