import type { Atlas, Structure } from './types';

/** Source metadata controls display only, never quantitative measurements. */
export function defaultStructureOpacity(structure: Structure): number {
  return typeof structure.defaultOpacity === 'number' && Number.isFinite(structure.defaultOpacity)
    && structure.defaultOpacity >= 0 && structure.defaultOpacity <= 1 ? structure.defaultOpacity
    : structure.id === 'digimouse:1' ? 0.1 : 1;
}

export function referenceOpacity(atlas: Atlas, organs = false): Record<string, number> {
  return Object.fromEntries(atlas.structures.map((structure) => [structure.id,
    organs && (structure.id === 'digimouse:1' || structure.id === 'digimouse-volume:1') ? 0.06
      : organs && structure.systems.includes('skeletal') ? 0.14 : defaultStructureOpacity(structure)]));
}

export function initialReferenceSelection(atlas: Atlas): string | null {
  return atlas.structures.find((structure) => structure.systems.includes('cardiovascular'))?.id
    ?? atlas.structures[0]?.id ?? null;
}
