# Development status

MouseBio_3D is a local scientific exploration prototype. Qasim Hussain is the sole owner and maintainer. The [README](../README.md) is the complete current setup and usage guide. The repository and releases remain private unless Qasim Hussain chooses to make them public.

## Implemented representation

The React, TypeScript and Three.js application provides four separately selected references across four exploration modes. Two Digimouse models derive from one postmortem 28 g normal nude male mouse. A regional hindlimb source describes one adult female C57BL/6 mouse. EMA147 provides developmental TS23 surfaces with unresolved age estimates and unknown physical mesh units. The architecture includes 14 system categories; missing coverage and unreviewed classifications remain explicit.

| Asset | Source coverage | Generated geometry |
| --- | --- | --- |
| Lightweight tetrahedral | 17 source regions with aggregate brain and skeleton | 127,784 triangles; 3,083,672-byte GLB |
| Registered-volume base | All 21 nonbackground labels, including six brain regions, eye, lachrymal and adrenal glands and masseter muscles | 0.4 mm processing; 1,152,516 triangles; 27,648,532-byte GLB |
| Optional volume detail | 19 surfaces for source labels 3 through 21 | 0.2 mm processing; 1,050,980 triangles; 25,249,496 bytes combined |
| Selected original-grid detail | Lachrymal and adrenal glands with unchanged IDs and frame | 0.1 mm processing; 85,736 triangles; 2,060,404 bytes combined |
| Female hindlimb and pelvis | 37 muscle-named regions, one tendon and six bone or aggregate regions | 44 surfaces; 664,210 triangles; 20,981,512-byte GLB |
| EMA147 native source | 76 EMAPA-labelled surfaces and one unannotated reference surface | 374,725 triangles; 10,079,275-byte PLY; unknown coordinate units |

Each reference preserves its source IDs, attribution and coordinate frame. No accepted registration connects the four frames. Numerical labels or bounding boxes do not establish correspondence. Experimental observations remain in separate in-memory banks when switching references. Optional finer surfaces retain the volume base frame and load selectively; Compare uses the same base surfaces in both panels.

The volume source has 0.1 mm isotropic sample spacing; subsampling does not establish anatomical accuracy. Hindlimb PRC units convert uniformly from millimetres to metres without independent calibration. Its figure has 37 muscle-named surfaces while the article reports 39 muscles; the discrepancy remains unresolved. Foot, Tibia/Fibula and Fabellae retain aggregate labels. See [volume methods](volume-geometry.md) and [hindlimb methods](hindlimb-geometry.md).

EMA147 preserves every source triangle and winding in native coordinates. Only 68 surface EMAPA identifiers match the separate anatomy index; eight occur only in each inventory. The reference surface has no asserted anatomical identity. Only 23 of 77 surfaces meet the executed closed-topology checks; defects remain present. Image voxel spacing is not applied to mesh coordinates. TS23 is retained with separately attributed E15.0, 15 dpc and 14.5 dpc claims. Sex, mass and explicit specimen count remain unknown. See [EMA147 methods](ema147-geometry.md).

## Controls and interpretation

Anatomy supports rotation, zoom, pan, selection, search, labels, visibility, isolation, opacity, display-axis clipping, reset and focus. Dark and White control the viewer background. Organs adjusts existing envelope and skeleton opacity. Structure details focuses the selected-region inspector. Source groups isolate existing regions and frame their bounds while retaining camera direction and roll. EMA147 groups select labelled surfaces, three vessel-labelled surfaces, two trigeminal-labelled surfaces or the unannotated reference. Its system classifications remain unreviewed. No group supplies new anatomy, connectivity or registration.

Living provides separate illustrative cardiac and respiratory deformations for Digimouse only. Periods and amplitudes are arbitrary display parameters. Hindlimb and EMA147 have no implemented motion. Experiment and Compare validate local observations, calculate descriptive summaries and compare compatible conditions on the same reference with a common scale. User-declared provenance survives normalized JSON exports; it is not independently verified.

View files preserve display settings, background and an optional validated camera pose, bound to atlas ID, asset checksum and coordinate-frame ID. Supported older files without background default to Dark. Rejected imports leave current settings intact, and observations remain separate. The tetrahedral reference's proposed MA associations retain their computational-inference status and do not transfer to other references.

## Verification and remaining work

Executed checks and their limits are recorded in [acceptance criteria](acceptance.md) and [release notes](releases/v0.6.0.md). Numerical geometry checks, actual Three.js loaders and simulated DOM tests do not establish browser pixels, pointer interactions, representative GPU performance or independent anatomical accuracy. A user-provided screenshot supports only its shown views. Systematic browser interaction, memory and frame-rate checks remain incomplete.

Native anatomical directions and physical calibration remain independently unverified. EMA147 units are unknown. Display-axis clipping is not histological section reconstruction, and magnification adds no biological resolution. Skeleton remains aggregate in Digimouse; developmental vessel and nerve-labelled surfaces do not establish complete adult vascular or peripheral-neural anatomy. Limited source-labelled developmental tissue and layer surfaces are present. Female whole-body, population-average and disease-specific geometry, microscopic histological reconstruction and cellular geometry remain unavailable. No comprehensive connectivity or quantitative physiological model is implemented.

Generated GLB and PLY assets occupy approximately 89 MB. The project cap is 10,000,000,000 bytes including dependencies, caches, archives, intermediates, release artifacts and Git metadata. Full CT, PET and cryosection collections have not been acquired. Linux Mint with 16 GB RAM and integrated graphics remains a target rather than an established benchmark.

Further work requires systematic browser acceptance, hardware measurement, reviewed anatomical orientation and accepted registration before any source combination. Additional anatomy needs documented, reusable sources and explicit coverage. Quantitative physiology requires equations, parameters, units, uncertainty and independent validation.
