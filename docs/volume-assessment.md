# Registered Digimouse volume assessment

## Decision and scope

The registered anatomical label volume is a feasible source for later, source-supported anatomical expansion. It has been downloaded and inspected, but no volume-derived browser geometry has been generated. The application still contains the 17 tetrahedral regions recorded in `public/atlas/atlas.json`.

The [official download page](https://neuroimage.usc.edu/neuro/Digimouse_Download) links the registered `atlas.zip`. Before downloading, an HTTP HEAD request established a compressed size of 907,411 bytes. A bounded HTTP range request read the ZIP central directory and established an expanded total of 78,429,222 bytes. This satisfied the assessment limits of 30 MiB compressed and 100 MiB expanded. The image remains inside the original compressed archive in ignored `data/raw/atlas.zip`; no expanded image copy was written to disk. Available disk space was checked locally before processing; private host snapshots are not included in the published assessment.

The archive checksum is `6f7cbd8a7236a78c47a14c3259d387439c0dc0284b2a83fa955f8c49efe11761`. Its bundled `LICENSE.txt` explicitly applies CC BY-SA 4.0 to these Digimouse data. That license is preserved in `data/provenance/digimouse-volume-license.txt`. Anatomical derivatives must retain the relevant attribution and ShareAlike requirements. The original publication is [Dogdas et al., 2007](https://doi.org/10.1088/0031-9155/52/3/003). This assessment does not extend that source's scientific claims.

## Header and label inspection

The archive contains a 348-byte little-endian Analyze header, a 78,407,680-byte image, a 420-byte label file and the license. Header dimensions are `[4, 380, 992, 208, 1, 0, 0, 0]`. Analyze datatype code 2 and bit depth 8 identify unsigned byte label values. Voxel offset is zero. The first three spatial spacing fields are approximately 0.1, subject to ordinary float32 representation. The voxel and calibration unit strings are empty; the official source identifies spacing as 0.1 mm isotropic. The header description is `reorient`, orientation byte is zero, all ten originator bytes are zero, and the final four bytes contain no NIfTI magic.

All values from 0 through 21 occur in the image. The source label file defines the following inventory. These are source labels available for future conversion, not newly implemented model structures.

| Value | Exact source label | Observed voxels |
| --- | --- | ---: |
| 0 | background | 56,025,828 |
| 1 | skin | 16,743,236 |
| 2 | skeleton | 1,182,504 |
| 3 | eye | 5,610 |
| 4 | medulla | 45,765 |
| 5 | cerebellum | 30,596 |
| 6 | olfactory bulbs | 18,466 |
| 7 | external cerebrum | 136,852 |
| 8 | striatum | 26,027 |
| 9 | heart | 222,956 |
| 10 | rest of the brain | 158,599 |
| 11 | masseter muscles | 107,340 |
| 12 | lachrymal glands | 30,414 |
| 13 | bladder | 189,696 |
| 14 | testis | 149,498 |
| 15 | stomach | 225,574 |
| 16 | spleen | 138,872 |
| 17 | pancreas | 44,725 |
| 18 | liver | 2,007,078 |
| 19 | kidneys | 495,102 |
| 20 | adrenal glands | 5,709 |
| 21 | lungs | 417,233 |

The union of labels 4, 5, 6, 7, 8 and 10 is named whole brain in the source. It is not an additional numeric label. Eyes, glands, kidneys, testes and lungs are not separated by laterality in this inventory. The large skin-labelled residual volume must not be described as a separately resolved histological skin layer. The named masseter label does not establish which nonspecific tetrahedral muscle region corresponds to it.

## Coordinates and correspondence

The inspection uses conventional Analyze storage order, with the first index changing fastest. Recorded bounds and centroids are zero-based numerical voxel indices. The source does not provide a verified full affine from these indices to the distributed tetrahedral coordinates. Basic Analyze headers do not encode a full affine, and orientation assumptions made by an image library are not an independent anatomical validation. This limitation is explained in the [NiBabel Analyze documentation](https://nipy.org/nibabel/reference/nibabel.analyze.html).

A simple identity mapping from voxel indices multiplied by nominal 0.1 mm spacing does not reproduce the current tetrahedral bounds. For example, the volume heart bounds become x 14.4 to 23.2 mm, y 35.5 to 45.4 mm and z 5.0 to 11.0 mm under that candidate convention. The tetrahedral heart bounds are x 15.2 to 23.2 mm, y 33.2 to 42.4 mm and z 5.2 to 10.8 mm in interpreted source units. Other named regions also disagree, with substantial differences for liver and skeleton. Downsampling, boundary processing and possible coordinate shifts require explicit assessment. No fitted transformation has been accepted.

The volume and tetrahedral label numbers designate different structures. For example, numeric label 3 denotes eye in the volume and heart in the tetrahedral source. Future volume-derived geometry must use a distinct source namespace and coordinate frame, or an explicit reviewed crosswalk. Combining additional regions with the current tetrahedral scene requires verified spatial correspondence. Replacing the complete reference model with one consistently generated volume-derived model is an alternative, but would still require anatomical, geometry, loading and compatibility review. Neither approach is implemented by this assessment.

## Resource estimates and possible processing methods

A full unsigned byte image occupies 78,407,680 bytes, approximately 74.8 MiB. A separate full-volume byte or Boolean mask requires the same amount. One float32 copy requires 313,630,720 bytes, and one float64 copy requires 627,261,440 bytes. These quantities exclude Python objects, working arrays, mesh vertices, index buffers and topology bookkeeping. Keeping many masks or float copies concurrently would be unnecessary.

The executed standard-library scan uses one 380 by 992 plane and small per-label accumulators. It checks image length, label counts, label-file agreement, ZIP CRC during reading, source checksum, numerical index bounds and centroids. An offline rerun took 3.08 seconds with a measured peak resident set of 29,712 KiB in WSL. No scientific Python packages were installed. These are inspection measurements, not mesh-generation benchmarks.

A chunked converter can retain overlapping image slabs and process one selected label at a time. Two byte planes need only 753,920 bytes before algorithm-specific state. A standard-library exposed-voxel-face or marching-tetrahedra method is possible, but its surface characteristics, boundary conventions and topology must be tested. A mature marching-cubes implementation could justify a later dependency through topology handling and performance. The scientific and memory costs of that choice should be measured before installation. Mesh smoothing or decimation would require separately documented tolerances; neither can be treated as new source resolution.

The next safe step is a bounded conversion of a selected existing source label in an explicitly distinct voxel frame, with numerical tests of geometry, boundary conventions and scale. This should precede any claim of expanded modeled coverage. Named anatomical orientation, independent expert review and a transform to the existing tetrahedral model remain unresolved.

## Reproduction and executed checks

```bash
python3 scripts/assess_volume.py
python3 scripts/assess_volume.py --offline
python3 scripts/test_volume_assessment.py
```

The first command performs the remote size and directory checks before downloading if the archive is absent. The offline command rescans the pinned local archive. `data/volume-assessment.json` records the exact header, archive members, bundled license checksum, observed label counts, index bounds, centroids, nominal label associations, unresolved coordinates and resource estimates. The raw archive is preserved. A changed source checksum requires review. These records do not claim a completed volume import into the application.

All four volume-inspection tests passed in WSL. They cover both header byte orders, an independently specified small volume's counts and index coordinates, rejection of truncated or trailing image bytes, aggregate label handling, and consistency of the recorded source inventory and unresolved registration state. These checks establish the inspection properties exercised by the tests, without validating a new anatomical mesh or named anatomical orientation.
