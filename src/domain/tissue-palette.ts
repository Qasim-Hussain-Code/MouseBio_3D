import type { Structure, SystemId } from './types';

/**
 * Display colours for source regions. The tissue scheme approximates the gross
 * appearance of fresh mouse tissue so that organs read as organs; it is a
 * presentation convention keyed by source label words, not a measured colour of
 * any specimen. Colours declared by a source figure are kept in every scheme,
 * because they are part of that source's record. The source scheme shows the
 * colours written in each manifest.
 */
export type ColourScheme = 'tissue' | 'source';

/** Fallback by first system category when a manifest declares no colour. */
export const SYSTEM_COLOURS: Readonly<Record<SystemId, string>> = Object.freeze({
  skeletal: '#e9e2d2', muscular: '#9c4d47', nervous: '#d6b7b3', cardiovascular: '#a7343b', 'arterial-venous': '#b8343a',
  respiratory: '#d4877f', digestive: '#c98a73', urinary: '#8f3b3b', reproductive: '#d8c4c8', endocrine: '#e0b86d',
  lymphatic: '#7a4a66', immune: '#937f9d', integumentary: '#e3b5a4', sensory: '#cfd9de',
});

/** Ordered so that specific labels match before generic words such as "gland" or "muscle". */
const TISSUE_COLOURS: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/\badrenal\b/, '#e0b86d'],
  [/lachrymal|lacrimal|harderian/, '#d7b3a4'],
  [/\bskin\b|body envelope|residual tissue|inside skin|whole body/, '#e3b5a4'],
  [/\bskeleton\b|\bbone\b|\bskull\b|vertebra|\bfemur\b|\btibia\b|\bfibula\b|\bpelvis\b|fabella|\bpatella\b|\bfoot\b/, '#e9e2d2'],
  [/\bheart\b|ventric|atri/, '#a7343b'],
  [/\blung/, '#d4877f'],
  [/\bliver\b|hepatic/, '#7d3330'],
  [/\bkidney/, '#8f3b3b'],
  [/\bspleen\b/, '#5f2b45'],
  [/\bstomach\b/, '#d7a28b'],
  [/\bpancreas\b/, '#d9c08f'],
  [/\bbladder\b/, '#e3d8aa'],
  [/\btestis|\btestes|\bovar|\buter/, '#d8c4c8'],
  [/medulla/, '#cfb0ab'],
  [/cerebell/, '#d9bcb6'],
  [/olfactory/, '#e0c4bd'],
  [/striatum/, '#c9a7a3'],
  [/rest of the brain/, '#ccadaa'],
  [/\bbrain\b|cerebr|cortex|thalam|hippocamp|hypothalam|midbrain|pons|neural tube|spinal cord/, '#d6b7b3'],
  [/\beye\b|\blens\b|retina/, '#cfd9de'],
  [/tendon|ligament/, '#efe7d8'],
  [/intestine|colon|caecum|cecum|duodenum|jejunum|ileum|rectum|\bgut\b/, '#d8a58f'],
  [/aorta|arter/, '#b8343a'],
  [/\bvein\b|vena|venous/, '#4d5f9c'],
  [/\bnerve|ganglion|trigeminal/, '#e2d58a'],
  [/muscle|masseter/, '#9c4d47'],
  [/\bgland\b/, '#d7b3a4'],
]);

const HEX = /^#[0-9a-f]{6}$/i;

function declaredColour(structure: Structure): string | undefined {
  return typeof structure.color === 'string' && HEX.test(structure.color) ? structure.color : undefined;
}

/** Colour of a source figure, retained in every scheme. */
export function hasSourceDeclaredColour(structure: Structure): boolean {
  return Array.isArray((structure as { sourceDiffuseLinear?: unknown }).sourceDiffuseLinear) && declaredColour(structure) !== undefined;
}

/** The tissue colour for a region's words, or undefined when no label word is recognised. */
export function tissueColour(structure: Pick<Structure, 'name' | 'sourceLabel'>): string | undefined {
  const words = `${structure.name} ${String(structure.sourceLabel ?? '')}`.toLowerCase();
  return TISSUE_COLOURS.find(([pattern]) => pattern.test(words))?.[1];
}

/** The display colour of a region under a scheme. Quantitative overlays replace it separately. */
export function displayColour(structure: Structure, scheme: ColourScheme = 'tissue'): string {
  const fallback = declaredColour(structure) ?? SYSTEM_COLOURS[structure.systems[0] as SystemId] ?? '#9ba5a1';
  if (scheme === 'source' || hasSourceDeclaredColour(structure)) return fallback;
  return tissueColour(structure) ?? fallback;
}
