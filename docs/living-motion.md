# Illustrative motion of the living mouse

The living mouse moves: the heart beats, the chest and abdomen breathe, tokens travel along the vessels and nerves, the gut moves in slow waves, and the head, tail, ears and whiskers move. This is an illustration on top of a static anatomical model. Nothing is computed about blood, pressure, gas exchange, nerve signals or mechanics, and it is not a validated simulation of physiology. The anatomical reference itself is unchanged, and no surface in it is altered by the motion.

The motion is named as illustrative beside the view, where it can be paused, and in the **Living** tab, where it can be slowed or turned off, in whole or part. It starts on, unless the system asks for reduced motion.

## What follows a published value

All rhythms run on one clock, slowed to a chosen share of real time, at one tenth by default. The rates below come from these papers, found through PubMed.

| Rhythm | Used here | Source |
| --- | --- | --- |
| Heart | 600 per minute, the middle of the published 500 to 700 for conscious mice | Ho D, Zhao X, Gao S, Hong C, Vatner DE, Vatner SF. Curr Protoc Mouse Biol 2011;1:123-139. [doi:10.1002/9780470942390.mo100159](https://doi.org/10.1002/9780470942390.mo100159) |
| Breathing | 4 Hz at rest, within the published 3 to 5 Hz | Wesson DW, Donahou TN, Johnson MO, Wachowiak M. Chem Senses 2008;33:581-596. [doi:10.1093/chemse/bjn029](https://doi.org/10.1093/chemse/bjn029) |
| Sniffing | 10 Hz in bouts, within the published range up to about 12 Hz | The same paper |
| Whisking | 11.3 Hz in bouts, with a second harmonic, as published for the mouse | Mitchinson B, Grant RA, Arkley K, Rankov V, Perkon I, Prescott TJ. Philos Trans R Soc B 2011;366:3037-3048. [doi:10.1098/rstb.2011.0156](https://doi.org/10.1098/rstb.2011.0156) |

Whisking and sniffing are not tied together, because high-frequency whisking and sniffing in mice are not correlated (Cao Y, Roy S, Sachdev RNS, Heck DH. J Neurosci 2012;32:1653-1659. [doi:10.1523/JNEUROSCI.4395-11.2012](https://doi.org/10.1523/JNEUROSCI.4395-11.2012)).

## What is chosen for viewing

These come from no source and are display choices:

- The speed of the blood, lymph and nerve tokens, and how far each token moves with the heart beat. Arterial waveforms and wall motion can be measured in mice (Hartley CJ et al. Am J Physiol Heart Circ Physiol 2011;301:H269-H278. [doi:10.1152/ajpheart.00320.2011](https://doi.org/10.1152/ajpheart.00320.2011)), but no value is taken from that paper here.
- How far everything moves. The chest and abdomen, heart, arteries and gut all move further than they would, so that the movement can be seen.
- The delay of the pulse along the arteries.
- The rate and pattern of the gut waves. Waves of contraction do travel along the mouse small intestine (Parsons SP, Huizinga JD. Exp Physiol 2018;103:1087-1100. [doi:10.1113/EP086871](https://doi.org/10.1113/EP086871)), but no rate is taken from that paper here.
- The timing of bouts of sniffing and whisking, and the movements of the head, tail and ears. These last run on the time shown and not on the slowed clock, because a head that turned at one tenth of a real speed would seem not to move.

## How it works

Every point moves by one displacement, worked out in the vertex programs of the skin, hairs, inner structures and tokens alike, so that what lies together moves together and nothing tears.

- **Breathing.** The chest and abdomen widen about the line of the spine, which itself keeps still, fading out towards the limbs, so that the paws stay on the ground. The lungs widen a little more, and the diaphragm pushes the organs under it along the body.
- **The heart.** The atria contract first and the ventricles after them, each about a point near its own base.
- **The pulse.** The wall of each artery bulges along its normal, in a wave that passes away from the heart. The size is a share of the mean radius of that artery, found from its surface.
- **The gut.** The walls of the stomach and intestines move along their normals in slow crossing waves.
- **Head, ears, whiskers and tail.** The head turns about the first neck bones, and the movement fades out through the neck and towards the ground. The ears, whiskers and tail move about their roots.
- **Answering the pointer.** The head turns towards the pointer for a few seconds after it last moved, within limits, and the whiskers go when the pointer comes close. A click on the closed animal presses the surface there, and the mouse starts, turns towards the place, breathes and whisks faster for a moment, and gives a short call. A click inside an opened animal selects what is there instead.
- **Its voice.** Calls are synthesized when it is touched, in the low-harmonic and mid-frequency bands that mice use in social contexts, after Grimsley et al. 2016 ([doi:10.3389/fnbeh.2016.00038](https://doi.org/10.3389/fnbeh.2016.00038)), and they rise with repeated touches. They are not recordings, and the ultrasonic calls of a mouse, which a person cannot hear, are left out. A button beside the view silences them.
- **Walking.** **Walk**, beside the view, sends the mouse about the floor of the room: from place to place in view, with stops, then out of the view, and back in later near any corner. A click on the floor sends it there, and a touch hurries it along. The model itself stays where it is and the camera and lights move the other way, so that everything in the model, including tokens, cuts and picking, stays valid. How far it goes follows from its strides, so that a foot on the ground does not slide, and its legs step with diagonal legs together. Each leg swings from its hip or shoulder and bends at a joint a little under half way down, the elbow and the knee bending opposite ways. A foot comes forward through the air with its leg bent, and goes back along the ground with its leg straight, as the body passes over it. The trunk curves a little to each side in time with the stride. The middle joint is placed on a straight line from the top of the leg to the paw, and the other joints of the leg are not moved, so this is a sketch of a gait and not a recording of one. The pace and the sizes of these movements are chosen for viewing.
- **Washing.** Standing, and at some stops when walking, the mouse sits up on its hind legs. The trunk comes up about the hips and sinks a little on to them, with the back rounded, the head stays nearly level, and the fore legs come up to the face and work there, one a little after the other. It is drawn from the same displacement as everything else, and a touch ends it.
- **Keeping the coat whole.** Each point of a hair moves as the tissue at that point moves, and the direction of a hair and the normal of the skin turn with it, so that the fur and the light stay whole on the turned head.

The centre lines of the simulated vessels and nerves are recovered from the rings of their own tubes after every move of the build, so they lie where the surfaces lie, and are stored in `public/atlas-living/flow-paths.json`, which is marked as simulated. This file does not enter the GLB, and the GLB is byte-identical with or without it. Up to 22,000 tokens move along these lines in the vertex program, so moving them takes no work on the main thread. Bright tokens carry blood that has been through the lungs, and dark tokens carry blood that has not, so the pulmonary arteries are dark and the pulmonary veins bright. Pale tokens in the lymph trunks and golden tokens along the nerves show only the direction in which they travel, and every token is far larger than the cell or signal it stands for. The walls of the vessels become glassy while blood is shown, so that the tokens can be seen inside. Those tokens are masked to the opening like everything else inside the animal.

An opening is tested where a point lies at rest, so a cut moves with the tissue it was made in.

Some levels of the [zoom below the layers](scale-journey.md) also move, on the same clock: red cells pass along a vessel wall, a muscle capillary, a liver sinusoid and blood, the bands of a skeletal muscle fibre shorten in a brief twitch, heart muscle cells shorten with each beat, alveoli widen with each breath, cilia beat, bacteria drift in the mucus, molecules of hemoglobin jostle, and axons, cortical neurons, lymphocytes and rods light up in turn. Levels that show measured atoms do not move.

## Limits

- Nothing here is physiology. It says nothing about flow, pressure, oxygen, conduction or the mechanics of breathing, and no measurement can be mapped onto it.
- Blood and nerve tokens show direction only. Their speeds are far from real speeds. Their numbers are limited by the display, and their paths are simulated lines, so blood does not pass from one vessel to the next at a branch or through capillaries, and the two sides of the heart are not joined by tokens.
- Direction is decided from each vessel's name and from which end of a line lies nearer the heart. A curving vessel may have a short stretch that does not run in the expected sense.
- The walking is not a gait from any measurement, and the path it takes is chosen at random and is not a model of how a mouse explores. Washing is a raising of the trunk with the fore legs brought up to the face and working there. It follows no measured sequence, although washing is among the most frequent things that rodents do (Kalueff et al. 2016, [doi:10.1038/nrn.2015.8](https://doi.org/10.1038/nrn.2015.8)). There is no feeding or climbing. The eyes do not blink, because the eyelids of the model are only a line round the eye.
- The contact shadow on the ground does not follow the motion.
- The motion was checked in a headless browser on one integrated graphics chip, at about 29 frames per second in the anatomy view with the coat, and was looked at as frames. It has not been run on a separate graphics card or judged by eye in use. A machine that struggles draws fewer hairs while the mouse moves. It has not been reviewed by a physiologist.
