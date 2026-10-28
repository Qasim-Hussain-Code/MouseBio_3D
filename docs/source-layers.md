# Source layer composition

## Representation

The composer combines existing display groups from one selected reference. It selects their union by exact source-region identifier in the manifest's structure order. Overlapping memberships occur once. It does not combine anatomical references, merge geometry, reconstruct missing anatomy or establish ontology relationships. Group identifiers remain local display identifiers.

`composeSourceLayers(atlas, groupIds, context)` returns an immutable result containing `ok`, `structureIds`, `hidden`, `opacity` and `errors`. The source inventory must pass `buildAnatomyGroups`. Empty, duplicate, unavailable, malformed or unsupported group requests return empty display output with errors. Source metadata and caller choices are not mutated.

Selected regions receive opacity 1. In `hidden` context, all nonmembers are hidden and their stored opacity returns to the source default. In `faded` context, no regions are hidden and each nonmember receives the smaller of its source-default opacity and 0.15. An already translucent source default therefore does not become more opaque. These are presentation settings, not measurements of tissue transparency. Previous manual opacity adjustments are replaced by this action.

## Application behavior

Open Compose source layers, choose one or more groups, choose how to display other regions, then apply. The checklist stages an action and clears after a successful application. Changing reference resets it. Group choices may overlap, and a broad selection can contain all members of a narrower selection. The application still offers the existing single-group isolation selector.

Applying a composition retains current observations, their provenance, background and exploration mode. It selects a member when the prior selected structure is outside the union, restores base geometry, disables optional regional detail, clears clipping and requests framing of the selected bounds. Framing retains viewing direction and camera roll. In Compare, the same display settings apply to both panels over the same reference geometry.

Show all restores source visibility and opacity defaults. Saved views retain the resulting selection, visibility, opacity and optional camera pose with the existing atlas, asset and frame binding. They do not store the temporary checklist or a biological layer hierarchy. Loading a saved view retains observations separately.

## Scientific limits and verification

EMA147's named-surface view excludes only its skin-labelled file and unannotated reference. Its neural, explicit bone/cartilage and explicit tissue/layer selections follow exact deposited labels, with overlapping memberships and incomplete coverage. No anatomical identity is assigned to the reference surface. Sources retain their units, uncertainty, topology defects and independent coordinate frames. Fading context does not remove the need to inspect possible visual occlusion.

Domain cases use all four actual manifests to exercise source order, overlap, namespace isolation, context opacity, malformed requests and immutable output. The simulated interface flow checks retained observations and background, comparison, hiding, restoration and saving. Software checks do not establish actual browser rendering, pointer behavior, GPU performance or independent anatomical accuracy.
