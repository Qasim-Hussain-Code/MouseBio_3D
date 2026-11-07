import type { DissectionTierId } from './dissection';

/**
 * A place to practise with instruments on the simulated mouse: cutting skin and the layers under it, reflecting them, finding and tying vessels, and taking out organs.
 * It is a teaching aid and it is not a protocol. It models no tissue mechanics, bleeding, anaesthesia, aseptic technique or animal welfare, and the anatomy it is done on is the constructed model, parts of which are simulated.
 * Practice here does not replace supervised training or an approved protocol. How an instrument behaves, and what counts as damage, are choices made for practice.
 */
export const LAB_NOTICE = 'Practice on a simulated animal. The hands, instruments, bleeding and tissue behaviour are illustrative. Not a protocol, and no substitute for supervised training under an approved protocol.';

export type LabToolId = 'hand' | 'scalpel' | 'scissors' | 'forceps' | 'probe' | 'bone-cutter' | 'ligature' | 'suture' | 'pin' | 'swab' | 'syringe';

export interface LabTool {
  readonly id: LabToolId;
  readonly name: string;
  /** One short line, shown when pointing at the instrument. */
  readonly hint: string;
  /** Half the width of what it cuts, in metres. Zero if it does not cut. */
  readonly radius: number;
  readonly key: string;
}

export const LAB_TOOLS: readonly LabTool[] = Object.freeze([
  { id: 'hand', name: 'Hand', hint: 'Turn the view. The right button does this with any instrument.', radius: 0, key: 'H' },
  { id: 'scalpel', name: 'Scalpel', hint: 'A fine cut through the layer it touches.', radius: 0.00024, key: 'S' },
  { id: 'scissors', name: 'Scissors', hint: 'A wider cut through the layer it touches.', radius: 0.00045, key: 'C' },
  { id: 'forceps', name: 'Forceps', hint: 'From the edge of a cut, draw the layer back. On an organ, vessel or nerve, take hold and move it.', radius: 0.0016, key: 'F' },
  { id: 'probe', name: 'Blunt probe', hint: 'Name what it touches. Drag through fat or a lining to part it without cutting.', radius: 0.001, key: 'P' },
  { id: 'bone-cutter', name: 'Bone cutters', hint: 'Cut through bone.', radius: 0.0008, key: 'B' },
  { id: 'ligature', name: 'Ligature', hint: 'Tie a vessel where it is touched. A tied vessel stops bleeding.', radius: 0, key: 'L' },
  { id: 'suture', name: 'Needle and suture', hint: 'Drag along a cut in the skin to close it.', radius: 0.0022, key: 'N' },
  { id: 'pin', name: 'Pin', hint: 'Place a pin where it is touched.', radius: 0, key: 'I' },
  { id: 'swab', name: 'Swab', hint: 'Clean away blood where it is touched.', radius: 0.003, key: 'W' },
  { id: 'syringe', name: 'Syringe', hint: 'Hold to push the needle in, and let go. The record says what it passed through and where its tip lies.', radius: 0, key: 'Y' },
]);

export const labTool = (id: LabToolId): LabTool => LAB_TOOLS.find((tool) => tool.id === id) ?? LAB_TOOLS[0];

/** Which channel of the grid of cuts holds each layer. */
const CHANNEL: Readonly<Record<DissectionTierId, number>> = Object.freeze({ skin: 0, fat: 1, panniculus: 1, 'outer-muscle': 2, 'inner-muscle': 3, lining: 4, skeleton: 5, organs: 6, 'vessels-nerves': 7 });
export const channelOfTier = (tier: DissectionTierId) => CHANNEL[tier];

/**
 * What a stroke of an instrument goes through, from the layer it touches, and how far under the surface. A scalpel divides the one layer it touches. Scissors and forceps take a layer together with what is bound to it: the skin with the tissue under it, and the wall of the body as a whole.
 * Bone cutters go through the ribs and what lies between them. These are choices made for practice, not measurements.
 */
export function cutReach(tool: LabToolId, tier: DissectionTierId): { readonly channels: readonly number[]; readonly depth: number } {
  const own = CHANNEL[tier];
  if (tool === 'bone-cutter') return { channels: [CHANNEL.skeleton, CHANNEL['outer-muscle'], CHANNEL['inner-muscle'], CHANNEL.lining], depth: 0.0045 };
  // A blunt probe opens up the loose fat in which vessels lie.
  if (tool === 'probe' && (tier === 'fat' || tier === 'panniculus')) return { channels: [own], depth: 0.0045 };
  if (tool !== 'scissors' && tool !== 'forceps') return { channels: [own], depth: 0 };
  if (tier === 'skin') return { channels: [CHANNEL.skin, CHANNEL.fat], depth: 0.0012 };
  if (tier === 'outer-muscle') return { channels: [CHANNEL['outer-muscle'], CHANNEL['inner-muscle'], CHANNEL.lining], depth: 0.0032 };
  if (tier === 'inner-muscle') return { channels: [CHANNEL['inner-muscle'], CHANNEL.lining], depth: 0.0022 };
  return { channels: [own], depth: 0 };
}

export const BONE_ONLY = 'These are for bone. Use the scissors or scalpel on soft tissue.';
/** Whether an instrument can work on a layer, and what to say if it cannot. Bone cutters also go through muscle that lies on a bone, as they do on the rib cage: the session finds out if there is bone under it. */
export function cutRefusal(tool: LabToolId, tier: DissectionTierId): string | null {
  if (tool === 'scalpel' || tool === 'scissors') return tier === 'skeleton' ? 'That is bone. Use the bone cutters.' : null;
  if (tool === 'bone-cutter') return tier === 'skeleton' || tier === 'outer-muscle' || tier === 'inner-muscle' || tier === 'lining' ? null : BONE_ONLY;
  return null;
}

/** Forceps take hold of what lies free, and draw back what lies in a sheet. */
export const canBeGrasped = (tier: DissectionTierId) => tier === 'organs' || tier === 'vessels-nerves';
export const canBeReflected = (tier: DissectionTierId) => tier === 'skin' || tier === 'fat' || tier === 'panniculus' || tier === 'outer-muscle' || tier === 'inner-muscle' || tier === 'lining';
/** A probe parts what is loose. */
export const canBeParted = (tier: DissectionTierId) => tier === 'fat' || tier === 'panniculus' || tier === 'lining';

export type LabActionKind = 'cut' | 'reflect' | 'part' | 'bone' | 'remove' | 'move' | 'ligate' | 'suture' | 'pin' | 'swab' | 'inject' | 'perfuse' | 'cleared';
export type LabSide = 'ventral' | 'dorsal' | 'side';

export interface LabAction {
  readonly kind: LabActionKind;
  readonly tool: LabToolId;
  /** Seconds since the session began. */
  readonly at: number;
  /** The structures it touched, by identifier. */
  readonly structures: readonly string[];
  readonly tier?: DissectionTierId;
  /** Length along the path, in millimetres. */
  readonly lengthMm?: number;
  /** The furthest it strayed from the midline of the body, in millimetres. */
  readonly asideMm?: number;
  /** On which part of the body it lay. */
  readonly side?: LabSide;
  /** From the head, along the body, in millimetres from the base of the skull. */
  readonly fromMm?: number;
  readonly toMm?: number;
  /** A vessel was opened and bled. */
  readonly bled?: boolean;
  /** For a needle: where its tip came to lie, by identifier, and how deep it went. */
  readonly tipIn?: readonly string[];
  readonly depthMm?: number;
  /** For a needle: millimetres towards the animal's left of the midline, and how far along the abdomen it went in, from 0 at the diaphragm to 1 at the sacrum. */
  readonly leftMm?: number;
  readonly abdomenShare?: number;
  /** For a layer drawn back: which kind of flap it was, on which side of the cut, and how far it was drawn. */
  readonly flap?: { readonly kind: 'skin' | 'wall' | 'chest' | 'skull'; readonly side: 1 | -1; readonly open: number };
}

/** What the session knows, for the exercises and the record. */
export interface LabFacts {
  readonly actions: readonly LabAction[];
  /** Every structure that has been seen with enough of it in view, at any time. */
  readonly seen: ReadonlySet<string>;
  readonly removed: ReadonlySet<string>;
  readonly ligated: ReadonlySet<string>;
  /** How the animal lies now. */
  readonly pose?: LabPose;
}

const living = (id: string) => 'living:' + id;
export const cutThrough = (facts: LabFacts, id: string) => facts.actions.some((action) => (action.kind === 'cut' || action.kind === 'bone') && action.structures.includes(living(id)));
export const cutAnyOf = (facts: LabFacts, ids: readonly string[]) => ids.some((id) => cutThrough(facts, id));

export const ORGANS_TO_SPARE: readonly string[] = Object.freeze(['small-intestine', 'caecum', 'colon', 'stomach-cardiac', 'stomach-pyloric', 'liver-median', 'liver-left', 'liver-right', 'liver-caudate', 'kidney-right', 'kidney-left', 'bladder']);

/** The cuts in these layers of the belly that keep near the midline. */
export const midlineCuts = (facts: LabFacts, tiers: readonly DissectionTierId[], most = 3.5) => facts.actions.filter((action) => action.kind === 'cut' && !!action.tier && tiers.includes(action.tier) && action.side === 'ventral' && (action.asideMm ?? Infinity) <= most);
/** A long cut in a layer of the belly, near the midline. It may be made in several snips, as with scissors, and their lengths add up. */
export const midlineCut = (facts: LabFacts, tiers: readonly DissectionTierId[], least: number, most = 3.5) => midlineCuts(facts, tiers, most).reduce((sum, action) => sum + (action.lengthMm ?? 0), 0) >= least;
export const anyCut = (facts: LabFacts, tiers: readonly DissectionTierId[]) => facts.actions.some((action) => (action.kind === 'cut' || action.kind === 'bone') && !!action.tier && tiers.includes(action.tier));
export const seen = (facts: LabFacts, id: string) => facts.seen.has(living(id));
/** How many flaps of this kind have been drawn well back. */
export const drawnBack = (facts: LabFacts, kind: 'skin' | 'wall' | 'chest' | 'skull', least: number) => new Set(facts.actions.filter((action) => action.kind === 'reflect' && action.flap?.kind === kind && action.flap.open > 0.4).map((action) => action.flap!.side)).size >= least;

/** A sentence on how a session went, from what was done. */
export function sessionSummary(facts: LabFacts): string {
  const worked = facts.actions.filter((action) => action.kind !== 'swab');
  if (!worked.length) return '';
  const seconds = Math.max(...worked.map((action) => action.at)) - Math.min(...worked.map((action) => action.at));
  const cuts = worked.filter((action) => action.kind === 'cut' || action.kind === 'bone');
  const time = seconds >= 60 ? `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s` : `${Math.round(seconds)} s`;
  const parts = [`${worked.length} ${worked.length === 1 ? 'action' : 'actions'} in ${time}`];
  if (cuts.length) parts.push(`${cuts.reduce((sum, action) => sum + (action.lengthMm ?? 0), 0).toFixed(0)} mm cut`);
  return parts.join(', ') + '.';
}

export interface LabSource { readonly citation: string; readonly doi: string }
export type LabPose = 'standing' | 'on-back';

/** What a needle has gone through and where its tip lies, as the steps of an injection ask. */
export const needles = (facts: LabFacts) => facts.actions.filter((action) => action.kind === 'inject');
export const inOrgan = (action: LabAction) => (action.tipIn ?? []).some((id) => /small-intestine|caecum|colon|stomach|liver|spleen|kidney|bladder|uterus|ovar|testis|pancreas/.test(id));

const ACTION_WORDS: Readonly<Record<LabActionKind, string>> = Object.freeze({ cut: 'Cut', reflect: 'Drew back', part: 'Parted', bone: 'Cut through bone', remove: 'Lifted out', move: 'Moved aside', ligate: 'Tied', suture: 'Closed', pin: 'Pinned', swab: 'Cleaned', inject: 'Needle through', perfuse: 'Started the flow through', cleared: 'The blood has cleared from' });

/** One line of the record, in words. */
export function describeAction(action: LabAction, nameOf: (id: string) => string): string {
  if (action.kind === 'inject') {
    const tip = (action.tipIn ?? []).filter((id) => !/skin$/.test(id));
    return `Needle ${(action.depthMm ?? 0).toFixed(1)} mm deep: tip in ${tip.length ? tip.map(nameOf).join(' and ') : 'no structure'}`;
  }
  const names = action.structures.slice(0, 3).map(nameOf).join(', ') + (action.structures.length > 3 ? ` and ${action.structures.length - 3} more` : '');
  const length = action.lengthMm && action.lengthMm >= 0.5 ? `, ${action.lengthMm.toFixed(action.lengthMm < 10 ? 1 : 0)} mm` : '';
  return `${ACTION_WORDS[action.kind]} ${names}${length}${action.bled ? ', and it bled' : ''}`;
}

/** The record of a session, for keeping. It holds only what was done on the model. */
export function labRecord(facts: LabFacts, modelId: string, exercise: { readonly id: string; readonly name: string; readonly source: LabSource; readonly result: { readonly steps: readonly boolean[]; readonly errors: readonly string[]; readonly finished: boolean } } | null, finishedAt: string) {
  return {
    schemaVersion: 'mousebio.practice-record.v1', model: modelId, classification: 'practice on a simulated model; not a procedure on an animal', notice: LAB_NOTICE,
    recordedAt: finishedAt, exercise: exercise ? { id: exercise.id, name: exercise.name, source: exercise.source, ...exercise.result } : null,
    actions: facts.actions, removed: [...facts.removed], tied: [...facts.ligated], seen: [...facts.seen],
  };
}
