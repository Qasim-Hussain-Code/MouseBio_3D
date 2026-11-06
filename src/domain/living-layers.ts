import type { Atlas, Structure } from './types';

/**
 * Steps from the outside of the living mouse inwards. Each step only chooses which existing
 * structures are shown and how strongly, and it adds no anatomy of its own.
 */
export type LayerStopId = 'coat' | 'skin' | 'flesh' | 'muscles' | 'organs' | 'vessels' | 'nerves' | 'skeleton';

export interface LayerStop {
  readonly id: LayerStopId;
  readonly name: string;
  readonly description: string;
  readonly hidden: readonly string[];
  readonly opacity: Readonly<Record<string, number>>;
  readonly coat: boolean;
}

const has = (structure: Structure, system: string) => structure.systems.includes(system);
const isSkeleton = (structure: Structure) => has(structure, 'skeletal');
const isMuscle = (structure: Structure) => has(structure, 'muscular') && !has(structure, 'respiratory');
const isFat = (structure: Structure) => structure.id === 'living:fat';
const isEye = (structure: Structure) => structure.id === 'living:eyes';
const isVessel = (structure: Structure) => has(structure, 'cardiovascular') || has(structure, 'arterial-venous');
const isNerve = (structure: Structure) => has(structure, 'nervous');
const FAINT_SKELETON = 0.14;

/** The step that matches what is shown now, if any. */
export function matchingStop(stops: readonly LayerStop[], hidden: readonly string[], opacity: Readonly<Record<string, number>>, coatShown: boolean): LayerStopId | null {
  const shown = new Set(hidden);
  for (const stop of stops) {
    if (stop.coat !== coatShown || stop.hidden.length !== shown.size || !stop.hidden.every((id) => shown.has(id))) continue;
    if (Object.entries(stop.opacity).every(([id, value]) => Math.abs((opacity[id] ?? value) - value) < 0.005)) return stop.id;
  }
  return null;
}

export function layerStops(atlas: Pick<Atlas, 'structures' | 'id'>): LayerStop[] {
  if (atlas.id !== 'mousebio-living-v1') return [];
  const { structures } = atlas;
  const all = structures.map((structure) => structure.id);
  const keep = (test: (structure: Structure) => boolean) => all.filter((id) => !test(structures.find((structure) => structure.id === id)!));
  const opacity = (skeleton: number) => Object.fromEntries(structures.map((structure) => [structure.id, isSkeleton(structure) ? skeleton : structure.defaultOpacity ?? 1]));
  const flayed = (structure: Structure) => !structure.exterior && structure.id !== 'living:skin';
  return [
    { id: 'coat', name: 'Coat', description: 'The whole mouse with its simulated coat', hidden: [], opacity: opacity(1), coat: true },
    { id: 'skin', name: 'Skin', description: 'The body surface with no coat', hidden: [], opacity: opacity(1), coat: false },
    { id: 'flesh', name: 'Fat and muscle', description: 'Under the skin', hidden: keep((s) => flayed(s) || isEye(s)), opacity: opacity(1), coat: false },
    { id: 'muscles', name: 'Muscles', description: 'Named muscles, without the fat', hidden: keep((s) => (flayed(s) && !isFat(s)) || isEye(s)), opacity: opacity(1), coat: false },
    { id: 'organs', name: 'Organs', description: 'Organs and vessels inside a faint skeleton', hidden: keep((s) => flayed(s) && !isFat(s) && !isMuscle(s)), opacity: opacity(FAINT_SKELETON), coat: false },
    { id: 'vessels', name: 'Blood vessels', description: 'Heart, arteries and veins', hidden: keep((s) => isVessel(s) || isSkeleton(s)), opacity: opacity(FAINT_SKELETON), coat: false },
    { id: 'nerves', name: 'Nerves', description: 'Brain, spinal cord and nerves', hidden: keep((s) => isNerve(s) || isSkeleton(s)), opacity: opacity(FAINT_SKELETON), coat: false },
    { id: 'skeleton', name: 'Skeleton', description: 'Bones only', hidden: keep(isSkeleton), opacity: opacity(1), coat: false },
  ];
}
