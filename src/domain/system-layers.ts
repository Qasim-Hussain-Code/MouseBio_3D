import { SYSTEMS, type Structure, type SystemId } from './types';
import { defaultStructureOpacity } from './reference-display';

export type SystemLayerVisibility = 'visible' | 'partial' | 'hidden';
export interface SystemLayerCategory { readonly id: SystemId; readonly name: string }
export interface SystemLayer extends SystemLayerCategory {
  readonly structureIds: readonly string[];
  readonly memberCount: number;
  readonly visibleCount: number;
  readonly state: SystemLayerVisibility;
}
export interface SystemLayersResult {
  readonly ok: boolean;
  readonly represented: readonly SystemLayer[];
  readonly missing: readonly SystemLayerCategory[];
  readonly unclassifiedCount: number;
  readonly unclassifiedVisibleCount: number;
  readonly unclassifiedStructureIds: readonly string[];
  readonly totalCount: number;
  readonly visibleCount: number;
  readonly errors: readonly string[];
}

const CATEGORIES: readonly SystemLayerCategory[] = Object.freeze(SYSTEMS.map(({ id, name }) => Object.freeze({ id, name })));
const IDS = new Set<string>(CATEGORIES.map((category) => category.id));

/** Read data properties without treating accessors as source metadata. */
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}
function denseArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length <= 100000 && Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return !!descriptor && 'value' in descriptor;
  }).every(Boolean);
}
function rejected(): SystemLayersResult {
  return Object.freeze({ ok: false, represented: Object.freeze([]), missing: Object.freeze([]),
    unclassifiedCount: 0, unclassifiedVisibleCount: 0, unclassifiedStructureIds: Object.freeze([]), totalCount: 0, visibleCount: 0,
    errors: Object.freeze(['System layers require valid source classifications and display settings.']) });
}

/** Display membership only. Counts include hidden flags and opacity, not clipping, occlusion or biological completeness. */
export function buildSystemLayers(atlas: unknown, hidden: unknown = [], opacity: unknown = {}): SystemLayersResult {
  try {
    const atlasId = field(atlas, 'id'), structures = field(atlas, 'structures');
    if (typeof atlasId !== 'string' || !atlasId.trim() || !denseArray(structures) || !denseArray(hidden)
      || !opacity || typeof opacity !== 'object' || Array.isArray(opacity)) return rejected();
    const sourceIds = new Set<string>();
    const records: { id: string; systems: readonly string[]; defaultOpacity: number }[] = [];
    for (const structure of structures) {
      const id = field(structure, 'id'), systems = field(structure, 'systems');
      if (typeof id !== 'string' || !id.trim() || sourceIds.has(id) || !denseArray(systems)
        || systems.some((system) => typeof system !== 'string' || !IDS.has(system)) || new Set(systems).size !== systems.length) return rejected();
      sourceIds.add(id);
      records.push({ id, systems: systems as readonly string[],
        defaultOpacity: defaultStructureOpacity({ id, defaultOpacity: field(structure, 'defaultOpacity') } as Structure) });
    }
    if (hidden.some((id) => typeof id !== 'string' || !sourceIds.has(id))) return rejected();
    const explicitOpacity = new Map<string, number>();
    for (const key of Reflect.ownKeys(opacity)) {
      if (typeof key !== 'string' || !sourceIds.has(key)) return rejected();
      const value = field(opacity, key);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return rejected();
      explicitOpacity.set(key, value);
    }
    const hiddenIds = new Set(hidden as readonly string[]);
    const visibleIds = new Set(records.filter((record) => !hiddenIds.has(record.id)
      && (explicitOpacity.get(record.id) ?? record.defaultOpacity) > 0).map((record) => record.id));
    const represented: SystemLayer[] = [], missing: SystemLayerCategory[] = [];
    for (const category of CATEGORIES) {
      const structureIds = records.filter((record) => record.systems.includes(category.id)).map((record) => record.id);
      if (!structureIds.length) { missing.push(category); continue; }
      const visibleCount = structureIds.filter((id) => visibleIds.has(id)).length;
      represented.push(Object.freeze({ ...category, structureIds: Object.freeze(structureIds), memberCount: structureIds.length,
        visibleCount, state: visibleCount === 0 ? 'hidden' : visibleCount === structureIds.length ? 'visible' : 'partial' }));
    }
    const unclassified = records.filter((record) => !record.systems.length).map((record) => record.id);
    return Object.freeze({ ok: true, represented: Object.freeze(represented), missing: Object.freeze(missing),
      unclassifiedCount: unclassified.length, unclassifiedVisibleCount: unclassified.filter((id) => visibleIds.has(id)).length,
      unclassifiedStructureIds: Object.freeze(unclassified), totalCount: records.length, visibleCount: visibleIds.size, errors: Object.freeze([]) });
  } catch { return rejected(); }
}
