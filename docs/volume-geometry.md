# Registered-volume anatomical surfaces

## Scope

The optional registered-volume reference represents all 21 nonbackground labels in the official Digimouse anatomical volume. It is a complete conversion of that bounded label inventory, not a complete mouse anatomy. It includes six brain regions, the eye label, lachrymal glands, adrenal glands and the named masseter label that are not independently identified in the 17-region tetrahedral reference. Individual bones, most individual muscles, peripheral nerves, arteries, veins, tissue layers and cellular structures remain unresolved.

The model derives from the same single postmortem normal nude male mouse described by [Dogdas et al. (2007)](https://doi.org/10.1088/0031-9155/52/3/003). The source archive is distributed under CC BY-SA 4.0 and has been reviewed and pinned by SHA-256. Its byte-valued registered image has dimensions 380 by 992 by 208 and source spacing identified by the [official download page](https://neuroimage.usc.edu/neuro/Digimouse_Download) as 0.1 mm isotropic. The preserved archive, bundled license, header inspection and exact labels are documented in [volume-assessment.md](volume-assessment.md). No additional data or dependencies were downloaded for meshing.

## Two processing levels

`public/atlas-volume/atlas.json` describes the whole reference at 0.4 mm processing spacing, produced by retaining every fourth source sample. It identifies `digimouse-volume-040-v1` and loads `digimouse-volume-040.glb`. The GLB contains all 21 labels, 574,922 vertices including separate region interfaces, and 1,152,516 triangles. It occupies 27,648,532 bytes. Body and skeleton account for most triangles. This optional reference has a higher rendering cost than the original lightweight tetrahedral model; representative integrated-graphics performance has not been established.

`public/atlas-volume/detail-index.json` describes 19 optional regional GLBs at 0.2 mm processing spacing, produced by retaining every second source sample. Files `detail/region-3.glb` through `detail/region-21.glb` retain the same registered source frame and structure IDs. Their combined size is 25,249,496 bytes, with 525,570 vertices and 1,050,980 triangles. The largest is the liver, with 322,192 triangles. Envelope and aggregate skeleton fine assets are deliberately unavailable to avoid unnecessary storage and rendering cost. Their coarse source regions remain present. A consuming viewer should request selected regional detail progressively rather than load all detail files initially.

Processing spacing is explicit and differs from source spacing. These sampling levels do not add image information beyond the source. Thin structures and small components can change or disappear with subsampling, even when the numerical source label remains present. Label presence was checked at both processing levels; identical retention of every connected component has not been established. A larger on-screen view is not a higher biological scale.

## Meshing method

The converter reads the compressed source in planes and constructs one byte-valued padded processing grid. One background sample surrounds the grid. The padded grids contain 1,309,500 values for the coarse level and 10,135,296 values for the detail level. The expanded 78 MB source image is not written to disk.

Each processing cube uses the same conforming subdivision into six tetrahedra. For a selected categorical label, sample values are one inside that label and zero elsewhere. The 0.5 interface is intersected with each tetrahedron. Crossing points lie halfway along grid edges or tetrahedral diagonals. Shared crossing edges use one indexed vertex within each region. The two-inside case is triangulated consistently, and each triangle is oriented away from an inside sample. Vertex normals are area-weighted averages of incident triangle normals. No smoothing, inferred anatomy, spatial registration or mesh decimation is performed.

This is a piecewise-linear representation of sampled categorical boundaries. Different labels are processed independently, so half-value surfaces can leave gaps at junctions involving more than two labels. No new tissue fills such gaps. A closed mesh is a numerical property of this representation, not proof that its surface accurately follows an anatomical boundary. The source label `skin` remains a residual bulk body region with internal organ cavities. It does not independently delineate epidermis or other skin layers.

## Coordinate frame and identifiers

Every asset uses `digimouse-registered-voxel-native-v1`. Coordinates are zero-based source voxel indices multiplied by 0.0001 to obtain metre-valued glTF positions. Samples have no additional centering, rotation or anatomical-origin translation in the asset. The processing grids use the original index-zero sample offset. Each structure has a distinct ID `digimouse-volume:<source label>` and preserves that ID in its glTF node extras. The optional detail asset uses exactly the same ID and frame as its corresponding coarse region.

Native storage axes are not independently verified anatomical directions. The header supplies no accepted full affine to the distributed tetrahedral model. No transformation to that model has been fitted or accepted here, and the two references must not be combined by assuming equal numerical coordinates or label values. For example, label 3 denotes eye in the registered volume and heart in the tetrahedral source. Selecting a different reference requires an explicit complete atlas change. A viewer's centering and presentation rotation do not establish anatomical registration.

## Display metadata

Each region records its original source label, system categories, colour, default opacity, numerical bounds, vertex count and triangle count. Colours identify regions without expressing a quantitative measurement. Default opacities are 0.06 for the residual envelope, 0.14 for skeleton and 1 for all other regions. These defaults improve organ visibility; they do not alter the underlying geometry. Shared source labels do not establish left or right identity. The six CNS regions remain source-labelled regions rather than cellular or molecular detail.

## Reproduction, resources and executed checks

```bash
python3 scripts/import_volume.py --step 4
python3 scripts/import_volume.py --step 2 --per-region
python3 scripts/test_volume_geometry.py
# Repeat with --verify-existing to require identical GLB checksums.
```

The scripts require the reviewed `data/raw/atlas.zip` and use only Python's standard library. Source checksums and the expected header and label inventory are verified before conversion. Each GLB is capped at 80 MiB; each generated region is capped at five million triangles. Original archives are preserved, and generated geometry has its own attribution and CC BY-SA license record in `public/atlas-volume/LICENSE.md`.

The complete coarse conversion, including final GLB serialization, took 7.39 seconds wall time and reached 127,172 KiB peak resident memory under `/usr/bin/time -v` in WSL. The selective detail conversion took 10.07 seconds and reached 73,020 KiB. These are executed conversion measurements on this environment, not browser rendering or Linux Mint performance claims. Combined generated GLBs occupy 52,898,028 bytes, excluding their small JSON manifests and license record.

The geometry acceptance script exercises isolated and diagonal/saddle sample fixtures, then checks the actual whole reference and every regional detail file. Checks include GLB headers, inventory, SHA-256 hashes, buffer decoding, finite coordinates, valid indices, nonzero triangles, unit normals, duplicate triangles, opposite edge winding, closed edges, connected cyclic vertex links, positive total signed region volume and recorded bounds. Numerical volume is used only as a consistency check. Internal cavity components can have negative orientation relative to their enclosed spaces while the residual tissue's total oriented volume remains positive.

These checks do not establish independent anatomical accuracy, physical calibration, preservation of every thin component, physiological validity, pixel-level rendering or interaction quality. Any displayed higher-detail reference must retain these limitations. No geometry was added to the existing tetrahedral assets, and repository publication or visibility was not changed by the conversion.

All five geometry tests passed without skips in WSL, including the complete coarse model and all 19 progressive detail assets. The validation run took 10.88 seconds wall time and reached 397,348 KiB peak resident memory. These checks are executed numerical evidence, not expert review.

Both conversion commands were also repeated with `--verify-existing`; every regenerated GLB matched its previous SHA-256. `tests/volume-data.test.ts` passed two acceptance tests using the actual Three.js GLTFLoader, loading the entire coarse reference and all 19 regional detail files, preserving source IDs, bounds and rest transforms. The project TypeScript check passed after these tests were added. Loading in Node does not establish rendered browser appearance or camera interactions.
