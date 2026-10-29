# Vascular geometry source assessment

Reviewed 29 October 2026. This assessment documents a separately identified mouse cortical vascular line reference. Source acquisition, numeric conversion and runtime evidence have distinct scopes. Active reference manifests remain the authority for implemented coverage.

## Selected sampled-path source

[Zenodo 5115640](https://zenodo.org/records/5115640), version 1, identifies baseline networks MVN1 and MVN2 from mouse somatosensory cortex. The [primary API](https://zenodo.org/api/records/5115640) declares `cc-by-4.0`. The deposit credits Franca Schmid, Giulia Conti, Patrick Jenny and Bruno Weber and accompanies [doi:10.7554/eLife.60208](https://doi.org/10.7554/eLife.60208).

| Selected archive | Declared bytes | Repository MD5 |
| --- | --- | --- |
| SimulationResults_Baseline.tar.bz2 | 23,200,621 | a3e96da42b5c08ff724a2e922f5b01f9 |

The [stable content endpoint](https://zenodo.org/api/records/5115640/files/SimulationResults_Baseline.tar.bz2/content) identifies the exact target. The documentation declares sampled curved vessel coordinates in micrometres through the per-edge `points` field, plus connectivity and numeric vessel categories. Other fields contain effective diameters and simulation results. Additional path-analysis dictionaries need not be imported for anatomical display. A general cyclic graph representation would preserve the vascular topology; converting it into an acyclic SWC forest would lose information. Executed numeric counts and conversion checks are recorded below; source documentation alone does not establish them.

## Smaller endpoint-only alternative
[Zenodo 1306230](https://zenodo.org/records/1306230), version 1, deposited by Franca Schmid, also declares `cc-by-4.0` in its [API](https://zenodo.org/api/records/1306230). The selected `MVN1_wpPs.tar.bz2` file is 674,337 bytes with MD5 `9c2b97598b43dc9b22f6cb19fd3e8675`. Its [stable endpoint](https://zenodo.org/api/records/1306230/files/MVN1_wpPs.tar.bz2/content) is file-specific.

This smaller record documents vertex coordinates in micrometres, edge connectivity, effective diameters and tortuous lengths. It does not declare sampled curved trajectories. Straight endpoint links could show its topology, but their shapes and chord lengths must not be presented as measured vessel paths or arc lengths. The `wpPs` suffix denotes a passive-particle simulation variant, not a specimen category. Simulated flow, pressure and hematocrit do not establish implemented or independently validated physiology in MouseBio_3D. This alternative was not selected for acquisition during the present preflight.

## Geometry, preprocessing and specimen limits

Original geometry is attributed to Blinder P, Tsai PS, Kaufhold JP, Knutsen PM, Suhl H and Kleinfeld D. The cortical angiome: an interconnected vascular network with noncolumnar patterns of blood flow. *Nature Neuroscience*. 2013;16:889-897. [doi:10.1038/nn.3426](https://doi.org/10.1038/nn.3426). Regional cortical microvasculature is not adult whole-body arterial and venous anatomy.

The [2017 methods](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1005392), Schmid F, Tsai PS, Kleinfeld D, Jenny P and Weber B, document changes to vessel categories and diameter distributions for simulation. Effective diameters cannot be advertised as unchanged measured lumen boundaries. The [2019 methods](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1007231) distinguish reused networks from separate in vivo velocity measurements. The latter cohort's female sex and age range must not be assigned to MVN1. Exact network-to-specimen identity and age remain unresolved.

Declared micrometre coordinates do not independently verify physical calibration, anatomical directions or registration. The imported reference retains its own independent frame. Fitting the network inside Digimouse by matching bounding boxes would not establish anatomical correspondence. Neither model-adjusted diameters nor simulated fields supply measured vessel surfaces or observed blood flow.

## Bounded source-body review

Check total project storage and disk space before acquisition. Acquire only the selected checksum-pinned archive with an enforced byte cap, retain the unchanged body in ignored storage and compute its SHA-256. Inspect bounded member sizes and safe relative paths without following links or extracting arbitrary files. Ordinary Python unpickling can execute code; source input requires static opcode inspection or a separately reviewed data-only decoder.

Inspect actual numeric dimensions, finite values, original identities, endpoints, sampled paths, cycles and components before rendering. Do not repair or complete anatomy silently. Archive-body findings belong below or in a subsequent source-methods record. No whole-body vascular coverage, nerve anatomy, independent biological validation or accepted registration follows from this preflight.

## Acquired archive and static review

The selected baseline archive was subsequently acquired with the exact 23,200,621-byte bound. Its MD5 matches the repository declaration. Body SHA-256 is `40d8a729e8bc977e4121a633da162d1e49f2e71e343454a04e18cc541965c627`. The unchanged original remains under ignored `data/raw/`. An initial response failed verification and was not retained as an original; the verified retry is the preserved body.

All 11 archive entries use accepted relative paths and regular-file or directory types. Their logical sizes total 208,695,004 bytes, and the largest member is 66,408,074 bytes. No archive member was extracted to disk. The inspection enforced a 128 MiB member bound and a 512 MiB total logical bound.

| MVN1 member | Bytes | SHA-256 |
| --- | --- | --- |
| verticesDict_baseline.pkl | 1,162,408 | e4bbd7467ec7febc34ac0a18c3d58d0e9e57c0a2e341498b8b74b589cf0a837d |
| edgesDict_baseline.pkl | 38,640,900 | f931bf3c4215fe9d95c7edbacd7a179371e578bdc120776f4d0b1da9c6fbb11b |

The selected dictionaries use pickle protocol 2. Bounded static prefixes of at most 250,000 opcodes per dictionary expose NumPy scalar, dtype and array reconstruction references. These are executable serialization constructs, not plain numeric JSON. Ordinary unpickling was not performed. A larger initial static traversal reached its operation limit and was stopped; it is not a successful complete opcode review.

## Data-only reconstruction and numeric adaptation

`scripts/prepare_vascular.py` reconstructs only the two checksum-pinned MVN1 dictionaries through a bounded, closed interpreter of protocol 2 data operations. It uses `pickletools` to read opcodes and `struct` to decode finite numeric storage. Fixed NumPy scalar, dtype and array names are symbolic tags, rather than imported classes or executed constructors. Unknown globals, serialized callables, object restoration, cycles, incomplete states, unsupported byte orders and trailing data reject the input. The implementation does not call a pickle loader, import NumPy or execute upstream simulation scripts. Input bytes, operations, stack, memo identities, container dimensions and nesting are bounded. The complete acquired MVN1 members passed this separate numeric reconstruction; the earlier prefix-only inspection remains limited as stated above.

The adaptation retains original vertex IDs and coordinates, edge serialization IDs, endpoint connectivity and all edge-local sampled paths. Coincident endpoints remain separate rendering indices. The numeric JSON has `schemaVersion`, `points`, `paths` and `sourceGraph`; the last holds `vertexIds`, `vertexCoordinates`, `edgeIds` and `connectivity`. Source point order and path order remain unchanged. Simulated flow, pressure, hematocrit, effective diameters, vessel categories and path-analysis fields are omitted. No tissue surface, inferred radius, smoothing, gap completion, physical rescaling or anatomical registration is added.

| Numeric source property | Retained value |
| --- | --- |
| Original topology vertices | 9,168 |
| Original topology edges and sampled paths | 12,071 |
| Edge-local sampled point records | 575,722 |
| Consecutive path segments | 563,651 |
| Original topology components | 1 |
| Original topology cycle rank | 2,904 |
| Indexed rendering components without endpoint merging | 12,071 |
| Zero-length source segments | 62 |
| Segments collapsed during initial Float32 serialization | 0 |

Original graph components and cycle rank are numeric topology properties, not cell counts, biological completeness, measured flow or physiological validation. There are 1,261 paths whose stored endpoint order disagrees with the connectivity order. Allowing path reversal leaves two endpoint comparisons with source differences of approximately 3.6e-15 source units. Original points, connectivity and order are retained without repair or flow-direction inference.

The derivative `schmid2021-mvn1-lines.json` is 38,356,364 bytes with SHA-256 `8d9fb19e943a126562ab5a439d83590b5694d58b208f064a8140d556ed3e4652`. The atlas ID is `schmid2021-mvn1-v1`, its single observation structure is `schmid2021-mvn1:network`, and its independent frame is `schmid2021-mvn1-source-micrometres-v1`. Source-declared micrometres are retained at numeric scale 1, with calibration, axes and registration unverified. Initial Float32 serialization differs by at most approximately 0.0001210025466 source units. That diagnostic excludes later recentering and GPU arithmetic and does not estimate physical accuracy.

Regenerate with the unchanged original available in ignored storage:

```bash
python3 scripts/prepare_vascular.py
python3 scripts/prepare_vascular.py --verify-existing
python3 scripts/test_vascular.py
```

The converter performs no network transfer and does not extract archive members to disk. Exact regeneration and unchanged-original checks require the separately retained input; the corresponding test explicitly skips in a plain source distribution without it. Numerical, loader and DOM checks do not establish actual browser pixels, representative hardware performance or independent anatomical accuracy. Full adult whole-body vessels remain unavailable.

Original assessment prose is CC BY 4.0 by Qasim Hussain. Each identified dataset retains its separate attributed CC BY 4.0 grant. Article licensing is not substituted for dataset licensing.
