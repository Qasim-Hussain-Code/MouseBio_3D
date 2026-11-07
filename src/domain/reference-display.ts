import type { Atlas, Structure } from './types';
import { bodySurfaceIdFor, opensAsSkin } from './display-pose';

/** Source metadata controls display only, never quantitative measurements. */
export function defaultStructureOpacity(structure: Structure): number {
  return typeof structure.defaultOpacity === 'number' && Number.isFinite(structure.defaultOpacity)
    && structure.defaultOpacity >= 0 && structure.defaultOpacity <= 1 ? structure.defaultOpacity
    : structure.id === 'digimouse:1' ? 0.22 : 1;
}

/** Opacity of the body surface shown as skin when a reference opens or Show all is used. */
export const SKIN_OPACITY = 1;
/** At or above this opacity the body surface is treated as covering the regions inside it. */
export const OPAQUE_SKIN = 0.95;

/**
 * Initial display opacity. The body surface of a whole-body reference is shown
 * as opaque skin; the Organs preset makes it and the skeleton translucent.
 * Other regions, and a body cut by the scanned field, keep their source defaults.
 */
export function referenceOpacity(atlas: Atlas, organs = false): Record<string, number> {
  const body = bodySurfaceIdFor(atlas);
  const skin = opensAsSkin(atlas) ? body : null;
  return Object.fromEntries(atlas.structures.map((structure) => [structure.id,
    organs && structure.id === body ? 0.06
      : organs && structure.systems.includes('skeletal') ? 0.14
        : structure.id === skin ? SKIN_OPACITY : defaultStructureOpacity(structure)]));
}

/**
 * Whether an opaque, uncut body surface hides a region inside it. A thin body
 * surface can fall between the samples of a coarse grid, and a region behind it
 * would then appear through the gap, although at source resolution only the body
 * label meets the background.
 */
export function coveredBySkin(id: string, skinId: string | null | undefined, skinVisible: boolean, skinOpacity: number, clipAxis: string, exterior = false): boolean {
  return !!skinId && id !== skinId && !exterior && skinVisible && skinOpacity >= OPAQUE_SKIN && clipAxis === 'off';
}

/** At the bench the wall of the abdomen is a layer to be opened, and is solid. Elsewhere it is drawn faintly, like the peritoneum. Pockets of air and gas, traced from the scan, are not things that can be seen or taken hold of when an animal is opened. */
export function labOpacity(reference: Atlas): Record<string, number> {
  const opacity = referenceOpacity(reference);
  return 'living:abdominal-wall' in opacity ? { ...opacity, 'living:abdominal-wall': 1, 'living:airways': 0 } : opacity;
}

/** The see-through skin opacity used when the inside of the body is to be shown. */
export function seeThroughSkinOpacity(atlas: Atlas): number | null {
  const skin = bodySurfaceIdFor(atlas);
  const structure = skin ? atlas.structures.find((entry) => entry.id === skin) : undefined;
  return structure ? defaultStructureOpacity(structure) : null;
}

export function initialReferenceSelection(atlas: Atlas): string | null {
  // A model that shows a whole animal opens on its body surface, which is what the viewer first shows.
  const bodySurface = atlas.structures.some((structure) => structure.evidence) ? bodySurfaceIdFor(atlas) : null;
  return bodySurface ?? atlas.structures.find((structure) => structure.systems.includes('cardiovascular'))?.id
    ?? atlas.structures[0]?.id ?? null;
}
