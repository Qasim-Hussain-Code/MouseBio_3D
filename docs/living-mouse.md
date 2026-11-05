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
- Greene EC. *Anatomy of the Rat*. Transactions of the American Philosophical Society, New Series, vol. 27, 1935. This is the basis for nerves, and it describes the rat, not the mouse. Every structure citing it says so.
- Dogdas B, Stout D, Chatziioannou AF, Leahy RM. Digimouse: a 3D whole body mouse atlas from CT and cryosection data. *Physics in Medicine and Biology* 2007;52:577-587. <https://doi.org/10.1088/0031-9155/52/3/003>. This is the source of all measured data.

## Measured inputs

`scripts/living/decode_inputs.py` decodes [the packaged section images](section-images.md) into raw volumes outside the project, and `scripts/living/build.ts` builds the model from them with no other input. Surfaces come from surface nets over smoothed fields, on grids of 0.1 to 0.4 mm, so they carry no voxel terraces. Smoothing is part of the geometry here and is not a display option.

The skeleton is an isosurface of the CT within two voxels of the source skeleton label, together with CT bone outside the labelled body. This shows the digit bones of the fore paws, which the source label crops. Bones are not separated by name.

## Tracing tissue

The source label image leaves most soft tissue in one residual label. `scripts/living/trace.ts` classifies its voxels by rules on a 3 by 3 by 3 mean of the photograph and CT:

- **Air spaces**: CT value below 12.
- **Blood-filled vessels**: luminance below 34, at least 0.8 mm below the surface, with thin sheets and components under 1.5 mm³ removed. Arteries are mostly empty after death, so these are mainly veins.
- **Intestines**: yellow-green or tan colour within an abdominal cavity mask, which is the source abdominal labels and yellow voxels closed across a 2.8 mm gap, more than 1.2 mm below the surface, grown 0.2 mm to include the wall.
- **Adipose and connective tissue**: CT value below 88, or pale and unsaturated colour.
- **Skeletal muscle**: the rest, outside the abdominal cavity. Individual muscles are not separated or named.

The thresholds were chosen by inspecting slices, and the classes have not been reviewed. The stomach and spleen lie at high native x, and with the right-handed axes this makes high x the animal's left. This is an inference from label positions, not a verified laterality.

## Simulated posture

The specimen was frozen and scanned spread flat, with the fore limbs reaching forward and the hind limbs back. `scripts/living/rig.ts` holds joint positions snapped to bone in the CT. Each limb segment receives one rigid rotation about its joint, which preserves its measured length, and the distal segments are pitched so that all paws reach a common ground. The rump is tucked by 24 degrees and the head lifted by 13 degrees, about pivots on the vertebral column, so that the back rounds as in a standing mouse. These angles were chosen by eye and are not measured from any animal.

Skeleton voxels are assigned to the nearest limb segment, organ labels are assigned to the trunk, and a breadth-first search through the body carries that assignment to all soft tissue. Surfaces are deformed vertex by vertex, blending the rigid transforms with dual quaternions across smoothed weights. Organs therefore bend a little across the lumbar spine, and all positions in this reference differ from the scanned frame. It has no accepted registration to the other references, which keep their scanned posture.

## Simulated exterior

The body surface carries the source voxels into the stance as one closed surface. The scanned shanks lay pressed flat, so they are replaced by tapered shapes whose radii are the 80th percentile of the distance of leg tissue from the shank axis. The paws are sculpted after Cook figures 6 and 7: four digits and a pollex on the fore paw, with digit spacing and lengths taken from the CT, and five digits on the hind paw, because the images end at the hind feet. Whisker groups follow Cook figure 5, with counts and lengths chosen by eye. The eyes are placed where a ray from the source eye label leaves the head. The tail follows the caudal vertebrae measured in the CT, then falls to the ground, and its length is an estimate.

The specimen is a nude mouse, so the coat is wholly simulated. It is drawn by shell texturing in `src/viewer/fur.ts`: the skin is repeated at growing offsets along its normals, combed along a stored direction, and each shell keeps only the pixels inside a hair. **Coat** in Display controls chooses agouti, black, albino or none. Hair length, density and colours are display estimates.

## Simulated interior

`scripts/living/internal.ts` places routes and bodies on landmarks measured from the labels and CT, in the scanned frame, and the posture then carries them. The aorta runs along the ventral side of the vertebral column as measured in the CT, the spinal cord follows the vertebral canal, the ureters join the source kidneys to the source bladder, and the diaphragm lies midway between the source thoracic and abdominal labels. Their radii, and everything not tied to a landmark, are estimates. The list of structures and the basis of each is in the manifest.

## Limitations

This is one specimen with estimated additions, not a representative or average mouse. Simulated courses can differ from real anatomy in detail, and they have not been compared with any dissection. Traced classes contain errors at tissue boundaries, and the muscle layer is not yet divided into named muscles. Physical calibration, anatomical orientation and laterality remain unverified. No part of this model has had independent anatomical review, and it must not be used for measurement.
