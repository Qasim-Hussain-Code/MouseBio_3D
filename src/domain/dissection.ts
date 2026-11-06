import type { Atlas, Structure } from './types';

/**
 * All layers of the living mouse at the same time, as in a dissection: at one place each layer is cut back a little
 * less than the layer above it, so that all of them can be seen together. Vessels and nerves are not cut, as a
 * dissector would keep them. The steps and folds are a way of showing the model and they are not anatomical planes.
 * Nothing here adds or measures anatomy.
 */
export type DissectionTierId = 'skin' | 'fat' | 'panniculus' | 'outer-muscle' | 'inner-muscle' | 'lining' | 'skeleton' | 'organs' | 'vessels-nerves';

export interface DissectionTier {
  readonly id: DissectionTierId;
  readonly name: string;
  /** Size of the opening in this layer, as a share of the opening in the skin. */
  readonly width: number;
  /** How far the removed part folds back, in degrees; zero means that it is simply not shown. */
  readonly fold: number;
}

/** From the outside inwards. The order is the order of the list of what lies at a place. */
export const DISSECTION_TIERS: readonly DissectionTier[] = Object.freeze([
  { id: 'skin', name: 'Skin and coat', width: 1, fold: 176 },
  { id: 'fat', name: 'Fat', width: 0.93, fold: 0 },
  { id: 'panniculus', name: 'Skin muscle', width: 0.87, fold: 0 },
  { id: 'outer-muscle', name: 'Outer muscles', width: 0.74, fold: 0 },
  { id: 'inner-muscle', name: 'Inner muscles', width: 0.56, fold: 0 },
  { id: 'lining', name: 'Linings of the cavities', width: 0.5, fold: 0 },
  { id: 'skeleton', name: 'Bones', width: 0.3, fold: 0 },
  { id: 'organs', name: 'Organs and glands', width: 0, fold: 0 },
  { id: 'vessels-nerves', name: 'Vessels and nerves', width: 0, fold: 0 },
]);

/** Muscles met first under the skin. A choice for display, following the order of layers in Cook (1965) and Hummel et al. (1966). */
const OUTER_MUSCLES: ReadonlySet<string> = new Set(['masseter', 'muscle-temporalis', 'muscle-facial', 'muscle-mystacial', 'muscle-digastric',
  'muscle-sternomastoid', 'muscle-acromiotrapezius', 'muscle-spinotrapezius', 'muscle-latissimus', 'muscle-pectoralis', 'muscle-obliques',
  'muscle-deltoid', 'muscle-triceps', 'muscle-forearm-extensors', 'muscle-gluteus', 'muscle-biceps-femoris', 'muscle-caudofemoralis',
  'muscle-gracilis', 'muscle-gastrocnemius', 'muscle-tibialis', 'muscle-tail-base', 'calcaneal-tendons']);
const LININGS: ReadonlySet<string> = new Set(['pleura', 'peritoneum', 'pericardium', 'meninges']);
const HEART: ReadonlySet<string> = new Set(['heart-lv', 'heart-rv', 'heart-la', 'heart-ra', 'left-heart-spaces', 'right-heart-spaces', 'heart-valves']);
const BRAIN: ReadonlySet<string> = new Set(['cerebrum', 'striatum', 'brain-forebrain', 'brain-thalamus', 'brain-hypothalamus', 'brain-hippocampus', 'brain-midbrain', 'brain-pons', 'cerebellum', 'medulla', 'olfactory', 'brain-ventricles']);
const EYE: ReadonlySet<string> = new Set(['eyes', 'corneas', 'irises', 'lenses', 'retinas']);

/** The layer a structure of the living mouse belongs to, for this display only. */
export function dissectionTier(structure: Pick<Structure, 'id' | 'systems'>): DissectionTierId {
  const id = structure.id.replace(/^living:/, ''), has = (system: string) => structure.systems.includes(system);
  if (LININGS.has(id)) return 'lining';
  if (HEART.has(id) || BRAIN.has(id) || EYE.has(id)) return 'organs';
  if (id === 'fat' || id === 'brown-fat') return 'fat';
  if (id === 'panniculus') return 'panniculus';
  if (has('integumentary')) return 'skin';
  if (has('skeletal')) return 'skeleton';
  if (has('nervous') || has('cardiovascular') || has('arterial-venous') || id.startsWith('lymph-')) return 'vessels-nerves';
  if (has('muscular') && !has('respiratory')) return OUTER_MUSCLES.has(id) ? 'outer-muscle' : 'inner-muscle';
  return 'organs';
}

export interface DissectionSettings {
  /** 0 is the closed mouse and 1 the fully opened layers. */
  readonly opening: number;
  /** Fold the removed part of the outer layers back, as pages, instead of leaving it out. */
  readonly folded: boolean;
  /** Cut through the organs as well, to show their insides. */
  readonly cutOrgans: boolean;
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** How far a layer has opened at a given opening of the whole: from the outside inwards, each starting after the one above it. */
export function tierProgress(tier: DissectionTierId, opening: number): number {
  const order = DISSECTION_TIERS.findIndex((item) => item.id === tier);
  const span = 0.42, step = (1 - span) / (DISSECTION_TIERS.length - 3);
  return smooth((opening - order * step) / span);
}

/** Radius of the opening in a layer, for an opening of the given radius in the skin. Zero means that the layer is not cut. */
export function tierRadius(tier: DissectionTierId, skinRadius: number, settings: DissectionSettings): number {
  const item = DISSECTION_TIERS.find((entry) => entry.id === tier);
  if (!item) return 0;
  const share = tier === 'organs' && settings.cutOrgans ? 0.24 : item.width;
  return skinRadius * share * tierProgress(tier, settings.opening);
}

/** How far the removed part of a layer has folded back, in degrees. */
export function tierFold(tier: DissectionTierId, settings: DissectionSettings): number {
  const item = DISSECTION_TIERS.find((entry) => entry.id === tier);
  return item && settings.folded ? item.fold * tierProgress(tier, settings.opening) : 0;
}

export type DissectionPlaceId = 'side' | 'head' | 'neck' | 'chest' | 'abdomen' | 'hip' | 'shoulder' | 'forearm' | 'thigh' | 'shank' | 'fore-paw' | 'hind-paw' | 'tail';

/** Places that can be opened directly. The opening is sized from the bones named, and the camera looks along the opening. */
export const DISSECTION_PLACES: readonly { readonly id: DissectionPlaceId; readonly name: string; readonly bones: readonly string[]; readonly width: number; readonly limb?: boolean; readonly surface?: string }[] = Object.freeze([
  { id: 'side', name: 'Whole side', bones: [], width: 1 },
  { id: 'head', name: 'Head', bones: ['bone-zygomatic', 'bone-squamosal', 'bone-parietal', 'bone-frontal'], width: 0.75 },
  { id: 'neck', name: 'Neck', bones: ['bone-c2', 'bone-c3', 'bone-c4', 'bone-c5', 'bone-c6'], width: 1.05 },
  { id: 'chest', name: 'Chest', bones: ['bone-rib-3', 'bone-rib-4', 'bone-rib-5', 'bone-rib-6', 'bone-rib-7'], width: 0.9 },
  { id: 'abdomen', name: 'Abdomen', bones: ['bone-l1', 'bone-l2', 'bone-l3', 'bone-l4'], width: 1.3 },
  { id: 'hip', name: 'Hip', bones: ['bone-coxa'], width: 0.7 },
  { id: 'shoulder', name: 'Shoulder', bones: ['bone-scapula'], width: 0.75 },
  { id: 'forearm', name: 'Fore limb', bones: ['bone-humerus', 'bone-forearm'], width: 0.3, limb: true },
  { id: 'thigh', name: 'Thigh', bones: ['bone-femur'], width: 0.42, limb: true },
  { id: 'shank', name: 'Shank', bones: ['bone-tibia'], width: 0.3, limb: true },
  { id: 'fore-paw', name: 'Fore paw', bones: ['bone-manus'], width: 0.3, limb: true, surface: 'forepaws' },
  { id: 'hind-paw', name: 'Hind paw', bones: ['bone-pes'], width: 0.3, limb: true, surface: 'hindpaws' },
  { id: 'tail', name: 'Tail', bones: ['tail-vertebrae'], width: 0.11, limb: true, surface: 'tail' },
]);

/** One structure found at the opened place. */
export interface HereItem {
  readonly id: string;
  readonly name: string;
  readonly tier: DissectionTierId;
  readonly evidence?: Structure['evidence'];
  /** Depth under the top of the opening, in the units of the display, for ordering only. */
  readonly depth: number;
  /** Whether any of it can be seen from the present view. */
  readonly seen?: boolean;
}

/** Which of the structures in view get a name on the view: every layer in turn, and within a layer the largest in view first. */
export function namesToShow<T extends { readonly id: string; readonly tier: DissectionTierId; readonly pixels: number }>(seen: readonly T[], selected: string | null): (T & { rank: number })[] {
  const queues = DISSECTION_TIERS.map((tier) => seen.filter((item) => item.tier === tier.id && item.pixels >= 6 && item.id !== selected).sort((a, b) => b.pixels - a.pixels));
  const out: (T & { rank: number })[] = [];
  const chosen = seen.find((item) => item.id === selected);
  if (chosen) out.push({ ...chosen, rank: Number.MAX_SAFE_INTEGER });
  let rank = 100000;
  for (let round = 0; queues.some((queue) => round < queue.length); round++) for (const queue of queues) if (queue[round]) out.push({ ...queue[round], rank: rank-- });
  return out;
}

/** Outside first, and within a layer the shallowest first. */
export function orderHere(items: readonly HereItem[]): HereItem[] {
  const order = (item: HereItem) => DISSECTION_TIERS.findIndex((tier) => tier.id === item.tier);
  return [...items].sort((left, right) => order(left) - order(right) || left.depth - right.depth || left.name.localeCompare(right.name));
}

const PLACE_OF_BONE: readonly (readonly [RegExp, string])[] = [
  [/bone-femur|patellae/, 'thigh'], [/bone-(tibia|fibula)/, 'shank'], [/bone-pes|foot-bones/, 'hind paw'], [/bone-coxa/, 'hip'],
  [/bone-humerus/, 'upper fore limb'], [/bone-forearm/, 'forearm'], [/bone-manus/, 'fore paw'], [/bone-(scapula|clavicle)/, 'shoulder'],
  [/bone-rib|bone-sternebra|bone-manubrium|bone-xiphi|xiphoid/, 'chest wall'], [/bone-t\d/, 'back of the chest'], [/bone-l\d/, 'loin'], [/bone-c\d/, 'neck'],
  [/bone-s\d/, 'sacrum'], [/bone-ca\d/, 'base of the tail'], [/tail-vertebrae/, 'tail'], [/bone-mandible|bone-hyoid/, 'jaw and throat'],
  [/bone-(nasal|premaxilla|maxilla|palatine|frontal|zygomatic|parietal|squamosal|interparietal|occipital|sphenoid|bulla)/, 'head'],
];

/** A plain name for a place, from the bone nearest to it. */
export function placeNameFromBone(boneId: string, boneName = ''): string {
  const id = boneId.replace(/^living:/, '');
  const found = PLACE_OF_BONE.find(([test]) => test.test(id));
  const side = /-r$/.test(id) || /^Right /.test(boneName) ? 'Right ' : /-l$/.test(id) || /^Left /.test(boneName) ? 'Left ' : '';
  const name = found?.[1] ?? 'body';
  return side ? side + name : name[0].toUpperCase() + name.slice(1);
}

const PLACE_OF_SURFACE: Readonly<Record<string, string>> = Object.freeze({ forepaws: 'Fore paw', hindpaws: 'Hind paw', tail: 'Tail', pinnae: 'Ear', nose: 'Nose', lips: 'Mouth', eyes: 'Eye', corneas: 'Eye', eyelids: 'Eye' });

/** A plain name for a place on a part of the outside that is its own structure, or null for the skin of the body, where the bone nearest says more. */
export const placeNameOfSurface = (id: string): string | null => PLACE_OF_SURFACE[id.replace(/^living:/, '')] ?? null;

export const DISSECTION_NOTICE = 'A display of the model, not a dissection of an animal: the steps and folds are chosen for viewing. Each structure keeps its own evidence mark.';

export function dissectionAppliesTo(atlas: Pick<Atlas, 'id'>): boolean {
  return atlas.id === 'mousebio-living-v1';
}
