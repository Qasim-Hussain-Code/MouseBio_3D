# Viewer presentation methods

This document records the display conventions of the three-dimensional viewer: lighting, materials, the translucent body envelope, selection marking, the default camera pose and automatic rotation. Each is a presentation choice made in `src/viewer`. None changes source geometry, source identifiers, coordinate frames or the numerical content of a reference, and none supplies an anatomical direction, a physical calibration or a measured optical property of tissue.

## Lighting and tone mapping

The scene is lit by an image-based environment (the Three.js `RoomEnvironment` prefiltered by `PMREMGenerator`, intensity 0.7), a hemisphere light (intensity 1.1), a warm key light (intensity 2.4 at display position (-2.5, 4, 5.5)), a cool fill light (0.7 at (3, -1, -3)) and a back rim light (1.1 at (1.5, 2.5, -5)). Positions are expressed in the display frame after the presentation rotation; the display axes carry no anatomical direction, so the lights have no anatomical meaning either.

Output uses the sRGB colour space with Khronos PBR Neutral tone mapping at exposure 1. Neutral tone mapping was chosen over filmic curves because it preserves hue, so declared region colours and the quantitative colour ramp remain recognisable. A rendered pixel still depends on lighting and shading and is not a colorimetric match of the legend.

The WebGL canvas is cleared transparent. The page paints a radial gradient behind it for the Dark and White backgrounds.

## Surface materials

Surface regions use `MeshPhysicalMaterial` with roughness 0.52, metalness 0, clearcoat 0.22 with clearcoat roughness 0.4, environment intensity 0.9 and double-sided rendering so that virtual sections expose interior faces. These values give a moist, tissue-like specular response for all regions uniformly. They are not measured optical properties and do not vary by tissue type. Line references keep a one-pixel `LineBasicMaterial`.

## Translucent body envelope

Regions classified as integumentary and displayed at an opacity below 1 fade where they face the camera and keep their silhouette. In the fragment program the alpha is multiplied by `mix(1, f^2.2, 0.72)`, where `f = 1 - |n · v|`, `n` is the shading normal and `v` the view direction. The user-set opacity remains the maximum. The default envelope opacity of the lightweight tetrahedral reference is 0.22 (previously 0.1); the registered-volume reference keeps the manifest default of 0.06, and the Organs preset keeps 0.06 for both. The fade is a presentation effect; it does not represent skin thickness or transparency.

## Selection marking

The selected region receives a rim light, `#f3c98c` scaled by `f^3`, added to the lit colour. This replaces the earlier green emissive tint. The region colour, opacity and geometry are unchanged, and the mark carries no biological meaning.

## Display colours

Regions are coloured by a display scheme chosen under **Colours** in Display controls. The default tissue scheme, declared in `src/domain/tissue-palette.ts`, assigns one colour per recognised source label word: ivory for skeletal labels, deep red-brown for liver, crimson for heart, salmon for lungs, dark red for kidneys, dark purple-red for spleen, pale yellow for bladder, yellow-tan for pancreas, warm tan for stomach and intestine, pinkish grey for brain labels with a separate tint for each Digimouse brain subdivision, muscle red for muscle labels, pale grey-blue for eye, yellow-orange for adrenal glands, pale tan for other glands, yellow for nerve labels, red and blue for arterial and venous labels, and warm pale grey for the body envelope. The colours approximate the gross appearance of fresh tissue so that organs are recognisable at a glance. They are not measured colours of any specimen, they encode nothing beyond the label words, and paired labels such as the two kidney regions share one colour. Colours declared by a source figure, such as the hindlimb surfaces with recorded source diffuse values, are kept in every scheme because they belong to that source's record. The source scheme shows the colours written in each manifest. A label without a recognised word keeps its manifest colour or, failing that, a colour for its first system category. Quantitative overlays in Experiment and Compare replace the display colour of mapped regions in either scheme, and the structure list dots follow the active scheme.

## Labels

**Aa** shows the selected region's name beside the centre of its displayed bounds. **All** places a label for every displayed region whose opacity is at least 0.3, plus the selection. Candidates are ordered by selection and then by displayed size, and each is placed at the first of twenty-two fixed offsets around its anchor at which its estimated box neither leaves the viewport nor overlaps an already placed label; a region without such a position receives no label rather than an overlapping one. Leader lines join each anchor to the nearest edge of its box. Placement is recomputed at most about twenty times per second while the view changes. Anchors are display bounds centres, not anatomical centroids, and label text is the source region name; the layout is implemented in `src/viewer/label-layout.ts` without renderer dependencies. The All setting is not written to view files.

## Default pose and automatic rotation

Reset places the camera at `radius × (1.35, 1.05, 2.55)` from the centred model, a raised three-quarter display pose, where `radius` is half the diagonal of the displayed bounds. The X, Y and Z buttons remain display-axis views. Automatic rotation orbits the current target at the `OrbitControls` speed setting 1.2, about 50 seconds per revolution. It stops at the first pointer interaction, after which the resulting pose is reported once. Rotation state is not written to view files and is unavailable in Compare, where both views share one reported pose.

## Display smoothing of voxel-derived surfaces

The two Digimouse references and their regional detail surfaces are extracted from a 0.1 mm label volume on 0.4, 0.2 or 0.1 mm processing grids, so their source triangles follow the staircase and terraces of the grid. By default the viewer displays a smoothed copy of each of these surfaces, computed in the browser after loading with Taubin's lambda-mu filter (Taubin, 1995, A signal processing approach to fair surface design, SIGGRAPH 95). Each iteration moves every vertex towards the mean of its mesh neighbours by lambda and then away from it by mu; because mu is slightly larger in magnitude than lambda, the surface does not shrink the way plain Laplacian smoothing does. The parameters are declared in `src/domain/display-smoothing.ts` per reference: the coarse tetrahedral surfaces use 10 iterations with lambda 0.5 and mu -0.53; the dense 0.4 mm volume surfaces and their 0.2 and 0.1 mm detail files, whose terraces span about ten vertices, use 40 iterations with lambda 0.6 and mu -0.61; keeping mu only slightly beyond -lambda holds the pass-band gain close to one, so the longer and stronger run changes the mean radius of a test sphere by less than half a percent instead of inflating it. Vertices on open boundary edges and isolated vertices keep their source positions. Vertex normals, bounding boxes and bounding spheres are recomputed for the copy. The filter runs in a Web Worker when the browser provides one, otherwise on the page thread; the page shows "Preparing display surfaces" meanwhile.

The source surface stays in memory. **Smooth voxel surfaces** in Display controls switches between the smoothed copy and the source surface; a displayed finer surface is reloaded with the same choice. Picking and the selected-region label anchor use the displayed copy. Schematic route anchors in Living continue to use source vertices. Hindlimb, EMA147 and line references are not smoothed.

Smoothing adds no resolution. A smoothed boundary remains bounded by the processing grid and by the source segmentation, features removed by subsampling are not recovered, and the parameters are display settings without anatomical validation.

The executed asset check (`tests/surface-smoothing-assets.test.ts`) measures the departure of the display copy from the source triangles. For all 17 tetrahedral regions the largest vertex displacement is 0.54 mm (1.35 processing voxels), the largest bounding-box shift 0.36 mm and the largest change of enclosed signed volume 3.28 percent, in the 388-triangle muscle region 15; the whole-body envelope, skeleton, liver and lungs change by less than 0.1 percent. For the volume base heart, liver and lungs the displacements are at most 0.31 mm (0.77 voxels), bounds shift at most 0.11 mm and the enclosed volumes change by 0.19, 0.01 and 0.16 percent; the 0.2 mm adrenal surface changes by 0.25 percent with a 0.15 mm displacement. Residual long terraces remain visible on the largest volume surfaces at close range; removing them entirely would require passes that begin to alter shape. A separate check records that long runs with mu -0.53 inflate low-frequency shape instead of smoothing further, which is why the counts are fixed. These are numerical properties of the display copy, not statements about anatomical size.

## Limitations

These conventions were checked in a headless Chrome session with software WebGL and inspected visually; representative hardware performance remains unmeasured. The shading hooks modify the standard fragment program through `onBeforeCompile`; an unexpected program is left unchanged and the surface renders with plain shading. No lighting, material or pose setting constitutes anatomical review, physical calibration or validation of any model.
