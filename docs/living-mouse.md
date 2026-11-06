# Living mouse model

The living mouse reference is a constructed static model. It combines measured data from one Digimouse specimen with simulated structures, in a simulated standing posture, so that a complete mouse can be examined layer by layer. It is not a measurement of a living mouse. No dataset known to this project contains every layer of one animal, and where data are missing this model simulates them and says so.

## Evidence classes

Every structure in [the manifest](../public/atlas-living/atlas.json) declares one class, and the interface shows it in the structure list, the details panel and the label on the model. **Show by evidence** in Layers hides or shows a whole class.

| Class | Meaning | Examples |
| --- | --- | --- |
| Source label | Labelled by the source authors. The surface is extracted from a smoothed mask of the Digimouse label image. | Heart, lungs, liver, stomach, kidneys, six brain regions. |
| Traced | Found in the coregistered source images by automatic rules in this project. The location is measured, but the classification is not reviewed by an anatomist. | Skeleton from CT, intestines, skeletal muscle, fat, blood-filled vessels, air spaces. |
| Simulated | Constructed from published descriptions. Course, size and shape are estimates and are not measured. | Coat, whiskers, ears, paws, tail, arteries, peripheral nerves, glands, lymph nodes. |

The posture applies to all of them. Publication checks reject a simulated structure whose description does not begin by saying that it is simulated, and any structure without a declared class and basis.

## Sources for simulated anatomy

Simulated structures follow these works, read as descriptions. No figure or text is reproduced.

- Cook MJ. *The Anatomy of the Laboratory Mouse*. Academic Press, 1965; [web edition](https://www.informatics.jax.org/cookbook/) by Mouse Genome Informatics. Its plates cover externals, skeleton, viscera and the circulatory system, for example the order of the aortic arch branches and the paired superior venae cavae (figure 90), and the lengths of the alimentary canal (figure 57).
- Hummel KP, Richardson FL, Fekete E. Anatomy. In: Green EL, ed. *Biology of the Laboratory Mouse*, 2nd ed., 1966; [web edition](https://www.informatics.jax.org/greenbook/). It gives the vertebral formula, the bones of the paws, the lymph nodes and their locations, the salivary glands, and the relation of the inferior vena cava to the aorta. It states that it does not describe the muscular or nervous systems.
- O'Connell GD, Vresilovic EJ, Elliott DM. Comparison of animals used in disc research to human lumbar disc geometry. *Spine* 2007;32(3):328-33. <https://doi.org/10.1097/01.brs.0000253961.40910.c1>. It compares intervertebral discs of the mouse with those of other animals. It is the basis for including discs; no value from it is used, and their size follows the gaps in the CT.
- Fuller JL, Wimer RE. Neural, sensory, and motor functions. In: Green EL, ed. *Biology of the Laboratory Mouse*, 2nd ed., 1966, chapter 32; [web edition](https://www.informatics.jax.org/greenbook/chapters/chapter32.shtml). It states that the lens nearly fills the globe and is almost spherical, and that the cornea covers about half the surface of the eyeball.
- Greene EC. *Anatomy of the Rat*. Transactions of the American Philosophical Society, New Series, vol. 27, 1935. This is the basis for nerves, and it describes the rat, not the mouse. Every structure citing it says so.
- Dogdas B, Stout D, Chatziioannou AF, Leahy RM. Digimouse: a 3D whole body mouse atlas from CT and cryosection data. *Physics in Medicine and Biology* 2007;52:577-587. <https://doi.org/10.1088/0031-9155/52/3/003>. This is the source of all measured data.

## Measured inputs

`scripts/living/decode_inputs.py` decodes [the packaged section images](section-images.md) into raw volumes outside the project, and `scripts/living/build.ts` builds the model from them with no other input. Surfaces come from surface nets over smoothed fields, on grids of 0.1 to 0.4 mm, so they carry no voxel terraces. Smoothing is part of the geometry here and is not a display option.

The skeleton is an isosurface of the CT within two voxels of the source skeleton label, together with CT bone at the fore paws outside the labelled body, which shows the digit bones that the source label crops. `scripts/living/bones.ts` divides it into 99 named bones and groups of bones, whose boundaries are all estimates. Each bone voxel first goes to a coarse group whose course, placed by hand on the joints and the column, is nearest. Within the column, ribs, sternum and scapulae, each voxel then goes to the seed with the shortest path to it through bone, so that a process stays with the vertebra it grows from. Limits between vertebrae are read from this specimen's CT: minima of bone in the vertebral bodies, rib heads meeting the column at those minima from the seventh cervical to the twelfth thoracic vertebra, and gaps between dorsal arches in the neck and sacrum. The CT shows 7 cervical, 13 thoracic, 6 lumbar and 4 sacral vertebrae, 13 pairs of ribs and 5 caudal vertebrae, in agreement with Hummel et al. The long spine of the second thoracic vertebra supports the numbering. The CT shows no sutures, so the 12 bones and paired bones of the skull are divided by position, with proportions read off Cook figures 11 to 13. Radius and ulna, tibia and fibula, and the bones of each paw are not separated. Limb bones move as rigid pieces about their joints. Two small bones lie outside the source skeleton label and are read directly from the CT: a U-shaped bone below the skull, taken as the hyoid, and a tapering bone under the skin of the ventral midline, taken as the os penis. Their names rest on shape and position.

## Tracing tissue

The source label image leaves most soft tissue in one residual label. `scripts/living/trace.ts` classifies its voxels by rules on a 3 by 3 by 3 mean of the photograph and CT:

- **Air spaces**: CT value below 12.
- **Blood-filled vessels**: luminance below 34, at least 0.8 mm below the surface, with thin sheets and components under 1.5 mm³ removed. Arteries are mostly empty after death, so these are mainly veins.
- **Intestines**: yellow-green or tan colour within an abdominal cavity mask, which is the source abdominal labels and yellow voxels closed across a 2.8 mm gap, more than 1.2 mm below the surface, grown 0.2 mm to include the wall.
- **Adipose and connective tissue**: CT value below 88, or pale and unsaturated colour.
- **Skeletal muscle**: the rest, outside the abdominal cavity.

The thresholds were chosen by inspecting slices, and the classes have not been reviewed. The stomach and spleen lie at high native x, and with the right-handed axes this makes high x the animal's left. This is an inference from label positions, not a verified laterality.

## Simulated posture

The specimen was frozen and scanned spread flat, with the fore limbs reaching forward and the hind limbs back. `scripts/living/rig.ts` holds joint positions snapped to bone in the CT. Each limb segment receives one rigid rotation about its joint, which preserves its measured length, and the distal segments are pitched so that all paws reach a common ground. The rump is tucked by 24 degrees and the head lifted by 16 degrees, about pivots on the vertebral column, so that the back rounds as in a standing mouse. The ground lies 7.2 mm below the scanned table and the thigh is held nearly level, so that the knee stays high against the flank and the ankle comes to lie under the hip. These angles and this height were chosen by eye and are not measured from any animal.

Skeleton voxels are assigned to the nearest limb segment, organ labels are assigned to the trunk, and a breadth-first search through the body carries that assignment to all soft tissue. Surfaces are deformed vertex by vertex, blending the rigid transforms with dual quaternions across smoothed weights. Organs therefore bend a little across the lumbar spine, and all positions in this reference differ from the scanned frame. It has no accepted registration to the other references, which keep their scanned posture.

## Simulated exterior

The body surface carries the source voxels into the stance as one closed surface. The scanned shanks lay pressed flat and the scanned forearms end in a blunt mass of tissue round the wrists, so both are replaced by tapered shapes whose radii are the 80th percentile of the distance of limb tissue from the limb axis, limited to the radii of a slender limb. The paws are sculpted after Cook figures 6 and 7: four digits and a pollex on the fore paw, with digit spacing and lengths taken from the CT, and five digits on the hind paw, because the images end at the hind feet. Whisker groups follow Cook figure 5, with counts and lengths chosen by eye; each whisker tapers to a fine point and curves back along the face. The pinnae follow Cook figures 4 and 5, with a dark opening low on the front of a cupped bowl. The nose pad is sculpted with nostrils and a groove down its middle, and a mouth line is drawn on the outer surface of the labels as in figure 5, because the images do not separate the lips. The eyes are placed where a ray from the source eye label leaves the head. The tail follows the caudal vertebrae measured in the CT, then falls to the ground, and its length is an estimate.

The specimen is a nude mouse, so the coat is wholly simulated. `scripts/living/coat.ts` stores for each vertex of the skin the direction in which hair lies, its relative length and its place on the coat pattern, which follows the general pattern of a wild-type mouse: a darker back, a paler belly with a diffuse border low on the flank, and hair that shortens and turns pale towards the paws. `src/viewer/fur.ts` draws the coat as individual hairs: about 367,000 roots are scattered over the body in proportion to area, with a fixed seed, and each hair is a tapered ribbon that turns to face the camera and curves along the stored direction, with neighbouring hairs leaning together in small tufts. About 19,000 finer hairs lie on the ears, the backs of the paws and, sparsely, the tail. **Coat** in Display controls chooses agouti, black, albino or none, and the colours of the ears, tail, paws and nose follow the coat, because pigmented mice have darker skin there than albino mice. Hair length, density, width, the pattern and all of these colours are display estimates chosen by eye, and a real coat has many more and much finer hairs.

## Named parts of measured tissue

Some structures keep measured tissue but divide it by estimate, and their marks say so ("Traced, division estimated" or "Source label, division estimated"). `scripts/living/muscles.ts` gives each of 41 muscles a course from origin to insertion, placed by hand on the joints and the vertebral column, and each cell of traced muscle tissue goes to the muscle whose course is nearest relative to its width. Hind limb names follow Charles et al. (2016), which describes the mouse ([doi:10.1371/journal.pone.0147669](https://doi.org/10.1371/journal.pone.0147669)), and other names follow Greene (1935), which describes the rat. Fine stripes along each course and pale patches at its ends are a display of fibre direction and tendon, not a measurement. The heart label is divided into four chambers, the right lung into the four lobes and the liver into the four lobes named by Cook, and the stomach into two regions, each by the nearest of hand-placed seeds, with internal cavities not modelled. The traced gut is divided by thickness and position into caecum, colon and rectum, and small intestine. The kidneys and testes are separated by side, and these names rest on the same inference of laterality.

## Simulated interior

`scripts/living/internal.ts` places routes and bodies on landmarks measured from the labels and CT, in the scanned frame, and the posture then carries them. Structures of the trunk and head follow only the bends of the column, and they do not follow a limb that lay beside them in the scan. The aorta runs along the ventral side of the vertebral column as measured in the CT, the spinal cord follows the vertebral canal, the ureters join the source kidneys to the source bladder, and the diaphragm lies midway between the source thoracic and abdominal labels. Their radii, and everything not tied to a landmark, are estimates. Teeth are placed in the jaws seen in the CT, whose 8-bit values do not separate teeth from bone. `scripts/living/interiors.ts` builds the insides of organs as nested closed surfaces, which show in a section, by eroding a source label by an estimated distance: the spaces of the heart, with a thick wall to the left ventricle, a thinner one to the right and thin walls to the atria, the renal medulla and pelvis, the lumen and limiting ridge of the stomach, and the lumen of the bladder. The source images do not separate any of these spaces. Placements in the neck and pelvis were compared with colour sections of the specimen and with the CT, which show the midline of the neck, the hyoid, the jugular veins, the pubic bone, the os penis and the anal canal; the trachea is collapsed in this specimen and cannot be followed. The list of structures and the basis of each is in the manifest.

The build stops if more than 0.1 percent of the vertices of any simulated interior lie over half a millimetre outside the labelled body of the specimen in the scanned frame. Vertices nearer the surface are allowed, for openings such as the external auditory meatus.

## Trees inside organs

Bronchi and the branches of the pulmonary, hepatic, portal, renal, cerebral and mesenteric vessels are generated by space colonization (Runions A, Lane B, Prusinkiewicz P. Modeling trees with a space colonization algorithm. *Eurographics Workshop on Natural Phenomena*, 2007): points scattered in the source organ label attract branches that grow from a hand-placed root at the hilum, and radii follow Murray's law from the tips back to the root. The trees fill the measured volumes, but no branch follows a real vessel or airway, and the number of branches is a display limit that is far below the real number. The membranes (pericardium, pleura, meninges and peritoneum) are faint surfaces at an estimated distance from the source labels, and they carry no measured thickness.

## Beyond the data

The specimen has no measured detail below about 0.1 mm. [The zoom from skin to the proton](scale-journey.md) is a separate representative view of what lies below that scale. None of it comes from this specimen and none of it is part of this model.

## Limbs and skin

The scanned shanks and forearms lay pressed flat, so the limb skin there is a simulated shape. It now follows the centre line of the measured bones of each limb in the stance, and it is wide enough to hold 95 percent of their voxels at each of five stations along the limb. Traced muscles of the shanks and forearms are wider than these slender limbs, so their outer parts are drawn in towards the middle of the limb, smoothly, until they lie under the skin. Any other soft part that the posture leaves outside the skin is moved to just under it at the nearest place. Bones are not moved, because they are measured and rigid, so a small part of a bone can still reach the skin. Parts below the wrists and ankles, in the eyes and in the tail are closed by their own surfaces and are left where they are.

## Named vessels and nerves

Vessels, nerves and lymph nodes that were held in groups are now separate structures, so that a place in the body can say which of them lie there. The order of branching of the hind limb arteries, and their relations to the muscles, follow the dissections of Kochi et al. (2013) in the mouse, which also name the lateral saphenous and ischial veins on the outer side of the thigh. Their deep femoral artery varies in origin, and it is drawn from the internal iliac artery, the commonest origin there. The third and fourth lumbar nerves as the main origin of the sciatic nerve follow Rigaud et al. (2008) in the mouse, and its division into tibial, common peroneal and sural branches follows Shields et al. (2003) in the mouse. The other nerves, the tibial arteries and the fore limb follow Greene (1935), which describes the rat. Courses and radii are estimates placed on the measured joints in a frame made for each limb. The arteries of the forearm are not divided into named arteries, because no source for the mouse was checked. The paws hold one simple artery, vein and nerve along each digit, which are not divided into named branches either.


## All layers together

[All layers together](all-layers.md) opens the model at one place, so that its layers can be seen at the same time.

## What is and is not modelled

The [coverage list](living-mouse-coverage.md) sets out what the model holds for each body system, and what it leaves out.

## Limitations

This is one specimen with estimated additions, not a representative or average mouse. Simulated courses can differ from real anatomy in detail, and they have not been compared with any dissection. Traced classes contain errors at tissue boundaries. Named muscles and organ parts have estimated boundaries, and they do not follow fascia or fissures. Physical calibration, anatomical orientation and laterality remain unverified. No part of this model has had independent anatomical review, and it must not be used for measurement.
