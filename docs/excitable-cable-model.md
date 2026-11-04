# Generic excitable cable along a retained nerve path

The nerve signal model in Living computes a travelling activation wave in a
generic one-dimensional excitable medium and displays it along one retained
path of the predicted regional nerve source. It is a phenomenological model of
the FitzHugh-Nagumo family. It is not calibrated to mouse nerve recordings, to
a particular axon or cell, or to the source path itself. See the
[nerve source assessment](nerve-source-assessment.md) for the source geometry
and its unresolved units.

## Equations

The state variables are a dimensionless activator `v` and recovery variable `w`
on a cable coordinate `x` between 0 and `L`:

```text
dv/dt = D d2v/dx2 + v - v^3/3 - w + I(x, t)
dw/dt = (v + a - b w) / tau
```

`I(x, t)` equals the stimulus amplitude on the first `stimulusNodes` grid nodes
while `stimulusStart <= t < stimulusEnd`, and zero elsewhere. The equation
family follows R. FitzHugh, "Impulses and Physiological States in Theoretical
Models of Nerve Membrane", *Biophysical Journal* 1(6):445-466, 1961,
[doi:10.1016/S0006-3495(61)86902-6](https://doi.org/10.1016/S0006-3495(61)86902-6).
The diffusion term and the parameter values are model choices of this
implementation; the result is not an exact reproduction of that publication.

## Parameters

| Parameter | Default | Interface bounds |
| --- | --- | --- |
| `a` | 0.7 | 0.001 to 2 |
| `b` | 0.8 | 0.1 to 1 |
| `tau` | 12.5 | 1 to 100 |
| `D` (diffusion) | 1 | 0 to 10 |
| Grid nodes | 128 | 16 to 256 |
| Cable length `L` | 80 | 1 to 1000 |
| Duration | 160 | integer, 1 to 250 |
| Time step | 0.02 | 0.001 to 0.02 |
| Stimulus amplitude | 1 | 0 to 3 |
| Stimulus window | 2 to 6 | within 0 to 250 |
| Stimulated nodes | 4 | 1 to 16 |

All quantities are dimensionless. The defaults are conventional choices for
this equation family. Their correspondence to the constants used in the 1961
publication has not been verified for this record, and none of them is a
measured mouse value. The interface exposes stimulus amplitude and diffusion;
the other values remain at their defaults.

## Numerical method

The resting state is the negative root of `v - v^3/3 - (v + a)/b = 0`, found by
bisection; `b <= 1` makes this root unique. Parameters whose resting state is
not linearly stable, judged from the trace and determinant of the reaction
Jacobian, are rejected before integration.

Integration uses explicit forward Euler steps with second-order central
differences in space. Zero-flux ends are imposed with reflecting ghost nodes.
The diffusion number `D dt / dx^2` must not exceed 0.4, below the 0.5 stability
limit of the explicit one-dimensional diffusion scheme. Steps are shortened so
that stimulus onset, stimulus offset and every unit output time fall exactly on
the time grid. States are never clipped; a nonfinite state aborts the
calculation without a partial result. Step and cell-update budgets bound the
computation, which runs in a browser worker that the user can cancel.

Threshold arrival at a node is the first upward crossing of `v = 0`, linearly
interpolated within the Euler step. It is a numerical diagnostic, not a
measured activation time.

## Display mapping

After calculation, the normalized cable coordinate `x / L` is mapped to the
normalized display length of the selected source path. Segment colours show
interpolated `v` between -2.2 and 2.2 at the current playback time. The mapping
is a display association. It does not register the model to the path, assert
continuity between source paths, or assign physical units, millivolts or a
conduction velocity. Other source paths are faded while the model is displayed;
no nerve, axon or cell geometry is created.

## Verification

Automated cases in `tests/excitable-cable.test.ts` check that the default
stimulus produces threshold arrivals at every node, increasing with distance
beyond the stimulated nodes, with steady mid-cable spacing. Without stimulus,
the resting state persists and no arrival is reported. Halving the time step
changes the far-end arrival by less than one percent. Malformed options,
unstable grids and unsupported fields are rejected, results are immutable and
reproducible, and cancellation stops the chunked runner. These checks establish
numerical behaviour of the implementation. They do not establish biological
validation.

## Limitations

The model has no ion channels, myelin, axon diameter, temperature dependence or
synapses. Its time and space scales are dimensionless and cannot be compared
with recorded conduction. The source nerve graph is predicted regional geometry
with unknown coordinate units, and the selected path is not known to be a
single axon or fascicle. No independent physiological validation exists.

Original implementation is MIT. Original documentation is CC BY 4.0 by Qasim
Hussain. The nerve source retains its separate attribution and license.
