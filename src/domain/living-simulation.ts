import type { Structure } from './types';

/**
 * The living mouse in motion. This is an illustration on top of a static anatomical model: it computes nothing about blood, gas,
 * nerve signals or mechanics. The rates of the heart, breathing and whisking follow published values, named here, and everything else
 * is a choice made for viewing and is listed as such. All of it stays out of the anatomical reference.
 */
export interface LifeSource { readonly citation: string; readonly doi: string; readonly statement: string }

export const LIFE_SOURCES = Object.freeze({
  heart: { citation: 'Ho et al. 2011, Curr Protoc Mouse Biol 1:123-139', doi: '10.1002/9780470942390.mo100159', statement: 'Conscious mice: 500 to 700 beats per minute.' },
  breathing: { citation: 'Wesson et al. 2008, Chem Senses 33:581-596', doi: '10.1093/chemse/bjn029', statement: 'Resting breathing near 3 to 5 Hz, and sniffing up to about 12 Hz.' },
  whisking: { citation: 'Mitchinson et al. 2011, Philos Trans R Soc B 366:3037-3048', doi: '10.1098/rstb.2011.0156', statement: 'Mouse whisking: a fundamental of 11.3 Hz on average, with a strong second harmonic near 22 Hz.' },
  independence: { citation: 'Cao et al. 2012, J Neurosci 32:1653-1659', doi: '10.1523/JNEUROSCI.4395-11.2012', statement: 'High-frequency whisking and sniffing in mice are not correlated, so they are not tied together here.' },
  vesselWaves: { citation: 'Hartley et al. 2011, Am J Physiol Heart Circ Physiol 301:H269-H278', doi: '10.1152/ajpheart.00320.2011', statement: 'Arterial waveforms and wall motion can be measured in mice. No value is taken from this paper here.' },
  slowWaves: { citation: 'Parsons and Huizinga 2018, Exp Physiol 103:1087-1100', doi: '10.1113/EP086871', statement: 'Waves of contraction travel along the mouse small intestine. No rate is taken from this paper here.' },
} satisfies Record<string, LifeSource>);

/** The rates, in cycles per second of the animal's own time. */
export const LIFE_RATES = Object.freeze({
  /** 600 beats per minute, the middle of the published range. */
  heart: 10,
  /** The middle of the published resting range. */
  breathing: 4,
  /** Within the published range, during a bout of sniffing. */
  sniffing: 10,
  whisking: 11.3,
  /** A display choice: no rate was taken from a source. */
  gut: 0.6,
});

/** What is not from any source, in plain words, for the panel and the documents. */
export const LIFE_DISPLAY_CHOICES: readonly string[] = Object.freeze([
  'The speed of the blood, lymph and nerve tokens, and how far each kind of token moves with the heart beat. These tokens are far larger than cells and far slower than real flow or nerve impulses.',
  'How far the chest, abdomen, heart, arteries and gut move. All of these are enlarged so that they can be seen.',
  'The delay of the pulse along the arteries, and the rate and pattern of the gut waves.',
  'The timing of bouts of sniffing and whisking, and the movements of the head, tail and ears.',
  'How the mouse answers the pointer and a touch, and its walk: where it goes, its pace and its turns, its stride, and the swing of each leg from its hip or shoulder with one bend. Its feet are made not to slide on the floor. That is not a measured gait.',
  'The pitch contour, length and loudness of its voice when touched.',
]);

export const LIFE_NOTICE = 'Illustrative motion, not a simulation of physiology: nothing is computed about blood, gas or nerve signals. Heart, breathing and whisking rates follow published values, slowed to the chosen share. Everything else is chosen for viewing.';

export interface LifeSettings {
  readonly on: boolean;
  readonly playing: boolean;
  /** The share of real time shown. */
  readonly rate: number;
  readonly heart: boolean;
  readonly breathing: boolean;
  readonly blood: boolean;
  readonly nerves: boolean;
  readonly gut: boolean;
  /** Head, tail, ears and whiskers. */
  readonly movement: boolean;
  /** Walking about the floor, with the legs in diagonal pairs. It leaves the view and comes back from a corner. */
  readonly walking: boolean;
  /** Its voice when it is touched. */
  readonly sound: boolean;
}

export const LIFE_RATE_CHOICES: readonly number[] = Object.freeze([0.02, 0.05, 0.1, 0.25, 0.5, 1]);

export const DEFAULT_LIFE: LifeSettings = Object.freeze({ on: true, playing: true, rate: 0.1, heart: true, breathing: true, blood: true, nerves: true, gut: true, movement: true, walking: false, sound: true });

/** Motion is left off for someone who has asked their system for less of it. */
export const startingLife = (reducedMotion: boolean): LifeSettings => reducedMotion ? { ...DEFAULT_LIFE, on: false } : DEFAULT_LIFE;

export function rateLabel(rate: number): string {
  if (rate >= 1) return 'real rate';
  return `1/${Math.round(1 / rate)} of real rate`;
}

/** Beats and breaths per minute as they are in the animal and as they are shown, for the label beside the view. */
export function lifeRatesText(settings: Pick<LifeSettings, 'rate'>): string {
  const beat = LIFE_RATES.heart * 60, breath = LIFE_RATES.breathing * 60;
  return `Heart ${beat}/min, breathing ${breath}/min; shown at ${rateLabel(settings.rate)}, as ${Math.round(beat * settings.rate)}/min and ${Math.round(breath * settings.rate)}/min`;
}

const between = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smooth = (edge0: number, edge1: number, value: number) => { const t = between((value - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
const fraction = (value: number) => value - Math.floor(value);
const bump = (start: number, peak: number, end: number, value: number) => value < peak ? smooth(start, peak, value) : 1 - smooth(peak, end, value);
const TAU = 2 * Math.PI;

/** Bouts repeat with a period, and last for a share of it. The amount rises and falls quickly at each end. */
const boutLevel = (seconds: number, period: number, length: number) => { const at = ((seconds % period) + period) % period; return smooth(0, length * 0.12, at) * (1 - smooth(length * 0.88, length, at)); };
/** Time spent in bouts so far, so that the phase of a rhythm stays continuous when its rate changes. */
const boutTime = (seconds: number, period: number, length: number) => Math.floor(seconds / period) * length + Math.min(((seconds % period) + period) % period, length);

export const SNIFF_BOUT = Object.freeze({ period: 9, length: 1.4 });
export const WHISK_BOUT = Object.freeze({ period: 7, length: 1.7 });

export interface LifeState {
  /** Position in the heart cycle, from 0 to 1. */
  readonly heartPhase: number;
  /** Cycles of the heart so far. */
  readonly beats: number;
  /** Contraction of the atria and of the ventricles, from 0 to 1. */
  readonly atria: number;
  readonly ventricles: number;
  /** How far the chest and abdomen are expanded, from 0 to 1. */
  readonly breath: number;
  readonly sniffing: number;
  /** Angle of the whiskers from their mean, in radians. */
  readonly whisk: number;
  readonly gutPhase: number;
  readonly headYaw: number;
  readonly headNod: number;
  readonly tailPhase: number;
  readonly earFlick: number;
}

/** The state of the animal at a moment. Rhythms follow the animal's own seconds; head, tail and ears follow the seconds shown, because they are not rates from a source. */
export function lifeAt(animalSeconds: number, shownSeconds: number, settings: Pick<LifeSettings, 'heart' | 'breathing' | 'gut' | 'movement'>): LifeState {
  const beats = LIFE_RATES.heart * animalSeconds;
  const heartPhase = fraction(beats);
  const sniffing = boutLevel(animalSeconds, SNIFF_BOUT.period, SNIFF_BOUT.length);
  const breaths = LIFE_RATES.breathing * animalSeconds + (LIFE_RATES.sniffing - LIFE_RATES.breathing) * boutTime(animalSeconds, SNIFF_BOUT.period, SNIFF_BOUT.length);
  const breathPhase = fraction(breaths);
  const whiskLevel = boutLevel(animalSeconds, WHISK_BOUT.period, WHISK_BOUT.length);
  const whiskAngle = TAU * LIFE_RATES.whisking * animalSeconds;
  const flickAt = ((shownSeconds % 11) + 11) % 11;
  return {
    heartPhase: settings.heart ? heartPhase : 0,
    beats: settings.heart ? beats : 0,
    atria: settings.heart ? bump(0, 0.1, 0.22, heartPhase) : 0,
    ventricles: settings.heart ? bump(0.16, 0.34, 0.62, heartPhase) : 0,
    // Breathing in takes a little less time than breathing out, and sniffing is shallow.
    breath: settings.breathing ? bump(0, 0.42, 1, breathPhase) * (1 - 0.45 * sniffing) : 0,
    sniffing: settings.breathing ? sniffing : 0,
    whisk: settings.movement ? 0.24 * whiskLevel * (Math.sin(whiskAngle) + 0.4 * Math.sin(2 * whiskAngle + 0.7)) : 0,
    gutPhase: settings.gut ? TAU * LIFE_RATES.gut * animalSeconds : 0,
    headYaw: settings.movement ? 0.12 * (0.62 * Math.sin(TAU * shownSeconds / 11.3) + 0.38 * Math.sin(TAU * shownSeconds / 4.7 + 1.1)) : 0,
    headNod: settings.movement ? 0.05 * Math.sin(TAU * shownSeconds / 7.9 + 0.4) + 0.02 * Math.sin(TAU * shownSeconds / 3.1) : 0,
    tailPhase: settings.movement ? TAU * shownSeconds / 6.1 : 0,
    earFlick: settings.movement ? 0.2 * bump(0, 0.14, 0.5, flickAt) : 0,
  };
}

export interface WalkPose {
  /** Swing of the right fore, left fore, right hind and left hind legs, in radians. */
  readonly swing: readonly [number, number, number, number];
  /** How far each leg is lifted, in metres. */
  readonly lift: readonly [number, number, number, number];
  /** How far each leg bends at its middle joint, in radians. The elbow and the knee bend opposite ways. */
  readonly bend: readonly [number, number, number, number];
  /** How far the body rises, in metres. */
  readonly bob: number;
  /** How far the middle of the trunk moves to one side, in metres. */
  readonly sway: number;
}

/** Chosen for viewing: the rate and the size of the steps are not a measured gait. */
export const WALK_GAIT = Object.freeze({
  /** Strides per second at the walking pace. */
  rate: 1.7,
  /** How far a foot goes along the body while it is on the ground, in metres. */
  sweep: 0.012,
  /** The share of a stride for which a foot is on the ground. */
  stance: 0.62,
  /** How far a foot is lifted while it comes forward, in metres. */
  lift: 0.0012,
});

/** How fast the body goes at the walking pace, in metres per second. A foot on the ground goes back at this speed, so that it does not slide on the floor. */
export const WALK_SPEED = WALK_GAIT.sweep * WALK_GAIT.rate / WALK_GAIT.stance;

/** How far under the top of each leg its foot lies, in metres: right fore, left fore, right hind, left hind. It turns a distance along the body into a swing of the leg. */
export type LegDrops = readonly [number, number, number, number];
export const USUAL_LEG_DROPS: LegDrops = Object.freeze([0.016, 0.016, 0.022, 0.022]) as unknown as LegDrops;

/**
 * The legs after a number of strides, with diagonal legs together. `amount` shrinks the steps towards standing, and the body then goes that much slower, so the feet do not slide while it starts or stops.
 * A swing above zero has the foot towards the tail: a foot on the ground moves that way evenly as the body passes over it, and comes forward through the air with its leg bent.
 */
export function walkAt(strides: number, amount: number, drops: LegDrops = USUAL_LEG_DROPS): WalkPose {
  const leg = (phase: number, drop: number, bend: number) => {
    const at = strides + phase - Math.floor(strides + phase);
    const { stance, sweep, lift } = WALK_GAIT;
    if (at < stance) return { swing: amount * sweep * (at / stance - 0.5) / drop, lift: 0, bend: 0 };
    const air = (at - stance) / (1 - stance), eased = air * air * (3 - 2 * air), arc = Math.sin(Math.PI * air);
    return { swing: amount * sweep * (0.5 - eased) / drop, lift: lift * amount * arc, bend: bend * amount * arc };
  };
  // The elbow and the knee bend opposite ways.
  const rightFore = leg(0, drops[0], -0.55), leftFore = leg(0.5, drops[1], -0.55), rightHind = leg(0.5, drops[2], 0.65), leftHind = leg(0, drops[3], 0.65);
  return {
    swing: [rightFore.swing, leftFore.swing, rightHind.swing, leftHind.swing],
    lift: [rightFore.lift, leftFore.lift, rightHind.lift, leftHind.lift],
    bend: [rightFore.bend, leftFore.bend, rightHind.bend, leftHind.bend],
    bob: 0.00028 * amount * Math.sin(2 * TAU * strides),
    // The trunk curves a little to each side in time with the stride, and the head follows.
    sway: 0.0009 * amount * Math.sin(TAU * strides),
  };
}

/**
 * The turn of the head that looks towards a point, from where that point lies from the head along its forward, side and upward directions. A positive
 * yaw turns the nose towards the side direction, and a positive nod lowers it. Both are limited to what a neck might do.
 */
export function lookAngles(forward: number, side: number, up: number): { yaw: number; nod: number } {
  const yaw = between(Math.atan2(side, Math.max(forward, 1e-6)), -0.6, 0.6);
  const nod = between(-Math.atan2(up, Math.hypot(forward, side)), -0.3, 0.3);
  return { yaw, nod };
}

export type LifeMotion = 'none' | 'atrium' | 'ventricle' | 'lung' | 'artery' | 'gut' | 'whisker' | 'ear' | 'tail';

export interface LifeBehaviour {
  readonly motion: LifeMotion;
  /** Pushed along the body by the diaphragm when breathing in. */
  readonly axial: boolean;
}

const VENTRICLE = new Set(['heart-lv', 'heart-rv', 'left-heart-spaces', 'right-heart-spaces', 'heart-valves', 'coronary-arteries']);
const ATRIUM = new Set(['heart-la', 'heart-ra']);
const LUNG = new Set(['lung-left', 'lung-r-superior', 'lung-r-middle', 'lung-r-inferior', 'lung-r-postcaval', 'airways', 'bronchi', 'pleura', 'pulmonary-arteries', 'pulmonary-veins']);
const GUT = new Set(['small-intestine', 'caecum', 'colon', 'stomach-cardiac', 'stomach-pyloric', 'stomach-lumen', 'limiting-ridge']);
const TAIL = new Set(['tail', 'tail-vertebrae', 'tail-vessels', 'tail-lateral-veins']);
const PUSHED = new Set(['diaphragm', 'liver-median', 'liver-left', 'liver-right', 'liver-caudate', 'gall-bladder', 'bile-ducts', 'hepatic-arteries', 'portal-branches', 'hepatic-veins', 'stomach-cardiac', 'stomach-pyloric', 'stomach-lumen', 'limiting-ridge', 'spleen', 'pancreas', 'pancreatic-ducts', 'small-intestine', 'caecum', 'mesenteric-arteries', 'mesenteric-veins', ...LUNG]);

/** How a structure takes part in the motion, beyond moving with the body it lies in. */
export function lifeBehaviourOf(structure: Pick<Structure, 'id' | 'systems'>): LifeBehaviour {
  const id = structure.id.replace(/^living:/, '');
  const axial = PUSHED.has(id);
  if (VENTRICLE.has(id)) return { motion: 'ventricle', axial };
  if (ATRIUM.has(id)) return { motion: 'atrium', axial };
  if (LUNG.has(id)) return { motion: 'lung', axial };
  if (GUT.has(id)) return { motion: 'gut', axial };
  if (TAIL.has(id)) return { motion: 'tail', axial };
  if (id === 'vibrissae') return { motion: 'whisker', axial };
  if (id === 'pinnae') return { motion: 'ear', axial };
  if (flowKindOf(structure)?.kind === 'artery') return { motion: 'artery', axial };
  return { motion: 'none', axial };
}

export type FlowTokenKind = 'artery' | 'vein' | 'lymph' | 'nerve';

export interface FlowKind {
  readonly kind: FlowTokenKind;
  /** Whether the blood here has been through the lungs. Only a colour for reading the view. */
  readonly oxygenated: boolean;
  /** Whether what moves goes away from the heart, or from the root of the line. */
  readonly away: boolean;
}

const VEINOUS = /vein|vena|azygos|venous/;

/** What moves along the lines of a structure, if anything does. A line of the tail vessels is the artery or the vein by its order. */
export function flowKindOf(structure: Pick<Structure, 'id' | 'systems'>, lineIndex = 0): FlowKind | null {
  const id = structure.id.replace(/^living:/, '');
  if (id === 'veins') return null;
  if (id === 'lymph-vessels' || id === 'meningeal-lymphatics') return { kind: 'lymph', oxygenated: false, away: false };
  if (id === 'tail-vessels') return lineIndex % 2 === 0 ? { kind: 'artery', oxygenated: true, away: true } : { kind: 'vein', oxygenated: false, away: false };
  // The lungs reverse the colours: the arteries carry blood to them, and the veins bring it back.
  if (id === 'pulmonary-arteries') return { kind: 'artery', oxygenated: false, away: true };
  if (id === 'pulmonary-veins') return { kind: 'vein', oxygenated: true, away: false };
  // The portal branches carry blood from the gut out through the liver, from their root.
  if (id === 'portal-branches') return { kind: 'vein', oxygenated: false, away: true };
  if (structure.systems.includes('arterial-venous')) return VEINOUS.test(id) ? { kind: 'vein', oxygenated: false, away: false } : { kind: 'artery', oxygenated: true, away: true };
  if (structure.systems.includes('nervous') && /nerve|plexus|cord|trunks|roots/.test(id)) return { kind: 'nerve', oxygenated: false, away: true };
  return null;
}

/** A sentence for the details of a structure, saying what it does in the motion and that this is an illustration. */
export function lifeDescription(structure: Pick<Structure, 'id' | 'systems'>): string | null {
  const { motion } = lifeBehaviourOf(structure), flow = flowKindOf(structure);
  const parts: string[] = [];
  if (motion === 'ventricle') parts.push('Contracts after the atria, on the slowed heart clock');
  if (motion === 'atrium') parts.push('Contracts just before the ventricles, on the slowed heart clock');
  if (motion === 'lung') parts.push('Expands when breathing in');
  if (motion === 'gut') parts.push('Moved by slow waves, at a rate chosen for viewing');
  if (motion === 'artery') parts.push('Its wall bulges with a pulse travelling away from the heart');
  if (motion === 'whisker') parts.push('Sweeps in bouts at the published whisking rate, slowed');
  if (motion === 'ear') parts.push('Flicks now and then, as a choice for viewing');
  if (motion === 'tail') parts.push('Sways slowly, as a choice for viewing');
  if (flow?.kind === 'artery' || flow?.kind === 'vein') parts.push('Tokens far larger and slower than red cells show the direction of blood');
  if (flow?.kind === 'lymph') parts.push('Tokens show the direction of lymph');
  if (flow?.kind === 'nerve') parts.push('Tokens far slower than real impulses show that signals travel along it');
  return parts.length ? `${parts.join('. ')}. Illustrative.` : null;
}
