import { buildAnatomyGroups } from './anatomy-groups';
import { defaultStructureOpacity } from './reference-display';
import type { Atlas } from './types';

export type SourceLayerContext = 'hidden' | 'faded';

export interface SourceLayersResult {
  readonly ok: boolean;
  readonly structureIds: readonly string[];
  readonly hidden: readonly string[];
  readonly opacity: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
}

function failure(errors: readonly string[]): SourceLayersResult {
  return Object.freeze({ ok: false, structureIds: Object.freeze([]), hidden: Object.freeze([]),
    opacity: Object.freeze({}), errors: Object.freeze([...errors]) });
}

/** Combine existing source groups for display, without new anatomy or registration. */
export function composeSourceLayers(atlas: Atlas, groupIds: readonly string[], context: SourceLayerContext): SourceLayersResult {
  if (context !== 'hidden' && context !== 'faded') return failure(['Choose hidden or faded context.']);
  try {
    if (!Array.isArray(groupIds) || groupIds.length === 0 || groupIds.length > 128) {
      return failure(['Choose a nonempty list of distinct source groups.']);
    }
    const choices: string[] = [];
    for (let index = 0; index < groupIds.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(groupIds, String(index));
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string' || descriptor.value.length === 0) {
        return failure(['Choose a nonempty list of distinct source groups.']);
      }
      choices.push(descriptor.value);
    }
    if (new Set(choices).size !== choices.length) return failure(['Choose a nonempty list of distinct source groups.']);
    const supported = buildAnatomyGroups(atlas);
    if (!supported.ok) return failure(supported.errors);
    const groups = new Map(supported.groups.map((group) => [group.id, group]));
    if (choices.length > groups.size || choices.some((id) => !groups.has(id))) {
      return failure(['A selected source group is unavailable for this reference.']);
    }
    const selected = new Set(choices.flatMap((id) => [...groups.get(id)!.structureIds]));
    const structureIds: string[] = [], hidden: string[] = [];
    const opacity: [string, number][] = [];
    const known = new Set<string>();
    for (const structure of atlas.structures) {
      if (!structure || typeof structure.id !== 'string' || known.has(structure.id)) {
        return failure(['The source region inventory is malformed.']);
      }
      known.add(structure.id);
      const member = selected.has(structure.id);
      if (member) structureIds.push(structure.id);
      else if (context === 'hidden') hidden.push(structure.id);
      const normalOpacity = defaultStructureOpacity(structure);
      opacity.push([structure.id, member ? 1 : context === 'faded' ? Math.min(normalOpacity, 0.15) : normalOpacity]);
    }
    if (selected.size === 0 || structureIds.length !== selected.size) {
      return failure(['The selected source groups do not match the complete region inventory.']);
    }
    return Object.freeze({ ok: true, structureIds: Object.freeze(structureIds), hidden: Object.freeze(hidden),
      opacity: Object.freeze(Object.fromEntries(opacity)), errors: Object.freeze([]) });
  } catch {
    return failure(['The anatomical source inventory is malformed or unsupported.']);
  }
}
