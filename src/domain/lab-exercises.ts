import type { DissectionTierId } from './dissection';
import { anyCut, cutAnyOf, cutThrough, drawnBack, inOrgan, midlineCut, midlineCuts, needles, ORGANS_TO_SPARE, seen, type LabFacts, type LabPose, type LabSource, type LabToolId } from './dissection-lab';

/**
 * Tutorials for practice on the model. Each follows the outline of a published procedure and says what it leaves out or changes. They teach finding one's way on this model and are not those procedures: they leave out everything that makes a procedure safe and valid,
 * and sizes given for another species or scale are changed to fit this mouse and are said to be changed.
 *
 * A step says what to do, why, and what can go wrong. It names the instrument, the view, and what to mark on the animal, and it holds what the hands do when they show the step, using the same controls as a person.
 */
export type LabLandmark = 'chest' | 'diaphragm' | 'loin' | 'sacrum';
/** A place on the animal: from a landmark, millimetres towards the tail along the body, millimetres to the side, towards the animal's left when positive, and millimetres above its underside, which it lies on if nothing is said. */
export type DemoPoint = readonly [LabLandmark, number, number, number?];
/** A place along a structure: a share of its length from the end nearer the head, on one side of the animal, towards its left when 1. */
export interface OnStructure { readonly of: string; readonly side: 1 | -1; readonly at: number; readonly aside?: number }
export type DemoPlace = DemoPoint | OnStructure;

export type LabViewName = 'belly' | 'close' | 'chest' | 'heart' | 'spleen' | 'kidney' | 'back' | 'left' | 'right' | 'left-close' | 'tail' | 'head' | 'left-thigh' | 'femoral' | 'shank';
export type FlapKind = 'skin' | 'wall' | 'chest' | 'skull';

export type DemoStep =
  | { readonly kind: 'wait'; readonly seconds: number }
  | { readonly kind: 'pose'; readonly pose: LabPose }
  | { readonly kind: 'view'; readonly view: LabViewName }
  /** Draw an instrument along a line, on the first of these layers that it finds. */
  | { readonly kind: 'stroke'; readonly tool: LabToolId; readonly tiers: readonly DissectionTierId[]; readonly points: readonly DemoPlace[]; readonly mmPerSecond: number }
  /** Take a cut edge with forceps and draw it back, on the animal's left when 1. */
  | { readonly kind: 'pull'; readonly flap: FlapKind; readonly side: 1 | -1; readonly open: number }
  /** Touch a place with an instrument: a ligature or a probe, or a needle held in until it has gone this far. */
  | { readonly kind: 'touch'; readonly tool: LabToolId; readonly ids: readonly string[]; readonly place: DemoPlace; readonly depthMm?: number }
  /** Take hold of something in view and move it, millimetres along the body and to the side. */
  | { readonly kind: 'move'; readonly ids: readonly string[]; readonly along: number; readonly side: number }
  /** Lift something out and put it in the dish. */
  | { readonly kind: 'take'; readonly id: string }
  /** Start the flow of a perfusion. */
  | { readonly kind: 'perfuse' }
  /** Lay a drape with an opening over the animal. */
  | { readonly kind: 'drape' };

/** What is marked on the animal for a step. */
export type LabGuide =
  /** A line to cut along. The coat is parted along it, unless the hair is what is to be worked on. */
  | { readonly kind: 'line'; readonly points: readonly DemoPlace[]; readonly keepCoat?: boolean }
  /** A place to go in at, whether the left hand lifts a fold of skin there first, at what angle to the surface the needle goes in, in degrees, along what it goes, how quickly, and what a steady hand stops in. */
  | { readonly kind: 'spot'; readonly place: DemoPlace; readonly radiusMm: number; readonly tent?: boolean; readonly degrees?: number; readonly along?: string; readonly mmPerSecond?: number; readonly stopsIn?: readonly string[]; readonly draws?: boolean }
  /** The structure to find, which glows when it can be seen. */
  | { readonly kind: 'find'; readonly ids: readonly string[] }
  /** The edge of a cut to take hold of. */
  | { readonly kind: 'edge'; readonly flap: FlapKind };

export interface LabStep {
  /** The short name of the step, in the list. */
  readonly text: string;
  /** What to do. */
  readonly how: string;
  /** Why it is done, and how to know the place. */
  readonly why?: string;
  /** What can go wrong. */
  readonly care?: string;
  /** What it looks like here when it has been done. It describes this model. */
  readonly see?: string;
  readonly tool?: LabToolId;
  readonly view?: LabViewName;
  readonly guide?: LabGuide;
  /** A button that does what the step asks, where no instrument does it. */
  readonly act?: { readonly label: string; readonly does: 'perfuse' | 'drape' };
  /** What the hands do to show the step. */
  readonly show: readonly DemoStep[];
  readonly done: (facts: LabFacts) => boolean;
  /** What has been done so far falls short: how, and what to do about it. */
  readonly advice?: (facts: LabFacts) => string | null;
}

export type LabGroup = 'Necropsy' | 'Surgery' | 'Blood sampling' | 'Injection';
export const LAB_GROUPS: readonly LabGroup[] = ['Necropsy', 'Surgery', 'Blood sampling', 'Injection'];

export interface LabExercise {
  readonly id: string;
  readonly name: string;
  readonly group: LabGroup;
  /** One or two sentences on what it is for and how it differs from the procedure it follows. */
  readonly about: string;
  readonly source: LabSource;
  /** Other published works that its steps follow. */
  readonly also?: readonly LabSource[];
  /** Where it begins. */
  readonly pose: LabPose;
  /** Whether the procedure it follows is done with the heart beating, under anaesthesia, or after death. */
  readonly alive: boolean;
  /** A hind leg that is drawn out and taped down from the start, for surgery on its inner side, towards the animal's left when 1. */
  readonly extendLeg?: 1 | -1;
  readonly steps: readonly LabStep[];
  /** What should not have been done, each with the words for it. */
  readonly avoid: readonly { readonly text: string; readonly broken: (facts: LabFacts) => boolean }[];
}

const PARKINSON: LabSource = { citation: 'Parkinson et al. 2011, J Vis Exp (54):2966', doi: '10.3791/2966' };
const NIIYAMA: LabSource = { citation: 'Niiyama et al. 2009, J Vis Exp (23):1035', doi: '10.3791/1035' };
const GAGE: LabSource = { citation: 'Gage et al. 2012, J Vis Exp (65):3564', doi: '10.3791/3564' };
const MACHHOLZ: LabSource = { citation: 'Machholz et al. 2012, J Vis Exp (67):2771', doi: '10.3791/2771' };
const CARLSON: LabSource = { citation: 'Carlson and Chakkalakal 2011, PLoS One 6(9):e24212', doi: '10.1371/journal.pone.0024212' };
const PRITCHETT: LabSource = { citation: 'Pritchett-Corning et al. 2011, J Vis Exp (47):2586', doi: '10.3791/2586' };
const PARASURAMAN: LabSource = { citation: 'Parasuraman et al. 2010, J Pharmacol Pharmacother 1(2):87-93', doi: '10.4103/0976-500X.72350' };

const wait = (seconds: number): DemoStep => ({ kind: 'wait', seconds });
const SKIN_ONLY: readonly DissectionTierId[] = ['skin'];
const WALL: readonly DissectionTierId[] = ['outer-muscle', 'inner-muscle', 'lining'];
/** From low on the belly to the chest, along the middle. */
const BELLY_LINE: readonly DemoPoint[] = [['sacrum', 3, 0], ['diaphragm', -6, 0]];
/** From the genital area to the base of the rib cage, the opening of the wall that Parkinson describes. */
const WALL_LINE: readonly DemoPoint[] = [['sacrum', -1, 0], ['diaphragm', -1, 0]];
/** The full length of the underside, short of the anus and at the chin. */
const WHOLE_LINE: readonly DemoPoint[] = [['sacrum', 5, 0], ['chest', -18, 0]];

/** What is wrong with a cut along the middle that is not yet enough. */
const adviceOnMidline = (tiers: readonly DissectionTierId[], least: number, most = 3.5) => (facts: LabFacts): string | null => {
  const cuts = facts.actions.filter((action) => action.kind === 'cut' && !!action.tier && tiers.includes(action.tier));
  if (!cuts.length) return null;
  const last = cuts[cuts.length - 1];
  if (last.side !== 'ventral') return 'That cut is not on the underside. Undo it, and turn the animal so that the line can be seen.';
  if ((last.asideMm ?? 0) > most) return `That cut went ${(last.asideMm ?? 0).toFixed(0)} mm from the middle. Undo it and follow the line. Steady hand keeps a stroke on the line.`;
  const made = midlineCuts(facts, tiers, most).reduce((sum, action) => sum + (action.lengthMm ?? 0), 0);
  return made < least ? `The cut is ${made.toFixed(0)} mm long so far, and about ${least} mm are wanted. Go on from where it ends.` : null;
};
/** What is left to draw back. */
const adviceOnDrawing = (kind: FlapKind, least: number) => (facts: LabFacts): string | null => {
  const pulls = facts.actions.filter((action) => action.kind === 'reflect' && action.flap?.kind === kind);
  if (!pulls.length) return null;
  const well = new Set(pulls.filter((action) => (action.flap?.open ?? 0) > 0.4).map((action) => action.flap?.side)).size;
  if (well === 0) return 'Not far enough yet. Press on the edge again and pull further.';
  return well < least ? 'One side is back. Now the other.' : null;
};
/** What a needle did that was not wanted, in the words of the record. */
const adviceOnNeedle = (say: (action: ReturnType<typeof needles>[number]) => string | null) => (facts: LabFacts): string | null => {
  const all = needles(facts);
  return all.length ? say(all[all.length - 1]) : null;
};

/** Whether a needle has passed the wall of the abdomen. */
const throughTheWall = (action: { readonly structures: readonly string[] }) => action.structures.some((id) => /abdominal-wall$|muscle-(obliques|rectus)$|peritoneum$/.test(id));

const LIE_ON_BACK = (procedure: string): LabStep => ({
  text: 'Lay the animal on its back',
  how: 'Choose On its back. The legs lie out to the sides, and the belly lies open to you with the head at the top of the view.',
  why: `${procedure} begins with the animal on its back, which is called dorsal recumbency.`,
  see: 'The legs lie out to the sides with the soles up, and the belly faces you.',
  view: 'belly',
  show: [{ kind: 'pose', pose: 'on-back' }, wait(1.4)],
  done: (facts) => facts.pose === 'on-back',
});

const OPEN_SKIN = (line: readonly DemoPoint[], least: number, how: string): LabStep => ({
  text: 'Cut the skin along the middle',
  how,
  why: 'The middle of the underside has no large vessels running across it, and a cut here opens evenly to both sides.',
  care: 'Lift the skin with the forceps in the left hand before you cut, so that only the skin is between the blades. Keep to the line: the card will say if the cut has strayed.',
  see: 'The edges draw a little apart as the blades pass, and curl. The wall of the body shows pink between them. A long cut can be made in several snips, each going on from the last.',
  tool: 'scissors', view: 'close',
  guide: { kind: 'line', points: line },
  show: [wait(0.7), { kind: 'stroke', tool: 'scissors', tiers: SKIN_ONLY, points: line, mmPerSecond: 9 }],
  done: (facts) => midlineCut(facts, ['skin'], least),
  advice: adviceOnMidline(['skin'], least),
});

const DRAW_BACK_SKIN: LabStep = {
  text: 'Draw the skin back on both sides',
  how: 'Take the forceps. Press on the cut edge of the skin and pull outwards, away from the cut. The skin rolls back over itself as you pull, with its fur underneath. Do this on each side.',
  why: 'This is called reflecting the skin. Its pale inner side faces you, and the wall of the abdomen lies bare under it.',
  care: 'In the animal the skin comes away from the wall along a loose layer. Here that layer is not modelled, and the skin simply lifts.',
  see: 'Each side folds over and lies out from the body, pale side up, with small vessels on it. The red muscle of the wall, with the white line down its middle, lies bare.',
  tool: 'forceps', view: 'close',
  guide: { kind: 'edge', flap: 'skin' },
  show: [{ kind: 'pull', flap: 'skin', side: 1, open: 0.95 }, { kind: 'pull', flap: 'skin', side: -1, open: 0.95 }],
  done: (facts) => drawnBack(facts, 'skin', 2),
  advice: adviceOnDrawing('skin', 2),
};

const OPEN_WALL: LabStep = {
  text: 'Open the wall of the abdomen',
  how: 'Take the scissors and cut along the middle again, this time through the muscle of the wall, from the genital area to the base of the rib cage.',
  why: 'At the middle the wall is thin: a tendon, the linea alba, and the peritoneum, with muscle beginning to each side (Carlson and Chakkalakal 2011, in the mouse). Scissors take them together.',
  care: 'The gut lies straight under the wall. Lift the wall as you cut, and keep the tips of the blades up. A cut into the gut is marked as damage.',
  see: 'A narrow opening, with the coils of the gut and the edge of the liver behind it.',
  tool: 'scissors', view: 'close',
  guide: { kind: 'line', points: WALL_LINE },
  show: [{ kind: 'stroke', tool: 'scissors', tiers: WALL, points: WALL_LINE, mmPerSecond: 7 }],
  done: (facts) => midlineCut(facts, WALL, 10, 5),
  advice: adviceOnMidline(WALL, 10, 5),
};

const DRAW_BACK_WALL: LabStep = {
  text: 'Draw the wall back on both sides',
  how: 'Take the forceps again, press on the cut edge of the muscle, and pull each side outwards.',
  why: 'The abdominal organs now lie open, each in its usual place.',
  see: 'The wall folds back inside the skin, its shining inner side up. The liver lies at the top, the coils of the gut fill the middle, and the caecum lies low on one side.',
  tool: 'forceps', view: 'close',
  guide: { kind: 'edge', flap: 'wall' },
  show: [{ kind: 'pull', flap: 'wall', side: 1, open: 0.95 }, { kind: 'pull', flap: 'wall', side: -1, open: 0.95 }],
  done: (facts) => drawnBack(facts, 'wall', 2),
  advice: adviceOnDrawing('wall', 2),
};

const OPEN_BELLY: readonly LabStep[] = [
  OPEN_SKIN(BELLY_LINE, 20, 'Take the scissors. Press where the line begins, low on the belly, and draw along the line to the chest. Let go at the end of the line.'),
  DRAW_BACK_SKIN, OPEN_WALL, DRAW_BACK_WALL,
];

/** Cuts in the rib cage: up each side, then the front is lifted. Parkinson makes a third cut across at the top of the sternum. */
const RIB_CUTS: readonly DemoPoint[][] = [[['diaphragm', 1.5, 5], ['chest', 1, 5]], [['diaphragm', 1.5, -5], ['chest', 1, -5]]];
const CUT_RIBS: LabStep = {
  text: 'Cut up each side of the rib cage',
  how: 'Take the bone cutters. Draw one cut up the rib cage on one side of the breastbone and one on the other, along the lines, from the bottom of the ribs to the top.',
  why: 'The ribs are hard, and these blades are made for them. The cuts free the front of the rib cage.',
  care: 'The lungs and heart lie just under the ribs. Keep the lower blade close under the bone. A cut lung is marked as damage.',
  see: 'A narrow gap along each line. The piece between them is now loose.',
  tool: 'bone-cutter', view: 'chest',
  guide: { kind: 'line', points: RIB_CUTS[0] },
  show: RIB_CUTS.map((points) => ({ kind: 'stroke', tool: 'bone-cutter', tiers: ['skeleton', 'outer-muscle', 'inner-muscle', 'lining'], points, mmPerSecond: 8 }) as const),
  done: (facts) => facts.actions.filter((action) => action.kind === 'bone').length >= 2,
  advice: (facts) => facts.actions.filter((action) => action.kind === 'bone').length === 1 ? 'One side is cut. Now the other side of the breastbone.' : null,
};
const LIFT_CHEST: LabStep = {
  text: 'Lift the front of the rib cage',
  how: 'Take the forceps, press on the free lower end of the breastbone, and pull it up towards the head. It folds back like a lid.',
  why: 'The chest now lies open, with the heart in the middle between the lungs, and the thymus above the heart.',
  see: 'The front of the rib cage turns up and over like a lid, in one piece. In the anaesthetised setting the heart is beating.',
  tool: 'forceps', view: 'chest',
  guide: { kind: 'edge', flap: 'chest' },
  show: [{ kind: 'pull', flap: 'chest', side: 1, open: 1 }],
  done: (facts) => drawnBack(facts, 'chest', 1),
};

/** The way into the chest from below the ribs, after Gage et al. */
const CHEST_OPENING: readonly LabStep[] = [
  {
    text: 'Cut across, just below the ribs',
    how: 'Take the scissors, and cut along the line across the belly, just below the rib cage, through the skin.',
    why: 'A cut here reaches the diaphragm from below, and leaves the ribs whole for now.',
    care: 'Cut only the skin here. Lift it with the forceps in the left hand, so that the wall under it stays whole.',
    see: 'The edges of the skin draw apart across the body, with the red wall under them.',
    tool: 'scissors', view: 'chest',
    guide: { kind: 'line', points: [['diaphragm', 2, 9], ['diaphragm', 2, -9]] },
    show: [wait(0.7), { kind: 'stroke', tool: 'scissors', tiers: SKIN_ONLY, points: [['diaphragm', 2, 9], ['diaphragm', 2, -9]], mmPerSecond: 8 }],
    done: (facts) => anyCut(facts, ['skin']),
  },
  {
    text: 'Draw the skin up over the chest',
    how: 'Take the forceps, press on the upper edge of the cut, and pull it towards the head.',
    why: 'This lays the rib cage bare.',
    see: 'The upper edge folds up towards the neck with its pale side up. The front of the rib cage lies under it, with the wall of the abdomen below.',
    tool: 'forceps', view: 'chest',
    guide: { kind: 'edge', flap: 'skin' },
    show: [{ kind: 'pull', flap: 'skin', side: 1, open: 1 }],
    done: (facts) => drawnBack(facts, 'skin', 1),
  },
  {
    text: 'Cut through the wall below the ribs',
    how: 'Take the scissors and cut across again, along the same line, through the muscle. Then separate the liver from the diaphragm.',
    why: 'The published method cuts the skin and abdominal wall together, in one incision just below the rib cage.',
    care: 'Once the diaphragm has been breached, the method says to work quickly, because lack of oxygen soon changes the tissues.',
    see: 'A narrow gap across the body, with the dark red liver behind it.',
    tool: 'scissors', view: 'chest',
    guide: { kind: 'line', points: [['diaphragm', 3, 7], ['diaphragm', 3, -7]] },
    show: [{ kind: 'stroke', tool: 'scissors', tiers: WALL, points: [['diaphragm', 3, 7], ['diaphragm', 3, -7]], mmPerSecond: 7 }],
    done: (facts) => anyCut(facts, WALL),
  },
  CUT_RIBS, LIFT_CHEST,
];
/** Places on the heart and on the veins of the tail. */
const VENTRICLE: OnStructure = { of: 'living:heart-lv', side: 1, at: 0.8 };
const VENTRICLE_CUT: readonly OnStructure[] = [{ of: 'living:heart-lv', side: 1, at: 0.68 }, { of: 'living:heart-lv', side: 1, at: 0.9 }];
const ATRIUM: OnStructure = { of: 'living:heart-ra', side: 1, at: 0.5 };
const ATRIUM_CUT: readonly OnStructure[] = [{ of: 'living:heart-ra', side: 1, at: 0.3 }, { of: 'living:heart-ra', side: 1, at: 0.52 }];
const TAIL_VEIN: OnStructure = { of: 'living:tail-lateral-veins', side: 1, at: 0.72 };
/** On the lateral saphenous vein of the left hind leg, low on the shank, and the stretch of it that is clipped. */
const SAPHENOUS: OnStructure = { of: 'living:lateral-saphenous-veins', side: 1, at: 0.74 };
const SAPHENOUS_LINE: readonly OnStructure[] = [{ of: 'living:lateral-saphenous-veins', side: 1, at: 0.96 }, { of: 'living:lateral-saphenous-veins', side: 1, at: 0.5 }];

const seenAny = (facts: LabFacts, ids: readonly string[]) => ids.some((id) => seen(facts, id));
const FIND = (text: string, how: string, why: string, ids: readonly string[], least = 1, view: LabViewName = 'close'): LabStep => ({
  text, how, why, tool: 'probe', view,
  guide: { kind: 'find', ids: ids.map((id) => 'living:' + id) },
  show: [wait(2.2)],
  done: (facts) => ids.filter((id) => seen(facts, id)).length >= least,
});

/** A cut of about a centimetre over the femoral vessels, from towards the knee to the groin, on the animal's left. */
const THIGH_LINE: readonly OnStructure[] = [{ of: 'living:femoral-arteries', side: 1, at: -0.35 }, { of: 'living:femoral-arteries', side: 1, at: 0.8 }];

/** On the skin over the muscle at the front of the thigh, on the animal's left. */
const THIGH_FRONT: DemoPoint = ['sacrum', -2.5, 13.6, 4.3];
/** Over the flank, on the animal's left, about half way up its side. */
const FLANK: DemoPoint = ['diaphragm', 10, 13, 9];

/** Something in the chest counts as found only when the chest has been opened: it can show between the ribs before that. */
const INSIDE_THE_CHEST = (step: LabStep): LabStep => ({ ...step, done: (facts) => drawnBack(facts, 'chest', 1) && step.done(facts) });

/** The cut of Carlson and Chakkalakal: about two centimetres down the middle from just below the end of the breastbone. */
const INCISION: readonly DemoPoint[] = [['diaphragm', 3, 0], ['diaphragm', 23, 0]];
/** Passes of the clippers along the belly, over the line of the cut and to each side of it. */
const CLIP_LINES: readonly (readonly DemoPoint[])[] = [-6, 0, 6].map((side): readonly DemoPoint[] => [['diaphragm', -1, side], ['diaphragm', 27, side]]);
/** A swab going round and outwards from where the cut will be. */
const SCRUB_SPIRAL: readonly DemoPoint[] = Array.from({ length: 34 }, (_, index): DemoPoint => { const share = index / 33, angle = share * 5 * Math.PI, reach = 1 + 8 * share; return ['diaphragm', 13 + reach * Math.cos(angle), reach * Math.sin(angle)]; });

const COLLECT_NOTE = 'In the laboratory it would then be trimmed of fat, rinsed in normal saline, never in water, and placed in 10 percent neutral buffered formalin, at about twenty times its own volume.';

export const LAB_EXERCISES: readonly LabExercise[] = Object.freeze([
  {
    id: 'open-abdomen', name: 'Open the abdomen', group: 'Necropsy', source: PARKINSON, pose: 'on-back', alive: false,
    about: 'The opening of a basic necropsy of a euthanized mouse. The published opening runs the skin cut from the anus to the chin; here it goes only as far as the chest.',
    steps: [
      LIE_ON_BACK('A basic necropsy'),
      ...OPEN_BELLY,
      FIND('See the liver and intestine', 'Point at what lies in the opening with the blunt probe, and its name appears. Turn on Names to see them all.', 'The liver lies highest, under the diaphragm. The stomach lies on the animal\'s left, the coils of the intestine fill the middle, and the large comma-shaped caecum lies low on the left.', ['small-intestine', 'liver-median'], 2),
    ],
    avoid: [{ text: 'An organ was cut', broken: (facts) => cutAnyOf(facts, ORGANS_TO_SPARE) }],
  },
  {
    id: 'gross-organs', name: 'Find the organs of a necropsy', group: 'Necropsy', source: PARKINSON, pose: 'on-back', alive: false,
    about: 'The basic gross examination: identifying the heart, liver, lungs, kidneys and spleen. The published method examines the outside of the animal first, and goes on to take the organs for histology.',
    steps: [
      LIE_ON_BACK('A basic necropsy'),
      OPEN_SKIN(WHOLE_LINE, 30, 'Take the scissors. Cut the skin the whole length of the underside along the line, from just short of the anus to the chin.'),
      DRAW_BACK_SKIN, OPEN_WALL, DRAW_BACK_WALL, CUT_RIBS, LIFT_CHEST,
      INSIDE_THE_CHEST(FIND('Find the heart', 'Look in the middle of the chest, between the lungs.', 'Parkinson identifies the heart and lungs in the chest first.', ['heart-lv', 'heart-rv'], 1, 'chest')),
      INSIDE_THE_CHEST(FIND('Find the lungs', 'They lie to each side of the heart. A mouse has one lobe on the left and four on the right.', 'Their lobes fill the chest around the heart.', ['lung-left', 'lung-r-superior', 'lung-r-middle', 'lung-r-inferior'], 1, 'chest')),
      FIND('Find the liver', 'It lies in the top of the abdomen, under the diaphragm.', 'It has several lobes, and is the largest organ here. In this male the bladder is also large, and lies low in the middle.', ['liver-median', 'liver-left', 'liver-right']),
      {
        ...FIND('Find a kidney', 'Move the intestine aside with the forceps, part the fat over the back wall with the blunt probe, and look to one side of the spine.', 'The kidneys lie behind the peritoneum, and the right lies a little nearer the head than the left.', ['kidney-right', 'kidney-left'], 1, 'kidney'),
        show: [{ kind: 'move', ids: ['living:small-intestine'], along: 0, side: 12 }, ...[0, 2.2, -2.2].map((aside): DemoStep => ({ kind: 'stroke', tool: 'probe', tiers: ['fat'], points: [{ of: 'living:kidney-right', side: 1, at: 0.15, aside }, { of: 'living:kidney-right', side: 1, at: 0.9, aside }], mmPerSecond: 6 })), wait(1.2)],
      },
      {
        ...FIND('Find the spleen', 'Move the intestine back across, and look over towards the animal\'s left, beside the stomach.', 'It is a long, narrow, dark red organ, curving along the outer side of the stomach.', ['spleen'], 1, 'spleen'),
        show: [{ kind: 'move', ids: ['living:small-intestine'], along: 0, side: -18 }, wait(2.2)],
      },
    ],
    avoid: [{ text: 'An organ was cut', broken: (facts) => cutAnyOf(facts, [...ORGANS_TO_SPARE, 'heart-lv', 'heart-rv', 'spleen', 'lung-left']) }],
  },
  {
    id: 'collect-spleen', name: 'Collect the spleen', group: 'Necropsy', source: PARKINSON, pose: 'on-back', alive: false,
    about: 'Taking one organ from the abdomen of a euthanized mouse, by way of the basic necropsy. The spleen goes in the dish, from where it can be followed under the microscope.',
    steps: [
      LIE_ON_BACK('A basic necropsy'),
      ...OPEN_BELLY,
      {
        text: 'Move the intestine aside',
        how: 'Take the forceps, press on the coils of the intestine, and move them towards the animal\'s right.',
        why: 'The spleen lies on the left, beside the stomach and behind the coils.',
        care: 'Handle the gut gently. In this model it moves as one piece, which it would not do in the animal.',
        tool: 'forceps', view: 'close',
        guide: { kind: 'find', ids: ['living:small-intestine'] },
        show: [{ kind: 'move', ids: ['living:small-intestine'], along: 0, side: -9 }],
        done: (facts) => facts.actions.some((action) => action.kind === 'move'),
      },
      FIND('Find the spleen', 'Look over towards the animal\'s left, beside the stomach.', 'It is a long, narrow, dark red organ, curving along the outer side of the stomach.', ['spleen'], 1, 'spleen'),
      {
        text: 'Lift the spleen out',
        how: 'Point at the spleen with the probe so that it is chosen, then press Lift out.',
        why: `Parkinson removes the organs with forceps and scissors. ${COLLECT_NOTE}`,
        care: 'Take it by the tissue that holds it, and do not cut into it.',
        tool: 'probe', view: 'spleen',
        guide: { kind: 'find', ids: ['living:spleen'] },
        show: [{ kind: 'take', id: 'living:spleen' }, wait(1.5)],
        done: (facts) => facts.removed.has('living:spleen'),
      },
    ],
    avoid: [{ text: 'An organ other than the spleen was cut', broken: (facts) => cutAnyOf(facts, ORGANS_TO_SPARE) }, { text: 'The spleen was cut before it was lifted out', broken: (facts) => cutThrough(facts, 'spleen') }],
  },
  {
    id: 'mesenteric-node', name: 'Collect the mesenteric lymph node', group: 'Necropsy', source: PARKINSON, pose: 'on-back', alive: false,
    about: 'A sample used to detect infectious agents, because enteric viruses persist longer in the node than they are shed in feces. The published method is aseptic, with sterilized instruments and sterile tubes, which is not modelled here.',
    steps: [
      LIE_ON_BACK('The collection'),
      OPEN_SKIN(BELLY_LINE, 20, 'Take the scissors, and cut from the genital area towards the base of the rib cage along the line.'),
      DRAW_BACK_SKIN, OPEN_WALL, DRAW_BACK_WALL,
      FIND('Find the caecum', 'Look low on the animal\'s left for the large comma-shaped part of the intestine.', 'The caecum is the landmark. The colon runs on from it, often with fecal pellets in it.', ['caecum']),
      {
        text: 'Move the intestine aside',
        how: 'Take the forceps, press on the coils of the small intestine, and move them aside to show what lies behind.',
        why: 'The node lies in the mesentery behind the coils. In this model it is covered by them.',
        tool: 'forceps', view: 'close',
        guide: { kind: 'find', ids: ['living:small-intestine'] },
        show: [{ kind: 'move', ids: ['living:small-intestine'], along: 0, side: 9 }],
        done: (facts) => facts.actions.some((action) => action.kind === 'move' && action.structures.some((id) => /small-intestine|caecum|colon/.test(id))),
      },
      FIND('Find the node', 'Look in the mesentery along the colon, beside the caecum, for a small lump.', 'Parkinson describes it as a yellow, ovoid or spherical small lump, often slightly thicker and firmer than the fat around it.', ['mesenteric-lymph-node']),
      {
        text: 'Lift the node out',
        how: 'Point at the node with the probe so that it is chosen, then press Lift out.',
        why: 'In the laboratory it goes straight into a labelled sterile tube.',
        tool: 'probe', view: 'close',
        guide: { kind: 'find', ids: ['living:mesenteric-lymph-node'] },
        show: [{ kind: 'take', id: 'living:mesenteric-lymph-node' }, wait(1.5)],
        done: (facts) => facts.removed.has('living:mesenteric-lymph-node'),
      },
    ],
    avoid: [{ text: 'The gut was cut', broken: (facts) => cutAnyOf(facts, ['small-intestine', 'caecum', 'colon']) }],
  },
  {
    id: 'femoral-ligation', name: 'Tie the femoral artery', group: 'Surgery', source: NIIYAMA, pose: 'on-back', alive: true, extendLeg: 1,
    about: 'The surgery of the mouse model of hindlimb ischemia, on an anaesthetised animal. The published method also covers anaesthesia, shaving, scrubbing, a dissecting microscope, cautery, and care and imaging after surgery, which are not modelled here.',
    steps: [
      {
        ...LIE_ON_BACK('The surgery'),
        how: 'The animal lies on its back, with its left hind leg drawn out to the side so that the inner side of the thigh faces you. The published method shaves the limb, scrubs the skin three times, extends the limb and tapes it down.',
        see: 'The left hind leg lies further out than the right, and the skin of the groin stretches across to it.',
      },
      {
        text: 'Cut the skin of the thigh',
        how: 'Take the scissors, and make a cut about 1 cm long along the line, from the knee towards the inner thigh.',
        why: 'The femoral vessels run under the skin of the inner thigh, with the nerve beside them.',
        care: 'Cut only the skin. The vessels lie close under it, in fat.',
        see: 'A cut of about a centimetre over the line of the vessels. The fur has been parted along it, and the edges draw a little apart.',
        tool: 'scissors', view: 'left-thigh',
        guide: { kind: 'line', points: THIGH_LINE },
        show: [wait(1), { kind: 'stroke', tool: 'scissors', tiers: SKIN_ONLY, points: THIGH_LINE, mmPerSecond: 5 }],
        done: (facts) => anyCut(facts, ['skin']),
      },
      {
        text: 'Open the wound',
        how: 'Take the forceps, press on each edge of the cut and pull it outwards. The published method holds the wound open with a small retractor, and brushes the fat away with a moistened swab.',
        why: 'The fat over the thigh muscle comes into view, and the vessels lie in it.',
        see: 'Each edge folds back with its pale side up. The red thigh muscles and the pale yellow fat lie in the wound.',
        tool: 'forceps', view: 'left-thigh',
        guide: { kind: 'edge', flap: 'skin' },
        show: [{ kind: 'pull', flap: 'skin', side: 1, open: 0.9 }, { kind: 'pull', flap: 'skin', side: -1, open: 0.9 }],
        done: (facts) => drawnBack(facts, 'skin', 1),
      },
      {
        ...FIND('Find the femoral artery', 'Draw the blunt probe through the fat along the line of the thigh, and the vessels come into view. Point at them to see their names. The artery runs beside the vein and nerve.', 'In the animal they lie together in a membranous sheath, which is pierced to reach them. The sheath is not modelled here.', ['femoral-arteries'], 1, 'femoral'),
        care: 'Go gently along the line of the vessels. A cut into the vein or nerve is marked as damage.',
        see: 'As the fat parts, the red artery and the blue vein come into view, side by side, with the vein on the inner side.',
        show: [{ kind: 'stroke', tool: 'probe', tiers: ['fat'], points: [{ of: 'living:femoral-arteries', side: 1, at: 0.3 }, { of: 'living:femoral-arteries', side: 1, at: 0.85 }], mmPerSecond: 4 }, wait(1.2)],
      },
      {
        text: 'Tie the artery near the groin',
        how: 'Take the ligature and touch the artery near the groin, as far towards the body as it can be reached.',
        why: 'The published method separates the artery from the vein and nerve, passes 7-0 silk under it and makes a double knot, as far up as possible. How far up it is tied decides how severe the ischemia is, so the level is kept the same in every animal.',
        care: 'Tie only the artery. The vein and nerve lie against it, and the vein tears easily.',
        see: 'A small loop of dark thread lies round the artery. What it does to the blood in the limb is not shown here.',
        tool: 'ligature', view: 'femoral',
        guide: { kind: 'spot', place: { of: 'living:femoral-arteries', side: 1, at: 0.6 }, radiusMm: 1.2 },
        show: [{ kind: 'touch', tool: 'ligature', ids: ['living:femoral-arteries'], place: { of: 'living:femoral-arteries', side: 1, at: 0.6 } }, wait(0.8)],
        done: (facts) => facts.ligated.has('living:femoral-arteries'),
      },
      {
        text: 'Close the skin',
        how: 'Take the needle and suture, and draw along the cut. The published method closes with 5-0 absorbable suture, keeps the animal on a heated pad, and watches it until it wakes.',
        why: 'The stitches hold the edges together while the wound heals.',
        see: 'Dark stitches cross the line of the cut as the needle passes, and the edges come back together.',
        tool: 'suture', view: 'left-thigh',
        guide: { kind: 'line', points: THIGH_LINE },
        show: [{ kind: 'stroke', tool: 'suture', tiers: SKIN_ONLY, points: THIGH_LINE, mmPerSecond: 4 }],
        done: (facts) => facts.actions.some((action) => action.kind === 'suture'),
      },
    ],
    avoid: [{ text: 'The femoral vein was cut', broken: (facts) => cutThrough(facts, 'femoral-veins') }, { text: 'The femoral nerve was cut', broken: (facts) => cutThrough(facts, 'femoral-nerves') }, { text: 'The femoral artery was cut before it was tied', broken: (facts) => cutThrough(facts, 'femoral-arteries') && !facts.ligated.has('living:femoral-arteries') }],
  },
  {
    id: 'open-chest', name: 'Open the chest to the heart', group: 'Surgery', source: GAGE, pose: 'on-back', alive: true,
    about: 'Exposing the heart for perfusion under deep anaesthesia. The published method is in the rat, with a 5 to 6 cm incision, and its sizes are made smaller here to fit this mouse. Its anaesthesia, the check of its depth, and the perfusion itself are not modelled.',
    steps: [
      {
        ...LIE_ON_BACK('The perfusion'),
        how: 'Choose On its back. The published method checks with a pinch of a toe that the animal does not respond before going on.',
      },
      ...CHEST_OPENING,
      INSIDE_THE_CHEST(FIND('See the heart', 'It lies in the middle of the opened chest, with the thymus above it.', 'The published method lifts the sternum away and clamps it over the head, and the thymus lifts with it, which gives a clear view of the great vessels. It then makes a small cut in the left ventricle, passes the perfusion needle up into the aorta short of its arch, and cuts the right atrium as an outlet.', ['heart-lv', 'heart-rv'], 1, 'chest')),
    ],
    avoid: [{ text: 'A lung was cut', broken: (facts) => cutAnyOf(facts, ['lung-left', 'lung-r-superior', 'lung-r-middle', 'lung-r-inferior', 'lung-r-postcaval']) }, { text: 'The heart was cut', broken: (facts) => cutAnyOf(facts, ['heart-lv', 'heart-rv', 'heart-la', 'heart-ra']) }],
  },
  {
    id: 'perfuse-heart', name: 'Perfuse through the heart', group: 'Surgery', source: GAGE, pose: 'on-back', alive: true,
    about: 'Washing the blood out through the heart, the first part of fixing the whole animal, under deep anaesthesia. The published method is in the rat, and its sizes are made smaller here to fit this mouse. Its anaesthesia, the check of its depth, the pressure of the flow and the fixative are not modelled, and the time is shortened to less than a minute.',
    steps: [
      {
        ...LIE_ON_BACK('The perfusion'),
        how: 'Choose On its back. The published method checks with a pinch of a toe that the animal does not respond before going on.',
      },
      ...CHEST_OPENING,
      {
        text: 'Cut into the left ventricle',
        how: 'Take the scalpel, and make a small cut low on the left ventricle, at the mark.',
        why: 'The method makes a small opening here for the perfusion needle. The left ventricle is on the animal\'s left, which is on your right when its head is up.',
        care: 'Keep the cut small, so that the needle fits it closely.',
        see: 'A small slit in the wall of the heart. In the anaesthetised setting it bleeds.',
        tool: 'scalpel', view: 'heart',
        guide: { kind: 'spot', place: VENTRICLE, radiusMm: 1 },
        show: [wait(0.8), { kind: 'stroke', tool: 'scalpel', tiers: ['organs'], points: VENTRICLE_CUT, mmPerSecond: 2 }],
        done: (facts) => cutThrough(facts, 'heart-lv'),
      },
      {
        text: 'Pass the needle up into the aorta',
        how: 'Take the syringe, press on the cut and hold. The needle goes up through the ventricle, towards the head. Let go when it is well in.',
        why: 'The published method passes a blunt perfusion needle through the cut ventricle into the ascending aorta, and clamps the heart round it so that it stays and nothing leaks.',
        care: 'The tip should be seen through the wall of the aorta and should not reach the arch of the aorta. The method calls the placing of the needle critical.',
        tool: 'syringe', view: 'heart',
        guide: { kind: 'spot', place: VENTRICLE, radiusMm: 1, degrees: 30, mmPerSecond: 2.5 },
        show: [{ kind: 'touch', tool: 'syringe', ids: ['living:heart-lv'], place: VENTRICLE, depthMm: 4 }, wait(0.4)],
        done: (facts) => needles(facts).some((action) => [...action.structures, ...(action.tipIn ?? [])].some((id) => /heart-lv|aorta/.test(id))),
        advice: adviceOnNeedle((action) => [...action.structures, ...(action.tipIn ?? [])].some((id) => /heart-lv|aorta/.test(id)) ? null : 'The needle missed the left ventricle. Go in at the mark.'),
      },
      {
        text: 'Cut the right atrium',
        how: 'Take the scissors, and snip the right atrium, at the mark.',
        why: 'The method makes as large an outlet as possible here, for what the needle pushes round the body to run out.',
        see: 'A small opening in the atrium. In the anaesthetised setting it bleeds.',
        tool: 'scissors', view: 'heart',
        guide: { kind: 'spot', place: ATRIUM, radiusMm: 1 },
        show: [{ kind: 'stroke', tool: 'scissors', tiers: ['organs'], points: ATRIUM_CUT, mmPerSecond: 2 }],
        done: (facts) => cutThrough(facts, 'heart-ra'),
      },
      {
        text: 'Start the flow',
        how: 'Press Start the flow. It stops the heart here, and the fluid takes the place of the blood.',
        why: 'In the rat, the method runs buffer at a steady pressure of 80 mm Hg and then fixative, with up to 200 ml of each. Those amounts are for the rat and are not modelled here.',
        act: { label: 'Start the flow', does: 'perfuse' },
        view: 'heart',
        show: [{ kind: 'perfuse' }, wait(0.6)],
        done: (facts) => facts.actions.some((action) => action.kind === 'perfuse'),
        advice: (facts) => !needles(facts).length ? 'First the needle goes into the left ventricle.' : !cutThrough(facts, 'heart-ra') ? 'First the right atrium is cut, as the way out.' : null,
      },
      {
        text: 'Watch the organs clear',
        how: 'Look at the liver, and at the nose, ears and paws. It takes a little under a minute here.',
        why: 'The published method calls the clearing of the liver an indicator of a good perfusion, and of the nose, ears and paws an initial indicator of its success. The fluid running from the atrium turns clear.',
        care: 'The method goes on to fixative, when fixation tremors should be seen within seconds and the animal stiffens. They are not modelled here.',
        see: 'The dark red of the liver pales to tan, the lungs turn white and the vessels empty.',
        tool: 'probe', view: 'chest',
        show: [wait(42)],
        done: (facts) => facts.actions.some((action) => action.kind === 'cleared'),
      },
    ],
    avoid: [{ text: 'A lung was cut', broken: (facts) => cutAnyOf(facts, ['lung-left', 'lung-r-superior', 'lung-r-middle', 'lung-r-inferior', 'lung-r-postcaval']) }, { text: 'The right ventricle was cut', broken: (facts) => cutThrough(facts, 'heart-rv') }],
  },
  {
    id: 'expose-brain', name: 'Expose the brain', group: 'Necropsy', source: PARKINSON, pose: 'standing', alive: false,
    about: 'Opening the skull of a euthanized mouse. The published method removes the head and cuts forwards from the foramen magnum with small scissors. Here the head stays on, and the skull is opened from above with the bone cutters.',
    steps: [
      {
        text: 'Lay the animal on its belly',
        how: 'Choose On its feet, and look at the head from above.',
        why: 'The published method lays the animal in ventral recumbency, on its belly, to reach the top of the skull.',
        see: 'The head lies in the middle of the view, with its nose towards the top. Here the animal stands on the board, and is not laid flat.',
        tool: 'hand', view: 'head',
        show: [{ kind: 'pose', pose: 'standing' }, wait(1.4)],
        done: (facts) => facts.pose === 'standing',
      },
      {
        text: 'Cut the skin over the skull',
        how: 'Take the scissors, and cut along the middle of the head, along the line, from behind the ears to between the eyes.',
        why: 'The method removes the skin and muscle over the top of the skull, which is called the calvaria.',
        care: 'Cut only the skin. The bone lies straight under it here, with very little between.',
        see: 'A cut between the ears, and the pale bone shows along it.',
        tool: 'scissors', view: 'head',
        guide: { kind: 'line', points: [{ of: 'living:bone-interparietal', side: 1, at: 0.9 }, { of: 'living:bone-frontal', side: 1, at: 0.05 }] },
        show: [{ kind: 'stroke', tool: 'scissors', tiers: SKIN_ONLY, points: [{ of: 'living:bone-interparietal', side: 1, at: 0.9 }, { of: 'living:bone-frontal', side: 1, at: 0.05 }], mmPerSecond: 6 }],
        done: (facts) => anyCut(facts, ['skin']),
      },
      {
        text: 'Draw the skin back',
        how: 'Take the forceps, and pull each edge outwards to show the bone.',
        why: 'The bone must lie bare well to each side of the middle, so that it can be folded out.',
        see: 'The skin folds back on each side, pale side up, and the top of the skull lies bare, with the lines where its plates meet.',
        tool: 'forceps', view: 'head',
        guide: { kind: 'edge', flap: 'skin' },
        show: [{ kind: 'pull', flap: 'skin', side: 1, open: 0.95 }, { kind: 'pull', flap: 'skin', side: -1, open: 0.95 }],
        done: (facts) => drawnBack(facts, 'skin', 1),
      },
      {
        text: 'Cut along the midline of the skull',
        how: 'Take the bone cutters and cut along the line, keeping the tips pointed upwards. Each half of the skull is then loose beside the cut.',
        why: 'The published method puts the lower blade of small scissors into the foramen magnum and cuts up through the midline of the calvaria, with the tips up, because the brain is soft and easily damaged.',
        care: 'The brain lies straight under the bone. A cut into it is marked as damage.',
        see: 'A narrow gap down the middle of the bone. The two sides are now loose.',
        tool: 'bone-cutter', view: 'head',
        guide: { kind: 'line', points: [{ of: 'living:bone-interparietal', side: 1, at: 0.6 }, { of: 'living:bone-frontal', side: 1, at: 0.3 }] },
        show: [{ kind: 'stroke', tool: 'bone-cutter', tiers: ['skeleton'], points: [{ of: 'living:bone-interparietal', side: 1, at: 0.6 }, { of: 'living:bone-frontal', side: 1, at: 0.3 }], mmPerSecond: 5 }],
        done: (facts) => facts.actions.some((action) => action.kind === 'bone'),
      },
      {
        text: 'Fold each half of the skull back',
        how: 'Take the forceps, press on the edge of the bone beside the cut, and pull it out to the side. Do this on each side.',
        why: 'The published method folds both halves of the calvaria back with forceps, and they come away like the leaves of a book.',
        care: 'Lift the bone clear before you draw it aside, so that its edge does not drag over the brain.',
        see: 'Each half of the top of the skull turns out to the side in one piece, and the brain lies bare between them.',
        tool: 'forceps', view: 'head',
        guide: { kind: 'edge', flap: 'skull' },
        show: [{ kind: 'pull', flap: 'skull', side: 1, open: 0.95 }, { kind: 'pull', flap: 'skull', side: -1, open: 0.95 }],
        done: (facts) => drawnBack(facts, 'skull', 2),
        advice: adviceOnDrawing('skull', 2),
      },
      FIND('See the brain', 'Point at it with the blunt probe, and its name appears.', 'From above, the two cerebral hemispheres lie in front, with the cerebellum behind them.', ['cerebrum'], 1, 'head'),
      {
        text: 'Lift the brain out',
        how: 'With the brain chosen, press Lift out. It comes away whole and goes to the dish.',
        why: 'In the laboratory the brain is lifted out from the olfactory lobes backwards, with curved forceps. It is soft and easily damaged.',
        care: 'The nerves and vessels that hold the brain in place are not modelled as cuts here, and it simply lifts away. In the animal they are freed as it comes up.',
        see: 'The brain lies in the dish with its parts together, and the floor of the skull lies empty.',
        tool: 'probe', view: 'head',
        guide: { kind: 'find', ids: ['living:cerebrum'] },
        show: [{ kind: 'take', id: 'living:cerebrum' }, wait(1.5)],
        done: (facts) => facts.removed.has('living:cerebrum'),
      },
    ],
    avoid: [{ text: 'The brain was cut', broken: (facts) => cutAnyOf(facts, ['cerebrum', 'cerebellum', 'striatum']) }],
  },
  {
    id: 'open-close-abdomen', name: 'Open and close the abdomen', group: 'Surgery', source: CARLSON, also: [PRITCHETT], pose: 'on-back', alive: true,
    about: 'A cut along the midline of the belly and its closure, as used to study healing in the mouse, under anaesthesia. The published method makes one cut through all the layers and closes them with one running suture. Here the skin and the wall are opened in two cuts, so that each can be seen. The needle, thread and loops are drawn and not modelled.',
    steps: [
      {
        ...LIE_ON_BACK('The operation'),
        how: 'Choose On its back. The published method anaesthetises the mouse with inhaled isoflurane first, which is not modelled here.',
      },
      {
        text: 'Clip the hair',
        how: 'Take the clippers and draw them along the belly, over the marked line and to each side of it, until the skin shows.',
        why: 'The published method clips the hair of the ventral abdomen and then removes the rest with a depilatory. A general guide to rodent surgery asks for an area about three times the size of the cut (Pritchett-Corning et al. 2011).',
        care: 'Go gently over the thin skin of the belly, and clear the loose hair away from the site.',
        see: 'The hair comes away. Within the clipped band the skin is bare, as the depilatory of the method leaves it, and at its edge the hair is cut short.',
        tool: 'clippers', view: 'close',
        guide: { kind: 'line', points: CLIP_LINES[1], keepCoat: true },
        show: [wait(0.5), ...CLIP_LINES.map((points): DemoStep => ({ kind: 'stroke', tool: 'clippers', tiers: SKIN_ONLY, points, mmPerSecond: 16 }))],
        done: (facts) => facts.actions.filter((action) => action.kind === 'clip').reduce((sum, action) => sum + (action.lengthMm ?? 0), 0) >= 18,
        advice: (facts) => facts.actions.some((action) => action.kind === 'clip') ? 'Go on along the line, until about two centimetres are clear.' : null,
      },
      {
        text: 'Scrub the skin',
        how: 'Take a swab. Begin in the middle of the clipped skin, where the cut will be, and work outwards in a spiral.',
        why: 'The guide describes a circular pattern, beginning in the centre and spiralling outward, so that what is cleaned from the middle is not brought back to it. The published method used a medicated soap here.',
        care: 'The guide also asks for the animal to be kept warm and for pain relief before the operation. These are not modelled here.',
        see: 'The swab goes round the clipped skin. Here it changes nothing that can be seen.',
        tool: 'swab', view: 'close',
        guide: { kind: 'spot', place: ['diaphragm', 13, 0], radiusMm: 2 },
        show: [{ kind: 'stroke', tool: 'swab', tiers: SKIN_ONLY, points: SCRUB_SPIRAL, mmPerSecond: 22 }],
        done: (facts) => facts.actions.some((action) => action.kind === 'scrub' && (action.lengthMm ?? 0) >= 8),
        advice: (facts) => facts.actions.some((action) => action.kind === 'scrub') ? 'Keep going round, a little further out each time.' : null,
      },
      {
        text: 'Lay a drape over the animal',
        how: 'Press Lay the drape. A sheet with an opening goes over the animal, and the clipped skin shows through the opening.',
        why: 'The guide recommends a standard waterproof disposable paper drape, laid over the animal so that only the site of the cut is left open.',
        care: 'Here the drape is a drawing and keeps nothing sterile. In the operating room it is handled only with sterile gloves.',
        see: 'A pale blue sheet covers the animal and falls to the board, with the clipped belly in its opening.',
        act: { label: 'Lay the drape', does: 'drape' },
        view: 'close',
        show: [{ kind: 'drape' }, wait(1)],
        done: (facts) => facts.actions.some((action) => action.kind === 'drape'),
      },
      OPEN_SKIN(INCISION, 17, 'Take the scissors. Press where the line begins, just below the end of the breastbone, and draw down along the line for about two centimetres.'),
      { ...DRAW_BACK_SKIN, how: 'Take the forceps. Press on the cut edge of the skin and draw it a little way outwards, within the opening of the drape. Do this on each side.', show: [{ kind: 'pull', flap: 'skin', side: 1, open: 0.62 }, { kind: 'pull', flap: 'skin', side: -1, open: 0.62 }] },
      {
        ...OPEN_WALL,
        how: 'Take the scissors and cut along the same line, through the wall, along its white middle line.',
        why: 'The published cut runs through the linea alba, from just below the xiphoid process downwards, and exposes the organs.',
        guide: { kind: 'line', points: INCISION },
        show: [{ kind: 'stroke', tool: 'scissors', tiers: WALL, points: INCISION, mmPerSecond: 7 }],
        done: (facts) => midlineCut(facts, WALL, 14, 5),
        advice: adviceOnMidline(WALL, 14, 5),
      },
      { ...DRAW_BACK_WALL, show: [{ kind: 'pull', flap: 'wall', side: 1, open: 0.62 }, { kind: 'pull', flap: 'wall', side: -1, open: 0.62 }] },
      FIND('See what lies under the wall', 'Point at what lies in the opening with the blunt probe, and its name appears.', 'The cut lies over the liver at its upper end and over the coils of the intestine below that. The published method closes the cut at once, without doing anything to the organs.', ['liver-median', 'liver-left', 'liver-right', 'small-intestine'], 1),
      {
        text: 'Close it with a running suture',
        how: 'Take the needle and suture, and draw along the cut from one end to the other. The edges come together as the needle passes, and each loop takes every layer, from the skin to the lining.',
        why: 'The published method closes at once with a running 7-0 polypropylene suture, under magnification of 3.5 times, taking all the layers of the wall. The loops lie 1 mm apart and take 1 mm of each edge, which makes about 20 loops in a cut of 2 cm.',
        care: 'In the animal the gut lies just under the needle. Lift each edge as the needle goes through, so that it takes no bowel.',
        see: 'A row of slanted blue loops crosses the line, with a knot at each end, and the edges lie together. The published method applied no dressing and used no antibiotics. The guide asks for the wound to be watched for signs of infection afterwards.',
        tool: 'suture', view: 'close',
        guide: { kind: 'line', points: INCISION },
        show: [{ kind: 'stroke', tool: 'suture', tiers: SKIN_ONLY, points: INCISION, mmPerSecond: 4.5 }, wait(1.2)],
        done: (facts) => facts.actions.filter((action) => action.kind === 'suture').reduce((sum, action) => sum + (action.lengthMm ?? 0), 0) >= 14,
        advice: (facts) => facts.actions.some((action) => action.kind === 'suture') ? 'Go on to the end of the cut, so that no part of it is left open.' : null,
      },
    ],
    avoid: [{ text: 'An organ was cut', broken: (facts) => cutAnyOf(facts, ORGANS_TO_SPARE) }],
  },
  {
    id: 'draw-saphenous-blood', name: 'Draw blood from the saphenous vein', group: 'Blood sampling', source: PARASURAMAN, pose: 'standing', alive: true,
    about: 'Taking a small sample of blood from the lateral saphenous vein of a hind leg, which the published account does with aseptic precautions and the leg held still. The animal stands on the board here, and how it is held, the pressure above the knee and the capillary tube are not modelled.',
    steps: [
      {
        text: 'Stand the animal and look at the hind leg',
        how: 'Choose On its feet. The view turns to the outer side of the left hind leg.',
        why: 'The lateral saphenous vein runs up the outer side of the shank, just under the skin.',
        tool: 'hand', view: 'shank',
        show: [{ kind: 'pose', pose: 'standing' }, wait(1.4)],
        done: (facts) => facts.pose === 'standing',
      },
      {
        text: 'Clip the hair over the vein',
        how: 'Take the clippers and draw them along the marked line, up the back of the shank.',
        why: 'The account shaves the back of the hind leg with an electric trimmer until the vein can be seen, and allows a hair removal cream instead.',
        see: 'The coat comes away along the shank, and the skin over the vein is bare.',
        tool: 'clippers', view: 'shank',
        guide: { kind: 'line', points: SAPHENOUS_LINE, keepCoat: true },
        show: [{ kind: 'stroke', tool: 'clippers', tiers: SKIN_ONLY, points: SAPHENOUS_LINE, mmPerSecond: 8 }],
        done: (facts) => facts.actions.filter((action) => action.kind === 'clip').reduce((sum, action) => sum + (action.lengthMm ?? 0), 0) >= 5,
        advice: (facts) => facts.actions.some((action) => action.kind === 'clip') ? 'Go on along the line, until the skin over the vein is bare.' : null,
      },
      {
        text: 'Prick the vein',
        how: 'Take the syringe, press on the mark and hold. The needle goes in shallow and stops in the vein. Let go, and a drop of blood comes up where it went in.',
        why: 'The account immobilises the hind leg, presses gently above the knee so that the vein fills, punctures the vein with a 20G needle, and collects the blood with a capillary tube or with a syringe and needle.',
        care: 'The vein is close under the skin, and the needle need not go deep. Here the leg does not move; in the animal it is held still.',
        see: 'A drop of dark blood stands where the needle came out.',
        tool: 'syringe', view: 'shank',
        guide: { kind: 'spot', place: SAPHENOUS, radiusMm: 0.9, degrees: 20, along: 'living:lateral-saphenous-veins', mmPerSecond: 1.3, stopsIn: ['living:lateral-saphenous-veins'] },
        show: [{ kind: 'touch', tool: 'syringe', ids: [], place: SAPHENOUS, depthMm: 2 }, wait(1.2)],
        done: (facts) => needles(facts).some((action) => (action.tipIn ?? []).some((id) => /lateral-saphenous-veins$/.test(id))),
        advice: adviceOnNeedle((action) => (action.tipIn ?? []).some((id) => /lateral-saphenous-veins$/.test(id)) ? null : (action.depthMm ?? 0) < 0.4 ? 'The needle has hardly gone in. Hold a little longer.' : 'The tip is outside the vein. Try again at the mark, with Steady hand on.'),
      },
      {
        text: 'Collect the drop and press on the place',
        how: 'Take the swab, and press on the drop of blood.',
        why: 'The blood is collected as it comes up, and a little pressure then stops the bleeding, as the account does for a vein of the foot.',
        tool: 'swab', view: 'shank',
        guide: { kind: 'spot', place: SAPHENOUS, radiusMm: 0.9 },
        show: [{ kind: 'touch', tool: 'swab', ids: [], place: SAPHENOUS }, wait(0.6)],
        done: (facts) => facts.actions.some((action) => action.kind === 'swab'),
      },
    ],
    avoid: [{ text: 'The needle went into the bone', broken: (facts) => needles(facts).some((action) => [...action.structures, ...(action.tipIn ?? [])].some((id) => /bone-(tibia|fibula)/.test(id))) }],
  },
  {
    id: 'draw-heart-blood', name: 'Draw blood from the heart', group: 'Blood sampling', source: PARASURAMAN, also: [GAGE], pose: 'on-back', alive: true,
    about: 'Taking a large sample of blood from the heart, as the last act of a study, under terminal anaesthesia. The published account allows it with or without opening the chest. Here the chest is opened first, after Gage et al., so that the ventricle can be seen. The account gives no position or angle for the needle, and those used here are chosen.',
    steps: [
      LIE_ON_BACK('The sampling'),
      ...CHEST_OPENING,
      FIND('Find the ventricles', 'Point at the heart with the blunt probe. The ventricles are its lower part, and the left ventricle lies on the animal\'s left, which is on your right when its head is up.', 'The account takes the blood from the heart, preferably from a ventricle.', ['heart-lv'], 1, 'heart'),
      {
        text: 'Draw blood slowly from the ventricle',
        how: 'Take the syringe, press at the mark and hold. The needle goes into the ventricle and the syringe fills slowly. Keep holding until it is nearly full, then let go.',
        why: 'The account gives a 19 to 25G needle with a 1 to 5 ml syringe, and says to draw slowly to avoid collapsing the heart. It estimates the blood volume of an adult at 55 to 70 ml per kg, which comes to about 1.5 to 2 ml in a mouse of 28 g, and it recommends this route only at the end of a study.',
        care: 'During the collection the animal is under terminal anaesthesia. It is not woken afterwards.',
        see: 'Dark blood rises in the barrel as the plunger comes back, and the heart goes on beating. How fast it fills is chosen for viewing.',
        tool: 'syringe', view: 'heart',
        guide: { kind: 'spot', place: VENTRICLE, radiusMm: 1, degrees: 55, mmPerSecond: 2, stopsIn: ['living:left-heart-spaces'], draws: true },
        show: [{ kind: 'touch', tool: 'syringe', ids: ['living:heart-lv'], place: VENTRICLE }, wait(0.6)],
        done: (facts) => needles(facts).some((action) => (action.drawnShare ?? 0) >= 0.8),
        advice: adviceOnNeedle((action) => (action.drawnShare ?? 0) >= 0.8 ? null : (action.drawnShare ?? 0) > 0 ? 'The syringe is not yet full. Press at the mark again, and hold for longer.' : 'The needle did not reach the left ventricle. Press at the mark, and hold.'),
      },
    ],
    avoid: [{ text: 'A lung was cut', broken: (facts) => cutAnyOf(facts, ['lung-left', 'lung-r-superior', 'lung-r-middle', 'lung-r-inferior', 'lung-r-postcaval']) }],
  },
  {
    id: 'inject-abdomen', name: 'Inject into the abdomen', group: 'Injection', source: MACHHOLZ, pose: 'on-back', alive: true,
    about: 'An intraperitoneal injection. The published video shows how the animal is restrained, which is not modelled. The needle is drawn at a usual size and is not a recommendation.',
    steps: [
      {
        text: 'Find the lower quadrant',
        how: 'Divide the belly into four, in your mind. The marked place lies in the lower quadrant on the animal\'s right, which is on your left when its head is up.',
        why: 'Machholz and colleagues give the lower quadrants, especially the animal\'s lower right, as the proper sites, and say to inject only there.',
        see: 'A ring marks the place, on the left of the view when the head is up.',
        tool: 'syringe', view: 'close',
        guide: { kind: 'spot', place: ['sacrum', -8, -5], radiusMm: 2.5 },
        show: [{ kind: 'pose', pose: 'on-back' }, wait(1.4)],
        done: (facts) => facts.pose === 'on-back',
      },
      {
        text: 'Go in through the wall',
        how: 'With the syringe, press on the marked place and hold. The needle goes in as long as you hold, so let go as soon as it is through the wall.',
        why: 'The tip should lie free in the cavity. Letting go tells you what it passed through and where the tip lies.',
        care: 'Go no deeper than you need. Here the record says if the tip has entered an organ. Compounds may cause pain if they are not properly buffered.',
        see: 'The needle slides in as you hold, and comes out when you let go. The record lists what it passed through and where its tip lay.',
        tool: 'syringe', view: 'close',
        guide: { kind: 'spot', place: ['sacrum', -8, -5], radiusMm: 2.5 },
        show: [{ kind: 'touch', tool: 'syringe', ids: [], place: ['sacrum', -8, -5], depthMm: 4.4 }, wait(0.8)],
        done: (facts) => needles(facts).some((action) => (action.abdomenShare ?? 0) >= 0.5 && (action.abdomenShare ?? 2) <= 1.05 && Math.abs(action.leftMm ?? 0) >= 1 && throughTheWall(action) && !inOrgan(action)),
        advice: adviceOnNeedle((action) => (action.abdomenShare ?? 0) < 0.5 ? 'That was too high. Go in at the mark, low on the belly.' : Math.abs(action.leftMm ?? 0) < 1 ? 'That was on the middle line. Go in to one side of it, at the mark.' : !throughTheWall(action) ? 'The tip has not passed the wall yet. Hold a little longer.' : null),
      },
    ],
    avoid: [{ text: 'The needle entered an organ', broken: (facts) => needles(facts).some(inOrgan) }, { text: 'The needle went in above the lower quadrants', broken: (facts) => needles(facts).some((action) => (action.abdomenShare ?? 1) < 0.5) }],
  },
  {
    id: 'inject-tail-vein', name: 'Inject into a tail vein', group: 'Injection', source: MACHHOLZ, pose: 'standing', alive: true,
    about: 'An intravenous injection into a lateral vein of the tail. The published video shows the restrainer and the warming, which are not modelled here. The veins themselves are simulated, on the two sides of the tail.',
    steps: [
      {
        text: 'Hold the animal and warm its tail',
        how: 'Choose On its feet, and look at the tail. The published method holds the animal in a Decapicone or a plastic restrainer, and puts its tail under a lamp or on a protected warming device.',
        why: 'Warming widens the veins and makes the injection easier.',
        care: 'Do not overheat the animal.',
        tool: 'syringe', view: 'tail',
        show: [{ kind: 'pose', pose: 'standing' }, wait(1.4)],
        done: (facts) => facts.pose === 'standing',
      },
      {
        text: 'Find a lateral vein',
        how: 'A vein runs along each side of the tail, as a thin blue line under the skin. The method holds the tail by its tip and turns it a quarter turn to bring a vein to the top. Here the view has been turned instead.',
        why: 'The middle artery and vein lie deep under the bones. The lateral veins lie close under the skin.',
        tool: 'probe', view: 'tail',
        guide: { kind: 'find', ids: ['living:tail-lateral-veins'] },
        show: [wait(2.2)],
        done: (facts) => seen(facts, 'tail-lateral-veins'),
      },
      {
        text: 'Go in near the far end of the tail',
        how: 'Take the syringe, press on the mark and hold. The needle lies low against the tail and goes in slowly along the vein, towards the body. Let go when it is in the vein. With Steady hand on, it stops there by itself.',
        why: 'The method starts at the far end of the tail, with the needle at 15 to 20 degrees and its bevel up.',
        care: 'The veins are shallow, so the needle should not go much beyond its bevel. Do not draw back on the syringe first, because that collapses the vein.',
        see: 'With the tip in the vein, the vein blanches along its length while the fluid goes in, with no resistance. With the tip outside it, the fluid would not flow easily, and the skin of the tail would blanch.',
        tool: 'syringe', view: 'tail',
        guide: { kind: 'spot', place: TAIL_VEIN, radiusMm: 0.9, degrees: 17, along: 'living:tail-lateral-veins', mmPerSecond: 1.3, stopsIn: ['living:tail-lateral-veins'] },
        show: [{ kind: 'touch', tool: 'syringe', ids: [], place: TAIL_VEIN, depthMm: 3 }, wait(1.6)],
        done: (facts) => needles(facts).some((action) => (action.tipIn ?? []).some((id) => /tail-lateral-veins$/.test(id))),
        advice: adviceOnNeedle((action) => (action.tipIn ?? []).some((id) => /tail-lateral-veins$/.test(id)) ? null : (action.depthMm ?? 0) < 0.5 ? 'The needle has hardly gone in. Hold a little longer.' : 'The tip is outside the vein. Try again a little nearer the body, along the blue line.'),
      },
      {
        text: 'Press on the place',
        how: 'Take the swab, and press on the place where the needle went in.',
        why: 'Gentle pressure on the place stops it bleeding.',
        tool: 'swab', view: 'tail',
        guide: { kind: 'spot', place: TAIL_VEIN, radiusMm: 0.9 },
        show: [{ kind: 'touch', tool: 'swab', ids: [], place: TAIL_VEIN }, wait(0.6)],
        done: (facts) => facts.actions.some((action) => action.kind === 'swab'),
      },
    ],
    avoid: [{ text: 'The needle went through to the bone', broken: (facts) => needles(facts).some((action) => [...action.structures, ...(action.tipIn ?? [])].some((id) => /tail-vertebrae$/.test(id))) }],
  },
  {
    id: 'inject-under-skin', name: 'Inject under the skin', group: 'Injection', source: MACHHOLZ, pose: 'standing', alive: true,
    about: 'A subcutaneous injection. The published method tents the skin with the fingers, and the left hand does that here with forceps.',
    steps: [
      {
        text: 'Choose the place',
        how: 'Look at the flank from the side. The marked place lies over the flank.',
        why: 'For animals that will be handled afterwards, Machholz and colleagues advise the skin of the back of the rump or the flank, and not the scruff, which is where the animal is held.',
        see: 'A ring marks the place on the flank.',
        tool: 'syringe', view: 'left-close',
        guide: { kind: 'spot', place: FLANK, radiusMm: 2.5 },
        show: [{ kind: 'pose', pose: 'standing' }, wait(1.4)],
        done: (facts) => facts.pose === 'standing',
      },
      {
        text: 'Tent the skin and go in',
        how: 'With the syringe, press on the flank and hold for a moment. The left hand lifts a fold of skin, and the needle goes into the tent at an angle. Let go as soon as it is under the skin.',
        why: 'The published method grasps the skin, pulls it gently up into a tent, and puts the needle in at an angle of 30 to 45 degrees.',
        care: 'If you hold too long the needle goes through into muscle. The record says what it passed through.',
        see: 'The forceps lift a fold of skin, and the needle slips in under it at a slant.',
        tool: 'syringe', view: 'left-close',
        guide: { kind: 'spot', place: FLANK, radiusMm: 2.5, tent: true, degrees: 38 },
        show: [{ kind: 'touch', tool: 'syringe', ids: [], place: FLANK, depthMm: 2.2 }, wait(0.8)],
        done: (facts) => needles(facts).some((action) => action.side !== 'ventral' && action.structures.some((id) => /skin$/.test(id)) && !action.structures.some((id) => /muscle-|bone-|peritoneum/.test(id))),
        advice: adviceOnNeedle((action) => action.side === 'ventral' ? 'That was on the belly. Go in on the flank.' : !action.structures.some((id) => /skin$/.test(id)) ? 'The needle did not reach the skin. Hold a little longer.' : 'That went too deep. Let go sooner.'),
      },
    ],
    avoid: [{ text: 'The needle went through into muscle or deeper', broken: (facts) => needles(facts).some((action) => action.structures.some((id) => /muscle-(obliques|rectus|latissimus|spinotrapezius|gluteus)|peritoneum|bone-/.test(id))) }],
  },
  {
    id: 'inject-thigh', name: 'Inject into the thigh muscle', group: 'Injection', source: MACHHOLZ, pose: 'standing', alive: true,
    about: 'An intramuscular injection. In the model the depth is found from the surfaces of this one animal.',
    steps: [
      {
        text: 'Find the front of the thigh',
        how: 'Look at the thigh from the side. The front of the thigh is the side towards the head.',
        why: 'Machholz and colleagues inject into the quadriceps, at the front of the thigh, or the lateral mass of the thigh.',
        care: 'They say not to inject into the muscle at the back of the thigh, because the sciatic nerve can be damaged there.',
        see: 'A ring marks the place on the side of the thigh.',
        tool: 'syringe', view: 'left-close',
        guide: { kind: 'spot', place: THIGH_FRONT, radiusMm: 1.5 },
        show: [{ kind: 'pose', pose: 'standing' }, wait(1.4)],
        done: (facts) => facts.pose === 'standing',
      },
      {
        text: 'Go into the muscle',
        how: 'With the syringe, press on the mark and hold until the needle is in the muscle, then let go. It goes in slowly here. With Steady hand on, it stops by itself once its tip is in the muscle.',
        why: 'The method puts the needle in perpendicular to the skin.',
        see: 'The needle stands square to the skin, and goes in slowly.',
        tool: 'syringe', view: 'left-close',
        guide: { kind: 'spot', place: THIGH_FRONT, radiusMm: 1.5, degrees: 90, mmPerSecond: 1.5, stopsIn: ['living:muscle-rectus-femoris', 'living:muscle-vasti'] },
        show: [{ kind: 'touch', tool: 'syringe', ids: [], place: THIGH_FRONT, depthMm: 3 }, wait(0.8)],
        done: (facts) => needles(facts).some((action) => (action.tipIn ?? []).some((id) => /muscle-(rectus-femoris|vasti)$/.test(id))),
        advice: adviceOnNeedle((action) => (action.tipIn ?? []).length ? 'The tip is not in the muscle at the front of the thigh. Try again nearer the front.' : 'The tip stopped short of the muscle. Hold a little longer.'),
      },
    ],
    avoid: [{ text: 'The needle entered the back of the thigh, near the sciatic nerve', broken: (facts) => needles(facts).some((action) => (action.tipIn ?? []).some((id) => /muscle-(biceps-femoris|semitendinosus|semimembranosus)$|sciatic-nerves$/.test(id)) || action.structures.some((id) => /sciatic-nerves$/.test(id))) }],
  },
] satisfies readonly LabExercise[]);

export interface ExerciseResult {
  readonly steps: readonly boolean[];
  readonly errors: readonly string[];
  readonly finished: boolean;
}

export function evaluateExercise(exercise: LabExercise, facts: LabFacts): ExerciseResult {
  const steps = exercise.steps.map((step) => step.done(facts));
  const errors = exercise.avoid.filter((rule) => rule.broken(facts)).map((rule) => rule.text);
  return { steps, errors, finished: steps.every(Boolean) };
}

/** What the hands do to show a whole exercise, one step after another. */
export const demonstrationOf = (exercise: LabExercise): readonly DemoStep[] => exercise.steps.flatMap((step) => step.show);

/** The first step not yet done, which a tutorial goes to. */
export const nextStepOf = (result: ExerciseResult) => { const next = result.steps.indexOf(false); return next < 0 ? result.steps.length - 1 : next; };

export { seenAny };
