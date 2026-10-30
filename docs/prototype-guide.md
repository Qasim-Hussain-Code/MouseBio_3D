# Prototype guide

MouseBio_3D is a local scientific exploration prototype maintained by Qasim Hussain. It combines seven separately selectable anatomical references, local morphology inspection, source-bound experimental comparisons and an independent parameterized mouse ventricular-cell equation model. Each source keeps its identifiers, coordinate frame, attribution and limitations. There is no accepted whole-body registration between these sources.

## Open the application

The web release contains the built application and a Python launcher. Extract the web ZIP and use Linux or WSL:

```bash
python3 serve_prototype.py
```

Open `http://127.0.0.1:4173/`. Python 3.10 or later and a browser with WebGL2 are required. The launcher serves an immutable, bounded allowlist of the web bundle on loopback. It serves no source or research directory, provides no directory listing and accepts no data writes. The launcher fails closed on runtimes without Linux no-follow file primitives; use WSL rather than Windows Python. `--port 4174` selects another local port and `--open-browser` explicitly opens a browser. Keep the launcher with its extracted bundle.

For development, use Node.js 22.12 or later, npm and Python in Linux or WSL. Run `bash scripts/npm.sh ci`, then `bash scripts/npm.sh run dev`. Build with `bash scripts/npm.sh run build`. `bash scripts/validate_all.sh` runs the automated checks, build, privacy checker and resource accounting. Original geometry and equation archives are intentionally absent from source releases; checks that require them explicitly report skips. Browser rendering and representative hardware performance require separate checks.

## Explore the available anatomy

Choose **Start here** for guided source views or **Find anatomy** for topic-specific routes. The organ overview uses the lightweight 17-region Digimouse source. The registered-volume source includes 21 labels and six brain regions, with selectively loaded finer surfaces. A separate female right hindlimb and pelvis source contains 37 muscle-named surfaces and other source regions. EMA147 provides developmental TS23 surfaces, including three vessel-labelled surfaces and trigeminal nerve and ganglion surfaces.

Regional blood vessels are available as MVN1 cortical microvascular paths with original source topology retained separately. A MouseMapper prediction example supplies a regional nerve polyline graph. NMO_130632 supplies one independent neuronal sample and parent-link trace. The path and sample explorers expose original numeric identities and focus existing geometry; they do not count individual vessels, nerves, cells or synapses. The sources are separate views, not overlays on a common mouse.

Drag to rotate, scroll to zoom, click to select and use Focus or Fit visible regions. **Dark** and **White** set the viewer background in all modes. Source groups and layer composition select existing regions. Display-axis clipping cuts surfaces without reconstructing tissue. Save view and Load view preserve compatible display settings, background and optional camera pose without embedding observations. Keyboard `/` focuses structure search when no input or dialog is active.

## Explore physiological models

Living distinguishes two implemented behaviors. Digimouse cardiac and respiratory surface motions are illustrative deformations with arbitrary timing. The independent Bondarenko apical ventricular-cell model calculates voltage and calcium handling from source-declared parameters at 298 K. Its optional mathematical transition correction, archived-source defect, numerical method and validation limits are displayed before use. See [cardiac cell methods](cardiac-cell-model.md).

Run the cell simulation explicitly; no calculation starts automatically. Select a duration, equation variant and pacing protocol. Three plots show membrane voltage, cytosolic calcium and subspace calcium against model time. Cancel stops the worker. Export result and provenance produces complete JSON; numeric CSV should be kept with that JSON. The model is independent of the anatomical reference and observation bank.

## Local observations and morphology

Experiment and Compare accept CSV or normalized JSON up to 5 MiB. CSV columns are `structure_id,measurement,value,unit,replicate,condition,time_point`. Use exact structure IDs from the active reference, finite numeric values, explicit units and biological subject identifiers. One row represents one subject, structure, measurement, condition and time point. The downloadable CSV template uses this schema. Normalized JSON retains declared dataset title, source reference, license, notes and origin; these declarations are not independently verified.

Comparison displays descriptive means and sample standard deviations on identical source geometry with a common scale. It does not infer treatment-induced anatomical changes or supply inferential statistics. Observation banks stay attached to their source reference during the browser session. Rejected imports retain accepted data. **Try synthetic comparison** explicitly loads labeled fictional walkthrough values only when no existing data or pending import would be displaced. The walkthrough selects and reveals its existing mapped source regions. These values are not animal observations or validated effects.

Open local SWC accepts one sample/parent graph up to 2 MiB and 100,000 samples. Numeric source records remain in an independent frame. Filenames and comments are excluded from parsed geometry; the exact input hash still identifies the original bytes. Units and biological identity remain unverified unless independently established. Reopen the identical original file before restoring its view. See [local morphology methods](local-morphology.md).

## Scientific coverage and limitations

The prototype does not supply complete adult whole-body vascular or peripheral-neural anatomy, cell-level geometry at every location, microscopy reconstructed from organ surfaces, calibrated measurements, comprehensive neural connectivity, blood-flow simulation, whole-heart electromechanics or validated whole-organism physiology. Magnification creates no additional biological detail. Some sources have unknown physical units, developmental age conflicts, unresolved source inventory discrepancies and retained topology defects. Native axes, physical calibration and cross-source registrations remain independently unverified.

The independent cell model is parameterized and numerically checked; this does not establish independent physiological validation, body-temperature prediction or an individual animal's response. Hardware frame rate and memory behavior on the target integrated-graphics computer remain unmeasured. See [development status](development-status.md), [acceptance](acceptance.md) and source-specific methods for precise evidence and unresolved limits.

## Privacy and licenses

Imported files remain in browser memory on the device. No analytics, remote research service or automatic upload is used. Reloading clears observations and local morphology; export records explicitly if they must be retained. Downloads can contain your observations and declared provenance, so review them before sharing. Saved anatomical views contain display state rather than observation rows.

Original code is MIT and original documentation is CC BY 4.0. Digimouse-derived geometry and metadata retain CC BY-SA 4.0. Hindlimb, EMA147, neuronal and vascular adaptations retain their recorded CC BY 4.0 terms; the regional predicted nerve adaptation retains Apache-2.0. The Bondarenko model mathematics and derived numerical references retain CC BY 3.0. Preserve individual notices, scientific attribution and modifications. See [license records](../LICENSES.md) and each bundled source notice. No source author endorsement is implied.
