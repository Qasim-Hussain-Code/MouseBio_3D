# Cardiac cell model methods

The Living workspace contains an independent parameterized model of mouse apical ventricular-cell membrane voltage and intracellular calcium handling. It is not registered to an anatomical mesh or a point selected in the viewer. It supplies no spatial cell geometry, contraction mechanics, blood flow, whole-heart conduction or nerve propagation. Computed output is not experimental data or an individualized physiological prediction.

## Source and adaptation

The source is Bondarenko VE, Szigeti GP, Bett GCL, Kim SJ and Rasmusson RL. Computer model of action potential of mouse ventricular myocytes. *American Journal of Physiology, Heart and Circulatory Physiology*. 2004;287:H1378-H1403. [doi:10.1152/ajpheart.00185.2003](https://doi.org/10.1152/ajpheart.00185.2003). The [Physiome apical exposure](https://models.physiomeproject.org/exposure/b0b1820b1376263e16c6086ca64d513e/bondarenko_szigeti_bett_kim_rasmusson_2004_apical.cellml/view), revision `94d9d4f47495d86fec040f5439c7e3a4ffccb611`, supplies the archived CellML and generated C expressions. Source and derivative hashes, citation, CellML credits and CC BY 3.0 license evidence are retained in [the manifest](../public/models/bondarenko-apical/manifest.json) and [the notice](../public/models/bondarenko-apical/LICENSE.md).

`scripts/prepare_bondarenko.py` accepts only pinned original files and a closed grammar of explicit numeric mathematical assignments. It preserves statement order, expression grouping, 41 initial states, 73 constants, 71 algebraic variables and source stimulus inequalities. It does not execute downloaded C. Contact and editor metadata are omitted. The archived TypeScript equation module remains unchanged by the separate optional integration variant.

The source temperature is 298 K. The default pulse starts at 20 ms, repeats every 71.43 ms, lasts 0.5 ms and has amplitude -80 pA/pF. Initial membrane voltage is -82.4202 mV; initial cytosolic and subspace calcium are each 0.115001 micromolar. No body-temperature conversion, empirical fitting or pre-pacing is applied. The interface permits 100, 250 or 500 ms calculations and explicitly labels modified 100 or 200 ms pacing periods.

The curator reports Figure 16 reproduction in OpenCell and COR. This is source-reported evidence. The application does not claim independent reproduction of the paper's figure, experimental recordings or physiology. The source-generated Python template's 0 to 10 ms interval ends before the first stimulus and is not used as a paced reference trace.

## Archived channel transition and explicit mathematical variant

The archived `IC_Na2` derivative, state 25, contains influx `gamma_Na4 * IC_Na2`. The corresponding `C_Na2` derivative, state 21, loses `gamma_Na4 * C_Na2`. Reconstructing the nine-state sodium-channel transition generator, including implicit `C_Na3`, reveals a negative off-diagonal entry. At 20 mV the implicit `C_Na3` row in the `IC_Na2` column is approximately -0.00894 per millisecond. This is a mathematical inconsistency in the inspected archive; its origin in the source history or paper remains unresolved.

Two variants are explicit in the interface and JSON export:

- **Archived source** preserves the archived equations. Out-of-range channel states are reported and retained. The resulting trace must not be treated as a physiologically valid prediction.
- **Balanced transition** substitutes `gamma_Na4 * C_Na2` for `gamma_Na4 * IC_Na2` in the `IC_Na2` derivative only. Equivalently, it adds `algebraic[43] * (states[21] - states[25])` to rate 25. This restores a conservative generator with nonnegative off-diagonal transitions in the executed channel test. It is a computationally inferred correction, not an independently physiologically validated model or an exact reproduction of the archived equations.

No state clipping, projection, missing-current invention or parameter fitting is used. The default interface selects the balanced variant and displays its modification before calculation. The archived source remains available for inspection and comparison. The model-derived mathematical expressions and numerical reference traces retain CC BY 3.0; original integration and interface code remains MIT.

## Numerical integration

The local Web Worker uses bounded adaptive Dormand-Prince 5(4), Float64 states, relative tolerance 1e-7, absolute tolerance 1e-9 and maximum internal step 0.05 ms. Output spacing is 0.1 ms. Duration is bounded to 500 ms, output to 5,001 samples and work to 750,000 attempted steps. Nonfinite derivatives, nonpositive concentrations or an exhausted work bound fail with a fixed message and retain the previous completed result.

All stimulus edges split the problem into separate continuous phases. The closed expression-tree check establishes that time occurs only in the source stimulus expression. Evaluating that expression at the phase midpoint therefore supplies the exact constant forcing on each phase while preserving continuous states at the boundaries. Source rate-expression singularities remain unregularized. Numerical agreement does not guarantee behavior for every possible state or protocol.

Cancellation terminates the worker and ignores stale messages. Leaving Living cancels an active calculation. Completed results survive workspace changes during the same browser session. The model never reads imported observations or uses them to fit parameters. Results remain independent of experimental banks and saved anatomical views.

JSON exports include source identity, equation variant, transition change, protocol, solver settings, step counts, channel-state range, all output samples and limitations. CSV contains time in milliseconds, voltage in millivolts and cytosolic and subspace calcium in micromolar, plus the equation variant, pacing period, temperature, source hash and transition-change notice. Preserve the JSON alongside a numeric CSV to retain its provenance.

## Verification limits

The tests establish expression identity, fixed buffer guards, source stimulus behavior, channel-transition mathematics, bounded integration, cancellation and interface/export behavior. Numerical reference comparison uses separate stiff integration algorithms on a closed Python mathematical translation of the same pinned expressions. This provides integration evidence, not independent verification of the equations or biological validation. Actual executed reference results are recorded separately in the release acceptance evidence.

The integration diagnostics include both explicit dimensionless states and the three implicit probability complements used by the archived model. The stored reference is generated with NumPy 2.5.4 and SciPy 1.18.1. Regeneration requires the pinned original equation files and these optional scientific packages in the selected development Python environment; run `python3 scripts/reference_cardiac_cell.py`. It performs no download and no experimental-data read. These packages are not application runtime dependencies or distributed web binaries.
