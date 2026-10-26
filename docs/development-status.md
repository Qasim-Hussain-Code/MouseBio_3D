# Development status

MouseBio_3D is a local scientific exploration prototype. Qasim Hussain is the sole owner and maintainer. The [README](../README.md) is the complete current setup and usage guide; this document separates implemented behavior from unresolved scientific and technical work.

## Implemented representation and controls

The React, TypeScript and Three.js application uses one licensed Digimouse reference across four exploration modes. The architecture includes 14 system categories, while the mesh contains 17 source-labelled regions from one 28 g normal nude male specimen. The GLB has 127,784 triangles and occupies 3,083,672 bytes. The deterministic Python converter preserves source labels, checksums, attribution and processing assumptions.

Anatomy mode supports rotation, zoom, pan, selection, search, labels, system visibility, hiding, isolation, opacity, display-axis clipping, reset and focus. Dark and White switch the viewer background. The Organs preset makes the existing body envelope and skeleton translucent. The Structure details shortcut brings the inspector into focus when it is farther down a responsive layout. No preset adds anatomical structures.

Living mode provides separately controlled illustrative cardiac and respiratory surface deformations with pause and display speed. Experimental and comparative modes validate local observations, calculate descriptive summaries, apply quantitative overlays and compare compatible conditions using the same reference geometry and a common scale. Dataset provenance controls preserve user-declared title, source, license, sampling notes and origin.

View files preserve effective opacity, selected and hidden regions, clipping, labels, background, mode, living controls and an optional camera pose. They bind to the atlas identifier, GLB checksum and coordinate-frame identifier. Supported legacy files missing only the background field default to Dark after strict binding. Rejected imports leave the current state intact. Research observations remain separate from view files, and asynchronous reads follow a latest-attempt rule.

The inspector presents 13 proposed associations with ten generic MA terms and explicitly leaves four regions unmapped. The checked adapter retains related, proposed, computational-inference status, references and limitations. These associations have no independent expert review and do not change geometry, anatomical identifiers or experimental mappings.

The registered Digimouse label volume has been inspected through bounded streamed processing. It contains 21 nonbackground labels, but no volume-derived geometry is rendered. Its numerical coordinates have not been registered to the tetrahedral mesh, and the source label namespaces differ. The assessment documents an additional source without increasing the viewer's 17-region coverage.

## Verification and its limits

Automated checks cover the experimental domain, illustrative functions, numerical scene transformations, actual GLB loading and picking, camera arithmetic, source-bound view serialization, ontology consistency, simulated interface workflows, production delivery, geometry preparation, resource accounting and registered-volume inspection. The complete JavaScript suite, production build and fresh local HTTP distribution checks have passed for the current application source. The current acceptance record is [acceptance.md](acceptance.md); reproducible commands report the result for each particular run.

Focused interface checks passed for shared Dark and White state, save and restore of White, the legacy Dark default, unchanged anatomy and observations, the Organs preset and the inspector shortcut. These are simulated DOM checks, not pixel, scrolling or responsive-layout verification. Publication-check tests also passed using synthetic fixtures.

A user-provided screenshot confirms that three-dimensional mouse views have been displayed. This is manual evidence for the shown views. It does not establish all controls, playback, imports, downloads or performance. The automated DOM harness exercises the WebGL startup-failure path; numerical Three.js tests load the actual asset without a browser renderer. Systematic browser interaction, screenshot comparison, network inspection and representative hardware checks remain incomplete.

## Scientific interpretation

The reference does not represent female anatomy, developmental stages, population variation or disease-specific geometry. Brain and skeleton labels are aggregates. Most individual bones and muscles, peripheral nerves, vessels, tissue layers and cells are absent. The body envelope is residual tissue rather than independently resolved histological skin. Paired labels do not establish laterality. Camera magnification adds no biological resolution.

Native anatomical axis directions and physical calibration remain independently unverified. The tetrahedral mesh derives from a 0.4 mm downsampled atlas, distinct from the registered image's 0.1 mm spacing. Neither value guarantees surface accuracy. Display axes and surface clipping are not calibrated measurements or reconstructed histological sections.

Cardiac and respiratory motions use arbitrary display periods and amplitudes. They are not parameterized or validated physiological simulations. Major-vessel circulation, blood flow, gas exchange and other quantitative processes are unavailable. Other systems have extension interfaces rather than functional models. No comprehensive biological connectivity graph is supplied.

Experimental validation checks record structure and consistency. It cannot establish biological truth, independent sampling, source authenticity, causal effects or statistical significance. Technical replicates require documented processing before import. Ontology associations remain lexical proposals; numerical checks do not substitute for anatomical review.

## Resource and publication boundaries

The conservative storage cap is 10,000,000,000 bytes, including dependencies, caches, raw archives, intermediates, generated assets and Git metadata. Run the accounting script after installations or dataset changes. Symlinks are not followed; host virtual-disk overhead is outside the reported filesystem allocation. Retained source archives are small and compressed. Full CT, PET and cryosection datasets have not been acquired.

Linux Mint with 16 GB RAM and integrated graphics is the hardware target. The development environment and its available memory are not a representative hardware benchmark. Browser memory, frame rate and operation without a dedicated GPU still require measurement.

Research observations stay in browser memory. Local private history is retained. Publication uses a separately reviewed source snapshot with a verified public no-reply Git identity, preserving required project ownership and third-party attribution. The checker reports possible private content and metadata without printing matched values. See [privacy and publication](privacy-and-publication.md).

## Remaining work

Complete systematic browser and hardware verification. Establish anatomical orientation and accepted spatial correspondence before combining the registered label volume with the current mesh. Review ontology proposals before increasing their certainty. Add source-supported anatomy incrementally. Any quantitative physiological model requires documented equations, parameters, units, assumptions, numerical methods, uncertainty and appropriate independent validation.
