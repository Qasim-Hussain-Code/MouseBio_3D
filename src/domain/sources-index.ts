import { evidenceMark, evidenceOf } from './evidence';
import { EVIDENCE_LABEL, everyJourneyLevel, type JourneyEvidence, type JourneyLevel } from './scale-journey';
import type { Structure, StructureEvidence } from './types';

/**
 * Everything the application rests on, gathered for the page behind the information button: which structures are measured, traced or simulated, which published works each one follows, and which works lie behind the deep levels of the zoom.
 * It reads the records the views already use, so the page cannot say something different from what a structure says of itself.
 */

/** Where a citation can be followed. Citations are written by hand in the build scripts, so the link is read out of their text. */
export function linkOfCitation(citation: string): string | null {
  const doi = /doi:\s*(10\.\d{4,9}\/[^\s;]+?)(?=[.,]?(?:\s|$))/i.exec(citation);
  if (doi) return `https://doi.org/${doi[1]}`;
  const pmid = /PMID[:\s]*(\d+)/i.exec(citation);
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid[1]}/`;
  const web = /https?:\/\/[^\s;]+?(?=[.,]?(?:\s|$))/.exec(citation);
  return web ? web[0] : null;
}


export interface StructureRow {
  readonly id: string;
  readonly name: string;
  readonly evidence: StructureEvidence;
  /** The evidence in words, with an estimated division where there is one. */
  readonly label: string;
  readonly description: string;
  readonly basis: readonly string[];
}

export interface WorkRow {
  readonly citation: string;
  readonly link: string | null;
  /** The names of the structures that follow it. */
  readonly structures: readonly string[];
  /** The names of the levels of the zoom that follow it. */
  readonly levels: readonly string[];
}

export interface LevelRow {
  readonly id: string;
  readonly name: string;
  readonly evidence: JourneyEvidence;
  readonly label: string;
  readonly caption: string;
  readonly basis: readonly string[];
}

const byName = (a: { readonly name: string }, b: { readonly name: string }) => a.name.localeCompare(b.name);

export function structureRows(structures: readonly Structure[]): readonly StructureRow[] {
  return structures
    .map((structure): StructureRow => ({
      id: structure.id,
      name: structure.name,
      evidence: evidenceOf(structure),
      label: evidenceMark(structure),
      description: structure.description ?? '',
      basis: structure.basis ?? [],
    }))
    .sort(byName);
}

export function evidenceCounts(rows: readonly StructureRow[]): Readonly<Record<StructureEvidence, number>> {
  const counts: Record<StructureEvidence, number> = { source: 0, traced: 0, simulated: 0 };
  for (const row of rows) counts[row.evidence]++;
  return counts;
}

export function levelRows(levels: readonly JourneyLevel[] = everyJourneyLevel()): readonly LevelRow[] {
  return levels.map((level): LevelRow => ({ id: level.id, name: level.name, evidence: level.evidence, label: EVIDENCE_LABEL[level.evidence], caption: level.caption, basis: level.basis }));
}

/** Each work once, the most used first. */
export function workRows(structures: readonly StructureRow[], levels: readonly LevelRow[]): readonly WorkRow[] {
  const works = new Map<string, { structures: string[]; levels: string[] }>();
  const of = (citation: string) => {
    let work = works.get(citation);
    if (!work) { work = { structures: [], levels: [] }; works.set(citation, work); }
    return work;
  };
  for (const row of structures) for (const citation of row.basis) of(citation).structures.push(row.name);
  for (const row of levels) for (const citation of row.basis) of(citation).levels.push(row.name);
  return [...works.entries()]
    .map(([citation, work]): WorkRow => ({ citation, link: linkOfCitation(citation), structures: work.structures, levels: work.levels }))
    .sort((a, b) => b.structures.length + b.levels.length - a.structures.length - a.levels.length || a.citation.localeCompare(b.citation));
}

/** A word without the ending of its plural, so that "artery" finds "arteries". */
const singular = (word: string) => word.replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
const wordsOf = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean).map(singular);

/** What a search for some words finds, in any of the words a row is known by, in any order. */
export function matchesSearch(words: string, ...fields: readonly string[]): boolean {
  const asked = wordsOf(words);
  if (!asked.length) return true;
  const known = fields.flatMap(wordsOf);
  return asked.every((word) => known.some((other) => other.includes(word)));
}

/** What moves or is drawn to show something, and is computed from nothing. Each of these is illustrative wherever it appears. */
export const ILLUSTRATIVE_THINGS: readonly string[] = [
  'The movement of the mouse: breathing, the heartbeat, whisking, the turn of the head, the walk and the reaction to a touch. Heart, breathing and whisking rates follow published values, slowed to the chosen share, and everything else is chosen for viewing. Nothing is computed about blood, gas or nerve signals.',
  'The moving blood, which runs along the centre lines of the model at speeds chosen for viewing.',
  'The unfolding of the layers during a zoom, which opens the model to show what lies at a place and is not a dissection.',
  'The voice of the mouse, which is synthesized here and is not a recording. Its pitch follows two kinds of audible call described by Grimsley et al. 2016 (doi:10.3389/fnbeh.2016.00038). How long a call lasts, how loud it is and how a touch leads to a call are choices for listening, and the ultrasonic calls that make up most of what a mouse says are left out.',
  'At the bench: the hands, the instruments, how skin and wall fold back, the bleeding, the bend and stretch of a drawn out leg, the clipped coat, the drape, the loops of a suture, the filling of a syringe and the colours of a perfusion. They show what a procedure looks like, and they do not model force, tissue mechanics or physiology.',
];
