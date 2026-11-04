# Schematic circulation and nerve routes

Living mode can display schematic routes between existing source regions of the
two Digimouse references. Animated tracers follow the order of blood flow
through the pulmonary, systemic and hepatic portal circuits, and pulses follow
the direction of selected nerve routes. The display is classified as
illustrative. Each route is an educational simplification of organ-level
textbook anatomy. No vessel, nerve, chamber or ganglion geometry is created,
and no flow, pressure or conduction quantity is computed.

The routes are implemented in `src/domain/living-circuits.ts` and displayed by
`src/viewer/living-circuit-overlay.ts`. They are independent of the regional
path models described in the [path flow](path-flow-model.md) and
[excitable cable](excitable-cable-model.md) methods, which operate on retained
source paths of other references.

## Route table

The route table lists 26 organ-level routes. Each route records a kind, a
source role, a target role, a short basis statement in original wording and
the cited textbook sections. Intermediate structures are collapsed: for
example, the aorta, celiac trunk and left gastric artery become one heart to
stomach connector.

| Layer | Routes |
| --- | --- |
| Pulmonary circuit | Heart to lungs; lungs to heart |
| Systemic supply | Heart to brain, eye, liver, stomach, spleen, pancreas, kidneys, testes and bladder |
| Systemic return | Brain, liver, kidneys, testes and bladder to heart |
| Hepatic portal | Stomach, spleen and pancreas to liver |
| Efferent nerve routes | Vagal origin to heart, lungs (bronchi), stomach, liver and pancreas; trigeminal origin to masseter |
| Afferent nerve route | Eye to visual target (optic nerve) |

Circulation routes cite Betts JG, Young KA, Wise JA, et al., *Anatomy and
Physiology 2e*, OpenStax, 2022,
[section 20.5](https://openstax.org/books/anatomy-and-physiology-2e/pages/20-5-circulatory-pathways).
Nerve routes cite
[section 15.1](https://openstax.org/books/anatomy-and-physiology-2e/pages/15-1-divisions-of-the-autonomic-nervous-system),
[section 13.4](https://openstax.org/books/anatomy-and-physiology-2e/pages/13-4-the-peripheral-nervous-system)
and, for the masseter as a muscle of mastication,
[section 11.3](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-3-axial-muscles-of-the-head-neck-and-back).
These sections were consulted on 2026-11-04. The book is licensed CC BY-NC-SA
4.0; it is cited for facts, and no text or figures are reproduced. It describes
human anatomy. Its general mammalian topology is applied here as a
simplification, and mouse-specific branching, laterality and variation are not
represented.

Routes were omitted when the cited sections did not state them. The venous
drainage of the eye and the arterial supply of the masseter are therefore
absent. The vagus nerve also carries afferent fibres; only the efferent
parasympathetic direction stated in section 15.1 is displayed.

## Source bindings

Each role is bound to exact source structure IDs. A route is omitted when
either role has no bound region, and the whole table is rejected when a bound
ID is absent from, or duplicated in, the loaded reference.

| Reference | Connectors | Omitted routes |
| --- | --- | --- |
| Tetrahedral Digimouse (`digimouse-tessellated-v1`) | 30 | Eye supply, trigeminal route and optic route; the eye, masseter and brain subdivisions are not segmented |
| Registered-volume Digimouse (`digimouse-volume-040-v1`) | 26 | None |

In the tetrahedral reference, paired source regions receive separate
connectors. The two kidney regions, two lung regions and two testis regions
therefore each have their own supply and return connectors, without a
laterality claim. In the volume reference, the six brain labels form one union
anchor for brain supply and drainage.

Three nerve origins and targets require anatomical inference because the
source labels do not segment nuclei. These inferences are stored with every
affected connector and shown in the inspector:

1. Vagal efferent fibres arise from the dorsal vagal nucleus and the nucleus
   ambiguus. They are assigned to the source Medulla label in the volume
   reference, and to the aggregate Brain region in the tetrahedral reference.
   Section 15.1 names the nuclei and the brain stem without stating the
   medulla.
2. The trigeminal motor origin is assumed to lie within the undivided volume
   label "rest of the brain".
3. Thalamic, hypothalamic and midbrain visual targets are assumed to lie within
   the same label.

## Anchors and connectors

Each anchored region set provides one point. The overlay forms the mean of the
region's vertex positions in world coordinates and selects the existing source
vertex nearest to that mean, so the anchor always lies on a source surface.
Surfaces with more than 80,000 vertices are sampled with a fixed stride. The
transform excludes the illustrative cardiac and respiratory scaling, so anchors
do not move with that motion.

A connector is a quadratic display curve from the source anchor to the target
anchor. Its control point is displaced perpendicular to the line between the
anchors by a fixed fraction of their separation. Supply, return and nerve
connectors between the same two anchors use different signed offsets, so they
remain distinguishable. Curve shape, length and position have no anatomical
meaning. A connector is shown only when its layer is enabled and at least one
region of each anchored set is visible. It follows the current display section.
Selection can restrict the display to routes of the selected region.

## Display timing

All rates are arbitrary display values in display seconds, recorded in
`CIRCUIT_DISPLAY_TIMING`. Tracers advance along their connectors as fractions of
the connector length:

```text
arterial:  u(t) = r t + (r a T / (2 pi)) sin(2 pi (t / T - phase)) + offset
venous:    u(t) = r_v t + offset
portal:    u(t) = r_p t + offset
```

Here `r` is 0.32 connector lengths per second, `a` is 0.65, `T` is the 1 s
illustrative cardiac display period and `phase` is 0.25, the phase of maximal
illustrative contraction. Arterial tracer speed therefore peaks with the
illustrative contraction and never reverses. Venous and portal tracers move at
0.2 and 0.16 connector lengths per second. Nerve pulses start every 1.5 s on
each connector, with a fixed per-connector stagger, and take 0.6 s to travel
from origin to target. Pause and speed in Living apply to the routes through
the shared display clock.

Colours follow the teaching convention of red for oxygen-rich and blue for
oxygen-poor blood, with violet for hepatic portal blood. They do not represent
computed oxygen content. Tracer count per connector is proportional to its
display length within fixed bounds. None of these values represents regional
blood flow, cardiac output, transit time, conduction velocity or firing rate.

## Interface and export

The Living panel provides separate controls for circulation routes, nerve
routes and selected-region filtering. The viewport shows a legend and a label
stating that connectors are not vessel or nerve geometry. In Living, the
structure inspector lists each route of the selected region in plain language,
with its basis, evidence class, binding inference and cited sections. Route
layer choices are display settings and are not stored in view files.

**Download route table** exports the resolved routes for the current reference
as JSON with schema `mousebio.schematic-circuits.v1`. The file records the
reference ID, asset checksum and coordinate frame, the classification, every
connector with its relationship record and binding inferences, omitted routes,
display timing and colours, limitations and references. It contains no
observations.

## Verification

`tests/living-circuits.test.ts` checks the bindings against the actual
reference manifests, connector and omission counts, relationship subjects,
evidence and references, unsupported and altered references, immutability,
tracer and pulse timing and the documentation conventions.
`tests/living-circuit-overlay.test.ts` checks that anchors coincide with
transformed source vertices and ignore motion scaling, that connectors start
and end at their anchors and remain distinguishable, and that layer, selection,
visibility and section filtering, tracer placement, change detection, omission
and disposal behave as specified. A DOM case in `tests/app.test.ts` exercises
the Living controls, legend, inspector routes, export and restriction to bound
references.

These checks establish software behaviour on synthetic and source records.
Actual browser rendering of the connectors has not been verified in this
record. No route has been reviewed by an independent anatomist for mouse
accuracy.

## Limitations

The routes are organ-level simplifications from a human-oriented textbook. They
do not show vessel or nerve courses, branching, collateral supply, lymphatic
drainage, coronary or bronchial circulation, or most of the body's tissues. The
body envelope, skeleton and muscle regions have no routes. Anchors are display
choices on source surfaces and do not mark vessel entry points, hila or nerve
terminals. Nucleus-level origins rest on the stated inferences. The display
provides no quantitative or validated physiology.

Original implementation is MIT. Original documentation is CC BY 4.0 by Qasim
Hussain. Digimouse geometry retains its CC BY-SA 4.0 license and attribution.
