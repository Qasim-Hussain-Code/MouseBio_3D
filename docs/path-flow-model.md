# Assumed flow along a retained vascular path

The path-flow calculation applies the steady Hagen-Poiseuille pipe model to one
retained source-ordered cortical vascular path. It does not generate vessels,
infer their diameters or solve flow over the vascular network. The source points
retain their original coordinates and order. Every adjacent segment contributes
to the path length; coincident segments remain counted and contribute zero.
Display clipping, recentering and Float32 display positions do not enter this
calculation. See the [vascular source assessment](vascular-source-assessment.md).

The implementation follows the pressure-flow relationship in OpenStax,
[*University Physics Volume 1*, section 14.7, equation 14.19](https://openstax.org/books/university-physics-volume-1/pages/14-7-viscosity-and-turbulence):

```text
Q = pi r^4 DeltaP / (8 mu L)
A = pi r^2
v_mean = Q / A
t_transit = L / abs(v_mean)
```

The idealization assumes steady, incompressible, Newtonian, fully developed
laminar flow in a rigid tube of constant circular cross section. Using curved
source-path length in this straight-pipe relationship is an approximation;
curvature losses and entrance effects are not modeled. No fluid density or
Reynolds-number assessment is supplied, so the interface must not assert that
the chosen parameters establish a laminar regime.

Coordinates are interpreted using the vascular source's declared micrometres,
whose physical calibration remains unverified. Radius is supplied explicitly in
micrometres, pressure drop in pascals and viscosity in pascal seconds. Radius,
pressure and viscosity are assumptions or user-entered parameters, not recovered
source measurements. The defaults are radius 3 micrometres, pressure drop 100 Pa
and viscosity 0.0035 Pa s. These values are teaching assumptions and are not
asserted to be normal mouse values.

The signed pressure drop is pressure at the first source point minus pressure
at the last source point. Positive flow and mean velocity follow source point
order; negative values oppose it. These directions do not identify arteries,
veins, perfusion direction or the order of the separately retained source graph's
connectivity endpoints. Reversing a path without changing the pressure sign
changes the geometric direction represented by positive flow.

The calculation converts micrometre lengths to the equivalent SI pipe relation.
It returns flow in cubic micrometres per millisecond and microlitres per minute,
mean velocity in micrometres per millisecond, area in square micrometres and
transit time in milliseconds. One cubic micrometre per millisecond equals
0.00006 microlitres per minute. Transit time uses absolute mean velocity. At zero
imposed pressure, both flow and velocity are zero and transit time is `null`,
indicating no finite advective transit in this model. No Infinity is exported.

The pure domain function accepts 2 to 100,000 finite coordinate triples. Its
supported parameter bounds are radius 0.1 to 100 micrometres, pressure drop
between -20,000 and 20,000 Pa and viscosity between 0.0001 and 0.1 Pa s, inclusive.
These are numerical interface bounds, not validated physiological ranges.
Malformed inputs, entirely coincident paths, overflow and unrepresentable
nonzero outputs fail with fixed errors. Inputs are not changed; the result and
its copied assumption record are immutable. Source points and zero-length
segments are never removed or repaired.

This is an assumed-parameter pipe-flow prediction. It does not model red blood
cells, plasma-cell interactions, compliance, pulsatility, oxygen transport,
branch junctions, network boundary conditions or whole-body circulation. No
physiological validation, source-vessel lumen surface, measured radius or
registration to the whole-body anatomical references is established. Any visual
playback must retain these distinctions and must not present display markers as
measured cells.

Original implementation is MIT. Original documentation is CC BY 4.0 by Qasim
Hussain. The cortical source retains its separate attribution and license.
